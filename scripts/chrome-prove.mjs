// #1274: rendered white chrome, mist ground, readable ink and accessible controls at four sizes.
// This complements contrast/layout proofs; it does not replace their terrain, motion or geometry coverage.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const white = [255, 255, 255];
const mist = [243, 246, 245];
const luminance = rgb => rgb.slice(0, 3).map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
async function paint(locator) {
  return locator.evaluate(el => {
    const px = css => {
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    const style = getComputedStyle(el);
    return { fg: px(style.color), bg: px(style.backgroundColor) };
  });
}
async function surface(locator, label) {
  const p = await paint(locator);
  assert.deepEqual(p.bg, [...white, 255], `${label}: opaque white surface`);
  assert.ok(contrast(p.fg, white) >= 4.5, `${label}: text contrast >= 4.5:1`);
}
async function inside(locator, label) {
  const bounds = await locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { fits: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
  });
  assert.ok(bounds.fits, `${label}: stays inside viewport`);
}
try {
  for (const [width, height] of [[1280, 720], [390, 844], [844, 390], [320, 568]]) {
    const tag = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000, deviceScaleFactor: 1, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(`${tag}: ${error}`));
      page.on("console", message => { if (message.type() === "error") errors.push(`${tag}: ${message.text()}`); });
      await page.addInitScript(() => localStorage.setItem("emberisle-jelly", "lite"));
      await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`);
      const card = page.getByTestId("title-card");
      await card.waitFor();
      // Desktop white paper is the card's inner panel; phones paint the containing sheet.
      await surface(width >= 1000 ? card.locator(":scope > div").first() : card, `${tag} title`);
      await inside(card, `${tag} title`);
      const tokens = await page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        const resolve = name => {
          const probe = document.createElement("span");
          probe.style.color = `var(${name})`;
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        return Object.fromEntries(["--ground", "--color-bg", "--table-raised", "--color-timber", "--color-clay", "--color-wool", "--color-grain", "--color-ore"].map(name => [name, resolve(name)]));
      });
      for (const name of ["--ground", "--color-bg", "--table-raised"]) assert.equal(tokens[name], `rgb(${mist.join(", ")})`, `${tag}: ${name} is mist`);
      for (const [name, rgb] of Object.entries({ timber: [47, 106, 79], clay: [184, 83, 61], wool: [178, 206, 128], grain: [227, 196, 98], ore: [99, 116, 138] })) assert.equal(tokens[`--color-${name}`], `rgb(${rgb.join(", ")})`, `${tag}: ${name} keeps its terrain identity`);
      const caption = page.getByText("3 bots, no network", { exact: true });
      assert.ok(contrast((await paint(caption)).fg, white) >= 4.5, `${tag}: small muted title text remains readable`);
      for (const name of ["Play", "Host a table", "Join", "How to play"]) {
        const control = page.getByRole("button", { name, exact: true });
        await control.scrollIntoViewIfNeeded();
        await control.click({ trial: true });
      }
      await page.getByRole("button", { name: "How to play", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "How to play" });
      await surface(dialog.locator(":scope > div").first(), `${tag} rules sheet`);
      await inside(dialog.locator(":scope > div").first(), `${tag} rules sheet`);
      const rules = dialog.getByRole("region", { name: "Rules and setup" });
      assert.ok(contrast((await paint(rules)).fg, white) >= 4.5, `${tag}: rules text contrast`);
      await page.screenshot({ path: `test-results/chrome-${tag}-rules.png` });
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
      await page.getByRole("button", { name: "Table menu", exact: true }).click();
      const menu = page.getByTestId("table-menu");
      await surface(menu, `${tag} table menu`);
      await inside(menu, `${tag} table menu`);
      await menu.getByRole("button", { name: "How to play", exact: true }).click();
      await dialog.waitFor();
      await surface(dialog.locator(":scope > div").first(), `${tag} in-game sheet`);
      await page.screenshot({ path: `test-results/chrome-${tag}-table.png` });
      console.log(`${tag}: white title/menu/sheets; mist ground; preserved goods; readable text; controls reachable, chrome contained`);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, [], "no browser errors");
  console.log("chrome-prove: PASS");
} finally {
  await browser.close();
  await vite.close();
}
