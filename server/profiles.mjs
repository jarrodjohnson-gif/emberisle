// Player profiles (#762, docs/design/profiles.md): the host's private store, PIN hashing, device credentials and PIN budgets.
// Socket handling lives in profile-protocol.mjs. Nothing here goes into game, seat or watcher state.
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export const SCHEMA = 1;
// "Authentication boundaries": OWASP's scrypt row, one derivation at a time, eight more waiting, overflow refused before hashing.
export const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
const KEY_LEN = 32;
const SALT_LEN = 16;
export const HASH_QUEUE = 8;
// PIN budgets (#770): five failures per 15 minutes then a 15-minute cooldown, ten per rolling day, thirty per profile for good.
export const WINDOW_MS = 15 * 60 * 1000;
export const WINDOW_FAILS = 5;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const DAY_FAILS = 10;
export const LIFETIME_FAILS = 30;
export const DEVICE_MS = 90 * DAY_MS;
export const DEVICE_MAX = 5;
// Failures against logins nobody holds are kept too (the same answer and the same work), but only this many names.
const UNKNOWN_MAX = 1024;
const FILE = "profiles.json";
const LOCK = "writer.lock";

export const LOGIN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class ProfileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Display text: controls stripped, spaces collapsed, trimmed, capped (the seat name's own cleaning, server/host.mjs seatName).
export function cleanLine(raw, max) {
  if (typeof raw !== "string" || raw.length > 4 * max) return null;
  return Array.from(raw.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/ {2,}/g, " ").trim()).slice(0, max).join("").trimEnd();
}

export function normLogin(raw) {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const login = raw.trim().toLowerCase();
  return login.length >= 3 && login.length <= 24 && LOGIN.test(login) ? login : null;
}

export const validPin = (pin) => typeof pin === "string" && /^[0-9]{4}$/.test(pin);
export const digest = (token) => createHash("sha256").update(token).digest("hex");

// Only the owner sees this, and only these fields. Verifiers, devices, budgets and media bindings never leave the store.
// pinMustChange is omitted from the projection when false to preserve the stable OWNER_KEYS allowlist for existing tests.
export function ownerView(p) {
  const out = {
    profileId: p.id,
    displayName: p.displayName,
    login: p.login,
    color: p.color,
    backupColor: p.backupColor,
    catchphrase: p.catchphrase,
    winSongId: p.winSongId,
  };
  if (p.pinMustChange) out.pinMustChange = true;
  return out;
}

// What a table sees of a profile bound to a seat (#764): the opaque id and display name, nothing else.
export function seatView(p) {
  return { profileId: p.id, displayName: p.displayName };
}

// The public card a table may ask for (#764). No login, colours, devices, budgets or media bindings.
export function publicCard(p) {
  return { profileId: p.id, displayName: p.displayName, catchphrase: p.catchphrase };
}

// Logins are player-chosen keys ("constructor" is a valid one), so every map lookup reads own properties only.
const has = (o, k) => Object.hasOwn(o, k);
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const isTime = (v) => Number.isSafeInteger(v) && v >= 0;
const isStr = (v, max) => typeof v === "string" && Array.from(v).length <= max;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function validGuard(g) {
  return plain(g) && Array.isArray(g.times) && g.times.every(isTime) && plain(g.pending) && Object.values(g.pending).every(isTime) && Number.isSafeInteger(g.lifetime) && g.lifetime >= 0;
}

