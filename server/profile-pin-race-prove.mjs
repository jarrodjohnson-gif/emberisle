// #1078: two valid device PIN changes race, but only one may commit.
// Crypto and durable writes stay native; hold one completed verification callback until both reservations exist.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-pin-race-"));
const original = crypto.scrypt;
const oldPin = "2468";
const candidates = ["3579", "8642"];
let armed = false, racing = false, held = null, verifications = 0, passed = 0;
let signalVerified;
const verified = new Promise(resolve => { signalVerified = resolve; });
const disk = () => JSON.parse(readFileSync(path.join(dir, "profiles.json"), "utf8"));
const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const watchdog = setTimeout(() => { console.error("FAIL PIN race proof exceeded 30 seconds"); process.exit(1); }, 30_000);
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

crypto.scrypt = function (...args) {
  if (racing && args[0] === oldPin) verifications++;
  if (armed && args[0] === oldPin) {
    armed = false;
    const callback = args.at(-1);
    args[args.length - 1] = (error, key) => {
      held = { error, key, callback };
      signalVerified();
    };
  }
  return original(...args);
};
syncBuiltinESMExports();

try {
  const { openProfiles } = await import("./profiles.mjs");
  const store = openProfiles(dir, { colors: ["red", "blue"] });
  const first = await store.create({ displayName: "Owner", login: "owner", color: "red", pin: oldPin, pinConfirm: oldPin });
  const id = first.profile.profileId;
  await assert.rejects(store.login("owner", "0000"), error => error.code === "signInFailed");
  const second = await store.login("owner", oldPin);
  const before = disk().profiles[id].guard;
  check("fixture has two usable device credentials and one charged failure", first.token !== second.token && store.validate(first.token) === id && store.validate(second.token) === id && before.lifetime === 1);

  const settle = promise => promise.then(value => ({ ok: true, value }), error => ({ ok: false, code: error.code }));
  armed = racing = true;
  const changes = [first, second].map((device, i) => settle(store.profileChangePin(device.token, oldPin, candidates[i], candidates[i])));
  await verified;
  check("held verification result came from successful native crypto", held !== null && !held.error && Buffer.isBuffer(held.key));
  const deadline = Date.now() + 3000;
  while (Object.keys(disk().profiles[id].guard.pending).length !== 2 && Date.now() < deadline) await wait(5);
  const reserved = disk().profiles[id];
  check("both competing changes have durable reservations before either can commit", Object.keys(reserved.guard.pending).length === 2);
  check("reserving changes does not replenish the failure budget", reserved.guard.lifetime === before.lifetime && JSON.stringify(reserved.guard.times) === JSON.stringify(before.times));
  check("the original devices remain usable before releasing verification", store.validate(first.token) === id && store.validate(second.token) === id && Object.keys(disk().devices).length === 2);
  const completed = held;
  held = null;
  completed.callback(completed.error, completed.key);
  const results = await Promise.all(changes);
  racing = false;
  check("both requests verify against their reserved original PIN", verifications === 2);
  check("exactly one concurrent PIN change succeeds", results.filter(result => result.ok).length === 1);
  const winner = results.findIndex(result => result.ok);
  const loser = 1 - winner;
  check("the stale competing change returns signedOut", !results[loser].ok && results[loser].code === "signedOut");
  check("the winning replacement credential is usable", store.validate(results[winner].value.token) === id);
  check("both old device credentials are revoked", store.validate(first.token) === null && store.validate(second.token) === null);
  const after = disk();
  check("only the winning replacement is persisted", Object.keys(after.devices).length === 1 && Object.values(after.devices)[0].profileId === id);
  check("both reservations disappear without charging the stale loser", Object.keys(after.profiles[id].guard.pending).length === 0 && after.profiles[id].guard.lifetime === before.lifetime && JSON.stringify(after.profiles[id].guard.times) === JSON.stringify(before.times));
  const signedIn = await store.login("owner", candidates[winner]);
  check("the winning PIN signs in normally", signedIn.profile.profileId === id && store.validate(signedIn.token) === id);
  await assert.rejects(store.login("owner", candidates[loser]), error => error.code === "signInFailed");
  check("the losing candidate never becomes the PIN and its later failure counts once", disk().profiles[id].guard.lifetime === before.lifetime + 1);
  check("later sign-in attempts preserve the winning replacement", store.validate(results[winner].value.token) === id && Object.keys(disk().profiles[id].guard.pending).length === 0 && store.ready);
  console.log(`profile-pin-race-prove: ${passed} checks passed`);
} finally {
  if (held) held.callback(held.error, held.key);
  crypto.scrypt = original;
  syncBuiltinESMExports();
  clearTimeout(watchdog);
  rmSync(dir, { recursive: true, force: true });
}
