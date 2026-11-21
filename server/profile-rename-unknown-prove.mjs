// Renaming a profile to a login with prior failed unknown-login or unknown-recovery entries must clear those stale entries
// so profiles.json stays valid across restarts (validDoc forbids a login in both logins and unknownLogins).
// Run from the repo root: node --import ./server/register.mjs server/profile-rename-unknown-prove.mjs
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openProfiles, validDoc } from "./profiles.mjs";

const COLORS = ["red", "blue"];
const PIN = "4821";
const dirs = [];
const makeDir = (tag) => {
  const d = mkdtempSync(path.join(tmpdir(), `emberisle-rename-unknown-${tag}-`));
  dirs.push(d);
  return d;
};
process.on("exit", () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const watchdog = setTimeout(() => {
  console.error("FAIL profile-rename-unknown-prove exceeded 60 seconds");
  process.exit(1);
}, 60_000);
watchdog.unref?.();

let checks = 0;
const check = (name, cond, detail) => {
  assert.ok(cond, `${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  checks++;
  console.log(`ok ${name}`);
};
const refusal = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.code ?? e.message;
  }
};

const dir = makeDir("main");
const readDoc = () => JSON.parse(readFileSync(path.join(dir, "profiles.json"), "utf8"));
const reopenCopy = (tag) => {
  const copyDir = makeDir(tag);
  copyFileSync(path.join(dir, "profiles.json"), path.join(copyDir, "profiles.json"));
  return openProfiles(copyDir, { colors: COLORS });
};

const store = openProfiles(dir, { colors: COLORS });
check("real profile store opens", store.ready);

const a = await store.create({ displayName: "Ember", login: "ember-one", color: "red", pin: PIN, pinConfirm: PIN }, { recovery: true });
const b = await store.create({ displayName: "Bay", login: "bay-two", color: "blue", pin: "1357", pinConfirm: "1357" }, { recovery: true });
const id = a.profile.profileId;
const origRecovery = store.profile(id).recovery;

// Scenario 1: failed login + recovery on unused handle, then rename to that handle.
check("failed login against unused nova-isle is refused", (await refusal(() => store.login("nova-isle", "0000"))) === "signInFailed");
check("failed recovery against unused nova-isle is refused", (await refusal(() => store.recover("nova-isle", "234567", "9999", "9999"))) === "recoverFailed");
let raw = readDoc();
check("unknownLogins records nova-isle before rename", Object.hasOwn(raw.unknownLogins, "nova-isle"));
check("unknownRecovery records nova-isle before rename", Object.hasOwn(raw.unknownRecovery ?? {}, "nova-isle"));

const r1 = await store.profileEdit(a.token, { login: "nova-isle", pin: PIN });
check("rename to nova-isle succeeds", r1.profile.login === "nova-isle");
raw = readDoc();
check("unknownLogins drops nova-isle after rename", !Object.hasOwn(raw.unknownLogins, "nova-isle"), raw.unknownLogins);
check("unknownRecovery drops nova-isle after rename", !Object.hasOwn(raw.unknownRecovery ?? {}, "nova-isle"), raw.unknownRecovery);
check("on-disk profiles.json passes validDoc after rename", validDoc(raw, COLORS));
check("profile keeps its own recovery verifier across rename", store.profile(id).recovery?.hash === origRecovery.hash);

const restarted1 = reopenCopy("restart1");
check("reopened store after new-handle rename is ready", restarted1.ready && restarted1.reason === null, restarted1.reason);
check("reopened store resumes renamed profile", restarted1.resume(a.token).profile.login === "nova-isle");
check("reopened store authenticates nova-isle login", (await restarted1.login("nova-isle", PIN)).profile.profileId === id);

// Scenario 2: failed login + recovery on own former reserved login, then reclaim it.
check("failed login against reserved ember-one is refused", (await refusal(() => store.login("ember-one", "0000"))) === "signInFailed");
check("failed recovery against reserved ember-one is refused", (await refusal(() => store.recover("ember-one", "234567", "9999", "9999"))) === "recoverFailed");
raw = readDoc();
check("unknownLogins records reserved ember-one", Object.hasOwn(raw.unknownLogins, "ember-one"));
check("unknownRecovery records reserved ember-one", Object.hasOwn(raw.unknownRecovery ?? {}, "ember-one"));

const r2 = await store.profileEdit(a.token, { login: "ember-one", pin: PIN });
check("reclaiming own former login ember-one succeeds", r2.profile.login === "ember-one");
raw = readDoc();
check("unknownLogins drops reclaimed ember-one", !Object.hasOwn(raw.unknownLogins, "ember-one"), raw.unknownLogins);
check("unknownRecovery drops reclaimed ember-one", !Object.hasOwn(raw.unknownRecovery ?? {}, "ember-one"), raw.unknownRecovery);
check("reservedLogins releases ember-one and reserves nova-isle", !Object.hasOwn(raw.reservedLogins, "ember-one") && raw.reservedLogins["nova-isle"] === id);
check("on-disk profiles.json passes validDoc after reclaim", validDoc(raw, COLORS));

const restarted2 = reopenCopy("restart2");
check("reopened store after reclaim is ready", restarted2.ready && restarted2.reason === null, restarted2.reason);
check("reopened store resolves reclaimed login and bystander", restarted2.lookupLogin("ember-one") === id && restarted2.lookupLogin("bay-two") === b.profile.profileId);

// Scenario 3: concurrent login/recover against race-name while renaming to race-name.
const [loginRes, recoverRes, renameRes] = await Promise.allSettled([
  store.login("race-name", "0000"),
  store.recover("race-name", "234567", "9999", "9999"),
  store.profileEdit(a.token, { login: "race-name", pin: PIN }),
]);
check("concurrent rename to race-name succeeds", renameRes.status === "fulfilled" && renameRes.value.profile.login === "race-name", renameRes);
check("concurrent login against race-name fails cleanly", loginRes.status === "rejected" && loginRes.reason?.code === "signInFailed", loginRes);
check("concurrent recovery against race-name fails cleanly", recoverRes.status === "rejected" && recoverRes.reason?.code === "recoverFailed", recoverRes);
raw = readDoc();
check("concurrent rename leaves no unknownLogins collision", !Object.hasOwn(raw.unknownLogins, "race-name"), raw.unknownLogins);
check("on-disk profiles.json passes validDoc after concurrent race", validDoc(raw, COLORS));

const restarted3 = reopenCopy("restart3");
check("reopened store after concurrent race is ready", restarted3.ready && restarted3.reason === null, restarted3.reason);

// Scenario 4: refused rename with wrong PIN must NOT wipe unknownLogins budget.
check("failed login against kept-unknown is refused", (await refusal(() => store.login("kept-unknown", "0000"))) === "signInFailed");
check("rename with wrong PIN is refused", (await refusal(() => store.profileEdit(a.token, { login: "kept-unknown", pin: "9999" }))) === "signInFailed");
raw = readDoc();
check("refused rename preserves unknownLogins entry", Object.hasOwn(raw.unknownLogins, "kept-unknown") && raw.unknownLogins["kept-unknown"].times.length === 1);
check("on-disk profiles.json stays valid after refused rename", validDoc(raw, COLORS));

clearTimeout(watchdog);
console.log(`profile-rename-unknown-prove: all ${checks} checks passed`);
