// #307: run `node scripts/night.mjs` as Jarrod does on game night. It must build, print the three
// join lines, serve the page and answer a socket, and on SIGINT leave no host behind.
// #321: kill -9 the host mid-run and it must come back under night, on the same port, with the join lines again.
// night.mjs only prints the cloudflared line; it never starts a tunnel, so nothing here needs stubbing.
import { spawn, execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { supervise } from "./night.mjs";

const PORT = "8797";
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-night-"));
const WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hostsOf = (ppid) =>
  execFileSync("ps", ["-eo", "pid,ppid,args"], { encoding: "utf8" })
    .split("\n")
    .slice(1)
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m) => m && Number(m[2]) === ppid && /host\.mjs/.test(m[3]))
    .map((m) => Number(m[1]));

let night;
let hostPids = [];
function cleanup() {
  for (const pid of hostPids) {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
  if (night) night.kill("SIGKILL");
  rmSync(ROOMS_DIR, { recursive: true, force: true });
}
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(1));

function fail(msg) {
  console.error(`night-prove FAILED: ${msg}`);
  process.exit(1);
}

// supervise() with fake hosts, before anything is spawned: a host that dies six times in a row is
// restarted five times and then given up on with exit code 1; a stop() is not a restart.
{
  const fakeHost = ({ dies, exitsOnKill }) => {
    const h = new EventEmitter();
    h.kill = () => exitsOnKill && setImmediate(() => h.emit("exit", null, "SIGTERM"));
    if (dies) setImmediate(() => h.emit("exit", 1, null));
    return h;
  };
  const logs = [];
  let spawns = 0;
  const crashLoop = supervise(() => (spawns++, fakeHost({ dies: true })), { log: (l) => logs.push(l) });
  const code = await crashLoop.done;
  if (code !== 1) fail(`crash loop: supervise resolved ${code}, expected 1`);
  if (spawns !== 6) fail(`crash loop: ${spawns} spawns, expected 6 (first start + 5 restarts)`);
  if (logs.length !== 6 || !logs[0].includes("restarting (1/5)") || !logs[4].includes("restarting (5/5)") || !logs[5].includes("giving up")) {
    fail(`crash loop logs:\n${logs.join("\n")}`);
  }
  spawns = 0;
  const stopped = supervise(() => (spawns++, fakeHost({ dies: false, exitsOnKill: true })), { log: () => {} });
  stopped.stop();
  if ((await stopped.done) !== 0 || spawns !== 1) fail(`stop(): exit ${await stopped.done}, spawns ${spawns}; expected 0 and 1`);
  console.log("supervise unit ok");
}
// #365: a busy port must stop night before the build, with one plain line and exit 1, not a host
// crash loop. A plain net server holds the port; night must exit quickly with no host child.
{
  const BUSY = 8798;
  const holder = net.createServer();
  await new Promise((resolve, reject) => holder.once("error", reject).listen(BUSY, resolve));
  const busy = spawn(process.execPath, ["scripts/night.mjs"], {
    env: { ...process.env, PORT: String(BUSY), ROOMS_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let busyOut = "";
  let maxHosts = 0;
  for (const s of [busy.stdout, busy.stderr]) s.on("data", (c) => (busyOut += c));
  const poll = setInterval(() => { try { maxHosts = Math.max(maxHosts, hostsOf(busy.pid).length); } catch {} }, 50);
  const tb = Date.now();
  const exit = await Promise.race([
    new Promise((resolve) => busy.once("exit", (code, sig) => resolve({ code, sig }))),
    sleep(5000).then(() => null),
  ]);
  clearInterval(poll);
  if (!exit) { busy.kill("SIGKILL"); holder.close(); fail(`busy port: night still running 5 s later:\n${busyOut}`); }
  holder.close();
  if (exit.code !== 1) fail(`busy port: night exit ${JSON.stringify(exit)}, expected code 1:\n${busyOut}`);
  if (!busyOut.includes(`Port ${BUSY} is busy`) || !busyOut.includes(`PORT=${BUSY + 1}`)) fail(`busy port: no busy message:\n${busyOut}`);
  if (busyOut.includes("restarting") || busyOut.includes("giving up")) fail(`busy port: host was restarted:\n${busyOut}`);
  if (maxHosts) fail(`busy port: night spawned ${maxHosts} host(s)`);
  console.log(`port busy ok (exit 1 after ${((Date.now() - tb) / 1000).toFixed(1)} s)`);
}
const watchdog = setTimeout(() => fail("overall 150 s limit"), 150_000);

night = spawn(process.execPath, ["scripts/night.mjs"], {
  env: { ...process.env, PORT, ROOMS_DIR },
  stdio: ["ignore", "pipe", "inherit"],
});
let out = "";
let nightExit = null;
night.stdout.on("data", (c) => (out += c));
night.on("exit", (code, sig) => (nightExit = { code, sig }));

const wanted = ["On this PC:", "On your network:", `cloudflared tunnel --url http://127.0.0.1:${PORT}`];
const t0 = Date.now();
while (!wanted.every((w) => out.includes(w))) {
  if (nightExit) fail(`night exited early (${JSON.stringify(nightExit)}):\n${out}`);
  if (Date.now() - t0 > 120_000) fail(`join lines not printed within 120 s:\n${out}`);
  await sleep(200);
}
console.log(`join lines printed after ${((Date.now() - t0) / 1000).toFixed(1)} s`);

hostPids = hostsOf(night.pid);
if (hostPids.length !== 1) fail(`expected 1 host child of night, found ${hostPids.length}`);

const page = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(5000) });
const html = await page.text();
if (!html.includes("<title>Emberisle</title>")) fail("GET / has no <title>Emberisle</title>");

const peek = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const timer = setTimeout(() => reject(new Error("no peek reply within 5 s")), 5000);
  ws.onopen = () => ws.send(JSON.stringify({ type: "peek", code: "ZZZZ" }));
  ws.onmessage = (e) => { clearTimeout(timer); ws.close(); resolve(JSON.parse(String(e.data))); };
  ws.onerror = () => { clearTimeout(timer); reject(new Error("socket error")); };
}).catch((e) => fail(e.message));
const reply = await peek();
// The host answers a peek at an unknown table with an empty seat list, not an error (server/host.mjs peek()).
if (reply.type !== "seats" || reply.code !== "ZZZZ" || reply.seats.length !== 0) {
  fail(`peek reply was ${JSON.stringify(reply)}, expected an empty seats list for ZZZZ`);
}

