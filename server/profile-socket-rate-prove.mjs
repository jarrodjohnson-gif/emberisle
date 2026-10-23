// #1061: the profile connection's own burst/refill, independent of address and table-card limits.
// All requests are profileHello on the real host; no account, PIN or credential is needed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-profile-socket-"));
const sockets = new Set();
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: path.join(dir, "rooms"), PROFILES_DIR: path.join(dir, "profiles"), PROFILES_DEV: "1" },
});
let stderr = "";
host.stderr.on("data", (d) => { stderr += d; });
process.on("exit", () => {
  for (const socket of sockets) socket.terminate();
  host.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
let passed = 0;
function check(why, ok) {
  assert.ok(ok, why);
  passed++;
  console.log("ok", why);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("host startup timeout")), 10000);
    host.stdout.on("data", (d) => {
      const match = String(d).match(/listening (\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    host.once("exit", (code) => { clearTimeout(timer); reject(new Error(`host exited ${code}: ${stderr}`)); });
  });
  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: `http://127.0.0.1:${port}` });
    sockets.add(ws);
    const pending = new Map();
    ws.on("message", (raw) => {
      const reply = JSON.parse(String(raw));
      const waiter = pending.get(reply.id);
      if (waiter) { pending.delete(reply.id); clearTimeout(waiter.timer); waiter.resolve(reply); }
    });
    await once(ws, "open");
    let next = 0;
    return {
      async burst(count) {
        // Send together rather than spending refill time awaiting each individual reply.
        const start = Date.now();
        const replies = Array.from({ length: count }, () => new Promise((resolve, reject) => {
          const id = ++next;
          const timer = setTimeout(() => { pending.delete(id); reject(new Error(`profile reply ${id} timeout`)); }, 10000);
          pending.set(id, { resolve, timer });
          ws.send(JSON.stringify({ type: "profileHello", id }));
        }));
        return { replies: await Promise.all(replies), start, end: Date.now() };
      },
    };
  }
  const hello = (r) => r.type === "profileHello" && r.available === true && r.reason === null && r.caps.includes("profilesV1");
  const slow = (r) => r.type === "profileError" && r.code === "slowDown" && r.message === "Slow down.";
  const first = await connect();
  const burst = await first.burst(11);
  check("initial burst completes before a refill token can accrue", burst.end - burst.start < 1000);
  check("a profile socket accepts its first ten hello requests", burst.replies.slice(0, 10).every(hello));
  check("the eleventh hello receives slowDown", slow(burst.replies[10]));
  check("profile replies preserve every request id", burst.replies.every((r, i) => r.id === i + 1));
  const second = await connect();
  const independent = await second.burst(11);
  check("independent burst completes within one refill interval", independent.end - independent.start < 1000);
  check("another connection on the same address has ten independent tokens", independent.replies.slice(0, 10).every(hello));
  check("the independent connection exhausts at its eleventh hello", slow(independent.replies[10]));

  await wait(1100);
  const recovery = await first.burst(11);
  // Bracket when the server consumed requests with native send/receive timestamps, rather than
  // assuming the timer fired at exactly 1100ms. The production rate remains one token/second.
  const lower = Math.min(10, Math.floor((recovery.start - burst.end) / 1000));
  const upper = Math.min(10, Math.floor((recovery.end - burst.start) / 1000));
  const accepted = recovery.replies.filter(hello).length;
  check("native refill observation has a nonzero, bounded timing window", lower >= 1 && upper < 10 && upper - lower <= 1);
  check("an exhausted connection recovers at one token per native second", accepted >= lower && accepted <= upper);
  check("refill does not reset the connection to a fresh burst", accepted < 10);
  // A native refill may arrive between two requests; successes need not be a contiguous prefix.
  check("remaining recovery requests are explicitly throttled", recovery.replies.every((r) => hello(r) || slow(r)) && recovery.replies.filter(slow).length === 11 - accepted);
  check("recovery replies preserve all original request ids", recovery.replies.every((r, i) => r.id === i + 12));
  check("rate errors leave the original connection usable", hello(recovery.replies[0]));
  check("the host reports no request errors", stderr === "");
  console.log(`profile-socket-rate-prove: ${passed} checks passed`);
} finally {
  for (const socket of sockets) socket.terminate();
  if (host.exitCode === null && host.signalCode === null) {
    const exited = once(host, "exit");
    host.kill("SIGTERM");
    await exited;
  }
}
