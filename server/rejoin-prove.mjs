// A dropped player sits back down in their own seat (#195, docs/research/rejoin.md).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const GRACE = 800;
const HOLD = 2500;
const PING = 300;
// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", GRACE_MS: String(GRACE), HOLD_MS: String(HOLD), PING_MS: String(PING), ROOMS_DIR },
});
const port = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
});

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  host.kill();
  process.exit(1);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function client(name, opts) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, opts);
  const c = { name, ws, inbox: [], waiters: [], state: null };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "state") c.state = msg;
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  // The first message of `type` that passes `ok`, waiting up to `ms`.
  c.next = async (type, ok = () => true, ms = 3000) => {
    const until = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex((m) => m.type === type && ok(m));
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      const left = until - Date.now();
      if (left <= 0) fail(`${name} waited for ${type}`);
      await new Promise((res) => {
        c.waiters.push(res);
        setTimeout(res, left);
      });
    }
  };
  c.close = () => new Promise((res) => (ws.readyState === ws.CLOSED ? res() : (ws.once("close", res), ws.close())));
  await new Promise((res) => ws.on("open", res));
  return c;
}

const a = await client("Ember");
const b = await client("Tide");
const c = await client("Pine");
a.send({ type: "hello", name: "Ember" });
const wa = await a.next("welcome");
const code = wa.code;
if (!/^[0-9a-f]{32}$/.test(wa.secret ?? "")) fail("welcome carries a 32-hex secret", wa.secret);
b.send({ type: "hello", code, name: "Tide" });
c.send({ type: "hello", code, name: "Pine" });
const wb = await b.next("welcome");
const wc = await c.next("welcome");
if (new Set([wa.secret, wb.secret, wc.secret]).size !== 3) fail("each seat has its own secret");
for (const x of [a, b, c]) x.send({ type: "ready", value: true });
await wait(100);
a.send({ type: "start" });
await Promise.all([a.next("state"), b.next("state"), c.next("state")]);
const pid = a.state.you;
if (a.state.game.current !== pid) fail("expected Ember to place first", a.state.game.current);
const seq = b.state.game.seq;
console.log(`table ${code}: 3 seats, Ember (${pid}) places first, seq ${seq}`);

// 1. Ember drops on her turn. Within the grace the table waits and nobody plays her seat.
await a.close();
const away = await b.next("seats", (m) => m.seats.some((s) => s.id === wa.you && s.away));
b.inbox = b.inbox.filter((m) => m.type !== "state");
await wait(GRACE / 2);
if (b.inbox.some((m) => m.type === "state")) fail("the table moved during the grace", b.inbox.filter((m) => m.type === "state").length);
if (!away.seats.find((s) => s.id === wa.you).away) fail("seat list marks Ember away");
console.log(`within the grace: Ember is away, no state pushed, seq still ${b.state.game.seq}`);

// 2. She comes back with her secret: the same seat, the same player, and the game state.
const a2 = await client("Ember again");
a2.send({ type: "hello", code: code.toLowerCase(), secret: wa.secret });
const back = await a2.next("welcome");
const st = await a2.next("state");
if (back.you !== wa.you || st.you !== pid || st.game.seq !== seq) fail("rejoin keeps the seat", { you: back.you, pid: st.you, seq: st.game.seq });
if (st.game.players.find((p) => p.id === pid).kind !== "human") fail("still human after a rejoin inside the grace");
await wait(GRACE + 100);
if (a2.state.game.current !== pid) fail("the bot took over after the rejoin", a2.state.game.current);
console.log(`rejoin: welcome you=${back.you}, state you=${st.you}, seq ${st.game.seq}; the grace timer was cancelled`);

// 3. A second socket with the same secret while the first is live is refused.
const dup = await client("Ember twin");
dup.send({ type: "hello", code, secret: wa.secret });
const taken = await dup.next("error");
if (taken.message !== "Seat is taken.") fail("second socket on a live seat", taken.message);
await dup.close();
console.log(`same secret on a live seat: "${taken.message}"`);

// 4. A wrong secret gets nothing.
const wrong = await client("Stranger");
wrong.send({ type: "hello", code, secret: "0".repeat(32) });
const gone = await wrong.next("error");
if (gone.message !== "Seat is gone.") fail("wrong secret", gone.message);
await wrong.close();

