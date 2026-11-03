// #1016: persisted mixed PIN reservations recover once, before the next queued writer.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openProfiles } from "./profiles.mjs";

const self = fileURLToPath(import.meta.url);
const [mode, dir] = process.argv.slice(2);
const NOW = 1_800_000_000_000;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
let passed = 0;
const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };

if (mode === "seed") {
  const store = openProfiles(dir, { colors: ["red", "blue"], clock: () => NOW });
  const sessions = [];
  for (const [login, color] of [["recover-a", "red"], ["recover-b", "blue"]]) {
    sessions.push(await store.create({ login, displayName: login, color, pin: "2468", pinConfirm: "2468" }));
  }
  await store.mutate((d) => {
    d.profiles[sessions[0].profile.profileId].guard = { times: [NOW - 120_000], pending: { first: NOW - 60_000, second: NOW - 30_000 }, lifetime: 2 };
    d.profiles[sessions[1].profile.profileId].guard = { times: [], pending: { locked: NOW - 45_000 }, lifetime: 29 };
    d.unknownLogins = {
      "missing-a": { times: [NOW - 90_000], pending: { first: NOW - 50_000, second: NOW - 20_000 }, lifetime: 0 },
      "missing-b": { times: [], pending: { first: NOW - 10_000 }, lifetime: 0 },
      untouched: { times: [NOW - 5_000], pending: {}, lifetime: 0 },
    };
  });
  writeFileSync(path.join(dir, "fixture.json"), JSON.stringify(sessions), { mode: 0o600 });
  process.send("seeded");
  setInterval(() => {}, 1000); // Parent kills this owner, leaving its real lock and durable reservations.
} else if (mode === "recover") {
  const before = read(path.join(dir, "profiles.json"));
  const sessions = read(path.join(dir, "fixture.json"));
  const expected = structuredClone(before);
  for (const p of Object.values(expected.profiles)) {
    p.guard.times.push(...Object.values(p.guard.pending));
    p.guard.lifetime += Object.keys(p.guard.pending).length;
    p.guard.pending = {};
  }
  for (const g of Object.values(expected.unknownLogins)) {
    g.times.push(...Object.values(g.pending));
    g.pending = {};
  }
  const store = openProfiles(dir, { colors: ["red", "blue"], clock: () => NOW });
  check("a separate process takes over the dead owner's store", store.ready);
  // Queue immediately: no sleep, polling or awaited recovery hook can hide incorrect ordering.
  await store.mutate((d) => {
    for (const s of sessions) {
      const id = s.profile.profileId;
      check(`${s.profile.login}: the first writer sees exact recovered timestamps and lifetime`, equal(d.profiles[id].guard, expected.profiles[id].guard));
    }
    for (const name of Object.keys(expected.unknownLogins)) {
      check(`${name}: the first writer sees exact recovered timestamps without a lifetime charge`, equal(d.unknownLogins[name], expected.unknownLogins[name]));
    }
    check("recovery preserves every unrelated persisted field", equal(d, expected));
  });
  check("the first writer durably preserves the recovered document", equal(read(path.join(dir, "profiles.json")), expected));
  for (const s of sessions) check(`${s.profile.login}: its remembered credential remains usable`, store.resume(s.token).profile.profileId === s.profile.profileId);
  check("recovered reservations reach the lifetime lock", store.pinLocked(sessions[1].profile.profileId));
  await assert.rejects(store.login("recover-b", "2468"), (e) => e.code === "signInFailed");
  check("even the correct PIN cannot undo the recovered lifetime lock", equal(read(path.join(dir, "profiles.json")), expected));
  console.log(`recovery child: ${passed} checks passed`);
} else {
  const root = mkdtempSync(path.join(tmpdir(), "emberisle-reservation-recovery-"));
  const children = new Set();
  process.on("exit", () => { for (const c of children) c.kill("SIGKILL"); rmSync(root, { recursive: true, force: true }); });
  const run = (step) => new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [self, step, root], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
    children.add(c);
    let output = "", seeded = false;
    c.stdout.on("data", (b) => { output += b; });
    c.stderr.on("data", (b) => { output += b; });
    const timer = setTimeout(() => { c.kill("SIGKILL"); reject(new Error(`${step}: child timed out`)); }, 30_000);
    c.on("message", (msg) => { if (step === "seed" && msg === "seeded") { seeded = true; c.kill("SIGKILL"); } });
    c.once("error", reject);
    c.once("exit", (code, signal) => {
      clearTimeout(timer); children.delete(c);
      if (step === "seed" ? seeded && signal === "SIGKILL" : code === 0) { process.stdout.write(output); resolve(); }
      else reject(new Error(`${step}: exit ${code}/${signal}\n${output}`));
    });
  });
  await run("seed");
  const file = path.join(root, "profiles.json");
  const seeded = read(file);
  check("the killed owner left six durable reservations across four guards", Object.values(seeded.profiles).reduce((n, p) => n + Object.keys(p.guard.pending).length, 0) + Object.values(seeded.unknownLogins).reduce((n, g) => n + Object.keys(g.pending).length, 0) === 6);
  await run("recover");
  const once = readFileSync(file, "utf8");
  await run("recover");
  check("another complete restart does not charge any reservation twice", readFileSync(file, "utf8") === once);
  console.log(`profile-reservation-recovery-prove: ${passed} parent checks and two 12-check recovery children passed`);
}
