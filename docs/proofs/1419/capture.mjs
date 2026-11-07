// #1419 pictures: How to play and Costs in the real game, opened from the Table menu on a hotseat table, at 430x932,
// 390x844, 375x812, 820x1180, 844x390 and 320x400 (short, so the Costs body scrolls). Not a CI proof.
// Run from the repo root, one browser at a time: node docs/proofs/1419/capture.mjs before|after
// "before" is run on main, "after" on the PR head. It writes <size>-<sheet>-<label>.jpg next to this file.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const label = process.argv[2];
if (!["before", "after"].includes(label)) throw new Error("usage: capture.mjs before|after");
const out = path.dirname(fileURLToPath(import.meta.url));
const sizes = [[430, 932], [390, 844], [375, 812], [820, 1180], [844, 390], [320, 400]];
const SHEETS = [["howto", "How to play"], ["costs", "Costs"]];

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
try {
  for (const [width, height] of sizes) {
    const tag = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.waitForFunction(() => window.__emberisle.getState().state);
    await page.waitForTimeout(1500);
    for (const [name, row] of SHEETS) {
      await page.getByRole("button", { name: "Table menu", exact: true }).click();
      await page.getByRole("button", { name: row, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: row });
      await dialog.waitFor();
      if (name === "howto") await dialog.locator("figure").nth(2).waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `${tag}-${name}-${label}.jpg`), type: "jpeg", quality: 80 });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
    }
    await context.close();
    console.log(`${tag}: How to play and Costs captured (${label})`);
  }
} finally {
  await browser.close();
  await vite.close();
}
if (errors.length) throw new Error(errors.join("\n"));
