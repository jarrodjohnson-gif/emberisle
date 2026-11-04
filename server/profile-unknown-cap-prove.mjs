// #1006: bounded unknown-login guards, retained budgets and expiry in the real store.
// Observe native scrypt calls; never replace their work or results.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-unknown-cap-"));
const original = crypto.scrypt;
let derivations = 0;
let passed = 0;
let now = Date.now();
const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };
const disk = () => JSON.parse(readFileSync(path.join(dir, "profiles.json"), "utf8"));
const watchdog = setTimeout(() => {
  console.error("FAIL unknown-login guard proof exceeded 30 seconds");
  process.exit(1);
}, 30_000);
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
crypto.scrypt = (...args) => { derivations++; return original(...args); };
syncBuiltinESMExports();

try {
  const { openProfiles, DAY_MS } = await import("./profiles.mjs");
  const store = openProfiles(dir, { colors: ["red", "blue"], clock: () => now });
  check("the real store opens", store.ready);
  const owner = await store.create({ displayName: "Owner", login: "owner", color: "red", pin: "2468", pinConfirm: "2468" });
  const id = owner.profile.profileId;
  const profileBudget = { times: [now - 1, now], pending: {}, lifetime: 2 };
  await store.mutate((d) => {
    d.profiles[id].guard = structuredClone(profileBudget);
    d.unknownLogins = Object.fromEntries(Array.from({ length: 1024 }, (_, i) => [
      `guard-${i}`, { times: [now], pending: {}, lifetime: 0 },
    ]));
  });
  const filled = disk();
  check("all 1024 live unknown budgets are persisted", Object.keys(filled.unknownLogins).length === 1024);
  const failure = async (login) => {
    try { await store.login(login, "1357"); }
    catch (error) { check(`${login}: the ordinary sign-in failure returns`, error.code === "signInFailed"); return; }
    assert.fail(`${login}: an unknown login signed in`);
  };

  let before = derivations;
  await failure("new-unknown");
  let saved = disk();
  check("a new unknown login at capacity still runs one real dummy derivation", derivations === before + 1);
  check("replacement keeps exactly 1024 buckets", Object.keys(saved.unknownLogins).length === 1024);
  const removed = Object.keys(filled.unknownLogins).filter((name) => !(name in saved.unknownLogins));
  check("exactly one old bucket is replaced", removed.length === 1);
  check("the new failure is durably counted without a pending reservation", saved.unknownLogins["new-unknown"].times.length === 1 && Object.keys(saved.unknownLogins["new-unknown"].pending).length === 0);
  check("all retained old budgets are unchanged", Object.entries(filled.unknownLogins).every(([name, guard]) => removed.includes(name) || JSON.stringify(saved.unknownLogins[name]) === JSON.stringify(guard)));
  check("replacement cannot reset the real profile's budget", JSON.stringify(saved.profiles[id].guard) === JSON.stringify(profileBudget));

  const retained = Object.keys(filled.unknownLogins).find((name) => name in saved.unknownLogins);
  const previous = saved;
  before = derivations;
  await failure(retained);
  saved = disk();
  check("an existing unknown login still derives at capacity", derivations === before + 1);
  check("an existing bucket adds exactly its own failure", saved.unknownLogins[retained].times.length === 2 && Object.keys(saved.unknownLogins[retained].pending).length === 0);
  check("existing-login work neither replaces nor resets other buckets", Object.keys(saved.unknownLogins).length === 1024 && Object.entries(previous.unknownLogins).every(([name, guard]) => name === retained || JSON.stringify(saved.unknownLogins[name]) === JSON.stringify(guard)));

  const beforeKnown = structuredClone(saved.unknownLogins);
  before = derivations;
  const signedIn = await store.login("owner", "2468");
  saved = disk();
  check("a real profile can sign in while the unknown table is full", derivations === before + 1 && signedIn.profile.profileId === id && store.validate(signedIn.token) === id);
  check("successful sign-in preserves the profile's existing failure budget", JSON.stringify(saved.profiles[id].guard) === JSON.stringify(profileBudget));
  check("successful sign-in leaves all unknown budgets intact", JSON.stringify(saved.unknownLogins) === JSON.stringify(beforeKnown));

  now += DAY_MS + 1;
  before = derivations;
  await failure("after-expiry");
  saved = disk();
  check("expired buckets are reclaimed before admitting new work", Object.keys(saved.unknownLogins).join() === "after-expiry");
  check("the post-expiry failure uses real derivation and its new timestamp", derivations === before + 1 && saved.unknownLogins["after-expiry"].times.length === 1 && saved.unknownLogins["after-expiry"].times[0] === now && Object.keys(saved.unknownLogins["after-expiry"].pending).length === 0);
  check("profile rolling failures expire without resetting lifetime failures", saved.profiles[id].guard.times.length === 0 && saved.profiles[id].guard.lifetime === 2 && Object.keys(saved.profiles[id].guard.pending).length === 0);
  check("guard cleanup preserves valid remembered credentials", store.validate(owner.token) === id && store.validate(signedIn.token) === id);
  check("the durable store remains usable", store.ready);
  console.log(`profile-unknown-cap-prove: ${passed} checks passed; ${derivations} native derivations`);
} finally {
  crypto.scrypt = original;
  syncBuiltinESMExports();
  clearTimeout(watchdog);
  rmSync(dir, { recursive: true, force: true });
}
