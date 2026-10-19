// Two-tab browser proof for the open-table feature (#833).
// Tab A hosts an Open table. Tab B visits the title, sees "Jarrod's table" with a Join button,
// taps it, and lands in the lobby — no code typed. A private table hosted simultaneously
// never appears in Tab B's open-table list.
// Run with: node --import ./server/register.mjs scripts/open-table-prove.mjs
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8112;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-open-table-ui-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostLog = [];
host.stderr.on("data", (d) => hostLog.push(String(d).trimEnd()));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    hostLog.push(String(d).trimEnd());
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
for (let tries = 0; ; tries++) {
  try {
    await vite.listen();
    break;
  } catch (e) {
    if (e.code !== "EADDRINUSE" || tries >= 240) throw e;
    if (tries === 0) console.log(`port ${PORT} busy, waiting`);
    await new Promise((r) => setTimeout(r, 500));
  }
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});

const T0 = Date.now();
const errors = [];
const elapsed = () => `+${((Date.now() - T0) / 1000).toFixed(1)}s`;
const check = (ok, what) => {
  if (!ok) {
    console.error(`FAIL ${what}`);
    if (hostLog.length) console.error("host log:\n" + hostLog.join("\n"));
    process.exit(1);
  }
  console.log(`ok ${what}`, elapsed());
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await wait(100);
  }
  check(false, `timed out: ${what}`);
};

const baseUrl = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;

async function openTab(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  // Disable WebGL draw calls so headless tabs run fast.
  await page.addInitScript(() => {
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      WebGL2RenderingContext.prototype[fn] = function () {};
    }
  });
  await page.goto(baseUrl);
  await page.getByTestId("title-card").waitFor();
  return { name, page };
}

// --- Tab A: Jarrod hosts an Open table ---
const A = await openTab("Jarrod");
// Set name to Jarrod.
await A.page.locator("details.seat-settings summary").click();
const nameInput = A.page.locator('input[placeholder="Your name"]');
await nameInput.fill("Jarrod");
await nameInput.press("Escape");

// Toggle to "Open" mode.
const modeToggle = A.page.getByTestId("open-mode-toggle");
await until(() => modeToggle.isVisible(), "open-mode-toggle visible");
await modeToggle.click();
// Confirm the toggle shows "Open".
const modeLabel = await modeToggle.innerText();
check(modeLabel.trim() === "Open", `open-mode-toggle says Open (got "${modeLabel.trim()}")`);

// Click "Host a table".
await A.page.getByRole("button", { name: "Host a table" }).click();
// Wait for the lobby to appear.
await until(() => A.page.getByTestId("lobby-card").isVisible().catch(() => false), "Jarrod's lobby card", 10000);
check(true, "Jarrod sees the lobby after hosting an Open table");

// --- Tab B: Joshua visits the title ---
const B = await openTab("Joshua");
// Wait for the open-table entry to appear (the title polls every 5 s; give it up to 12 s).
await until(
  () => B.page.getByTestId("open-table-entry").isVisible().catch(() => false),
  "open-table-entry visible on Joshua's title",
  12000,
);

const entryText = await B.page.getByTestId("open-table-entry").innerText();
check(entryText.includes("Jarrod's table"), `open table entry shows Jarrod's table (got "${entryText}")`);

// Join without typing any code.
await B.page.getByTestId("open-table-join").click();
await until(() => B.page.getByTestId("lobby-card").isVisible().catch(() => false), "Joshua's lobby card", 10000);
check(true, "Joshua joined the open table without typing a code");

// --- Private table: never in the list ---
// Tab C hosts a private table while the open one is running.
const C = await openTab("Private-host");
await C.page.getByRole("button", { name: "Host a table" }).click();
await until(() => C.page.getByTestId("lobby-card").isVisible().catch(() => false), "Private-host's lobby card", 10000);

// A fresh Tab D should see only one open table (Jarrod's), not the private one.
const D = await openTab("Observer");
await until(
  () => D.page.getByTestId("open-table-entry").isVisible().catch(() => false),
  "open-table-entry on Observer's title",
  12000,
);
const entries = await D.page.getByTestId("open-table-entry").count();
check(entries === 1, `observer sees exactly 1 open table, got ${entries}`);
const entryOnD = await D.page.getByTestId("open-table-entry").innerText();
check(entryOnD.includes("Jarrod"), `open entry is Jarrod's, got "${entryOnD}"`);
check(!entryOnD.includes("Private"), `private table name not exposed, got "${entryOnD}"`);

// Confirm there are no console errors.
check(errors.length === 0, `no console errors (found: ${errors.join(", ")})`);

console.log("open-table-prove ok: open table visible with Join, private table hidden, Joshua joined without code");
await browser.close();
await vite.close();
process.exit(0);
