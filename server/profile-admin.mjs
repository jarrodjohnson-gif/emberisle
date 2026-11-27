#!/usr/bin/env node
// Local PIN reset or deletion for a profile. Requires filesystem access to the profile directory.
// Refuses a second concurrent writer (same lock as the host). Generates a random temporary PIN
// and shows it only in this terminal. Never takes secrets on the command line.
//
// Usage:
//   node --import ./register.mjs profile-admin.mjs [--delete] <login-or-uuid>            (with PROFILES_DIR env)
//   node --import ./register.mjs profile-admin.mjs [--delete] <profiles-dir> <login-or-uuid>
import { createInterface } from "node:readline";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
import { DELETED_NAME, normLogin, openProfiles } from "./profiles.mjs";

function usage() {
  console.error("Usage: profile-admin.mjs [--delete] [profiles-dir] <login-or-uuid>");
  process.exit(2);
}

// "--delete" is never a login, so the reset's arguments keep their meaning.
const remove = process.argv[2] === "--delete";
const args = process.argv.slice(remove ? 3 : 2);
const [a1, a2] = args;
if (!a1) usage();
const dir = a2 ? a1 : process.env.PROFILES_DIR;
const target = a2 ?? a1;
if (!dir || !target || args.length > 2) usage();

const store = openProfiles(dir, { colors: PLAYER_COLORS });
if (!store.ready) {
  console.error(`profiles: cannot open store at ${dir}: ${store.reason}`);
  if (store.reason === "locked") console.error("  Another process is using this directory. Stop the host before running admin.");
  process.exit(1);
}

// Resolve target (login or UUID) to a profile record.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let profileId = null;

if (UUID_RE.test(target)) {
  profileId = store.profile(target) ? target : null;
} else {
  const login = normLogin(target);
  if (login) profileId = store.lookupLogin(login);
}

if (!profileId) {
  console.error(`No profile found for: ${target}`);
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

// Deletion (#891, profiles.md "Host administration and privacy"): a preview, then the owner types the login back.
if (remove) {
  const v = store.deletionPreview(profileId);
  console.log();
  console.log("Profile to delete:");
  console.log(`  UUID:            ${v.profileId}`);
  console.log(`  Display name:    ${v.displayName}`);
  console.log(`  Login:           ${v.login}`);
  console.log(`  Created:         ${new Date(v.createdAt).toISOString()}`);
  console.log(`  Devices:         ${v.devices} signed in (all revoked)`);
  console.log(`  Counted games:   ${v.games}`);
  console.log(`  Result rows:     ${v.resultRows} (shown as "${DELETED_NAME}"; other players' results unchanged)`);
  console.log(`  Win song:        ${v.winSongId ?? "none"}`);
  console.log(`  Media binding:   ${v.mediaKey ?? "none"} (the binding is removed; no asset file is deleted)`);
  console.log();
  console.log("The login stays reserved, so nobody else can take it. Active games keep playing.");
  console.log("Pending results and saved rooms are redacted when the host next starts, before it serves profiles.");
  console.log("This cannot be undone.");
  console.log();
  const typed = await ask(`Type the login ${v.login} to delete this profile: `);
  rl.close();
  if (typed.trim() !== v.login) {
    console.log("Deletion cancelled.");
    process.exit(0);
  }
  let done;
  try {
    done = await store.deleteProfile(profileId);
  } catch (e) {
    console.error("Deletion failed:", e.message);
    process.exit(1);
  }
  console.log();
  console.log(`Deleted profile ${profileId}. ${done.resultRows} stored result row(s) now show "${DELETED_NAME}".`);
  console.log("Start the host to finish redacting pending results and saved rooms.");
  process.exit(0);
}

const profileInfo = store.profile(profileId);

console.log();
console.log("Profile to reset:");
console.log(`  UUID:         ${profileInfo.id}`);
console.log(`  Display name: ${profileInfo.displayName}`);
console.log(`  Login:        ${profileInfo.login}`);
console.log(`  Created:      ${new Date(profileInfo.createdAt).toISOString()}`);
console.log(`  PIN lifetime: ${profileInfo.guard.lifetime} failures`);
console.log();
console.log("IMPORTANT: Verify this person's identity privately before proceeding.");
console.log("A login name, device credential, or claim of being locked out is not sufficient evidence.");
console.log();

const confirm = await ask("Type YES to confirm you have verified this person privately: ");
rl.close();

if (confirm.trim() !== "YES") {
  console.log("Reset cancelled.");
  process.exit(0);
}

console.log();
console.log("Generating temporary PIN and resetting profile…");
let result;
try {
  result = await store.localResetPin(profileId);
} catch (e) {
  console.error("Reset failed:", e.message);
  process.exit(1);
}

const expiresIn = Math.round((result.expiresAt - Date.now()) / 1000 / 60);
console.log();
console.log(`Temporary PIN: ${result.tempPin}`);
console.log(`Expires in:    ~${expiresIn} minutes`);
console.log();
console.log("Deliver this PIN privately to the verified person.");
console.log("They must change it before any other profile operations.");
// #1437: the host never sees or prints a recovery code.
console.log("Old recovery code deleted. They get a new one after changing the PIN.");
console.log("If unused, it expires automatically; another reset will be needed.");
