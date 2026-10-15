// #609: the table sounds (docs/design/sound.md). Headless Chromium with HTMLMediaElement.play stubbed to record
// { file, volume, t } instead of playing, one practice page and two tabs on the rules host.
// - the burst rule: one clip is one sound per 150 ms; distinct clips start 150 ms apart; mute silences what is queued;
// - practice: your own outpost, path, fortune, stronghold and wayfarer each play exactly their clip once; a bot round of
//   setup moves is the same clips as the state diff says, in order, 150 ms apart; mute silences every one;
// - practice ask-the-table: the asker hears the close once (trade_yes in full, or trade_no), never trade_offer;
// - online chat: the sender hears chat_send once, the other seat chat_recv once, nothing while that seat types in the
//   chat input, nothing when muted.
// Online trade_offer / trade_yes volumes are asserted in trade-prove. Zero console errors. Run: npm run sounds-prove
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8109;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

// File -> clip name, read from the table in sound.ts; two clips can share a file (trade_yes and nothing else here does).
const CLIP = new Map([...readFileSync(new URL("../src/lib/sound.ts", import.meta.url), "utf8").matchAll(/^\s+(\w+): "([\w.]+\.wav)",$/gm)].map((m) => [m[2].replace(".wav", ""), m[1]]));
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (what) => console.log(`ok ${what}`);

