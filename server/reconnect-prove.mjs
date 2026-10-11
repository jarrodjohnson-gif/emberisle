// #196 review: src/lib/net/table.ts reconnect edge cases, against a fake socket (no host needed).
// A second tab on a live seat keeps the saved seat; a failed first dial sends one hello; a half-open
// old socket ("Seat is taken." after a drop) keeps the client backing off; actions queued while down are dropped.
// G7 (#528): the redials stop at the last call before the hold the welcome announced, lobby or game.
import { connectTable } from "../src/lib/net/table.ts";

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  process.exit(1);
}

const sockets = [];
class Fake {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.onopen = this.onmessage = this.onclose = null;
    sockets.push(this);
  }
  send(raw) {
    if (this.readyState !== 1) fail("sent on a socket that is not open", raw);
    this.sent.push(JSON.parse(raw));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.({}));
  }
  // Test side: the server opens, says something, or the network drops it.
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  reply(msg) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  lose() {
    this.close();
  }
}
const last = () => sockets[sockets.length - 1];
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const hellos = (s) => s.sent.filter((m) => m.type === "hello");

function client(giveUpMs) {
  const ev = { closed: [], reconnecting: [], errors: [] };
  const t = connectTable("ws://fake", {
    closed: (keep) => ev.closed.push(Boolean(keep)),
    reconnecting: (n) => ev.reconnecting.push(n),
    error: (m) => ev.errors.push(m),
  }, Fake, giveUpMs);
  return { t, ev };
}

// 1. A second tab rejoins a seat another tab is sitting in: it stops, and is told to keep the saved seat.
{
  const { t, ev } = client();
  t.rejoin("abcd", "s1");
  last().open();
  if (hellos(last()).length !== 1) fail("second tab: one hello", last().sent);
  last().reply({ type: "error", message: "Seat is taken." });
  await tick(10);
  if (ev.closed.join() !== "true" || ev.reconnecting.length) fail("second tab should stop and keep the seat", ev);
  console.log("second tab on a live seat: stops, keeps the saved seat");
}

// 2. The host is down when the page loads: the first dial fails, the redial sends exactly one hello.
{
  sockets.length = 0;
  const { t, ev } = client();
  t.rejoin("abcd", "s1");
  last().lose();
  await tick(10);
  if (ev.reconnecting.join() !== "1") fail("failed first dial should redial", ev);
  await tick(1100);
  if (sockets.length !== 2) fail("one redial after 1 s", sockets.length);
  last().open();
  const sent = last().sent;
  if (sent.length !== 1 || sent[0].type !== "hello" || sent[0].secret !== "s1") fail("redial after a failed first dial: one hello", sent);
  last().reply({ type: "welcome", code: "ABCD", you: "s1seat", host: false, secret: "s1" });
  t.close();
  console.log("failed first dial: the redial sends one hello");
}

// 3. A drop where the host still holds the old socket open: "Seat is taken." keeps it dialing, then it sits back down.
// 4. An action sent while the socket was down is not replayed after the rejoin.
{
  sockets.length = 0;
  const { t, ev } = client();
  t.join("abcd", { name: "Tide" });
  last().open();
  last().reply({ type: "welcome", code: "ABCD", you: "p1", host: false, secret: "s2" });
  last().lose();
  await tick(10);
  t.act({ type: "roll" }); // queued while down
  await tick(1100);
  last().open();
  if (hellos(last()).length !== 1 || last().sent.some((m) => m.type === "roll")) fail("redial sends only the rejoin hello", last().sent);
  last().reply({ type: "error", message: "Seat is taken." });
  await tick(10);
  if (ev.closed.length || ev.reconnecting.join() !== "1,2") fail("Seat is taken after a drop should keep backing off", ev);
  if (ev.errors.length) fail("the retry should not toast an error", ev.errors);
  await tick(2100);
  last().open();
  last().reply({ type: "welcome", code: "ABCD", you: "p1", host: false, secret: "s2" });
  if (sockets.length !== 3 || last().sent.some((m) => m.type === "roll")) fail("stale roll replayed", last().sent);
  console.log("drop with a half-open old socket: kept dialing, back in on try 2, stale roll not replayed");

  // 5. Later the seat is really gone: it gives up and forgets the seat.
  last().lose();
  await tick(1100);
  last().open();
  last().reply({ type: "error", message: "Seat is gone." });
  await tick(10);
  if (ev.closed.join() !== "false") fail("Seat is gone should give up and forget", ev);
  console.log("seat gone: gives up and forgets the seat");
}

