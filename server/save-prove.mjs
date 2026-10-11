// G5: room saves are coalesced and asynchronous, against the real host. A burst of 50 changes is a few writes, the room
// file is valid JSON at every instant (also after kill -9 mid-burst), the last change is on disk within SAVE_MS, a
// SIGTERM or SIGINT flushes at once, and a table that closed is not written back.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const SAVE_MS = 200;
const dirs = [];
const hosts = new Set();
process.on("exit", () => {
  for (const h of hosts) h.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function start(dir, env = {}) {
  const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, SAVE_MS: String(SAVE_MS), ACT_CAP: "100000", ACT_RATE: "100000", ...env },
  });
  hosts.add(host);
  host.exited = new Promise((r) => host.once("exit", (code, signal) => r({ code, signal })));
  let out = "";
  host.stderr.on("data", (d) => process.stderr.write(d));
  return new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/listening (\d+)/);
      if (m) resolve({ host, port: Number(m[1]) });
    });
    host.once("exit", (c) => reject(new Error(`host exited ${c}`)));
  });
}

async function seat(port, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, ready: false, welcome: null, seats: null, waiters: [] };
  ws.on("error", () => {});
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "welcome") c.welcome = m;
    if (m.type === "seats") c.seats = m;
    for (const w of c.waiters.splice(0)) w();
  });
  await new Promise((r) => ws.on("open", r));
  ws.send(JSON.stringify({ type: "hello", name }));
  while (!c.welcome) await new Promise((r) => (c.waiters.push(r), setTimeout(r, 50)));
  c.toggle = () => ws.send(JSON.stringify({ type: "ready", value: (c.ready = !c.ready) }));
  return c;
}

const readRoom = (dir, code) => JSON.parse(readFileSync(path.join(dir, `${code}.json`), "utf8"));
const readyOnDisk = (dir, code) => readRoom(dir, code).seats[0].ready;
async function until(fn, ms, what) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      if (fn()) return Date.now() - t;
    } catch {}
    await wait(5);
  }
  assert.fail(`timed out: ${what}`);
}

// Counts every rename that lands on the room file, and parses the file on every tick: a half-written file would throw.
function observe(dir, code) {
  const o = { renames: [], reads: 0 };
  const w = watch(dir, (ev, name) => ev === "rename" && name === `${code}.json` && o.renames.push(Date.now()));
  const poll = setInterval(() => {
    if (!existsSync(path.join(dir, `${code}.json`))) return;
    o.reads++;
    try {
      JSON.parse(readFileSync(path.join(dir, `${code}.json`), "utf8"));
    } catch (e) {
      o.torn = e;
    }
  }, 1);
  o.stop = () => (w.close(), clearInterval(poll));
  return o;
}

// 1. A burst of 51 changes (odd, so the last state differs from the one on disk before it).
{
  const dir = mkdtempSync(path.join(tmpdir(), "emberisle-save-"));
  dirs.push(dir);
  const { host, port } = await start(dir);
  const a = await seat(port, "Ember");
  const code = a.welcome.code;
  await until(() => existsSync(path.join(dir, `${code}.json`)), 2000, "first save");
  await wait(SAVE_MS * 2);
  const obs = observe(dir, code);
  const t0 = Date.now();
  for (let i = 0; i < 51; i++) a.toggle();
  const sentIn = Date.now() - t0;
  const landed = await until(() => readyOnDisk(dir, code) === a.ready, SAVE_MS + 500, "last state on disk");
  await wait(SAVE_MS * 2);
  obs.stop();
  assert.equal(obs.torn, undefined, "the room file was never torn");
  assert.ok(obs.renames.length >= 1 && obs.renames.length <= 5, `51 changes -> ${obs.renames.length} writes`);
  const w2s = obs.renames.filter((t) => obs.renames.filter((u) => u >= t && u < t + 2000).length > 5);
  assert.equal(w2s.length, 0, "at most 5 writes in any 2 s window");
  assert.equal(readyOnDisk(dir, code), true, "final state exact");
  console.log(`burst: 51 changes in ${sentIn} ms -> ${obs.renames.length} write(s), ${obs.reads} reads all valid JSON, last state on disk ${landed} ms after the last change (SAVE_MS ${SAVE_MS})`);

  host.kill("SIGKILL");
  await host.exited;
}

// 2. kill -9 mid-burst: the file is whole, and a restarted host loads it.
{
  const dir = mkdtempSync(path.join(tmpdir(), "emberisle-save-"));
  dirs.push(dir);
  const first = await start(dir);
  const a = await seat(first.port, "Ember");
  const code = a.welcome.code;
  await until(() => existsSync(path.join(dir, `${code}.json`)), 2000, "first save");
  const obs = observe(dir, code);
  const burst = setInterval(() => a.ws.readyState === 1 && a.toggle(), 3);
  await wait(SAVE_MS * 3 + 50);
  first.host.kill("SIGKILL");
  await first.host.exited;
  clearInterval(burst);
  await wait(30);
  obs.stop();
  assert.equal(obs.torn, undefined, "the room file was whole while the burst ran");
  const onDisk = readRoom(dir, code);
  assert.equal(onDisk.code, code);
  assert.ok(obs.renames.length >= 2, "saves kept landing during the burst");
  const second = await start(dir);
  const b = new WebSocket(`ws://127.0.0.1:${second.port}`);
  b.on("error", () => {});
  await new Promise((r) => b.on("open", r));
  b.send(JSON.stringify({ type: "hello", code, secret: a.welcome.secret }));
  const got = await new Promise((r) => b.on("message", (raw) => JSON.parse(String(raw)).type === "welcome" && r(true)));
  assert.ok(got, "the restarted host loaded the room");
  b.close();
  second.host.kill("SIGKILL");
  await second.host.exited;
  console.log(`kill -9 mid-burst: ${obs.renames.length} writes during the burst, ${obs.reads} reads all valid JSON, file loads on restart`);
}

// 3. A graceful stop flushes at once, even with a debounce far longer than the test.
for (const [signal, want] of [["SIGTERM", 143], ["SIGINT", 130]]) {
  const dir = mkdtempSync(path.join(tmpdir(), "emberisle-save-"));
  dirs.push(dir);
  const { host, port } = await start(dir, { SAVE_MS: "60000" });
  const a = await seat(port, "Ember");
  const code = a.welcome.code;
  a.toggle();
  await wait(100);
  assert.equal(existsSync(path.join(dir, `${code}.json`)), false, "nothing written inside the debounce");
  host.kill(signal);
  const { code: exit } = await host.exited;
  assert.equal(exit, want);
  assert.equal(readyOnDisk(dir, code), true, `${signal} flushed the last state`);
  console.log(`${signal}: debounce 60 s, nothing on disk, then the stop flushed the last state (exit ${exit})`);
}

// 4. A table that closes before its flush is not written back.
{
  const dir = mkdtempSync(path.join(tmpdir(), "emberisle-save-"));
  dirs.push(dir);
  const { host, port } = await start(dir, { SAVE_MS: "400", LOBBY_HOLD_MS: "100" });
  const a = await seat(port, "Ember");
  const code = a.welcome.code;
  a.toggle();
  a.ws.close();
  await wait(1200);
  assert.equal(existsSync(path.join(dir, `${code}.json`)), false, "a closed table is not resurrected");
  host.kill("SIGTERM");
  await host.exited;
  assert.equal(existsSync(path.join(dir, `${code}.json`)), false, "nor by the exit flush");
  console.log("a table closed before its flush stays deleted, also across the exit flush");
}
console.log("save-prove ok");
