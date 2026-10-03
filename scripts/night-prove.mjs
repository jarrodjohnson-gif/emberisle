// #307: run `node scripts/night.mjs` as Jarrod does on game night. It must build, print the three
// join lines, serve the page and answer a socket, and on SIGINT leave no host behind.
// night.mjs only prints the cloudflared line; it never starts a tunnel, so nothing here needs stubbing.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

const reply = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const timer = setTimeout(() => reject(new Error("no peek reply within 5 s")), 5000);
  ws.onopen = () => ws.send(JSON.stringify({ type: "peek", code: "ZZZZ" }));
  ws.onmessage = (e) => { clearTimeout(timer); ws.close(); resolve(JSON.parse(String(e.data))); };
  ws.onerror = () => { clearTimeout(timer); reject(new Error("socket error")); };
}).catch((e) => fail(e.message));
// The host answers a peek at an unknown table with an empty seat list, not an error (server/host.mjs peek()).
if (reply.type !== "seats" || reply.code !== "ZZZZ" || reply.seats.length !== 0) {
  fail(`peek reply was ${JSON.stringify(reply)}, expected an empty seats list for ZZZZ`);
}

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
