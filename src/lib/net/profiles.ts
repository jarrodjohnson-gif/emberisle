// #766(a): private, seatless profile requests. A sheet must show and confirm host before authenticating.
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
export type ProfileStatus = "idle" | "connecting" | "available" | "unsupported" | "offline" | "insecure";
export interface ProfileSnapshot {
  host: string;
  confirmed: boolean;
  status: ProfileStatus;
  profile: Readonly<ProfileOwner> | null;
  remembered: boolean;
}
// Call check() before open/join after a transport drop; offline attachment falls back to a guest.
// Table attachment asks at the moment of sending. No credential is put in Me, game state or saved seats.
export interface ProfileAttachment { credentialForHost(host: string): string | null }
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Reply = { type?: string; id?: number; [key: string]: unknown };
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
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
export function normalizeProfileHost(raw: string): string {
  const u = new URL(raw);
  if (!["ws:", "wss:"].includes(u.protocol) || u.username || u.password || u.hash) throw new ProfileClientError("unsupported");
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
  const forgetSession = () => { credential = null; expiresAt = 0; update({ profile: null, remembered: false }); };
  const failPending = (code: string) => {
    if (!pending) return;
    const p = pending; pending = null; clearTimeout(p.timer); p.reject(new ProfileClientError(code));
  };
  const disconnect = (code: string) => {
    generation++; connecting = null; failPending(code);
    const cancel = cancelConnecting; cancelConnecting = null; cancel?.(code);
    if (socket) { socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null; socket.close(); socket = null; }
  };
  const transportAllowed = (host: string) => {
    const u = new URL(host);
    return (location.protocol === "https:" && u.protocol === "wss:") ||
      (import.meta.env.DEV && options.development === true && location.protocol === "http:" && LOOPBACK.has(location.hostname) && u.protocol === "ws:" && LOOPBACK.has(u.hostname));
  };
  const request = (type: string, fields: Record<string, unknown> = {}): Promise<Reply> => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new ProfileClientError("offline"));
    if (pending) return Promise.reject(new ProfileClientError("busy"));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { failPending(type === "profileHello" ? "unsupported" : "offline"); disconnect("offline"); update({ status: "offline" }); }, options.timeoutMs ?? 15000);
      pending = { id, resolve, reject, timer };
      try { socket!.send(JSON.stringify({ type, id, ...fields })); }
      catch { failPending("offline"); }
    });
  };
  const ensure = async () => {
    if (!transportAllowed(snapshot.host)) { update({ status: "insecure" }); throw new ProfileClientError("https"); }
    if (snapshot.status === "available" && socket?.readyState === WebSocket.OPEN) return;
    if (connecting) return connecting;
    if (socket) disconnect("offline");
    const ownGeneration = generation;
    update({ status: "connecting" });
    const connection = new Promise<void>((resolve, reject) => {
      let settled = false;
      const cancel = (code: string) => finish(new ProfileClientError(code));
      const finish = (error?: ProfileClientError) => { if (settled) return; settled = true; clearTimeout(timer); if (cancelConnecting === cancel) cancelConnecting = null; error ? reject(error) : resolve(); };
      const timer = setTimeout(() => { finish(new ProfileClientError("offline")); disconnect("offline"); update({ status: "offline" }); }, options.timeoutMs ?? 15000);
      cancelConnecting = cancel;
      try { socket = new WebSocket(snapshot.host); }
      catch { update({ status: "offline" }); finish(new ProfileClientError("offline")); return; }
      const ownSocket = socket;
      const current = () => ownGeneration === generation && ownSocket === socket;
      ownSocket.onmessage = (event) => {
        if (!current() || typeof event.data !== "string" || event.data.length > 16384) return;
        let reply: Reply;
        try { reply = JSON.parse(event.data); } catch { return; }
        if (!reply || !pending || reply.id !== pending.id) return;
        const p = pending; pending = null; clearTimeout(p.timer);
        if (reply.type === "profileError") p.reject(new ProfileClientError(typeof reply.code === "string" && Object.hasOwn(messages, reply.code) ? reply.code : "unavailable"));
        else p.resolve(reply);
      };
      ownSocket.onopen = async () => {
        if (!current()) return;
        try {
          const reply = await request("profileHello");
          if (!current()) throw new ProfileClientError("hostChanged");
          if (reply.type !== "profileHello" || !Array.isArray(reply.caps) || !reply.caps.includes("profilesV1") || reply.available !== true) {
            update({ status: "unsupported" }); throw new ProfileClientError(reply.reason === "https" || reply.reason === "origin" ? "https" : "unsupported");
          }
          update({ status: "available" }); finish();
        } catch (e) { if (current() && snapshot.status === "connecting") update({ status: "unsupported" }); finish(e instanceof ProfileClientError ? e : new ProfileClientError("unavailable")); }
      };
      const lost = () => {
        if (!current()) return;
        socket = null; connecting = null;
        ownSocket.onopen = ownSocket.onmessage = ownSocket.onclose = ownSocket.onerror = null;
        ownSocket.close();
        update({ status: "offline" }); failPending("offline"); finish(new ProfileClientError("offline"));
      };
      ownSocket.onerror = lost;
      ownSocket.onclose = lost;
    });
    connecting = connection;
    try { await connection; } finally { if (connecting === connection) connecting = null; }
  };
  const authorized = async () => {
    if (!snapshot.confirmed) throw new ProfileClientError("confirmHost");
    const ownGeneration = generation;
    await ensure();
    if (generation !== ownGeneration || !snapshot.confirmed) throw new ProfileClientError("hostChanged");
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
  const adopt = (reply: Reply, ownGeneration: number, keep: boolean) => {
    if (ownGeneration !== generation) throw new ProfileClientError("hostChanged");
    const p = reply.profile as Partial<ProfileOwner> | null;
    const token = typeof reply.credential === "string" ? reply.credential : credential;
    if (reply.type !== "profileSession" || !p || !token || !TOKEN.test(token) || typeof reply.expiresAt !== "number" || !Number.isFinite(reply.expiresAt) || reply.expiresAt <= Date.now() ||
      typeof p.profileId !== "string" || typeof p.displayName !== "string" || typeof p.login !== "string" || typeof p.color !== "string" ||
      !(p.backupColor === null || typeof p.backupColor === "string") || typeof p.catchphrase !== "string" || !(p.winSongId === null || typeof p.winSongId === "string")) throw new ProfileClientError("unavailable");
    credential = token; expiresAt = reply.expiresAt;
    const profile: ProfileOwner = { profileId: p.profileId, displayName: p.displayName, login: p.login, color: p.color, backupColor: p.backupColor, catchphrase: p.catchphrase, winSongId: p.winSongId, ...(p.pinMustChange === true ? { pinMustChange: true } : {}) };
    update({ profile: Object.freeze(profile) }); remember(keep);
    return snapshot.profile!;
  };
  const sessionRequest = async (type: string, fields: Record<string, unknown>, keep: boolean, needsCredential: boolean) => {
    const ownGeneration = await authorized();
    if (needsCredential && (!credential || expiresAt <= Date.now())) throw new ProfileClientError("signedOut");
    try { return adopt(await request(type, { ...fields, ...(needsCredential ? { credential } : {}) }), ownGeneration, keep); }
    catch (error) {
      if (ownGeneration === generation && error instanceof ProfileClientError && error.code === "signedOut") { removeRemembered(); forgetSession(); }
      throw error;
    }
  };
  const fieldsOf = (f: Partial<ProfileFields>) => Object.fromEntries(["displayName", "login", "color", "backupColor", "catchphrase"].filter((key) => Object.hasOwn(f, key)).map((key) => [key, f[key as keyof ProfileFields]]));
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
      catch (error) { disconnect("hostChanged"); forgetSession(); update({ confirmed: false, status: "unsupported" }); throw error; }
      if (normalized === snapshot.host) return;
      disconnect("hostChanged"); forgetSession(); update({ host: normalized, confirmed: false, status: "idle" });
    },
    async check() { try { await ensure(); } catch { /* snapshot explains availability; never send credentials here */ } return snapshot; },
    create: (fields: ProfileFields & { pin: string; pinConfirm: string }, keep = false) => sessionRequest("profileCreate", { ...fieldsOf(fields), pin: fields.pin, pinConfirm: fields.pinConfirm }, keep, false),
    login: (login: string, pin: string, keep = false) => sessionRequest("profileLogin", { login, pin }, keep, false),
    async resume() {
      await authorized();
      let saved: { host?: unknown; credential?: unknown; expiresAt?: unknown; version?: unknown } | null = null;
      try { saved = JSON.parse(storage?.getItem(profileStorageKey(snapshot.host)) ?? "null"); } catch { /* unavailable storage */ }
      if (!saved || saved.version !== 1 || saved.host !== snapshot.host || typeof saved.credential !== "string" || !TOKEN.test(saved.credential) || typeof saved.expiresAt !== "number" || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) {
        removeRemembered(); throw new ProfileClientError("signedOut");
      }
      credential = saved.credential; expiresAt = saved.expiresAt;
      return sessionRequest("profileResume", {}, true, true);
    },
    edit: (fields: Partial<ProfileFields> & { pin?: string }) => sessionRequest("profileEdit", { ...fieldsOf(fields), ...(fields.pin === undefined ? {} : { pin: fields.pin }) }, snapshot.remembered, true),
    changePin: (currentPin: string, newPin: string, newPinConfirm: string) => sessionRequest("profileChangePin", { currentPin, newPin, newPinConfirm }, snapshot.remembered, true),
    async logout() {
      const ownHost = snapshot.host;
      const ownCredential = credential;
      try { await authorized(); if (credential) { const reply = await request("profileLogout", { credential }); if (reply.type !== "profileLoggedOut") throw new ProfileClientError("unavailable"); } }
      finally {
        removeRemembered(ownHost);
        if (snapshot.host === ownHost && credential === ownCredential) forgetSession();
      }
    },
    credentialForHost(host: string) {
      try { if (normalizeProfileHost(host) === snapshot.host && snapshot.confirmed && snapshot.status === "available" && transportAllowed(snapshot.host) && expiresAt > Date.now() && !snapshot.profile?.pinMustChange) return credential; } catch { /* guest */ }
      return null;
    },
    close() { disconnect("offline"); forgetSession(); update({ status: "idle", confirmed: false }); },
  };
}
