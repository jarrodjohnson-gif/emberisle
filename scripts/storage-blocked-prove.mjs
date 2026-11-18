// #1353: when storage throws SecurityError, the app boots cleanly and plays as guest with defaults.
// Zero page errors with Storage.prototype.getItem, setItem, removeItem and clear blocked.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { hostPort as waitForHostPort } from "./proof-host-port.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 0;
let ROOMS_DIR;
let host;
let vite;
let browser;
process.on("exit", () => {
  if (host && host.exitCode === null && host.signalCode === null) host.kill("SIGKILL");
  if (ROOMS_DIR) rmSync(ROOMS_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

const errors = [];

try {
  ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-storage-rooms-"));
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL("../server/", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR, PROFILES_DIR: path.join(ROOMS_DIR, "profiles"), RESULTS_DIR: `${ROOMS_DIR}/results`, RENAME_MS: "0" },
  });
  const hostPort = await waitForHostPort(host);
  vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: PORT !== 0 }, logLevel: "error" });
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
  browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => {
    const block = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    Storage.prototype.getItem = block;
    Storage.prototype.setItem = block;
    Storage.prototype.removeItem = block;
    Storage.prototype.clear = block;
  });

  // 1. Title loads with blocked storage
  const page1 = await context.newPage();
  page1.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page1.on("pageerror", (e) => errors.push(String(e)));

  await page1.goto(url);
  const titleCard = page1.getByTestId("title-card");
  await titleCard.waitFor();
  assert.ok(await titleCard.isVisible(), "title card is visible");

  // 2. Play (practice game) works
  const playBtn = page1.getByRole("button", { name: "Play with bots", exact: true });
  await playBtn.click();
  await page1.waitForFunction(() => window.__emberisle?.getState().screen === "play" && window.__emberisle?.getState().state !== null);
  assert.ok(await page1.getByTestId("log-line").isVisible(), "game log-line is visible after Play");

  // 3. Host a table works
  const page2 = await context.newPage();
  page2.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page2.on("pageerror", (e) => errors.push(String(e)));

  await page2.goto(url);
  await page2.getByTestId("title-card").waitFor();
  const hostBtn = page2.getByRole("button", { name: "Host a table", exact: true });
  await hostBtn.click();
  await page2.getByTestId("lobby-card").waitFor();
  assert.ok(await page2.getByTestId("lobby-card").isVisible(), "lobby card is visible after Host a table");

  // 4. Assert zero page errors
  assert.deepEqual(errors, [], "no console or page errors with blocked storage");
  console.log("storage-blocked-prove ok: title, play and host load with zero errors");
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
  if (host && host.exitCode === null && host.signalCode === null) {
    const exited = new Promise((resolve) => host.once("exit", resolve));
    host.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
    if (host.exitCode === null && host.signalCode === null) host.kill("SIGKILL");
  }
  if (ROOMS_DIR) rmSync(ROOMS_DIR, { recursive: true, force: true });
}
