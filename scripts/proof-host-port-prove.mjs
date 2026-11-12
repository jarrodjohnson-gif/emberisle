// #1556: host startup failures must reject before browser launch, with no raw log disclosure.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { hostPort } from "./proof-host-port.mjs";

const fixture = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), exitCode: null, signalCode: null });
const clean = (host) => {
  for (const event of ["exit", "error"]) assert.equal(host.listenerCount(event), 0);
  assert.equal(host.stdout.listenerCount("data"), 0);
};
const host = fixture();
const port = hostPort(host);
host.stdout.write("unrelated output\nhost liste");
host.stdout.write("ning 12");
let settled = false;
port.then(() => { settled = true; });
await Promise.resolve();
assert.equal(settled, false, "partial digits must not resolve a truncated port");
host.stdout.write("345\n");
assert.equal(await port, 12345);
clean(host);
console.log("ok split banner resolves complete port and removes listeners");

for (const [code, signal] of [[7, null], [null, "SIGTERM"]]) {
  const child = fixture();
  const result = hostPort(child);
  child.emit("exit", code, signal);
  await assert.rejects(result, { message: `proof host exited before listening (code ${code}, signal ${signal})` });
  clean(child);
}
const ended = fixture();
ended.exitCode = 9;
await assert.rejects(hostPort(ended), /code 9/);
clean(ended);
console.log("ok premature exit, signal and already exited child reject");

const missing = spawn("/nonexistent-emberisle-proof-host");
await assert.rejects(hostPort(missing), /failed to spawn \(ENOENT\)/);
console.log("ok real spawn failure rejects");

// Execute the actual chat startup block against a failing child; no Vite/browser needed.
const chat = readFileSync(new URL("./chat-prove.mjs", import.meta.url), "utf8");
const block = chat.slice(chat.indexOf("const hostPort ="), chat.indexOf("const vite ="));
const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
import {spawn} from 'node:child_process';
import {hostPort as waitForHostPort} from ${JSON.stringify(new URL("./proof-host-port.mjs", import.meta.url).href)};
const host=spawn(process.execPath,['-e','process.exit(7)']);
${block}
`], { encoding: "utf8", timeout: 5000 });
assert.equal(result.error, undefined);
assert.equal(result.status, 1);
assert.match(result.stderr, /proof host exited before listening \(code 7, signal null\)/);
assert.doesNotMatch(result.stderr, /unsettled top-level await/);
console.log("ok actual chat startup reports child exit 7 instead of unsettled await");
console.log("proof host port ok");
