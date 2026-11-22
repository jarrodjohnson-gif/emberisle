// Race and schema guards for server/profiles.mjs:
// 1. login() refuses when the login was renamed away while the PIN hash was running (matching recover()).
// 2. Concurrent profileEdit() calls renaming to the same target login succeed idempotently instead of throwing loginTaken.
// 3. A concurrent no-PIN profileEdit() carrying the old login does not revert a concurrent rename.
// 4. recordOutcome() normalizes negative victoryTarget to null so persisted profiles.json passes validDoc() on reload.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openProfiles, ProfileError, validDoc } from "./profiles.mjs";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok ${passed}: ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.error(`FAIL: ${name}\n  ${err.message.split("\n")[0]}`);
  }
}

const dirs = [];
function tempDir(prefix) {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

try {
  // Check 1: login() racing with rename of the same login (FIFO scrypt queue guarantees rename commits before login).
  await check("login() rejects retired login renamed while hashing", async () => {
    const dir = tempDir("emberisle-prof-login-race-");
    const store = openProfiles(dir, { colors: PLAYER_COLORS });
    assert.equal(store.ready, true, "store ready");
    const created = await store.create({ displayName: "Ember", login: "ember", pin: "4821", pinConfirm: "4821", color: PLAYER_COLORS[0] });
    const devicesBefore = Object.keys(JSON.parse(readFileSync(path.join(dir, "profiles.json"), "utf8")).devices).length;

    // Queue rename first (scrypt job 1), then login against the old login (reserves before rename commits, scrypt job 2).
    const renameP = store.profileEdit(created.token, { login: "ember2", pin: "4821" });
    const loginP = store.login("ember", "4821");

    const renamed = await renameP;
    assert.equal(renamed.profile.login, "ember2", "rename committed");

    let loginErr = null;
    try {
      await loginP;
    } catch (e) {
      loginErr = e;
    }
    assert.ok(loginErr instanceof ProfileError && loginErr.code === "signInFailed", `expected signInFailed for retired login, got ${loginErr?.code ?? "success"}`);
    const doc = JSON.parse(readFileSync(path.join(dir, "profiles.json"), "utf8"));
    assert.equal(Object.keys(doc.devices).length, devicesBefore, "refused login issued no new device token");
    assert.equal(doc.profiles[created.profile.profileId].guard.lifetime, 0, "retired-login race did not penalize PIN lifetime budget");
  });

  // Check 2 & 3: concurrent profileEdit() same-login rename and no-PIN edit with old login.
  await check("concurrent profileEdit() to same target login succeeds idempotently", async () => {
    const dir = tempDir("emberisle-prof-edit-race-");
    const store = openProfiles(dir, { colors: PLAYER_COLORS });
    assert.equal(store.ready, true, "store ready");
    const created = await store.create({ displayName: "Ember", login: "ember", pin: "4821", pinConfirm: "4821", color: PLAYER_COLORS[0] });

    // Both compute isRename=true before scrypt; job 1 renames ember->ember2, job 2 also asks for ember2 + new displayName.
    const edit1 = store.profileEdit(created.token, { login: "ember2", pin: "4821" });
    const edit2 = store.profileEdit(created.token, { login: "ember2", displayName: "Ember Two", pin: "4821" });
    // Concurrent no-PIN edit carrying the old login must not revert the rename.
    const edit3 = store.profileEdit(created.token, { login: "ember", catchphrase: "Steady sail" });

    const [r1, r2, r3] = await Promise.all([edit1, edit2, edit3]);
    assert.equal(r1.profile.login, "ember2", "first rename sets ember2");
    assert.equal(r2.profile.login, "ember2", "second concurrent rename keeps ember2");
    assert.equal(r2.profile.displayName, "Ember Two", "second edit's displayName is preserved");
    assert.equal(r3.profile.catchphrase, "Steady sail", "no-PIN edit applies catchphrase");

    const latest = store.profile(created.profile.profileId);
    assert.equal(latest.login, "ember2", "concurrent no-PIN edit did not revert login");
    assert.equal(latest.displayName, "Ember Two", "final displayName matches");
    assert.equal(latest.catchphrase, "Steady sail", "final catchphrase matches");
    const doc = JSON.parse(readFileSync(path.join(dir, "profiles.json"), "utf8"));
    assert.equal(validDoc(doc, PLAYER_COLORS), true, "persisted store stays validDoc");
  });

  // Check 4: recordOutcome() rejects negative victoryTarget so profiles.json reloads cleanly.
  await check("recordOutcome() normalizes negative victoryTarget so reload passes validDoc()", async () => {
    const dir1 = tempDir("emberisle-prof-vt-src-");
    const dir2 = tempDir("emberisle-prof-vt-reload-");
    const store = openProfiles(dir1, { colors: PLAYER_COLORS });
    assert.equal(store.ready, true, "store ready");
    const created = await store.create({ displayName: "Ember", login: "ember", pin: "4821", pinConfirm: "4821", color: PLAYER_COLORS[0] });

    const now = Date.now();
    const gameId = randomUUID();
    const status = await store.recordOutcome({
      v: 1,
      gameId,
      startedAt: now - 1000,
      endedAt: now,
      policy: 1,
      eligible: true,
      victoryTarget: -5,
      winner: "p0",
      players: [
        { pid: "p0", seat: "s0", profileId: created.profile.profileId, name: "Ember", color: PLAYER_COLORS[0], kind: "human", points: 10, won: true, assisted: false },
        { pid: "p1", seat: "s1", profileId: null, name: "Tide", color: PLAYER_COLORS[1], kind: "human", points: 4, won: false, assisted: false },
      ],
    });
    assert.equal(status, "committed", "outcome committed");
    const persisted = JSON.parse(readFileSync(path.join(dir1, "profiles.json"), "utf8"));
    assert.equal(persisted.results[gameId].victoryTarget, null, "negative victoryTarget normalized to null");
    assert.equal(validDoc(persisted, PLAYER_COLORS), true, "persisted doc validates");

    // Copy persisted file to a fresh dir and verify openProfiles() loads it cleanly.
    copyFileSync(path.join(dir1, "profiles.json"), path.join(dir2, "profiles.json"));
    const reloaded = openProfiles(dir2, { colors: PLAYER_COLORS });
    assert.equal(reloaded.ready, true, `reloaded store must be ready, got reason=${reloaded.reason}`);
    assert.equal(reloaded.committedWins(created.profile.profileId), 1, "reloaded store preserves recorded win");
  });

  assert.equal(failures.length, 0, `${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  console.log(`profile-race-guards-prove: ${passed} checks passed`);
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