// 6. The first dial fails, then every redial hears "Seat is taken." (another tab of ours is live): it gives up
// after the window, and keeps the saved seat so the live tab is not wiped. The window is 1.5 s here, not 10 min.
{
  sockets.length = 0;
  const { t, ev } = client(1500);
  t.rejoin("abcd", "s1");
  last().lose();
  await tick(10);
  await tick(1100);
  for (let i = 0; i < 2 && !ev.closed.length; i++) {
    last().open();
    last().reply({ type: "error", message: "Seat is taken." });
    await tick(2100);
  }
  if (ev.closed.join() !== "true") fail("a taken seat after a failed first dial should give up and keep the seat", ev);
  if (ev.errors.length) fail("the retries should not toast an error", ev.errors);
  console.log("failed first dial, then Seat is taken on every redial: gives up, keeps the saved seat");
}

// 7. #284: wake() dials at once during a backoff, once; it does nothing on a live, connecting, fresh or peek socket.
{
  sockets.length = 0;
  const { t, ev } = client();
  t.peek("abcd");
  t.wake();
  if (sockets.length !== 1) fail("wake on a connecting socket must not dial", sockets.length);
  last().open();
  t.wake();
  if (sockets.length !== 1) fail("wake on an open socket must not dial", sockets.length);
  last().lose();
  await tick(10);
  t.wake();
  if (sockets.length !== 1 || ev.reconnecting.length) fail("wake on a peek/fresh drop (no seat) must not dial", sockets.length);

  sockets.length = 0;
  const seated = client();
  seated.t.rejoin("abcd", "s1");
  seated.t.wake();
  if (sockets.length !== 1) fail("wake before any drop must not dial", sockets.length);
  last().open();
  last().reply({ type: "welcome", code: "ABCD", you: "s1seat", host: false, secret: "s1" });
  last().lose();
  await tick(10);
  if (seated.ev.reconnecting.join() !== "1") fail("seated drop should back off", seated.ev);
  seated.t.wake();
  if (sockets.length !== 2) fail("wake during the backoff should dial at once", sockets.length);
  seated.t.wake();
  if (sockets.length !== 2) fail("a second wake while the redial is connecting must not dial again", sockets.length);
  last().open();
  if (hellos(last()).length !== 1 || hellos(last())[0].secret !== "s1") fail("the woken redial sends one rejoin hello", last().sent);
  await tick(1100);
  if (sockets.length !== 2) fail("the cancelled backoff timer must not dial a second time", sockets.length);
  seated.t.close();
  console.log("wake: redials at once during a backoff, once; no-op otherwise");
}

// G1: stamp all gameplay, including trades, with a unique id and the state from this socket only.
{
  sockets.length = 0;
  const { t } = client();
  t.open({ name: "Ember" });
  last().open();
  last().reply({ type: "welcome", code: "ABCD", you: "p0", secret: "s1" });
  if (t.act({ type: "roll" })) fail("welcome alone must not authorize gameplay");
  const stamp = { turn: 3, baseSeq: 10, connection: "first-socket" };
  last().reply({ type: "state", actionStamp: stamp });
  if (!t.act({ type: "roll" })) fail("live stamped action was not sent");
  t.ask({ timber: 1 }, { clay: 1 });
  t.answer("t10-1", false);
  const intents = last().sent.filter((m) => ["roll", "tradeAsk", "tradeAnswer"].includes(m.type));
  if (intents.length !== 3 || new Set(intents.map((m) => m.cid)).size !== 3 || intents.some((m) => !m.cid || m.turn !== 3 || m.baseSeq !== 10 || m.connection !== stamp.connection)) fail("gameplay must carry distinct cids and the latest stamp", intents);
  last().lose();
  await tick(10);
  if (t.act({ type: "roll" })) fail("disconnected gameplay must be refused");
  t.ask({ timber: 1 }, { clay: 1 });
  t.answer("t10-1", true);
  t.wake();
  last().open();
  if (t.act({ type: "roll" })) fail("rejoin before welcome must not send gameplay");
  last().reply({ type: "welcome", code: "ABCD", you: "p0", secret: "s1" });
  if (t.act({ type: "roll" })) fail("rejoin before state must not send gameplay");
  if (last().sent.length !== 1 || last().sent[0].type !== "hello") fail("disconnected gameplay/trades must never be queued", last().sent);
  last().reply({ type: "state", actionStamp: { turn: 4, baseSeq: 15, connection: "second-socket" } });
  if (!t.act({ type: "roll" })) fail("fresh post-rejoin action must send");
  const fresh = last().sent.at(-1);
  if (fresh.baseSeq !== 15 || fresh.turn !== 4 || fresh.connection !== "second-socket" || intents.some((m) => m.cid === fresh.cid)) fail("fresh action used an old stamp or cid", fresh);
  t.close();
  console.log("G1 client: fresh stamps and unique cids on actions/trades; offline and pre-state gameplay never queued");
}

