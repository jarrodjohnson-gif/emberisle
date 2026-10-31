// Profile create, login, resume and logout on the real rules host (#762, docs/design/profiles.md).
// Every check goes through host.mjs's own sockets against a temporary private store; nothing here is a mocked adapter.
// Run from the repo root: node --import ./server/register.mjs server/profile-auth-prove.mjs
import { spawn } from "node:child_process";
import { scryptSync } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
const PROFILES_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-profiles-"));
const STORE = path.join(PROFILES_DIR, "profiles.json");
const hosts = new Set();
process.on("exit", () => {
  for (const h of hosts) h.proc.kill("SIGKILL");
  rmSync(ROOMS_DIR, { recursive: true, force: true });
  rmSync(PROFILES_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const SIGN_IN = "Couldn't sign in. Check your login and PIN, or try again later.";
const OWNER_KEYS = ["backupColor", "catchphrase", "color", "displayName", "login", "profileId", "winSongId"].join();
const PINS = new Set();
const CREDENTIALS = new Set();
const sockets = new Set();
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

async function startHost(env = {}, dir = PROFILES_DIR, observeHashes = false) {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", ...(observeHashes ? ["--import", "./profile-auth-observer.mjs"] : []), "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, PROFILES_DIR: dir, PROFILES_DEV: "", ...env },
    stdio: observeHashes ? ["ignore", "pipe", "pipe", "ipc"] : undefined,
  });
  const h = { proc, log: "", hashEvents: [] };
  proc.on("message", (message) => {
    if (message?.type === "profile-hash-proof") h.hashEvents.push(message);
  });
  h.hashUntil = (condition, why) => new Promise((resolve) => {
    const done = () => {
      if (!condition()) return;
      clearTimeout(timer);
      proc.off("message", done);
      resolve();
    };
    const timer = setTimeout(() => fail(`waited for ${why}`), 60000);
    proc.on("message", done);
    done();
  });
  h.hashControl = async (command) => {
    const from = h.hashEvents.length;
    proc.send({ type: "profile-hash-proof-control", command });
    await h.hashUntil(() => h.hashEvents.slice(from).some((e) => e.event === "ack" && e.command === command), command);
  };
  hosts.add(h);
  proc.stderr.on("data", (d) => (h.log += d));
  h.port = await new Promise((resolve, reject) => {
    proc.stdout.on("data", (d) => {
      const m = String(d).match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    proc.on("exit", (c) => reject(new Error(`host exited ${c}: ${h.log}`)));
  });
  h.stop = (signal = "SIGTERM") =>
    new Promise((res) => {
      for (const ws of sockets) ws.terminate();
      sockets.clear();
      proc.removeAllListeners("exit");
      proc.once("exit", () => (hosts.delete(h), res()));
      proc.kill(signal);
    });
  return h;
}

// A socket to `h` as a given kind of visitor. `tunnel` is cloudflared's loopback hop for that visitor address.
let nextIp = 10;
const TUNNEL = "isle-demo.trycloudflare.com";
function tunnel(ip = `10.${nextIp >> 8}.${nextIp++ & 255}.1`) {
  return { origin: `https://${TUNNEL}`, host: TUNNEL, "cf-connecting-ip": ip, "x-forwarded-proto": "https" };
}
async function client(h, headers = {}, localAddress) {
  const ws = new WebSocket(`ws://127.0.0.1:${h.port}`, { headers, localAddress });
  sockets.add(ws);
  const c = { ws, inbox: [], seen: [], waiters: [], state: null };
  ws.on("message", (raw) => {
    const text = String(raw);
    c.seen.push(text);
    const msg = JSON.parse(text);
    if (msg.type === "state") c.state = msg;
    c.inbox.push(msg);
    for (const w of c.waiters.splice(0)) w();
  });
  ws.on("error", () => {});
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.next = async (ok, ms = 60000, why = "a reply") => {
    const until = Date.now() + ms;
    for (;;) {
      const i = c.inbox.findIndex(ok);
      if (i >= 0) return c.inbox.splice(i, 1)[0];
      const left = until - Date.now();
      if (left <= 0) fail(`waited for ${why}`);
      await new Promise((res) => (c.waiters.push(res), setTimeout(res, left)));
    }
  };
  let n = 0;
  c.req = async (msg) => {
    const id = `r${++n}`;
    if (msg.pin) PINS.add(msg.pin);
    const t0 = Date.now();
    c.send({ ...msg, id });
    const reply = await c.next((m) => m.id === id, 120000, `${msg.type} ${id}`);
    reply.ms = Date.now() - t0;
    if (reply.credential) CREDENTIALS.add(reply.credential);
    return reply;
  };
  await new Promise((res, rej) => (ws.once("open", res), ws.once("unexpected-response", (_q, r) => rej(new Error(`upgrade ${r.statusCode}`)))));
  return c;
}
const store = () => JSON.parse(readFileSync(STORE, "utf8"));
const byLogin = (doc, login) => doc.profiles[doc.logins[login]];
const editStore = (fn) => {
  const doc = store();
  fn(doc);
  writeFileSync(STORE, JSON.stringify(doc));
};
const backdate = (login, ms) => editStore((d) => (byLogin(d, login).guard.times = byLogin(d, login).guard.times.map((t) => t - ms)));
const fields = (login, pin, over = {}) => ({ type: "profileCreate", displayName: login[0].toUpperCase() + login.slice(1), login, pin, pinConfirm: pin, color: "#2d6ee8", ...over });
const isErr = (r, code) => r.type === "profileError" && r.code === code;

// Guest play: host, join and a seat that rejoins with its secret, alongside the profile traffic below.
async function guestTable(h) {
  const a = await client(h);
  const b = await client(h);
  a.send({ type: "hello", name: "Ember" });
  const wa = await a.next((m) => m.type === "welcome", 5000, "host welcome");
  b.send({ type: "hello", code: wa.code, name: "Tide" });
  const wb = await b.next((m) => m.type === "welcome", 5000, "join welcome");
  return { a, b, wa, wb };
}

let h = await startHost({}, PROFILES_DIR, true);

// --- Capability and transport ---------------------------------------------------------------------------------------------
const plain = await client(h, { origin: `http://127.0.0.1:${h.port}` });
const hello = await plain.req({ type: "profileHello" });
check("profileHello advertises profilesV1 on the plain localhost link", hello.type === "profileHello" && hello.caps.includes("profilesV1"), hello);
check("plain production localhost is guest-only", hello.available === false && hello.reason === "https", hello);
check("a PIN over plain localhost is refused", isErr(await plain.req({ type: "profileLogin", login: "ember", pin: "4821" }), "https"));
check("plain localhost cannot create a profile", isErr(await plain.req(fields("nobody", "4821")), "https"));
check("a profile connection cannot open a table", (plain.send({ type: "hello", name: "Sneak" }), (await plain.next((m) => m.type === "error", 3000)).message === "not ready"));

const lan = await client(h, { origin: `http://192.168.1.20:${h.port}` }, "127.0.0.2");
check("direct same-Wi-Fi ws:// refuses credentials", isErr(await lan.req({ type: "profileResume", credential: "x".repeat(43) }), "https"));
const spoof = await client(h, tunnel(), "127.0.0.2");
check("a direct peer's spoofed cf-connecting-ip and X-Forwarded-Proto are ignored", (await spoof.req({ type: "profileHello" })).available === false);
check("spoofed headers cannot log in", isErr(await spoof.req({ type: "profileLogin", login: "ember", pin: "4821" }), "https"));
const { "x-forwarded-proto": _, ...noProto } = tunnel();
check("a tunnel hop without HTTPS evidence refuses credentials", isErr(await (await client(h, noProto)).req(fields("ember", "4821")), "https"));
check("a tunnel hop from another site's page is refused", isErr(await (await client(h, { ...tunnel(), origin: "https://evil.example" })).req(fields("ember", "4821")), "origin"));
const { origin: __, ...noOrigin } = tunnel();
check("no Origin header refuses credentials", (await (await client(h, noOrigin)).req({ type: "profileHello" })).available === false);

// --- Create, login, resume, logout ----------------------------------------------------------------------------------------
const guest = await guestTable(h);
const em = await client(h, tunnel());
check("the tunnel link offers profiles", (await em.req({ type: "profileHello" })).available === true);
const created = await em.req(fields("ember", "4821", { catchphrase: "Ember\u0007 burns ", displayName: "  Ember​  " }));
check("profileCreate returns a private profileSession", created.type === "profileSession" && /^[A-Za-z0-9_-]{43}$/.test(created.credential), created);
check("the session carries only the owner allowlist", Object.keys(created.profile).sort().join() === OWNER_KEYS, Object.keys(created.profile));
check("display text is cleaned and no song is assigned", created.profile.displayName === "Ember" && created.profile.catchphrase === "Ember burns" && created.profile.winSongId === null, created.profile);
check("a distinct backup colour is stored", created.profile.backupColor !== created.profile.color && created.profile.backupColor.startsWith("#"));
const cred1 = created.credential;
const emberId = created.profile.profileId;
check("the profile id is a UUID", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(emberId));
check("a mismatched PIN confirmation is invalid", isErr(await (await client(h, tunnel())).req(fields("ash", "1111", { pinConfirm: "1112" })), "invalid"));
check("a bad login shape is invalid", isErr(await (await client(h, tunnel())).req(fields("-no-", "1111")), "invalid"));
check("a colour off the palette is invalid", isErr(await (await client(h, tunnel())).req(fields("ash", "1111", { color: "#000000" })), "invalid"));

// Text caps count characters, including those outside the BMP; UTF-16 clipping must not halve these limits.
for (const [label, extra] of [["exact", 0], ["clipped", 1]]) {
  const login = `unicode-${label}`;
  const reply = await (await client(h, tunnel())).req(fields(login, "4821", {
    displayName: ` \u0007${"𠮷".repeat(16 + extra)}\u200b `,
    catchphrase: ` \u0000${"🚀".repeat(80 + extra)}\u200b `,
  }));
  check(`${label} Unicode text creates a profile`, reply.type === "profileSession");
  check(`${label} display name preserves sixteen complete characters`, reply.profile.displayName === "𠮷".repeat(16));
  check(`${label} catchphrase preserves eighty complete characters`, reply.profile.catchphrase === "🚀".repeat(80));
  const stored = byLogin(store(), login);
  check(`${label} cleaned text is durable`, stored.displayName === reply.profile.displayName && stored.catchphrase === reply.profile.catchphrase);
}
const beforeEmptyName = readFileSync(STORE, "utf8");
check("control-only display name cannot create a profile", isErr(await (await client(h, tunnel())).req(fields("empty-name", "4821", { displayName: " \u0007\u200b\n " })), "invalid"));
check("rejected empty name leaves the private file unchanged", readFileSync(STORE, "utf8") === beforeEmptyName);

// Two devices race for one login; a third spells it differently.
const racers = await Promise.all([1, 2, 3].map(() => client(h, tunnel())));
const race = await Promise.all([racers[0].req(fields("tide", "1357")), racers[1].req(fields("tide", "2468")), racers[2].req(fields("tide", "9999", { login: " TIDE " }))]);
check("concurrent creation keeps one login", race.filter((r) => r.type === "profileSession").length === 1 && race.filter((r) => isErr(r, "loginTaken")).length === 2, race.map((r) => r.code ?? r.type));
check("the store holds one tide", Object.values(store().profiles).filter((p) => p.login === "tide").length === 1);
check("Choose another login", race.find((r) => r.code === "loginTaken").message === "Choose another login.");

const em2 = await client(h, tunnel());
const login = await em2.req({ type: "profileLogin", login: "  Ember ", pin: "4821" });
check("profileLogin with the right PIN issues a second credential", login.type === "profileSession" && login.credential && login.credential !== cred1 && login.profile.profileId === emberId);
const cred2 = login.credential;
const resumed = await em2.req({ type: "profileResume", credential: cred1 });
check("profileResume returns the owner without a new credential", resumed.type === "profileSession" && !("credential" in resumed) && resumed.profile.profileId === emberId);
check("profileLogout answers", (await em2.req({ type: "profileLogout", credential: cred2 })).type === "profileLoggedOut");
check("the logged-out credential no longer resumes", isErr(await em2.req({ type: "profileResume", credential: cred2 }), "signedOut"));
check("the other device's credential still resumes", (await em2.req({ type: "profileResume", credential: cred1 })).type === "profileSession");
check("Signed out reads plainly", (await em2.req({ type: "profileResume", credential: "A".repeat(43) })).message === "Signed out on this device. Sign in again.");
// Object.prototype names are valid logins: they must read as unknown, then work as ordinary profiles once created.
for (const name of ["constructor", "Constructor", "tostring", "hasownproperty"]) {
  check(`login "${name}" before creation is an ordinary unknown login`, isErr(await (await client(h, tunnel())).req({ type: "profileLogin", login: name, pin: "1234" }), "signInFailed"));
}
check("a profile named constructor can be created", (await (await client(h, tunnel())).req(fields("constructor", "2580"))).type === "profileSession");
check("and signs in as Constructor", (await (await client(h, tunnel())).req({ type: "profileLogin", login: "Constructor", pin: "2580" })).profile?.login === "constructor");
check("the host is still serving after those names", (await (await client(h, tunnel())).req({ type: "profileResume", credential: cred1 })).type === "profileSession");

// Logout never touches a seat: the guest seat drops and comes back with its secret.
guest.b.ws.terminate();
await guest.a.next((m) => m.type === "log" && /lost connection/.test(m.text), 5000, "drop log");
const back = await client(h);
back.send({ type: "hello", code: guest.wa.code, secret: guest.wb.secret });
const rw = await back.next((m) => m.type === "welcome", 5000, "rejoin welcome");
check("a guest seat rejoins with its secret after a profile logout", rw.code === guest.wa.code && rw.you === guest.wb.you, rw);
check("a table socket cannot sign in", isErr(await guest.a.req({ type: "profileLogin", login: "ember", pin: "4821" }), "tableSocket"));

// --- Unknown logins, bounded hash work and queue overflow ---------------------------------------------------------------------
const pr = await client(h, tunnel());
const pineCred = (await pr.req(fields("pine", "8642"))).credential;
const dune = await (await client(h, tunnel())).req(fields("dune", "7531"));
const wrong = await (await client(h, tunnel())).req({ type: "profileLogin", login: "dune", pin: "0000" });
const unknown = await (await client(h, tunnel())).req({ type: "profileLogin", login: "nobody-here", pin: "0000" });
check("an unknown login and a wrong PIN give the same answer", isErr(wrong, "signInFailed") && isErr(unknown, "signInFailed") && wrong.message === SIGN_IN && unknown.message === SIGN_IN);
check("an unknown login costs a real derivation", unknown.ms > 0.5 * wrong.ms, { wrong: wrong.ms, unknown: unknown.ms });
check("an unknown login's failure is counted in its own bucket", store().unknownLogins["nobody-here"]?.times.length === 1);

const crowd = await Promise.all(Array.from({ length: 12 }, () => client(h, tunnel())));
await h.hashControl("hold-next");
const hashFrom = h.hashEvents.length;
const floodStarted = Date.now();
const requests = [];
const request = (i) => requests[i] = crowd[i].req({ type: "profileLogin", login: `ghost-${i}`, pin: "1234" });
for (let i = 0; i < 7; i++) request(i);
const reserved = (n) => Array.from({ length: n }, (_, i) => store().unknownLogins[`ghost-${i}`]).every((g) => g && Object.keys(g.pending).length === 1);
const awaitReserved = async (n) => {
  for (const until = Date.now() + 10000; !reserved(n) && Date.now() < until; await wait(5)) {}
  check(`${n} flood attempts are durably reserved before releasing native work`, reserved(n));
};
await awaitReserved(7);
for (let i = 7; i < 9; i++) { crowd[i].ws.pause(); request(i); }
await awaitReserved(9);
for (let i = 9; i < 12; i++) request(i);
await Promise.all(requests.slice(9));
await h.hashUntil(() => h.hashEvents.slice(hashFrom).some((e) => e.event === "held"), "the gated native call");
check("overflow replies arrive before any gated native derivation starts", !h.hashEvents.slice(hashFrom).some((e) => e.event === "start"));
await h.hashControl("release");
await h.hashUntil(() => h.hashEvents.slice(hashFrom).filter((e) => e.event === "finish").length === 9 && h.hashEvents.slice(hashFrom).filter((e) => e.event === "failureSent").length === 9, "all nine native completions and queued replies");
for (let i = 7; i < 9; i++) crowd[i].ws.resume();
const flood = await Promise.all(requests);
const busy = flood.filter((r) => isErr(r, "busy"));
check("one running plus eight queued derivations; the overflow is refused", busy.length === 3 && flood.filter((r) => isErr(r, "signInFailed")).length === 9, flood.map((r) => r.code));
const observed = h.hashEvents.slice(hashFrom);
const starts = observed.filter((e) => e.event === "start");
const finishes = observed.filter((e) => e.event === "finish");
check("native derivations never overlap", starts.length === 9 && finishes.length === 9 && starts.every((e, i) => e.active === 1 && finishes[i].id === e.id && finishes[i].active === 0 && (i === 0 || e.at >= finishes[i - 1].at)));
const done = finishes.map((e) => e.at - floodStarted);
check("overflow is refused before any derivation finishes", Math.max(...busy.map((r) => r.ms)) < done[0], { busy: busy.map((r) => r.ms), first: done[0] });
// Native completion times retain the original spacing threshold, unaffected by delayed client reads.
const gaps = done.slice(1).map((t, i) => t - done[i]);
const median = [...gaps].sort((x, y) => x - y)[gaps.length >> 1];
check("derivations run one at a time", Math.min(...gaps) >= 0.25 * median, { done, gaps });
console.log("native queue timing", JSON.stringify({ done, gaps, delayedClientReplies: flood.filter((r) => r.code === "signInFailed").map((r) => r.ms).sort((a, b) => a - b) }));

// --- Concurrent PIN budget reservations ---------------------------------------------------------------------------------------
const guessers = await Promise.all(Array.from({ length: 8 }, () => client(h, tunnel())));
const guesses = await Promise.all(guessers.map((c, i) => c.req({ type: "profileLogin", login: "pine", pin: String(1000 + i) })));
check("eight concurrent wrong PINs all fail alike", guesses.every((r) => isErr(r, "signInFailed") && r.message === SIGN_IN));
let pine = byLogin(store(), "pine");
check("only five were hashed and counted", pine.guard.lifetime === 5 && pine.guard.times.length === 5 && Object.keys(pine.guard.pending).length === 0, pine.guard);
check("the right PIN is refused during the cooldown", isErr(await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: "8642" }), "signInFailed"));

