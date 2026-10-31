// Measures the unchanged rules host: RSS, CPU and disk with one 4-human table and one 1-human + 3-bot table.
// Run after npm ci, npm --prefix server ci: MEASURE_MS=900000 node --max-old-space-size=512 docs/design/free-deploy/measure-host.mjs .
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const repo = path.resolve(process.argv[2]);
const require = createRequire(path.join(repo, "server/package.json"));
const { WebSocket } = require("ws");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ember-measure-"));
const dirs = { ROOMS_DIR: "rooms", PROFILES_DIR: "profiles", RESULTS_DIR: "results" };
const env = { ...process.env, PORT: "0", TURN_MS: "400", GRACE_MS: "2000" };
for (const [k, v] of Object.entries(dirs)) env[k] = path.join(tmp, v);
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: path.join(repo, "server"), env, stdio: ["ignore", "pipe", "pipe"] });
process.on("exit", () => host.kill("SIGKILL"));
let port = await new Promise((res, rej) => {
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) res(Number(m[1])); });
  host.on("exit", (c) => rej(new Error("host exited " + c)));
});
const pid = host.pid;
const rss = () => Number(fs.readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/)[1]);
const hwm = () => Number(fs.readFileSync(`/proc/${pid}/status`, "utf8").match(/VmHWM:\s+(\d+)/)[1]);
const idle = rss();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1000);
const idle2 = rss();

let frames = 0, bytes = 0, chats = 0;
const errors = [];
async function client(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { name, ws, inbox: [], waiters: [], state: null, acted: -1, over: false };
  ws.on("message", (raw) => {
    frames++; bytes += raw.length;
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") { c.state = msg; if (msg.game.phase === "over") c.over = true; drive(c); }
    if (msg.type === "welcome" || msg.type === "seats") c.inbox.push(msg);
    if (msg.type === "error") errors.push(`${name}: ${msg.message}`);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (m) => ws.readyState === 1 && ws.send(JSON.stringify({ ...c.state?.actionStamp, cid: crypto.randomUUID(), ...m }));
  c.next = async (type, ok = () => true, ms = 5000) => {
    const until = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type && ok(m));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      if (Date.now() > until) throw new Error(`${name} waited for ${type}`);
      await new Promise((r) => { c.waiters.push(r); setTimeout(r, 200); });
    }
  };
  await new Promise((r) => ws.on("open", r));
  return c;
}
function drive(c) {
  const { legal, game } = c.state;
  if (!legal || c.acted === game.seq) return;
  let msg = null;
  if (legal.outpost?.length && game.phase === "setupSettle") msg = { type: "place", kind: "outpost", id: legal.outpost[0] };
  else if (legal.path?.length && game.phase === "setupRoad") msg = { type: "place", kind: "path", id: legal.path[0] };
  else if (legal.actions?.includes("roll")) msg = { type: "roll" };
  else if (legal.wayfarer?.length) { const h = legal.wayfarer.find((x) => legal.steal[x]) ?? legal.wayfarer[0]; msg = { type: "rob", hexId: h, stealFrom: legal.steal[h]?.[0] ?? null }; }
  else if (legal.outpost?.length && legal.actions?.includes("pass")) msg = { type: "place", kind: "outpost", id: legal.outpost[0] };
  else if (legal.path?.length && legal.actions?.includes("pass") && Math.random() < 0.5) msg = { type: "place", kind: "path", id: legal.path[0] };
  else if (legal.actions?.includes("pass")) msg = { type: "pass" };
  if (!msg) return;
  c.acted = game.seq;
  setTimeout(() => c.send(msg), 20);
}

// Table A: 4 humans.
const A = await Promise.all(["Ember", "Tide", "Pine", "Dune"].map(client));
A[0].send({ type: "hello", name: "Ember" });
const codeA = (await A[0].next("welcome")).code;
for (const x of A.slice(1)) { x.send({ type: "hello", code: codeA, name: x.name }); await x.next("welcome"); }
// Table B: 1 human + 3 bots.
const B = await client("Solo");
B.send({ type: "hello", name: "Solo" });
const codeB = (await B.next("welcome")).code;
for (let i = 0; i < 3; i++) { B.send({ type: "addBot" }); await wait(100); }
for (const x of [...A, B]) x.send({ type: "ready", value: true });
await A[0].next("seats", (m) => m.seats.length === 4 && m.seats.every((s) => s.ready));
await wait(300);
A[0].send({ type: "start" });
B.send({ type: "start" });
const all = [...A, B];
const chatTimer = setInterval(() => { const x = all[chats % all.length]; x.ws.send(JSON.stringify({ type: "chat", text: "gg " + chats })); chats++; }, 3000);

const t0 = Date.now();
const cpu0 = process.cpuUsage();
const readCpu = () => { const f = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" "); return (Number(f[11]) + Number(f[12])) * (1000 / Number(execSync("getconf CLK_TCK").toString())); };
const c0 = readCpu();
let peak = 0; const samples = [];
const LIMIT = Number(process.env.MEASURE_MS ?? 15 * 60 * 1000);
while (Date.now() - t0 < LIMIT && !(A[0].over && B.over)) {
  await wait(500);
  const r = rss(); peak = Math.max(peak, r); samples.push(r);
}
clearInterval(chatTimer);
const ms = Date.now() - t0;
const cpuMs = readCpu() - c0;
const du = (d) => execSync(`du -sb ${path.join(tmp, d)} 2>/dev/null || echo 0`).toString().split("\t")[0].trim();
const files = (d) => { try { return fs.readdirSync(path.join(tmp, d)).length; } catch { return 0; } };
console.log(`node ${process.version}, ${os.platform()} ${os.arch()}, ${os.cpus()[0].model}`);
console.log(`host RSS idle at boot: ${(idle / 1024).toFixed(1)} MB; idle after 1 s: ${(idle2 / 1024).toFixed(1)} MB`);
console.log(`tables: ${codeA} (4 humans, auto-play, TURN_MS 400) and ${codeB} (1 human + 3 bots); chat line every 3 s`);
console.log(`ran ${(ms / 1000).toFixed(1)} s; table A over: ${A[0].over}; table B over: ${B.over}; turn A ${A[0].state?.game.turn}, turn B ${B.state?.game.turn}`);
console.log(`host RSS during play: median ${(samples.sort((a, b) => a - b)[samples.length >> 1] / 1024).toFixed(1)} MB, peak sampled ${(peak / 1024).toFixed(1)} MB, kernel high-water ${(hwm() / 1024).toFixed(1)} MB`);
console.log(`host CPU: ${cpuMs.toFixed(0)} ms over ${(ms / 1000).toFixed(1)} s wall = ${((cpuMs / ms) * 100).toFixed(2)}% of one core`);
console.log(`errors from host: ${errors.length}; first: ${errors.slice(0, 3).join(" | ")}`);
console.log(`frames to clients: ${frames}, ${(bytes / 1024 / 1024).toFixed(2)} MB; chats sent ${chats}`);
for (const d of Object.values(dirs)) console.log(`disk ${d}/: ${du(d)} bytes, ${files(d)} files`);
host.kill("SIGTERM");
await wait(1000);
for (const d of Object.values(dirs)) console.log(`after SIGTERM ${d}/: ${du(d)} bytes, ${files(d)} files`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