// G7 (#528): the redials follow the hold the welcome announced, measured from the drop. The last one lands 1 s before
// the host lets the seat go (`LAST_CALL_MS`), so a backoff step is cut short rather than reaching past the hold;
// a rejoin on that last call still sits back down. The lobby hold applies until a `state` says a game started.
{
  // Lobby: hold 2500 → dials at 1 s and 1.5 s (2 s step clamped), then gives up and forgets the seat.
  sockets.length = 0;
  const { t, ev } = client();
  t.join("abcd", { name: "Tide" });
  last().open();
  last().reply({ type: "welcome", code: "ABCD", you: "p1", host: false, secret: "s3", holdMs: 4000, lobbyHoldMs: 2500 });
  const t0 = Date.now();
  last().lose();
  await tick(1100);
  if (sockets.length !== 2) fail("lobby drop: redial at 1 s", sockets.length);
  last().lose();
  await tick(10);
  if (ev.closed.length) fail("gave up before the lobby hold's last call", ev);
  await tick(600);
  if (sockets.length !== 3) fail("the 2 s step should be cut to land at the last call", sockets.length);
  last().lose();
  await tick(10);
  const gaveUpAt = Date.now() - t0;
  if (ev.closed.join() !== "false" || ev.reconnecting.join() !== "1,2") fail("lobby hold spent: give up and forget", ev);
  if (gaveUpAt < 1400 || gaveUpAt >= 2500) fail("gave up outside [last call, lobby hold)", gaveUpAt);
  console.log(`lobby hold 2500 ms from the welcome: dialed at 1 s and 1.5 s, gave up at ${gaveUpAt} ms, before the hold`);
}
{
  // In a game: the same welcome, then a `state`, so the 4000 hold applies: dials at 1 s and 3 s (4 s step clamped).
  sockets.length = 0;
  const { t, ev } = client();
  t.join("abcd", { name: "Tide" });
  last().open();
  last().reply({ type: "welcome", code: "ABCD", you: "p1", host: false, secret: "s3", holdMs: 4000, lobbyHoldMs: 2500 });
  last().reply({ type: "state", actionStamp: { turn: 1, baseSeq: 1, connection: "c1" } });
  const t0 = Date.now();
  last().lose();
  await tick(1100);
  last().lose();
  await tick(1500);
  if (sockets.length !== 2 || ev.closed.length) fail("in a game the lobby hold must not apply", { sockets: sockets.length, ev });
  await tick(500);
  if (sockets.length !== 3) fail("the 4 s step should be cut to land at the last call", sockets.length);
  const dialedAt = Date.now() - t0;
  // A late close from the socket the redial replaced changes nothing.
  sockets[1].onclose({});
  await tick(10);
  if (sockets.length !== 3 || ev.reconnecting.join() !== "1,2") fail("a replaced socket's late close must be ignored", ev);
  // The last call reaches the host: the seat is kept.
  last().open();
  if (hellos(last()).length !== 1) fail("last call sends one rejoin hello", last().sent);
  last().reply({ type: "welcome", code: "ABCD", you: "p1", host: false, secret: "s3", holdMs: 4000, lobbyHoldMs: 2500 });
  if (ev.closed.length) fail("rejoin on the last call must keep the seat", ev);
  t.close();
  console.log(`game hold 4000 ms: last call dialed at ${dialedAt} ms, rejoin there kept the seat; a replaced socket's late close was ignored`);
}
{
  // An old host says nothing: the 10 min / 90 s defaults stand in, so the first redial is a plain 1 s step.
  sockets.length = 0;
  const { t, ev } = client();
  t.join("abcd", { name: "Tide" });
  last().open();
  last().reply({ type: "welcome", code: "ABCD", you: "p1", host: false, secret: "s4" });
  last().lose();
  await tick(1100);
  if (sockets.length !== 2 || ev.closed.length) fail("without hold fields the default window applies", { sockets: sockets.length, ev });
  t.close();
  console.log("welcome without hold fields: the default window applies");
}

console.log("reconnect prove ok");
process.exit(0);