// --- Address limits --------------------------------------------------------------------------------------------------------
const ip = "203.0.113.50";
const makers = await Promise.all([1, 2, 3, 4].map(() => client(h, tunnel(ip))));
const made = [];
for (const [i, c] of makers.entries()) made.push(await c.req(fields(`maker-${i}`, "1470")));
check("three creations per address per hour", made.slice(0, 3).every((r) => r.type === "profileSession") && isErr(made[3], "slowDown"), made.map((r) => r.code ?? r.type));
const ip2 = "203.0.113.51";
const askers = await Promise.all([1, 2, 3].map(() => client(h, tunnel(ip2))));
const asks = [];
for (let i = 0; i < 21; i++) asks.push(await askers[i % 3].req({ type: "profileResume", credential: "B".repeat(43) }));
check("twenty authentication requests per address per minute", asks.slice(0, 20).every((r) => isErr(r, "signedOut")) && isErr(asks[20], "slowDown"), asks.map((r) => r.code));
const other = await (await client(h, tunnel("203.0.113.52"))).req({ type: "profileResume", credential: cred1 });
check("another tunnel visitor has its own address bucket", other.type === "profileSession");

// --- Crash during a reserved attempt, then restart -------------------------------------------------------------------------
const crasher = await client(h, tunnel());
// Eight derivations queue ahead of this attempt, so it sits reserved and unhashed while the store is read.
const queue = await Promise.all(Array.from({ length: 8 }, () => client(h, tunnel())));
queue.forEach((c, i) => c.send({ type: "profileLogin", id: "fill", login: `filler-${i}`, pin: "1234" }));
const fillers = () => Object.keys(store().unknownLogins).filter((k) => k.startsWith("filler-")).length;
for (const until = Date.now() + 10000; fillers() < 8 && Date.now() < until; await wait(5));
crasher.send({ type: "profileLogin", id: "crash", login: "dune", pin: "1111" });
let mid = byLogin(store(), "dune").guard;
for (const until = Date.now() + 10000; !Object.keys(mid.pending).length && Date.now() < until; await wait(5)) mid = byLogin(store(), "dune").guard;
check("the attempt is reserved durably before hashing", Object.keys(mid.pending).length === 1 && mid.lifetime === 1, mid);
await h.stop("SIGKILL");
h = await startHost();
await wait(300);
const after = byLogin(store(), "dune").guard;
check("an interrupted attempt is recovered as a failure", Object.keys(after.pending).length === 0 && after.lifetime === 2 && after.times.length === 2, after);
check("a crashed host's lock is taken over", (await (await client(h, tunnel())).req({ type: "profileHello" })).available === true);
check("credentials survive a restart", (await (await client(h, tunnel())).req({ type: "profileResume", credential: cred1 })).profile.profileId === emberId);
check("logins survive a restart", (await (await client(h, tunnel())).req({ type: "profileLogin", login: "dune", pin: "7531" })).profile.profileId === dune.profile.profileId);
check("budgets survive a restart and a successful login", byLogin(store(), "dune").guard.lifetime === 2);
check("the cooldown survives a restart", isErr(await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: "8642" }), "signInFailed"));

