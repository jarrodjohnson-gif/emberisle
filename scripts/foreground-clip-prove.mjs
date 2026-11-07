// #1044: one long clip at a time (docs/design/profiles.md, "Curated media and playback"), in the real app with audio stubbed.
// - Priority outcome > start > match point > soundboard > end music: a lower request is dropped, an equal or higher one cuts
//   the playing clip off for good, and only one long clip ever plays.
// - Mute, a silenced category and Music off end the clip of that kind only, and turning it back on resumes nothing.
// - End music waits for its outcome (at least 1.5 s, longer while the outcome clip still plays); cancelling while it waits,
//   or while it is delayed, starts nothing.
// - Refused and late-refused plays, stale ended events and a game-end chunk that resolves after a cancel start nothing.
// - The real callers: hear() (outcome, start, match point, rematch), startAi, goTitle (Leave), and the results panel's
//   Look around and Escape (hide), repeated.
// - Each guard is then removed from the source, one at a time, and the check that covers it must fail.
// Run: npm run foreground-clip-prove
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (what) => console.log(`ok ${what}`);
const FG = { outcome: "game_lose.mp3", start: "game_start.mp3", match: "match_point.mp3", board: "sb_airhorn.mp3", end: "end_music.mp3" };
const ROLES = Object.keys(FG);
const RANK = { outcome: 4, start: 3, match: 2, board: 1, end: 0 };
// Only these are counted as played: UI clicks, chimes and the background loop are not this proof's business.
const LONG = [...Object.values(FG), "pluck_001.wav", "sb_wololo.mp3", "isaac_win.mp3"];

function stub(long) {
  window.__audios = [];
  window.__plays = [];
  window.__mode = {};
  window.__late = [];
  window.__errors = [];
  window.addEventListener("unhandledrejection", (e) => window.__errors.push(String(e.reason)));
  window.Audio = class extends EventTarget {
    constructor(src) { super(); this.src = src.split("/").at(-1); this.volume = 1; this.currentTime = 0; this.paused = true; this.ended = false; this.loop = false; window.__audios.push(this); }
    play() {
      const mode = window.__mode[this.src];
      if (mode === "reject") return Promise.reject(new DOMException("refused", "NotAllowedError"));
      // A browser marks a clip as playing at once and may refuse it later (a slow decode, then NotAllowedError).
      this.paused = false; this.ended = false;
      if (mode === "late") return new Promise((_, reject) => window.__late.push(() => { this.paused = true; reject(new DOMException("refused late", "NotAllowedError")); }));
      if (long.includes(this.src)) window.__plays.push({ file: this.src, t: performance.now() });
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    }
    pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
  };
  window.__end = (file) => {
    for (const a of window.__audios) if (a.src === file && !a.paused) { a.paused = true; a.ended = true; a.dispatchEvent(new Event("ended")); }
  };
  // An ended event from a clip that was already cut off (a decoder flushing late).
  window.__staleEnd = (file) => { for (const a of window.__audios) if (a.src === file) a.dispatchEvent(new Event("ended")); };
}