async function tab(name, url) {
  const page = await (await browser.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  await page.addInitScript(() => {
    window.__plays = [];
    HTMLMediaElement.prototype.play = function () {
      window.__plays.push({ file: new URL(this.src).pathname.replace("/audio/", "").replace(".wav", ""), volume: this.volume, t: performance.now() });
      return Promise.resolve();
    };
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__emberisle);
  await page.keyboard.press("Shift"); // the gesture that unlocks sound
  return page;
}
const clear = (page) => page.evaluate(() => (window.__plays = []));
const heard = async (page) => (await page.evaluate(() => window.__plays)).map((p) => ({ ...p, file: CLIP.get(p.file) ?? p.file }));
const names = async (page) => (await heard(page)).map((p) => p.file);
const store = (page, fn, arg) => page.evaluate(fn, arg);
const mute = (page, v) => page.evaluate(async (v) => (await import("/src/lib/sound.ts")).setMuted(v), v);

async function until(check, what, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const got = await check();
    if (got) return got;
    await sleep(50);
  }
  throw new Error(`timed out: ${what}`);
}

let code = 0;
try {
  // ---- The burst rule, on the module itself.
  const p = await tab("Ember", `http://127.0.0.1:${PORT}/`);
  await clear(p);
  await p.evaluate(async () => {
    const { play } = await import("/src/lib/sound.ts");
    play("path_place");
    play("path_place");
    play("path_place");
  });
  await sleep(300);
  assert.deepEqual(await names(p), ["path_place"], "three path knocks in one burst are one sound");
  ok("burst: one clip, one sound per 150 ms");
  await sleep(200);
  await clear(p);
  await p.evaluate(async () => {
    const { play } = await import("/src/lib/sound.ts");
    for (const n of ["path_place", "outpost_place", "card_buy", "card_play", "wayfarer_move"]) play(n);
  });
  await until(async () => (await heard(p)).length === 5, "five distinct clips");
  const five = await heard(p);
  assert.deepEqual(five.map((x) => x.file), ["path_place", "outpost_place", "card_buy", "card_play", "wayfarer_move"]);
  for (let i = 1; i < 5; i++) assert.ok(five[i].t - five[i - 1].t >= 145, `clip ${i} starts ${Math.round(five[i].t - five[i - 1].t)} ms after the last`);
  ok(`burst: five distinct clips start ${five.slice(1).map((x, i) => Math.round(x.t - five[i].t)).join("/")} ms apart`);
  await sleep(200);
  await clear(p);
  await p.evaluate(async () => {
    const { play, setMuted } = await import("/src/lib/sound.ts");
    play("path_place");
    play("outpost_place");
    play("card_buy");
    setMuted(true);
  });
  await sleep(600);
  assert.deepEqual(await names(p), ["path_place"], "mute silences what is still queued");
  await mute(p, false);
  ok("mute: the queued clips stay silent");

  // ---- Practice: roll off, then my first outpost.
  await p.evaluate(() => window.__emberisle.getState().startAi());
  await p.evaluate(() => (window.__origRun = window.__emberisle.getState().runBots));
  for (;;) {
    const next = await (
      await p.waitForFunction(
        () => {
          const s = window.__emberisle.getState();
          const st = s.state;
          if (!st) return false;
          if (st.phase === "rollOff" && st.current === s.localId) return "roll";
          if (st.phase === "setupSettle" && st.current === s.localId) return "mine";
          return false;
        },
        null,
        { timeout: 90_000 },
      )
    ).jsonValue();
    if (next === "mine") break;
    await p.evaluate(() => window.__emberisle.getState().dispatch({ type: "roll" }));
    await p.waitForFunction(() => {
      const s = window.__emberisle.getState();
      return s.state.phase !== "rollOff" || s.state.current !== s.localId;
    });
  }
  // The bots wait while the checks read what this seat's own moves play.
  await p.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
  await sleep(1500); // the last bot piece's knock
  await clear(p);
  await p.evaluate(() => {
    const g = window.__emberisle.getState();
    g.pickVertex(g.highlights().vertices[0]);
  });
  await sleep(900);
  assert.deepEqual(await names(p), ["outpost_place"], "my outpost plays outpost_place once");
  ok("practice: my outpost -> outpost_place once");
  await clear(p);
  await p.evaluate(() => {
    const g = window.__emberisle.getState();
    g.pickEdge(g.highlights().edges[0]);
  });
  await sleep(900);
  assert.deepEqual(await names(p), ["path_place"], "my path plays path_place once");
  ok("practice: my path -> path_place once");

  // ---- Main phase by state surgery: it is my turn, with hand and fortunes to spend.
  // ---- A bot round: the rest of the setup (the bots' pieces and my second pair) until it is my roll. Each placement is one
  // sound in the order placed, and every sound starts 150 ms after the one before.
  const pieces = () =>
    p.evaluate(() => {
      const st = window.__emberisle.getState().state;
      return st.vertices.filter((v) => v.building).length + st.edges.filter((e) => e.path).length;
    });
  const left = (await p.evaluate(() => window.__emberisle.getState().state.players.length)) * 4 - (await pieces());
  await clear(p);
  // Finish my own setup placements and let the bots play on until it is my roll.
  await p.evaluate(() => window.__emberisle.setState({ runBots: window.__origRun }));
  await until(
    async () => {
      await sleep(500); // as a hand places: the outpost's fall has ended before the path is picked
      return p.evaluate(() => {
        const g = window.__emberisle.getState();
        const st = g.state;
        if (st.current !== g.localId) return false;
        if (st.phase === "setupSettle") g.pickVertex(g.highlights().vertices[0]);
        else if (st.phase === "setupRoad") g.pickEdge(g.highlights().edges[0]);
        else return st.phase === "roll";
        return false;
      });
    },
    "my roll",
    240_000,
  );
  await p.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
  await sleep(1500);
  // The setup ends at the first roll; a bot's later build is not part of the round.
  const every = await heard(p);
  const all = every.slice(0, Math.max(0, every.findIndex((x) => x.file === "dice_land")) || every.length);
  const round = all.filter((x) => x.file === "outpost_place" || x.file === "path_place");
  assert.equal(round.length, left, `one sound per setup placement: ${JSON.stringify(every.map((x) => x.file))}`);
  round.forEach((x, i) => assert.equal(x.file, i % 2 ? "path_place" : "outpost_place", `placement ${i + 1}: ${JSON.stringify(all.map((y) => [y.file, Math.round(y.t)]))}`));
  for (let i = 1; i < all.length; i++) assert.ok(all[i].t - all[i - 1].t >= 145, `sound ${i + 1} starts ${Math.round(all[i].t - all[i - 1].t)} ms after the last`);
  ok(`practice: a bot round is ${round.length} placements, one sound each, outpost then path, ${all.length} sounds >= ${Math.round(Math.min(...all.slice(1).map((x, i) => x.t - all[i].t)))} ms apart`);
  await clear(p);
  await p.evaluate(() => window.__emberisle.getState().dispatch({ type: "roll" }));
  await sleep(300);
  assert.deepEqual(await names(p), ["dice_land"], "my roll plays dice_land once");
  ok("practice: my roll -> dice_land once");
  await p.evaluate(() => {
    const g = window.__emberisle;
    const st = g.getState().state;
    const me = g.getState().localId;
    g.setState({
      state: {
        ...st,
        phase: "main",
        current: me,
        discardNeeded: {},
        playedCard: false,
        players: st.players.map((x) =>
          x.id === me ? { ...x, resources: { timber: 9, clay: 9, wool: 9, grain: 9, ore: 9 }, hidden: { ...x.hidden, knight: 2 }, boughtThisTurn: { ...x.boughtThisTurn, knight: 0 } } : x,
        ),
      },
    });
  });
  await clear(p);
  await p.evaluate(() => window.__emberisle.getState().dispatch({ type: "buyCard" }));
  await sleep(300);
  let got = await heard(p);
  assert.deepEqual(got.map((x) => x.file), ["card_buy"]);
  assert.equal(got[0].volume, 1, "the buyer hears the fortune at full volume");
  ok("practice: my fortune -> card_buy once, full volume");
  await clear(p);
  await p.evaluate(() => {
    const st = window.__emberisle.getState().state;
    const me = window.__emberisle.getState().localId;
    const mine = st.vertices.find((v) => v.building?.playerId === me && v.building.kind === "outpost");
    window.__emberisle.getState().dispatch({ type: "buildStronghold", vertexId: mine.id });
  });
  await sleep(900);
  assert.deepEqual(await names(p), ["stronghold_place"], "my stronghold plays stronghold_place once");
  ok("practice: my stronghold -> stronghold_place once");
  await clear(p);
  const knight = await p.evaluate(() => {
    const st = window.__emberisle.getState().state;
    const busy = new Set(st.vertices.filter((v) => v.building).flatMap((v) => v.hexes));
    const hex = st.hexes.find((h) => h.id !== st.robberHex && !busy.has(h.id));
    return window.__emberisle.getState().dispatch({ type: "playKnight", hexId: hex.id, stealFrom: null });
  });
  assert.ok(knight.ok, knight.error);
  await until(async () => (await heard(p)).length >= 2, "knight sounds");
  await sleep(300);
  got = await heard(p);
  assert.deepEqual(got.map((x) => x.file), ["card_play", "wayfarer_move"], "a wayfarer card plays the card, then the wayfarer");
  assert.ok(got[1].t - got[0].t >= 145, "card and wayfarer are spaced");
  ok(`practice: my wayfarer card -> card_play, wayfarer_move ${Math.round(got[1].t - got[0].t)} ms apart`);

  // ---- Mute silences all.
  await mute(p, true);
  await clear(p);
  await p.evaluate(() => window.__emberisle.getState().dispatch({ type: "buyCard" }));
  await sleep(400);
  assert.deepEqual(await names(p), [], "muted: a fortune bought makes no sound");
  await mute(p, false);
  ok("mute: nothing plays");

  // ---- Ask the table: the asker hears the close once.
  await sleep(400);
  await clear(p);
  await p.evaluate(() => window.__emberisle.getState().askTable({ timber: 1 }, { ore: 1 }));
  await until(async () => (await names(p)).some((n) => n === "trade_yes" || n === "trade_no"), "the ask to close", 30_000);
  await sleep(600);
  got = await heard(p);
  assert.equal(got.length, 1, `one close, got ${JSON.stringify(got.map((x) => x.file))}`);
  if (got[0].file === "trade_yes") assert.equal(got[0].volume, 1, "the asker hears a deal in full");
  ok(`practice: my ask closed with ${got[0].file} once (volume ${got[0].volume}), no trade_offer for my own ask`);
  await p.close();

  // ---- Online chat between two seats.
  const url = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;
  const a = await tab("Ember", url);
  const b = await tab("Tide", url);
  await a.evaluate(() => window.__emberisle.getState().hostTable());
  const room = await until(() => a.evaluate(() => window.__emberisle.getState().code), "a table code");
  await b.evaluate((c) => window.__emberisle.getState().joinTable(c), room);
  await until(() => b.evaluate(() => window.__emberisle.getState().seatId), "Tide seated");
  const say = async (who, text) => who.evaluate((t) => window.__emberisle.getState().sendChat(t), text);
  await clear(a);
  await clear(b);
  await say(a, "hello");
  await until(async () => (await names(b)).length, "Tide hears the line");
  await sleep(500);
  assert.deepEqual(await names(a), ["chat_send"], "the sender hears chat_send once and not its own echo");
  assert.deepEqual(await names(b), ["chat_recv"], "the other seat hears chat_recv once");
  ok("chat: sender chat_send once, other seat chat_recv once");
  await sleep(300);
  await b.locator("#chat-input").first().focus();
  await clear(a);
  await clear(b);
  await say(a, "typing near you");
  await until(() => b.evaluate(() => window.__emberisle.getState().chat.length >= 2), "line arrives");
  await sleep(700);
  assert.deepEqual(await names(b), [], "chat_recv is silent while the chat input is focused");
  ok("chat: chat_recv silent while the chat is focused");
  await b.evaluate(() => document.activeElement?.blur());
  await sleep(200);
  await mute(b, true);
  await mute(a, true);
  await clear(a);
  await clear(b);
  await say(a, "muted");
  await until(() => b.evaluate(() => window.__emberisle.getState().chat.length >= 3), "line arrives");
  await sleep(700);
  assert.deepEqual([...(await names(a)), ...(await names(b))], [], "muted: neither chat_send nor chat_recv");
  ok("chat: mute silences both");
  await mute(b, false);
  await mute(a, false);
  await sleep(300);
  await clear(b);
  await say(a, "back");
  await until(async () => (await names(b)).length, "unmuted chat_recv");
  assert.deepEqual(await names(b), ["chat_recv"]);
  ok("chat: unmuted, chat_recv plays again");

  assert.deepEqual(errors, [], `console errors: ${errors.join(" | ")}`);
  console.log("PASS sounds-prove");
} catch (e) {
  console.error("FAIL", e);
  code = 1;
}
await browser.close();
await vite.close();
host.kill();
process.exit(code);
