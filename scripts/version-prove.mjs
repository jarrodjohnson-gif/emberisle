// #834/#913: production client stamp + real host welcomes, then controlled older-host welcome fixtures.
// Served dist only: the visible client SHA must be the built checkout, not a dev-server define.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "../server/node_modules/ws/wrapper.mjs";
import { chromium } from "playwright";
import { PROTO } from "../src/lib/net/proto.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEMP = mkdtempSync(path.join(tmpdir(), "emberisle-version-"));
const SHA = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const bundle = readdirSync(path.join(ROOT, "dist/assets")).filter((f) => /^index-.*\.js$/.test(f)).map((f) => readFileSync(path.join(ROOT, "dist/assets", f), "utf8")).join("\n");
const hosts = [], sockets = [];
let browser;
const errors = [];
process.on("exit", () => { for (const h of hosts) h.kill("SIGKILL"); for (const s of sockets) s.terminate(); rmSync(TEMP, { recursive: true, force: true }); });
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const timeout = setTimeout(() => { console.error("version proof exceeded 240 s"); process.exit(1); }, 240_000).unref();
const ok = (text) => console.log(`ok ${text}`);
async function boot(extra = {}) {
  const dir = mkdtempSync(path.join(TEMP, "host-"));
  const h = spawn(process.execPath, ["--import", path.join(ROOT, "server/register.mjs"), path.join(ROOT, "server/host.mjs")], {
    cwd: dir, // Intentionally outside the checkout: the host must stamp its own source, not the caller's cwd.
    env: { ...process.env, PORT: "0", DIST: path.join(ROOT, "dist"), ROOMS_DIR: path.join(dir, "rooms"), RESULTS_DIR: `${path.join(dir, "rooms")}/results`, PROFILES_DIR: path.join(dir, "profiles"), TURN_MS: "600000", ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  hosts.push(h);
  let stderr = "";
  h.stderr.on("data", (d) => { stderr += d; });
  return await new Promise((resolve, reject) => {
    h.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
    h.on("exit", (code) => reject(new Error(`host exited ${code}: ${stderr}`)));
  });
}
async function socket(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  const inbox = [];
  ws.on("message", (raw) => inbox.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  return {
    ws,
    send: (m) => ws.send(JSON.stringify(m)),
    next: async (type, accept = () => true) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const i = inbox.findIndex((m) => m.type === type && accept(m));
        if (i >= 0) return inbox.splice(i, 1)[0];
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`no ${type}: ${JSON.stringify(inbox)}`);
    },
  };
}
function clientDefine(env) {
  const script = 'const {loadConfigFromFile}=await import(process.argv[1]);const r=await loadConfigFromFile({command:"build",mode:"production"},process.argv[2]);process.stdout.write(JSON.stringify(r.config.define));';
  // Resolve Vite from this checkout while loading the config from a different working directory.
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script, import.meta.resolve("vite"), path.join(ROOT, "vite.config.ts")], { cwd: TEMP, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out);
}
try {
  assert.equal(JSON.parse(clientDefine(process.env).__BUILD_SHA__), SHA, "client define is this checkout's git SHA");
  const fallback = clientDefine({ ...process.env, PATH: "" });
  assert.equal(JSON.parse(fallback.__BUILD_SHA__), "dev", "client falls back to dev when git is unavailable");
  assert.ok(Number.isFinite(Date.parse(JSON.parse(fallback.__BUILD_TIME__))), "fallback still has a build timestamp");
  const port = await boot();
  const owner = await socket(port);
  owner.send({ type: "hello", proto: PROTO, name: "Version host" });
  const opened = await owner.next("welcome");
  assert.equal(opened.serverSha, SHA, "host welcome reports its actual source checkout from any cwd");
  const guest = await socket(port);
  guest.send({ type: "hello", proto: PROTO, code: opened.code, name: "Version guest" });
  assert.equal((await guest.next("welcome")).serverSha, SHA, "join welcome reports the host SHA");
  owner.send({ type: "addBot" }); owner.send({ type: "ready", value: true }); guest.send({ type: "ready", value: true });
  await owner.next("seats", (m) => m.seats.length === 3 && m.seats.every((s) => s.ready));
  owner.send({ type: "start" }); await owner.next("state");
  const watcher = await socket(port);
  watcher.send({ type: "hello", proto: PROTO, code: opened.code, watch: true });
  const watched = await watcher.next("welcome");
  assert.equal(watched.serverSha, SHA, "watch welcome reports the host SHA");
  assert.equal(watched.spectator, true);
  assert.equal(watched.secret, undefined, "version metadata does not grant a spectator a seat secret");
  owner.ws.close();
  await guest.next("seats", (m) => m.seats.some((s) => s.id === opened.you && s.away));
  const returning = await socket(port);
  returning.send({ type: "hello", proto: PROTO, code: opened.code, secret: opened.secret });
  assert.equal((await returning.next("welcome")).serverSha, SHA, "rejoin welcome reports the host SHA");
  const noGitPort = await boot({ PATH: "" });
  const noGit = await socket(noGitPort);
  noGit.send({ type: "hello", proto: PROTO, name: "No git" });
  assert.equal((await noGit.next("welcome")).serverSha, "dev", "host without git still opens a table and reports dev");
  ok("actual host/join/watch/rejoin SHAs; independent working directory; client and host git-unavailable fallback");

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
  for (const [width, height] of [[390, 844], [844, 390], [1280, 720]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, timezoneId: "UTC" });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => {
      localStorage.setItem("emberisle-water", "simple");
      window.__welcomes = [];
      const Real = window.WebSocket;
      window.WebSocket = class extends Real {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", (e) => {
            const m = JSON.parse(e.data);
            if (m.type !== "welcome") return;
            window.__welcomes.push(m.serverSha ?? null);
            if ("__shaOverride" in window) {
              if (window.__shaOverride === null) delete m.serverSha;
              else m.serverSha = window.__shaOverride;
              Object.defineProperty(e, "data", { value: JSON.stringify(m) });
            }
          });
        }
      };
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.getByRole("button", { name: "Host a table", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "lobby");
    assert.equal(await page.evaluate(() => window.__emberisle.getState().serverSha), SHA);
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    await page.getByRole("button", { name: "Ready", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "Table menu", exact: true }).click();
    const line = page.getByTestId("build-version");
    await line.waitFor();
    assert.equal(await line.count(), 1, "exactly one version line");
    assert.match(await line.innerText(), new RegExp(`client ${SHA} · server ${SHA}`), "both actual SHAs appear in the production menu");
    assert.ok(!(await line.innerText()).includes("different builds"), "matching builds do not claim a mismatch");
    assert.match(await line.innerText(), /UTC/, "build time has an explicit time zone");
    const stamp = await line.locator("time").getAttribute("datetime");
    assert.ok(Number.isFinite(Date.parse(stamp)), "semantic build timestamp is valid");
    assert.ok(bundle.includes(stamp), "timestamp is compiled into this build, not generated at runtime");
    const fits = await line.evaluate((el) => {
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect(), menu = el.closest('[role="dialog"]');
      const m = menu.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= m.top && r.bottom <= m.bottom && el.scrollWidth <= el.clientWidth;
    });
    assert.ok(fits, `${width}x${height}: the version line fits and is reachable inside the menu`);
    await page.screenshot({ path: path.join(ROOT, `test-results/version-${width}x${height}.png`) });
    {
      const different = SHA === "0000000" ? "fffffff" : "0000000";
      const full = different.repeat(6).slice(0, 40);
      const fixtures = [[full, full, true], ...(width === 1280 ? [[different, different, true], [null, "unknown", false], ["not-a-sha", "unknown", false], [{ sha: SHA }, "unknown", false], ["dev", "dev", false]] : [])];
      for (const [value, shown, mismatch] of fixtures) {
        const before = await page.evaluate(() => window.__welcomes.length);
        await page.evaluate((v) => { window.__shaOverride = v; window.__emberisle.getState().net.drop(); }, value);
        await page.waitForFunction(({ before, shown }) => window.__welcomes.length > before && window.__emberisle.getState().serverSha === (shown === "unknown" ? null : shown), { before, shown });
        await page.waitForFunction(({ shown, mismatch }) => {
          const text = document.querySelector('[data-testid="build-version"]')?.textContent;
          return text?.includes(`server ${shown}`) && text.includes("different builds") === mismatch;
        }, { shown, mismatch });
        assert.equal(await line.count(), 1, "welcome updates the existing version line");
        assert.match(await line.innerText(), new RegExp(`client ${SHA}`), "welcome cannot change the compiled client SHA");
        assert.ok(await line.evaluate((el) => el.scrollWidth <= el.clientWidth), `${width}x${height}: even a full SHA wraps without clipping`);
        if (width === 1280 && value === different) await page.screenshot({ path: path.join(ROOT, "test-results/version-mismatch-1280x720.png") });
      }
    }
    if (width === 1280) {
      await page.screenshot({ path: path.join(ROOT, "test-results/version-server-dev.png") });
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.__emberisle.getState().goTitle());
      assert.equal(await page.evaluate(() => window.__emberisle.getState().serverSha), null, "leaving clears host metadata");
      await page.getByRole("button", { name: "Play against bots", exact: true }).click();
      await page.getByRole("button", { name: "Table menu", exact: true }).click();
      assert.ok(!(await line.innerText()).includes("server"), "practice never shows stale host metadata");
    }
    await context.close();
    ok(`production menu ${width}x${height}: actual client/server SHA, one fitting line and zoned build time`);
  }
  assert.deepEqual(errors, [], "zero browser errors");
  console.log("version-prove ok: host metadata, fallback, production stamp, mismatch, legacy/invalid hosts and reset");
} finally {
  clearTimeout(timeout);
  await browser?.close();
  for (const h of hosts) h.kill();
}
