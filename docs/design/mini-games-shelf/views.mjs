// Shared setup for capture.mjs and measure.mjs: opens the mini-games mock at 1:1 scale with the mock-bug fix,
// the optional CSS layer, and the four sizes drawn.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// [file prefix, mock layout, width, height]. The mock only has a phone and a desktop layout; the two extra sizes reuse
// them (320 x 568 uses the phone layout; sideways 844 x 390 uses the side-card layout the real lobby uses there).
// The fifth field says whether pictures are drawn: sideways is measured only, because no game fits its 342 px card
// (see the README).
export const VIEWS = [
  ["phone-390x844", "phone", 390, 844, true],
  ["desktop-1280x720", "desk", 1280, 720, true],
  ["phone-320x568", "phone", 320, 568, true],
  ["sideways-844x390", "desk", 844, 390, false],
];

export const SHOTS = [
  ["a-lobby-closed", "A", undefined],
  ["b-shelf", "B", "idle"],
  ["b-shelf-alone", "B", "alone"],
  ["b-shelf-invited", "B", "invited"],
  ["c-solo-stacker", "C", undefined],
  ["d-tictactoe", "D", undefined],
  ["e-start-closes", "E", undefined],
];

export async function openMock(root, mock) {
  const { chromium } = await import(path.join(root, "node_modules/playwright/index.mjs"));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  });
  const page = await browser.newPage({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(mock).href);
  // The mock's callouts are notes for reviewers; the pictures show the screen alone. Mock bug fix (both sets): the
  // host's Start button is `btn lg sea`, and `.sea` is also the full-screen ocean (position: absolute; inset: 0), so
  // on host screens the button filled the whole card.
  await page.addStyleTag({ content: ".callout { display: none !important; } .btn.sea { position: relative !important; inset: auto !important; }" });
  // Only the device frame: the mock's review chrome (notes column, nav) is hidden so it cannot cover the frame.
  await page.addStyleTag({ content: ".notes, #nav { display: none !important; } .layout { display: block !important; } .stage { width: auto !important; overflow: visible !important; }" });
  if (process.env.LAYER) await page.addStyleTag({ path: process.env.LAYER });
  // Draw at 1:1 (the mock otherwise scales the frame down to fit its review page).
  await page.evaluate(() => {
    window.fit = () => {
      const [w, h] = VP[S.vp];
      document.getElementById("frame").style.transform = "none";
      document.getElementById("stage").style.height = h + "px";
    };
  });
  return { browser, page };
}

export async function show(page, layout, w, h, screen, state) {
  await page.evaluate(([layout, w, h]) => { VP[layout] = [w, h]; window.setVp(layout); }, [layout, w, h]);
  await page.evaluate(([s, st]) => (st === undefined ? window.go(s) : window.go(s, st)), [screen, state]);
  await page.waitForTimeout(250);
}
