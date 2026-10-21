// Real browser + real host. Only the browser clock advances; the host's flood limiter keeps real time.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The fixture's registerHooks load hook is rejected by Node 22 before 22.23 (ERR_INVALID_RETURN_PROPERTY_VALUE on a CJS module with no source).
// CI runs a newer 22; fail here with the reason instead of deep inside the host fixture.
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor === 22 && nodeMinor < 23) {
  throw Error(`connection-health-prove needs Node 22.23 or newer (or 24+); this is ${process.versions.node}, whose registerHooks rejects the fixture hook.`);
}

if (process.argv.includes("--host-fixture")) {
  // Test-only observation of timer identity: no production exports, endpoint, or environment switch.
  const { registerHooks } = await import("node:module");
  registerHooks({ load(url, context, next) {
    const result = next(url, context);
    if (url === new URL("../server/host.mjs", import.meta.url).href) return { ...result, source: readFileSync(new URL(url), "utf8") + `
      process.on('message', ({id, code}) => {
        const r = rooms.get(code);
        const timer = t => t ? {id: Number(t), delay: t._idleTimeout, start: t._idleStart, destroyed: t._destroyed} : null;
        process.send({id, value: {seq: r.game?.seq, dirty: r.dirty, saving: !!r.saving, saveTimer: timer(r.saveTimer),
          seats: r.seats.map(s => ({id:s.id, deadline:s.turnDeadline, started:s.turnStartedAt,
            turn:timer(s.turnTimer), grace:timer(s.graceTimer), hold:timer(s.holdTimer)})),
          offer:timer(r.offerTimer), bot:timer(r.botTimer)}});
      });` };
    return result;
  }});
  await import("../server/register.mjs");
  await import("../server/host.mjs");
} else {
  const { chromium } = await import("playwright");
  const { createServer } = await import("vite");
  const resultsDir = fileURLToPath(new URL("../test-results/", import.meta.url));
  mkdirSync(resultsDir, { recursive: true });
  const dir = mkdtempSync(path.join(tmpdir(), "emberisle-health-"));
  const host = spawn(process.execPath, [fileURLToPath(import.meta.url), "--host-fixture"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, SAVE_MS: "20", TURN_MS: "120000", PING_MS: "60000" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  host.stderr.on("data", d => process.stderr.write(d));
  let browser, vite;
  const clients = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, label) => {
    for (let i = 0; i < 200; i++) { const v = await fn(); if (v) return v; await sleep(25); }
    throw Error(`timed out: ${label}`);
  };
  let request = 0;
  const snapshot = code => new Promise(resolve => {
    const id = ++request;
    const listener = msg => { if (msg.id === id) { host.off("message", listener); resolve(msg.value); } };
    host.on("message", listener); host.send({ id, code });
  });
  async function client(port) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = [];
    ws.addEventListener("message", e => inbox.push(JSON.parse(String(e.data))));
    await new Promise(r => ws.addEventListener("open", r, { once: true }));
    const c = { ws, inbox, send: m => ws.send(JSON.stringify(m)), next: type => until(() => {
      const i = inbox.findIndex(m => m.type === type); return i < 0 ? false : inbox.splice(i, 1)[0];
    }, type) };
    clients.push(c); return c;
  }
  try {
    const port = await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(Error("host startup timeout")), 10000);
      let out = "";
      host.stdout.on("data", d => { out += d; const m = out.match(/listening (\d+)/); if (m) { clearTimeout(deadline); resolve(Number(m[1])); } });
      host.once("exit", c => reject(Error(`host exited ${c}`)));
    });
    vite = await createServer({ server: { host: "127.0.0.1", port: 8113, strictPort: true }, logLevel: "error" });
    await vite.listen();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    await page.addInitScript(() => {
      localStorage.setItem("emberisle-name", "Ember"); localStorage.setItem("emberisle-water", "simple");
      const h = window.__health = { sockets: [], sent: [], pongs: [], held: [], hold: true, notices: [], messages: [] };
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args); h.sockets.push(this);
          this.addEventListener("message", e => {
            const m = JSON.parse(e.data); h.messages.push(m.type);
            if (m.type === "healthPong") { h.pongs.push(m); return; }
            this.handler?.(e);
          });
        }
        set onmessage(fn) { this.handler = fn; }
        get onmessage() { return this.handler; }
        send(raw) {
          const m = JSON.parse(raw);
          if (m.type === "healthPing") {
            h.sent.push({ nonce: m.nonce, at: performance.now() });
            if (h.hold) { h.held.push([this, raw]); return; }
          }
          super.send(raw);
        }
        forward(raw) { super.send(raw); }
      };
    });
    await page.goto(`http://127.0.0.1:8113/?host=ws://127.0.0.1:${port}`);
    await page.waitForFunction(() => window.__emberisle);
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.evaluate(() => {
      let previous = null;
      window.__emberisle.subscribe(s => {
        if (s.announcement === "Back at the table" && previous !== s.announcement)
          window.__health.notices.push({ state: !!s.state, resync: s.resync, last: window.__health.messages.at(-1) });
        previous = s.announcement;
      });
      window.__emberisle.getState().hostTable();
    });
    await page.getByTestId("table-code").waitFor();
    assert.match(await page.getByTestId("connection-status").innerText(), /^Reachable$/);
    const code = await page.evaluate(() => window.__emberisle.getState().code);
    for (const name of ["Tide", "Pine", "Cloud"]) {
      const c = await client(port); c.send({ type: "hello", code, name }); await c.next("welcome"); c.send({ type: "ready", value: true });
    }
    await until(() => page.evaluate(() => window.__emberisle.getState().seats.length === 4 && window.__emberisle.getState().seats.slice(1).every(s => s.ready)), "seats ready");
    await page.evaluate(() => { const s = window.__emberisle.getState(); s.setReady(true); s.startTable(); });
    await until(() => page.evaluate(() => !!window.__emberisle.getState().state), "full game state");
    let cid = 0;
    await until(async () => {
      const phase = await page.evaluate(() => {
        const s = window.__emberisle.getState();
        if (s.state.phase === "rollOff" && s.legal.actions.includes("roll")) s.dispatch({ type: "roll" });
        return s.state.phase;
      });
      if (phase !== "rollOff") return true;
      for (const c of clients) {
        const state = c.inbox.findLast(m => m.type === "state");
        if (state?.game.phase === "rollOff" && state.legal.actions.includes("roll")) {
          c.inbox.length = 0;
          c.send({ type: "roll", ...state.actionStamp, cid: `health-setup-${cid++}` });
          break;
        }
      }
      return false;
    }, "roll-off finishes so all four scores are visible");
    await sleep(100);
    const before = await snapshot(code);
    assert.ok(before.seats.some(s => s.turn), "host has armed turn timers");
    const bytes = readFileSync(path.join(dir, `${code}.json`));
    const clientBefore = await page.evaluate(() => { const s = window.__emberisle.getState(); return { seq: s.state.seq, timer: s.turnTimer }; });
    await page.evaluate(() => { const h = window.__health; for (const [ws, raw] of h.held.splice(0)) ws.forward(raw); });
    await until(() => page.evaluate(() => window.__health.pongs.length === 1), "real host pong");
    await page.clock.runFor(137);
    await page.evaluate(() => {
      const h = window.__health; const ws = h.sockets.at(-1);
      ws.handler({ data: JSON.stringify({ type: "healthPong", nonce: "f".repeat(32) }) });
    });
    assert.equal(await page.evaluate(() => window.__emberisle.getState().connectionHealth.rtt), null, "wrong nonce ignored");
    await page.evaluate(() => {
      const h = window.__health, ws = h.sockets.at(-1);
      const now = performance.now.bind(performance);
      // A stalled main thread can deliver a pong before the queued timeout callback.
      performance.now = () => now() + 3000;
      ws.handler({ data: JSON.stringify(h.pongs[0]) });
      performance.now = now;
    });
    assert.equal(await page.evaluate(() => window.__emberisle.getState().connectionHealth.rtt), null, "expired pong ignored before timeout callback");
    await page.evaluate(() => {
      Date.now = () => 1; // RTT must not depend on epoch time or serverNow.
      const h = window.__health; h.sockets.at(-1).handler({ data: JSON.stringify(h.pongs.shift()) });
    });
    assert.equal(await page.evaluate(() => window.__emberisle.getState().connectionHealth.rtt), 137);
    await page.clock.fastForward(29_862);
    assert.equal(await page.evaluate(() => window.__health.sent.length), 1, "no early probe");
    await page.clock.fastForward(1);
    assert.equal(await page.evaluate(() => window.__health.sent.length), 2);
    await page.clock.fastForward(2999);
    assert.equal(await page.evaluate(() => window.__health.sent.length), 2, "one outstanding probe");
    const fits = await page.evaluate(() => {
      const box = el => el.getBoundingClientRect();
      const status = box(document.querySelector('[data-testid="connection-status"]'));
      const menu = box(document.querySelector('button[aria-label="Table menu"]'));
      const scores = [...document.querySelectorAll('[data-testid="seat-strip"] [data-testid="seat-vp"]')].map(box);
      const utility = [...document.querySelectorAll('.hud-utilities button')].map(box);
      const clear = utility.every(r => status.right <= r.left || status.left >= r.right || status.bottom <= r.top || status.top >= r.bottom);
      return { clear, status: status.left >= 0 && status.right <= innerWidth,
        menu: menu.width === 44 && menu.height === 44,
        scores: scores.length === 4 && scores.every(r => r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= menu.bottom) };
    });
    assert.deepEqual(fits, { clear: true, status: true, menu: true, scores: true }, "390px four-seat header fits with RTT visible");
    await page.screenshot({ path: path.join(resultsDir, "connection-health-phone.png") });
    for (const width of [700, 900]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.ok(await page.evaluate(() => {
        const s = document.querySelector('[data-testid="connection-status"]').getBoundingClientRect();
        const utilities = [...document.querySelectorAll('.hud-utilities button')];
        return utilities.length > 0 && utilities.every(el => {
          const r = el.getBoundingClientRect();
          return s.right <= r.left || s.left >= r.right || s.bottom <= r.top || s.top >= r.bottom;
        });
      }), `${width}px coarse portrait status clears utility controls`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.deepEqual(await snapshot(code), before, "all host timer identities, deadlines, seq and save state unchanged");
    assert.deepEqual(readFileSync(path.join(dir, `${code}.json`)), bytes, "persisted room bytes unchanged");
    assert.deepEqual(await page.evaluate(() => { const s = window.__emberisle.getState(); return { seq: s.state.seq, timer: s.turnTimer }; }), clientBefore);
    await page.clock.fastForward(1);
    await until(() => page.evaluate(() => window.__emberisle.getState().connectionHealth.status === "Reconnecting"), "3s timeout");
    assert.deepEqual(await snapshot(code), before, "health timeout also preserves host timers");
    assert.deepEqual(readFileSync(path.join(dir, `${code}.json`)), bytes, "health timeout does not save or drop a seat");
    await page.evaluate(() => { window.__health.hold = false; window.__emberisle.getState().net.drop(); });
    await until(() => page.evaluate(() => window.__emberisle.getState().error?.startsWith("Reconnecting")), "socket dropped");
    await page.evaluate(() => window.__emberisle.getState().net.wake());
    await until(() => page.evaluate(() => window.__health.notices.length === 1), "recovered state announcement");
    assert.deepEqual(await page.evaluate(() => window.__health.notices), [{ state: true, resync: false, last: "state" }]);
    assert.equal(await page.evaluate(() => window.__emberisle.getState().connectionHealth.status), "Reachable");
    assert.equal(await page.evaluate(() => window.__health.sent.length), 2, "reconnect preserves probe spacing");
    // A fresh explicit saved-seat recovery must also wait for its full state.
    await page.evaluate(() => window.__emberisle.getState().rejoinTable());
    await until(() => page.evaluate(() => window.__health.notices.length === 2), "explicit saved-seat recovery");
    assert.deepEqual(await page.evaluate(() => window.__health.notices[1]), { state: true, resync: false, last: "state" });
    console.log("ok browser: nonce matched 137ms monotonic RTT; 30s spacing, one outstanding, 3s timeout, full-state recovery once; host timers/save bytes unchanged");

    // Fresh pre-seat probes spend hello/peek tokens without any response or privilege.
    const unseated = await client(port);
    for (let i = 0; i < 5; i++) unseated.send({ type: "healthPing", nonce: "a".repeat(32) });
    unseated.send({ type: "peek", code });
    unseated.send({ type: "hello", name: "Flood" });
    assert.equal((await unseated.next("error")).message, "Slow down.");
    await sleep(100);
    assert.equal(unseated.inbox.length, 0, "no preauth pong or peek response");
    const seated = clients[0];
    seated.inbox.length = 0;
    const stable = await snapshot(code);
    await sleep(100);
    const saved = readFileSync(path.join(dir, `${code}.json`));
    for (const nonce of [null, 1, "", "a".repeat(33), "z".repeat(32), {}, "a".repeat(10000)]) seated.send({ type: "healthPing", nonce });
    seated.send({ type: "healthPing", nonce: "a".repeat(32) });
    for (let i = 0; i < 100; i++) seated.send({ type: "healthPing", nonce: "b".repeat(32) });
    const pong = await seated.next("healthPong"); assert.equal(pong.nonce, "a".repeat(32));
    assert.equal((await seated.next("healthPong")).nonce, "b".repeat(32));
    await sleep(100);
    assert.equal(seated.inbox.length, 0, "invalid/rate abuse produces no error amplification");
    assert.deepEqual(await snapshot(code), stable);
    assert.deepEqual(readFileSync(path.join(dir, `${code}.json`)), saved);
    const watcher = await client(port);
    watcher.send({ type: "hello", code, watch: true });
    await watcher.next("welcome"); await watcher.next("state");
    watcher.send({ type: "healthPing", nonce: "c".repeat(32) });
    assert.equal((await watcher.next("healthPong")).nonce, "c".repeat(32));
    watcher.inbox.length = 0;
    for (let i = 0; i < 100; i++) watcher.ws.send(i % 2 ? "{" : "null");
    watcher.send({ type: "hello", name: "Sneak" }); watcher.send({ type: "start" });
    await sleep(100);
    assert.ok(watcher.inbox.length <= 5, "watcher malformed frames keep pre-parse budget");
    assert.ok(watcher.inbox.every(m => m.type === "error"), "watcher cannot acquire a seat or play");
    await page.evaluate(code => window.__emberisle.getState().watchTable(code), code);
    await until(() => page.evaluate(() => window.__emberisle.getState().spectator), "browser watcher");
    await page.evaluate(() => window.__emberisle.getState().net.drop());
    await until(() => page.evaluate(() => window.__emberisle.getState().connectionHealth.status === "Offline"), "unseated closed socket is Offline");
    const lobby = await browser.newPage();
    await lobby.addInitScript(() => { localStorage.setItem("emberisle-name", "Lobby"); localStorage.setItem("emberisle-water", "simple"); });
    await lobby.goto(`http://127.0.0.1:8113/?host=ws://127.0.0.1:${port}`);
    await lobby.waitForFunction(() => window.__emberisle);
    await lobby.evaluate(() => {
      window.__lobbyNotices = 0;
      window.__emberisle.subscribe(s => { if (s.announcement === "Back at the table") window.__lobbyNotices++; });
      window.__emberisle.getState().hostTable();
    });
    await lobby.getByTestId("table-code").waitFor();
    await lobby.evaluate(() => window.__emberisle.getState().net.drop());
    await until(() => lobby.evaluate(() => window.__emberisle.getState().error?.startsWith("Reconnecting")), "lobby drop");
    await lobby.evaluate(() => window.__emberisle.getState().net.wake());
    await until(() => lobby.evaluate(() => window.__emberisle.getState().connectionHealth.status === "Reachable"), "lobby recovery");
    await lobby.evaluate(() => { const s = window.__emberisle.getState(); s.addBot(); s.addBot(); s.setReady(true); s.startTable(); });
    await until(() => lobby.evaluate(() => !!window.__emberisle.getState().state), "recovered lobby starts new game");
    assert.equal(await lobby.evaluate(() => window.__lobbyNotices), 0, "lobby-only recovery cannot announce Back on later Start");
    await lobby.close();
    // Four ready seats maximize the lobby footer. Status shares the caption's row on short landscapes.
    const layout = await browser.newPage({ viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true });
    layout.on("pageerror", e => errors.push(String(e)));
    await layout.goto("http://127.0.0.1:8113/");
    await layout.waitForFunction(() => window.__emberisle);
    await layout.evaluate(() => window.__emberisle.setState({
      screen: "lobby", mode: "online", code: "WWWW", seatId: "s0", isHost: true, error: null,
      seats: ["Hana", "Ash", "Tide", "Fay"].map((name, i) => ({ id: `s${i}`, name, color: ["#bb4444", "#448855", "#4455bb", "#aa7711"][i], ready: true, bot: false, away: false })),
    }));
    await layout.getByTestId("lobby-card").waitFor();
    await layout.evaluate(() => document.fonts.ready);
    // Stress wider font metrics without changing line height; the caption must yield width to the health text.
    await layout.getByTestId("lobby-caption").evaluate(el => { el.style.letterSpacing = "0.25em"; });
    for (const [width, height] of [[320, 568], [390, 844], [667, 375], [844, 390]]) {
      await layout.setViewportSize({ width, height });
      await layout.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      for (const status of ["Reachable", "Reconnecting", "Offline"]) {
        await layout.evaluate(status => window.__emberisle.setState({ connectionHealth: { status, rtt: status === "Reachable" ? 2999 : null } }), status);
        await until(() => layout.getByTestId("connection-status").textContent().then(text => text.startsWith(status)), "lobby health text");
        const geometry = await layout.evaluate(() => {
          const card = document.querySelector('[data-testid="lobby-card"]');
          const cover = card.querySelector(".lobby-cover");
          const inside = el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; };
          const controls = [...card.querySelectorAll("button")].filter(b => ["Not ready", "Start", "Leave the table"].includes(b.textContent.trim()));
          return {
            status: inside(card.querySelector('[data-testid="connection-status"]')),
            x: cover.scrollWidth - cover.clientWidth,
            y: [...card.querySelectorAll("*")].filter(el => getComputedStyle(el).overflowY === "auto" && el.dataset.testid !== "chat-log").map(el => el.scrollHeight - el.clientHeight),
            controls: controls.map(el => ({ inside: inside(el), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
          };
        });
        try {
          assert.ok(geometry.status, `${width}x${height} ${status}: status stays inside the lobby`);
          if (width > height) {
            assert.ok(geometry.x <= 1, `${width}x${height} ${status}: no horizontal lobby scrolling`);
            assert.ok(geometry.y.every(n => n <= 1), `${width}x${height} ${status}: no vertical lobby scrolling`);
            assert.equal(geometry.controls.length, 3);
            assert.ok(geometry.controls.every(c => c.inside && c.width >= 44 && c.height >= 44), "Ready, Start and Leave stay visible with 44px targets");
          }
        } catch (error) {
          console.error("lobby geometry", { width, height, status, ...geometry });
          await layout.screenshot({ path: path.join(resultsDir, `connection-health-lobby-${width}x${height}-${status}-failed.png`) });
          throw error;
        }
        if (width === 667 && status === "Reachable") await layout.screenshot({ path: path.join(resultsDir, "connection-health-lobby-667x375.png") });
      }
    }
    await layout.close();
    console.log("ok lobby: four ready seats and every health state fit 320/390/667/844px layouts; no landscape scrolling");
    assert.deepEqual(errors, []);
    console.log("ok host: malformed/oversized/prehello probes refused; peek/hello bucket retained; seated flood bounded to two pongs; game/timers/disk unchanged");
    console.log("connection health prove ok");
  } finally {
    clients.forEach(c => c.ws.close());
    await browser?.close(); await vite?.close(); host.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true });
  }
}
