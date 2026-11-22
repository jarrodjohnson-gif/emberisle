// #990: real filesystem faults at each profile commit boundary, plus production-host recovery and guest play.
// Injection wraps Node's filesystem calls; the store, file format, locks and socket handlers are unchanged.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { openProfiles } from "./profiles.mjs";

const root = mkdtempSync(path.join(tmpdir(), "emberisle-profile-write-"));
const hosts = new Set();
const sockets = new Set();
process.on("exit", () => {
  for (const proc of hosts) proc.kill("SIGKILL");
  for (const ws of sockets) ws.terminate();
  rmSync(root, { recursive: true, force: true });
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
let passed = 0;
const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };
const unavailable = (e) => e.code === "unavailable";

// This same injector runs in-process for queue/read tests and as a preload in the real host.
function installFaults(fs, dir, take) {
  const open = fs.open;
  const rename = fs.rename;
  const fault = (phase) => {
    if (take(phase)) throw Object.assign(new Error(`injected ${phase}`), { code: "EIO" });
  };
  fs.open = async function (name, flags, ...rest) {
    const temp = path.dirname(String(name)) === dir && flags === "wx";
    const directory = name === dir && flags === "r";
    if (temp) fault("file-open");
    if (directory) fault("directory-open");
    const handle = await open.call(this, name, flags, ...rest);
    for (const [method, phase] of temp ? [["writeFile", "file-write"], ["sync", "file-sync"], ["close", "file-close"]] : directory ? [["sync", "directory-sync"], ["close", "directory-close"]] : []) {
      const original = handle[method].bind(handle);
      handle[method] = async (...args) => {
        // Close the real descriptor even when simulating a close error.
        if (method === "close") { const out = await original(...args); fault(phase); return out; }
        fault(phase);
        return original(...args);
      };
    }
    return handle;
  };
  fs.rename = async function (from, to) {
    if (to !== path.join(dir, "profiles.json")) return rename.call(this, from, to);
    fault("rename-before");
    const out = await rename.call(this, from, to);
    fault("rename-after");
    return out;
  };
  return () => { fs.open = open; fs.rename = rename; };
}

for (const phase of ["file-open", "file-write", "file-sync", "file-close", "rename-before", "rename-after", "directory-open", "directory-sync", "directory-close"]) {
  const dir = path.join(root, phase);
  const file = path.join(dir, "profiles.json");
  const store = openProfiles(dir, { colors: [] });
  await store.mutate((d) => { d.unknownLogins.probe = { times: [Date.now()], pending: {}, lifetime: 1 }; });
  const before = readFileSync(file, "utf8");
  let hit = false;
  const restore = installFaults(fs, dir, (p) => p === phase && !hit && (hit = true));
  const uncertain = !phase.startsWith("file-");
  let queuedRan = false;
  let queuedSawOldDisk = false;
  try {
    const first = store.mutate((d) => { d.unknownLogins.probe.lifetime = 2; });
    // Already queued when the write fails: the next callback must recheck readiness.
    const queued = store.mutate((d) => { queuedRan = true; queuedSawOldDisk = readFileSync(file, "utf8") === before; d.unknownLogins.probe.lifetime += 10; });
    const results = await Promise.allSettled([first, queued]);
    check(`${phase}: fault reached and first mutation refused`, hit && results[0].status === "rejected" && unavailable(results[0].reason));
    if (uncertain) {
      check(`${phase}: readiness fenced and queued callback never runs`, !store.ready && !queuedRan && results[1].status === "rejected" && unavailable(results[1].reason));
      const disk = readFileSync(file, "utf8");
      check(`${phase}: actual replacement state preserved`, phase === "rename-before" ? disk === before : JSON.parse(disk).unknownLogins.probe.lifetime === 2);
      await assert.rejects(store.mutate(() => assert.fail("fenced callback ran")), unavailable);
      await assert.rejects(store.login("probe", "1234"), unavailable);
      assert.throws(() => store.resume("x".repeat(43)), unavailable);
      check(`${phase}: all later writes and credentials refused without disk rollback`, !store.validate("x".repeat(43)) && store.profile("anything") === null && readFileSync(file, "utf8") === disk);
    } else {
      check(`${phase}: recoverable failure leaves queue and store usable`, store.ready && queuedRan && queuedSawOldDisk && results[1].status === "fulfilled" && JSON.parse(readFileSync(file, "utf8")).unknownLogins.probe.lifetime === 11);
    }
  } finally { restore(); }
}

const profileDir = path.join(root, "host-profiles");
const storeFile = path.join(profileDir, "profiles.json");
const armFile = path.join(root, "arm");
const preload = path.join(root, "faults.mjs");
writeFileSync(preload, `import path from 'node:path';\nimport fs from 'node:fs/promises';\nimport { readFileSync, unlinkSync } from 'node:fs';\n(${installFaults.toString()})(fs, process.env.PROFILES_DIR, phase => {\n let arm; try { arm=readFileSync(${JSON.stringify(armFile)}, 'utf8'); } catch { return false; }\n if(arm!==phase)return false; unlinkSync(${JSON.stringify(armFile)}); return true;\n});\n`);
const serverDir = fileURLToPath(new URL(".", import.meta.url));
async function start() {
  const proc = spawn(process.execPath, ["--import", preload, "--import", "./register.mjs", "host.mjs"], {
    cwd: serverDir,
    env: { ...process.env, PORT: "0", ROOMS_DIR: path.join(root, "rooms"), RESULTS_DIR: `${path.join(root, "rooms")}/results`, PROFILES_DIR: profileDir, PROFILES_DEV: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  hosts.add(proc);
  let log = "";
  proc.stderr.on("data", (d) => { log += d; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`host startup timeout: ${log}`)), 15000);
    proc.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) { clearTimeout(timer); resolve(Number(m[1])); } });
    proc.once("exit", (code) => { clearTimeout(timer); reject(new Error(`host exited ${code}: ${log}`)); });
  });
  return { port, stop: () => new Promise((resolve) => { proc.once("exit", () => { hosts.delete(proc); resolve(); }); proc.kill("SIGKILL"); }) };
}
async function client(host, profile = true) {
  const headers = profile ? { origin: "https://isle-demo.trycloudflare.com", host: "isle-demo.trycloudflare.com", "cf-connecting-ip": "10.99.0.1", "x-forwarded-proto": "https" } : {};
  const ws = new WebSocket(`ws://127.0.0.1:${host.port}`, { headers });
  sockets.add(ws);
  const inbox = [];
  let notify = () => {};
  ws.on("message", (raw) => { inbox.push(JSON.parse(String(raw))); notify(); });
  ws.on("error", () => {});
  await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  const next = async (predicate) => {
    const deadline = Date.now() + 15000;
    for (;;) {
      const i = inbox.findIndex(predicate);
      if (i >= 0) return inbox.splice(i, 1)[0];
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("socket reply timeout")), Math.max(1, deadline - Date.now()));
        notify = () => { clearTimeout(timer); resolve(); };
      });
    }
  };
  let id = 0;
  return { send: (msg) => ws.send(JSON.stringify(msg)), next, req: async (msg) => { const key = String(++id); ws.send(JSON.stringify({ ...msg, id: key })); return next((m) => m.id === key); } };
}
const disk = () => JSON.parse(readFileSync(storeFile, "utf8"));
const error = (reply) => reply.type === "profileError" && reply.code === "unavailable";
let host = await start();
let c = await client(host);
const created = await c.req({ type: "profileCreate", login: "write-proof", displayName: "Write proof", pin: "4821", pinConfirm: "4821", color: "#2d6ee8" });
check("real host creates a durable profile before faults", created.type === "profileSession" && typeof created.credential === "string");
const id = created.profile.profileId;
const credential = created.credential;
for (const phase of ["file-write", "file-sync"]) {
  const before = readFileSync(storeFile, "utf8");
  writeFileSync(armFile, phase);
  check(`real host ${phase}: request refused`, error(await c.req({ type: "profileLogin", login: "write-proof", pin: "0000" })));
  check(`real host ${phase}: original file and readiness preserved`, readFileSync(storeFile, "utf8") === before && (await c.req({ type: "profileHello" })).available === true);
  check(`real host ${phase}: next request succeeds`, (await c.req({ type: "profileResume", credential })).type === "profileSession");
}
writeFileSync(armFile, "directory-sync");
check("real host refuses uncertain login reservation", error(await c.req({ type: "profileLogin", login: "write-proof", pin: "0000" })));
const held = readFileSync(storeFile, "utf8");
check("failed acknowledgement leaves the real PIN reservation on disk", Object.keys(disk().profiles[id].guard.pending).length === 1 && disk().profiles[id].guard.lifetime === 0);
// Use fresh sockets to keep rate limiting independent of availability checks.
c = await client(host);
const hello = await c.req({ type: "profileHello" });
check("real host stops advertising profile availability", hello.available === false && hello.reason === "unavailable");
for (const msg of [{ type: "profileResume", credential }, { type: "profileLogout", credential }, { type: "profileLogin", login: "write-proof", pin: "4821" }, { type: "profileCreate", login: "another", displayName: "Another", pin: "1234", pinConfirm: "1234", color: "#2d6ee8" }]) {
  check(`real host fences ${msg.type}`, error(await c.req(msg)));
}
check("later profile traffic cannot overwrite the pending budget", readFileSync(storeFile, "utf8") === held);
const guest = await client(host, false);
guest.send({ type: "hello", name: "Guest" });
const welcome = await guest.next((m) => m.type === "welcome");
const joiner = await client(host, false);
joiner.send({ type: "hello", code: welcome.code, name: "Guest two" });
check("guests still host and join while profiles are fenced", typeof welcome.code === "string" && (await joiner.next((m) => m.type === "welcome")).code === welcome.code);
await host.stop();
host = await start();
c = await client(host);
check("clean restart reloads the file and restores availability", (await c.req({ type: "profileHello" })).available === true);
check("original device credential survives recovery", (await c.req({ type: "profileResume", credential })).profile?.profileId === id);
// Startup recovery is serialized ahead of this reservation; a wrong PIN proves both attempts remain charged.
const wrong = await c.req({ type: "profileLogin", login: "write-proof", pin: "0000" });
const guard = disk().profiles[id].guard;
check("restart charges uncertain reservation plus later wrong PIN exactly once", wrong.code === "signInFailed" && guard.lifetime === 2 && guard.times.length === 2 && Object.keys(guard.pending).length === 0);
await host.stop();
for (const ws of sockets) ws.terminate();
console.log(`profile-write-prove: ${passed} checks passed`);