// A store this host did not write, or cannot read, is refused whole: profiles go dark, guests still play, and the file is
// left as it was for repair. An empty leaderboard is never a fallback.
export function validDoc(doc, colors) {
  if (!plain(doc) || doc.schemaVersion !== SCHEMA) return false;
  for (const k of ["profiles", "logins", "reservedLogins", "tombstones", "devices", "unknownLogins"]) if (!plain(doc[k])) return false;
  for (const [id, p] of Object.entries(doc.profiles)) {
    if (!UUID.test(id) || !plain(p) || p.id !== id) return false;
    if (!isStr(p.displayName, 16) || !p.displayName || own(doc.logins, p.login) !== id || !LOGIN.test(p.login)) return false;
    if (!colors.includes(p.color) || !colors.includes(p.backupColor) || p.color === p.backupColor) return false;
    if (!isStr(p.catchphrase, 80) || !(p.winSongId === null || isStr(p.winSongId, 64)) || !(p.mediaKey === null || isStr(p.mediaKey, 64))) return false;
    if (!isTime(p.createdAt) || !isTime(p.updatedAt) || !validGuard(p.guard)) return false;
    const v = p.pin;
    if (!plain(v) || v.alg !== "scrypt" || !Number.isSafeInteger(v.N) || !Number.isSafeInteger(v.r) || !Number.isSafeInteger(v.p) || !isStr(v.salt, 64) || !isStr(v.hash, 64)) return false;
    // pinMustChange and tempPinExpiresAt are optional (default false / null for records written before #763).
    if (p.pinMustChange !== undefined && typeof p.pinMustChange !== "boolean") return false;
    if (p.tempPinExpiresAt !== undefined && p.tempPinExpiresAt !== null && !isTime(p.tempPinExpiresAt)) return false;
  }
  for (const [login, id] of Object.entries(doc.logins)) if (!LOGIN.test(login) || own(doc.profiles, id)?.login !== login) return false;
  for (const [login, id] of Object.entries(doc.reservedLogins)) if (!LOGIN.test(login) || !UUID.test(id) || has(doc.logins, login)) return false;
  for (const [id, at] of Object.entries(doc.tombstones)) if (!UUID.test(id) || !isTime(at) || has(doc.profiles, id)) return false;
  for (const [d, dev] of Object.entries(doc.devices)) {
    if (!/^[0-9a-f]{64}$/.test(d) || !plain(dev) || !has(doc.profiles, dev.profileId) || !isTime(dev.createdAt) || !isTime(dev.expiresAt)) return false;
  }
  for (const [login, g] of Object.entries(doc.unknownLogins)) if (!LOGIN.test(login) || has(doc.logins, login) || !validGuard(g)) return false;
  return true;
}

// Apply validated text/colour fields to a profile record inside a mutate callback. Login renames are handled separately.
function _applyEditFields(p, f, colors) {
  if (f.displayName !== undefined) {
    const v = cleanLine(f.displayName, 16);
    if (!v) throw new ProfileError("invalid");
    p.displayName = v;
  }
  if (f.catchphrase !== undefined) {
    const v = f.catchphrase === null ? "" : cleanLine(f.catchphrase, 80);
    if (v === null) throw new ProfileError("invalid");
    p.catchphrase = v;
  }
  if (f.color !== undefined) {
    if (!colors.includes(f.color)) throw new ProfileError("invalid");
    p.color = f.color;
  }
  if (f.backupColor !== undefined) {
    if (!colors.includes(f.backupColor)) throw new ProfileError("invalid");
    p.backupColor = f.backupColor;
  }
  if ((f.color !== undefined || f.backupColor !== undefined) && p.color === p.backupColor) throw new ProfileError("invalid");
}

const emptyDoc = () => ({ schemaVersion: SCHEMA, profiles: {}, logins: {}, reservedLogins: {}, tombstones: {}, devices: {}, unknownLogins: {} });
const newGuard = () => ({ times: [], pending: {}, lifetime: 0 });

