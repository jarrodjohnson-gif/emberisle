// Proof: profileEdit, profileChangePin and local PIN reset (#763, docs/design/profiles.md).
// Uses real profile sockets against a temporary private store, matching profile-auth-prove.mjs patterns.
// Run from the repo root: node --import ./server/register.mjs server/profile-edit-prove.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { openProfiles, SCRYPT } from "./profiles.mjs";
import { seatCredential } from "./profile-protocol.mjs";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";

const fixtureStage = process.env.PROFILE_EDIT_FIXTURE_STAGE;
if (fixtureStage && !["prepare", "reopen"].includes(fixtureStage)) throw new Error("invalid fixture stage");
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
const PROFILES_DIR = fixtureStage ? process.env.PROFILE_EDIT_FIXTURE_DIR : mkdtempSync(path.join(tmpdir(), "emberisle-profiles-"));
const STORE = path.join(PROFILES_DIR, "profiles.json");
const hosts = new Set();
const sockets = new Set();
process.on("exit", () => {
  for (const h of hosts) h.proc.kill("SIGKILL");
  rmSync(ROOMS_DIR, { recursive: true, force: true });
  if (!fixtureStage) rmSync(PROFILES_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

const MIN = 60 * 1000;
const TEMP_PIN_MS = 15 * MIN;
let passed = 0;
const PINS = new Set();
const CREDENTIALS = new Set();

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

async function startHost(env = {}, dir = PROFILES_DIR) {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR, PROFILES_DIR: dir, PROFILES_DEV: "", ...env },
  });
  const h = { proc, log: "" };
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

let nextIp = 10;
const TUNNEL = "isle-demo.trycloudflare.com";
function tunnel(ip = `10.${nextIp >> 8}.${nextIp++ & 255}.1`) {
  return { origin: `https://${TUNNEL}`, host: TUNNEL, "cf-connecting-ip": ip, "x-forwarded-proto": "https" };
}

async function client(h, headers = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${h.port}`, { headers });
  sockets.add(ws);
  const c = { ws, inbox: [], waiters: [] };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
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
    if (msg.pin || msg.currentPin || msg.newPin) {
      if (msg.pin) PINS.add(msg.pin);
      if (msg.currentPin) PINS.add(msg.currentPin);
      if (msg.newPin) PINS.add(msg.newPin);
    }
    c.send({ ...msg, id });
    const reply = await c.next((m) => m.id === id, 120000, `${msg.type} ${id}`);
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
const isErr = (r, code) => r.type === "profileError" && r.code === code;
const fields = (login, pin, over = {}) => ({ type: "profileCreate", displayName: login[0].toUpperCase() + login.slice(1), login, pin, pinConfirm: pin, color: "#2d6ee8", ...over });

// Run the admin CLI as a subprocess. Pipes YES (or other input) to stdin. Returns { stdout, stderr, code }.
async function runAdmin(args, input = "YES\n", dir = PROFILES_DIR) {
  const env = { ...process.env };
  if (dir === null) delete env.PROFILES_DIR;
  else env.PROFILES_DIR = dir;
  return new Promise((resolve) => {
    const proc = spawn(
      process.execPath,
      ["--import", "./register.mjs", "profile-admin.mjs", ...args],
      {
        cwd: new URL(".", import.meta.url),
        env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.stdin.write(input);
    proc.stdin.end();
    proc.on("exit", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

// Each fixture owner exits before the next process opens its private store.
async function runStoreFixture(stage) {
  let count;
  const proc = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url)], {
    env: { ...process.env, PROFILE_EDIT_FIXTURE_STAGE: stage, PROFILE_EDIT_FIXTURE_DIR: PROFILES_DIR },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  hosts.add({ proc });
  proc.stdout.on("data", d => process.stdout.write(d));
  proc.stderr.on("data", d => process.stderr.write(d));
  proc.on("message", message => { count = message.checks; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error(`store fixture ${stage} timed out`)); }, 60_000);
    proc.once("error", error => { clearTimeout(timer); reject(error); });
    proc.once("exit", code => {
      clearTimeout(timer);
      for (const h of hosts) if (h.proc === proc) hosts.delete(h);
      if (code !== 0 || !Number.isInteger(count) || count <= 0) reject(new Error(`store fixture ${stage} failed: ${code}`));
      else { passed += count; resolve(proc.pid); }
    });
  });
}

if (!fixtureStage) {
// --- Setup: start host, create test profiles ---------------------------------------------------------
let h = await startHost();

const emC = await client(h, tunnel());
const created = await emC.req(fields("ember", "4821", { catchphrase: "Hi" }));
check("profileCreate succeeds", created.type === "profileSession", created);
const emberId = created.profile.profileId;
const cred1 = created.credential;
CREDENTIALS.add(cred1);

const pinC = await client(h, tunnel());
const pineRes = await pinC.req(fields("pine", "8642"));
const pineId = pineRes.profile.profileId;
const pineCred = pineRes.credential;
CREDENTIALS.add(pineCred);

const duneC = await client(h, tunnel());
const duneRes = await duneC.req(fields("dune", "7531"));
const duneId = duneRes.profile.profileId;
const duneCred = duneRes.credential;
CREDENTIALS.add(duneCred);

// --- Unauthorized edits fail -------------------------------------------------------------------------
check(
  "profileEdit with missing credential is refused",
  isErr(await (await client(h, tunnel())).req({ type: "profileEdit", credential: "A".repeat(43), displayName: "Hacker" }), "signedOut"),
);
check(
  "profileEdit with expired/invalid credential is refused",
  isErr(await (await client(h, tunnel())).req({ type: "profileEdit", credential: "B".repeat(43), displayName: "Hacker" }), "signedOut"),
);

// --- Display name edit succeeds with valid credential ------------------------------------------------
const editC = await client(h, tunnel());
const edited = await editC.req({ type: "profileEdit", credential: cred1, displayName: "Emberglow" });
check("profileEdit displayName succeeds with valid credential", edited.type === "profileSession" && edited.profile.displayName === "Emberglow", edited);
check("UUID is unchanged after displayName edit", edited.profile.profileId === emberId, edited.profile);

// --- Catchphrase and colour edits -------------------------------------------------------------------
const edited2 = await editC.req({ type: "profileEdit", credential: cred1, catchphrase: "Hello world", color: "#e23d2e", backupColor: "#f3ecd9" });
check("profileEdit colour and catchphrase", edited2.type === "profileSession" && edited2.profile.catchphrase === "Hello world" && edited2.profile.color === "#e23d2e", edited2);
check("identical color and backupColor is rejected", isErr(await editC.req({ type: "profileEdit", credential: cred1, color: "#2d6ee8", backupColor: "#2d6ee8" }), "invalid"));

// --- Login rename requires current PIN ---------------------------------------------------------------
const renameOkC = await client(h, tunnel());
const renamed = await renameOkC.req({ type: "profileEdit", credential: duneCred, login: "dune-new", pin: "7531" });
check("login rename with correct PIN succeeds", renamed.type === "profileSession" && renamed.profile.login === "dune-new", renamed);
check("UUID survives rename", renamed.profile.profileId === duneId, renamed.profile);
check("old login is reserved", !!store().reservedLogins["dune"], store().reservedLogins);
check("old login cannot be claimed", isErr(await (await client(h, tunnel())).req(fields("dune", "1234")), "loginTaken"));
const renameFailuresBefore = byLogin(store(), "dune-new").guard.lifetime;
check("wrong PIN is refused for rename", isErr(await renameOkC.req({ type: "profileEdit", credential: duneCred, login: "dune-newer", pin: "0000" }), "signInFailed"));
check("wrong rename PIN durably counts once and releases its reservation", byLogin(store(), "dune-new").guard.lifetime === renameFailuresBefore + 1 && Object.keys(byLogin(store(), "dune-new").guard.pending).length === 0);

// mediaKey and winSongId survive rename (inject mediaKey via editStore then verify via ownerView)
editStore((d) => {
  const p = d.profiles[duneId];
  p.mediaKey = "m_" + "a".repeat(32);
  p.winSongId = "song_one";
});
await h.stop();
h = await startHost();
const resumeAfterEdit = await (await client(h, tunnel())).req({ type: "profileResume", credential: duneCred });
check("mediaKey and winSongId survive rename+restart (they stay private)", resumeAfterEdit.type === "profileSession" && resumeAfterEdit.profile.login === "dune-new");
check("mediaKey not in owner view (stays private)", !("mediaKey" in resumeAfterEdit.profile));
check("winSongId is in owner view", resumeAfterEdit.profile.winSongId === "song_one");
const storeAfter = store().profiles[duneId];
check("mediaKey is preserved in store after rename", storeAfter.mediaKey === "m_" + "a".repeat(32));

// --- Rename race: two concurrent renames to the same login -------------------------------------------
await h.stop();
h = await startHost();
const duneC2 = await client(h, tunnel());
const duneC3 = await client(h, tunnel());
const duneRes2 = await (await client(h, tunnel())).req({ type: "profileLogin", login: "dune-new", pin: "7531" });
const duneCred2 = duneRes2.credential;
CREDENTIALS.add(duneCred2);
// Create another profile to race against
const raceRes = await (await client(h, tunnel())).req(fields("racer", "1111"));
const racerId = raceRes.profile.profileId;
const racerCred = raceRes.credential;
CREDENTIALS.add(racerCred);
// Both try to rename to "river"
const [raceA, raceB] = await Promise.all([
  duneC2.req({ type: "profileEdit", credential: duneCred2, login: "river", pin: "7531" }),
  duneC3.req({ type: "profileEdit", credential: racerCred, login: "river", pin: "1111" }),
]);
const raceWins = [raceA, raceB].filter((r) => r.type === "profileSession");
const raceFails = [raceA, raceB].filter((r) => r.type === "profileError");
check("rename race preserves exactly one login", raceWins.length === 1 && raceFails.length === 1, [raceA, raceB].map((r) => r.code ?? r.profile?.login));
const winnerLogin = raceWins[0].profile.login;
check("winning login is 'river'", winnerLogin === "river", raceWins[0].profile);
check("loser got loginTaken", raceFails[0].code === "loginTaken", raceFails[0]);

// --- PIN change revokes other credentials; budgets retained ------------------------------------------
const pcC1 = await client(h, tunnel());
const pcC2 = await client(h, tunnel());
const pcRes = await (await client(h, tunnel())).req(fields("cedar", "2222"));
const cedarId = pcRes.profile.profileId;
const cedarCred1 = pcRes.credential;
CREDENTIALS.add(cedarCred1);
const cedarRes2 = await (await client(h, tunnel())).req({ type: "profileLogin", login: "cedar", pin: "2222" });
const cedarCred2 = cedarRes2.credential;
CREDENTIALS.add(cedarCred2);
check("two devices for cedar", Object.values(store().devices).filter((d) => d.profileId === cedarId).length === 2);

// Record some failures first (to verify budgets are retained after PIN change)
await (await client(h, tunnel())).req({ type: "profileLogin", login: "cedar", pin: "0000" });
await (await client(h, tunnel())).req({ type: "profileLogin", login: "cedar", pin: "0001" });
const beforeLifetime = byLogin(store(), "cedar").guard.lifetime;
check("two failures recorded before PIN change", beforeLifetime === 2, beforeLifetime);

// Change PIN from device 1
const changePinRes = await pcC1.req({ type: "profileChangePin", credential: cedarCred1, currentPin: "2222", newPin: "3333", newPinConfirm: "3333" });
check("profileChangePin succeeds with correct current PIN", changePinRes.type === "profileSession", changePinRes);
check("PIN change issues a new credential", /^[A-Za-z0-9_-]{43}$/.test(changePinRes.credential), changePinRes);
const cedarCred3 = changePinRes.credential;
CREDENTIALS.add(cedarCred3);

// Old credentials are revoked
check("old credential 1 is revoked after PIN change", isErr(await (await client(h, tunnel())).req({ type: "profileResume", credential: cedarCred1 }), "signedOut"));
check("old credential 2 is revoked after PIN change", isErr(await (await client(h, tunnel())).req({ type: "profileResume", credential: cedarCred2 }), "signedOut"));
check("new credential works", (await (await client(h, tunnel())).req({ type: "profileResume", credential: cedarCred3 })).type === "profileSession");

// Budgets are retained (not replenished) after ordinary PIN change
const afterLifetime = byLogin(store(), "cedar").guard.lifetime;
check("lifetime budget is retained after PIN change (not replenished)", afterLifetime === beforeLifetime, { beforeLifetime, afterLifetime });
const pinFailuresBefore = byLogin(store(), "cedar").guard.lifetime;
check("wrong PIN is refused for changePin", isErr(await (await client(h, tunnel())).req({ type: "profileChangePin", credential: cedarCred3, currentPin: "0000", newPin: "4444", newPinConfirm: "4444" }), "signInFailed"));
check("wrong change PIN durably counts once and releases its reservation", byLogin(store(), "cedar").guard.lifetime === pinFailuresBefore + 1 && Object.keys(byLogin(store(), "cedar").guard.pending).length === 0);
check("mismatched newPin confirmation is rejected", isErr(await pcC1.req({ type: "profileChangePin", credential: cedarCred3, currentPin: "3333", newPin: "5555", newPinConfirm: "5556" }), "invalid"));

// --- Lifetime lock blocks changePin via device -------------------------------------------------------
// Use pine profile: accumulate 30 failures then try changePin
// Get pine's current lifetime
let pineLifetime = byLogin(store(), "pine").guard.lifetime;
const failsNeeded = 30 - pineLifetime;
// Backdate any existing failures so windows are clear
editStore((d) => (byLogin(d, "pine").guard.times = byLogin(d, "pine").guard.times.map((t) => t - 2 * 25 * 60 * 60 * 1000)));
await h.stop();
h = await startHost();
for (let round = 0; round < Math.ceil(failsNeeded / 5); round++) {
  // Clear the 15-minute window and the daily window every 2 rounds (every 10 failures).
  const shift = round % 2 === 0 ? 26 * 60 * 60 * 1000 : 25 * MIN;
  editStore((d) => (byLogin(d, "pine").guard.times = byLogin(d, "pine").guard.times.map((t) => t - shift)));
  await h.stop();
  h = await startHost();
  for (let i = 0; i < Math.min(5, failsNeeded - round * 5); i++) {
    await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: String(3000 + round * 5 + i) });
  }
}
const pineLifetimeAfter = byLogin(store(), "pine").guard.lifetime;
check("pine has 30 lifetime failures", pineLifetimeAfter >= 30, pineLifetimeAfter);

// Resume still works with the remembered device credential
const pineResumed = await (await client(h, tunnel())).req({ type: "profileResume", credential: pineCred });
check("lifetime-locked profile still resumes via device credential", pineResumed.type === "profileSession", pineResumed);

// changePin is blocked even with correct current PIN and valid device
const pineLocked = await (await client(h, tunnel())).req({ type: "profileChangePin", credential: pineCred, currentPin: "8642", newPin: "9999", newPinConfirm: "9999" });
check("lifetime lock blocks changePin even with correct PIN and valid device", isErr(pineLocked, "pinLocked"), pineLocked);
check("pinLocked message is informative", pineLocked.message === "PIN changes are locked. Contact the host for a verified local reset.", pineLocked.message);

// Stolen-device + 30 failures cannot reset PIN
check("stolen device + lifetime lock cannot change PIN", isErr(await (await client(h, tunnel())).req({ type: "profileChangePin", credential: pineCred, currentPin: "8642", newPin: "9999", newPinConfirm: "9999" }), "pinLocked"));

// --- Local reset: clear locks, revoke devices, issue temp PIN ----------------------------------------
// Stop host so admin can take the lock.
await h.stop();

const adminRes1 = await runAdmin(["pine"]);
check("admin resets pine and shows temp PIN", adminRes1.code === 0 && /Temporary PIN:/.test(adminRes1.stdout), { stdout: adminRes1.stdout.slice(0, 200), code: adminRes1.code });
const tempPinMatch = adminRes1.stdout.match(/Temporary PIN:\s*(\d{4})/);
check("temp PIN is exactly 4 digits", !!tempPinMatch, adminRes1.stdout);
const tempPin = tempPinMatch[1];
PINS.add(tempPin);

// Verify store state after reset
const pineAfterReset = byLogin(store(), "pine");
check("lifetime lock is cleared after local reset", pineAfterReset.guard.lifetime === 0, pineAfterReset.guard);
check("failure times are cleared after local reset", pineAfterReset.guard.times.length === 0, pineAfterReset.guard);
check("pinMustChange is true after local reset", pineAfterReset.pinMustChange === true, pineAfterReset);
check("tempPinExpiresAt is set after local reset", typeof pineAfterReset.tempPinExpiresAt === "number" && pineAfterReset.tempPinExpiresAt > Date.now(), pineAfterReset.tempPinExpiresAt);
check("all devices are revoked after local reset", !Object.values(store().devices).some((d) => d.profileId === pineId), store().devices);

// Restart host and log in with temp PIN
h = await startHost();
const tempLoginRes = await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: tempPin });
check("temp PIN can log in successfully", tempLoginRes.type === "profileSession", tempLoginRes);
check("session shows pinMustChange=true after temp PIN login", tempLoginRes.profile.pinMustChange === true, tempLoginRes.profile);
const tempCred = tempLoginRes.credential;
CREDENTIALS.add(tempCred);

// --- Temp PIN requires change before ordinary edit ---------------------------------------------------
const mustChangeRes = await (await client(h, tunnel())).req({ type: "profileEdit", credential: tempCred, displayName: "PineNew" });
check("profileEdit is refused when pinMustChange is true", isErr(mustChangeRes, "mustChangePin"), mustChangeRes);
check("mustChangePin message is informative", mustChangeRes.message === "Change your PIN before continuing.", mustChangeRes.message);

// But profileChangePin works
const changeTempRes = await (await client(h, tunnel())).req({ type: "profileChangePin", credential: tempCred, currentPin: tempPin, newPin: "8642", newPinConfirm: "8642" });
check("profileChangePin clears pinMustChange", changeTempRes.type === "profileSession" && !changeTempRes.profile.pinMustChange, changeTempRes);
const postChangeCred = changeTempRes.credential;
CREDENTIALS.add(postChangeCred);
check("old temp credential is revoked after changePin", isErr(await (await client(h, tunnel())).req({ type: "profileResume", credential: tempCred }), "signedOut"));

// Can now edit after PIN change
const editAfterChange = await (await client(h, tunnel())).req({ type: "profileEdit", credential: postChangeCred, displayName: "PineFixed" });
check("profileEdit works after PIN change", editAfterChange.type === "profileSession", editAfterChange);

// --- Temp PIN guessing limits apply ------------------------------------------------------------------
await h.stop();
const adminRes2 = await runAdmin(["pine"]);
const tempPin2Match = adminRes2.stdout.match(/Temporary PIN:\s*(\d{4})/);
check("second admin reset works", adminRes2.code === 0 && tempPin2Match, adminRes2.stdout.slice(0, 100));
const tempPin2 = tempPin2Match[1];
PINS.add(tempPin2);

h = await startHost();
// Make 5 wrong guesses against the temp PIN - should hit cooldown
for (let i = 0; i < 5; i++) {
  const r = await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: String(5000 + i) });
  check(`wrong guess ${i + 1} against temp PIN fails`, isErr(r, "signInFailed"), r);
}
check("5 wrong guesses against temp PIN are counted", byLogin(store(), "pine").guard.lifetime === 5);
check("correct temp PIN is refused during cooldown after 5 failures", isErr(await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: tempPin2 }), "signInFailed"));

// --- Expired temp PIN: login fails; no previous PIN or devices restored; another reset recovers ------
await h.stop();
const adminRes3 = await runAdmin(["pine"]);
const tempPin3Match = adminRes3.stdout.match(/Temporary PIN:\s*(\d{4})/);
const tempPin3 = tempPin3Match[1];
PINS.add(tempPin3);
const pineBeforeExpiry = byLogin(store(), "pine");
const expiresAt = pineBeforeExpiry.tempPinExpiresAt;
// Backdate tempPinExpiresAt to simulate expiry
editStore((d) => {
  byLogin(d, "pine").tempPinExpiresAt = Date.now() - 1;
});
h = await startHost();

// Login with the correct (now-expired) temp PIN should fail
const expiredLoginRes = await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: tempPin3 });
check("expired temp PIN login fails with signInFailed", isErr(expiredLoginRes, "signInFailed"), expiredLoginRes);
check("failure budget increments on expired-PIN attempt", byLogin(store(), "pine").guard.lifetime === 1);

// Devices are NOT restored (still revoked from reset)
check("devices are NOT restored after temp PIN expiry", !Object.values(store().devices).some((d) => d.profileId === pineId));

// pinMustChange is still true (profile not accessible)
check("pinMustChange stays true after expiry", byLogin(store(), "pine").pinMustChange === true);

// Another local reset recovers the profile
await h.stop();
const adminRes4 = await runAdmin(["pine"]);
const tempPin4Match = adminRes4.stdout.match(/Temporary PIN:\s*(\d{4})/);
check("another local reset works after expired temp PIN", adminRes4.code === 0 && tempPin4Match, adminRes4.stdout.slice(0, 100));
const tempPin4 = tempPin4Match[1];
PINS.add(tempPin4);

h = await startHost();
const recoveredLogin = await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: tempPin4 });
check("new temp PIN from second reset works", recoveredLogin.type === "profileSession", recoveredLogin);
// Change it to restore normal access
const recoveredCred = recoveredLogin.credential;
CREDENTIALS.add(recoveredCred);
const recoveredChange = await (await client(h, tunnel())).req({ type: "profileChangePin", credential: recoveredCred, currentPin: tempPin4, newPin: "8642", newPinConfirm: "8642" });
check("pine fully recovered after two resets", recoveredChange.type === "profileSession" && !recoveredChange.profile.pinMustChange, recoveredChange);

// --- Command/store writer exclusion ------------------------------------------------------------------
// While host is running, admin should be refused (locked).
const adminWhileLive = await runAdmin(["pine"]);
check("admin is refused while host holds the lock", adminWhileLive.code !== 0 && /locked|cannot open/i.test(adminWhileLive.stderr), { code: adminWhileLive.code, stderr: adminWhileLive.stderr });

// While admin holds lock, a second host on the same dir should refuse profiles.
await h.stop();
// Start admin in background (it will wait for stdin), then try to start second host.
const adminProc = spawn(
  process.execPath,
  ["--import", "./register.mjs", "profile-admin.mjs", "pine"],
  {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PROFILES_DIR },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
let adminOut = "";
adminProc.stdout.on("data", (d) => (adminOut += d));
// Wait for admin to print its prompt (it has the lock).
for (const until = Date.now() + 10000; !adminOut.includes("verified") && Date.now() < until; await wait(50));
// Now try to start a host that would compete for the same store.
const h2 = await startHost();
const conflictHello = await (await client(h2, tunnel())).req({ type: "profileHello" });
check("a second host on same profile dir refuses profiles while admin holds lock", conflictHello.available === false && conflictHello.reason === "unavailable", conflictHello);
adminProc.stdin.write("no\n");
adminProc.stdin.end();
await new Promise((res) => adminProc.once("exit", res));
await h2.stop();

// --- Seat recovery is independent (guest rejoin works alongside profile traffic) --------------------
h = await startHost();
const gA = await client(h);
const gB = await client(h);
gA.send({ type: "hello", name: "Alpha" });
const wa = await gA.next((m) => m.type === "welcome", 5000, "welcome A");
gB.send({ type: "hello", code: wa.code, name: "Beta" });
const wb = await gB.next((m) => m.type === "welcome", 5000, "welcome B");
gB.ws.terminate();
await gA.next((m) => m.type === "log" && /lost connection/.test(m.text), 5000, "drop log");
const gC = await client(h);
gC.send({ type: "hello", code: wa.code, secret: wb.secret });
const wr = await gC.next((m) => m.type === "welcome", 5000, "rejoin welcome");
check("guest seat rejoin works alongside profile traffic", wr.code === wa.code && wr.you === wb.you, wr);

// --- No secret logging -------------------------------------------------------------------------------
// Collect all stdout/stderr from this process (we spy on what profile-admin printed already in adminRes1).
// The admin already printed the temp PIN to stdout (as required), but the PIN must not appear in
// server logs or game frames. Check that test-fixture PINs don't appear in game frames.
const g2A = await client(h);
const g2B = await client(h);
g2A.send({ type: "hello", name: "P" });
const w2 = await g2A.next((m) => m.type === "welcome", 5000, "g2 welcome");
g2B.send({ type: "hello", code: w2.code, name: "Q" });
await g2B.next((m) => m.type === "welcome", 5000, "g2B welcome");
g2A.send({ type: "addBot" });
g2A.send({ type: "ready", value: true });
g2B.send({ type: "ready", value: true });
await wait(200);
g2A.send({ type: "start" });
await g2B.next((m) => m.type === "state", 5000, "game state");
const frames = [...g2A.inbox, ...g2B.inbox].map((m) => JSON.stringify(m)).join("\n");
check("game frames contain no fixture PINs", ![...PINS].some((p) => frames.includes(`"${p}"`)), { sample: frames.slice(0, 200) });
check("game frames contain no credentials", ![...CREDENTIALS].some((c) => frames.includes(c)));

// --- Restart durability: reopen store, state is preserved -------------------------------------------
const duneC4 = await client(h, tunnel());
const duneLoginPostRestart = await duneC4.req({ type: "profileLogin", login: "river", pin: "7531" });
check("dune (renamed to river) login survives across restarts", duneLoginPostRestart.type === "profileSession" && duneLoginPostRestart.profile.profileId === duneId, duneLoginPostRestart);
const duneCredPost = duneLoginPostRestart.credential;
CREDENTIALS.add(duneCredPost);
await h.stop();
h = await startHost();
const duneResumeAfter = await (await client(h, tunnel())).req({ type: "profileResume", credential: duneCredPost });
check("credential survives restart", duneResumeAfter.type === "profileSession" && duneResumeAfter.profile.login === "river", duneResumeAfter);
const cedarResumeAfter = await (await client(h, tunnel())).req({ type: "profileResume", credential: cedarCred3 });
check("cedar credential and new PIN survive restart", cedarResumeAfter.type === "profileSession");
check("cedar pinMustChange stays false after restart", !cedarResumeAfter.profile.pinMustChange);
const pineResumeAfter = await (await client(h, tunnel())).req({ type: "profileLogin", login: "pine", pin: "8642" });
check("pine normal login works after recovery and restart", pineResumeAfter.type === "profileSession");
check("reserved logins survive restart", !!store().reservedLogins["dune"]);

await h.stop();

  const firstOwner = await runStoreFixture("prepare");
  const nextOwner = await runStoreFixture("reopen");
  check("direct-store reopening uses a different process", firstOwner !== nextOwner);
}

// Direct store calls make queued revocation races and expiry clocks deterministic.
if (fixtureStage) {
  const dir = path.join(PROFILES_DIR, "race-clock");
  const checkpoint = path.join(PROFILES_DIR, "race-clock-checkpoint.json");
  const saved = fixtureStage === "reopen" ? JSON.parse(readFileSync(checkpoint, "utf8")) : null;
  let now = saved?.now ?? Date.now();
  let db;
  let made;
  if (fixtureStage === "prepare") {
  db = openProfiles(dir, { colors: PLAYER_COLORS, clock: () => now });
  const codeOf = p => p.then(() => null, e => e.code);
  made = await db.create(fields("racer", "1234"));
  const rename = codeOf(db.profileEdit(made.token, { login: "racer-next", pin: "1234" }));
  await db.logout(made.token);
  check("logout during a queued rename refuses its commit", await rename === "signedOut");
  check("revoked rename leaves login and reservations intact", db.profile(made.profile.profileId).login === "racer" && Object.keys(db.profile(made.profile.profileId).guard.pending).length === 0);
  const signed = await db.login("racer", "1234");
  const change = codeOf(db.profileChangePin(signed.token, "1234", "5678", "5678"));
  await db.logout(signed.token);
  check("logout during PIN hashing cannot issue a replacement credential", await change === "signedOut");
  check("a refused queued PIN change leaves the old PIN usable", !!(await db.login("racer", "1234")).token);

  const editSession = await db.login("racer", "1234");
  const loggingOut = db.logout(editSession.token);
  const textEdit = codeOf(db.profileEdit(editSession.token, { displayName: "Revoked" }));
  await loggingOut;
  check("queued text edits also recheck credential revocation", await textEdit === "signedOut" && db.profile(made.profile.profileId).displayName !== "Revoked");
  const resetting = db.localResetPin(made.profile.profileId);
  const staleLogin = codeOf(db.login("racer", "1234"));
  const reset = await resetting;
  check("in-flight old-PIN login cannot survive a local reset", await staleLogin === "signInFailed");
  const temp = await db.login("racer", reset.tempPin);
  check("temporary credential cannot bind a table profile", seatCredential(db, { profileGate: { credentials: true } }, { credential: temp.token }, () => false).code === "mustChangePin");
  now += TEMP_PIN_MS + 1;
  let resumeCode;
  try { db.resume(temp.token); } catch (e) { resumeCode = e.code; }
  check("expired temporary credential cannot resume a profile", resumeCode === "signInFailed");
  check("expired temporary credential cannot change its PIN", await codeOf(db.profileChangePin(temp.token, reset.tempPin, "6789", "6789")) === "signInFailed");
  check("expiry keeps the profile locked and the attempt counted", db.profile(made.profile.profileId).pinMustChange && db.profile(made.profile.profileId).guard.lifetime === 1);
  writeFileSync(checkpoint, JSON.stringify({ now, profileId: made.profile.profileId }), { mode: 0o600 });
  } else {
  made = { profile: { profileId: saved.profileId } };
  db = openProfiles(dir, { colors: PLAYER_COLORS, clock: () => now });
  check("expiry lock and failed attempt survive reopening", db.profile(made.profile.profileId).pinMustChange && db.profile(made.profile.profileId).guard.lifetime === 1);
  const resetAgain = await db.localResetPin(made.profile.profileId);
  const recovered = await db.login("racer", resetAgain.tempPin);
  check("a verified second reset allows required PIN change", !!(await db.profileChangePin(recovered.token, resetAgain.tempPin, "6789", "6789")).token);
  const beforeFailure = JSON.stringify(db.profile(made.profile.profileId));
  const normalN = SCRYPT.N;
  let hashFailed = false;
  try {
    SCRYPT.N = 3; // Force the synchronous scrypt failure path without allocating memory.
    await db.localResetPin(made.profile.profileId);
  } catch { hashFailed = true; }
  finally { SCRYPT.N = normalN; }
  check("failed reset hashing leaves the profile unchanged", hashFailed && JSON.stringify(db.profile(made.profile.profileId)) === beforeFailure);
  let slots = 0;
  while (slots < 12 && db.claimHash()) slots++;
  check("failed reset hashing releases exactly one queue slot", slots === 9);
  const accidentalDir = path.join(PROFILES_DIR, "not-a-store");
  const noDirectory = await runAdmin([accidentalDir], "YES\n", null);
  check("admin refuses a missing store directory before creating anything", noDirectory.code === 2 && !existsSync(accidentalDir));
  }
  await new Promise((resolve, reject) => process.send({ checks: passed }, error => error ? reject(error) : resolve()));
  process.exit(0);
}

console.log(`\nprofile-edit-prove: ${passed} checks passed`);
process.exit(0);
