// Two-tab browser proof for the open-table feature (#833).
// Tab A hosts an Open table. Tab B visits the title, sees "Jarrod's table" with a Join button,
// taps it, and lands in the lobby — no code typed. A private table hosted simultaneously
// never appears in Tab B's open-table list.
// Run with: node --import ./server/register.mjs scripts/open-table-prove.mjs
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8112;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-open-table-ui-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
let host;
const hostLog = [];
async function boot(port = 0) {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL("../server/", import.meta.url),
    env: { ...process.env, PORT: String(port), ROOMS_DIR, PROFILES_DIR: path.join(ROOMS_DIR, "profiles") },
  });
  host.stderr.on("data", (d) => hostLog.push(String(d).trimEnd()));
  return await new Promise((resolve, reject) => {
    host.once("error", reject);
    host.once("exit", (code) => reject(new Error(`host exited before listening: ${code}`)));
    host.stdout.on("data", (d) => {
      hostLog.push(String(d).trimEnd());
      const m = String(d).match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    });
  });
}
const hostPort = await boot();
process.on("exit", () => host?.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
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

mkdirSync("test-results", { recursive: true });
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

async function openTab(name, viewport = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  // Disable WebGL draw calls so headless tabs run fast.
  await page.addInitScript(() => {
    window.discoveryTraffic = [];
    window.discoveryDials = [];
    window.discoveryLive = 0;
    const NativeSocket = WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args);
        window.discoveryDials.push(performance.now());
        window.discoveryLive++;
        this.addEventListener("close", () => window.discoveryLive--);
      }
      send(data) {
        window.discoveryTraffic.push(JSON.parse(data));
        return super.send(data);
      }
    };
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      WebGL2RenderingContext.prototype[fn] = function () {};
    }
  });
  await page.goto(baseUrl);
  await page.getByTestId("title-card").waitFor();
  return { name, page, ctx };
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
check(await modeToggle.getAttribute("aria-pressed") === "true", "open-mode-toggle selects Open");

// Click "Host a table".
await A.page.getByRole("button", { name: "Host a table" }).click();
// Wait for the lobby to appear.
await until(() => A.page.getByTestId("lobby-card").isVisible().catch(() => false), "Jarrod's lobby card", 10000);
check(true, "Jarrod sees the lobby after hosting an Open table");

// Check the discovery row and Join control on a portrait title before opening another observer.
const phone = await openTab("Phone", { width: 390, height: 844 });
await until(
  () => phone.page.getByTestId("open-table-entry").isVisible().catch(() => false),
  "open-table-entry on 390x844 title",
  12000,
);
const phoneClip = await phone.page.evaluate(() => {
  const card = document.querySelector('[data-testid="title-card"]');
  const entry = document.querySelector('[data-testid="open-table-entry"]');
  const join = document.querySelector('[data-testid="open-table-join"]');
  if (!card || !entry || !join) return { ok: false, why: "missing nodes" };
  const c = card.getBoundingClientRect();
  const fullyIn = (el) => {
    const r = el.getBoundingClientRect();
    return r.top >= c.top - 0.5 && r.left >= c.left - 0.5 && r.bottom <= c.bottom + 0.5 && r.right <= c.right + 0.5
      && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5;
  };
  return { ok: fullyIn(entry) && fullyIn(join), entry: entry.getBoundingClientRect(), join: join.getBoundingClientRect(), card: c };
});
check(phoneClip.ok, `390x844 open-table row and Join fully visible (got ${JSON.stringify(phoneClip)})`);
check(await phone.page.locator("#code-help").innerText() === "Code for private tables", "private-code helper uses the approved text");
check(await phone.page.getByRole("textbox", { name: "Join code", exact: true }).getAttribute("aria-describedby") === "code-help", "code input is described by the private-table helper");
check(await phone.page.getByTestId("open-tables").getByText("Open tables", { exact: true }).count() === 1, "open-table heading uses the approved text");
check(await phone.page.getByTestId("open-table-join").getAttribute("aria-label") === "Join Jarrod's table", "listed Join has the table's accessible name");
check((await phone.page.getByTestId("open-table-join").boundingBox()).height >= 44, "listed Join has a 44px tap height");
await phone.page.screenshot({ path: "test-results/open-tables-390x844.png" });
await phone.ctx.close();

// --- Tab B: Joshua visits the title ---
const B = await openTab("Joshua");
await until(
  () => B.page.getByTestId("open-table-entry").isVisible().catch(() => false),
  "open-table-entry visible on Joshua's title",
  12000,
);
const entryText = await B.page.getByTestId("open-table-entry").innerText();
check(entryText.includes("Jarrod's table"), `open table entry shows Jarrod's table (got "${entryText}")`);

await B.page.screenshot({ path: "test-results/open-tables-1280x720.png" });

// Join without typing any code.
await B.page.getByTestId("open-table-join").click();
await until(() => B.page.getByTestId("lobby-card").isVisible().catch(() => false), "Joshua's lobby card", 10000);
check(true, "Joshua joined the open table without typing a code");

