// #1004: observe queue execution directly, without inferring it from client reply times.
// Only this proof process replaces crypto.scrypt. Real-host auth and runtime code stay unchanged.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-pin-queue-"));
const original = crypto.scrypt;
const pending = [];
const started = [];
const outcomes = [];
const settled = [];
let active = 0;
let maximum = 0;
let passed = 0;
const check = (why, ok) => { assert.ok(ok, why); passed++; console.log("ok", why); };
const watchdog = setTimeout(() => {
  console.error("FAIL profile PIN queue did not settle within 10 seconds");
  process.exit(1);
}, 10_000);
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

crypto.scrypt = (pin, salt, length, options, callback) => {
  assert.equal(length, 32);
  assert.equal(salt.length, 16);
  assert.deepEqual(options, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 });
  started.push(pin);
  if (pin === "2999") throw new Error("injected synchronous derivation failure");
  active++;
  maximum = Math.max(maximum, active);
  let finished = false;
  pending.push({
    pin,
    finish(error = null) {
      assert.equal(finished, false, "each derivation completes once");
      finished = true;
      active--;
      callback(error, error ? undefined : Buffer.alloc(length, Number(pin) % 256));
    },
  });
};
syncBuiltinESMExports();

try {
  const { openProfiles, HASH_QUEUE } = await import("./profiles.mjs");
  const store = openProfiles(dir, { colors: ["red", "blue"] });
  check("the real profile store opens", store.ready);
  check("policy remains one running and eight waiting", HASH_QUEUE === 8);
  const submit = (login, pin) => {
    const result = store.create({ displayName: login, login, color: "red", pin, pinConfirm: pin })
      .then((value) => ({ login, value }), (error) => ({ login, error }))
      .then((result) => { settled.push(login); return result; });
    outcomes.push(result);
    return result;
  };
  const complete = (pin, error = null) => {
    const job = pending.shift();
    assert.equal(job?.pin, pin, "derivations start in submission order");
    job.finish(error);
  };
  const successful = (result, pin) => {
    check(`${result.login}: the exact profile result returns`, !result.error && result.value.profile.login === result.login);
    const profile = store.profile(result.value.profile.profileId);
    check(`${result.login}: its derivation result is retained`, profile.pin.hash === Buffer.alloc(32, Number(pin) % 256).toString("base64"));
    check(`${result.login}: its issued credential is usable`, store.validate(result.value.token) === profile.id);
  };

  // Fill the real admission boundary while the first callback remains held.
  const firstPins = Array.from({ length: 9 }, (_, i) => String(1000 + i));
  const first = firstPins.map((pin, i) => submit(`queue-${i}`, pin));
  check("only the first admitted derivation starts while its callback is held", started.length === 1 && active === 1 && pending.length === 1);
  const busy = await submit("overflow", "1099");
  check("the tenth request is busy before reaching the derivation", busy.error?.code === "busy" && started.length === 1);
  check("no admitted request settles while the first callback is held", settled.join() === "overflow");
  complete(firstPins[0]);
  check("completing the first callback starts exactly the next job", started.join() === firstPins.slice(0, 2).join() && active === 1);
  const refill = submit("refill", "1010");
  check("a freed slot admits a new request without starting it early", started.length === 2 && active === 1);
  for (const pin of firstPins.slice(1)) complete(pin);
  complete("1010");
  const firstResults = await Promise.all(first);
  firstResults.forEach((result, i) => successful(result, firstPins[i]));
  successful(await refill, "1010");
  check("successful admitted requests settle in order", settled.filter((name) => name !== "overflow").join() === [...firstPins.map((_, i) => `queue-${i}`), "refill"].join());
  check("every admitted derivation starts once in FIFO order", started.join() === [...firstPins, "1010"].join());
  check("the drained queue has no running derivation", active === 0 && pending.length === 0);

  // A throw in a queued scrypt call must release its slot and start the following job.
  const syncHead = submit("sync-head", "2000");
  const syncBad = submit("sync-bad", "2999");
  const syncTail = submit("sync-tail", "2001");
  complete("2000");
  check("a synchronous throw starts the queued successor", pending.length === 1 && pending[0].pin === "2001" && active === 1);
  complete("2001");
  successful(await syncHead, "2000");
  const syncFailure = await syncBad;
  check("the synchronous failure reaches its own caller", syncFailure.error?.message === "injected synchronous derivation failure");
  successful(await syncTail, "2001");

  // An asynchronous callback failure has the same recovery contract.
  const asyncBad = submit("async-bad", "3000");
  const asyncTail = submit("async-tail", "3001");
  complete("3000", new Error("injected callback derivation failure"));
  check("a callback failure starts the queued successor", pending.length === 1 && pending[0].pin === "3001" && active === 1);
  complete("3001");
  const asyncFailure = await asyncBad;
  check("the callback failure reaches its own caller", asyncFailure.error?.message === "injected callback derivation failure");
  successful(await asyncTail, "3001");

  // Refill all slots after both error paths. No load or login reservation may leak.
  const names = ["sync-bad", "async-bad", "overflow", ...Array.from({ length: 6 }, (_, i) => `after-${i}`)];
  const recoveryPins = names.map((_, i) => String(4000 + i));
  const recovered = names.map((name, i) => submit(name, recoveryPins[i]));
  check("all nine slots remain admissible after success and both failure paths", active === 1 && pending.length === 1);
  for (const pin of recoveryPins) complete(pin);
  (await Promise.all(recovered)).forEach((result, i) => successful(result, recoveryPins[i]));
  check("maximum concurrent derivations is exactly one", maximum === 1);
  check("every callback finished and the queue drained", active === 0 && pending.length === 0);
  console.log(`profile-pin-queue-prove: ${passed} checks passed`);
} finally {
  // Drain a mutated implementation too, so a failed assertion cannot strand writes or reservations.
  while (pending.length) pending.shift().finish(new Error("proof cleanup"));
  await Promise.all(outcomes);
  crypto.scrypt = original;
  syncBuiltinESMExports();
  clearTimeout(watchdog);
  rmSync(dir, { recursive: true, force: true });
}
