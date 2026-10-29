import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8114;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ||
    (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
  const fast = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await fast.newPage();
  await page.addInitScript(() => {
    window.__buzzes = [];
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: ms => { window.__buzzes.push(ms); return true; } });
  });
  await page.route("**/haptics.tsx*", async route => {
    await new Promise(resolve => setTimeout(resolve, 80));
    const response = await route.fetch();
    const headers = response.headers();
    delete headers["content-length"];
    await route.fulfill({ response, headers, body: `${await response.text()}\nwindow.__hapticsReady = true;` });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("heading", { name: "Emberisle" }).waitFor({ timeout: 4000 });
  assert.equal(await page.evaluate(() => window.__hapticsReady), true, "fast haptics import must finish before the first render");
  await page.mouse.click(2, 2);
  await page.evaluate(() => window.__emberisle.setState({ offer: {
    tradeId: "first-haptic", from: "other", fromName: "Tide", give: { wool: 1 }, want: { ore: 1 }, until: Date.now() + 60000,
  } }));
  await page.waitForFunction(() => window.__buzzes.length > 0, null, { timeout: 1500 });
  console.log("fast haptics chunk: title rendered with module ready; first incoming offer buzzed", await page.evaluate(() => window.__buzzes));
  await fast.close();

  const slow = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const stalled = await slow.newPage();
  await stalled.addInitScript(() => Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => true }));
  await stalled.route("**/haptics.tsx*", async route => {
    await new Promise(resolve => setTimeout(resolve, 6000));
    await route.continue();
  });
  const started = Date.now();
  await stalled.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await stalled.getByRole("heading", { name: "Emberisle" }).waitFor({ timeout: 5000 });
  const elapsed = Date.now() - started;
  assert(elapsed >= 2700 && elapsed < 5000, `stalled haptics must release startup near 3s, got ${elapsed}ms`);
  console.log(`stalled haptics chunk: title rendered after ${elapsed}ms while import remained pending`);
} finally {
  await browser?.close();
  await vite.close();
}
