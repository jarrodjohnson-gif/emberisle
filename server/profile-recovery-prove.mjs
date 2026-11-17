// #1437: the permanent recovery code (docs/design/recovery-code-1070) on the real rules host, through host.mjs's own sockets
// against a temporary private store. The proof-only hash observer (profile-auth-observer.mjs) counts native derivations, so
// "the same work" is checked by count, not only by time. It checks:
//   create shows the code once, the store holds only its hash, and no log line holds it;
//   the right code with the right login resets the PIN, signs out the other devices and keeps the code;
//   another profile's login, a former login and a deleted profile's login fail alike;
//   the 3, 5 and 10 code limits survive restarts, and the 5-an-hour address limit holds while the host runs;
//   a new code starts with fresh counters; a bad new PIN is refused before the code is checked and costs no try;
//   a wrong code, an unknown login, a profile with no code, a spent budget and a locked code (real and unknown login) answer
//   alike, run one derivation each and take about as long;
//   code tries leave the PIN's guard byte for byte unchanged, and PIN tries leave the code's counters unchanged;
//   a PIN life lock refuses the right code with pinLocked; New recovery code needs the PIN, kills the old code and is refused
//   under a PIN life lock; the local reset deletes the code and the next PIN change shows a new one;
//   an interrupted code try is counted as wrong after a crash.
// Run from the repo root: node --import ./server/register.mjs server/profile-recovery-prove.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-recovery-rooms-"));
const PROFILES_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-recovery-profiles-"));
const STORE = path.join(PROFILES_DIR, "profiles.json");
const SERVER = new URL(".", import.meta.url);
const hosts = new Set();
process.on("exit", () => {
  for (const h of hosts) h.proc.kill("SIGKILL");
  rmSync(ROOMS_DIR, { recursive: true, force: true });
  rmSync(PROFILES_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const FAILED = "Couldn't use that code. Check your login and code, or try again later.";
const LOCKED = "PIN changes are locked. Contact the host for a verified local reset.";
const CODE = /^[2-9A-HJKMNP-TV-Z]{6}$/;
const OWNER_KEYS = ["backupColor", "catchphrase", "color", "displayName", "login", "profileId", "winSongId"].join();
const CODES = new Set();
const INBOUND = [];
const sockets = new Set();
let LOG = "";
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

// The host with the proof-only hash observer preloaded; its stdout and stderr are kept to check that no code is logged.
async function startHost() {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "--import", "./profile-auth-observer.mjs", "host.mjs"], {
    cwd: SERVER,
    env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, PROFILES_DIR, PROFILES_DEV: "" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const h = { proc, events: [] };
  proc.on("message", (m) => m?.type === "profile-hash-proof" && h.events.push(m));
  proc.stdout.on("data", (d) => (LOG += d));
  proc.stderr.on("data", (d) => (LOG += d));
  h.control = async (command) => {
    const from = h.events.length;
    proc.send({ type: "profile-hash-proof-control", command });
    for (const until = Date.now() + 10000; !h.events.slice(from).some((e) => e.event === "ack" && e.command === command); await wait(5)) if (Date.now() > until) fail(`waited for ${command}`);
  };
  hosts.add(h);
  h.port = await new Promise((resolve, reject) => {
    let out = "";
    proc.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    });
    proc.on("exit", (c) => reject(new Error(`host exited ${c}: ${LOG}`)));
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

// cloudflared's loopback hop for one visitor address; each call is a new address unless one is given.
let nextIp = 10;
const TUNNEL = "isle-demo.trycloudflare.com";
const tunnel = (ip = `10.${nextIp >> 8}.${nextIp++ & 255}.7`) => ({ origin: `https://${TUNNEL}`, host: TUNNEL, "cf-connecting-ip": ip, "x-forwarded-proto": "https" });
async function client(h, ip) {
  const ws = new WebSocket(`ws://127.0.0.1:${h.port}`, { headers: tunnel(ip) });
  sockets.add(ws);
  const c = { ws, inbox: [], waiters: [] };
  ws.on("message", (raw) => {
    INBOUND.push(String(raw));
    c.inbox.push(JSON.parse(String(raw)));
    for (const w of c.waiters.splice(0)) w();
  });
  ws.on("error", () => {});
  let n = 0;
  // One request, its reply time and the native derivations that started while it was out.
  c.req = async (msg) => {
    const id = `r${++n}`;
    const from = h.events.length;
    const t0 = Date.now();
    ws.send(JSON.stringify({ ...msg, id }));
    for (const until = Date.now() + 120000; ; ) {
      const i = c.inbox.findIndex((m) => m.id === id);
      if (i >= 0) {
        const reply = c.inbox.splice(i, 1)[0];
        reply.ms = Date.now() - t0;
        // The start event is sent before the hash runs, long before the reply; give the IPC channel a moment anyway.
        await wait(20);
        reply.hashes = h.events.slice(from).filter((e) => e.event === "start").length;
        if (typeof reply.recoveryCode === "string") CODES.add(reply.recoveryCode);
        if (reply.type === "profileRecoveryCode") CODES.add(reply.code);
        return reply;
      }
      if (Date.now() > until) fail(`waited for ${msg.type}`);
      await new Promise((res) => (c.waiters.push(res), setTimeout(res, 1000)));
    }
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
const isErr = (r, code) => r.type === "profileError" && r.code === code;
const refusedAlike = (r) => isErr(r, "recoverFailed") && r.message === FAILED && Object.keys(r).filter((k) => k !== "ms" && k !== "hashes").sort().join() === "code,id,message,type";
const codeGuard = (login) => JSON.stringify(byLogin(store(), login).recoveryGuard);
const pinGuard = (login) => JSON.stringify(byLogin(store(), login).guard);
const unknownGuard = (login) => store().unknownRecovery?.[login];
// A typed code as a player might: lower case, a dash and spaces.
const typed = (code) => ` ${code.slice(0, 3).toLowerCase()} - ${code.slice(3).toLowerCase()} `;

let h = await startHost();
async function restartAfter(fn = () => {}) {
  await h.stop();
  fn();
  h = await startHost();
}
const req = async (msg, ip) => (await client(h, ip)).req(msg);
const create = (login, pin) => req({ type: "profileCreate", displayName: login[0].toUpperCase() + login.slice(1), login, pin, pinConfirm: pin, color: "#2d6ee8" });
const recover = (login, code, newPin, newPinConfirm = newPin, ip) => req({ type: "profileRecover", login, code, newPin, newPinConfirm }, ip);
const signIn = (login, pin) => req({ type: "profileLogin", login, pin });
// A code that differs from `code` in its last symbol, so it is wrong but well formed.
const wrongOf = (code, i = 0) => code.slice(0, 5) + "23456789ABCDEFGHJKMNPQRSTVWXYZ".replace(code[5], "")[i];

// --- Capability and create --------------------------------------------------------------------------------------------------
const hello = await req({ type: "profileHello" });
check("profileHello advertises recoveryV1 beside profilesV1", hello.caps.includes("profilesV1") && hello.caps.includes("recoveryV1") && hello.available === true, hello);
const rowan = await create("rowan", "4821");
check("create returns the code once, in six safe symbols, beside the profile", rowan.type === "profileSession" && CODE.test(rowan.recoveryCode) && typeof rowan.recoverySetAt === "number", rowan);
check("the session's profile still carries only the owner allowlist", Object.keys(rowan.profile).sort().join() === OWNER_KEYS, Object.keys(rowan.profile));
check("creating a profile with its code runs two derivations (PIN and code)", rowan.hashes === 2, rowan.hashes);
const rowanCode = rowan.recoveryCode;
let rec = byLogin(store(), "rowan").recovery;
check("the store holds the code's scrypt verifier and when it was made", rec.alg === "scrypt" && rec.N === 131072 && rec.salt && rec.hash && rec.at === rowan.recoverySetAt, rec);
check("the code's counters start empty", codeGuard("rowan") === JSON.stringify({ times: [], pending: {}, lifetime: 0 }));
check("no plaintext code on disk", !readFileSync(STORE, "utf8").includes(rowanCode));
const login1 = await signIn("rowan", "4821");
check("sign in carries when the code was made, never the code", login1.recoverySetAt === rowan.recoverySetAt && !("recoveryCode" in login1), login1);
const resumed = await req({ type: "profileResume", credential: rowan.credential });
check("resume carries when the code was made, never the code", resumed.recoverySetAt === rowan.recoverySetAt && !("recoveryCode" in resumed), resumed);

// --- The right code with the right login --------------------------------------------------------------------------------------
const pinBefore = pinGuard("rowan");
const good = await recover("rowan", typed(rowanCode), "1357");
check("the right code with its login (any case, dashes and spaces) signs in with a new device credential", good.type === "profileSession" && good.profile.login === "rowan" && /^[A-Za-z0-9_-]{43}$/.test(good.credential) && good.credential !== rowan.credential, good);
check("its reply keeps the code out and says when it was made", !("recoveryCode" in good) && good.recoverySetAt === rowan.recoverySetAt);
check("a right code runs two derivations (the code, then the new PIN)", good.hashes === 2, good.hashes);
check("a code reset leaves the PIN's guard byte for byte unchanged", pinGuard("rowan") === pinBefore);
check("every other device is signed out", isErr(await req({ type: "profileResume", credential: rowan.credential }), "signedOut") && isErr(await req({ type: "profileResume", credential: login1.credential }), "signedOut"));
check("this device stays signed in", (await req({ type: "profileResume", credential: good.credential })).profile?.login === "rowan");
check("the new PIN signs in and the old one no longer does", (await signIn("rowan", "1357")).type === "profileSession" && isErr(await signIn("rowan", "4821"), "signInFailed"));
check("the code stays the same", JSON.stringify(byLogin(store(), "rowan").recovery) === JSON.stringify(rec));
check("a right code changes no code counter", codeGuard("rowan") === JSON.stringify({ times: [], pending: {}, lifetime: 0 }));
check("the code works again: it is permanent", (await recover("rowan", rowanCode, "2468")).type === "profileSession");

// --- Logins that do not own the code fail alike ---------------------------------------------------------------------------------
const sage = await create("sage", "1111");
const sageCode = sage.recoveryCode;
const crossed = await recover("rowan", sageCode, "9999");
check("another profile's code with this login fails alike, after one derivation", refusedAlike(crossed) && crossed.hashes === 1, crossed);
check("a code is never searched for across profiles: sage's own counters are untouched", codeGuard("sage") === JSON.stringify({ times: [], pending: {}, lifetime: 0 }));
const rowanCred = (await signIn("rowan", "2468")).credential;
const renamed = await req({ type: "profileEdit", credential: rowanCred, login: "rowan-two", pin: "2468" });
check("rowan renames to rowan-two", renamed.type === "profileSession" && renamed.profile.login === "rowan-two" && renamed.recoverySetAt === rowan.recoverySetAt, renamed);
const former = await recover("rowan", rowanCode, "9999");
check("the former login fails alike, after one derivation", refusedAlike(former) && former.hashes === 1, former);
check("a former login is counted like an unknown login", unknownGuard("rowan")?.lifetime === 1, unknownGuard("rowan"));
check("the code follows the profile to its new login", (await recover("rowan-two", rowanCode, "3579")).type === "profileSession");
const sageHash = byLogin(store(), "sage").recovery.hash;
await h.stop();
const deletion = await new Promise((resolve) => {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "profile-admin.mjs", "--delete", "sage"], { cwd: SERVER, env: { ...process.env, PROFILES_DIR }, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  proc.stdout.on("data", (d) => (out += d));
  proc.stderr.on("data", (d) => (out += d));
  proc.stdin.end("sage\n");
  proc.on("exit", (code) => resolve({ code, out }));
});
check("the admin command deletes sage", deletion.code === 0 && /Deleted profile/.test(deletion.out), deletion);
LOG += deletion.out;
h = await startHost();
const deleted = await recover("sage", sageCode, "9999");
check("a deleted profile's login fails alike with its own old code, after one derivation", refusedAlike(deleted) && deleted.hashes === 1, deleted);
check("the deletion removed the record and its code; the login stays reserved", !Object.values(store().profiles).some((p) => p.login === "sage") && store().reservedLogins.sage === sage.profile.profileId && !readFileSync(STORE, "utf8").includes(sageHash));

// --- The new PIN is checked first ---------------------------------------------------------------------------------------------
const tamsin = await create("tamsin", "2580");
const tCode = tamsin.recoveryCode;
const tGuard0 = codeGuard("tamsin");
for (const [why, fields] of [
  ["a malformed new PIN", { newPin: "12", newPinConfirm: "12" }],
  ["a mismatched confirmation", { newPin: "1234", newPinConfirm: "1243" }],
]) {
  const r = await req({ type: "profileRecover", login: "tamsin", code: tCode, ...fields });
  check(`${why} with the right code is refused as invalid before any derivation`, isErr(r, "invalid") && r.hashes === 0, r);
}
for (const bad of [wrongOf(tCode).slice(0, 5) + "O", "K7Q-M4", "K7QM4XR", ""]) {
  const r = await recover("tamsin", bad, "1234");
  check(`a code outside the thirty symbols or six long (${JSON.stringify(bad)}) is invalid before any derivation`, isErr(r, "invalid") && r.hashes === 0, r);
}
check("a refused new PIN or malformed code costs no code try", codeGuard("tamsin") === tGuard0);

// --- 3 in 15 minutes, 5 a day, 10 per code; all through restarts -----------------------------------------------------------------
const tPin = pinGuard("tamsin");
async function wrongTries(n, from) {
  for (let i = 0; i < n; i++) {
    const before = byLogin(store(), "tamsin").recoveryGuard.lifetime;
    const r = await recover("tamsin", wrongOf(tCode, from + i), "1234");
    if (!refusedAlike(r) || r.hashes !== 1 || byLogin(store(), "tamsin").recoveryGuard.lifetime !== before + 1) fail("a wrong code within budget is hashed once and counted", { r, before });
  }
}
const backdate = (ms) => editStore((d) => {
  const g = byLogin(d, "tamsin").recoveryGuard;
  g.times = g.times.map((t) => t - ms);
});
const tRight = (pin) => recover("tamsin", tCode, pin);
await wrongTries(3, 0);
let r = await tRight("1234");
check("the fourth try inside 15 minutes is refused, even the right code, after one derivation", refusedAlike(r) && r.hashes === 1, r);
check("a refused try is not counted", byLogin(store(), "tamsin").recoveryGuard.lifetime === 3);
await restartAfter(() => backdate(16 * MIN));
await wrongTries(2, 3);
check("five wrong codes inside a day", byLogin(store(), "tamsin").recoveryGuard.lifetime === 5);
await restartAfter(() => backdate(16 * MIN));
r = await tRight("1234");
check("the fifth daily failure blocks even the right code after the cooldown", refusedAlike(r) && r.hashes === 1, r);
await restartAfter(() => backdate(DAY));
r = await tRight("1234");
check("the next day the right code works", r.type === "profileSession", r);
check("a right code gives back no earlier wrong try", byLogin(store(), "tamsin").recoveryGuard.lifetime === 5);
await wrongTries(3, 5);
await restartAfter(() => backdate(16 * MIN));
await wrongTries(2, 8);
check("ten wrong codes are recorded for this code", byLogin(store(), "tamsin").recoveryGuard.lifetime === 10);
await restartAfter(() => backdate(DAY));
r = await tRight("4321");
check("the tenth wrong try locks the code: the right code is refused, after one derivation", refusedAlike(r) && r.hashes === 1, r);
await restartAfter(() => backdate(30 * DAY));
check("time and restarts do not clear the code's lock", refusedAlike(await tRight("4321")) && byLogin(store(), "tamsin").recoveryGuard.lifetime === 10);
check("fifteen code tries left the PIN's guard byte for byte unchanged", pinGuard("tamsin") === tPin);
const tCodeGuard = codeGuard("tamsin");
check("a wrong PIN is refused", isErr(await signIn("tamsin", "0000"), "signInFailed"));
check("a PIN try leaves the code's counters unchanged", codeGuard("tamsin") === tCodeGuard);

// --- New recovery code: needs the PIN, kills the old code, starts fresh counters -------------------------------------------------
const tCred = (await signIn("tamsin", "1234")).credential;
const tPinGuard = pinGuard("tamsin");
const noPin = await req({ type: "profileNewCode", credential: tCred, pin: "9876" });
check("New recovery code with a wrong PIN is refused like Change PIN", isErr(noPin, "signInFailed"), noPin);
check("that wrong PIN counts against the PIN budget", JSON.parse(pinGuard("tamsin")).lifetime === JSON.parse(tPinGuard).lifetime + 1);
check("and leaves the code as it was", codeGuard("tamsin") === tCodeGuard && byLogin(store(), "tamsin").recovery.hash !== undefined);
check("a stolen device credential alone can't make a code", isErr(await req({ type: "profileNewCode", credential: tCred }), "invalid"));
const fresh = await req({ type: "profileNewCode", credential: tCred, pin: "1234" });
check("New recovery code with the PIN answers a new code and when it was made", fresh.type === "profileRecoveryCode" && CODE.test(fresh.code) && typeof fresh.setAt === "number" && Object.keys(fresh).filter((k) => k !== "ms" && k !== "hashes").sort().join() === "code,id,setAt,type", fresh);
check("the new code starts with fresh counters", codeGuard("tamsin") === JSON.stringify({ times: [], pending: {}, lifetime: 0 }));
check("the old code stops working at once", refusedAlike(await recover("tamsin", tCode, "5678")));
check("the new code works", (await recover("tamsin", fresh.code, "5678")).type === "profileSession");
check("sign in now reports the new code's time", (await signIn("tamsin", "5678")).recoverySetAt === fresh.setAt);

// --- Five code tries an hour per address, in memory -------------------------------------------------------------------------------
const ip = "203.0.113.80";
const tries = [];
for (let i = 0; i < 6; i++) tries.push(await recover(`nobody-${i}`, "K7QM4X", "1234", "1234", ip));
check("five code tries per address per hour, right or wrong", tries.slice(0, 5).every(refusedAlike) && isErr(tries[5], "slowDown") && tries[5].hashes === 0, tries.map((t) => t.code));
check("another address has its own allowance", refusedAlike(await recover("nobody-x", "K7QM4X", "1234", "1234", "203.0.113.81")));
check("the address limit leaves sign in alone", isErr(await (await client(h, ip)).req({ type: "profileLogin", login: "nobody-y", pin: "1234" }), "signInFailed"));
await restartAfter();
check("the address limit is in memory: a restart empties it", refusedAlike(await recover("nobody-z", "K7QM4X", "1234", "1234", ip)));

// --- Refusals look alike, run one derivation each and take about as long --------------------------------------------------------
const una = await create("una", "1470");
const old = await create("old-timer", "2222");
await restartAfter(() => editStore((d) => {
  // A profile made before this feature: no code and no code counters.
  delete byLogin(d, "old-timer").recovery;
  delete byLogin(d, "old-timer").recoveryGuard;
}));
const reference = await recover("una", wrongOf(una.recoveryCode), "1234");
const kinds = { "an unknown login": await recover("nobody-at-all", una.recoveryCode, "1234"), "a profile with no code": await recover("old-timer", old.recoveryCode, "1234") };
check("a profile with no code is counted exactly like an unknown login", unknownGuard("old-timer")?.lifetime === 1 && unknownGuard("nobody-at-all")?.lifetime === 1);
await recover("una", wrongOf(una.recoveryCode, 1), "1234");
await recover("una", wrongOf(una.recoveryCode, 2), "1234");
kinds["a spent budget"] = await recover("una", una.recoveryCode, "1234");
await restartAfter(() => editStore((d) => {
  byLogin(d, "una").recoveryGuard = { times: [], pending: {}, lifetime: 10 };
  d.unknownRecovery["ghost-login"] = { times: [], pending: {}, lifetime: 10 };
}));
kinds["a locked code (real login)"] = await recover("una", una.recoveryCode, "1234");
kinds["a locked code (unknown login)"] = await recover("ghost-login", una.recoveryCode, "1234");
check("a wrong code is refused after one derivation", refusedAlike(reference) && reference.hashes === 1, reference);
for (const [kind, reply] of Object.entries(kinds)) {
  check(`${kind} answers exactly like a wrong code`, refusedAlike(reply) && reply.message === reference.message, reply);
  check(`${kind} runs one derivation, like a wrong code`, reply.hashes === 1, reply.hashes);
  check(`${kind} takes about as long as a wrong code`, reply.ms > 0.5 * reference.ms, { kind: reply.ms, wrong: reference.ms });
}
console.log("refusal timing (ms)", JSON.stringify({ "a wrong code": reference.ms, ...Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.ms])) }));
check("refusals under a lock count nothing", byLogin(store(), "una").recoveryGuard.lifetime === 10 && unknownGuard("ghost-login").lifetime === 10);

// --- A PIN life lock -----------------------------------------------------------------------------------------------------------
const vale = await create("vale", "3690");
await restartAfter(() => editStore((d) => {
  const g = byLogin(d, "vale").guard;
  g.lifetime = 30;
}));
const valePin = JSON.stringify(byLogin(store(), "vale").pin);
const locked = await recover("vale", vale.recoveryCode, "1234");
check("under a PIN life lock the right code is refused with pinLocked", isErr(locked, "pinLocked") && locked.message === LOCKED, locked);
check("the lock keeps the PIN and its devices", JSON.stringify(byLogin(store(), "vale").pin) === valePin && (await req({ type: "profileResume", credential: vale.credential })).type === "profileSession");
check("a right code under the lock costs no code try", byLogin(store(), "vale").recoveryGuard.lifetime === 0 && byLogin(store(), "vale").guard.lifetime === 30);
const lockedWrong = await recover("vale", wrongOf(vale.recoveryCode), "1234");
check("a wrong code under the lock reads like any wrong code: only the code's holder learns of the lock", refusedAlike(lockedWrong) && byLogin(store(), "vale").recoveryGuard.lifetime === 1, lockedWrong);
check("New recovery code is refused under a PIN life lock", isErr(await req({ type: "profileNewCode", credential: vale.credential, pin: "3690" }), "pinLocked"));

// --- The host's local reset -----------------------------------------------------------------------------------------------------
const wren = await create("wren", "8642");
await h.stop();
const reset = await new Promise((resolve) => {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "profile-admin.mjs", "wren"], { cwd: SERVER, env: { ...process.env, PROFILES_DIR }, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  proc.stdout.on("data", (d) => (out += d));
  proc.stderr.on("data", (d) => (out += d));
  proc.stdin.end("YES\n");
  proc.on("exit", (code) => resolve({ code, out }));
});
LOG += reset.out;
const tempPin = reset.out.match(/Temporary PIN:\s*(\d{4})/)?.[1];
check("the local reset says the old code is deleted and shows no code", reset.code === 0 && tempPin && /Old recovery code deleted\. They get a new one after changing the PIN\./.test(reset.out) && ![...CODES].some((c) => reset.out.includes(c)), reset.out);
check("the reset deletes the code and its counters", !("recovery" in byLogin(store(), "wren")) && !("recoveryGuard" in byLogin(store(), "wren")));
h = await startHost();
check("the old code now fails like an unknown login", refusedAlike(await recover("wren", wren.recoveryCode, "1234")) && unknownGuard("wren")?.lifetime === 1);
const temp = await signIn("wren", tempPin);
check("a temporary PIN signs in with no code to report", temp.type === "profileSession" && temp.profile.pinMustChange === true && temp.recoverySetAt === null && !("recoveryCode" in temp), temp);
check("New recovery code waits for the PIN change", isErr(await req({ type: "profileNewCode", credential: temp.credential, pin: tempPin }), "mustChangePin"));
const changed = await req({ type: "profileChangePin", credential: temp.credential, currentPin: tempPin, newPin: "7777", newPinConfirm: "7777" });
check("changing the temporary PIN shows a new code", changed.type === "profileSession" && CODE.test(changed.recoveryCode) && changed.recoveryCode !== wren.recoveryCode && typeof changed.recoverySetAt === "number", changed);
check("the new code starts fresh and the unknown-login count goes with it", codeGuard("wren") === JSON.stringify({ times: [], pending: {}, lifetime: 0 }) && unknownGuard("wren") === undefined);
check("a later Change PIN makes no new code", !("recoveryCode" in (await req({ type: "profileChangePin", credential: changed.credential, currentPin: "7777", newPin: "7778", newPinConfirm: "7778" }))));
check("the new code works", (await recover("wren", changed.recoveryCode, "1212")).type === "profileSession");

// --- An interrupted code try counts as wrong after a crash ------------------------------------------------------------------------
const xan = await create("xan", "1593");
await h.control("hold-next");
const crasher = await client(h);
crasher.ws.send(JSON.stringify({ type: "profileRecover", id: "crash", login: "xan", code: wrongOf(xan.recoveryCode), newPin: "1234", newPinConfirm: "1234" }));
let mid = byLogin(store(), "xan").recoveryGuard;
for (const until = Date.now() + 10000; !Object.keys(mid.pending).length && Date.now() < until; await wait(5)) mid = byLogin(store(), "xan").recoveryGuard;
check("the code try is reserved on disk before hashing", Object.keys(mid.pending).length === 1 && mid.lifetime === 0, mid);
await h.stop("SIGKILL");
h = await startHost();
await wait(300);
const after = byLogin(store(), "xan").recoveryGuard;
check("after the crash the interrupted try is counted as wrong", Object.keys(after.pending).length === 0 && after.lifetime === 1 && after.times.length === 1, after);
check("the right code still works afterwards", (await recover("xan", xan.recoveryCode, "4567")).type === "profileSession");

// --- The code appears in one reply only, never on disk or in a log -------------------------------------------------------------
await h.stop();
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [readFileSync(path.join(dir, e.name), "utf8")]));
const disk = [...files(PROFILES_DIR), ...files(ROOMS_DIR)].join("\n");
check(`the codes (${CODES.size}) were all seen`, CODES.size >= 9);
check("no code in the profile file or any saved file", ![...CODES].some((c) => disk.includes(c)));
check("no code in any host or admin log line", ![...CODES].some((c) => LOG.includes(c)));
check("each code appears in exactly one reply frame: the one that made it", [...CODES].every((c) => INBOUND.filter((f) => f.includes(`"${c}"`)).length === 1), [...CODES].map((c) => INBOUND.filter((f) => f.includes(`"${c}"`)).length));

console.log(`profile-recovery-prove: ${passed} checks passed`);
process.exit(0);