// 5. She drops again and stays gone past the grace: the bot plays her seat and the game moves on.
await a2.close();
const moved = await b.next("state", (m) => m.game.players.find((p) => p.id === pid).kind === "bot", GRACE + 2000);
if (moved.game.current === pid) fail("the bot did not play Ember's turn", moved.game.current);
console.log(`past the grace: ${pid} is a bot, play moved to ${moved.game.current}`);

// 6. She returns after the bot took over: the seat is hers again, with her name.
const a3 = await client("Ember late");
a3.send({ type: "hello", code, secret: wa.secret });
await a3.next("welcome");
const mine = (await a3.next("state")).game.players.find((p) => p.id === pid);
if (mine.kind !== "human" || mine.name !== "Ember") fail("human and name restored", mine);
console.log(`late rejoin: ${pid} is ${mine.kind} again, named ${mine.name}`);

// 7. Every socket drops at once (a tunnel restart). The room survives and a seat comes back.
await Promise.all([a3.close(), b.close(), c.close()]);
await wait(GRACE + 100);
const b2 = await client("Tide again");
b2.send({ type: "hello", code, secret: wb.secret });
const bw = await b2.next("welcome");
const bs = await b2.next("state");
if (bw.you !== wb.you) fail("Tide's seat after all sockets closed", bw.you);
console.log(`all sockets closed for ${GRACE + 100} ms: room ${code} survived, Tide rejoined at seq ${bs.game.seq}`);

// 8. Past the hold the seat is let go: Pine's secret no longer opens it.
await wait(HOLD + 200);
const c2 = await client("Pine late");
c2.send({ type: "hello", code, secret: wc.secret });
const late = await c2.next("error");
if (late.message !== "Seat is gone.") fail("seat after the hold", late.message);
console.log(`past the hold: "${late.message}"`);

// 9. Keepalive (#202, #113): a socket that stops answering pings (a locked phone, a half-open socket)
// is cut within two intervals and its seat held; sockets that answer stay seated; the rejoin then works.
{
  // Reed connects last, right before ready/start, so setup does not race his first ping interval.
  const y = await client("Moss");
  const z = await client("Fern");
  y.send({ type: "hello", name: "Moss" });
  const wy = await y.next("welcome");
  z.send({ type: "hello", code: wy.code, name: "Fern" });
  await z.next("welcome");
  const x = await client("Reed", { autoPong: false });
  x.send({ type: "hello", code: wy.code, name: "Reed" });
  const wx = await x.next("welcome");
  for (const s of [x, y, z]) s.send({ type: "ready", value: true });
  await wait(100);
  y.send({ type: "start" });
  await Promise.all([x.next("state"), y.next("state"), z.next("state")]);
  const t0 = Date.now();
  await y.next("log", (m) => m.text === "Reed lost connection.", 2 * PING + 500);
  const took = Date.now() - t0;
  // The host's terminate() reaches Reed's side a moment after the log reaches Moss: wait for his close, bounded.
  if (x.ws.readyState !== WebSocket.CLOSED) await Promise.race([new Promise((r) => x.ws.once("close", r)), wait(1000)]);
  if (x.ws.readyState !== WebSocket.CLOSED && x.ws.readyState !== WebSocket.CLOSING) fail("the silent socket is cut", x.ws.readyState);
  await wait(3 * PING);
  if (y.ws.readyState !== WebSocket.OPEN || z.ws.readyState !== WebSocket.OPEN) fail("sockets that answer pings stay open");
  if (y.inbox.some((m) => m.type === "log" && /^(Moss|Fern) (lost connection|left)/.test(m.text))) fail("an answering seat was dropped", y.inbox.filter((m) => m.type === "log"));
  const x2 = await client("Reed again");
  x2.send({ type: "hello", code: wx.code, secret: wx.secret });
  const xb = await x2.next("welcome");
  if (xb.you !== wx.you) fail("rejoin after the keepalive cut", xb.you);
  console.log(`keepalive: silent socket cut after ${took} ms (ping ${PING} ms), answering seats kept for ${3 * PING} ms more, Reed rejoined as ${xb.you}`);
}

host.removeAllListeners("exit");
host.kill();
console.log("rejoin prove ok");
process.exit(0);
