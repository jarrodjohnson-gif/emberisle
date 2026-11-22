// Proves profile client lifecycle, socket cleanup, and session isolation in src/lib/net/profiles.ts.
// Run: npm run profiles-lifecycle-prove
import assert from "node:assert/strict";
import { createServer } from "vite";

const HOST_A = "wss://host-a.example/";
const HOST_B = "wss://host-b.example/";
const HOST_LEGACY = "wss://legacy.example/";
const HOST_ERR = "wss://err.example/";

const CRED_A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CRED_B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const CRED_STALE = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

function makeProfile(id, name, login) {
  return {
    profileId: id,
    displayName: name,
    login,
    color: "#e23d2e",
    backupColor: null,
    catchphrase: "",
    winSongId: null,
  };
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    size: () => map.size,
  };
}

// Deterministic in-memory WebSocket fake. No timers, ports, or browser needed.
let sockets = [];
let onSocketSend = () => {};

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.sent = [];
    this.closedByClient = false;
    sockets.push(this);
    queueMicrotask(() => {
      if (this.readyState !== FakeWebSocket.CONNECTING) return;
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.({});
    });
  }
  send(raw) {
    const msg = JSON.parse(raw);
    this.sent.push(msg);
    onSocketSend(this, msg);
  }
  close() {
    this.closedByClient = true;
    this.readyState = FakeWebSocket.CLOSED;
  }
  deliver(obj) {
    queueMicrotask(() => {
      if (this.readyState !== FakeWebSocket.OPEN) return;
      this.onmessage?.({ data: JSON.stringify(obj) });
    });
  }
  serverClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }
}

const origWS = globalThis.WebSocket;
const origLoc = globalThis.location;
let fakeLoc = { protocol: "https:", hostname: "emberisle.example" };
globalThis.WebSocket = FakeWebSocket;
globalThis.location = fakeLoc;

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  checks++;
};
const drainMicrotasks = async (turns = 8) => {
  for (let i = 0; i < turns; i++) await Promise.resolve();
};
const waitUntil = async (cond, label, maxTurns = 100) => {
  for (let i = 0; i < maxTurns; i++) {
    if (cond()) return;
    await Promise.resolve();
  }
  assert.fail(`timed out waiting for ${label}`);
};

