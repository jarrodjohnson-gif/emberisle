// #196 review: src/lib/net/table.ts reconnect edge cases, against a fake socket (no host needed).
// A second tab on a live seat keeps the saved seat; a failed first dial sends one hello; a half-open
// old socket ("Seat is taken." after a drop) keeps the client backing off; actions queued while down are dropped.
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

function client() {
  const ev = { closed: [], reconnecting: [], errors: [] };
  const t = connectTable("ws://fake", {
    closed: (keep) => ev.closed.push(Boolean(keep)),
    reconnecting: (n) => ev.reconnecting.push(n),
    error: (m) => ev.errors.push(m),
  }, Fake);
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

console.log("reconnect prove ok");
process.exit(0);
