#!/usr/bin/env node
// Local PIN reset for a profile. Requires filesystem access to the profile directory.
// Refuses a second concurrent writer (same lock as the host). Generates a random temporary PIN
// and shows it only in this terminal. Never takes secrets on the command line.
//
// Usage:
//   node --import ./register.mjs profile-admin.mjs <login-or-uuid>            (with PROFILES_DIR env)
//   node --import ./register.mjs profile-admin.mjs <profiles-dir> <login-or-uuid>
import { createInterface } from "node:readline";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
import { LOGIN, normLogin, openProfiles } from "./profiles.mjs";

function usage() {
  console.error("Usage: profile-admin.mjs [profiles-dir] <login-or-uuid>");
  process.exit(2);
}

const [, , a1, a2] = process.argv;
if (!a1) usage();
const dir = a2 ? a1 : (process.env.PROFILES_DIR ?? a1);
const target = a2 ?? a1;
if (!dir || !target) usage();

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

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

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
console.log("If unused, it expires automatically; another reset will be needed.");
