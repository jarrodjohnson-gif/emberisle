// Proof-only preload for profile-auth-prove. Never loaded by the production host command.
// IPC contains numeric timing/count events only: no PIN, salt, key, login or credential.
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { performance } from "node:perf_hooks";
import WebSocket from "ws";

if (!process.send) throw new Error("profile auth observer requires the proof's IPC channel");
const emit = (event, fields = {}) => process.send({ type: "profile-hash-proof", event, ...fields });
const stamp = () => performance.timeOrigin + performance.now();
const native = crypto.scrypt;
let next = 0;
let active = 0;
let holdNext = false;
let held = null;
crypto.scrypt = (...args) => {
  const id = ++next;
  const run = () => {
    active++;
    emit("start", { id, at: stamp(), active });
    const callback = args.at(-1);
    let finished = false;
    const finish = () => {
      if (finished) throw new Error("native derivation completed twice");
      finished = true;
      active--;
      emit("finish", { id, at: stamp(), active });
    };
    try {
      native(...args.slice(0, -1), (...result) => { finish(); callback(...result); });
    } catch (error) {
      if (!finished) finish();
      throw error;
    }
  };
  if (holdNext) {
    holdNext = false;
    held = run;
    emit("held", { id });
  } else run();
};
syncBuiltinESMExports();

// Fence the delayed client fixture on actual queued replies, rather than a sleep.
const send = WebSocket.prototype.send;
WebSocket.prototype.send = function (data, ...args) {
  const result = send.call(this, data, ...args);
  let message;
  try { message = JSON.parse(String(data)); } catch { return result; }
  if (message.type === "profileError" && message.code === "signInFailed") emit("failureSent");
  return result;
};

process.on("message", (message) => {
  if (message?.type !== "profile-hash-proof-control") return;
  if (message.command === "hold-next") {
    if (held || holdNext || active) throw new Error("cannot gate a busy native derivation");
    holdNext = true;
  } else if (message.command === "release") {
    if (!held) throw new Error("no native derivation is held");
    const run = held;
    held = null;
    run();
  } else throw new Error("unknown proof control");
  emit("ack", { command: message.command });
});
