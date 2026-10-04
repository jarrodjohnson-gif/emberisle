// The title's How to play is a dialog over the whole screen, not a box inside the title card: on a phone (portrait and
// landscape) and at 1280x720 its backdrop covers the viewport, its Close button is on screen and takes the tap, and
// Close actually closes it. Zero console errors.
// #425: a press plays click_001.wav and Close / Escape play back_001.wav, once each; with the sound toggle off nothing plays.
// #442: on the table the entry point is the How to play row of the table menu, at the same three sizes.
// Run: npm run howto-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8104;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  const cases = [
    { name: "phone portrait 390x844", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "phone landscape 844x390", opts: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "desktop 1280x720", opts: { viewport: { width: 1280, height: 720 } } },
  ];
  for (const c of cases) {
    const ctx = await browser.newContext(c.opts);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${c.name}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${c.name}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    const open = page.getByRole("button", { name: "How to play" });
    await open.scrollIntoViewIfNeeded();
    await open.click();
    const dialog = page.getByRole("dialog", { name: "How to play" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    // #442: the table's entry point is a row of the table menu; the menu is gone once the dialog is up.
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.getByRole("button", { name: "Table menu" }).click();
    await page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    assert.equal(await page.getByTestId("table-menu").count(), 0, `${c.name}: the table menu closes behind the dialog`);
    const got = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-labelledby="howto-title"]');
      const close = dialog.querySelector('button[aria-label="Close"]');
      const d = dialog.getBoundingClientRect();
      const r = close.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        backdrop: { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height) },
        close: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
        closeTakesTheTap: close === hit || close.contains(hit),
        vw: innerWidth,
        vh: innerHeight,
      };
    });
    assert.deepEqual(got.backdrop, { x: 0, y: 0, w: got.vw, h: got.vh }, `${c.name}: the backdrop covers the viewport`);
    assert.ok(got.close.top >= 0 && got.close.bottom <= got.vh && got.close.left >= 0 && got.close.right <= got.vw, `${c.name}: Close is on screen ${JSON.stringify(got.close)}`);
    assert.ok(got.closeTakesTheTap, `${c.name}: Close takes the tap at its centre`);
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => !window.__emberisle.getState().howTo);
    assert.equal(await dialog.count(), 0, `${c.name}: Close closes the dialog`);
    assert.ok(await page.getByRole("button", { name: "Table menu" }).evaluate((el) => document.activeElement === el), `${c.name}: Close hands the focus back to the table menu button`);
    console.log(`${c.name}: title and table menu entry points; backdrop ${got.backdrop.w}x${got.backdrop.h}, Close at ${got.close.top}-${got.close.bottom} px on screen and tappable, closes`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`sound: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`sound: ${e}`));
    await page.addInitScript(() => {
      window.__plays = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        window.__plays.push(new URL(this.src).pathname);
        return play.call(this);
      };
    });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    const plays = () => page.evaluate(() => window.__plays.map((p) => p.split("/").pop()));
    const dialog = page.getByRole("dialog", { name: "How to play" });
    await page.getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(await plays(), ["click_001.wav", "back_001.wav", "click_001.wav", "back_001.wav"], "open, Close, open, Escape");
    // Enter on a focused button clicks too (no pointer).
    await page.getByRole("button", { name: "How to play" }).focus();
    await page.keyboard.press("Enter");
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual((await plays()).slice(4), ["click_001.wav", "back_001.wav"], "Enter on How to play, Escape");
    // Muting is silent.
    await page.getByRole("button", { name: "Table sounds on" }).click();
    assert.equal((await plays()).length, 6, "muting is silent");
    const before = (await plays()).length;
    await page.getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal((await plays()).length, before, "muted: nothing plays");
    // Unmuting clicks.
    await page.getByRole("button", { name: "Table sounds off" }).click();
    assert.deepEqual((await plays()).slice(before), ["click_001.wav"], "unmuting clicks once");
    console.log("sounds: open click_001, Close back_001, Escape back_001, Enter click_001, once each; muting and muted play nothing; unmuting clicks");
    await ctx.close();
  }
  assert.deepEqual(errors, [], "console errors");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
