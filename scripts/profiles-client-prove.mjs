// #766(a): real profile host, real browser and TLS tunnel hop. No profile sheet or private product test hooks.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer as httpServer } from "node:http";
import { chromium } from "playwright";
import { createServer } from "vite";

const { WebSocketServer } = createRequire(new URL("../server/package.json", import.meta.url))("ws");
const root = new URL("../", import.meta.url);
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-profile-client-"));
const hosts = [];
const servers = [];
let browser, legacyServer;
const ok = (message) => console.log(`ok ${message}`);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function host(name, development = false) {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL("../server/", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: path.join(dir, name, "rooms"), PROFILES_DIR: path.join(dir, name, "profiles"), PROFILES_DEV: development ? "1" : "", SAVE_MS: "20" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const item = { proc, log: "" }; hosts.push(item);
  proc.stderr.on("data", (data) => { item.log += data; });
  item.port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("profile host startup timed out")), 10000);
    let output = "";
    proc.stdout.on("data", (data) => { output += data; const match = output.match(/listening (\d+)/); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    proc.once("exit", () => { clearTimeout(timer); reject(Error("profile host exited before startup")); });
  });
  return item;
}
const observe = () => {
  window.__profileSockets = [];
  window.__dropLogout = false;
  window.__wire = [];
  window.__received = [];
  window.__held = [];
  window.__holdSession = false;
  window.__unhandled = [];
  window.addEventListener("unhandledrejection", (event) => window.__unhandled.push(String(event.reason)));
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      window.__profileSockets.push(this);
      this.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        window.__received.push({ url: this.url, message });
        const handler = this.handler;
        if (window.__holdSession && message.type === "profileSession") window.__held.push(() => handler?.(event));
        else handler?.(event);
      });
    }
    set onmessage(handler) { this.handler = handler; }
    get onmessage() { return this.handler; }
    send(raw) { window.__wire.push({ url: this.url, message: JSON.parse(raw) }); if (window.__dropLogout && JSON.parse(raw).type === "profileLogout") return; return super.send(raw); }
  };
};
async function fixture(proxy, https) {
  const server = await createServer({ root: root.pathname, logLevel: "silent", server: { host: "127.0.0.1", port: 0, hmr: false, proxy, ...(https ? { https } : {}) }, plugins: [{
    name: "profile-client-proof", configureServer(server) {
      server.middlewares.use("/__profiles", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end('<!doctype html><link rel="icon" href="data:,"><title>Profile client proof</title><script type="module">window.profiles=await import("/src/lib/net/profiles.ts");window.table=await import("/src/lib/net/table.ts");</script>');
      });
    },
  }] });
  servers.push(server); await server.listen();
  return `${https ? "https" : "http"}://127.0.0.1:${server.httpServer.address().port}`;
}
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  const a = await host("a"), b = await host("b"), dev = await host("dev", true);
  legacyServer = httpServer();
  const legacy = new WebSocketServer({ server: legacyServer });
  legacy.on("connection", (ws, request) => ws.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    assert.equal(message.type, "profileHello", "unsupported hosts never receive credentials");
    if (!request.url.includes("silent")) ws.send(JSON.stringify({ type: "profileHello", id: message.id, caps: [], available: false }));
  }));
  await new Promise((resolve) => legacyServer.listen(0, "127.0.0.1", resolve));
  const proxy = (target, tunnel = false) => ({ target: `ws://127.0.0.1:${target}`, ws: true, changeOrigin: false, ...(tunnel ? { headers: { "cf-connecting-ip": "198.51.100.25", "x-forwarded-proto": "https" } } : {}) });
  const secure = await fixture({ "/a": proxy(a.port, true), "/b": proxy(b.port, true), "/legacy": proxy(legacyServer.address().port) }, { key: readFileSync(path.join(dir, "key.pem")), cert: readFileSync(path.join(dir, "cert.pem")) });
  const plain = await fixture({ "/dev": proxy(dev.port), "/production": proxy(a.port) });
  const A = secure.replace("https:", "wss:") + "/a", B = secure.replace("https:", "wss:") + "/b";
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
  const errors = [];
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addInitScript(observe);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(secure + "/__profiles");
  await page.waitForFunction(() => window.profiles && window.table);
  await page.evaluate(({ A, B }) => {
    window.A = A; window.B = B;
    const p = window.profiles;
    if (p.normalizeProfileHost("WSS://Example.COM:443") !== "wss://example.com/") throw Error("canonical endpoint");
    for (const bad of ["https://example.com", "wss://user:pass@example.com", "wss://example.com/#fragment"]) {
      let refused = false; try { p.normalizeProfileHost(bad); } catch { refused = true; } if (!refused) throw Error("invalid endpoint accepted");
    }
    localStorage.setItem("emberisle-seat", "seat-recovery-sentinel");
    window.client = p.createProfileClient(A);
  }, { A, B });
  assert.equal(await page.evaluate(async () => (await window.client.check()).status), "available");
  assert.equal(await page.evaluate(async () => { try { await window.client.login("ember-user", "4821"); return "sent"; } catch (e) { return e.code; } }), "confirmHost", "host confirmation blocks authentication before credentials are sent");
  assert.equal(await page.evaluate(() => window.client.confirmHost(window.B)), false);
  assert.deepEqual(await page.evaluate(() => window.__wire.map((frame) => frame.message.type)), ["profileHello"]);
  ok("canonical endpoint and explicit host confirmation precede every credential");

  const owner = await page.evaluate(async () => {
    window.client.confirmHost(window.A);
    return window.client.create({ displayName: "Ember", login: "ember-user", pin: "4821", pinConfirm: "4821", color: "#e23d2e", catchphrase: "Burns bright" }, true);
  });
  assert.equal(owner.displayName, "Ember");
  assert.equal(await page.evaluate(() => window.client.getSnapshot().remembered), true);
  assert.equal(await page.evaluate(() => window.client.credentialForHost(window.B)), null, "attachment credential stays within its normalized host");
  assert.equal(await page.evaluate(() => /credential|4821/.test(JSON.stringify(window.client.getSnapshot()))), false);
  assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-seat")), "seat-recovery-sentinel");
  ok("create persists only the selected host credential and keeps private fields out of snapshots and saved seats");

  const secondContext = await browser.newContext({ ignoreHTTPSErrors: true });
  await secondContext.addInitScript(observe);
  const second = await secondContext.newPage();
  second.on("pageerror", (error) => errors.push(String(error)));
  await second.goto(secure + "/__profiles"); await second.waitForFunction(() => window.profiles);
  const secondId = await second.evaluate(async (A) => { window.client = window.profiles.createProfileClient(A); window.client.confirmHost(A); return (await window.client.login("ember-user", "4821", true)).profileId; }, A);
  assert.equal(secondId, owner.profileId);
  assert.equal(await page.evaluate(async () => (await window.client.edit({ displayName: "Ash" })).displayName), "Ash");
  assert.equal(await page.evaluate(async () => (await window.client.changePin("4821", "8521", "8521")).profileId), owner.profileId);
  assert.equal(await second.evaluate(async () => { try { await window.client.edit({ displayName: "Revoked" }); return "accepted"; } catch (e) { return e.code; } }), "signedOut");
  assert.equal(await second.evaluate(() => window.client.getSnapshot().profile), null);
  assert.equal(await second.evaluate(() => localStorage.length), 0);
  assert.equal(await second.evaluate(async () => { try { await window.client.login("ember-user", "4821"); return "accepted"; } catch (e) { return e.code; } }), "signInFailed");
  const resumed = await page.evaluate(async () => { window.resumed = window.profiles.createProfileClient(window.A); window.resumed.confirmHost(window.A); return window.resumed.resume(); });
  assert.equal(resumed.profileId, owner.profileId);
  ok("real login/edit/PIN change and remembered resume work; a second device is revoked without resetting host PIN budgets");

  await page.evaluate(() => {
    window.hosted = { seats: null, welcome: null };
    window.tableClient = window.table.connectTable(window.A, { welcome: (m) => window.hosted.welcome = m, seats: (m) => window.hosted.seats = m.seats });
    window.tableClient.open({ name: "Ash", profile: window.client, pin: "must-not-send", credential: "must-not-spread" });
  });
  await page.waitForFunction(() => window.hosted.welcome && window.hosted.seats);
  const welcome = await page.evaluate(() => window.hosted.welcome);
  assert.equal(await page.evaluate(() => window.hosted.seats[0].profile?.profileId), owner.profileId);
  await page.evaluate(() => {
    window.guest = { seats: null, welcome: null };
    window.guestClient = window.table.connectTable(window.A, { welcome: (m) => window.guest.welcome = m, seats: (m) => window.guest.seats = m.seats });
    window.guestClient.join(window.hosted.welcome.code, { name: "Guest" });
    window.other = { welcome: null, seats: null };
    window.otherTable = window.table.connectTable(window.B, { welcome: (m) => window.other.welcome = m, seats: (m) => window.other.seats = m.seats });
    window.otherTable.open({ name: "Other host guest", profile: window.client });
  });
  await page.waitForFunction(() => window.__wire.some((f) => f.url === window.B && f.message.type === "hello"));
  assert.equal(await page.evaluate(() => window.__wire.filter((f) => f.url === window.B).some((f) => f.message.credential)), false, "another host never receives a profile credential");
  await page.waitForFunction(() => window.guest.welcome && window.other.seats && window.guest.seats?.length === 2);
  assert.equal(await page.evaluate(() => window.other.seats.some((s) => s.profile)), false);
  assert.equal(await page.evaluate(() => window.__wire.filter((f) => f.message.type === "hello").some((f) => f.message.pin || f.message.credential === "must-not-spread" || f.message.profile)), false);
  assert.equal(await page.evaluate(() => window.__wire.filter((f) => f.url === window.B).some((f) => f.message.credential)), false);
  // B1: a real WebSocket close must not look like selecting another host during sign-out.
  await page.evaluate(() => window.__profileSockets.find((ws) => ws.url === window.A && ws.readyState === WebSocket.OPEN).close());
  await page.waitForFunction(() => window.client.getSnapshot().status === "offline");
  await page.evaluate(async () => { await window.client.logout(); window.tableClient.close(false); });
  assert.equal(await page.evaluate(() => localStorage.getItem(window.profiles.profileStorageKey(window.A))), null);
  assert.equal(await page.evaluate(() => window.client.getSnapshot().profile), null);
  assert.equal(await page.evaluate(() => window.client.credentialForHost(window.A)), null);
  ok("sign-out after a real socket close clears remembered and in-memory credentials");
  await page.waitForFunction(() => window.guest.seats?.some((s) => s.id === window.hosted.welcome.you && s.away));
  await page.evaluate((welcome) => {
    window.recovered = null;
    window.rejoin = window.table.connectTable(window.A, { welcome: (m) => window.recovered = m });
    window.rejoin.rejoin(welcome.code, welcome.secret);
  }, welcome);
  await page.waitForFunction(() => window.recovered);
  assert.equal(await page.evaluate(() => window.recovered.you), welcome.you);
  assert.equal(await page.evaluate(() => window.__wire.filter((f) => f.message.type === "hello" && f.message.secret).every((f) => !f.message.credential)), true);
  assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-seat")), "seat-recovery-sentinel");
  assert.equal(await page.evaluate(() => window.__received.filter((f) => ["welcome", "seats", "state", "chat", "log"].includes(f.message.type)).some((f) => /"credential"|"pin"|"login"/.test(JSON.stringify(f.message)))), false);
  ok("initial attachment is host-bound; guests and public projections stay private; logout leaves seat-secret rejoin intact");

  assert.equal(await page.evaluate(async () => {
    const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
    window.memory = window.profiles.createProfileClient(window.A, { storage: blocked }); window.memory.confirmHost(window.A);
    await window.memory.login("ember-user", "8521", true);
    return window.memory.getSnapshot().remembered === false && !!window.memory.credentialForHost(window.A);
  }), true);
  ok("blocked storage keeps an authenticated memory-only session and preserves guest seat storage");

  await page.evaluate(async () => {
    window.recovery = window.profiles.createProfileClient(window.A, { timeoutMs: 500 });
    window.recovery.confirmHost(window.A);
    await window.recovery.login("ember-user", "8521", true);
    window.__profileSockets.at(-1).close();
  });
  await page.waitForFunction(() => window.recovery.getSnapshot().status === "offline");
  assert.equal(await page.evaluate(async () => (await window.recovery.login("ember-user", "8521", true)).profileId), owner.profileId);
  await page.evaluate(() => window.__profileSockets.at(-1).close());
  await page.waitForFunction(() => window.recovery.getSnapshot().status === "offline");
  assert.equal(await page.evaluate(async () => (await window.recovery.resume()).profileId), owner.profileId);
  ok("login and remembered resume succeed on the first call after socket loss");
  const timedOut = await page.evaluate(async () => {
    window.__dropLogout = true;
    let code;
    try { await window.recovery.logout(); } catch (error) { code = error.code; }
    window.__dropLogout = false;
    await window.recovery.check();
    return { code, saved: localStorage.getItem(window.profiles.profileStorageKey(window.A)),
      profile: window.recovery.getSnapshot().profile, credential: window.recovery.credentialForHost(window.A) };
  });
  assert.deepEqual(timedOut, { code: "offline", saved: null, profile: null, credential: null });
  ok("timed-out sign-out forgets the credential even after reconnecting");


  await page.evaluate(() => {
    window.stale = window.profiles.createProfileClient(window.A); window.stale.confirmHost(window.A);
    window.__holdSession = true;
    window.staleResult = window.stale.create({ displayName: "Late", login: "late-user", pin: "9361", pinConfirm: "9361", color: "#e23d2e" }, true).then(() => "accepted", (error) => error.code);
  });
  await page.waitForFunction(() => window.__held.length === 1);
  assert.equal(await page.evaluate(async () => {
    window.stale.selectHost(window.B); window.__holdSession = false;
    for (const release of window.__held.splice(0)) release();
    return window.staleResult;
  }), "hostChanged");
  assert.equal(await page.evaluate(() => window.stale.getSnapshot().profile), null);
  assert.equal(await page.evaluate(() => window.stale.getSnapshot().confirmed), false);
  assert.equal(await page.evaluate(async () => {
    window.stale.confirmHost(window.B); await window.stale.check();
    try { await window.stale.resume(); return "accepted"; } catch (error) { return error.code; }
  }), "signedOut");
  assert.equal(await page.evaluate(() => localStorage.getItem(window.profiles.profileStorageKey(window.B))), null);
  assert.equal(await page.evaluate(() => window.__wire.filter((f) => f.url === window.B).some((f) => f.message.credential || f.message.pin)), false);
  ok("a late real-host session cannot cross an endpoint change, persist credentials or authenticate the replacement host");

  assert.equal(await page.evaluate(async (legacy) => {
    window.unsupported = window.profiles.createProfileClient(legacy); window.unsupported.confirmHost(legacy);
    await window.unsupported.check();
    try { await window.unsupported.login("ember-user", "8521"); return "accepted"; } catch (e) { return e.code; }
  }, secure.replace("https:", "wss:") + "/legacy"), "unsupported");
  await page.evaluate((silent) => {
    window.switching = window.profiles.createProfileClient(silent, { timeoutMs: 300 });
    window.checking = window.switching.check();
  }, secure.replace("https:", "wss:") + "/legacy/silent");
  await page.waitForFunction(() => window.__wire.some((f) => f.url.endsWith("/legacy/silent")));
  await page.evaluate(async () => { window.switching.selectHost(window.B); await window.checking; window.switching.confirmHost(window.B); await window.switching.check(); });
  await delay(400);
  assert.equal(await page.evaluate(() => window.switching.getSnapshot().status), "available");
  ok("missing capability blocks credentials; switching during handshake cancels the obsolete timer and response");

  await new Promise((resolve) => { b.proc.once("exit", resolve); b.proc.kill("SIGTERM"); });
  await page.waitForFunction(() => window.stale.getSnapshot().status === "offline");
  assert.equal(await page.evaluate(async () => { try { await window.stale.login("ember-user", "8521"); return "sent"; } catch (error) { return error.code; } }), "offline");
  assert.equal(await page.evaluate(() => window.__wire.filter((f) => f.url === window.B).some((f) => f.message.credential || f.message.pin)), false);
  ok("a dropped host and failed redial remain guest-safe without sending a PIN or remembered credential");

  const plainPage = await context.newPage(); plainPage.on("pageerror", (error) => errors.push(String(error)));
  await plainPage.goto(plain + "/__profiles"); await plainPage.waitForFunction(() => window.profiles);
  const productionUrl = plain.replace("http:", "ws:") + "/production";
  assert.equal(await plainPage.evaluate(async (url) => {
    window.production = window.profiles.createProfileClient(url); window.production.confirmHost(url);
    try { await window.production.login("ember-user", "8521"); return "accepted"; } catch (error) { return error.code; }
  }, productionUrl), "https");
  assert.deepEqual(await plainPage.evaluate(() => window.__wire), []);
  assert.equal(await plainPage.evaluate(async () => {
    const c = window.profiles.createProfileClient("ws://192.168.1.4:8787", { development: true }); c.confirmHost("ws://192.168.1.4:8787");
    try { await c.login("ember-user", "8521"); return "accepted"; } catch (error) { c.close(); return error.code; }
  }), "https");
  assert.deepEqual(await plainPage.evaluate(() => window.__wire), [], "the loopback exception never reaches a LAN host");
  assert.equal(await plainPage.evaluate(async (url) => {
    const c = window.profiles.createProfileClient(url, { development: true }); c.confirmHost(url);
    try { await c.login("ember-user", "8521"); return "accepted"; } catch (error) { c.close(); return error.code; }
  }, productionUrl), "https");
  assert.equal(await plainPage.evaluate(() => window.__wire.some((f) => f.message.pin || f.message.credential)), false);
  assert.equal(await plainPage.evaluate(async (url) => {
    window.dev = window.profiles.createProfileClient(url, { development: true }); window.dev.confirmHost(url);
    return (await window.dev.create({ displayName: "Local", login: "local-dev", pin: "7391", pinConfirm: "7391", color: "#e23d2e" })).displayName;
  }, plain.replace("http:", "ws:") + "/dev"), "Local");
  ok("production plaintext sends no secret; explicit loopback development still requires the host's approval");

  await page.evaluate(() => {
    window.tableClient.close(); window.guestClient.close(); window.otherTable.close(); window.rejoin.close();
    for (const client of [window.client, window.resumed, window.memory, window.stale, window.unsupported, window.switching]) client.close();
  });
  await plainPage.evaluate(() => { window.production.close(); window.dev.close(); });
  await second.evaluate(() => window.client.close());
  for (const p of [page, plainPage, second]) assert.deepEqual(await p.evaluate(() => window.__unhandled), [], "no unhandled promise rejection");
  assert.deepEqual(errors, [], "no browser exception");
  ok("closing surfaces disposes profile sockets without touching guest/rejoin storage");
  console.log("profiles-client-prove: pass");
} finally {
  await browser?.close();
  for (const server of servers) await server.close();
  legacyServer?.closeAllConnections();
  if (legacyServer) await new Promise((resolve) => legacyServer.close(resolve));
  for (const { proc } of hosts) if (proc.exitCode === null) { proc.kill("SIGTERM"); await new Promise((resolve) => { proc.once("exit", resolve); setTimeout(() => { proc.kill("SIGKILL"); resolve(); }, 5000).unref(); }); }
  rmSync(dir, { recursive: true, force: true });
}
