// #242: start two proofs, SIGTERM each mid-run, and count the host.mjs processes they leave behind. Expect 0.
// Not in CI: it kills proofs on purpose. Run it with `npm run orphan-check`.
import { spawn, execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = () =>
  execFileSync("ps", ["-eo", "pid,ppid,args"], { encoding: "utf8" })
    .split("\n")
    .slice(1)
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m) => m && /host\.mjs/.test(m[3]) && !/orphan-check|\bps\b/.test(m[3]))
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]) }));

const before = new Set(ps().map((p) => p.pid));
const proofs = [
  ["node", ["scripts/tabs-prove.mjs"]],
  ["node", ["--import", "./server/register.mjs", "server/table-prove.mjs"]],
].map(([cmd, args]) => spawn(cmd, args, { stdio: "ignore" }));

// Poll while the proofs run: a fast proof may finish (and clean up) before the 3 s mark.
const spawned = new Set();
for (let t = 0; t < 3000; t += 100) {
  for (const p of ps()) if (!before.has(p.pid)) spawned.add(p.pid);
  await sleep(100);
}
for (const p of proofs) p.kill("SIGTERM");
await sleep(2000);

const alive = ps().filter((p) => spawned.has(p.pid));
console.log(`hosts started ${spawned.size}, still alive ${alive.length}`);
for (const p of alive) {
  console.log("orphan", p.pid, "ppid", p.ppid);
  process.kill(p.pid, "SIGKILL");
}
process.exit(spawned.size > 0 && alive.length === 0 ? 0 : 1);
