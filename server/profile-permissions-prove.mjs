// #1018: private profile data stays owner-only even with deployment umask 000.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openProfiles } from "./profiles.mjs";

const root = mkdtempSync(path.join(tmpdir(), "emberisle-profile-permissions-"));
const dir = path.join(root, "private-store");
const originalOpen = fs.open;
const originalMask = process.umask(0);
const temporaryModes = [];
let passed = 0;
const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };
const mode = (name) => statSync(path.join(dir, name)).mode & 0o777;
const cleanup = () => { fs.open = originalOpen; process.umask(originalMask); rmSync(root, { recursive: true, force: true }); };
process.on("exit", cleanup);
const watchdog = setTimeout(() => { console.error("FAIL profile permission proof exceeded 30 seconds"); process.exit(1); }, 30_000);

// Observe real descriptors before the writer puts private bytes into them. Storage calls and results stay native.
fs.open = async function (name, flags, ...rest) {
  const handle = await originalOpen.call(this, name, flags, ...rest);
  if (path.dirname(String(name)) === dir && flags === "wx") temporaryModes.push((await handle.stat()).mode & 0o777);
  return handle;
};
try {
  check("the proof actually runs with umask 000", process.umask() === 0);
  const store = openProfiles(dir, { colors: ["red", "blue"] });
  check("the real store opens", store.ready);
  check("a new profile directory permits only its owner", (statSync(dir).mode & 0o777) === 0o700);
  check("the live writer lock permits only its owner", mode("writer.lock") === 0o600);
  const owner = await store.create({ login: "private-owner", displayName: "Private", color: "red", pin: "2468", pinConfirm: "2468" });
  check("the first committed store permits only its owner", mode("profiles.json") === 0o600);
  check("the first remembered credential works", store.resume(owner.token).profile.profileId === owner.profile.profileId);
  const login = await store.login("private-owner", "2468");
  check("the replacement after PIN login stays private", mode("profiles.json") === 0o600);
  check("the new remembered credential works", store.resume(login.token).profile.profileId === owner.profile.profileId);
  check("the original credential can be durably revoked", await store.logout(owner.token));
  check("the replacement after revocation stays private", mode("profiles.json") === 0o600);
  check("revocation leaves the other remembered device usable", store.validate(owner.token) === null && store.resume(login.token).profile.profileId === owner.profile.profileId);
  check("real durable temporary files were observed", temporaryModes.length > 0);
  check("every temporary file is private before receiving data", temporaryModes.every((m) => m === 0o600));
  check("successful commits leave only the private store and live lock", readdirSync(dir).sort().join() === "profiles.json,writer.lock");
  console.log(`profile-permissions-prove: ${passed} checks passed; ${temporaryModes.length} real temporary descriptors observed`);
} finally {
  clearTimeout(watchdog);
  cleanup();
}
