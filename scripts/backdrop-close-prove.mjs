// #1449 (function item 3): a tap on the backdrop closes How to play, Costs and Profile, as it closes Trade. At 390x844 and
// 844x390 (touch taps) and 1280x720 (mouse clicks):
// - from the title, How to play and Profile close on a backdrop tap and the focus goes back to the button that opened them;
// - on a hotseat table, How to play and Costs (from the Table menu) close on a backdrop tap, the focus goes back to the Table
//   menu button, and the tap reaches nothing behind the sheet (state.seq unchanged, nothing pending);
// - at 1280x720 a drag that starts inside a sheet and ends on its backdrop (selecting text) leaves it open.
// Zero console errors (but the Profile sheet's refused dial to the absent default host). Run: npm run backdrop-close-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8449;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const SIZES = [
  { tag: "390x844", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  { tag: "844x390", opts: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
  { tag: "1280x720", opts: { viewport: { width: 1280, height: 720 } } },
];
const BACKDROP = {
  "How to play": '[aria-labelledby="howto-title"]',
  Costs: 'div:has(> [data-testid="cost-card"])',
  Profile: 'div:has(> [data-testid="profile-sheet"])',
};
const errors = [];
let code = 0;

// A point on the backdrop itself, outside the sheet: the first corner of the backdrop (6 px in) that hits it.
const backdropPoint = (page, name) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    for (const [x, y] of [[r.left + 6, r.top + 6], [r.right - 6, r.top + 6], [r.left + 6, r.bottom - 6], [r.right - 6, r.bottom - 6]]) {
      if (document.elementFromPoint(x, y) === el) return { x, y };
    }
    return null;
  }, BACKDROP[name]);

try {
  for (const v of SIZES) {
    const ctx = await browser.newContext(v.opts);
    const page = await ctx.newPage();
    // No host runs here, so the Profile sheet's own check of the default host is refused; drop only that socket's error.
    const absentHost = (t) => t.startsWith("WebSocket connection to 'ws://127.0.0.1:8787/' failed");
    page.on("console", (m) => m.type() === "error" && !absentHost(m.text()) && errors.push(`${v.tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    const tap = (p) => (v.opts.hasTouch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
    const press = (button) => (v.opts.hasTouch ? button.tap() : button.click());
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent.trim());
    const closesOnBackdrop = async (name, opener) => {
      const dialog = page.getByRole("dialog", { name });
      await dialog.waitFor();
      const p = await backdropPoint(page, name);
      assert.ok(p, `${v.tag}: ${name} has backdrop showing beside the sheet`);
      await tap(p);
      await dialog.waitFor({ state: "detached", timeout: 5000 });
      assert.equal(await focused(), opener, `${v.tag}: closing ${name} on the backdrop hands the focus back to ${opener}`);
      return p;
    };

    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);

    // Title: How to play.
    const howTo = page.getByRole("button", { name: "How to play" });
    await howTo.scrollIntoViewIfNeeded();
    await press(howTo);
    const ph = await closesOnBackdrop("How to play", "How to play");

    // Title: Profile, inside the closed "Your seat" settings.
    if (!(await page.evaluate(() => document.querySelector("details.seat-settings").open))) await press(page.locator("details.seat-settings > summary"));
    const profile = page.getByRole("button", { name: "Profile", exact: true });
    await profile.scrollIntoViewIfNeeded();
    await press(profile);
    const pp = await closesOnBackdrop("Profile", "Profile");

    // A drag from inside the sheet out to the backdrop is a text selection, not a tap: the sheet stays.
    if (!v.opts.hasTouch) {
      await howTo.scrollIntoViewIfNeeded();
      await howTo.click();
      const dialog = page.getByRole("dialog", { name: "How to play" });
      await dialog.waitFor();
      const inside = await dialog.getByRole("region", { name: "Rules and setup" }).boundingBox();
      const out = await backdropPoint(page, "How to play");
      await page.mouse.move(inside.x + inside.width / 2, inside.y + 20);
      await page.mouse.down();
      await page.mouse.move(out.x, out.y, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      assert.equal(await dialog.count(), 1, `${v.tag}: a drag from inside How to play to the backdrop closed it`);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      console.log(`${v.tag}: a drag from the rules out to the backdrop leaves How to play open`);
    }

    // Table: How to play and Costs from the Table menu.
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    const trigger = page.getByRole("button", { name: "Table menu" });
    await trigger.waitFor();
    const before = await page.evaluate(() => window.__emberisle.getState().state.seq);
    const taps = [];
    for (const row of ["How to play", "Costs"]) {
      await press(trigger);
      await press(page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: row }));
      taps.push(await closesOnBackdrop(row, "Table menu"));
    }
    const after = await page.evaluate(() => { const s = window.__emberisle.getState(); return { seq: s.state.seq, pending: s.pendingPlace, screen: s.screen }; });
    assert.deepEqual(after, { seq: before, pending: null, screen: "play" }, `${v.tag}: the backdrop taps reached nothing behind the sheets`);
    const at = (p) => `${Math.round(p.x)},${Math.round(p.y)}`;
    console.log(`${v.tag}: backdrop ${v.opts.hasTouch ? "tap" : "click"} closes title How to play (${at(ph)}) and Profile (${at(pp)}), table How to play (${at(taps[0])}) and Costs (${at(taps[1])}); focus back on the opener; state.seq ${before} unchanged`);
    await ctx.close();
  }
  assert.deepEqual(errors, [], "console errors");
  console.log("backdrop-close-prove: ok");
} catch (e) {
  console.error(e);
  if (errors.length) console.error(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  process.exit(code);
}
