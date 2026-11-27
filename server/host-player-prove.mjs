// Server proof for #944: one live table per host player, not one per host server.
// A real host.mjs, real sockets. The player is the verified profile, or the host tags the host gave this browser in its
// welcomes (src/lib/net/table.ts sends them back on a new table). Checks:
// - two different players each open a table, and both open tables are listed;
// - the same player's second create is refused with "You're already hosting a table.", open or private, and opens nothing;
// - after a handoff the leaver may open a new one, and the new host may not;
// - a guest seat's tag, a finished game and a table with nobody connected never block;
// - junk tags are ignored, and a tag never sits anyone down;
// - a signed-in profile is refused on a fresh device with no tags, and is not blocked by another profile's table.
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
import { hostTags } from "../src/lib/net/host-tags.ts";
import { connectTable } from "../src/lib/net/table.ts";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-host-player-"));
const PROFILES_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-host-player-profiles-"));
let host;
const sockets = new Set();
process.on("exit", () => {
  host?.kill("SIGKILL");
  for (const ws of sockets) ws.terminate();
  rmSync(ROOMS_DIR, { recursive: true, force: true });
  rmSync(PROFILES_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
setTimeout(() => fail("the proof ran past 120 s"), 120_000).unref();

let passed = 0;
function fail(why, extra) {
  console.log("FAIL", why, extra === undefined ? "" : JSON.stringify(extra));
  process.exit(1);
}
function check(why, ok, extra) {
  if (!ok) fail(why, extra);
  passed++;
  console.log("ok", why);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REFUSED = "You're already hosting a table.";

// Two signed-in profiles, written into the store before the host starts (the method profile-seat-prove documents).
function seedProfile(doc, login, displayName) {
  const id = randomUUID();
  const salt = randomBytes(16);
  const now = Date.now();
  doc.profiles[id] = {
    id, displayName, login, color: PLAYER_COLORS[1], backupColor: PLAYER_COLORS[0], catchphrase: "", winSongId: null, mediaKey: null, createdAt: now, updatedAt: now,
    pin: { alg: "scrypt", N: 16384, r: 8, p: 1, salt: salt.toString("base64"), hash: scryptSync("4821", salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64") },
    guard: { times: [], pending: {}, lifetime: 0 },
  };
  doc.logins[login] = id;
  const device = () => {
    const token = randomBytes(32).toString("base64url");
    doc.devices[createHash("sha256").update(token).digest("hex")] = { profileId: id, createdAt: now, expiresAt: now + 86_400_000 };
    return token;
  };
  return { id, credential: device(), second: device() };
}
const seed = { schemaVersion: 1, profiles: {}, logins: {}, reservedLogins: {}, tombstones: {}, devices: {}, unknownLogins: {} };
const EMBER = seedProfile(seed, "emberlogin", "Ember");
const TIDE = seedProfile(seed, "tidelogin", "Tide");
writeFileSync(path.join(PROFILES_DIR, "profiles.json"), JSON.stringify(seed));

const boot = () => new Promise((resolve, reject) => {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, PROFILES_DIR, PROFILES_DEV: "", SAVE_MS: "9999999", LOBBY_HOLD_MS: "30000", OPEN_CAP: "1000", OPEN_IP_CAP: "1000" },
  });
  let log = "";
  host.stderr.on("data", (d) => (log += d));
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (c) => reject(new Error(`host exited ${c}: ${log}`)));
});
let port = await boot();

// Every socket comes through the tunnel from its own address, so profile credentials are accepted (https) and no per-IP
// limit is shared between players.
let nextIp = 10;
const TUNNEL = "isle-demo.trycloudflare.com";
async function client() {
  const headers = { origin: `https://${TUNNEL}`, host: TUNNEL, "cf-connecting-ip": `10.9.${nextIp++}.1`, "x-forwarded-proto": "https" };
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
  sockets.add(ws);
  const c = { ws, inbox: [], waiters: [] };
  ws.on("message", (raw) => {
    c.inbox.push(JSON.parse(String(raw)));
    for (const w of c.waiters.splice(0)) w();
  });
  ws.on("error", () => {});
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.next = async (ok, why, ms = 5000) => {
    const until = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex(ok);
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      const left = until - Date.now();
      if (left <= 0) fail(`waited for ${why}`);
      await new Promise((res) => (c.waiters.push(res), setTimeout(res, left)));
    }
  };
  c.reply = () => c.next((m) => m.type === "welcome" || m.type === "error", "welcome or error");
  c.drop = () => new Promise((res) => (ws.readyState === ws.CLOSED ? res() : (ws.once("close", res), ws.terminate())));
  await new Promise((res) => ws.once("open", res));
  return c;
}
const tables = async () => (await fetch(`http://127.0.0.1:${port}/tables`)).json();

// A browser: the tags it was given, sent back on every new table, as table.ts does.
function browser(name) {
  const b = { name, tags: [] };
  b.open = async (extra = {}) => {
    const c = await client();
    c.send({ type: "hello", name, hostTags: b.tags, ...extra });
    const m = await c.reply();
    if (m.type === "welcome") b.tags.unshift(m.hostTag);
    return { c, m };
  };
  b.join = async (code) => {
    const c = await client();
    c.send({ type: "hello", code, name });
    const m = await c.reply();
    if (m.type === "welcome") b.tags.unshift(m.hostTag);
    return { c, m };
  };
  return b;
}

// --- Two players, two tables --------------------------------------------------------------------------------------------
const ada = browser("Ada");
const bea = browser("Bea");
const a1 = await ada.open({ visibility: "open" });
check("Ada opens an open table", a1.m.type === "welcome" && a1.m.host === true, a1.m);
check("the welcome carries a host tag that is not the seat secret", /^[0-9a-f]{32}$/.test(a1.m.hostTag) && a1.m.hostTag !== a1.m.secret && !a1.m.secret.includes(a1.m.hostTag), a1.m);
const b1 = await bea.open({ visibility: "open" });
check("Bea, a different player, opens a second open table on the same host", b1.m.type === "welcome" && b1.m.code !== a1.m.code, b1.m);
let list = await tables();
check("both open tables are listed at once", list.length === 2 && list.some((t) => t.code === a1.m.code) && list.some((t) => t.code === b1.m.code), list);

// --- The same player's second table --------------------------------------------------------------------------------------
const a2 = await ada.open({ visibility: "open" });
check("Ada's second open create is refused, and says why", a2.m.type === "error" && a2.m.message === REFUSED, a2.m);
const a3 = await ada.open();
check("Ada's second private create is refused too", a3.m.type === "error" && a3.m.message === REFUSED, a3.m);
list = await tables();
check("a refused create lists nothing", list.length === 2, list);
const a2again = { c: a2.c };
a2again.c.send({ type: "hello", code: b1.m.code, name: "Ada" });
check("a refused socket can still sit down at another table", (await a2again.c.reply()).type === "welcome");
await a2again.c.drop();
await a3.c.drop();
const legacy = await client();
legacy.send({ type: "hello", name: "Ada" });
check("a page from before #944 sends no tags and still opens a table", (await legacy.reply()).type === "welcome");
await legacy.drop();
await wait(100);

// --- Tags are only ever a refusal ----------------------------------------------------------------------------------------
const thief = await client();
thief.send({ type: "hello", code: a1.m.code, secret: a1.m.hostTag });
const stolen = await thief.reply();
check("a host tag used as a seat secret sits nobody down", stolen.type === "error", stolen);
await thief.drop();
for (const [why, hostTags] of [["a string", a1.m.hostTag], ["numbers", [1, 2, 3]], ["objects", [{ t: a1.m.hostTag }]], ["a made-up tag", ["0".repeat(32)]]]) {
  const junk = browser("Junk");
  const r = await junk.open({ hostTags });
  check(`junk tags (${why}) are ignored and the create succeeds`, r.m.type === "welcome", r.m);
  await r.c.drop();
}
// The tag list is read only so far: Ada's real tag after eight junk ones does not refuse.
const padded = await client();
padded.send({ type: "hello", name: "Pad", hostTags: [...Array(8).fill("f".repeat(32)), a1.m.hostTag] });
check("only the first eight tags are read", (await padded.reply()).type === "welcome");
await padded.drop();

// --- A guest seat never blocks ---------------------------------------------------------------------------------------------
const cy = browser("Cy");
const cyGuest = await cy.join(a1.m.code);
check("Cy sits down at Ada's table as a guest", cyGuest.m.type === "welcome" && cyGuest.m.host === false, cyGuest.m);
const cyOwn = await cy.open();
check("a guest seat's tag does not stop Cy opening a table", cyOwn.m.type === "welcome", cyOwn.m);
await cyOwn.c.drop();
await wait(100);

// --- Handoff --------------------------------------------------------------------------------------------------------------
a1.c.send({ type: "leave" });
await cyGuest.c.next((m) => m.type === "seats" && m.seats.some((x) => x.id === cyGuest.m.you && x.host), "Cy becomes the host");
const a4 = await ada.open({ visibility: "open" });
check("after Ada leaves and the host seat passes on, Ada may open a new table", a4.m.type === "welcome", a4.m);
const cy2 = await cy.open();
check("Cy, who now holds Ada's old host seat, can't open another", cy2.m.type === "error" && cy2.m.message === REFUSED, cy2.m);
await cy2.c.drop();
const a5 = await ada.open();
check("and Ada, hosting again, is refused again", a5.m.type === "error" && a5.m.message === REFUSED, a5.m);
await a5.c.drop();

// --- Nobody connected, or a finished game, frees the player ----------------------------------------------------------------
await b1.c.drop();
await wait(150);
const b2 = await bea.open({ visibility: "open" });
check("a table with nobody connected does not block its host", b2.m.type === "welcome", b2.m);
list = await tables();
check("the abandoned table left the list and the new one is on it", !list.some((t) => t.code === b1.m.code) && list.some((t) => t.code === b2.m.code), list);
await b2.c.drop();
await wait(150);

// --- Profiles -------------------------------------------------------------------------------------------------------------
const e1 = await client();
e1.send({ type: "hello", name: "Ember", credential: EMBER.credential, visibility: "open" });
const ew = await e1.reply();
check("Ember, signed in, opens a table", ew.type === "welcome", ew);
const e2 = await client();
e2.send({ type: "hello", name: "Ember", credential: EMBER.second });
const er = await e2.reply();
check("Ember on a second device, with no tags, is refused by her profile", er.type === "error" && er.message === REFUSED, er);
await e2.drop();
const t1 = await client();
t1.send({ type: "hello", name: "Tide", credential: TIDE.credential, hostTags: [] });
check("Tide, another profile, is not blocked by Ember's table", (await t1.reply()).type === "welcome");
await t1.drop();
await e1.drop();
await wait(150);
const e3 = await client();
e3.send({ type: "hello", name: "Ember", credential: EMBER.second });
check("once nobody is at Ember's table, her profile may open another", (await e3.reply()).type === "welcome");
await e3.drop();

// --- The browser's side: host-tags.ts keeps each welcome's tag for that host, and a new table sends them back ---------------
// The real connectTable over a real socket, wired as store.ts wires it, with an in-memory localStorage for the browser's.
// scripts/open-table-prove.mjs checks the same in a real browser.
const shelf = new Map();
globalThis.localStorage = { getItem: (k) => shelf.get(k) ?? null, setItem: (k, v) => shelf.set(k, String(v)), removeItem: (k) => shelf.delete(k) };
async function page(url) {
  const got = [];
  const welcome = (m) => (hostTags(url, m.hostTag), got.push({ type: "welcome", ...m }));
  const t = connectTable(url, { welcome, error: (message) => got.push({ type: "error", message }) }, WebSocket);
  t.open({ name: "Hal" }, { visibility: "private", hostTags: hostTags(url) });
  for (const until = Date.now() + 5000; !got.length; await wait(20)) if (Date.now() > until) fail(`${url} never answered`);
  return { t, m: got[0] };
}
const here = `ws://127.0.0.1:${port}`;
const p1 = await page(here);
check("a page opens a table and keeps its host tag for this host", p1.m.type === "welcome" && hostTags(here)[0] === p1.m.hostTag, { m: p1.m, shelf: [...shelf] });
const p2 = await page(here);
check("the same browser's second page sends the tag back and is refused", p2.m.type === "error" && p2.m.message === REFUSED, p2.m);
p2.t.close();
const elsewhere = `ws://localhost:${port}`;
check("tags are kept per host: none are sent to a host that gave none", hostTags(elsewhere).length === 0);
const p3 = await page(elsewhere);
check("so the same host under another address opens a table", p3.m.type === "welcome", p3.m);
p3.t.close();
for (const junk of ["not json", "{}", '[["x"],[1,2],null]']) {
  shelf.set("emberisle-host-tags", junk);
  check(`an unexpected tag store (${junk}) reads as no tags`, hostTags(here).length === 0);
}
for (let i = 0; i < 20; i++) hostTags(i % 2 ? here : elsewhere, `${i}`.padStart(32, "0"));
check("the store keeps sixteen tags, newest first, and gives at most eight per host", JSON.parse(shelf.get("emberisle-host-tags")).length === 16 && hostTags(here).length === 8 && hostTags(here)[0] === "19".padStart(32, "0"));
hostTags(here, "x".repeat(65));
check("an overlong tag is not kept", !hostTags(here).includes("x".repeat(65)));
shelf.delete("emberisle-host-tags");
const p4 = await page(here);
check("a page whose store lost its tags opens a table", p4.m.type === "welcome", p4.m);
p4.t.close();
p1.t.close();
delete globalThis.localStorage;
const p5 = await page(here);
check("a page with no storage at all still opens a table", p5.m.type === "welcome", p5.m);
p5.t.close();

// --- A finished game frees its host, even while the host is still connected -------------------------------------------------
// A real finished game, from the engine, restored from a room file (open-table-prove's recovery fixture, kept short).
host.kill("SIGKILL");
await new Promise((r) => host.once("exit", r));
let game = createGame({ humans: [{ name: "Fin" }, { name: "Gil" }], bots: 1, seed: 55 });
for (let i = 0; i < 60 && game.phase !== "roll"; i++) {
  const result = applyAction(game, game.current, chooseBotAction(game, game.current));
  if (result.error) fail("finished-game fixture setup", result.error);
  game = result.state;
}
game = { ...game, phase: "over", winner: "p0" };
const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `finished-${p.id}`, ...(p.kind === "bot" ? { bot: true } : {}) }));
const [finSeat, gilSeat] = seats.filter((x) => !x.bot);
writeFileSync(path.join(ROOMS_DIR, "DONE.json"), JSON.stringify({ code: "DONE", host: finSeat.id, next: 3, visibility: "private", chat: [], chatSeq: 0, game, seats, shape: 2, savedAt: Date.now() }));
port = await boot();
const fin = await client();
fin.send({ type: "hello", code: "DONE", secret: finSeat.secret });
const fw = await fin.reply();
check("the host of a finished game rejoins it and is still its host", fw.type === "welcome" && fw.host === true && /^[0-9a-f]{32}$/.test(fw.hostTag ?? ""), fw);
const finNew = await client();
finNew.send({ type: "hello", name: "Fin", hostTags: [fw.hostTag] });
check("a finished game does not block its connected host", (await finNew.reply()).type === "welcome");
console.log(`host-player-prove: ${passed} checks passed`);
process.exit(0);
