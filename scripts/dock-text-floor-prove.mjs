// #1512: the dock's text obeys the 12 px floor (docs/design/polish.md). In hotseat `main` at 1280x720, 440x956 and 956x440,
// with a hand that is short of an Upgrade and a Fortune (so a shortfall cue could show), every visible text node in the dock
// tray (`.hud-tray`) and in the open Build list is at least 12 px, and no shortfall number badge hangs off a build chip.
// The 10 px hand names are the one agreed exception and are not in the tray. Zero console errors.
// Saves test-results/dock-text-floor-<size>.png. Run: npm run dock-text-floor-prove
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8431;
const STEP_MS = 15_000;
const FLOOR = 12;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "440x956", width: 440, height: 956, touch: true },
  { tag: "956x440", width: 956, height: 440, touch: true },
];

// Every element in the root that owns visible text, with its computed font size.
const smallText = (root, floor) => {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    const el = n.parentElement;
    if (!t || !el) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === "none" || cs.visibility === "hidden" || r.width === 0 || r.height === 0) continue;
    if (el.closest(".sr-only,[aria-hidden='true'] svg")) continue;
    const px = parseFloat(cs.fontSize);
    if (px < floor) out.push(`${JSON.stringify(t.slice(0, 24))} ${px}px`);
  }
  return out;
};

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let code = 0;
try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.waitForFunction(() => window.__emberisle.getState().state);
    // Main phase, a hand of one brick: short of Upgrade and Fortune, with a Fortune in hand so its button shows.
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      const me = st.players.find((p) => p.id === st.current);
      st.phase = "main";
      st.playedCard = false;
      st.dice = [3, 4];
      me.resources = { timber: 0, clay: 1, wool: 0, grain: 0, ore: 0 };
      me.hidden = { knight: 1, road: 0, plenty: 0, monopoly: 0, vp: 0 };
      me.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
      st.seq += 1;
      g.setState({ state: st, buildMode: "none", roadPicks: [], pendingSteal: null, pendingPlace: null, error: null });
    });
    await page.getByTestId("build-open").waitFor({ timeout: STEP_MS });
    const run = (sel) => page.evaluate(({ src, sel, floor }) => new Function(`return (${src})`)()(document.querySelector(sel), floor), { src: smallText.toString(), sel, floor: FLOOR });
    const inTray = await run(".hud-tray");
    assert.deepEqual(inTray, [], `${v.tag}: dock tray text under ${FLOOR} px: ${inTray.join(", ")}`);
    await page.getByTestId("build-open").click({ timeout: STEP_MS });
    await page.getByTestId("build-list").waitFor({ timeout: STEP_MS });
    const inList = await run("[data-testid='build-list']");
    assert.deepEqual(inList, [], `${v.tag}: Build list text under ${FLOOR} px: ${inList.join(", ")}`);
    const badges = await page.locator("[data-testid='build-list'] [data-short], .hud-tray [data-short]").count();
    assert.equal(badges, 0, `${v.tag}: no shortfall number badge on a build chip`);
    await page.screenshot({ path: `test-results/dock-text-floor-${v.tag}.png` });
    console.log(`${v.tag}: dock tray and Build list have no text under ${FLOOR} px, no shortfall badge`);
    await ctx.close();
  }
  assert.deepEqual(errors, [], `console errors: ${errors.join(" | ")}`);
  console.log("dock-text-floor-prove: PASS");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
