// #766(a): private, seatless profile requests. A sheet must show and confirm host before authenticating.
import { TOKEN } from "@/lib/net/proto";

export interface ProfileOwner {
  profileId: string;
  displayName: string;
  login: string;
  color: string;
  backupColor: string | null;
  catchphrase: string;
  winSongId: string | null;
  pinMustChange?: true;
}
export interface ProfileFields {
  displayName: string;
  login: string;
  color: string;
  backupColor?: string | null;
  catchphrase?: string;
}
// #767: the owner's committed record, a page of their own history, and a page of the group Wins board. The host derives every
// number from counted results; the client only shows them. Win rate is null before the first counted game.
export interface ProfileRecord { games: number; wins: number; losses: number; winRate: number | null; streak: number; lastPlayed: number | null }
interface HistoryPlayer { name: string; color: string; kind: "human" | "bot"; points: number; won: boolean }
export interface HistoryRow { gameId: string; startedAt: number; endedAt: number; durationMs: number; victoryTarget: number | null; won: boolean; points: number; assisted: boolean; players: HistoryPlayer[] }
export interface WinsRow { rank: number; displayName: string; games: number; wins: number; losses: number; winRate: number | null; streak: number; you: boolean }
type ProfileStatus = "idle" | "connecting" | "available" | "unsupported" | "offline" | "insecure";
interface ProfileSnapshot {
  host: string;
  confirmed: boolean;
  status: ProfileStatus;
  profile: Readonly<ProfileOwner> | null;
  remembered: boolean;
  // #1437: the host offers recovery codes (caps recoveryV1); when the signed-in profile's code was made (null: none yet);
  // and a code just made, kept in page memory only until the player presses Done on "Save your recovery code".
  recovery?: boolean;
  setAt?: number | null;
  code?: string | null;
}
// Call check() before open/join after a transport drop; offline attachment falls back to a guest.
// Table attachment asks at the moment of sending. No credential is put in Me, game state or saved seats.
export interface ProfileAttachment { credentialForHost(host: string): string | null }
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Reply = { type?: string; id?: number; [key: string]: unknown };
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const messages: Record<string, string> = {
  confirmHost: "Confirm the selected host before signing in.",
  hostChanged: "The selected host changed. Confirm it before signing in.",
  https: "Profiles need the HTTPS link. You can still play as a guest.",
  unsupported: "Profiles unavailable on this host.",
  offline: "The host is offline. You can still play as a guest.",
  busy: "The host is busy. Try again in a moment.",
  invalid: "Check the highlighted fields.",
  loginTaken: "Choose another login.",
  loginLimit: "You have changed your login too often. You can switch back to an old one.",
  signInFailed: "Couldn't sign in. Check your login and PIN, or try again later.",
  signedOut: "Signed out on this device. Sign in again.",
  slowDown: "Slow down.",
  unavailable: "Profiles unavailable on this host.",
  pinLocked: "PIN changes are locked. Contact the host for a verified local reset.",
  mustChangePin: "Change your PIN before continuing.",
};
export class ProfileClientError extends Error {
  constructor(readonly code: string) { super(messages[code] ?? messages.unavailable); this.name = "ProfileClientError"; }
}
const err = (code: string) => new ProfileClientError(code);
const str = (v: unknown): v is string => typeof v === "string";
export function normalizeProfileHost(raw: string): string {
  const u = new URL(raw);
  if (!["ws:", "wss:"].includes(u.protocol) || u.username || u.password || u.hash) throw err("unsupported");
  return u.href;
}
export const profileStorageKey = (host: string) => `emberisle-profile:${encodeURIComponent(normalizeProfileHost(host))}`;

