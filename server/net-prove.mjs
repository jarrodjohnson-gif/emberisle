// #79: three src/lib/net/table.ts clients play setup through host.mjs using rules Actions and the host's legal lists.
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { connectTable, toIntent } from "../src/lib/net/table.ts";

let host;
function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host?.kill();
  process.exit(1);
}

if (toIntent({ type: "offerTrade", to: "p1", give: {}, want: {} }) !== null) fail("offerTrade should be host-run");
if (toIntent({ type: "bankTrade", give: "wool", want: "ore" }).take !== "ore") fail("bankTrade take");

host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0" },
});
const port = await new Promise((resolve) => host.stdout.on("data", (d) => {
  const m = String(d).match(/listening (\d+)/);
  if (m) resolve(Number(m[1]));
}));
const url = `ws://127.0.0.1:${port}`;

function player(name) {
  const p = { name, state: null, legal: null, code: null, errors: [] };
  p.t = connectTable(url, {
    welcome: (m) => (p.code = m.code),
    state: (m) => {
      p.state = m.game;
      p.legal = m.legal;
      p.you = m.you;
    },
    error: (e) => p.errors.push(e),
  }, WebSocket);
  return p;
}
const until = async (cond, what) => {
  for (let i = 0; i < 100; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  fail(`timed out: ${what}`);
};

const [a, b, c] = [player("Ember"), player("Tide"), player("Pine")];
a.t.open({ name: "Ember" }); // queued until the socket opens
await until(() => a.code, "welcome");
b.t.join(a.code.toLowerCase(), { name: "Tide" });
c.t.join(a.code, { name: "Pine" });
await until(() => b.code && c.code, "joins");
for (const p of [a, b, c]) p.t.ready(true);
await new Promise((r) => setTimeout(r, 100));
a.t.start();
await until(() => a.state && b.state && c.state, "start");

for (let step = 0; step < 12; step++) {
  const p = [a, b, c].find((x) => x.state.current === x.you);
  const seq = p.state.seq;
  if (p.state.phase === "setupSettle") p.t.act({ type: "setupSettle", vertexId: p.legal.outpost[0] });
  else p.t.act({ type: "setupRoad", edgeId: p.legal.path[0] });
  await until(() => [a, b, c].every((x) => x.state.seq > seq), `step ${step}`);
}
const phases = [a, b, c].map((x) => x.state.phase);
const seqs = new Set([a, b, c].map((x) => x.state.seq));
if (phases.some((ph) => ph !== "roll") || seqs.size !== 1) fail("setup did not end together", { phases, seqs: [...seqs] });
const errs = [a, b, c].flatMap((x) => x.errors);
if (errs.length) fail("errors", errs);
console.log(`3 table.ts clients finished setup via the host: phase roll, seq ${[...seqs][0]}`);
[a, b, c].forEach((p) => p.t.close());
host.kill();
console.log("net prove ok");
process.exit(0);