// One host owns a profile directory. A lock naming a live process refuses this one; a crashed owner's lock is taken over.
function takeLock(dir) {
  const file = path.join(dir, LOCK);
  for (let tries = 0; tries < 2; tries++) {
    try {
      const fd = openSync(file, "wx", 0o600);
      writeSync(fd, String(process.pid));
      fsyncSync(fd);
      closeSync(fd);
      process.on("exit", () => {
        try {
          if (readFileSync(file, "utf8") === String(process.pid)) unlinkSync(file);
        } catch {
          /* already gone */
        }
      });
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const pid = Number(readFileSync(file, "utf8"));
      if (Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid && alive(pid)) return false;
      rmSync(file, { force: true });
    }
  }
  return false;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

// Temp file, sync, rename, then sync the directory: a commit is acknowledged only once it would survive power loss.
async function writeDurable(dir, name, text) {
  const tmp = path.join(dir, `.${name}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const fh = await fs.open(tmp, "wx", 0o600);
  try {
    await fh.writeFile(text);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, path.join(dir, name));
  const d = await fs.open(dir, "r");
  try {
    await d.sync();
  } finally {
    await d.close();
  }
}

// When the 15-minute window, the day or the lifetime budget refuses another PIN attempt. Reserved attempts count as failures.
function refused(g, now, lifetime) {
  const held = Object.keys(g.pending).length;
  if (lifetime && g.lifetime + held >= LIFETIME_FAILS) return true;
  const day = g.times.filter((t) => now - t < DAY_MS).length;
  if (day + held >= DAY_FAILS) return true;
  const recent = g.times.filter((t) => now - t < WINDOW_MS).length;
  if (recent + held >= WINDOW_FAILS) return true;
  // The fifth failure inside 15 minutes starts a 15-minute cooldown from that failure.
  const t = [...g.times].sort((a, b) => a - b);
  for (let i = WINDOW_FAILS - 1; i < t.length; i++) if (t[i] - t[i - WINDOW_FAILS + 1] < WINDOW_MS && now < t[i] + WINDOW_MS) return true;
  return false;
}

function fail(g, at, lifetime) {
  g.times.push(at);
  if (lifetime) g.lifetime += 1;
}

function prune(doc, now) {
  for (const [d, dev] of Object.entries(doc.devices)) if (dev.expiresAt <= now) delete doc.devices[d];
  for (const p of Object.values(doc.profiles)) p.guard.times = p.guard.times.filter((t) => now - t < DAY_MS);
  for (const [login, g] of Object.entries(doc.unknownLogins)) {
    g.times = g.times.filter((t) => now - t < DAY_MS);
    if (!g.times.length && !Object.keys(g.pending).length) delete doc.unknownLogins[login];
  }
}

// Opens the store at `dir`. Always returns a store; `store.ready` is false (and every call refuses) when the directory is held
// by another host, unreadable, or holds a schema this host does not know.
export function openProfiles(dir, { colors, clock = Date.now } = {}) {
  let doc = null;
  let reason = null;
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!takeLock(dir)) reason = "locked";
    else {
      let text = null;
      try {
        text = readFileSync(path.join(dir, FILE), "utf8");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const parsed = text === null ? emptyDoc() : JSON.parse(text);
      if (validDoc(parsed, colors)) doc = parsed;
      else reason = "schema";
    }
  } catch (e) {
    reason = reason ?? "unreadable";
    console.error("profiles: store unavailable:", e.message);
  }
  if (reason) console.error(`profiles: store unavailable (${reason}); guests can still play`);

  // Writes are serialized across every caller. Each mutation runs on a copy; the live store changes only after the copy is
  // durably on disk, so a failed write leaves memory and disk in agreement.
  let chain = Promise.resolve();
  function mutate(fn) {
    const run = chain.then(async () => {
      if (!doc) throw new ProfileError("unavailable");
      const next = structuredClone(doc);
      const out = fn(next, clock());
      try {
        await writeDurable(dir, FILE, JSON.stringify(next));
      } catch (e) {
        console.error("profiles: write failed:", e.message);
        throw new ProfileError("unavailable");
      }
      doc = next;
      return out;
    });
    chain = run.catch(() => {});
    return run;
  }

  // A crash between reserving an attempt and recording its result leaves the reservation: count it as the failure it may have been.
  if (doc) {
    const stale = [...Object.values(doc.profiles).map((p) => [p.guard, true]), ...Object.values(doc.unknownLogins).map((g) => [g, false])];
    if (stale.some(([g]) => Object.keys(g.pending).length)) {
      mutate((d) => {
        for (const p of Object.values(d.profiles)) for (const [rid, at] of Object.entries(p.guard.pending)) (fail(p.guard, at, true), delete p.guard.pending[rid]);
        for (const g of Object.values(d.unknownLogins)) for (const [rid, at] of Object.entries(g.pending)) (fail(g, at, false), delete g.pending[rid]);
      }).catch(() => {});
    }
  }

  // The hash queue: one derivation running, HASH_QUEUE waiting. A slot is claimed before any budget is reserved.
  let load = 0;
  const waiting = [];
  let running = false;
  const claim = () => (load < 1 + HASH_QUEUE ? (load++, true) : false);
  function derive(pin, salt, params) {
    return new Promise((resolve, reject) => {
      waiting.push({ pin, salt, params, resolve, reject });
      pump();
    });
  }
  function pump() {
    if (running || !waiting.length) return;
    running = true;
    const job = waiting.shift();
    const { N, r, p } = job.params;
    const finish = (err, key) => {
      running = false;
      load--;
      if (err) job.reject(err);
      else job.resolve(key);
      pump();
    };
    // Bad stored parameters make scrypt throw at once rather than call back; the queue must still move on.
    try {
      scrypt(job.pin, job.salt, KEY_LEN, { N, r, p, maxmem: SCRYPT.maxmem }, finish);
    } catch (e) {
      finish(e);
    }
  }
  // An unknown login is checked against this, so it costs the same work as a real one.
  const dummy = { alg: "scrypt", N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: randomBytes(SALT_LEN).toString("base64"), hash: randomBytes(KEY_LEN).toString("base64") };

  async function verifier(pin) {
    const salt = randomBytes(SALT_LEN);
    const key = await derive(pin, salt, SCRYPT);
    return { alg: "scrypt", N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString("base64"), hash: key.toString("base64") };
  }

  function issue(d, profileId, now) {
    const token = randomBytes(32).toString("base64url");
    d.devices[digest(token)] = { profileId, createdAt: now, expiresAt: now + DEVICE_MS };
    const mine = Object.entries(d.devices).filter(([, v]) => v.profileId === profileId).sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [k] of mine.slice(0, Math.max(0, mine.length - DEVICE_MAX))) delete d.devices[k];
    return { token, expiresAt: now + DEVICE_MS };
  }

  const creating = new Set();

  async function create(f) {
    if (!doc) throw new ProfileError("unavailable");
    const displayName = cleanLine(f.displayName, 16);
    const login = normLogin(f.login);
    const catchphrase = f.catchphrase === undefined || f.catchphrase === null ? "" : cleanLine(f.catchphrase, 80);
    const color = colors.includes(f.color) ? f.color : null;
    if (!displayName || !login || !validPin(f.pin) || f.pinConfirm !== f.pin || !color || catchphrase === null) throw new ProfileError("invalid");
    let backupColor = f.backupColor ?? null;
    if (backupColor !== null && (!colors.includes(backupColor) || backupColor === color)) throw new ProfileError("invalid");
    backupColor ??= colors.find((c) => c !== color);
    // The login is held from here, so a second creation racing this one is refused now, not after both have hashed.
    if (creating.has(login) || has(doc.logins, login) || has(doc.reservedLogins, login)) throw new ProfileError("loginTaken");
    if (!claim()) throw new ProfileError("busy");
    creating.add(login);
    try {
      const pin = await verifier(f.pin);
      return await mutate((d, now) => {
        if (has(d.logins, login) || has(d.reservedLogins, login)) throw new ProfileError("loginTaken");
        const id = randomUUID();
        delete d.unknownLogins[login];
        d.profiles[id] = { id, displayName, login, color, backupColor, catchphrase, winSongId: null, mediaKey: null, createdAt: now, updatedAt: now, pin, guard: newGuard() };
        d.logins[login] = id;
        return { profile: ownerView(d.profiles[id]), ...issue(d, id, now) };
      });
    } finally {
      creating.delete(login);
    }
  }

  async function login(rawLogin, pinText) {
    if (!doc) throw new ProfileError("unavailable");
    const name = normLogin(rawLogin);
    if (!name || !validPin(pinText)) throw new ProfileError("invalid");
    if (!claim()) throw new ProfileError("busy");
    // Reserve one attempt against every budget, durably, before any hashing.
    let held;
    try {
      held = await mutate((d, now) => {
        prune(d, now);
        const id = own(d.logins, name) ?? null;
        let g;
        if (id) g = d.profiles[id].guard;
        else {
          const keys = Object.keys(d.unknownLogins);
          if (!has(d.unknownLogins, name) && keys.length >= UNKNOWN_MAX) delete d.unknownLogins[keys[0]];
          if (!has(d.unknownLogins, name)) d.unknownLogins[name] = newGuard();
          g = d.unknownLogins[name];
        }
        if (refused(g, now, Boolean(id))) return null;
        const rid = randomUUID();
        g.pending[rid] = now;
        return { id, rid, pin: id ? d.profiles[id].pin : dummy };
      });
    } catch (e) {
      load--;
      throw e;
    }
    if (!held) {
      load--;
      throw new ProfileError("signInFailed");
    }
    let ok = false;
    try {
      const key = await derive(pinText, Buffer.from(held.pin.salt, "base64"), held.pin);
      const want = Buffer.from(held.pin.hash, "base64");
      ok = Boolean(held.id) && key.length === want.length && timingSafeEqual(key, want);
    } catch (e) {
      console.error("profiles: hash failed:", e.message);
    }
    // Stored under older parameters: rehash now that the PIN is known good. A failure here keeps the old verifier.
    let upgraded = null;
    if (ok && (held.pin.N !== SCRYPT.N || held.pin.r !== SCRYPT.r || held.pin.p !== SCRYPT.p) && claim()) upgraded = await verifier(pinText).catch(() => null);
    // The failure is committed before it is answered, so a refusal is never lost to a mutation that threw.
    const out = await mutate((d, now) => {
      const p = held.id ? d.profiles[held.id] : null;
      const g = p ? p.guard : own(d.unknownLogins, name);
      if (g) {
        const at = g.pending[held.rid];
        delete g.pending[held.rid];
        // A success frees its own reservation and nothing else; a failure stays counted in every window.
        if (!ok && at !== undefined) fail(g, at, Boolean(p));
      }
      if (!ok || !p) return null;
      // Expired temporary PIN: the verifier is no longer valid; treat as a failed login.
      // This counts as a guessing failure (contract §4 and §6 of expired-temp-PIN; see localResetPin comment).
      if (p.pinMustChange && p.tempPinExpiresAt !== null && p.tempPinExpiresAt <= now) {
        if (g) fail(g, now, true);
        return null;
      }
      if (upgraded) p.pin = upgraded;
      return { profile: ownerView(p), ...issue(d, p.id, now) };
    });
    if (!out) throw new ProfileError("signInFailed");
    return out;
  }

  // The device credential's profile, or null. Never touches PIN budgets.
  function validate(token) {
    if (!doc || typeof token !== "string" || !TOKEN.test(token)) return null;
    const dev = own(doc.devices, digest(token));
    if (!dev || dev.expiresAt <= clock() || !has(doc.profiles, dev.profileId)) return null;
    return dev.profileId;
  }

  function resume(token) {
    if (!doc) throw new ProfileError("unavailable");
    const id = validate(token);
    if (!id) throw new ProfileError("signedOut");
    return { profile: ownerView(doc.profiles[id]), expiresAt: doc.devices[digest(token)].expiresAt };
  }

  // Revokes this one credential. Other devices and every seat secret are untouched.
  async function logout(token) {
    if (!doc) throw new ProfileError("unavailable");
    if (!validate(token)) return false;
    return mutate((d) => {
      delete d.devices[digest(token)];
      return true;
    });
  }

  // Edit display name, colour, catchphrase, or login. Login renames require the current PIN.
  // Refuses if pinMustChange is set (temp-pin session must change PIN first).
  async function profileEdit(token, f) {
    if (!doc) throw new ProfileError("unavailable");
    const id = validate(token);
    if (!id) throw new ProfileError("signedOut");
    if (doc.profiles[id]?.pinMustChange) throw new ProfileError("mustChangePin");

    const newLogin = f.login !== undefined ? normLogin(f.login) : undefined;
    if (f.login !== undefined && !newLogin) throw new ProfileError("invalid");
    const isRename = newLogin !== undefined && newLogin !== doc.profiles[id].login;

    if (isRename) {
      if (!validPin(f.pin)) throw new ProfileError("invalid");
      if (!claim()) throw new ProfileError("busy");
      let held;
      try {
        held = await mutate((d, now) => {
          prune(d, now);
          const p = d.profiles[id];
          if (!p) throw new ProfileError("signedOut");
          const g = p.guard;
          if (refused(g, now, true)) return null;
          const rid = randomUUID();
          g.pending[rid] = now;
          return { rid, pin: p.pin };
        });
      } catch (e) {
        load--;
        throw e;
      }
      if (!held) {
        load--;
        throw new ProfileError("signInFailed");
      }
      let ok = false;
      try {
        const key = await derive(f.pin, Buffer.from(held.pin.salt, "base64"), held.pin);
        const want = Buffer.from(held.pin.hash, "base64");
        ok = key.length === want.length && timingSafeEqual(key, want);
      } catch {}
      return mutate((d, now) => {
        const p = d.profiles[id];
        if (!p) throw new ProfileError("signedOut");
        const at = p.guard.pending[held.rid];
        delete p.guard.pending[held.rid];
        if (!ok && at !== undefined) fail(p.guard, at, true);
        if (!ok) throw new ProfileError("signInFailed");
        if (has(d.logins, newLogin) || has(d.reservedLogins, newLogin)) throw new ProfileError("loginTaken");
        d.reservedLogins[p.login] = id;
        delete d.logins[p.login];
        p.login = newLogin;
        d.logins[newLogin] = id;
        _applyEditFields(p, f, colors);
        p.updatedAt = now;
        return { profile: ownerView(p) };
      });
    }

    // Non-rename: no PIN required.
    return mutate((d, now) => {
      const p = d.profiles[id];
      if (!p) throw new ProfileError("signedOut");
      _applyEditFields(p, f, colors);
      p.updatedAt = now;
      return { profile: ownerView(p) };
    });
  }

  // Change PIN. Requires valid device credential and current PIN. Blocked by lifetime lock.
  // On success: revoke all devices, issue replacement to the changing device. Budgets are not replenished.
  async function profileChangePin(token, currentPin, newPin, newPinConfirm) {
    if (!doc) throw new ProfileError("unavailable");
    const id = validate(token);
    if (!id) throw new ProfileError("signedOut");
    if (!validPin(currentPin) || !validPin(newPin) || newPin !== newPinConfirm) throw new ProfileError("invalid");
    // Lifetime lock is checked before reserving a budget slot, so a locked profile cannot even attempt.
    if (doc.profiles[id]?.guard.lifetime >= LIFETIME_FAILS) throw new ProfileError("pinLocked");
    if (!claim()) throw new ProfileError("busy");
    let held;
    try {
      held = await mutate((d, now) => {
        prune(d, now);
        const p = d.profiles[id];
        if (!p) throw new ProfileError("signedOut");
        const g = p.guard;
        if (g.lifetime >= LIFETIME_FAILS) throw new ProfileError("pinLocked");
        if (refused(g, now, true)) return null;
        const rid = randomUUID();
        g.pending[rid] = now;
        return { rid, pin: p.pin };
      });
    } catch (e) {
      load--;
      throw e;
    }
    if (!held) {
      load--;
      throw new ProfileError("signInFailed");
    }
    let ok = false;
    try {
      const key = await derive(currentPin, Buffer.from(held.pin.salt, "base64"), held.pin);
      const want = Buffer.from(held.pin.hash, "base64");
      ok = key.length === want.length && timingSafeEqual(key, want);
    } catch {}
    // Hash the new PIN before the commit; a hash failure aborts rather than saving a blank verifier.
    let newVerifier = null;
    if (ok && claim()) {
      newVerifier = await verifier(newPin).catch((e) => { load--; return null; });
    } else if (ok) {
      // Couldn't claim a slot for the new PIN hash.
      ok = false;
    }
    return mutate((d, now) => {
      const p = d.profiles[id];
      if (!p) throw new ProfileError("signedOut");
      const at = p.guard.pending[held.rid];
      delete p.guard.pending[held.rid];
      if (!ok && at !== undefined) fail(p.guard, at, true);
      if (!ok) throw new ProfileError("signInFailed");
      if (!newVerifier) throw new ProfileError("unavailable");
      p.pin = newVerifier;
      // Clear temp-PIN flags; do NOT replenish failure budgets.
      p.pinMustChange = false;
      p.tempPinExpiresAt = null;
      p.updatedAt = now;
      // Revoke all devices for this profile, then issue one replacement to the changing device.
      const tokenDigest = digest(token);
      for (const k of Object.keys(d.devices)) if (d.devices[k].profileId === id) delete d.devices[k];
      return { profile: ownerView(p), ...issue(d, id, now) };
    });
  }

  // Local admin only: clear all failure counters and the lifetime lock, revoke all devices, and issue a temporary
  // 4-digit PIN that must be changed before ordinary profile access. The returned plaintext PIN must be shown
  // only to the verified owner through a private channel; it expires after 15 minutes.
  //
  // Expired-temporary-PIN contract: when tempPinExpiresAt passes without a successful changePin —
  //   1. The previous PIN is NOT restored.
  //   2. Revoked devices are NOT restored.
  //   3. Ordinary profile access is NOT granted.
  //   4. The temporary verifier becomes invalid: login fails with signInFailed.
  //   5. Profile remains recoverable only by another verified local reset.
  //   6. Failure budgets stay cleared from the reset; expiry itself does NOT add to lifetime count.
  async function localResetPin(profileId) {
    if (!doc) throw new ProfileError("unavailable");
    if (!has(doc.profiles, profileId)) throw new ProfileError("notFound");
    const tempPin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!claim()) throw new ProfileError("busy");
    let pin;
    try {
      pin = await verifier(tempPin);
    } catch (e) {
      load--;
      throw e;
    }
    return mutate((d, now) => {
      const p = d.profiles[profileId];
      if (!p) throw new ProfileError("notFound");
      // Clear all failure budgets and the lifetime lock.
      p.guard = newGuard();
      // Revoke all devices.
      for (const k of Object.keys(d.devices)) if (d.devices[k].profileId === profileId) delete d.devices[k];
      // Set temp PIN and require change before ordinary access.
      p.pin = pin;
      p.pinMustChange = true;
      p.tempPinExpiresAt = now + 15 * 60 * 1000;
      p.updatedAt = now;
      return { tempPin, expiresAt: p.tempPinExpiresAt };
    });
  }

  return {
    get ready() {
      return Boolean(doc);
    },
    reason,
    create,
    login,
    resume,
    logout,
    profileEdit,
    profileChangePin,
    localResetPin,
    // For the next profile children (#763, #764): credential checks, private reads and serialized durable writes.
    validate,
    profile: (id) => (doc && typeof id === "string" && has(doc.profiles, id) ? structuredClone(doc.profiles[id]) : null),
    lookupLogin: (login) => (doc && typeof login === "string" ? (own(doc.logins, login) ?? null) : null),
    pinLocked: (id) => Boolean(doc && typeof id === "string" && has(doc.profiles, id) && doc.profiles[id].guard.lifetime >= LIFETIME_FAILS),
    mutate,
    claimHash: claim,
    verifier,
  };
}