// #321: the host dies mid-game. night must spawn a new one at once (no rebuild), on the same port,
// print the join lines again, and the new host must serve the page and answer a socket.
const firstHost = hostPids[0];
const outBefore = out.length;
process.kill(firstHost, "SIGKILL");
const t2 = Date.now();
let secondHost;
while (!secondHost) {
  if (nightExit) fail(`night exited with the host (${JSON.stringify(nightExit)}):\n${out.slice(outBefore)}`);
  if (Date.now() - t2 > 10_000) fail(`no new host under night 10 s after kill -9:\n${out.slice(outBefore)}`);
  const live = hostsOf(night.pid).filter((pid) => pid !== firstHost);
  if (live.length > 1) fail(`${live.length} new hosts under night after one kill: ${live.join(",")}`);
  if (live.length === 1 && out.slice(outBefore).includes("On this PC:")) secondHost = live[0];
  else await sleep(100);
}
hostPids.push(secondHost);
const restarted = out.slice(outBefore);
if (!restarted.includes("restarting (1/5)")) fail(`night stdout after kill -9 lacks "restarting (1/5)":\n${restarted}`);
if (!restarted.includes(`cloudflared tunnel --url http://127.0.0.1:${PORT}`)) fail(`join lines not reprinted on ${PORT}:\n${restarted}`);
console.log(`host restarted after ${((Date.now() - t2) / 1000).toFixed(1)} s (pid ${firstHost} -> ${secondHost})`);

const page2 = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(5000) }).catch((e) => fail(`GET / after restart: ${e.message}`));
if (!(await page2.text()).includes("<title>Emberisle</title>")) fail("GET / after restart has no <title>Emberisle</title>");
const reply2 = await peek();
if (reply2.type !== "seats" || reply2.code !== "ZZZZ") fail(`peek after restart was ${JSON.stringify(reply2)}`);

night.kill(WIN ? "SIGTERM" : "SIGINT");
const t1 = Date.now();
while (Date.now() - t1 < 5000) {
  const alive = hostPids.filter((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } });
  if (alive.length === 0 && nightExit) break;
  await sleep(100);
}
const left = hostPids.filter((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } });
if (left.length) fail(`host still alive 5 s after SIGINT: ${left.join(",")}`);
if (!nightExit) fail("night still running 5 s after SIGINT");

clearTimeout(watchdog);
console.log("night ok");