// --- Private table: never in the list ---
// Tab C hosts a private table while the open one is running.
const C = await openTab("Sidecar");
await C.page.locator("details.seat-settings summary").click();
await C.page.locator('input[placeholder="Your name"]').fill("Sidecar");
await C.page.locator('input[placeholder="Your name"]').press("Escape");
await C.page.getByRole("button", { name: "Host a table" }).click();
await until(() => C.page.getByTestId("lobby-card").isVisible().catch(() => false), "Sidecar's lobby card", 10000);
const privateCode = await C.page.evaluate(() => window.__emberisle.getState().code);
check(typeof privateCode === "string" && privateCode.length === 4, `private host got a code (got ${privateCode})`);

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
check(!entryOnD.includes("Sidecar"), `private host name Sidecar not exposed, got "${entryOnD}"`);
check(!entryOnD.includes(privateCode), `private code ${privateCode} not exposed, got "${entryOnD}"`);

// Preserve the original error assertion before deliberately taking the host offline.
// Confirm there are no console errors.
check(errors.length === 0, `no console errors (found: ${errors.join(", ")})`);

// #987: the same mounted title must recover a new list after a real host restart.
const documentMarker = await D.page.evaluate(() => {
  window.discoveryDocument = crypto.randomUUID();
  localStorage.setItem("emberisle-seat", JSON.stringify({ code: "SEAT", secret: "saved-seat-secret" }));
  return window.discoveryDocument;
});
await A.ctx.close();
await B.ctx.close();
await C.ctx.close();
const beforeOutage = await D.page.evaluate(() => window.discoveryDials.length);
await new Promise((resolve) => { host.once("exit", resolve); host.kill("SIGTERM"); });
await until(() => D.page.getByTestId("open-table-entry").count().then((n) => n === 0), "dropped host clears stale list");
await wait(3500); // At least two bounded redials fail while the host really stays down.
const offlineDials = await D.page.evaluate(() => window.discoveryDials.length) - beforeOutage;
check(offlineDials === 2, `bounded offline backoff: ${offlineDials} redials during 3.5 seconds offline`);
check(await boot(hostPort) === hostPort, "host restarted at the same address");
const E = await openTab("After restart");
await E.page.locator("details.seat-settings summary").click();
await E.page.locator('input[placeholder="Your name"]').fill("After restart");
await E.page.locator('input[placeholder="Your name"]').press("Escape");
await E.page.getByTestId("open-mode-toggle").click();
await E.page.getByRole("button", { name: "Host a table" }).click();
await E.page.getByTestId("lobby-card").waitFor();
const F = await openTab("Restart private");
await F.page.getByRole("button", { name: "Host a table" }).click();
await F.page.getByTestId("lobby-card").waitFor();
const restartPrivateCode = await F.page.evaluate(() => window.__emberisle.getState().code);
await until(() => D.page.getByTestId("open-table-entry").innerText().then((t) => t.includes("After restart")).catch(() => false), "same title recovers current listing after restart", 22000);
check(await D.page.evaluate(() => window.discoveryDocument) === documentMarker, "discovery recovered without document reload");
check(await D.page.getByTestId("open-table-entry").count() === 1, "recovered list contains only the current open table");
check(!(await D.page.getByTestId("open-tables").innerText()).includes(restartPrivateCode), "private table remains excluded after restart");
check(await D.page.evaluate(() => window.discoveryTraffic.every((m) => m.type === "list" && Object.keys(m).length === 1)), "seatless discovery sends only list, never credentials");
// A connected title closes its socket when it leaves, and its polling timer stays cancelled.
const G = await openTab("Connected cleanup");
await until(() => G.page.getByTestId("open-table-entry").isVisible().catch(() => false), "connected cleanup listing");
await G.page.getByRole("button", { name: "Play", exact: true }).click();
await G.page.getByTestId("title-card").waitFor({ state: "detached" });
await until(() => G.page.evaluate(() => window.discoveryLive === 0), "connected title socket closed on unmount");
const connectedDials = await G.page.evaluate(() => window.discoveryDials.length);
await wait(5500);
check(await G.page.evaluate((n) => window.discoveryLive === 0 && window.discoveryDials.length === n, connectedDials), "connected unmount cancels socket and polling");
await G.ctx.close();
// Leave the title while a reconnect timer is pending, then keep the page mounted beyond its deadline.
await E.ctx.close();
await F.ctx.close();
await new Promise((resolve) => { host.once("exit", resolve); host.kill("SIGTERM"); });
await until(() => D.page.getByTestId("open-table-entry").count().then((n) => n === 0), "second drop clears list");
await D.page.getByRole("button", { name: "Play", exact: true }).click();
await D.page.getByTestId("title-card").waitFor({ state: "detached" });
const afterUnmount = await D.page.evaluate(() => ({ dials: window.discoveryDials.length, traffic: window.discoveryTraffic.length }));
await wait(17000);
check(await D.page.evaluate((before) => window.discoveryDials.length === before.dials && window.discoveryTraffic.length === before.traffic, afterUnmount), "unmount cancels pending redial and list timers");

check(await D.page.evaluate(() => window.discoveryLive === 0), "no discovery socket survives pending-retry unmount");
console.log("open-table-prove ok: open table visible with Join, private table hidden, Joshua joined without code");
await browser.close();
await vite.close();
process.exit(0);
