// #1362: stickers through a real host. A host started with EMOTES_DIR=scripts/fixtures/stickers (test-one, test-two) must
// read exactly those ids, relay a `react` with each to a second seat, drop an id that is not in the folder (and ben-10, which
// is only in the default folder), and share the 5-burst, 1-per-second bucket with chat. A bad EMOTES_DIR must stop the host.
// Run: npm run sticker-host-prove
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { loadEmotes } from "./chat.mjs";

const SERVER = fileURLToPath(new URL("./", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../scripts/fixtures/stickers/", import.meta.url));
assert.deepEqual(loadEmotes(FIXTURES), new Set(["test-one", "test-two"]));

const TMP = mkdtempSync(path.join(tmpdir(), "emberisle-sticker-host-"));
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));
const hostEnv = (EMOTES_DIR) => ({ ...process.env, PORT: "0", ROOMS_DIR: `${TMP}/rooms`, RESULTS_DIR: `${TMP}/results`, EMOTES_DIR });
const hostArgs = ["--import", "./register.mjs", "host.mjs"];

// A bad EMOTES_DIR stops the host: a missing folder, a file, and 25 stickers.
{
  const file = path.join(TMP, "a-file");
  writeFileSync(file, "x");
  const many = path.join(TMP, "many");
  mkdirSync(many);
  for (let i = 0; i < 25; i++) writeFileSync(path.join(many, `s-${i}.png`), "x");
  for (const [why, dir] of [["missing folder", path.join(TMP, "nope")], ["a file", file], ["25 stickers", many]]) {
    const r = spawnSync(process.execPath, hostArgs, { cwd: SERVER, env: hostEnv(dir), encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 1, `${why}: host exits 1 (got ${r.status})`);
    assert.match(r.stderr, /EMOTES_DIR/, `${why}: names EMOTES_DIR`);
    console.log(`ok EMOTES_DIR with ${why} stops the host`);
  }
}

const host = spawn(process.execPath, hostArgs, { cwd: SERVER, env: hostEnv(FIXTURES) });
process.on("exit", () => host.kill("SIGKILL"));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const port = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
});

function client(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, inbox: [], waiters: [] };
  ws.on("message", (raw) => {
    c.inbox.push(JSON.parse(String(raw)));
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.nextOf = async (types) => {
    for (;;) {
      const i = c.inbox.findIndex((m) => types.includes(m.type));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      await new Promise((res, rej) => {
        c.waiters.push(res);
        setTimeout(() => rej(new Error(`${name} waited for ${types.join("/")}`)), 3000);
      });
    }
  };
  c.next = (type) => c.nextOf([type]);
  c.quiet = async (types, ms) => {
    await new Promise((r) => setTimeout(r, ms));
    assert.ok(!c.inbox.some((m) => types.includes(m.type)), `${name} unexpectedly got ${types.join("/")}`);
  };
  c.open = new Promise((res) => ws.on("open", res));
  return c;
}

const sender = client("Ember");
const watcher = client("Tide");
await Promise.all([sender.open, watcher.open]);
sender.send({ type: "hello", name: "Ember", color: "#e23d2e" });
const welcome = await sender.next("welcome");
watcher.send({ type: "hello", code: welcome.code, name: "Tide", color: "#2d6ee8" });
await watcher.next("welcome");
await sender.next("seats");
await watcher.next("seats");

// Each fixture id reaches the second seat (and the sender) with the sender's seat filled in by the host.
for (const id of ["test-one", "test-two"]) {
  sender.send({ type: "react", emote: id });
  const [onWatcher, onSender] = await Promise.all([watcher.next("react"), sender.next("react")]);
  for (const r of [onWatcher, onSender]) {
    assert.equal(r.emote, id);
    assert.equal(r.seat, "s0");
    assert.equal(r.to, null);
  }
  console.log(`ok react ${id} reached the second seat`);
}

// Ids outside the folder are dropped: an unknown one, and ben-10 (default folder only). Nothing comes back, not even a slow-down.
sender.send({ type: "react", emote: "not-in-folder" });
sender.send({ type: "react", emote: "ben-10" });
await Promise.all([watcher.quiet(["react"], 300), sender.quiet(["react", "error"], 0)]);
console.log("ok ids not in the folder are dropped (not-in-folder, ben-10)");

// Cooldown: 4 of the 5 tokens are spent (the host charges the bucket before it checks the id, so the 2 dropped ones count).
// Of 6 more in a burst, the 1 left plus at most 1 refill go through and the rest are slowed down.
let relayed = 0;
let slowed = 0;
for (let i = 0; i < 6; i++) sender.send({ type: "react", emote: i % 2 ? "test-two" : "test-one" });
for (let i = 0; i < 6; i++) {
  const m = await sender.nextOf(["react", "error"]);
  if (m.type === "react") relayed++;
  else {
    slowed++;
    assert.equal(m.message, "Slow down.");
  }
}
assert.ok(relayed >= 1 && relayed <= 2, `burst: ${relayed} relayed, ${slowed} slowed`);
assert.ok(slowed >= 4, `the burst is cut off: ${relayed} relayed, ${slowed} slowed`);
console.log(`ok cooldown: ${relayed} of 6 more stickers relayed, ${slowed} slowed down`);
await new Promise((r) => setTimeout(r, 1100));
sender.inbox.length = 0;
sender.send({ type: "react", emote: "test-one" });
assert.equal((await sender.nextOf(["react", "error"])).type, "react", "a sticker goes through after the cooldown");
console.log("ok a sticker goes through again after 1 s");

host.kill("SIGKILL");
console.log("sticker-host-prove: all checks passed");
process.exit(0);
