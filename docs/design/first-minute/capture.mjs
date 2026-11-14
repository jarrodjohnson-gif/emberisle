// Captures the real title and lobby. Run: flock /tmp/claude-0/browser.lock node docs/design/first-minute/capture.mjs today
// The first argument is the file prefix ("today" before the redesign, "built" after it).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const prefix = process.argv[2] || "today";
const out = new URL("./", import.meta.url).pathname;
const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-first-minute-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms, RESULTS_DIR: `${rooms}/results` },
});
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
});
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({ front: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const VIEWS = [
  { width: 390, height: 844, touch: true },
  { width: 844, height: 390, touch: true },
  { width: 1280, height: 720 },
];
const settle = (page) => page.waitForTimeout(2500);
try {
  for (const v of VIEWS) {
    const tag = `${v.width}x${v.height}`;
    const ctx = await browser.newContext({ viewport: v, deviceScaleFactor: 2, ...(v.touch ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem("emberisle-name", "Ember"));
    await page.goto(url);
    await page.getByRole("button", { name: "Play", exact: true }).waitFor();
    await settle(page);
    await page.screenshot({ path: `${out}${prefix}-title-${tag}.png` });
    const play = page.getByRole("button", { name: "Play with bots", exact: true });

    if (prefix !== "today") {
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await play.waitFor();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}${prefix}-play-${tag}.png` });
    }
    await page.getByRole("button", { name: "Host a table", exact: true }).click();
    await page.getByRole("button", { name: "Ready", exact: true }).waitFor();
    const code = await page.evaluate(() => window.__emberisle.getState().code);
    const guests = [];
    for (const name of ["Tide", "Dune"]) {
      const g = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
      await g.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
      await g.goto(url);
      await g.waitForFunction(() => !!window.__emberisle);
      await g.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
      guests.push(g);
    }
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    await settle(page);
    await page.screenshot({ path: `${out}${prefix}-lobby-${tag}.png` });
    for (const g of guests) await g.context().close();
    await ctx.close();
    console.log(`${prefix} ${tag} captured`);
  }
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