// Each check gets the page with the app booted, audio unlocked and the modules on window.__t.
const checks = {
  async priority(page, clean) {
    for (const a of ROLES) for (const b of ROLES) {
      await clean();
      const got = await page.evaluate(async ({ a, b, FG }) => {
        const { S } = window.__t;
        const name = (r) => FG[r].replace(".mp3", "");
        S.playForeground(name(a), a);
        await new Promise((r) => setTimeout(r, 20));
        S.playForeground(name(b), b);
        await new Promise((r) => setTimeout(r, 20));
        const live = window.__audios.filter((x) => Object.values(FG).includes(x.src) && !x.paused).map((x) => x.src);
        const started = window.__plays.map((p) => p.file);
        window.__end(FG[b]);
        window.__end(FG[a]);
        await new Promise((r) => setTimeout(r, 20));
        return { live, started, after: window.__plays.length };
      }, { a, b, FG });
      if (RANK[b] < RANK[a]) {
        assert.deepEqual(got.started, [FG[a]], `${b} under a playing ${a} is dropped, not queued`);
        assert.deepEqual(got.live, [FG[a]], `${a} keeps playing over a ${b} request`);
      } else {
        assert.deepEqual(got.started, [FG[a], FG[b]], `${b} cuts off a playing ${a}`);
        assert.deepEqual(got.live, [FG[b]], `only ${b} plays after it cuts off ${a}`);
      }
      assert.equal(got.after, got.started.length, `${a} then ${b}: nothing resumes or starts after both end`);
    }
    // An ended event from a clip that was cut off does not free the channel for a lower request.
    await clean();
    const blocked = await page.evaluate(async () => {
      const { S } = window.__t;
      S.playForeground("sb_airhorn", "board");
      S.playForeground("game_lose", "outcome");
      window.__staleEnd("sb_airhorn.mp3");
      S.playForeground("match_point", "match");
      await new Promise((r) => setTimeout(r, 20));
      return window.__plays.map((p) => p.file);
    });
    assert.deepEqual(blocked, ["sb_airhorn.mp3", "game_lose.mp3"], "a cut-off clip's late ended event does not let a lower clip in");
    ok(`priority: all ${ROLES.length ** 2} pairs; a lower request is dropped, an equal or higher one cuts off; one clip plays; nothing resumes`);
  },

  async silence(page, clean) {
    await clean();
    const got = await page.evaluate(async () => {
      const { S, M } = window.__t;
      const playing = (f) => window.__audios.some((x) => x.src === f && !x.paused);
      const wait = () => new Promise((r) => setTimeout(r, 20));
      const out = {};
      S.playForeground("sb_airhorn", "board");
      M.setCategoryMuted("music", true);
      await wait();
      out.otherKind = playing("sb_airhorn.mp3");
      M.setCategoryMuted("music", false);
      M.setCategoryMuted("memes", true);
      await wait();
      out.ownKind = playing("sb_airhorn.mp3");
      M.setCategoryMuted("memes", false);
      await wait();
      out.unmute = playing("sb_airhorn.mp3");
      // A request of a silenced kind does not cut off the clip that plays.
      S.playForeground("end_music", "end");
      M.setCategoryMuted("memes", true);
      S.playForeground("sb_wololo", "board");
      await wait();
      out.silencedRequest = playing("end_music.mp3");
      M.setCategoryMuted("memes", false);
      S.setMusicOn(false);
      await wait();
      out.musicOff = playing("end_music.mp3");
      S.setMusicOn(true);
      S.playForeground("game_start", "start");
      S.setMuted(true);
      await wait();
      out.master = playing("game_start.mp3");
      S.setMuted(false);
      await wait();
      out.files = window.__plays.map((p) => p.file);
      return out;
    });
    assert.equal(got.otherKind, true, "muting music leaves a soundboard clip playing");
    assert.equal(got.ownKind, false, "muting memes ends the soundboard clip");
    assert.equal(got.unmute, false, "unmuting memes does not resume it");
    assert.equal(got.silencedRequest, true, "a muted soundboard request does not cut off the end music");
    assert.equal(got.musicOff, false, "Music off ends the end music");
    assert.equal(got.master, false, "master mute ends the start sting");
    assert.deepEqual(got.files, ["sb_airhorn.mp3", "end_music.mp3", "game_start.mp3"], "each clip started once; no unmute restarted one");
    ok("mute: a silenced kind ends only its own clip, a silenced request cuts nothing, unmute and Music on resume nothing");
  },

  async endWait(page, clean) {
    await clean();
    const got = await page.evaluate(async () => {
      const { S, M } = window.__t;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const files = () => window.__plays.map((p) => p.file);
      const out = {};
      S.playForeground("game_lose", "outcome");
      S.playEndMusic(50);
      await wait(150);
      out.behind = files();
      window.__end("game_lose.mp3");
      await wait(20);
      out.after = files();
      S.cancelForeground();
      window.__plays = [];
      S.playForeground("game_lose", "outcome");
      S.playEndMusic(50);
      S.cancelForeground();
      await wait(150);
      out.delayed = files();
      window.__plays = [];
      S.playForeground("game_lose", "outcome");
      S.playEndMusic(50);
      await wait(150);
      S.cancelForeground();
      window.__end("game_lose.mp3");
      window.__staleEnd("game_lose.mp3");
      await wait(20);
      out.waiting = files();
      window.__plays = [];
      S.playForeground("game_lose", "outcome");
      S.playEndMusic(50);
      M.setCategoryMuted("music", true);
      await wait(150);
      M.setCategoryMuted("music", false);
      await wait(100);
      out.muted = files();
      window.__plays = [];
      S.playForeground("sb_airhorn", "board");
      S.playEndMusic(50);
      await wait(150);
      window.__end("sb_airhorn.mp3");
      await wait(20);
      out.boardBlocks = files();
      return out;
    });
    assert.deepEqual(got.behind, ["game_lose.mp3"], "end music waits while its outcome clip plays");
    assert.deepEqual(got.after, ["game_lose.mp3", "end_music.mp3"], "end music starts when the outcome clip ends");
    assert.deepEqual(got.delayed, ["game_lose.mp3"], "a cancel during the delay starts no end music");
    assert.deepEqual(got.waiting, ["game_lose.mp3"], "a cancel while it waits for the outcome starts no end music, even when the outcome then ends");
    assert.deepEqual(got.muted, ["game_lose.mp3"], "muting music during the delay drops the end music; unmuting does not bring it back");
    assert.deepEqual(got.boardBlocks, ["sb_airhorn.mp3"], "only the outcome holds end music back: a soundboard clip in the way drops it");
    ok("end music: waits for its outcome, and a cancel or mute before or during the wait starts nothing");
  },

  async refusals(page, clean) {
    await clean();
    const got = await page.evaluate(async () => {
      const { S } = window.__t;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = {};
      // A refused outcome does not hold the end music back.
      window.__mode = { "game_lose.mp3": "reject" };
      S.playForeground("game_lose", "outcome");
      S.playEndMusic(50);
      await wait(150);
      out.refused = window.__plays.map((p) => p.file);
      S.cancelForeground();
      window.__plays = [];
      // A refusal that comes after a cancel, with end music already waiting behind it, starts nothing.
      window.__mode = { "game_lose.mp3": "late" };
      S.playForeground("game_lose", "outcome");
      S.playEndMusic(30);
      await wait(100);
      S.cancelForeground();
      for (const reject of window.__late.splice(0)) reject();
      await wait(100);
      out.late = window.__plays.map((p) => p.file);
      window.__mode = {};
      out.errors = window.__errors;
      return out;
    });
    assert.deepEqual(got.refused, ["end_music.mp3"], "a refused outcome play lets the end music start on time");
    assert.deepEqual(got.late, [], "a play refused after a cancel starts nothing");
    assert.deepEqual(got.errors, [], "refusals are caught");
    ok("refusals: a refused outcome does not delay end music; a late refusal after a cancel starts nothing");
  },

  async stale(page, clean) {
    await clean();
    // A soundboard clip the outcome cut off reports its end late, while the end music waits behind the outcome.
    const got = await page.evaluate(async () => {
      const { S } = window.__t;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      S.playForeground("sb_airhorn", "board");
      S.playForeground("game_lose", "outcome");
      S.playEndMusic(30);
      await wait(80);
      window.__staleEnd("sb_airhorn.mp3");
      await wait(50);
      const files = window.__plays.map((p) => p.file);
      const live = window.__audios.filter((a) => !a.paused && a.src !== "old_tower_inn_loop.mp3").map((a) => a.src);
      return { files, live };
    });
    assert.deepEqual(got.files, ["sb_airhorn.mp3", "game_lose.mp3"], "a stale ended event does not run the waiting end music");
    assert.deepEqual(got.live, ["game_lose.mp3"], "the outcome keeps the channel");
    ok("stale ended: a cut-off clip's late ended event neither ends the outcome nor starts the end music");
  },

  async lateChunk(page, clean) {
    await clean();
    const got = await page.evaluate(async () => {
      const { S, store, game } = window.__t;
      const g = game();
      store.hear({ ...g, phase: "main" }, { ...g, phase: "over", winner: "p1" }, "p0", "ai");
      S.cancelForeground();
      await new Promise((r) => setTimeout(r, 1800));
      return window.__plays.map((p) => p.file);
    });
    assert.deepEqual(got, [], "a cancel before the game-end chunk resolves starts neither sting nor end music");
    ok("late chunk: a game end cancelled in the same tick plays nothing");
  },

  async callers(page, clean) {
    await clean();
    const got = await page.evaluate(async () => {
      const { S, store, game, useGame } = window.__t;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const files = () => window.__plays.map((p) => p.file);
      const out = {};
      const g = game();
      const over = { ...g, phase: "over", winner: "p1" };
      // Loser: the sting, and end music only once the sting ends.
      store.hear({ ...g, phase: "main" }, over, "p0", "online");
      await wait(1700);
      out.loserWaiting = files();
      window.__end("game_lose.mp3");
      await wait(20);
      out.loser = files();
      // Rematch while the sting still plays: the new game's state cancels it and its waiting end music, and the start sting plays.
      window.__plays = [];
      store.hear({ ...g, phase: "main" }, over, "p0", "online");
      await wait(50);
      store.hear(over, { ...game(), phase: "rollOff" }, "p0", "online");
      await wait(1700);
      out.rematch = files();
      out.rematchLive = window.__audios.filter((a) => !a.paused && a.src.endsWith(".mp3") && a.src !== "old_tower_inn_loop.mp3").map((a) => a.src);
      window.__end("game_start.mp3");
      window.__plays = [];
      // Winner: the short win clip ends at once, so end music keeps its 1.5 s.
      const t0 = performance.now();
      store.hear({ ...g, phase: "main" }, { ...g, phase: "over", winner: "p0" }, "p0", "online");
      await wait(20);
      window.__end("pluck_001.wav");
      await wait(1700);
      out.winner = window.__plays.map((p) => [p.file, Math.round(p.t - t0)]);
      // Leave: the menu ends the end music and starts nothing late.
      useGame.getState().goTitle();
      await wait(20);
      out.leaveLive = window.__audios.some((a) => a.src === "end_music.mp3" && !a.paused);
      window.__plays = [];
      store.hear({ ...g, phase: "main" }, over, "p0", "online");
      await wait(50);
      useGame.getState().goTitle();
      window.__end("game_lose.mp3");
      await wait(1700);
      out.leaveDelayed = files();
      // A new practice game cuts the old game's clips and plays its start sting.
      window.__plays = [];
      S.playForeground("end_music", "end");
      useGame.getState().startAi();
      await wait(50);
      out.practice = files();
      out.practiceLive = window.__audios.filter((a) => ["end_music.mp3", "game_start.mp3"].includes(a.src) && !a.paused).map((a) => a.src);
      return out;
    });
    assert.deepEqual(got.loserWaiting, ["game_lose.mp3"], "the loser's end music waits while game_lose still plays");
    assert.deepEqual(got.loser, ["game_lose.mp3", "end_music.mp3"], "then starts once game_lose ends");
    assert.deepEqual(got.rematch, ["game_lose.mp3", "game_start.mp3"], "a rematch during the sting plays the start sting, and no end music");
    assert.deepEqual(got.rematchLive, ["game_start.mp3"], "the rematch's cancel ended the sting, not the new start sting");
    assert.deepEqual(got.winner.map(([f]) => f), ["pluck_001.wav", "end_music.mp3"], "the winner hears win, then end music");
    assert.ok(got.winner[1][1] >= 1450, `the winner's end music keeps its 1.5 s delay (${got.winner[1][1]} ms)`);
    assert.equal(got.leaveLive, false, "Leave ends the end music");
    assert.deepEqual(got.leaveDelayed, ["game_lose.mp3"], "Leave before the end music starts drops it");
    assert.deepEqual(got.practice, ["end_music.mp3", "game_start.mp3"], "a new practice game plays its start sting");
    assert.deepEqual(got.practiceLive, ["game_start.mp3"], "and ended the old end music");
    ok(`callers: loser waits for game_lose; winner ${got.winner[1][1]} ms; rematch, Leave and a new practice game cancel the old clips`);
  },

  async hide(page, clean) {
    await clean();
    const show = async () => {
      await page.evaluate(async () => {
        const { store, useGame } = window.__t;
        const g = useGame.getState().state;
        const over = { ...g, phase: "over", winner: "p1" };
        window.__plays = [];
        store.hear({ ...g, phase: "main" }, over, "p0", "ai");
        useGame.setState({ state: over });
        await new Promise((r) => setTimeout(r, 50));
      });
      await page.getByTestId("win-look").waitFor();
    };
    const live = () => page.evaluate(() => window.__audios.filter((a) => ["game_lose.mp3", "end_music.mp3"].includes(a.src) && !a.paused).map((a) => a.src));
    const files = () => page.evaluate(() => window.__plays.map((p) => p.file));
    await page.evaluate(() => window.__t.useGame.getState().startAi());
    await show();
    assert.deepEqual(await live(), ["game_lose.mp3"], "the results open with the outcome sting");
    await page.getByTestId("win-look").click();
    assert.deepEqual(await live(), [], "Look around ends the outcome sting");
    await sleep(1700);
    assert.deepEqual(await files(), ["game_lose.mp3"], "and its end music never starts");
    await page.getByTestId("win-show").click();
    await page.getByTestId("win-look").click();
    await page.getByTestId("win-show").click();
    await page.keyboard.press("Escape");
    await sleep(100);
    assert.deepEqual(await files(), ["game_lose.mp3"], "repeated Look around and Escape start nothing");
    await page.evaluate(() => window.__t.useGame.setState({ state: { ...window.__t.useGame.getState().state, phase: "main", winner: null } }));
    await page.evaluate(() => window.__t.useGame.getState().startAi());
    await show();
    await sleep(1600);
    await page.evaluate(() => window.__end("game_lose.mp3"));
    await sleep(50);
    assert.deepEqual(await live(), ["end_music.mp3"], "the end music plays after the sting");
    await page.keyboard.press("Escape");
    await sleep(50);
    assert.deepEqual(await live(), [], "Escape ends the end music");
    ok("hide: Look around and Escape end the sting and the end music, repeatedly, and start nothing late");
  },
};

