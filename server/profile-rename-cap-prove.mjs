// #1069: one profile keeps at most RESERVED_PER_PROFILE former logins. Further renames are refused, no reservation is evicted,
// and renaming back to an own former login releases it. Real store, real scrypt, the real profile handler
// for the reply, and the client's real message table.
// Run from the repo root: node --import ./server/register.mjs server/profile-rename-cap-prove.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openProfiles, RESERVED_PER_PROFILE } from "./profiles.mjs";
import { profileHandler } from "./profile-protocol.mjs";
import { transformWithOxc } from "vite";

// The browser's own error table, compiled as the app compiles it (Node's type stripping cannot load its parameter property).
const clientFile = new URL("../src/lib/net/profiles.ts", import.meta.url);
const { code: clientJs } = await transformWithOxc(readFileSync(clientFile, "utf8"), clientFile.pathname);
const { ProfileClientError } = await import(`data:text/javascript;base64,${Buffer.from(clientJs).toString("base64")}`);

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-rename-cap-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const watchdog = setTimeout(() => {
  console.error("FAIL rename cap proof exceeded 60 seconds");
  process.exit(1);
}, 60_000);
let passed = 0;
const check = (why, ok, extra) => {
  if (!ok) { console.log("FAIL", why, extra === undefined ? "" : JSON.stringify(extra)); process.exit(1); }
  passed++;
  console.log("ok", why);
};
const text = () => readFileSync(path.join(dir, "profiles.json"), "utf8");
const held = (id) => Object.entries(JSON.parse(text()).reservedLogins).filter(([, v]) => v === id).map(([k]) => k).sort();
const refusal = async (fn) => { try { await fn(); } catch (e) { return e.code; } return null; };

const PIN = "2468";
const store = openProfiles(dir, { colors: ["red", "blue"] });
check("the real store opens", store.ready);
check("the cap is the owner's five", RESERVED_PER_PROFILE === 5, RESERVED_PER_PROFILE);
const a = await store.create({ displayName: "Ash", login: "ash-0", color: "red", pin: PIN, pinConfirm: PIN });
const b = await store.create({ displayName: "Bay", login: "bay", color: "blue", pin: "1357", pinConfirm: "1357" });
const id = a.profile.profileId;
const rename = (login, pin = PIN) => store.profileEdit(a.token, { login, pin });

for (let i = 1; i <= 5; i++) await rename(`ash-${i}`);
check("five renames reserve five former logins", held(id).join() === "ash-0,ash-1,ash-2,ash-3,ash-4", held(id));
check("the fifth rename took effect", store.profile(id).login === "ash-5");

const before = text();
const lifetime = store.profile(id).guard.lifetime;
check("a sixth new login is refused at the cap", (await refusal(() => rename("ash-6"))) === "loginLimit");
for (let i = 7; i < 17; i++) check(`renaming past the cap again is refused (ash-${i})`, (await refusal(() => rename(`ash-${i}`))) === "loginLimit");
check("refused renames leave the store file byte for byte unchanged", text() === before, { before: before.length, after: text().length });
check("no reservation was evicted to make room", held(id).join() === "ash-0,ash-1,ash-2,ash-3,ash-4", held(id));
check("the login did not change", store.profile(id).login === "ash-5" && store.lookupLogin("ash-6") === null);
check("a refusal at the cap is not a PIN failure", store.profile(id).guard.lifetime === lifetime);
check("a wrong PIN at the cap gets the ordinary sign-in failure, not the cap", (await refusal(() => rename("ash-6", "9999"))) === "signInFailed");
check("the wrong PIN still counts against its budget", store.profile(id).guard.lifetime === lifetime + 1);
check("another profile still cannot take a reserved login", (await refusal(() => store.profileEdit(b.token, { login: "ash-2", pin: "1357" }))) === "loginTaken");

const edited = await store.profileEdit(a.token, { displayName: "Ash Two" });
check("ordinary edits still work at the cap", edited.profile.displayName === "Ash Two" && store.profile(id).login === "ash-5");

await rename("ash-2");
check("renaming back to an own former login works at the cap", store.profile(id).login === "ash-2" && store.lookupLogin("ash-2") === id);
check("renaming back releases that reservation and reserves the login it left", held(id).join() === "ash-0,ash-1,ash-3,ash-4,ash-5", held(id));
check("the count stays at the cap", held(id).length === RESERVED_PER_PROFILE);
check("a new login is still refused after renaming back", (await refusal(() => rename("ash-9"))) === "loginLimit");

await store.mutate((d) => { for (let i = 20; i < 23; i++) d.reservedLogins[`ash-${i}`] = id; });
check("a store already over the cap still loads its eight reservations", held(id).length === 8);
await rename("ash-21");
check("renaming back works over the cap and never grows the count", store.profile(id).login === "ash-21" && held(id).length === 8 && !held(id).includes("ash-21"));
check("a new login is refused over the cap", (await refusal(() => rename("ash-30"))) === "loginLimit");

const bay = await store.profileEdit(b.token, { login: "bay-1", pin: "1357" });
check("the cap is per profile: another profile still renames", bay.profile.login === "bay-1" && held(b.profile.profileId).join() === "bay");

const sent = [];
const handle = profileHandler(store, (_ws, msg) => sent.push(msg));
handle({ profileGate: { credentials: true }, ipKey: "proof" }, { type: "profileEdit", id: 1, credential: a.token, login: "ash-40", pin: PIN });
while (!sent.length) await new Promise((r) => setTimeout(r, 10));
const reply = sent[0];
check("the host answers with a profileError coded loginLimit", reply.type === "profileError" && reply.id === 1 && reply.code === "loginLimit", reply);
check("the host's message is the clear cap message, not the unavailable fallback", reply.message === "You have changed your login too often. You can switch back to an old one.", reply.message);
check("the client shows the same message for that code", new ProfileClientError(reply.code).message === reply.message, new ProfileClientError(reply.code).message);
check("the reply leaks no login, id or count", !JSON.stringify(reply).includes("ash") && !JSON.stringify(reply).includes(id) && Object.keys(reply).sort().join() === "code,id,message,type", reply);

clearTimeout(watchdog);
assert.ok(passed > 0);
console.log(`profile-rename-cap-prove: ${passed} checks passed`);
process.exit(0);
