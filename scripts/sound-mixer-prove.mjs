// #980 / #669: the real browser mixer, with audio stubbed. No app UI or test-only product hooks.
// Check every clip's category, multiplicative gain, mute isolation, live/delayed/queued playback,
// background ducking, device persistence, bad storage and autoplay. Run: npm run sound-mixer-prove
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const groups = {
  game: ["dice_land", "path_place", "outpost_place", "stronghold_place", "card_buy", "card_play", "trade_yes", "trade_no", "ui_click", "ui_back", "ui_error", "win", "your_turn", "timer_tick", "timer_final", "chip_gain", "gain_tick", "wayfarer_move", "trade_offer", "three_wood", "daking_wood", "sheep_for_wood", "stone_for_wood", "corn_no", "lucke_diggler", "chat_send", "chat_recv"],
  touch: ["plop", "tap_pasture", "tap_forest", "tap_hills", "tap_fields", "tap_mountains", "tap_waste"],
  memes: ["robbed_fah", "match_point", "sb_wololo", "sb_win_reaction", "sb_airhorn", "sb_quit_touchin", "sb_only_wood", "sb_perfect", "sb_plump_sheep", "sb_nice_sheep", "sb_sheep_please", "sb_grain_please", "sb_brick_please", "sb_real_badman", "sb_shinese_gong", "board_bong", "board_plop", "board_pluck"],
  music: ["game_start", "game_lose", "end_music", "isaac_win"],
};
const source = readFileSync(new URL("../src/lib/sound.ts", import.meta.url), "utf8");
const extraSource = readFileSync(new URL("../src/lib/sound-extra.ts", import.meta.url), "utf8");
const files = Object.fromEntries([source.match(/const FILES = \{([\s\S]*?)\} as const/)[1], extraSource.match(/const EXTRA_FILES = \{([\s\S]*?)\} as const/)[1]].flatMap((block) => [...block.matchAll(/^\s+(\w+): "([\w.]+)",/gm)].map((m) => [m[1], m[2]])));
const all = Object.values(groups).flat();
assert.deepEqual([...all].sort(), Object.keys(files).sort(), "every clip has exactly one independently specified category");
const TRACK = "old_tower_inn_loop.mp3";
const KEY = "emberisle-sound-mix";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const closeTo = (actual, expected, why) => assert.ok(Math.abs(actual - expected) < 1e-9, `${why}: ${actual} vs ${expected}`);
const ok = (what) => console.log(`ok ${what}`);
const vite = await createServer({
  server: { host: "127.0.0.1", port: 0 }, logLevel: "error",
  plugins: [{ name: "mixer-proof-page", configureServer(server) {
    server.middlewares.use("/__mixer-proof", (_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><title>Mixer proof</title><script type="module">window.sound=await import("/src/lib/sound.ts");window.mix=await import("/src/lib/sound-settings.ts");</script>');
    });
  } }],
});
let browser;
const errors = [];
try {
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (e) => { if (e.type() === "error") errors.push(e.text()); });
  await page.addInitScript(() => {
    window.__audios = [];
    window.__plays = [];
    window.Audio = class extends EventTarget {
      constructor(src) { super(); this.src = src.split("/").at(-1); this.volume = 1; this.currentTime = 0; this.paused = true; this.ended = false; window.__audios.push(this); }
      play() { this.paused = false; this.ended = false; window.__plays.push({ file: this.src, volume: this.volume }); this.dispatchEvent(new Event("play")); return Promise.resolve(); }
      pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
    };
  });
  const load = async () => { await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__mixer-proof`); await page.waitForFunction(() => window.sound && window.mix); };
  const clear = () => page.evaluate(() => { window.__plays = []; });
  const plays = () => page.evaluate(() => window.__plays);
  const audio = (file) => page.evaluate((f) => { const a = window.__audios.find((x) => x.src === f); return a && { volume: a.volume, paused: a.paused, loop: a.loop }; }, file);
  const reset = () => page.evaluate(() => {
    window.mix.setMasterVolume(1);
    for (const c of window.mix.SOUND_CATEGORIES) { window.mix.setCategoryVolume(c, 1); window.mix.setCategoryMuted(c, false); }
    window.sound.setMuted(false); window.sound.setMusicOn(true); window.sound.setMusicWanted(false);
  });
  await load();
  await page.evaluate(() => { window.sound.play("dice_land"); window.sound.playLater("end_music", 0.5, 10); window.sound.setMusicWanted(true); });
  await sleep(50);
  assert.deepEqual(await plays(), [], "no clip or music starts before a gesture");
  assert.equal(await page.evaluate(() => window.__audios.length), 0, "no audio constructed before unlock");
  await page.evaluate(() => window.sound.setMusicWanted(false));
  await page.keyboard.press("Shift");
  ok("autoplay gate covers immediate, delayed and background playback");

  // Distinct channel gains catch an incorrectly classified clip; compare all FILES keys, including shared WAVs.
  const levels = { game: 0.2, touch: 0.4, memes: 0.6, music: 0.8 };
  await page.evaluate((levels) => { window.mix.setMasterVolume(0.5); for (const [c, v] of Object.entries(levels)) window.mix.setCategoryVolume(c, v); }, levels);
  for (const [category, names] of Object.entries(groups)) {
    for (const name of names) {
      await clear();
      assert.equal(await page.evaluate((n) => window.sound.soundCategory(n), name), category, `${name} category`);
      await page.evaluate((n) => window.sound.play(n, 0.7), name);
      await page.waitForFunction(() => window.__plays.length === 1);
      const [heard] = await plays();
      assert.equal(heard.file, files[name], `${name} actual file`);
      closeTo(heard.volume, 0.5 * levels[category] * 0.7, `${name} master × category × clip`);
      await sleep(170); // Preserve the existing 150 ms pacing and burst guards.
    }
  }
  ok(`all ${all.length} clips have one category and use master × category × clip`);

  await reset();
  const representatives = { game: "dice_land", touch: "tap_fields", memes: "sb_airhorn", music: "end_music" };
  for (const muted of Object.keys(groups)) {
    await page.evaluate((c) => window.mix.setCategoryMuted(c, true), muted);
    await clear();
    await page.evaluate((names) => { for (const n of names) window.sound.play(n, 0.5); }, Object.values(representatives));
    await sleep(700);
    assert.deepEqual((await plays()).map((p) => p.file).sort(), Object.entries(representatives).filter(([c]) => c !== muted).map(([, n]) => files[n]).sort(), `${muted} mute silences only its category`);
    await page.evaluate((c) => window.mix.setCategoryMuted(c, false), muted);
  }
  ok("each category mute silences only its own new requests");

  // Changes apply to elements already playing, preserving their requested (clip) gains.
  const before = await audio(files.dice_land);
  await page.evaluate(() => window.mix.setCategoryVolume("game", 0.4));
  closeTo((await audio(files.dice_land)).volume, 0.2, "active core clip updates");
  closeTo((await audio(files.tap_fields)).volume, 0.5, "unrelated touch clip keeps its gain");
  assert.equal(before.paused, false);
  await page.evaluate(() => window.sound.setMuted(true));
  assert.ok(await page.evaluate(() => window.__audios.every((a) => a.paused || a.volume === 0)), "master mute silences every already playing element");
  await clear();
  await page.evaluate(() => window.sound.play("ui_click"));
  assert.deepEqual(await plays(), [], "master mute suppresses new requests");
  await page.evaluate(() => window.sound.setMuted(false));
  closeTo((await audio(files.dice_land)).volume, 0.2, "unmute restores category × clip gain");
  await page.evaluate(() => window.mix.setMasterVolume(0));
  await clear();
  await page.evaluate(() => window.sound.play("ui_click"));
  assert.deepEqual(await plays(), [], "zero master volume suppresses new requests");
  assert.ok(await page.evaluate(() => window.__audios.every((a) => a.paused || a.volume === 0)), "zero master volume silences active elements");
  ok("active elements respond immediately to category volume and master mute/zero");

  await reset();
  await clear();
  await page.evaluate(() => {
    window.sound.play("ui_click"); window.sound.play("path_place", 0.5);
    window.mix.setMasterVolume(0.4); window.mix.setCategoryVolume("game", 0.5);
  });
  await page.waitForFunction(() => window.__plays.length === 2);
  closeTo((await plays())[1].volume, 0.1, "queued clip uses the latest gain");
  await sleep(180);
  await clear();
  await page.evaluate(() => { window.sound.play("ui_back"); window.sound.play("outpost_place"); window.mix.setCategoryMuted("game", true); });
  await sleep(350);
  assert.deepEqual((await plays()).map((p) => p.file), [files.ui_back], "queued clip cannot escape a later category mute");
  await page.evaluate(() => window.mix.setCategoryMuted("game", false));
  await clear();
  await page.evaluate(() => { window.sound.playLater("end_music", 0.5, 100); window.mix.setMasterVolume(0.6); window.mix.setCategoryVolume("music", 0.4); });
  await page.waitForFunction(() => window.__plays.length === 1);
  closeTo((await plays())[0].volume, 0.12, "delayed clip uses current mixer gain");
  await clear();
  await page.evaluate(() => { window.sound.playLater("game_start", 0.5, 100); window.mix.setCategoryMuted("music", true); });
  await sleep(300);
  assert.deepEqual(await plays(), [], "delayed clip cannot escape a later category mute");
  ok("queued/delayed clips use current settings and remain silent after a category mute");

  await reset();
  await page.evaluate((names) => { for (const n of names) window.sound.stop(n); window.mix.setMasterVolume(0.5); window.mix.setCategoryVolume("music", 0.4); window.sound.setMusicWanted(true); }, all);
  closeTo((await audio(TRACK)).volume, 0.05, "background is master × music × BG_VOLUME");
  assert.equal((await audio(TRACK)).loop, true, "background remains a loop");
  await page.evaluate(() => window.mix.setMasterVolume(0.8));
  closeTo((await audio(TRACK)).volume, 0.08, "background gain updates live");
  await page.evaluate(() => window.sound.play("game_start", 0.5));
  await page.waitForFunction((f) => window.__plays.some((p) => p.file === f), files.game_start);
  closeTo((await audio(TRACK)).volume, 0.024, "ducking composes with master and category");
  await page.evaluate(() => window.sound.stop("game_start"));
  closeTo((await audio(TRACK)).volume, 0.08, "cutting a sting restores the mixed background gain");
  await page.evaluate(() => window.sound.play("match_point", 0.5));
  await page.waitForFunction((f) => window.__plays.some((p) => p.file === f), files.match_point);
  closeTo((await audio(TRACK)).volume, 0.024, "audible match-point sting ducks music");
  await page.evaluate(() => window.mix.setCategoryMuted("memes", true));
  closeTo((await audio(files.match_point)).volume, 0, "muting memes silences its active sting");
  closeTo((await audio(TRACK)).volume, 0.08, "an inaudible meme sting cannot keep unrelated music ducked");
  await page.evaluate(() => { window.mix.setCategoryMuted("memes", false); window.sound.stop("match_point"); });
  await page.evaluate(() => window.mix.setCategoryMuted("music", true));
  assert.equal((await audio(TRACK)).paused, true, "music category mute pauses the loop");
  await page.evaluate(() => window.mix.setCategoryMuted("music", false));
  assert.equal((await audio(TRACK)).paused, false, "music category unmute resumes wanted loop");
  await page.evaluate(() => window.sound.setMusicOn(false));
  assert.equal((await audio(TRACK)).paused, true, "legacy Music off still applies");
  await page.evaluate(() => window.mix.setMasterVolume(0.6));
  assert.equal((await audio(TRACK)).paused, true, "changing gains cannot bypass Music off");
  await page.evaluate(() => { window.sound.setMusicOn(true); window.sound.setMuted(true); });
  await page.evaluate(() => window.mix.setMasterVolume(0.8));
  assert.equal((await audio(TRACK)).paused, true, "changing gains cannot bypass master mute");
  await page.evaluate(() => window.sound.setMuted(false));
  assert.equal((await audio(TRACK)).paused, false, "unmuting resumes wanted mixed background");
  ok("background gain, ducking, category mute and legacy music/master switches compose");

  await page.evaluate(() => { window.mix.setCategoryVolume("touch", 0.3); window.mix.setCategoryMuted("memes", true); window.sound.setMuted(true); });
  const persisted = await page.evaluate(() => window.mix.getSoundMix());
  await load();
  assert.deepEqual(await page.evaluate(() => window.mix.getSoundMix()), persisted, "all settings survive reload");
  assert.equal(await page.evaluate(() => window.sound.isMuted()), true, "legacy master mute survives reload");
  await page.evaluate(() => { window.sound.setMuted(false); window.sound.setMusicWanted(true); window.sound.play("dice_land"); });
  assert.deepEqual(await plays(), [], "reload re-arms autoplay despite saved settings");
  await page.keyboard.press("Shift");
  closeTo((await audio(TRACK)).volume, 0.08, "persisted settings apply to the first post-unlock background play");
  await page.evaluate(() => window.sound.play("tap_fields", 0.5));
  await page.waitForFunction((f) => window.__plays.some((p) => p.file === f), files.tap_fields);
  closeTo((await audio(files.tap_fields)).volume, 0.12, "persisted settings apply to first post-unlock touch");
  await clear();
  await page.evaluate(() => window.sound.play("sb_airhorn", 0.4));
  await sleep(200);
  assert.deepEqual(await plays(), [], "persisted category mute applies before the first request");
  // Stable immutable snapshots are safe to hand to the future React sheet.
  assert.equal(await page.evaluate(() => Object.isFrozen(window.mix.getSoundMix()) && Object.isFrozen(window.mix.getSoundMix().game)), true);
  await page.evaluate(() => { window.__notifications = 0; window.__unsubscribe = window.mix.subscribeSoundMix(() => window.__notifications++); window.mix.setCategoryVolume("game", 0.34); window.__unsubscribe(); window.mix.setCategoryVolume("game", NaN); });
  assert.equal(await page.evaluate(() => window.mix.getSoundMix().game.volume), 0.3, "10% steps and invalid setters retain a valid level");
  assert.equal(await page.evaluate(() => window.__notifications), 1, "subscribers receive updates and can unsubscribe");
  ok("per-device persistence, autoplay after reload, immutable snapshots and subscriptions");

  const defaults = { master: 1, ...Object.fromEntries(Object.keys(groups).map((c) => [c, { volume: 1, muted: false }])) };
  for (const bad of ["{", "null", JSON.stringify({ master: "loud", game: { volume: "quiet", muted: "true" } })]) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, bad]);
    await load();
    assert.deepEqual(await page.evaluate(() => window.mix.getSoundMix()), defaults, `invalid storage ${bad} uses safe defaults`);
  }
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ master: 9, game: { volume: -3, muted: true }, music: { volume: 0.36 } })), KEY);
  await load();
  assert.deepEqual(await page.evaluate(() => window.mix.getSoundMix()), { ...defaults, game: { volume: 0, muted: true }, music: { volume: 0.4, muted: false } }, "stored levels clamp, quantize and fill missing categories");
  const isolated = await context.newPage();
  await isolated.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__mixer-proof`);
  await isolated.waitForFunction(() => window.mix);
  assert.equal(await isolated.evaluate(() => window.mix.getSoundMix().game.muted), true, "another page on the same device reads persisted settings");
  await isolated.close();
  const freshContext = await browser.newContext();
  const blocked = await freshContext.newPage();
  blocked.on("pageerror", (e) => errors.push(String(e)));
  await blocked.addInitScript(() => { for (const method of ["getItem", "setItem"]) Storage.prototype[method] = () => { throw new Error("storage blocked"); }; });
  await blocked.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__mixer-proof`);
  await blocked.waitForFunction(() => window.mix);
  assert.deepEqual(await blocked.evaluate(() => window.mix.getSoundMix()), defaults, "blocked/fresh device starts with safe defaults");
  await blocked.evaluate(() => { window.mix.setMasterVolume(0.4); window.mix.setCategoryMuted("game", true); });
  assert.equal(await blocked.evaluate(() => window.mix.getSoundMix().master), 0.4, "blocked storage does not break in-memory settings");
  assert.equal(await blocked.evaluate(() => window.mix.getSoundMix().game.muted), true);
  await freshContext.close();
  ok("invalid/partial/blocked storage is safe and settings remain per device");
  assert.deepEqual(errors, [], "zero browser errors");
  console.log("sound-mixer-prove ok");
} finally {
  await browser?.close();
  await vite.close();
}