// Each guard, removed from the source; the named check must then fail.
const MUTANTS = [
  { check: "priority", file: "/src/lib/sound.ts", from: "(playing() && RANK[owner!.role] > RANK[role])", to: "false", why: "no priority" },
  { check: "stale", file: "/src/lib/sound.ts", from: "if (token === undefined || owner?.token !== token) return;", to: "if (token === undefined || !owner) return;", why: "no token check on completion" },
  { check: "refusals", file: "/src/lib/sound.ts", from: "if (token === undefined || owner?.token !== token) return;", to: "if (token === undefined) return;", why: "no owner check on refusal" },
  { check: "silence", file: "/src/lib/sound.ts", from: "subscribeSoundMix(() => { dropSilenced(); ", to: "subscribeSoundMix(() => { ", why: "no cancel on a silenced kind" },
  { check: "endWait", file: "/src/lib/sound.ts", from: "  scope++;\n  clearTimeout(endTimer);", to: "  scope++;", why: "no cancel of the delayed end music" },
  { check: "lateChunk", file: "/src/lib/game/store.ts", from: "scope === foregroundScope() && gameEnd(", to: "gameEnd(", why: "no scope check on the game-end chunk" },
  { check: "hide", file: "/src/components/game/WinScreen.tsx", from: "      cancelForeground();\n", to: "\n", why: "no cancel on hide" },
  { check: "callers", file: "/src/lib/game/store.ts", from: "  if (before?.phase === \"over\" && after.phase !== \"over\") cancelForeground();\n", to: "", why: "no cancel on a rematch" },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });

