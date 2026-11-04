// #1012: absolute per-device expiry under repeated reads and an existing PIN lifetime lock.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openProfiles, DAY_MS, DEVICE_MS } from "./profiles.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-profile-expiry-"));
let now = Date.now();
let passed = 0;
const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };
const disk = () => JSON.parse(readFileSync(path.join(dir, "profiles.json"), "utf8"));
const watchdog = setTimeout(() => { console.error("FAIL profile expiry proof exceeded 30 seconds"); process.exit(1); }, 30_000);
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

try {
  const store = openProfiles(dir, { colors: ["red", "blue"], clock: () => now });
  check("policy remains a 90-day absolute lifetime", DEVICE_MS === 90 * DAY_MS);
  const firstIssued = now;
  const first = await store.create({ displayName: "Owner", login: "owner", color: "red", pin: "2468", pinConfirm: "2468" });
  const id = first.profile.profileId;
  check("the first credential has its original absolute deadline", first.expiresAt === firstIssued + 90 * DAY_MS);
  now += DAY_MS;
  const second = await store.login("owner", "2468");
  check("a later credential receives a separate deadline", second.token !== first.token && second.expiresAt === first.expiresAt + DAY_MS);

  await store.mutate((d) => { d.profiles[id].guard = { times: [now], pending: {}, lifetime: 30 }; });
  await assert.rejects(store.login("owner", "2468"), (error) => error.code === "signInFailed");
  check("the correct PIN is blocked by the pre-existing lifetime lock", store.pinLocked(id));
  const budget = JSON.stringify(disk().profiles[id].guard);
  const usable = (device, label) => {
    check(`${label}: validation still identifies the owner`, store.validate(device.token) === id);
    const result = store.resume(device.token);
    check(`${label}: resume retains the original deadline and issues no token`, result.profile.profileId === id && result.expiresAt === device.expiresAt && !("token" in result));
  };
  const expired = (device, label) => {
    check(`${label}: validation refuses the expired credential`, store.validate(device.token) === null);
    assert.throws(() => store.resume(device.token), (error) => error.code === "signedOut");
    passed++;
    console.log("ok", `${label}: resume returns signedOut`);
  };
  const unchangedBudget = (label) => check(`${label}: reads preserve the persisted and live lifetime budget`, store.pinLocked(id) && JSON.stringify(store.profile(id).guard) === budget && JSON.stringify(disk().profiles[id].guard) === budget);

  for (const at of [now, first.expiresAt - 1]) {
    now = at;
    for (let i = 0; i < 3; i++) {
      usable(first, `older read ${i} at ${at}`);
      usable(second, `newer read ${i} at ${at}`);
    }
    unchangedBudget("before older expiry");
    check("repeated reads add no remembered device", Object.keys(disk().devices).length === 2);
  }

  for (const at of [first.expiresAt, first.expiresAt + 1, second.expiresAt - 1]) {
    now = at;
    expired(first, `older at ${at}`);
    usable(second, `newer at ${at}`);
    unchangedBudget("between device deadlines");
  }
  for (const at of [second.expiresAt, second.expiresAt + 1]) {
    now = at;
    expired(first, `older at ${at}`);
    expired(second, `newer at ${at}`);
    unchangedBudget("both expired");
  }
  check("expiry does not delete the profile or release its PIN lock", store.profile(id).login === "owner" && store.ready && store.pinLocked(id));
  console.log(`profile-expiry-prove: ${passed} checks passed`);
} finally {
  clearTimeout(watchdog);
  rmSync(dir, { recursive: true, force: true });
}
