// #1350: the read-only profile card for another seat in the lobby, against a real host with profiles made by the host's
// own store. Four people sit at one table: Ember (a profile with a catchphrase), Tide (a guest), Pine (a profile with no
// catchphrase) and a bot. Coral (a profile) sits at a second table.
// At 440x956, 956x440 and 1280x720:
// - another player's name is a button with a 44 px target; your own name, a bot and an empty seat are not card buttons;
// - the card asks the host with a request id and shows only what the host's public card holds (name, catchphrase);
// - while the host's answer is held the card says "Loading…" and shows no number; a guest's card says "Guest" and asks
//   the host nothing; a refused request says "Profiles unavailable on this host.";
// - an answer to an earlier request is dropped; the card goes when its seat leaves, and a late answer changes nothing;
// - it is a modal dialog: focus moves in, Tab stays in, Escape, Close and a tap on the backdrop close it, and focus
//   returns to the name; it fits the screen with 12 px text and a 44 px Close;
// - opening it changes no seat's readiness and not the board hole;
// - a watcher's page reads a card from its own table and is refused one from another table.
// The answers are the real host's. One page's socket is routed through Playwright only so an answer can be held back.
// With SHOTS=1 it runs at 430x932, 390x844, 844x390 and 1280x720 with the full look and writes the pictures in
// docs/proofs/1350/ at device scale 2.
// Run: npm run lobby-profile-card-prove
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const serverDir = new URL("../server/", import.meta.url);
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-lobby-profile-card-"));
const SHOTS = process.env.SHOTS === "1" ? "docs/proofs/1350" : null;
const ROOMS_DIR = path.join(dir, "rooms");
const PROFILES_DIR = path.join(dir, "profiles");
const RESULTS_DIR = path.join(dir, "results");
const VIEWPORTS = SHOTS
  ? [{ width: 430, height: 932 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]
  : [{ width: 440, height: 956 }, { width: 956, height: 440 }, { width: 1280, height: 720 }];
let hostProc, browser, vite;
const ok = (message) => console.log(`ok ${message}`);

// Profiles are written by the host's own store before the host starts. The token is the device credential a sign-in gives.
const SEED = `
import { openProfiles } from "./profiles.mjs";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
const store = openProfiles(process.env.PROFILES_DIR, { colors: PLAYER_COLORS });
const out = {};
for (const [i, [name, catchphrase]] of [["Ember", "Burns bright"], ["Pine", ""], ["Coral", "Deep water"]].entries()) {
  const login = name.toLowerCase() + "-login";
  const made = await store.create({ displayName: name, login, pin: "4821", pinConfirm: "4821", color: PLAYER_COLORS[i], catchphrase });
  out[name] = { id: made.profile.profileId, token: made.token, login };
}
process.stdout.write(JSON.stringify(out));
`;

async function startHost() {
  hostProc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: serverDir,
    // PROFILES_DEV=1 lets a loopback page send its credential over plain ws, as the host's own profile proofs do.
    env: { ...process.env, PORT: "0", ROOMS_DIR, PROFILES_DIR, RESULTS_DIR, PROFILES_DEV: "1", SAVE_MS: "20" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("host startup timed out")), 10000);
    let output = "";
    hostProc.stderr.on("data", (d) => process.stderr.write(d));
    hostProc.stdout.on("data", (d) => {
      output += d;
      const m = output.match(/listening (\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    hostProc.once("exit", (code) => reject(Error(`host exited early with ${code}`)));
  });
}

const cardFrame = (text) => {
  try {
    const m = JSON.parse(text);
    return m.type === "tableProfileCard" || m.type === "profileError" ? m : null;
  } catch {
    return null;
  }
};

async function run({ width, height }) {
  const at = `${width}x${height}`;
  const phone = Math.min(width, height) < 600;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: SHOTS ? 2 : 1, reducedMotion: "reduce" });
  const errors = [];
  const shot = async (page, name) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-${at}.png`) });
  };

  // `wire` records the card frames a page sends and receives. With `hold`, the page's socket runs through Playwright so
  // the host's card answers can be kept back and let through one at a time.
  async function open(name, profile, hold = false) {
    const page = await context.newPage();
    const wire = { sent: [], got: [], held: [], holding: false, release: () => {} };
    page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
    if (hold) {
      await page.routeWebSocket(/./, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((m) => {
          const frame = typeof m === "string" && cardFrame(m);
          if (frame) wire.sent.push(frame);
          server.send(m);
        });
        server.onMessage((m) => {
          const frame = typeof m === "string" && cardFrame(m);
          if (frame && wire.holding) return void wire.held.push(m);
          if (frame) wire.got.push(frame);
          ws.send(m);
        });
        wire.release = (id) => {
          const i = wire.held.findIndex((m) => JSON.parse(m).id === id);
          assert.ok(i >= 0, `${at}: the host answered request ${id}`);
          const [m] = wire.held.splice(i, 1);
          wire.got.push(JSON.parse(m));
          ws.send(m);
        };
      });
    } else {
      page.on("websocket", (ws) => {
        ws.on("framesent", (f) => { const frame = cardFrame(String(f.payload)); if (frame) wire.sent.push(frame); });
        ws.on("framereceived", (f) => { const frame = cardFrame(String(f.payload)); if (frame) wire.got.push(frame); });
      });
    }
    await page.addInitScript(({ name, lite }) => {
      localStorage.setItem("emberisle-name", name);
      if (lite) localStorage.setItem("emberisle-jelly", "lite");
    }, { name, lite: !SHOTS });
    await page.goto(appUrl);
    await page.waitForFunction(() => !!window.__emberisle);
    if (profile) await page.evaluate((token) => window.__emberisle.setState({ profile: { credentialForHost: () => token } }), profile.token);
    return { page, wire };
  }
  const state = (page, read) => page.evaluate(`(${read})(window.__emberisle.getState())`);
  const seats = (page, n) => page.waitForFunction((n) => window.__emberisle.getState().seats.length === n, n);
  const lobby = (page) => page.waitForFunction(() => window.__emberisle.getState().screen === "lobby");
  const card = (page) => page.locator('[data-testid="other-profile-card"]');
  const nameButton = (page, seat) => page.locator(`[data-testid="lobby-player-${seat}"]`);
  const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  const lines = async (page) => (await card(page).innerText()).split("\n").map((s) => s.trim()).filter(Boolean);
  const hole = (page) => page.evaluate(() => JSON.stringify(window.__isle?.insets?.() ?? null));

  // Ember hosts. Tide (a guest), then Pine join, and Ember adds a bot. Coral hosts a second table.
  const ember = await open("Ember", P.Ember);
  await ember.page.evaluate(() => window.__emberisle.getState().hostTable());
  await lobby(ember.page);
  const code = await state(ember.page, (s) => s.code);
  const tide = await open("Tide", null, true);
  await tide.page.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
  await lobby(tide.page);
  await seats(ember.page, 2);
  const pine = await open("Pine", P.Pine);
  await pine.page.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
  await lobby(pine.page);
  await seats(ember.page, 3);
  await ember.page.evaluate(() => window.__emberisle.getState().addBot());
  await seats(tide.page, 4);
  const coral = await open("Coral", P.Coral);
  await coral.page.evaluate(() => window.__emberisle.getState().hostTable());
  await lobby(coral.page);

  const table = await state(tide.page, (s) => s.seats.map((x) => ({ id: x.id, name: x.name, bot: !!x.bot, profile: x.profile ?? null })));
  const [sEmber, sTide, sPine, sBot] = table;
  assert.deepEqual(table.map((s) => s.profile?.profileId ?? null), [P.Ember.id, null, P.Pine.id, null], `${at}: the host binds the two profiles and leaves the guest and the bot unbound`);
  const t = tide.page;

  // Names: the two other people are buttons; Tide's own name is the rename button; the bot is text.
  await nameButton(t, sEmber.id).waitFor();
  const names = await t.evaluate(() => [...document.querySelectorAll('[data-testid="lobby-players"] > li')].map((li) => {
    const b = li.querySelector(".lobby-name > button");
    const r = b?.getBoundingClientRect();
    return { id: b?.getAttribute("data-testid") ?? null, text: li.querySelector(".lobby-name").textContent, w: r?.width ?? 0, h: r?.height ?? 0, px: b ? parseFloat(getComputedStyle(b).fontSize) : 0 };
  }));
  assert.deepEqual(names.map((n) => n.id), [`lobby-player-${sEmber.id}`, "rename-seat", `lobby-player-${sPine.id}`, null], `${at}: only other people's names open a card`);
  for (const n of names.filter((n) => n.id?.startsWith("lobby-player-"))) {
    assert.ok(n.w >= 44 && n.h >= 44, `${at}: ${n.text}'s name is a 44 px target (${n.w}x${n.h})`);
    assert.ok(n.px >= 12, `${at}: ${n.text}'s name is 12 px or more (${n.px})`);
  }
  await shot(t, "lobby");

  // Loading: the host's answer is held. The card names the seat, says Loading and shows no number.
  await t.evaluate(() => window.__emberisle.getState().setReady(true));
  await ember.page.waitForFunction((id) => window.__emberisle.getState().seats.find((s) => s.id === id)?.ready === true, sTide.id);
  const readyBefore = await state(ember.page, (s) => JSON.stringify(s.seats.map((x) => x.ready)));
  const holeBefore = await hole(t);
  tide.wire.holding = true;
  await nameButton(t, sEmber.id).click();
  await card(t).waitFor();
  await t.waitForFunction(() => document.querySelector('[data-testid="other-profile-loading"]'));
  const first = await asked(tide.wire, P.Ember.id);
  assert.deepEqual({ type: first.type, profileId: first.profileId, id: typeof first.id }, { type: "tableProfileCard", profileId: P.Ember.id, id: "number" }, `${at}: the request carries an id and the seat's profile`);
  assert.deepEqual(await lines(t), ["Ember", "Loading…"], `${at}: loading card`);
  assert.ok(!/\d/.test(await card(t).innerText()), `${at}: no number while loading`);
  await shot(t, "card-loading");

  // The answer: public fields only, matched to the request by its id.
  tide.wire.holding = false;
  tide.wire.release(first.id);
  await t.locator('[data-testid="other-profile-catchphrase"]').waitFor();
  const answer = tide.wire.got.at(-1);
  assert.equal(answer.id, first.id, `${at}: the host sends the request id back`);
  assert.deepEqual(Object.keys(answer.card).sort(), ["catchphrase", "displayName", "profileId"], `${at}: the host's card holds public fields only`);
  assert.deepEqual(await lines(t), ["Ember", "“Burns bright”"], `${at}: the card shows the name and the catchphrase, nothing else`);
  const page1 = await t.evaluate(() => document.body.innerText);
  for (const secret of [P.Ember.login, P.Ember.token, "4821"]) assert.ok(!page1.includes(secret), `${at}: no login, PIN or credential on the page`);

  // A modal dialog that fits, with readable text and a 44 px Close.
  const box = await t.evaluate(() => {
    const el = document.querySelector('[data-testid="other-profile-card"]');
    const r = el.getBoundingClientRect();
    const close = el.querySelector('button[aria-label="Close"]').getBoundingClientRect();
    const texts = [...el.querySelectorAll("h2, p")].map((x) => parseFloat(getComputedStyle(x).fontSize));
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, cw: close.width, ch: close.height, texts, modal: el.getAttribute("aria-modal"), role: el.getAttribute("role"), inside: el.contains(document.activeElement) };
  });
  assert.ok(box.l >= 0 && box.t >= 0 && box.r <= box.vw && box.b <= box.vh, `${at}: the card is on screen ${JSON.stringify(box)}`);
  assert.ok(box.cw >= 44 && box.ch >= 44, `${at}: Close is a 44 px target (${box.cw}x${box.ch})`);
  assert.ok(box.texts.every((px) => px >= 12), `${at}: card text is 12 px or more (${box.texts})`);
  assert.deepEqual([box.role, box.modal, box.inside], ["dialog", "true", true], `${at}: a modal dialog holding the focus`);
  for (let i = 0; i < 3; i++) {
    await t.keyboard.press("Tab");
    assert.ok(await t.evaluate(() => document.querySelector('[data-testid="other-profile-card"]').contains(document.activeElement)), `${at}: Tab stays in the card`);
  }
  assert.equal(await state(ember.page, (s) => JSON.stringify(s.seats.map((x) => x.ready))), readyBefore, `${at}: readiness is unchanged with the card open`);
  assert.equal(await hole(t), holeBefore, `${at}: the board hole is unchanged with the card open`);
  await shot(t, "card-catchphrase");
  await t.keyboard.press("Escape");
  await card(t).waitFor({ state: "detached" });
  assert.equal(await focused(t), `lobby-player-${sEmber.id}`, `${at}: Escape returns focus to the name`);
  ok(`${at}: name buttons, loading, the public card, the dialog, readiness and the board hole`);

  // A profile with no catchphrase shows its name only. Close returns focus.
  await nameButton(t, sPine.id).click();
  await card(t).waitFor();
  await waitFor(() => tide.wire.sent.at(-1).profileId === P.Pine.id && tide.wire.got.some((m) => m.id === tide.wire.sent.at(-1).id), `${at}: Pine's answer`);
  await t.waitForFunction(() => !document.querySelector('[data-testid="other-profile-loading"]'));
  assert.deepEqual(await lines(t), ["Pine"], `${at}: no catchphrase, no empty quote, no number`);
  await shot(t, "card-no-catchphrase");
  await card(t).getByRole("button", { name: "Close" }).click();
  await card(t).waitFor({ state: "detached" });
  assert.equal(await focused(t), `lobby-player-${sPine.id}`, `${at}: Close returns focus to the name`);

  // A stale answer is dropped: Ember's card is closed before its answer, Pine's opens, then Ember's answer arrives.
  tide.wire.holding = true;
  await nameButton(t, sEmber.id).click();
  await card(t).waitFor();
  const staleId = (await asked(tide.wire, P.Ember.id)).id;
  await t.mouse.click(3, 3);
  await card(t).waitFor({ state: "detached" });
  await nameButton(t, sPine.id).click();
  await card(t).waitFor();
  const liveId = (await asked(tide.wire, P.Pine.id)).id;
  assert.notEqual(staleId, liveId, `${at}: each request has its own id`);
  tide.wire.release(staleId);
  await t.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.deepEqual(await lines(t), ["Pine", "Loading…"], `${at}: Ember's late answer does not fill Pine's card`);

  // The seat leaves with its card open: the card goes, and the late answer changes nothing.
  await pine.page.evaluate(() => window.__emberisle.getState().goTitle());
  await seats(t, 3);
  await card(t).waitFor({ state: "detached" });
  tide.wire.holding = false;
  tide.wire.release(liveId);
  await t.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal(await card(t).count(), 0, `${at}: no card after the seat left`);
  ok(`${at}: no catchphrase, a tap on the backdrop, a stale answer dropped, the card goes with its seat`);

  // A guest's card says Guest and asks the host nothing.
  const e = ember.page;
  await nameButton(e, sTide.id).click();
  await e.locator('[data-testid="other-profile-guest"]').waitFor();
  assert.deepEqual(await lines(e), ["Tide", "Guest"], `${at}: guest card`);
  assert.equal(ember.wire.sent.length, 0, `${at}: a guest card sends no request`);
  await shot(e, "card-guest");
  await e.keyboard.press("Escape");
  await card(e).waitFor({ state: "detached" });

  // A refused request. The host lets a socket read ten cards in a burst; twelve reads and the press happen in one task.
  await t.evaluate(({ seat, profileId }) => {
    const net = window.__emberisle.getState().net;
    for (let i = 0; i < 12; i++) net.ttt("tableProfileCard", { id: 9000 + i, profileId });
    document.querySelector(`[data-testid="lobby-player-${seat}"]`).click();
  }, { seat: sEmber.id, profileId: P.Ember.id });
  await t.locator('[data-testid="other-profile-error"]').waitFor();
  assert.equal(tide.wire.got.at(-1).type, "profileError", `${at}: the host refused the last read`);
  assert.deepEqual(await lines(t), ["Ember", "Profiles unavailable on this host."], `${at}: a refusal says so and shows no number`);
  await shot(t, "card-unavailable");
  await t.keyboard.press("Escape");
  await card(t).waitFor({ state: "detached" });
  ok(`${at}: guest card, refused request`);

  // A watcher of the started table reads a card from that table and is refused one from the other table.
  await e.evaluate(() => window.__emberisle.getState().setReady(true));
  await e.waitForFunction(() => window.__emberisle.getState().seats.every((s) => s.ready));
  await e.evaluate(() => window.__emberisle.getState().startTable());
  await e.waitForFunction(() => window.__emberisle.getState().screen === "play");
  const watcher = await open("Watcher", null);
  await watcher.page.evaluate((c) => window.__emberisle.getState().watchTable(c), code);
  await watcher.page.waitForFunction(() => window.__emberisle.getState().spectator === true);
  await watcher.page.evaluate(({ here, there }) => {
    const net = window.__emberisle.getState().net;
    net.ttt("tableProfileCard", { id: 1, profileId: here });
    net.ttt("tableProfileCard", { id: 2, profileId: there });
  }, { here: P.Ember.id, there: P.Coral.id });
  await waitFor(() => watcher.wire.got.length === 2, `${at}: the watcher's two answers`);
  const byId = Object.fromEntries(watcher.wire.got.map((m) => [m.id, m]));
  assert.deepEqual([byId[1].type, byId[1].card?.displayName], ["tableProfileCard", "Ember"], `${at}: a watcher reads a card at its own table`);
  assert.deepEqual([byId[2].type, byId[2].card], ["profileError", undefined], `${at}: a watcher reads no card from another table`);
  ok(`${at}: a watcher sees only cards at its own table`);

  assert.deepEqual(errors, [], `${at}: no page errors`);
  await context.close();
}

// The page's newest card request, once the host has answered it and the answer is held. The dev build runs React's
// effects twice, so a card may send an earlier request too; its answer is one more stale answer the card must drop.
async function asked(wire, profileId) {
  const last = () => wire.sent.at(-1);
  await waitFor(() => last()?.profileId === profileId && wire.held.some((m) => JSON.parse(m).id === last().id), `the held answer for ${profileId}`);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(last().profileId, profileId, "the newest request is for this profile");
  return last();
}

async function waitFor(test, what) {
  const end = Date.now() + 10000;
  while (!test()) {
    if (Date.now() > end) throw Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

let P, appUrl;
try {
  mkdirSync(ROOMS_DIR, { recursive: true });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  P = JSON.parse(execFileSync(process.execPath, ["--import", "./register.mjs", "--input-type=module", "-e", SEED], { cwd: serverDir, env: { ...process.env, PROFILES_DIR }, encoding: "utf8" }));
  const hostPort = await startHost();
  vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await vite.listen();
  appUrl = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const viewport of VIEWPORTS) await run(viewport);
  console.log("lobby-profile-card-prove: ok");
} finally {
  await browser?.close();
  await vite?.close();
  hostProc?.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
