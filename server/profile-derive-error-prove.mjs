// #1008: login derivation failures charge their reservation; optional rehash failure keeps sign-in usable.
// Native crypto does ordinary work. Only the selected derivation throws or calls back with an error.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-derive-error-"));
const original = crypto.scrypt;
const now = Date.now();
let injection = null;
let nativeCalls = 0;
let injectedCalls = 0;
let passed = 0;
const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };
const disk = () => JSON.parse(readFileSync(path.join(dir, "profiles.json"), "utf8"));
const watchdog = setTimeout(() => { console.error("FAIL derivation error proof exceeded 30 seconds"); process.exit(1); }, 30_000);
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
crypto.scrypt = (...args) => {
  if (injection && args[3].N === injection.N) {
    const { mode } = injection;
    injection = null;
    injectedCalls++;
    const error = new Error(`injected ${mode} derivation failure`);
    if (mode === "throw") throw error;
    queueMicrotask(() => args.at(-1)(error));
    return;
  }
  nativeCalls++;
  return original(...args);
};
syncBuiltinESMExports();

try {
  const { openProfiles, SCRYPT } = await import("./profiles.mjs");
  const store = openProfiles(dir, { colors: ["red", "blue"], clock: () => now });
  const owner = await store.create({ displayName: "Owner", login: "owner", color: "red", pin: "2468", pinConfirm: "2468" });
  const id = owner.profile.profileId;
  const credentials = [owner.token];
  const profile = () => disk().profiles[id];
  const verifier = profile().pin;

  for (const [i, mode] of ["throw", "callback"].entries()) {
    const before = nativeCalls;
    injection = { mode, N: SCRYPT.N };
    let failure;
    try { await store.login("owner", "2468"); } catch (error) { failure = error; }
    check(`${mode}: a verification error returns the ordinary failure`, failure?.code === "signInFailed");
    check(`${mode}: the selected error ran without a replacement native derivation`, injection === null && nativeCalls === before);
    const saved = profile();
    check(`${mode}: its reservation is durably charged exactly once`, saved.guard.lifetime === i + 1 && saved.guard.times.length === i + 1 && saved.guard.times.every((at) => at === now) && Object.keys(saved.guard.pending).length === 0);
    check(`${mode}: no verifier or device credential changes`, JSON.stringify(saved.pin) === JSON.stringify(verifier) && Object.keys(disk().devices).length === 1 && store.validate(owner.token) === id);
  }

  const recovered = await store.login("owner", "2468");
  credentials.push(recovered.token);
  check("normal sign-in progresses after both verification error paths", recovered.profile.profileId === id && store.validate(recovered.token) === id);
  const budget = profile().guard;
  check("successful recovery preserves both charged failures", budget.lifetime === 2 && budget.times.length === 2 && Object.keys(budget.pending).length === 0);

  const salt = crypto.randomBytes(16);
  const legacy = { alg: "scrypt", N: 16384, r: 8, p: 1, salt: salt.toString("base64"), hash: crypto.scryptSync("2468", salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64") };
  await store.mutate((d) => { d.profiles[id].pin = legacy; });
  for (const mode of ["throw", "callback"]) {
    const before = nativeCalls;
    injection = { mode, N: SCRYPT.N };
    const signedIn = await store.login("owner", "2468");
    credentials.push(signedIn.token);
    check(`${mode}: correct legacy PIN still signs in when its upgrade fails`, signedIn.profile.profileId === id && store.validate(signedIn.token) === id);
    check(`${mode}: real legacy verification precedes the injected upgrade error`, injection === null && nativeCalls === before + 1);
    const saved = profile();
    check(`${mode}: the old verifier remains byte-for-byte intact`, JSON.stringify(saved.pin) === JSON.stringify(legacy));
    check(`${mode}: optional upgrade failure does not charge or reset the budget`, JSON.stringify(saved.guard) === JSON.stringify(budget));
  }

  const upgraded = await store.login("owner", "2468");
  credentials.push(upgraded.token);
  const saved = profile();
  check("a later successful upgrade installs accepted parameters", saved.pin.N === SCRYPT.N && saved.pin.r === SCRYPT.r && saved.pin.p === SCRYPT.p && saved.pin.salt !== legacy.salt);
  const key = crypto.scryptSync("2468", Buffer.from(saved.pin.salt, "base64"), 32, SCRYPT);
  check("the upgraded verifier still verifies the same correct PIN", crypto.timingSafeEqual(key, Buffer.from(saved.pin.hash, "base64")));
  check("successful upgrade preserves the failure budget", JSON.stringify(saved.guard) === JSON.stringify(budget));
  check("all five legitimately issued credentials remain usable", credentials.length === 5 && credentials.every((token) => store.validate(token) === id));
  check("all four selected errors were exercised and the store stays ready", injectedCalls === 4 && injection === null && store.ready);
  console.log(`profile-derive-error-prove: ${passed} checks passed; ${nativeCalls} native async derivations, ${injectedCalls} injected errors`);
} finally {
  crypto.scrypt = original;
  syncBuiltinESMExports();
  clearTimeout(watchdog);
  rmSync(dir, { recursive: true, force: true });
}
