// Guards for server sub-modules:
// 1. result-journal writeDurable cleans up its .tmp file when write/sync fails.
// 2. openJournal serializes put, replace, and done per gameId (no zombie outcome or double-done).
// 3. profileHandler clears ws.profileIdle when a profile socket closes, while keeping idle timeout for open sockets.
// 4. chat cleanText rejects ZWJ-only invisible messages while preserving ZWJ emoji sequences.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanText } from "./chat.mjs";
import { profileHandler } from "./profile-protocol.mjs";
import { openJournal, OUTCOME_V, writeDurable } from "./result-journal.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-submodules-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));

let unhandled = null;
process.on("unhandledRejection", (err) => { unhandled = err; });

function makeOutcome(gameId = randomUUID(), name = "Ember") {
  const startedAt = 1_700_000_000_000;
  return {
    v: OUTCOME_V,
    gameId,
    startedAt,
    endedAt: startedAt + 60_000,
    policy: 1,
    eligible: true,
    winner: "p0",
    players: [
      { pid: "p0", profileId: null, name, kind: "human", points: 10, won: true, assisted: false },
      { pid: "p1", profileId: null, name: "Tide", kind: "human", points: 7, won: false, assisted: false },
    ],
  };
}

let failures = 0;
async function check(label, fn) {
  try {
    await fn();
    console.log(`ok   ${label}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${label}: ${err.message}`);
  }
}

// 1. writeDurable leaves no .tmp file after a write failure and preserves existing files.
await check("writeDurable removes .tmp file on writeFile failure", async () => {
  const d = path.join(dir, "durable");
  await writeDurable(d, "keep.json", '{"ok":true}');
  await assert.rejects(() => writeDurable(d, "keep.json", 12345), { code: "ERR_INVALID_ARG_TYPE" });
  const files = readdirSync(d);
  assert.deepEqual(files, ["keep.json"], `leaked temp files: ${JSON.stringify(files)}`);
  assert.equal(readFileSync(path.join(d, "keep.json"), "utf8"), '{"ok":true}');
});

// 2a. openJournal serializes replace() and done() so replace cannot resurrect a completed game.
await check("openJournal replace + done race never resurrects file or pending entry", async () => {
  const d = path.join(dir, "journal-replace-done");
  const journal = openJournal(d);
  const o1 = makeOutcome();
  const redacted = makeOutcome(o1.gameId, "Deleted player");
  assert.equal(await journal.put(o1), true);
  const [rep, fin] = await Promise.all([journal.replace(redacted), journal.done(o1.gameId)]);
  assert.equal(rep, undefined);
  assert.equal(fin, true);
  assert.equal(existsSync(path.join(d, `${o1.gameId}.json`)), false, "journal file must not be resurrected");
  assert.equal(journal.has(o1.gameId), false, "journal.has must be false");
  assert.equal(journal.ready(o1.gameId), false, "journal.ready must be false");
  assert.equal(journal.pending().length, 0, "journal.pending must be empty");
  assert.equal(journal.size, 0, "journal.size must be 0");
});

// 2b. openJournal done() followed by concurrent replace() rejects replace without resurrecting disk/memory.
await check("openJournal done + replace race rejects replace cleanly", async () => {
  const d = path.join(dir, "journal-done-replace");
  const journal = openJournal(d);
  const o1 = makeOutcome();
  const redacted = makeOutcome(o1.gameId, "Deleted player");
  assert.equal(await journal.put(o1), true);
  const [fin, rep] = await Promise.allSettled([journal.done(o1.gameId), journal.replace(redacted)]);
  assert.equal(fin.status, "fulfilled");
  assert.equal(fin.value, true);
  assert.equal(rep.status, "rejected");
  assert.match(rep.reason.message, /bad outcome/);
  assert.equal(existsSync(path.join(d, `${o1.gameId}.json`)), false, "journal file must stay removed");
  assert.equal(journal.pending().length, 0, "journal.pending must stay empty");
});