async function run(names, mutant) {
  const vite = await createServer({
    server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
    plugins: mutant ? [{ name: "foreground-mutant", enforce: "pre", transform(code, id) {
      if (id.split("?")[0].endsWith(mutant.file)) return code.replace(mutant.from, mutant.to);
    } }] : [],
  });
  await vite.listen();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (e) => { if (e.type() === "error") errors.push(e.text()); });
  try {
    await page.addInitScript(stub, LONG);
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.keyboard.press("Shift"); // the gesture that unlocks sound
    await page.evaluate(async () => {
      const [S, M, store, board] = await Promise.all(["/src/lib/sound.ts", "/src/lib/sound-settings.ts", "/src/lib/game/store.ts", "/src/lib/game/board.ts"].map((m) => import(m)));
      const game = () => ({ ...board.createGame({ humans: [{ name: "Ana" }, { name: "Ben" }], bots: 1 }), winner: null });
      window.__t = { S, M, store, game, useGame: window.__emberisle };
    });
    const clean = () => page.evaluate(async () => {
      window.__t.S.cancelForeground();
      await new Promise((r) => setTimeout(r, 30));
      window.__plays = [];
      window.__mode = {};
      window.__late = [];
    });
    for (const name of names) await checks[name](page, clean);
    assert.deepEqual(errors, [], "no page errors");
  } finally {
    await context.close();
    await vite.close();
  }
}

try {
  await run(Object.keys(checks));
  for (const mutant of MUTANTS) {
    const source = readFileSync(new URL(`..${mutant.file}`, import.meta.url), "utf8");
    assert.equal(source.split(mutant.from).length, 2, `mutant "${mutant.why}" finds its source line exactly once`);
    const failed = await run([mutant.check], mutant).then(() => null, (e) => e);
    assert.ok(failed, `with ${mutant.why}, the ${mutant.check} check must fail, but it passed`);
    ok(`mutant (${mutant.why}): the ${mutant.check} check fails: ${failed.message.split("\n")[0]}`);
  }
  console.log("foreground-clip-prove: all checks passed");
} finally {
  await browser.close();
}
