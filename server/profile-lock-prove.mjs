// #1021: real-process publication and stale-reclamation interleavings, without mocked filesystem results.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [role, dir, hold, release] = process.argv.slice(2);
const self = fileURLToPath(import.meta.url);
if (role) {
  let held = false;
  const pause = () => {
    if (held) return;
    held = true;
    process.send({ type: "held" });
    const until = Date.now() + 15_000;
    while (!fs.existsSync(release)) {
      if (Date.now() > until) throw new Error("parent did not release lock boundary");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  };
  const open = fs.openSync, rename = fs.renameSync, unlink = fs.unlinkSync, rmdir = fs.rmdirSync;
  fs.openSync = function (name, flags, ...rest) {
    const fd = open.call(this, name, flags, ...rest);
    if (hold === "publish" && flags === "wx" && /^(writer\.lock|owner-[0-9]+-[0-9a-f]+)$/.test(path.basename(String(name)))) pause();
    return fd;
  };
  fs.renameSync = function (from, to) {
    const out = rename.call(this, from, to);
    if (hold === "published" && String(to) === path.join(dir, "writer.lock")) pause();
    return out;
  };
  fs.unlinkSync = function (name) {
    if (hold === "reclaim" && /^(writer\.lock|owner-[0-9]+-[0-9a-f]+)$/.test(path.basename(String(name)))) pause();
    return unlink.call(this, name);
  };
  fs.rmdirSync = function (name) {
    if (hold === "reclaim-empty" && String(name) === path.join(dir, "writer.lock")) pause();
    return rmdir.call(this, name);
  };
  syncBuiltinESMExports();
  const { openProfiles } = await import("./profiles.mjs");
  const store = openProfiles(dir, { colors: [] });
  process.send({ type: "ready", ready: store.ready, reason: store.reason, pid: process.pid });
  process.on("message", async (msg) => {
    if (msg === "stop") process.exit(0);
    if (msg === "duplicate") {
      process.send({ type: "duplicate", ready: openProfiles(dir, { colors: [] }).ready });
    }
    if (typeof msg === "object" && msg.type === "write") {
      try {
        await store.mutate((d) => { d.unknownLogins[msg.key] = { times: [Date.now()], pending: {}, lifetime: 0 }; });
        process.send({ type: "wrote", ok: true });
      } catch (e) { process.send({ type: "wrote", ok: false, code: e.code }); }
    }
  });
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "emberisle-lock-prove-"));
  const children = new Set();
  process.on("exit", () => { for (const c of children) c.kill("SIGKILL"); fs.rmSync(root, { recursive: true, force: true }); });
  let passed = 0, serial = 0;
  const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };
  const area = (name) => { const p = path.join(root, name); fs.mkdirSync(p, { mode: 0o700 }); return p; };
  const disk = (p) => fs.readFileSync(path.join(p, "profiles.json"), "utf8");
  const start = (p, boundary = "none") => {
    const marker = path.join(root, `release-${++serial}`);
    const c = spawn(process.execPath, [self, String(serial), p, boundary, marker], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    children.add(c);
    const messages = [];
    let errors = "";
    c.on("message", (m) => messages.push(m));
    c.stderr.on("data", (b) => { errors += b; });
    const exited = new Promise((resolve) => c.once("exit", () => { children.delete(c); resolve(); }));
    const next = async (type) => {
      const end = Date.now() + 20_000;
      for (;;) {
        const i = messages.findIndex((m) => m.type === type);
        if (i >= 0) return messages.splice(i, 1)[0];
        if (Date.now() > end || c.exitCode !== null || c.signalCode !== null) throw new Error(`${type}: child stopped or timed out: ${errors}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };
    return { c, next, release: () => fs.writeFileSync(marker, "go"), stop: async (signal) => { if (signal) c.kill(signal); else c.send("stop"); await exited; }, write: async (key) => { c.send({ type: "write", key }); return next("wrote"); } };
  };
  const loser = async (c, p, why) => {
    const before = disk(p);
    const reply = await c.write("loser");
    check(`${why}: refused store cannot overwrite the winner`, !reply.ok && reply.code === "unavailable" && disk(p) === before);
  };

  // This boundary reproduces both writable stores on the old PID-file implementation.
  {
    const p = area("publication"), a = start(p, "publish");
    await a.next("held");
    const b = start(p);
    check("publication: contender owns the complete published lock", (await b.next("ready")).ready);
    check("publication: winner commits through the real store", (await b.write("winner")).ok);
    a.release();
    check("publication: delayed publisher is refused", !(await a.next("ready")).ready);
    await loser(a, p, "publication");
    await a.stop();
    const c = start(p);
    check("publication: losing process exit cannot release the winner", !(await c.next("ready")).ready);
    await c.stop(); await b.stop();
    check("clean owner exit releases its exact lock", !fs.existsSync(path.join(p, "writer.lock")));
  }
  {
    const p = area("published"), a = start(p, "published");
    await a.next("held");
    const b = start(p);
    check("published lock excludes a contender before its owner returns", !(await b.next("ready")).ready);
    a.release();
    check("published owner becomes ready", (await a.next("ready")).ready);
    check("published owner commits", (await a.write("winner")).ok);
    await loser(b, p, "published");
    a.c.send("duplicate");
    check("another store in the same live process is also refused", !(await a.next("duplicate")).ready);
    const lock = path.join(p, "writer.lock"), entries = fs.readdirSync(lock);
    check("published directory and its unique owner file are private", (fs.statSync(lock).mode & 0o777) === 0o700 && entries.length === 1 && (fs.statSync(path.join(lock, entries[0])).mode & 0o777) === 0o600);
    await b.stop(); await a.stop();
  }
  let deadPid;
  for (const [legacy, boundary] of [[false, "reclaim"], [true, "reclaim"], [false, "reclaim-empty"]]) {
    const p = area(legacy ? "stale-legacy" : boundary === "reclaim-empty" ? "stale-empty" : "stale"), seed = start(p);
    const old = await seed.next("ready"); deadPid = old.pid;
    check("stale fixture owner starts and commits", old.ready && (await seed.write("seed")).ok);
    await seed.stop("SIGKILL");
    if (legacy) {
      fs.rmSync(path.join(p, "writer.lock"), { recursive: true });
      fs.writeFileSync(path.join(p, "writer.lock"), String(deadPid), { mode: 0o600 });
    }
    const a = start(p, boundary); await a.next("held");
    const b = start(p);
    check("stale: second reclaimer takes over the dead owner", (await b.next("ready")).ready);
    check("stale: new owner preserves the seed and commits", (await b.write("winner")).ok && Object.hasOwn(JSON.parse(disk(p)).unknownLogins, "seed"));
    a.release();
    check("stale: delayed cleanup cannot remove a new owner's marker", !(await a.next("ready")).ready);
    await loser(a, p, "stale");
    await a.stop();
    const c = start(p);
    check("stale: delayed contender exit leaves the winner protected", !(await c.next("ready")).ready);
    await c.stop(); await b.stop();
  }
  {
    const p = area("legacy-dead");
    fs.writeFileSync(path.join(p, "writer.lock"), String(deadPid), { mode: 0o600 });
    const c = start(p);
    check("a dead legacy PID-file owner is recovered", (await c.next("ready")).ready);
    check("legacy recovery publishes a nonempty owner directory", fs.statSync(path.join(p, "writer.lock")).isDirectory() && fs.readdirSync(path.join(p, "writer.lock")).length === 1);
    check("legacy recovery produces a writable store", (await c.write("winner")).ok);
    await c.stop();
  }
  for (const [name, contents] of [["legacy-live", String(process.pid)], ["legacy-empty", ""], ["legacy-malformed", "not-a-pid"]]) {
    const p = area(name), lock = path.join(p, "writer.lock");
    fs.writeFileSync(lock, contents, { mode: 0o600 });
    const c = start(p);
    check(`${name}: opener is refused`, !(await c.next("ready")).ready);
    const reply = await c.write("loser");
    check(`${name}: the lock is untouched and no store is written`, !reply.ok && reply.code === "unavailable" && fs.readFileSync(lock, "utf8") === contents && !fs.existsSync(path.join(p, "profiles.json")));
    await c.stop();
  }
  {
    const p = area("empty-directory"); fs.mkdirSync(path.join(p, "writer.lock"), { mode: 0o700 });
    const c = start(p);
    check("an abandoned empty lock directory is recoverable", (await c.next("ready")).ready && (await c.write("winner")).ok);
    await c.stop();
  }
  check("every proof child exited", children.size === 0);
  console.log(`profile-lock-prove: ${passed} checks passed`);
}