// 2c. Concurrent done() calls return [true, false].
await check("openJournal concurrent done() completes exactly once", async () => {
  const d = path.join(dir, "journal-double-done");
  const journal = openJournal(d);
  const o1 = makeOutcome();
  assert.equal(await journal.put(o1), true);
  const res = await Promise.all([journal.done(o1.gameId), journal.done(o1.gameId)]);
  assert.deepEqual(res, [true, false]);
  assert.equal(existsSync(path.join(d, `${o1.gameId}.json`)), false);
});

// 2d. Concurrent put() writes once and a failed fault does not poison later puts.
await check("openJournal concurrent put() and fault recovery", async () => {
  const d = path.join(dir, "journal-put");
  let failOnce = true;
  const journal = openJournal(d, {
    fault(point) {
      if (point === "journal-before" && failOnce) {
        failOnce = false;
        throw new Error("injected fault");
      }
    },
  });
  const o1 = makeOutcome();
  await assert.rejects(() => journal.put(o1), /injected fault/);
  assert.equal(journal.ready(o1.gameId), false);
  const res = await Promise.all([journal.put(o1), journal.put(o1)]);
  assert.deepEqual(res, [true, false]);
  assert.equal(journal.ready(o1.gameId), true);
  assert.equal(journal.size, 1);
  assert.equal(unhandled, null, "no unhandled promise rejection");
});

// 3. profileHandler clears ws.profileIdle on socket close and preserves idle close for open sockets.
await check("profileHandler clears idle timer on close and closes idle open sockets", async () => {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  globalThis.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++;
    const handle = { id, unref() { return handle; } };
    timers.set(handle, { fn, args, due: now + ms });
    return handle;
  };
  globalThis.clearTimeout = (handle) => { timers.delete(handle); };
  const tick = (ms) => {
    now += ms;
    for (const [handle, t] of [...timers]) {
      if (t.due <= now) {
        timers.delete(handle);
        t.fn(...t.args);
      }
    }
  };
  try {
    const sent = [];
    const handle = profileHandler({ ready: true }, (ws, msg) => sent.push({ ws, msg }));
    const makeWs = () => {
      const ws = new EventEmitter();
      ws.profileGate = { credentials: true };
      ws.closed = [];
      ws.close = (code, reason) => ws.closed.push({ code, reason });
      return ws;
    };
    const closedWs = makeWs();
    handle(closedWs, { type: "profileHello", id: 1 });
    await Promise.resolve();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].msg.type, "profileHello");
    closedWs.emit("close");
    assert.equal(timers.size, 0, "closing profile socket clears its idle timer");
    tick(10 * 60 * 1000 + 1);
    assert.equal(closedWs.closed.length, 0, "closed profile socket must not fire idle close later");

    const openWs = makeWs();
    handle(openWs, { type: "profileHello", id: 2 });
    tick(5 * 60 * 1000);
    assert.equal(openWs.closed.length, 0, "socket stays open before 10 min idle");
    handle(openWs, { type: "profileHello", id: 3 });
    assert.equal(openWs.listenerCount("close"), 1, "close listener registered once per socket");
    tick(5 * 60 * 1000);
    assert.equal(openWs.closed.length, 0, "activity refreshes the 10 min idle timer");
    tick(5 * 60 * 1000);
    assert.deepEqual(openWs.closed, [{ code: 1000, reason: "idle" }], "open idle socket closes at 10 min");
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});

// 4. chat cleanText rejects ZWJ-only invisible strings while keeping ZWJ emoji intact.
await check("chat cleanText rejects ZWJ-only strings and keeps ZWJ emoji", async () => {
  assert.equal(cleanText("\u200D"), null);
  assert.equal(cleanText("  \u200D\u200D  "), null);
  assert.equal(cleanText("\u200B\u200D\u200B"), null);
  assert.equal(cleanText("\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"), "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}");
  assert.equal(cleanText("hi \u{1F3F3}\uFE0F\u200D\u{1F308}"), "hi \u{1F3F3}\uFE0F\u200D\u{1F308}");
});

if (unhandled) {
  failures += 1;
  console.log(`FAIL unhandledRejection: ${unhandled}`);
}
if (failures) {
  console.log(`submodules-guards-prove: ${failures} check(s) failed`);
  process.exit(1);
}
console.log("submodules-guards-prove: ok (7 checks)");
