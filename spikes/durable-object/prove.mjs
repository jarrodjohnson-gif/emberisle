import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const cwd = path.dirname(fileURLToPath(import.meta.url));
const origin = "http://127.0.0.1:8799";
const state = mkdtempSync(path.join(cwd, "proof-state-"));
const results = path.join(cwd, "proof-results");
mkdirSync(results, { recursive: true });
const logPath = path.join(results, "wrangler.log");
const logOffset = existsSync(logPath) ? statSync(logPath).size : 0;
let worker;
let browser;

async function start() {
  worker = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--ip", "127.0.0.1", "--port", "8799", "--persist-to", state], {
    cwd, detached: true, env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
  });
  for (const stream of [worker.stdout, worker.stderr]) stream.on("data", (chunk) => appendFileSync(path.join(results, "wrangler.log"), chunk));
  for (let i = 0; i < 120; i++) {
    if (worker.exitCode !== null) throw new Error(`Wrangler exited ${worker.exitCode}; inspect ignored proof-results/wrangler.log`);
    try {
      const response = await fetch(`${origin}/__spike/status`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Wrangler did not become ready within 30 seconds");
}

async function stop() {
  if (!worker || worker.exitCode !== null) return;
  const exited = once(worker, "exit");
  process.kill(-worker.pid, "SIGTERM");
  await exited;
  worker = null;
}

async function lastState(page) {
  return page.evaluate(() => window.__spike.received.filter((m) => m.type === "state").at(-1));
}

try {
  await start();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const pages = [];
  const errors = [];
  let assetRequests = 0;
  for (const name of ["Ember", "Tide"]) {
    const context = await browser.newContext({ viewport: { width: 440, height: 956 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (request.url().startsWith(origin) && request.resourceType() !== "websocket") assetRequests++; });
    await page.addInitScript((name) => {
      localStorage.setItem("emberisle-name", name);
      localStorage.setItem("emberisle-water", "simple");
      localStorage.setItem("emberisle-muted", "1");
      window.__spike = { sent: [], received: [], socket: null };
      const Original = WebSocket;
      window.WebSocket = class extends Original {
        constructor(...args) {
          super(...args);
          window.__spike.socket = this;
          this.addEventListener("message", (event) => {
            try { window.__spike.received.push(JSON.parse(event.data)); } catch {}
          });
        }
        send(raw) { window.__spike.sent.push(JSON.parse(raw)); return super.send(raw); }
      };
    }, name);
    await page.goto(origin);
    pages.push(page);
  }
  const [a, b] = pages;
  await a.getByRole("button", { name: "Host a table", exact: true }).click();
  assert.equal((await a.getByTestId("table-code").textContent()).trim(), "TEST");
  await b.getByRole("textbox", { name: "Join code" }).fill("TEST");
  await b.getByRole("button", { name: "Join", exact: true }).click();
  await b.getByTestId("table-code").waitFor();
  for (const page of pages) {
    await page.waitForFunction(() => window.__spike.received.filter((m) => m.type === "seats").at(-1)?.seats.length === 2);
    const hello = await page.evaluate(() => window.__spike.sent.find((m) => m.type === "hello"));
    assert.equal(hello.proto, 1);
    await page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  await a.waitForFunction(() => window.__spike.received.filter((m) => m.type === "seats").at(-1)?.seats.every((s) => s.ready));
  console.log("PASS two real browser tabs: unchanged built client sends hello/join; readiness state broadcasts to both");
  await a.getByRole("button", { name: "Add bot", exact: true }).first().click();
  await a.getByRole("button", { name: "Start", exact: true }).click();
  for (const page of pages) await page.waitForFunction(() => window.__spike.received.some((m) => m.type === "state"));
  const first = await lastState(a);
  for (const page of pages) {
    const frame = await lastState(page);
    assert.equal(frame.game.seq, first.game.seq);
    assert.equal(frame.game.players.length, 3);
    assert(!("seed" in frame.game) && !("rng" in frame.game));
    assert(frame.game.players.filter((p) => p.id !== frame.you).every((p) => !("resources" in p)));
  }
  const current = (await lastState(a)).game.current;
  const actor = (await lastState(a)).you === current ? a : b;
  await actor.evaluate(() => {
    const frame = window.__spike.received.filter((m) => m.type === "state").at(-1);
    window.__spike.socket.send(JSON.stringify({ type: "roll", ...frame.actionStamp, cid: "spike-once-779" }));
  });
  for (const page of pages) await page.waitForFunction((seq) => window.__spike.received.filter((m) => m.type === "state").at(-1)?.game.seq > seq, first.game.seq);
  console.log("PASS shared TypeScript engine runs inside Durable Object; a real stamped roll advances both clients without exposing opponent hands");
  await a.evaluate(() => window.__spike.socket.send(JSON.stringify({ type: "chat", text: "local spike broadcast" })));
  for (const page of pages) await page.waitForFunction(() => window.__spike.received.some((m) => m.type === "chat" && m.text === "local spike broadcast"));
  const before = await (await fetch(`${origin}/__spike/status`)).json();
  const identities = await Promise.all(pages.map((page) => page.evaluate(() => {
    const m = window.__spike.received.find((m) => m.type === "welcome");
    return { you: m.you, secret: m.secret, welcomes: window.__spike.received.filter((m) => m.type === "welcome").length };
  })));
  console.log(`PASS SQLite snapshot committed: game seq ${before.gameSeq}; snapshot ${before.snapshotBytes} bytes; database ${before.databaseBytes} bytes`);
  await stop();
  await start();
  for (let i = 0; i < pages.length; i++) {
    await pages[i].waitForFunction((n) => window.__spike.received.filter((m) => m.type === "welcome").length > n, identities[i].welcomes, { timeout: 25_000 });
    const welcome = await pages[i].evaluate(() => window.__spike.received.filter((m) => m.type === "welcome").at(-1));
    assert.equal(welcome.you, identities[i].you);
    assert.equal(welcome.secret, identities[i].secret);
  }
  const after = await (await fetch(`${origin}/__spike/status`)).json();
  assert(after.boot > before.boot);
  assert.equal(after.gameDigest, before.gameDigest);
  assert.equal(after.gameSeq, before.gameSeq);
  assert.equal(after.seats.length, before.seats.length);
  assert.equal(after.sockets, 2);
  console.log(`PASS full Wrangler/workerd restart: Durable Object reconstructed from SQLite; boot ${before.boot} -> ${after.boot}; identical saved game`);
  console.log("PASS real client automatic rejoin: both held seat IDs and secrets preserved, no new seats created");
  const bad = new WebSocket(origin.replace("http:", "ws:"));
  await once(bad, "open");
  const refused = once(bad, "message");
  bad.send(JSON.stringify({ type: "hello", proto: 1, code: "TEST", secret: "invalid-local-test-secret" }));
  assert.equal(JSON.parse((await refused)[0].data).message, "Seat is gone.");
  bad.close();
  assert.deepEqual(errors, []);
  await a.screenshot({ path: path.join(results, "rejoined-table.png") });
  console.log("PASS invalid seat secret refused; zero browser page errors");
  console.log(`MEASURE initial two-tab title/lobby/game flow: ${assetRequests} same-origin HTTP requests, not a billing or latency benchmark`);
  console.log("LIMIT local only; one fixed TEST room; subset of protocol; no full gameplay, alarm, abuse, profile, invite or production routing claim");
  console.log("LIMIT runtime restart drops sockets then rejoins; this does not prove connected-socket hibernation, deployed CPU limits or cloud billing");
} finally {
  if (browser) await browser.close();
  await stop();
}
const runtimeLog = readFileSync(logPath).subarray(logOffset).toString().replace(/\u001b\[[0-9;]*m/g, "");
assert(!/\bERROR\b|Uncaught /u.test(runtimeLog), "Wrangler runtime reported an error; inspect ignored proof-results/wrangler.log");
console.log("PASS zero Wrangler runtime exceptions, including WebSocket close cleanup");
console.log("durable object local spike prove ok");