try {
  const { createProfileClient, profileStorageKey } = await vite.ssrLoadModule("/src/lib/net/profiles.ts");

  // 1. Unsupported profileHello closes the socket and server close never flips status to "offline".
  {
    sockets = [];
    onSocketSend = (ws, msg) => {
      if (msg.type === "profileHello" && ws.url === HOST_LEGACY) {
        ws.deliver({ type: "profileHello", id: msg.id, caps: [], available: false });
      } else if (msg.type === "profileHello" && ws.url === HOST_ERR) {
        ws.deliver({ type: "profileError", id: msg.id, code: "unavailable" });
      } else if (msg.type === "profileHello" && ws.url === HOST_A) {
        ws.deliver({ type: "profileHello", id: msg.id, caps: ["profilesV1", "recoveryV1"], available: true });
      }
    };

    const legacy = createProfileClient(HOST_LEGACY, { storage: makeStorage() });
    await legacy.check();
    const legacySock = sockets.at(-1);
    eq(legacy.getSnapshot().status, "unsupported", "legacy host reports unsupported");
    eq(legacy.getSnapshot().recovery ?? false, false, "legacy host has recovery false");
    ok(legacySock.closedByClient, "legacy socket is closed after unsupported profileHello");
    eq(legacySock.onclose, null, "legacy socket detaches onclose after unsupported profileHello");
    legacySock.serverClose();
    eq(legacy.getSnapshot().status, "unsupported", "server close after unsupported reply keeps status unsupported");

    const errored = createProfileClient(HOST_ERR, { storage: makeStorage() });
    await errored.check();
    const errSock = sockets.at(-1);
    eq(errored.getSnapshot().status, "unsupported", "profileError on profileHello reports unsupported");
    ok(errSock.closedByClient, "errored socket is closed after profileHello error");
    eq(errSock.onclose, null, "errored socket detaches onclose after profileHello error");
    errSock.serverClose();
    eq(errored.getSnapshot().status, "unsupported", "server close after profileHello error keeps status unsupported");

    // Control: available host stays open and a genuine server drop flips it to offline.
    const good = createProfileClient(HOST_A, { storage: makeStorage() });
    await good.check();
    const goodSock = sockets.at(-1);
    eq(good.getSnapshot().status, "available", "available host reports available");
    eq(good.getSnapshot().recovery, true, "available host sets recovery true");
    ok(!goodSock.closedByClient, "available socket stays open");
    goodSock.serverClose();
    eq(good.getSnapshot().status, "offline", "genuine drop on available host reports offline");
    good.close();
  }

  // 2. Stale recovery capability and setAt clear on logout, selectHost, close, and insecure check.
  {
    sockets = [];
    const exp = Date.now() + 60_000;
    onSocketSend = (ws, msg) => {
      if (msg.type === "profileHello") {
        const caps = ws.url === HOST_A ? ["profilesV1", "recoveryV1"] : ["profilesV1"];
        ws.deliver({ type: "profileHello", id: msg.id, caps, available: true });
      } else if (msg.type === "profileCreate") {
        ws.deliver({
          type: "profileSession",
          id: msg.id,
          profile: makeProfile("prof-a", "Alpha", "alpha"),
          credential: CRED_A,
          expiresAt: exp,
          recoverySetAt: 1730000000000,
          recoveryCode: "K7QM4X",
        });
      } else if (msg.type === "profileLogout") {
        ws.deliver({ type: "profileLoggedOut", id: msg.id });
      }
    };

    const client = createProfileClient(HOST_A, { storage: makeStorage() });
    client.confirmHost(HOST_A);
    await client.create({ displayName: "Alpha", login: "alpha", color: "#e23d2e", pin: "1234", pinConfirm: "1234" }, false);
    eq(client.getSnapshot().recovery, true, "Host A sets recovery true");
    eq(client.getSnapshot().setAt, 1730000000000, "create stores recoverySetAt");
    eq(client.getSnapshot().code, "K7QM4X", "create stores recoveryCode");

    await client.logout();
    eq(client.getSnapshot().profile, null, "logout clears profile");
    eq(client.getSnapshot().code, null, "logout clears recovery code");
    eq(client.getSnapshot().setAt, null, "logout clears setAt");

    // Re-authenticate then switch to Host B: both setAt and recovery must clear immediately.
    await client.create({ displayName: "Alpha", login: "alpha", color: "#e23d2e", pin: "1234", pinConfirm: "1234" }, false);
    client.selectHost(HOST_B);
    eq(client.getSnapshot().host, HOST_B, "selectHost switches host");
    eq(client.getSnapshot().setAt, null, "selectHost clears setAt");
    eq(client.getSnapshot().code, null, "selectHost clears code");
    eq(client.getSnapshot().recovery, false, "selectHost clears recovery capability before checking new host");

    // Reconnect to Host A (recovery true), then invalid selectHost must clear recovery too.
    client.selectHost(HOST_A);
    await client.check();
    eq(client.getSnapshot().recovery, true, "Host A restores recovery true");
    assert.throws(() => client.selectHost("https://not-ws.example/"), (e) => e.code === "unsupported");
    checks++;
    eq(client.getSnapshot().recovery, false, "invalid selectHost clears recovery capability");

    // Reconnect to Host A (recovery true), then insecure page protocol must clear recovery too.
    await client.check();
    eq(client.getSnapshot().recovery, true, "Host A available before insecure check");
    fakeLoc.protocol = "http:";
    await client.check();
    eq(client.getSnapshot().status, "insecure", "plaintext check sets insecure");
    eq(client.getSnapshot().recovery, false, "insecure check clears recovery capability");
    fakeLoc.protocol = "https:";

    // Reconnect to Host A (recovery true), then close() must clear recovery and setAt.
    client.confirmHost(HOST_A);
    await client.create({ displayName: "Alpha", login: "alpha", color: "#e23d2e", pin: "1234", pinConfirm: "1234" }, false);
    client.close();
    eq(client.getSnapshot().status, "idle", "close sets idle");
    eq(client.getSnapshot().recovery, false, "close clears recovery capability");
    eq(client.getSnapshot().setAt, null, "close clears setAt");
  }

  // 3. adopt() keeps code for same profile edits, but never leaks Profile A's code onto Profile B.
  {
    sockets = [];
    const exp = Date.now() + 60_000;
    onSocketSend = (ws, msg) => {
      if (msg.type === "profileHello") {
        ws.deliver({ type: "profileHello", id: msg.id, caps: ["profilesV1", "recoveryV1"], available: true });
      } else if (msg.type === "profileCreate") {
        ws.deliver({
          type: "profileSession",
          id: msg.id,
          profile: makeProfile("prof-a", "Alpha", "alpha"),
          credential: CRED_A,
          expiresAt: exp,
          recoverySetAt: 1730000000000,
          recoveryCode: "K7QM4X",
        });
      } else if (msg.type === "profileEdit") {
        ws.deliver({
          type: "profileSession",
          id: msg.id,
          profile: makeProfile("prof-a", "Alpha 2", "alpha"),
          expiresAt: exp,
          recoverySetAt: 1730000000000,
        });
      } else if (msg.type === "profileLogin") {
        ws.deliver({
          type: "profileSession",
          id: msg.id,
          profile: makeProfile("prof-b", "Beta", "beta"),
          credential: CRED_B,
          expiresAt: exp,
          recoverySetAt: null,
        });
      }
    };

    const client = createProfileClient(HOST_A, { storage: makeStorage() });
    client.confirmHost(HOST_A);
    await client.create({ displayName: "Alpha", login: "alpha", color: "#e23d2e", pin: "1234", pinConfirm: "1234" }, false);
    eq(client.getSnapshot().code, "K7QM4X", "Profile A receives its recovery code");

    // Control: editing Profile A without a new recoveryCode keeps Profile A's unsaved code.
    await client.edit({ displayName: "Alpha 2" });
    eq(client.getSnapshot().profile?.displayName, "Alpha 2", "same-profile edit updates profile");
    eq(client.getSnapshot().code, "K7QM4X", "same-profile edit keeps pending recovery code");

    // Switching directly to Profile B without logout must drop Profile A's secret code.
    await client.login("beta", "5678", false);
    eq(client.getSnapshot().profile?.profileId, "prof-b", "Profile B becomes active");
    eq(client.getSnapshot().setAt, null, "Profile B has null setAt");
    eq(client.getSnapshot().code, null, "Profile A recovery code does not leak onto Profile B");
    client.close();
  }

  // 4. resume() never clobbers an active session's credential on failure and respects generation on host switch.
  {
    sockets = [];
    const exp = Date.now() + 60_000;
    let resumeBehavior = "unavailable";
    let heldResume = null;
    onSocketSend = (ws, msg) => {
      if (msg.type === "profileHello") {
        ws.deliver({ type: "profileHello", id: msg.id, caps: ["profilesV1", "recoveryV1"], available: true });
      } else if (msg.type === "profileLogin") {
        ws.deliver({
          type: "profileSession",
          id: msg.id,
          profile: makeProfile("prof-a", "Alpha", "alpha"),
          credential: CRED_A,
          expiresAt: exp,
          recoverySetAt: null,
        });
      } else if (msg.type === "profileResume") {
        if (resumeBehavior === "hold") {
          heldResume = { ws, msg };
        } else if (resumeBehavior === "ok") {
          ws.deliver({
            type: "profileSession",
            id: msg.id,
            profile: makeProfile("prof-a", "Alpha", "alpha"),
            expiresAt: exp,
            recoverySetAt: null,
          });
        } else {
          ws.deliver({ type: "profileError", id: msg.id, code: resumeBehavior });
        }
      }
    };

    const storage = makeStorage();
    const client = createProfileClient(HOST_A, { storage });
    client.confirmHost(HOST_A);
    await client.login("alpha", "1234", false);
    eq(client.credentialForHost(HOST_A), CRED_A, "initial active credential is CRED_A");

    // Put a different remembered token in storage (e.g. from another tab or older session).
    const keyA = profileStorageKey(HOST_A);
    storage.setItem(keyA, JSON.stringify({ version: 1, host: HOST_A, credential: CRED_STALE, expiresAt: exp }));

    // 4a: resume fails with unavailable -> active credential must remain CRED_A, not CRED_STALE.
    resumeBehavior = "unavailable";
    await assert.rejects(() => client.resume(), (e) => e.code === "unavailable");
    checks++;
    eq(client.getSnapshot().profile?.profileId, "prof-a", "failed resume keeps active profile");
    eq(client.credentialForHost(HOST_A), CRED_A, "failed resume does not clobber active credential");

    // 4b: resume fails with signedOut -> stale remembered token is deleted, but active session stays intact.
    resumeBehavior = "signedOut";
    await assert.rejects(() => client.resume(), (e) => e.code === "signedOut");
    checks++;
    eq(storage.getItem(keyA), null, "signedOut resume clears stale storage entry");
    eq(client.getSnapshot().profile?.profileId, "prof-a", "signedOut resume does not drop live in-memory profile");
    eq(client.credentialForHost(HOST_A), CRED_A, "signedOut resume keeps live in-memory credential");
    client.close();

    // Control: signed-out successful resume (reply omits credential) adopts saved credential cleanly.
    const freshStorage = makeStorage();
    freshStorage.setItem(keyA, JSON.stringify({ version: 1, host: HOST_A, credential: CRED_A, expiresAt: exp }));
    const client2 = createProfileClient(HOST_A, { storage: freshStorage });
    client2.confirmHost(HOST_A);
    resumeBehavior = "ok";
    const resumed = await client2.resume();
    eq(resumed.profileId, "prof-a", "signed-out resume adopts profile");
    eq(client2.credentialForHost(HOST_A), CRED_A, "signed-out resume adopts saved credential");
    client2.close();

    // 4c: in-flight resume interrupted by selectHost(HOST_B) must not fire a late forgetSession on HOST_B.
    const raceStorage = makeStorage();
    raceStorage.setItem(keyA, JSON.stringify({ version: 1, host: HOST_A, credential: CRED_A, expiresAt: exp }));
    const client3 = createProfileClient(HOST_A, { storage: raceStorage });
    client3.confirmHost(HOST_A);
    resumeBehavior = "hold";
    const pendingResume = client3.resume();
    await waitUntil(() => heldResume !== null, "profileResume frame");
    ok(heldResume !== null, "profileResume frame reached fake wire");
    let hostBUpdates = 0;
    client3.selectHost(HOST_B);
    const unsub = client3.subscribe(() => { hostBUpdates++; });
    await assert.rejects(() => pendingResume, (e) => e.code === "hostChanged");
    checks++;
    await drainMicrotasks();
    unsub();
    eq(hostBUpdates, 0, "aborted resume emits zero late updates after selectHost");
    client3.close();
  }

  console.log(`profiles-lifecycle-prove ok (${checks} checks)`);
} finally {
  globalThis.WebSocket = origWS;
  globalThis.location = origLoc;
  await vite.close();
}
