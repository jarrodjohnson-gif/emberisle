// #833: built title controls survive held/failed optional modules. Native host proves fallback Host is private.
// All normal layout, discovery, settings and chunk-retry assertions remain in their existing proofs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8491;
const chunks = Object.fromEntries(["OpenTables", "WayfarerOptions"].map(name => {
  const files = readdirSync("dist/assets").filter(p => p.startsWith(name + "-") && p.endsWith(".js"));
  assert.equal(files.length, 1, name + " built chunk");
  return [name, `http://127.0.0.1:${PORT}/assets/${files[0]}`];
}));
const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-title-chunks-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: rooms },
});
process.on("exit", () => { host.kill(); rmSync(rooms, { recursive: true, force: true }); });
const hostErrors = [];
host.stderr.on("data", d => hostErrors.push(String(d)));
let hostPort;
const started = new Promise((resolve, reject) => {
  host.stdout.on("data", d => { const m = String(d).match(/listening (\d+)/); if (m) { hostPort = Number(m[1]); resolve(); } });
  host.once("error", reject);
  host.once("exit", code => reject(new Error(`host exited ${code}: ${hostErrors.join("")}`)));
});
const startup = setTimeout(() => host.kill(), 15_000);
let vite, browser;
function check(ok, label, data) {
  assert.ok(ok, label + (data === undefined ? "" : " " + JSON.stringify(data)));
  console.log("ok  " + label + (data === undefined ? "" : " " + JSON.stringify(data)));
}
try {
  await started; clearTimeout(startup);
  vite = await preview({ preview: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ||
    (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  async function controlled(name, fail, run) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(), errors = [];
    const target = chunks[name];
    let release, requested;
    const gate = new Promise(resolve => { release = resolve; });
    const seen = new Promise(resolve => { requested = resolve; });
    // Prevent the separately proven one-time stale reload from swallowing this control's input.
    await page.addInitScript(url => {
      sessionStorage.setItem("emberisle-chunk-reloaded", JSON.stringify([url]));
      // Match the existing discovery proof: CSS/input/network checks need no software GL drawing.
      for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"])
        WebGL2RenderingContext.prototype[fn] = function () {};
    }, target);
    page.on("pageerror", e => { if (!String(e).includes(target)) errors.push(String(e)); });
    page.on("console", m => {
      if (m.type() === "error" && !m.text().includes(target) && m.location().url !== target) errors.push(m.text());
    });
    await page.route(target + "*", async route => {
      requested();
      if (fail) await route.abort();
      else { await gate; await route.continue(); }
    });
    try {
      await page.goto(`http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("title-card").waitFor();
      const deadline = setTimeout(() => requested(new Error("optional chunk was not requested")), 8000);
      const observed = await seen; clearTimeout(deadline); if (observed instanceof Error) throw observed;
      if (fail) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await run(page, release);
      check(errors.length === 0, `${name} ${fail ? "failed" : "held"}: no unrelated browser errors`, errors);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
      await ctx.close();
    }
  }
  await controlled("OpenTables", false, async (page, release) => {
    check(await page.getByRole("button", { name: "Host a table", exact: true }).isVisible(), "held mode controls retain private Host");
    const input = page.getByRole("textbox", { name: "Join code", exact: true });
    await input.fill("AB"); await input.focus();
    release();
    await page.getByTestId("open-mode-toggle").waitFor();
    check(await input.inputValue() === "AB" && await input.evaluate(el => el === document.activeElement), "mode arrival preserves Join text and focus");
    check(await page.getByTestId("open-mode-toggle").getAttribute("aria-pressed") === "false", "loaded mode remains Private by default");
  });
  await controlled("OpenTables", false, async page => {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "play");
    check(true, "practice starts while open-table module remains held");
  });
  await controlled("OpenTables", true, async page => {
    await page.getByRole("button", { name: "Host a table", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "lobby" && window.__emberisle.getState().code);
    const code = await page.evaluate(() => window.__emberisle.getState().code);
    const listed = await page.evaluate(url => new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const deadline = setTimeout(() => { socket.close(); reject(new Error("list reply deadline")); }, 8000);
      socket.onopen = () => socket.send(JSON.stringify({ type: "list" }));
      socket.onerror = e => { clearTimeout(deadline); reject(e); };
      socket.onmessage = e => { const m = JSON.parse(e.data); if (m.type === "openTables") { clearTimeout(deadline); socket.close(); resolve(m.tables.map(t => t.code)); } };
    }), `ws://127.0.0.1:${hostPort}`);
    check(!listed.includes(code), "failed mode controls still host a real private table", { code, listed });
  });
  await controlled("WayfarerOptions", false, async (page, release) => {
    const settings = page.getByTestId("wayfarer-setup");
    check((await settings.locator("summary").textContent()).includes("Online: on"), "settings summary stays eager");
    await settings.locator("summary").click();
    check(await settings.getByRole("combobox").count() === 0, "held settings body is isolated from core title controls");
    check(await page.getByRole("button", { name: "Host a table", exact: true }).isVisible(), "held settings retain Host");
    release();
    for (const label of ["Practice", "Online", "Hotseat"]) {
      const select = page.getByRole("combobox", { name: label + " wayfarer" });
      await select.waitFor(); check(await select.inputValue() === "on", label + " keeps its existing default");
    }
    await page.getByRole("combobox", { name: "Online wayfarer" }).selectOption("off");
    check((await settings.locator("summary").textContent()).includes("Online: off") &&
      await page.evaluate(() => window.__emberisle.getState().wayfarerChoices.online === "off"), "loaded settings preserve their existing store action and summary");
    check((await page.locator("#wayfarer-help").textContent()) === "Off never moves or blocks. Sevens still discard. Off fortunes add to the army.", "existing settings help text retained");
  });
  await controlled("WayfarerOptions", true, async page => {
    await page.getByRole("button", { name: "Host a table", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "lobby");
    check(true, "failed optional settings do not block hosting");
  });
  check(hostErrors.length === 0, "no host errors", hostErrors);
  console.log("title-chunks-prove: all passed");
} finally {
  clearTimeout(startup);
  await browser?.close();
  await vite?.close();
  host.kill();
}
