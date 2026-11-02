// Renders the existing mini-games mock (docs/design/mini-games-hub/mock.html) screen by screen, phone and desktop,
// cropped to the device frame. Usage: node capture929.mjs <repoRoot> <mockFile> <outDir>
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [root, mock, outDir] = process.argv.slice(2);
const { chromium } = await import(path.join(root, "node_modules/playwright/index.mjs"));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});
const shots = [
  ["a-lobby-closed", "A", undefined],
  ["b-shelf", "B", "idle"],
  ["b-shelf-alone", "B", "alone"],
  ["b-shelf-invited", "B", "invited"],
  ["c-solo-stacker", "C", undefined],
  ["d-tictactoe", "D", undefined],
  ["e-start-closes", "E", undefined],
];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(mock).href);
  // The mock's own callouts are notes for reviewers; the pictures show the screen alone.
  // Mock bug fix (both sets): the host's Start button is `btn lg sea`, and `.sea` is also the full-screen ocean
  // (position: absolute; inset: 0), so on host screens the button filled the whole card.
  await page.addStyleTag({ content: ".callout { display: none !important; } .btn.sea { position: relative !important; inset: auto !important; }" });
  // Optional: a CSS layer to apply on top (the accepted lobby type and target scale).
  if (process.env.LAYER) await page.addStyleTag({ path: process.env.LAYER });
  for (const vp of ["phone", "desk"]) {
    await page.evaluate((v) => window.setVp(v), vp);
    for (const [name, screen, state] of shots) {
      await page.evaluate(([s, st]) => (st === undefined ? window.go(s) : window.go(s, st)), [screen, state]);
      await page.waitForTimeout(250);
      const file = path.join(outDir, `${vp === "phone" ? "phone-390x844" : "desktop-1280x720"}-${name}.png`);
      await page.locator("#frame").screenshot({ path: file });
      console.log("saved", path.basename(file));
    }
  }
} finally {
  await browser.close();
}