// --- 15-minute, daily and lifetime budgets ----------------------------------------------------------------------------------
async function fiveWrong() {
  for (let i = 0; i < 5; i++) {
    const before = byLogin(store(), "pine").guard.lifetime;
    const r = await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: String(2000 + i) });
    if (!isErr(r, "signInFailed") || byLogin(store(), "pine").guard.lifetime !== before + 1) fail("a wrong PIN within budget is hashed and counted", r);
  }
}
async function restartAfter(fn) {
  await h.stop();
  fn();
  h = await startHost();
}
const pineRight = async () => (await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: "8642" })).type === "profileSession";
await restartAfter(() => backdate("pine", 16 * MIN));
await fiveWrong();
check("ten failures inside a day", byLogin(store(), "pine").guard.lifetime === 10);
await restartAfter(() => backdate("pine", 16 * MIN));
check("the tenth daily failure blocks even the right PIN after the cooldown", !(await pineRight()));
// An offline rename moves the login, not the budget: it follows the profile UUID.
await restartAfter(() =>
  editStore((d) => {
    const p = byLogin(d, "pine");
    delete d.logins.pine;
    d.reservedLogins.pine = p.id;
    p.login = "pine-renamed";
    d.logins["pine-renamed"] = p.id;
  }),
);
check("the old login cannot sign in", isErr(await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: "8642" }), "signInFailed"));
check("the old login cannot be claimed again", isErr(await (await client(h, tunnel())).req(fields("pine", "1212")), "loginTaken"));
check("a rename keeps the day's budget", isErr(await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine-renamed", pin: "8642" }), "signInFailed"));
await restartAfter(() =>
  editStore((d) => {
    const p = byLogin(d, "pine-renamed");
    delete d.logins["pine-renamed"];
    delete d.reservedLogins.pine;
    delete d.unknownLogins.pine;
    p.login = "pine";
    d.logins.pine = p.id;
    p.guard.times = p.guard.times.map((t) => t - DAY);
  }),
);
check("the next day the right PIN works", await pineRight());
check("a successful login replenishes nothing", byLogin(store(), "pine").guard.lifetime === 10);
for (const round of [1, 2, 3, 4]) {
  await fiveWrong();
  await restartAfter(() => backdate("pine", round % 2 ? 16 * MIN : DAY));
}
pine = byLogin(store(), "pine");
check("thirty lifetime failures are recorded", pine.guard.lifetime === 30, pine.guard);
check("the lifetime lock refuses the right PIN", !(await pineRight()));
await restartAfter(() => backdate("pine", 30 * DAY));
check("time does not clear the lifetime lock", !(await pineRight()) && byLogin(store(), "pine").guard.lifetime === 30);
const locked = await (await client(h, tunnel())).req({ type: "profileResume", credential: pineCred });
check("a remembered device still resumes under the lifetime lock", locked.type === "profileSession" && locked.profile.login === "pine");
check("resume clears no counter", byLogin(store(), "pine").guard.lifetime === 30 && !(await pineRight()));

// --- Absolute expiry, parameter upgrade and the device cap -----------------------------------------------------------------
let doc = store();
const dev1 = Object.values(doc.devices).find((d) => d.profileId === emberId);
check("a device credential expires 90 days after issue", dev1.expiresAt - dev1.createdAt === 90 * DAY);
const duneId = dune.profile.profileId;
await restartAfter(() =>
  editStore((d) => {
    for (const dev of Object.values(d.devices)) if (dev.profileId === emberId) dev.expiresAt = Date.now() - 1;
    const salt = Buffer.from("0123456789abcdef");
    byLogin(d, "dune").pin = { alg: "scrypt", N: 16384, r: 8, p: 1, salt: salt.toString("base64"), hash: scryptSync("7531", salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64") };
  }),
);
check("an expired credential no longer resumes", isErr(await (await client(h, tunnel())).req({ type: "profileResume", credential: cred1 }), "signedOut"));
check("a weaker verifier still signs in", (await (await client(h, tunnel())).req({ type: "profileLogin", login: "dune", pin: "7531" })).profile.profileId === duneId);
check("and is upgraded to the accepted parameters", byLogin(store(), "dune").pin.N === 131072);
const overflowSessions = [];
for (let i = 0; i < 6; i++) overflowSessions.push(await (await client(h, tunnel())).req({ type: "profileLogin", login: "ember", pin: "4821" }));
check("at most five remembered devices per profile", Object.values(store().devices).filter((d) => d.profileId === emberId).length === 5);
// A row count alone can pass even if login returns a credential that was immediately evicted (#999).
check("each overflow login returns a credential for the same profile", overflowSessions.every((r) => r.type === "profileSession" && r.profile.profileId === emberId && typeof r.credential === "string"));
const budgetState = () => {
  const d = store();
  return JSON.stringify({ guards: Object.values(d.profiles).map((p) => [p.id, p.guard]), unknown: d.unknownLogins });
};
const beforeResumes = budgetState();
const resumeOverflow = async () => {
  const replies = [];
  for (const r of overflowSessions) replies.push(await (await client(h, tunnel())).req({ type: "profileResume", credential: r.credential }));
  return replies;
};
const overflowResumes = await resumeOverflow();
check("newest credential remains usable at capacity", overflowResumes.at(-1).type === "profileSession" && overflowResumes.at(-1).profile.profileId === emberId);
check("five issued credentials resume and one is signed out", overflowResumes.filter((r) => r.type === "profileSession" && r.profile.profileId === emberId).length === 5 && overflowResumes.filter((r) => isErr(r, "signedOut")).length === 1);
check("overflow does not evict another profile's credential", (await (await client(h, tunnel())).req({ type: "profileResume", credential: dune.credential })).profile?.profileId === duneId);
check("resume at capacity changes no PIN budget", budgetState() === beforeResumes);
await h.stop("SIGKILL");
h = await startHost();
const recoveredResumes = await resumeOverflow();
const outcome = (r) => r.type === "profileSession" ? r.profile.profileId : r.code;
check("crash/restart preserves each credential's capacity outcome", JSON.stringify(recoveredResumes.map(outcome)) === JSON.stringify(overflowResumes.map(outcome)));
check("other profile still resumes after overflow and restart", (await (await client(h, tunnel())).req({ type: "profileResume", credential: dune.credential })).profile?.profileId === duneId);
check("restart and repeated resumes preserve every PIN budget", budgetState() === beforeResumes);


// --- Nothing secret on disk or in game frames -----------------------------------------------------------------------------
const files = readdirSync(PROFILES_DIR);
const privateText = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? privateText(file) : [readFileSync(file, "utf8")];
});
const text = privateText(PROFILES_DIR).join("\n");
const values = [];
(function walk(v) {
  if (typeof v === "string") values.push(v);
  else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
})(store());
check("no plaintext PIN on disk", ![...PINS].some((p) => values.includes(p)) && !/"pin":"\d{4}"/.test(text), [...PINS]);
check("no device credential on disk", ![...CREDENTIALS].some((c) => text.includes(c)));
check("no stray temp files", files.every((f) => f === "profiles.json" || f === "writer.lock"), files);
const g2 = await guestTable(h);
g2.a.send({ type: "addBot" });
g2.a.send({ type: "ready", value: true });
g2.b.send({ type: "ready", value: true });
await wait(200);
g2.a.send({ type: "start" });
await g2.b.next((m) => m.type === "state", 5000, "game state");
// Every table frame, leaving out the one profileError the table-socket refusal above earned.
const frames = [...guest.a.seen, ...back.seen, ...g2.a.seen, ...g2.b.seen].filter((f) => !f.startsWith('{"type":"profileError"')).join("\n");
check("the guest sockets saw game frames", frames.includes('"type":"state"') && frames.includes('"type":"welcome"'));
check("game frames carry no profile fields", !/profile|login|credential|pinGuard|"guard"/i.test(frames) && ![...CREDENTIALS].some((c) => frames.includes(c)));
check("the store never names a custom media binding", Object.values(store().profiles).every((p) => p.mediaKey === null && p.winSongId === null));

// --- One writer, and refusal of stores this host cannot trust ----------------------------------------------------------------
const second = await startHost();
check("a second host on the same profile directory refuses profiles", (await (await client(second, tunnel())).req({ type: "profileHello" })).reason === "unavailable");
const g3 = await guestTable(second);
check("that second host still seats guests", g3.wb.code === g3.wa.code);
await second.stop();
const good = readFileSync(STORE, "utf8");
for (const [why, bad] of [
  ["an unknown schema", JSON.stringify({ ...JSON.parse(good), schemaVersion: 2 })],
  ["a corrupt store", good.slice(0, good.length / 2)],
  ["a store with a broken login index", JSON.stringify({ ...JSON.parse(good), logins: { ...JSON.parse(good).logins, ghost: emberId } })],
]) {
  await restartAfter(() => writeFileSync(STORE, bad));
  const c = await client(h, tunnel());
  check(`${why} is refused, not replaced`, (await c.req({ type: "profileHello" })).reason === "unavailable" && isErr(await c.req({ type: "profileLogin", login: "dune", pin: "7531" }), "unavailable"));
  const g = await guestTable(h);
  check(`guests still play over ${why}`, g.wb.code === g.wa.code);
  check(`${why} is left on disk for repair`, readFileSync(STORE, "utf8") === bad);
}
await restartAfter(() => writeFileSync(STORE, good));
check("the repaired store serves profiles again", (await (await client(h, tunnel())).req({ type: "profileLogin", login: "dune", pin: "7531" })).type === "profileSession");

// --- Explicit loopback development ------------------------------------------------------------------------------------------
await h.stop();
h = await startHost({ PROFILES_DEV: "1" });
const devPage = await client(h, { origin: "http://localhost:8080", host: `localhost:${h.port}` });
check("PROFILES_DEV=1 allows a loopback page over ws://", (await devPage.req({ type: "profileLogin", login: "dune", pin: "7531" })).type === "profileSession");
check("development still refuses a LAN page", isErr(await (await client(h, { origin: "http://192.168.1.20:8080", host: `localhost:${h.port}` })).req({ type: "profileLogin", login: "dune", pin: "7531" }), "https"));
check("development still refuses a proxied loopback hop", isErr(await (await client(h, { origin: "http://localhost:8080", host: `localhost:${h.port}`, "x-forwarded-for": "192.168.1.20" })).req({ type: "profileLogin", login: "dune", pin: "7531" }), "https"));
check("development still refuses a direct LAN peer", isErr(await (await client(h, { origin: "http://localhost:8080", host: `localhost:${h.port}` }, "127.0.0.2")).req({ type: "profileLogin", login: "dune", pin: "7531" }), "https"));
await h.stop();

console.log(`profile-auth-prove: ${passed} checks passed`);
process.exit(0);
