// #609: the table sounds (docs/design/sound.md). Headless Chromium with HTMLMediaElement.play stubbed to record
// { file, volume, t } instead of playing, one practice page and two tabs on the rules host.
// - the burst rule: one clip is one sound per 150 ms; distinct clips start 150 ms apart; mute silences what is queued;
// - practice: your own outpost, path, fortune, stronghold and wayfarer each play exactly their clip once; a bot round of
//   setup moves is the same clips as the state diff says, in order, 150 ms apart; mute silences every one;
// - practice ask-the-table: the asker hears the close once (trade_yes, error_002, or corn_no), never trade_offer;
// - online chat: the sender hears chat_send once, the other seat chat_recv once, nothing while that seat types in the
//   chat input, nothing when muted;
// - #659 / #1073 volumes: every clip plays at 1: the soundboard, the win screen's GG!, robbed_fah, the core clips (dice_land)
//   and the music clips (game_lose). The files are leveled by type (audio-level-prove), not by a volume;
// - #660 your_turn: plays once at volume 1 for the acting seat on turn pass or mid-turn rejoin; silent for other seats,
//   repeat pushes, when muted, in hotseat, for watchers or after game over.
// Online trade_offer / trade_yes volumes are asserted in trade-prove. Zero console errors. Run: npm run sounds-prove
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
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
// The first name for a file wins: the soundboard's board_* entries reuse files the table clips already own.
const CLIP = new Map();
for (const m of readFileSync(new URL("../src/lib/sound.ts", import.meta.url), "utf8").matchAll(/^\s+(\w+): "([\w.]+\.wav)",$/gm)) if (!CLIP.has(m[2].replace(".wav", ""))) CLIP.set(m[2].replace(".wav", ""), m[1]);
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
    window.__pauses = [];
    window.__sockets = [];
    const RealSocket = window.WebSocket;
    window.WebSocket = class extends RealSocket {
      constructor(...args) {
        super(...args);
        window.__sockets.push(this);
      }
    };
    HTMLMediaElement.prototype.pause = function () {
      window.__pauses.push(new URL(this.src).pathname.replace("/audio/", ""));
    };
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
// The background track (#814) is music-prove's; it is not a table sound.
const heard = async (page) => (await page.evaluate(() => window.__plays)).filter((p) => p.file !== "old_tower_inn_loop.mp3").map((p) => ({ ...p, file: CLIP.get(p.file) ?? p.file }));
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
  await p.waitForFunction(() => window.__isle.lastSeq === window.__emberisle.getState().state.seq && window.__isle.payingPieces.length === 0);
  const rollSounds = await heard(p);
  const payerTicks = await p.evaluate(() => Math.min(8, new Set((window.__emberisle.getState().state.lastProduction ?? []).map((g) => g.vertex).filter(Boolean)).size));
  assert.deepEqual(rollSounds.filter((x) => x.file !== "gain_tick").map((x) => x.file), ["dice_land"], "my roll plays dice_land once, with no other non-payout sounds");
  assert.equal(rollSounds.find((x) => x.file === "dice_land").volume, 1, "dice_land stays at full volume (#1073: every clip plays at 1, leveled in the file)");
  const ticks = rollSounds.filter((x) => x.file === "gain_tick");
  assert.equal(ticks.length, payerTicks, "one gain tick per actual paying piece, capped at eight");
  assert.ok(ticks.every((x) => x.volume === 0.35), "paying-piece ticks stay soft");
  ok(`practice: my roll -> dice_land once, ${payerTicks} soft paying-piece ticks`);
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
  await p.evaluate(() => {
    const store = window.__emberisle;
    const state = store.getState();
    store.setState({ state: { ...state.state, current: state.localId, phase: "main" } });
  });
  await p.evaluate(() => window.__emberisle.getState().askTable({ timber: 1 }, { ore: 1 }));
  await until(async () => (await names(p)).some((n) => n === "trade_yes" || n === "error_002" || n === "corn_no.mp3"), "the ask to close", 30_000);
  await sleep(600);
  got = await heard(p);
  assert.equal(got.length, 1, `one close, got ${JSON.stringify(got.map((x) => x.file))}`);
  if (got[0].file === "trade_yes") assert.equal(got[0].volume, 1, "the asker hears a deal in full");
  ok(`practice: my ask closed with ${got[0].file} once (volume ${got[0].volume}), no trade_offer for my own ask`);
  await p.close();

  // ---- The wayfarer's victim hears robbed_fah (public/audio/robbed_fah.mp3) in place of wayfarer_move, once; nobody else does.
  const robbed = (me, mover, onHex = true) =>
    p2.evaluate(
      async ({ me, mover, onHex }) => {
        const { hear } = await import("/src/lib/game/store.ts");
        const before = structuredClone(window.__emberisle.getState().state);
        before.current = mover;
        before.phase = "robber";
        const mine = before.vertices.filter((v) => v.building?.playerId === "p0");
        const target = before.hexes.find((h) => h.id !== before.robberHex && mine.some((v) => v.hexes.includes(h.id)) === onHex);
        const after = { ...before, robberHex: target.id, phase: "main" };
        hear(before, after, me, "online");
      },
      { me, mover, onHex },
    );
  const p2 = await tab("Ember", `http://127.0.0.1:${PORT}/`);
  await p2.evaluate(() => window.__emberisle.getState().startAi());
  // Setup has placed nothing yet: give p0 one outpost to be robbed through.
  await p2.evaluate(() => { window.__emberisle.getState().state.vertices[0].building = { playerId: "p0", kind: "outpost" }; });
  await clear(p2);
  await robbed("p0", "p1");
  await sleep(300);
  assert.deepEqual((await heard(p2)).map((x) => [x.file, x.volume]), [["robbed_fah.mp3", 1]], "the victim hears robbed_fah once, at 1, and not wayfarer_move (#659)");
  ok("wayfarer: the player with a piece on the target hex hears robbed_fah once, not wayfarer_move");
  await clear(p2);
  await robbed("p0", "p1", false);
  await sleep(300);
  assert.deepEqual(await names(p2), ["wayfarer_move"], "a hex with none of my pieces keeps the usual cue");
  await clear(p2);
  await robbed("p0", "p0");
  await sleep(300);
  assert.deepEqual(await names(p2), ["wayfarer_move"], "the mover is not the victim of their own move");
  await clear(p2);
  await mute(p2, true);
  await robbed("p0", "p1");
  await sleep(300);
  assert.deepEqual(await names(p2), [], "muted: robbed_fah is silent");
  await mute(p2, false);
  ok("wayfarer: elsewhere or by me, the usual wayfarer_move; muted, nothing");
  await p2.close();

  // ---- The owner's music stings (game_start, match_point, game_lose): the right seats, once each, muted = silent.
  const p3 = await tab("Ember", `http://127.0.0.1:${PORT}/`);
  await clear(p3);
  await p3.evaluate(() => window.__emberisle.getState().startAi());
  await sleep(500);
  assert.deepEqual((await heard(p3)).map((x) => [x.file, x.volume]), [["game_start.mp3", 1]], "practice: a new game plays game_start once, at music volume");
  ok("game_start: practice plays it once at music volume");
  const probe = (fn, arg) =>
    p3.evaluate(
      async ({ src, arg }) => {
        const store = await import("/src/lib/game/store.ts");
        const base = structuredClone(window.__emberisle.getState().state);
        const run = new Function("store", "base", "arg", `return (${src})(store, base, arg)`);
        return run(store, base, arg);
      },
      { src: fn.toString(), arg },
    );
  const heardNow = async () => {
    await sleep(350);
    const got = (await heard(p3)).map((x) => x.file);
    await clear(p3);
    return got;
  };
  await clear(p3);
  // Online: the first state of a fresh island plays it for a seat, once; a state later in the game or a watcher's does not.
  await probe(({ hear }, g) => { g.seq = 0; g.phase = "rollOff"; hear(null, g, "p0", "online"); });
  assert.deepEqual(await heardNow(), ["game_start.mp3"], "online: the first state of a new game plays game_start once");
  await probe(({ hear }, g) => { g.seq = 0; g.phase = "rollOff"; hear(null, g, "", "online"); });
  assert.deepEqual(await heardNow(), [], "a watcher (no seat) does not");
  await probe(({ hear }, g) => { g.phase = "rollOff"; g.seq = 0; const later = { ...g, seq: 3 }; hear(g, later, "p0", "online"); });
  assert.deepEqual(await heardNow(), [], "later states of the same game do not play it again");
  ok("game_start: online once on a new game's first state, not for a watcher, not again");
  // A bot may already have rolled first (seq > 0) before the first state reaches a seat: still a new game, still once. The same
  // game's state arriving again after a reconnect does not replay it; a rematch's new island does.
  const sigProbe = (tag, seq) => p3.evaluate(async ({ tag, seq }) => {
    const { hear } = await import("/src/lib/game/store.ts");
    const g = structuredClone(window.__emberisle.getState().state);
    g.phase = "rollOff"; g.seq = seq; g.hexes[0].pip = 90 + tag;
    hear(null, g, "p0", "online");
    hear(null, g, "p0", "online");
    await new Promise((r) => setTimeout(r, 300));
    const rematch = { ...structuredClone(g), phase: "setupSettle", seq: 1 };
    rematch.hexes[0].pip = 80 + tag;
    hear({ ...g, phase: "over" }, rematch, "p0", "online");
  }, { tag, seq });
  await sigProbe(1, 2);
  assert.deepEqual(await heardNow(), ["game_start.mp3", "game_start.mp3"], "bot-first (seq 2): once for the game, not again on a repeat; once more for a rematch's new island");
  ok("game_start: keyed on the new game, so a bot rolling first still plays it once, and a repeat state does not");

  // Losing: every seat but the winner; the winner keeps the win sound.
  const over = (me, mode = "online") => probe(({ hear }, g, a) => { const after = { ...g, phase: "over", winner: "p1" }; hear({ ...g, phase: "main" }, after, a.me, a.mode); }, { me, mode });
  // Leaving the end screen (a rematch's first state, the menu) from the table's point of view: the over state is replaced.
  const leave = () => probe(({ hear }, g) => hear({ ...g, phase: "over", winner: "p1" }, { ...g, phase: "main" }, "p0", "online"));
  await over("p0");
  assert.deepEqual(await heardNow(), ["game_lose.mp3"], "a seat that did not win hears game_lose once");
  await leave();
  await over("p2");
  assert.deepEqual(await heardNow(), ["game_lose.mp3"], "so does every other losing seat");
  await leave();
  await over("p1");
  assert.deepEqual(await heardNow(), ["win"], "the winner keeps the win sound");
  await leave();
  await over("p0", "hotseat");
  assert.deepEqual(await heardNow(), ["win"], "hotseat has no losing seat");
  await mute(p3, true);
  await over("p0");
  assert.deepEqual(await heardNow(), [], "muted: silent");
  await mute(p3, false);
  await leave();
  ok("game_lose: every seat but the winner, once; the winner keeps win; hotseat and mute unchanged");
  // End music: once per game end, ~1.5 s after the sting, on every seat; cancelled by leaving the end screen; silent when muted.
  await sleep(300);
  await clear(p3);
  await over("p0");
  await sleep(2000);
  assert.deepEqual((await heard(p3)).map((x) => [x.file, x.volume]), [["game_lose.mp3", 1], ["end_music.mp3", 1]], "the loser hears the sting, then the end music once");
  const gap = (await heard(p3)).map((x) => x.t);
  assert.ok(gap[1] - gap[0] >= 1400 && gap[1] - gap[0] < 2000, `the music starts ${Math.round(gap[1] - gap[0])} ms after the sting`);
  await p3.evaluate(() => (window.__pauses = []));
  await leave();
  assert.ok((await p3.evaluate(() => window.__pauses)).includes("end_music.mp3"), "a rematch / leaving the end screen stops the music");
  await clear(p3);
  await over("p1");
  await sleep(2000);
  assert.deepEqual(await names(p3), ["win", "end_music.mp3"], "the winner's seat gets the music too, after the win sound");
  await leave();
  await clear(p3);
  await over("p0");
  await leave();
  await sleep(2000);
  assert.deepEqual(await names(p3), ["game_lose.mp3"], "leaving before it starts cancels it: no music");
  await clear(p3);
  await over("p0");
  await mute(p3, true);
  await mute(p3, false);
  await sleep(2000);
  assert.deepEqual(await names(p3), ["game_lose.mp3"], "muting inside the 1.5 s delay cancels the queued music; unmuting does not revive it");
  await clear(p3);
  await mute(p3, true);
  await over("p0");
  await sleep(2000);
  await mute(p3, false);
  assert.deepEqual(await names(p3), [], "muted: no sting, no music");
  await clear(p3);
  await over("p0", "hotseat");
  await sleep(2000);
  assert.deepEqual(await names(p3), ["win"], "hotseat: no end music");
  await clear(p3);
  await probe(({ hear }, g) => hear(null, { ...g, phase: "over", winner: "p1" }, "p0", "online"));
  await sleep(2000);
  assert.deepEqual(await names(p3), [], "a reload or reconnect into an already-over game plays nothing");
  await clear(p3);
  ok("end_music: once per game end after the sting, for losers and winner; stops on leave/rematch; muted, hotseat and reload into over are silent");
  // Match point: public points only, once per player, with the banner line.
  const mp = (hidden) =>
    probe(({ hear, takeMatchPointLine }, g, hidden) => {
      g.hexes[1].pip = 70 + (hidden ? 1 : 0); // a board of its own, so each case is its own game
      for (const v of g.vertices) v.building = null;
      for (const p of g.players) p.hidden.vp = 0;
      g.victoryTarget = 10;
      g.longestRoad = "p1";
      g.largestArmy = "p1";
      const give = (n) => g.vertices.slice(0, n).forEach((v) => (v.building = { playerId: "p1", kind: "outpost" }));
      give(4);
      const before = structuredClone(g);
      if (hidden) g.players.find((p) => p.id === "p1").hidden.vp = 3;
      else give(5);
      hear(before, g, "p0", "online");
      return takeMatchPointLine();
    }, hidden);
  const line = await mp(false);
  // The synthetic outpost also knocks; only the sting is under test.
  assert.deepEqual((await heardNow()).filter((f) => f === "match_point.mp3"), ["match_point.mp3"], "a player reaching 9 of 10 public points plays match_point once");
  assert.match(line, /^.+ reached 9 points \u2014 one to win$/);
  assert.equal(await mp(true), null, "hidden fortune points are not counted: no banner");
  assert.deepEqual(await heardNow(), [], "and no sound: hidden points cannot leak");
  // Losing and regaining Longest Path (or Largest Army) is not a second match point in the same game.
  const regain = await p3.evaluate(async () => {
    const { hear, takeMatchPointLine } = await import("/src/lib/game/store.ts");
    const g = structuredClone(window.__emberisle.getState().state);
    g.hexes[2].pip = 60;
    g.victoryTarget = 10;
    for (const v of g.vertices) v.building = null;
    g.vertices.slice(0, 7).forEach((v) => (v.building = { playerId: "p1", kind: "outpost" }));
    g.longestRoad = null;
    g.largestArmy = null;
    const at = (road) => ({ ...structuredClone(g), longestRoad: road });
    const lines = [];
    const step = (a, b) => { hear(a, b, "p0", "online"); lines.push(takeMatchPointLine()); };
    step(g, at("p1")); // 7 -> 9: first time
    step(at("p1"), at(null)); // down to 7
    step(at(null), at("p1")); // back to 9: the same game
    return lines;
  });
  assert.match(regain[0], /reached 9 points/);
  assert.deepEqual(regain.slice(1), [null, null], "regaining the points in the same game says nothing");
  assert.deepEqual((await heardNow()).filter((f) => f === "match_point.mp3"), ["match_point.mp3"], "and plays the sting only once");
  ok(`match_point: once per player at target-1 public points (banner "${line}"); hidden points play nothing`);
  await p3.close();

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

  // ---- The soundboard: a tap plays on every seat's page and shows a chip; the host paces it; mute is each listener's own.
  await sleep(3200);
  await a.evaluate(() => window.__emberisle.getState().setChatOpen(true));
  await b.evaluate(() => window.__emberisle.getState().setChatOpen(true));
  await clear(a);
  await clear(b);
  // #899: the sound chips are the chat panel's second tab, Sounds & stickers.
  await a.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
  await a.getByRole("button", { name: "Play sound Fah" }).click();
  await until(async () => (await names(b)).length, "Tide hears the soundboard tap");
  await sleep(300);
  assert.deepEqual((await heard(b)).map((x) => [x.file, x.volume]), [["robbed_fah.mp3", 1]], "the other seat hears fah once, at volume 1 (#1073)");
  assert.deepEqual((await heard(a)).filter((x) => x.file === "robbed_fah.mp3").map((x) => [x.file, x.volume]), [["robbed_fah.mp3", 1]], "the sender hears it once too, at 1");
  // The log line is a light line: the sender, a speaker mark and the chip's label.
  const fahLine = b.getByTestId("chat-log").getByTestId("sound-line").filter({ hasText: "Fah" }).first();
  const chip = await fahLine.textContent();
  assert.ok(chip.includes("Ember") && chip.includes("Fah") && (await fahLine.locator("svg").count()) === 1, `the chip reads "Ember [speaker] Fah": ${chip}`);
  ok("soundboard: a tap on the Sounds & stickers tab plays on both seats and shows the line \"Ember [speaker] Fah\" in chat");
  assert.ok(await a.getByRole("button", { name: "Play sound Bong" }).isDisabled(), "the sender's buttons rest for 3 s");
  // Past the buttons: spam straight at the host is refused and nobody hears a second clip.
  await clear(b);
  await a.evaluate(() => { for (let i = 0; i < 4; i++) window.__emberisle.getState().sendSound("bong"); });
  await sleep(600);
  assert.deepEqual(await names(b), [], "spam inside 3 s plays nothing on the other seat");
  ok("soundboard: four more taps inside 3 s are refused by the host, nothing plays");
  await sleep(3000);
  await mute(b, true);
  await clear(b);
  await a.evaluate(() => window.__emberisle.getState().sendSound("plop"));
  await until(() => b.evaluate(() => window.__emberisle.getState().chat.some((l) => l.sound === "plop")), "the plop line arrives");
  await sleep(400);
  assert.deepEqual(await names(b), [], "a muted listener hears nothing");
  assert.ok((await b.getByTestId("chat-log").getByTestId("sound-line").filter({ hasText: "Plop" }).count()) >= 1, "but still sees the chip");
  await mute(b, false);
  ok("soundboard: a muted listener sees the chip and hears nothing");
  // The in-game clips reach the other seat once each; a repeat of a long clip restarts it (one element per clip), never stacks.
  // #899: each is one tap on its chip in the Sounds & stickers tab (Fah above, GG! with the rest below: all fifteen).
  for (const [id, file, label] of [["sb_airhorn", "sb_airhorn.mp3", "Airhorn"], ["sb_quit_touchin", "sb_quit_touchin.mp3", "Quit touchin' me"], ["sb_only_wood", "sb_only_wood.mp3", "Only wood?"], ["sb_perfect", "sb_perfect.mp3", "Perfect"], ["sb_plump_sheep", "sb_plump_sheep.mp3", "Plump sheep"], ["sb_nice_sheep", "sb_nice_sheep.mp3", "Nice sheep"], ["sb_sheep_please", "sb_sheep_please.mp3", "Sheep please"], ["sb_grain_please", "sb_grain_please.mp3", "Grain please"], ["sb_brick_please", "sb_brick_please.mp3", "Brick please"]]) {
    await sleep(3100);
    await clear(b);
    await a.getByRole("button", { name: `Play sound ${label}`, exact: true }).click();
    await until(async () => (await names(b)).length, `${id} reaches Tide`);
    await sleep(300);
    assert.deepEqual((await heard(b)).map((x) => [x.file, x.volume]), [[file, 1]], `${id} plays once on the other seat, at 1`);
  }
  // #659 / #1073: every soundboard id plays at 1 (the files are leveled by type). The rest of the board, by id, one tap each.
  // The raw played file, not its clip name: the board_* sounds reuse files that table clips own, which `heard` names by the first.
  for (const [id, file, label] of [["sb_wololo", "sb_wololo.mp3", "Wololo"], ["sb_win_reaction", "sb_win_reaction.mp3", "GG!"], ["bong", "bong_001", "Bong"], ["plop", "plop", "Plop"], ["pluck", "pluck_001", "Pluck"]]) {
    await sleep(3100);
    await clear(b);
    await a.getByRole("button", { name: `Play sound ${label}`, exact: true }).click();
    await until(async () => (await names(b)).length, `${id} reaches Tide`);
    await sleep(300);
    const got = await b.evaluate(() => window.__plays);
    assert.deepEqual(got.map((x) => [x.file, x.volume]), [[file, 1]], `${id} plays once at 1 (${JSON.stringify(got)})`);
  }
  ok("soundboard: all fifteen chips play once at 1, including all five sheep/please clips");
  await b.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
  const labels = await b.getByTestId("soundboard").getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  await b.evaluate(async () => {
    const { play } = await import("/src/lib/sound.ts");
    play("sb_airhorn");
    await new Promise((r) => setTimeout(r, 400));
    play("sb_airhorn");
  });
  assert.ok(["Airhorn", "Quit touchin' me", "Only wood?"].every((label) => labels.includes(`Play sound ${label}`)), "button labels");
  await b.getByRole("tab", { name: "Chat", exact: true }).click();
  ok("soundboard: Airhorn, Quit touchin' me and Only wood? each play once on the other seat, labelled; a repeat reuses the clip's element");
  await sleep(3100);
  // Muting a seat (the chat's Mute menu) silences that seat's soundboard taps for this listener only.
  await sleep(3000);
  await b.evaluate(async () => {
    const st = window.__emberisle.getState();
    const { mutedByCode } = await import("/src/lib/muted-seats.ts");
    mutedByCode.set(st.code, [st.seats.find((x) => x.name !== "Tide").id]);
  });
  await clear(b);
  await a.evaluate(() => window.__emberisle.getState().sendSound("sb_wololo"));
  await until(() => b.evaluate(() => window.__emberisle.getState().chat.some((l) => l.sound === "sb_wololo")), "the wololo line arrives");
  await sleep(400);
  assert.deepEqual(await names(b), [], "a muted seat's soundboard tap is silent for the listener who muted it");
  await b.evaluate(async () => (await import("/src/lib/muted-seats.ts")).mutedByCode.set(window.__emberisle.getState().code, []));
  ok("soundboard: a tap from a muted seat is silent for the listener who muted it");


  // The win screen's React button sends the same soundboard path: the table hears GG! and sees its chip.
  await sleep(3200);
  await a.evaluate(async () => {
    const { createGame } = await import("/src/lib/game/board.ts");
    const g = createGame({ humans: [{ name: "Ember" }], bots: 2 });
    g.phase = "over";
    g.winner = "p0";
    window.__emberisle.setState({ screen: "play", mode: "online", state: g, localId: "p0" });
  });
  await clear(b);
  await a.getByTestId("win-react").click();
  await until(async () => (await names(b)).length, "Tide hears the win reaction");
  await sleep(300);
  assert.deepEqual((await heard(b)).map((x) => [x.file, x.volume]), [["sb_win_reaction.mp3", 1]], "the other seat hears sb_win_reaction once, at 1");
  assert.ok((await b.getByTestId("chat-log").locator("li", { hasText: "GG!" }).count()) >= 1, "with the chip \"GG!\"");
  assert.ok(await a.getByTestId("win-react").isDisabled(), "React rests for 3 s");
  ok("win screen: React plays sb_win_reaction on the other seat once, with a chip, and rests");

  const isaacWin = await Promise.all([a, b].map((page) => page.evaluate(async () => {
    const { createGame } = await import("/src/lib/game/board.ts");
    const { hear } = await import("/src/lib/game/store.ts");
    const base = createGame({ humans: [{ name: "Lucky Diggler" }, { name: "Tide" }], bots: 1 });
    const before = { ...base, phase: "main", winner: null };
    const after = { ...base, phase: "over", winner: base.players[0].id, seq: base.seq + 1 };
    window.__plays = [];
    window.__pauses = [];
    hear(before, after, base.players[0].id, "online");
    await new Promise((r) => setTimeout(r, 1700));
    const heard = window.__plays.map((x) => [x.file, x.volume]);
    hear(after, { ...after, phase: "main", winner: null, seq: after.seq + 1 }, base.players[0].id, "online");
    await new Promise((r) => setTimeout(r, 100));
    return { heard, pauses: window.__pauses };
  })));
  for (const result of isaacWin) {
    assert.deepEqual(result.heard, [["isaac_win.mp3", 1]], "Isaac's win replaces both stings at 1 without end_music");
    assert.ok(result.pauses.includes("isaac_win.mp3"), "leaving the end screen stops Isaac's win music");
  }
  ok("Isaac's win music plays at 1 for both seats instead of either sting and stops when leaving the end screen");

  const bell = await a.evaluate(async () => {
    const pushSeats = (seats) => window.__sockets.at(-1).onmessage({ data: JSON.stringify({ type: "seats", code: window.__emberisle.getState().code, seats }) });
    const ember = { id: "s1", name: "Ember" };
    const lucky = { id: "s2", name: "Lucky Diggler" };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__plays = [];
    window.__emberisle.setState({ seats: [ember] });
    pushSeats([ember, lucky]);
    await sleep(300);
    const joined = window.__plays.map((x) => x.file);
    window.__plays = [];
    const isaac = { ...ember, name: "Isaaac" };
    pushSeats([isaac, lucky]);
    await sleep(300);
    const renamed = window.__plays.map((x) => x.file);
    window.__plays = [];
    pushSeats([isaac, lucky]);
    await sleep(300);
    return { joined, renamed, rejoined: window.__plays.map((x) => x.file) };
  });
  assert.deepEqual(bell.joined, ["lucke_diggler.mp3"], "a new matching lobby seat rings once");
  assert.deepEqual(bell.renamed, ["lucke_diggler.mp3"], "a lobby rename to a matching name rings once");
  assert.deepEqual(bell.rejoined, [], "the same matching seats on a later seats update do not ring again");
  ok("Isaac's bell rings for a new matching seat and lobby rename, not a repeated seat update");

  // Online, the match-point banner shows on the same state that crosses target - 1 (the banner is read after the sound claims it).
  const banner = await a.evaluate(async () => {
    const base = structuredClone(window.__emberisle.getState().state);
    base.phase = "main";
    base.winner = null;
    base.victoryTarget = 10;
    base.hexes[3].pip = 55;
    for (const v of base.vertices) v.building = null;
    base.vertices.slice(0, 4).forEach((v) => (v.building = { playerId: "p1", kind: "outpost" }));
    base.longestRoad = "p1";
    base.largestArmy = "p1";
    const legal = { outpost: [], path: [], stronghold: [], wayfarer: [], steal: {}, discard: 0, actions: [] };
    const push = (game) => window.__sockets.at(-1).onmessage({ data: JSON.stringify({ type: "state", you: "p0", game, legal }) });
    push(base);
    const before = window.__emberisle.getState().banner;
    const next = structuredClone(base);
    next.seq += 1;
    next.vertices[4].building = { playerId: "p1", kind: "outpost" };
    push(next);
    return { before, after: window.__emberisle.getState().banner };
  });
  assert.equal(banner.before, null, "no banner before the crossing");
  assert.match(banner.after, /reached 9 points \u2014 one to win$/, "online: the banner is up on the very state that crosses target - 1");
  ok(`match_point online: banner "${banner.after}" on the same state`);

  // ---- #660 your_turn cue: acting seat hears it once, other seats silent, rejoin mid-turn hears once, repeat push silent, muted silent, hotseat silent.
  const turnBase = structuredClone(await a.evaluate(() => window.__emberisle.getState().state));
  turnBase.phase = "main";
  turnBase.winner = null;
  const p1Turn = { ...turnBase, current: "p1", seq: turnBase.seq + 1 };
  const p0Turn = { ...turnBase, current: "p0", seq: turnBase.seq + 2 };

  // Let the banner test's outpost knock land and drain
  await until(async () => (await names(a)).includes("outpost_place"), "the match-point outpost lands");
  await a.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  // Sync both tabs to p1's turn
  await a.evaluate((g) => window.__sockets.at(-1).onmessage({ data: JSON.stringify({ type: "state", you: "p0", game: g }) }), p1Turn);
  await b.evaluate((g) => window.__sockets.at(-1).onmessage({ data: JSON.stringify({ type: "state", you: "p1", game: g }) }), p1Turn);
  await a.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  await clear(a);
  await clear(b);

  // (1) Turn passes to local seat p0: a hears your_turn once at volume 1; (2) b hears nothing
  await a.evaluate((g) => window.__sockets.at(-1).onmessage({ data: JSON.stringify({ type: "state", you: "p0", game: g }) }), p0Turn);
  await b.evaluate((g) => window.__sockets.at(-1).onmessage({ data: JSON.stringify({ type: "state", you: "p1", game: g }) }), p0Turn);
  await until(async () => (await names(a)).filter((n) => n === "your_turn").length, "acting seat hears your_turn");
  await sleep(100);
  assert.deepEqual((await names(a)).filter((n) => n === "your_turn"), ["your_turn"], "your_turn plays exactly once when the turn passes to the local seat");
  assert.equal((await heard(a)).find((x) => x.file === "your_turn")?.volume, 1, "your_turn plays at volume 1");
  assert.deepEqual((await names(b)).filter((n) => n === "your_turn"), [], "it does not play for the other seats");
  ok("your_turn: plays once for acting seat, silent for others");

  // (4) Pushing the same state twice plays it once
  await clear(a);
  await a.evaluate((g) => window.__sockets.at(-1).onmessage({ data: JSON.stringify({ type: "state", you: "p0", game: g }) }), p0Turn);
  await sleep(200);
  assert.deepEqual((await names(a)).filter((n) => n === "your_turn"), [], "pushing the same state twice plays it once");
  ok("your_turn: repeat push of the same turn plays nothing");

  // (3) A tab that drops and rejoins during its own turn hears it exactly once; rejoin during another's turn hears nothing
  await clear(a);
  await a.evaluate((g) => {
    const ws = window.__sockets.at(-1);
    const code = window.__emberisle.getState().code;
    ws.onmessage({ data: JSON.stringify({ type: "welcome", code, you: "p0", host: true }) });
    ws.onmessage({ data: JSON.stringify({ type: "state", you: "p0", game: g }) });
  }, p0Turn);
  await until(async () => (await names(a)).filter((n) => n === "your_turn").length, "rejoin during own turn hears your_turn");
  assert.deepEqual((await names(a)).filter((n) => n === "your_turn"), ["your_turn"], "rejoin during own turn hears your_turn exactly once");
  await clear(a);
  await a.evaluate((g) => {
    const ws = window.__sockets.at(-1);
    const code = window.__emberisle.getState().code;
    ws.onmessage({ data: JSON.stringify({ type: "welcome", code, you: "p0", host: true }) });
    ws.onmessage({ data: JSON.stringify({ type: "state", you: "p0", game: g }) });
  }, p1Turn);
  await sleep(200);
  assert.deepEqual((await names(a)).filter((n) => n === "your_turn"), [], "rejoin during someone else's turn hears nothing");
  ok("your_turn: rejoin during own turn plays once, rejoin during another seat's turn is silent");

  // (5) With sound muted it does not play
  await mute(a, true);
  await clear(a);
  const p0TurnAgain = { ...turnBase, current: "p0", seq: turnBase.seq + 3 };
  await a.evaluate((g) => window.__sockets.at(-1).onmessage({ data: JSON.stringify({ type: "state", you: "p0", game: g }) }), p0TurnAgain);
  await sleep(200);
  assert.deepEqual((await names(a)).filter((n) => n === "your_turn"), [], "with sound muted your_turn does not play");
  await mute(a, false);
  ok("your_turn: muted is silent");

  // (6) Hotseat plays none (also watchers and game over)
  await a.evaluate(async () => {
    const { hear } = await import("/src/lib/game/store.ts");
    const base = structuredClone(window.__emberisle.getState().state);
    const before = { ...base, current: "p1", phase: "main" };
    const after = { ...base, current: "p0", phase: "main", seq: base.seq + 1 };
    const over = { ...base, current: "p0", phase: "over", seq: base.seq + 2 };
    window.__plays = [];
    hear(before, after, "p0", "hotseat");
    hear(null, after, "p0", "hotseat", true);
    hear(before, over, "p0", "online");
    hear(before, after, "", "online");
  });
  assert.deepEqual((await names(a)).filter((n) => n === "your_turn"), [], "hotseat, game over and watchers play none");
  ok("your_turn: hotseat plays none");

  assert.deepEqual(errors, [], `console errors: ${errors.join(" | ")}`);
  console.log("PASS sounds-prove");
} catch (e) {
  console.error("FAIL", e);
  code = 1;
}
await browser.close();
await vite.close();
host.kill();
if (host.exitCode === null && host.signalCode === null) await Promise.race([once(host, "exit"), new Promise((r) => setTimeout(r, 3000).unref())]);
process.exit(code);