export function createProfileClient(initialHost: string, options: {
  storage?: StorageLike | null;
  development?: boolean;
  timeoutMs?: number;
} = {}) {
  let storage: StorageLike | null = null;
  try { storage = options.storage === undefined ? globalThis.localStorage : options.storage; } catch { /* memory-only */ }
  let snapshot: ProfileSnapshot = { host: normalizeProfileHost(initialHost), confirmed: false, status: "idle", profile: null, remembered: false };
  let credential: string | null = null;
  let expiresAt = 0;
  let generation = 0;
  let nextId = 0;
  let socket: WebSocket | null = null;
  let connecting: Promise<void> | null = null;
  let cancelConnecting: ((code: string) => void) | null = null;
  let pending: { id: number; resolve(value: Reply): void; reject(error: ProfileClientError): void; timer: ReturnType<typeof setTimeout> } | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<ProfileSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    listeners.forEach((listener) => listener());
  };
  const removeRemembered = (host = snapshot.host) => { try { storage?.removeItem(profileStorageKey(host)); } catch { /* blocked storage */ } };
  const forgetSession = () => { credential = null; expiresAt = 0; update({ profile: null, remembered: false, code: null, setAt: null }); };
  const dropSocket = () => {
    const ws = socket;
    if (!ws) return;
    socket = null;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    ws.close();
  };
  const failPending = (code: string) => {
    if (!pending) return;
    const p = pending; pending = null; clearTimeout(p.timer); p.reject(err(code));
  };
  const disconnect = (code: string) => {
    if (code === "hostChanged") generation++;
    connecting = null; failPending(code);
    const cancel = cancelConnecting; cancelConnecting = null; cancel?.(code);
    dropSocket();
  };
  const reset = (patch: Partial<ProfileSnapshot>) => {
    disconnect("hostChanged"); forgetSession(); update({ confirmed: false, recovery: false, ...patch });
  };
  const transportAllowed = (host: string) => {
    const u = new URL(host);
    return (location.protocol === "https:" && u.protocol === "wss:") ||
      (import.meta.env.DEV && options.development === true && location.protocol === "http:" && LOOPBACK.has(location.hostname) && u.protocol === "ws:" && LOOPBACK.has(u.hostname));
  };
  const timeout = options.timeoutMs ?? 15000;
  const request = (type: string, fields: Record<string, unknown> = {}): Promise<Reply> => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(err("offline"));
    if (pending) return Promise.reject(err("busy"));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { failPending(type === "profileHello" ? "unsupported" : "offline"); disconnect("offline"); update({ status: "offline" }); }, timeout);
      pending = { id, resolve, reject, timer };
      try { socket!.send(JSON.stringify({ type, id, ...fields })); }
      catch { failPending("offline"); }
    });
  };
  const ensure = async () => {
    if (!transportAllowed(snapshot.host)) { update({ status: "insecure", recovery: false }); throw err("https"); }
    if (snapshot.status === "available" && socket?.readyState === WebSocket.OPEN) return;
    if (connecting) return connecting;
    if (socket) disconnect("offline");
    const ownGeneration = generation;
    update({ status: "connecting" });
    const connection = new Promise<void>((resolve, reject) => {
      let settled = false;
      const cancel = (code: string) => finish(err(code));
      const finish = (error?: ProfileClientError) => { if (settled) return; settled = true; clearTimeout(timer); if (cancelConnecting === cancel) cancelConnecting = null; error ? reject(error) : resolve(); };
      const timer = setTimeout(() => { finish(err("offline")); disconnect("offline"); update({ status: "offline" }); }, timeout);
      cancelConnecting = cancel;
      try { socket = new WebSocket(snapshot.host); }
      catch { update({ status: "offline" }); finish(err("offline")); return; }
      const ownSocket = socket;
      const current = () => ownGeneration === generation && ownSocket === socket;
      ownSocket.onmessage = (event) => {
        if (!current() || !str(event.data) || event.data.length > 16384) return;
        let reply: Reply;
        try { reply = JSON.parse(event.data); } catch { return; }
        if (!reply || !pending || reply.id !== pending.id) return;
        const p = pending; pending = null; clearTimeout(p.timer);
        // #1437: recoverFailed keeps its code; the recovery chunk words it (the class falls back to the unavailable text).
        if (reply.type === "profileError") p.reject(err(str(reply.code) && (Object.hasOwn(messages, reply.code) || reply.code === "recoverFailed") ? reply.code : "unavailable"));
        else p.resolve(reply);
      };
      ownSocket.onopen = async () => {
        if (!current()) return;
        try {
          const reply = await request("profileHello");
          if (!current()) throw err("hostChanged");
          if (reply.type !== "profileHello" || !Array.isArray(reply.caps) || !reply.caps.includes("profilesV1") || reply.available !== true) {
            throw err(reply.reason === "https" || reply.reason === "origin" ? "https" : "unsupported");
          }
          update({ status: "available", recovery: reply.caps.includes("recoveryV1") }); finish();
        } catch (e) {
          if (current()) {
            if (snapshot.status === "connecting") update({ status: "unsupported", recovery: false });
            dropSocket();
          }
          finish(e instanceof ProfileClientError ? e : err("unavailable"));
        }
      };
      const lost = () => {
        if (!current()) return;
        connecting = null;
        dropSocket();
        update({ status: "offline" }); failPending("offline"); finish(err("offline"));
      };
      ownSocket.onerror = lost;
      ownSocket.onclose = lost;
    });
    connecting = connection;
    try { await connection; } finally { if (connecting === connection) connecting = null; }
  };
  const authorized = async () => {
    if (!snapshot.confirmed) throw err("confirmHost");
    const ownGeneration = generation;
    await ensure();
    if (generation !== ownGeneration || !snapshot.confirmed) throw err("hostChanged");
    return ownGeneration;
  };
  const remember = (wanted: boolean) => {
    let remembered = false;
    removeRemembered();
    if (wanted && credential && storage) try {
      storage.setItem(profileStorageKey(snapshot.host), JSON.stringify({ version: 1, host: snapshot.host, credential, expiresAt }));
      remembered = true;
    } catch { /* retain the session in memory */ }
    update({ remembered });
  };
  const adopt = (reply: Reply, ownGeneration: number, keep: boolean, fallbackCredential: string | null = null) => {
    if (ownGeneration !== generation) throw err("hostChanged");
    const p = reply.profile as Partial<ProfileOwner> | null;
    const token = str(reply.credential) ? reply.credential : fallbackCredential;
    if (reply.type !== "profileSession" || !p || !token || !TOKEN.test(token) || typeof reply.expiresAt !== "number" || !Number.isFinite(reply.expiresAt) || reply.expiresAt <= Date.now() ||
      !str(p.profileId) || !str(p.displayName) || !str(p.login) || !str(p.color) ||
      !(p.backupColor === null || str(p.backupColor)) || !str(p.catchphrase) || !(p.winSongId === null || str(p.winSongId))) throw err("unavailable");
    credential = token; expiresAt = reply.expiresAt;
    const profile: ProfileOwner = { profileId: p.profileId, displayName: p.displayName, login: p.login, color: p.color, backupColor: p.backupColor, catchphrase: p.catchphrase, winSongId: p.winSongId, ...(p.pinMustChange === true ? { pinMustChange: true } : {}) };
    // #1437: only the reply that made a code sets it; a later reply for the same profile keeps it. Done, sign-out or a new profile drops it.
    update({ profile: Object.freeze(profile), setAt: (reply.recoverySetAt as number | null) ?? null, code: (reply.recoveryCode as string | undefined) ?? (snapshot.profile?.profileId === p.profileId ? snapshot.code : null) }); remember(keep);
    return snapshot.profile!;
  };
  const sessionRequest = async (type: string, fields: Record<string, unknown>, keep: boolean, needsCredential: boolean, explicitCredential?: string) => {
    const ownGeneration = await authorized();
    const cred = explicitCredential ?? (needsCredential ? credential : null);
    if (needsCredential && (!cred || expiresAt <= Date.now())) throw err("signedOut");
    try { return adopt(await request(type, { ...fields, ...(cred ? { credential: cred } : {}) }), ownGeneration, keep, cred); }
    catch (error) {
      if (ownGeneration === generation && error instanceof ProfileClientError && error.code === "signedOut") {
        removeRemembered();
        if (!explicitCredential || !snapshot.profile) forgetSession();
      }
      throw error;
    }
  };
  // An owner-only read. Its reply is dropped if the host or the signed-in profile changed while it was out.
  const query = async (type: "profileRecord" | "profileHistory" | "profileWins" | "profileNewCode", fields: Record<string, unknown> = {}, want: string = type) => {
    const ownGeneration = await authorized();
    const owner = snapshot.profile?.profileId;
    if (!owner || !credential || expiresAt <= Date.now()) throw err("signedOut");
    try {
      const reply = await request(type, { ...fields, credential });
      if (ownGeneration !== generation || snapshot.profile?.profileId !== owner) throw err("hostChanged");
      if (reply.type !== want) throw err("unavailable");
      return reply;
    } catch (error) {
      if (ownGeneration === generation && snapshot.profile?.profileId === owner && error instanceof ProfileClientError && error.code === "signedOut") { removeRemembered(); forgetSession(); }
      throw error;
    }
  };
  const fieldsOf = (f: Partial<ProfileFields>) => {
    const out: Record<string, unknown> = {};
    for (const key of ["displayName", "login", "color", "backupColor", "catchphrase"] as const) if (Object.hasOwn(f, key)) out[key] = f[key];
    return out;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    confirmHost(host: string) {
      let matches = false;
      try { matches = normalizeProfileHost(host) === snapshot.host; } catch { /* invalid endpoint */ }
      update({ confirmed: matches }); return matches;
    },
    selectHost(host: string) {
      let normalized: string;
      try { normalized = normalizeProfileHost(host); }
      catch (error) { reset({ status: "unsupported" }); throw error; }
      if (normalized === snapshot.host) return;
      reset({ host: normalized, status: "idle" });
    },
    async check() { try { await ensure(); } catch { /* snapshot explains availability; never send credentials here */ } return snapshot; },
    create: (fields: ProfileFields & { pin: string; pinConfirm: string }, keep = false) => sessionRequest("profileCreate", { ...fieldsOf(fields), pin: fields.pin, pinConfirm: fields.pinConfirm }, keep, false),
    login: (login: string, pin: string, keep = false) => sessionRequest("profileLogin", { login, pin }, keep, false),
    async resume() {
      await authorized();
      let saved: { host?: unknown; credential?: unknown; expiresAt?: unknown; version?: unknown } | null = null;
      try { saved = JSON.parse(storage?.getItem(profileStorageKey(snapshot.host)) ?? "null"); } catch { /* unavailable storage */ }
      if (!saved || saved.version !== 1 || saved.host !== snapshot.host || !str(saved.credential) || !TOKEN.test(saved.credential) || typeof saved.expiresAt !== "number" || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) {
        removeRemembered(); throw err("signedOut");
      }
      return sessionRequest("profileResume", {}, true, false, saved.credential);
    },
    edit: (fields: Partial<ProfileFields> & { pin?: string }) => sessionRequest("profileEdit", { ...fieldsOf(fields), ...(fields.pin === undefined ? {} : { pin: fields.pin }) }, snapshot.remembered, true),
    changePin: (currentPin: string, newPin: string, newPinConfirm: string) => sessionRequest("profileChangePin", { currentPin, newPin, newPinConfirm }, snapshot.remembered, true),
    // profileRecord, profileHistory or profileWins; the records view checks the reply's shape.
    query,
    // #1437, for the recovery chunk: a request answered by a profileSession (profileRecover signs in with one), and the code
    // "Save your recovery code" shows (from New recovery code), which Done drops with null.
    session: sessionRequest,
    code: (code: string | null, setAt: number | null | undefined) => update({ code, setAt }),
    async logout() {
      const ownHost = snapshot.host;
      const ownCredential = credential;
      try { await authorized(); if (credential) { const reply = await request("profileLogout", { credential }); if (reply.type !== "profileLoggedOut") throw err("unavailable"); } }
      finally {
        removeRemembered(ownHost);
        if (snapshot.host === ownHost && credential === ownCredential) forgetSession();
      }
    },
    credentialForHost(host: string) {
      if (!snapshot.profile) return null;
      try { if (normalizeProfileHost(host) === snapshot.host && snapshot.confirmed && snapshot.status === "available" && transportAllowed(snapshot.host) && expiresAt > Date.now() && !snapshot.profile?.pinMustChange) return credential; } catch { /* guest */ }
      return null;
    },
    close() { reset({ status: "idle" }); },
  };
}
