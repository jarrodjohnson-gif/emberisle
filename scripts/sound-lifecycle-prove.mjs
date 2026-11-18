// Deterministic Node proof for sound and sea-setting lifecycle guards (src/lib/sound.ts, src/lib/sea-setting.ts):
// 1. setMusicOn(false) silences active music stings, stops end_music, cancels pending playLater("end_music"),
//    and syncVolumes() keeps music stings silent while bgOn is false.
// 2. Lazy sound-extra import respects stop() while in flight and swallows load failures without unhandled rejections.
// 3. Lazy ambience import reads the live ambience level on resolution so muting during load never passes a stale level.
// 4. setSeaVolume() ignores non-finite values (NaN, Infinity, -Infinity) without poisoning state or localStorage.
// Run: npm run sound-lifecycle-prove
import assert from "node:assert/strict";
import { createServer } from "vite";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(pred, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(5);
  }
}
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function makeEnv() {
  const store = new Map();
  const winListeners = new Map();
  const audios = [];
  const plays = [];
  class MockAudio extends EventTarget {
    constructor(src) {
      super();
      this.src = src.split("/").at(-1);
      this.volume = 1;
      this.currentTime = 0;
      this.paused = true;
      this.ended = false;
      this.loop = false;
      this.error = null;
      audios.push(this);
    }
    play() {
      this.paused = false;
      this.ended = false;
      plays.push({ file: this.src, volume: this.volume });
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      this.dispatchEvent(new Event("pause"));
    }
  }
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const window = {
    addEventListener(type, fn, opts) {
      const list = winListeners.get(type) ?? [];
      list.push({ fn, once: !!opts?.once });
      winListeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = winListeners.get(type);
      if (list) winListeners.set(type, list.filter((e) => e.fn !== fn));
    },
    dispatch(type) {
      const list = [...(winListeners.get(type) ?? [])];
      for (const entry of list) {
        if (entry.once) window.removeEventListener(type, entry.fn);
        entry.fn();
      }
    },
  };
  globalThis.window = window;
  globalThis.localStorage = localStorage;
  globalThis.Audio = MockAudio;
  return { store, audios, plays, window };
}

async function runCase(virtualModules, fn) {
  const env = makeEnv();
  const vite = await createServer({
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
    plugins: [
      {
        name: "sound-lifecycle-mocks",
        enforce: "pre",
        resolveId(source) {
          if (source === "./sound-extra" && virtualModules.soundExtra) return "\0mock-sound-extra";
          if (source === "./ambience" && virtualModules.ambience) return "\0mock-ambience";
          return null;
        },
        load(id) {
          if (id === "\0mock-sound-extra") return virtualModules.soundExtra;
          if (id === "\0mock-ambience") return virtualModules.ambience;
          return null;
        },
      },
    ],
  });
  try {
    const sound = await vite.ssrLoadModule("/src/lib/sound.ts");
    const mix = await vite.ssrLoadModule("/src/lib/sound-settings.ts");
    const sea = await vite.ssrLoadModule("/src/lib/sea-setting.ts");
    await fn({ sound, mix, sea, env });
  } finally {
    await vite.close();
  }
}

let checks = 0;
const ok = (msg) => { checks++; console.log(`ok   ${msg}`); };

// Case 1: setMusicOn(false) silences active music stings, stops end_music, cancels playLater("end_music"),
// and keeps music stings silent across volume changes while bgOn is false.
await runCase(
  { ambience: "export function sync() {}" },
  async ({ sound, mix, env }) => {
    env.window.dispatch("pointerdown");
    sound.play("game_start", 1);
    await sleep(170);
    sound.play("end_music", 1);
    await sleep(170);
    sound.play("dice_land", 0.5);
    await sleep(170);

    const startClip = env.audios.find((a) => a.src === "game_start.mp3");
    const endClip = env.audios.find((a) => a.src === "end_music.mp3");
    const diceClip = env.audios.find((a) => a.src === "drop_001.wav");
    assert.ok(startClip && endClip && diceClip, "initial clips constructed");
    assert.equal(startClip.volume, 1, "game_start starts at volume 1");
    assert.equal(endClip.paused, false, "end_music starts playing");
    assert.equal(diceClip.volume, 0.5, "dice_land starts at volume 0.5");

    endClip.currentTime = 4.2;
    sound.setMusicOn(false);
    assert.equal(endClip.paused, true, "setMusicOn(false) pauses active end_music");
    assert.equal(endClip.currentTime, 0, "setMusicOn(false) rewinds end_music");
    assert.equal(startClip.volume, 0, "setMusicOn(false) silences active game_start sting");
    assert.equal(diceClip.volume, 0.5, "setMusicOn(false) leaves non-music clips untouched");

    mix.setMasterVolume(0.8);
    assert.equal(startClip.volume, 0, "syncVolumes keeps music stings silent while music is off");
    assert.ok(Math.abs(diceClip.volume - 0.4) < 1e-9, "syncVolumes still scales non-music clips");
    ok("setMusicOn(false) silences active music stings and stops end_music");

    // Pending playLater("end_music") is cancelled by setMusicOn(false), even if toggled back on before timer fires.
    sound.setMusicOn(true);
    env.plays.length = 0;
    sound.playLater("end_music", 1, 35);
    sound.setMusicOn(false);
    sound.setMusicOn(true);
    await sleep(80);
    assert.equal(env.plays.some((p) => p.file === "end_music.mp3"), false, "setMusicOn(false) cancels pending playLater end_music");
    ok("setMusicOn(false) cancels pending playLater end_music");
  },
);

// Case 2a: stop() during in-flight lazy sound-extra import suppresses late playback.
{
  let resolveExtra;
  globalThis.__extraStarted = false;
  globalThis.__extraEvaluated = false;
  globalThis.__extraPromise = new Promise((r) => { resolveExtra = r; });
  await runCase(
    {
      ambience: "export function sync() {}",
      soundExtra: `globalThis.__extraStarted = true; await globalThis.__extraPromise; globalThis.__extraEvaluated = true; export const EXTRA_FILES = { isaac_win: "isaac_win.mp3" };`,
    },
    async ({ sound, env }) => {
      env.window.dispatch("pointerdown");
      sound.play("isaac_win", 1);
      await waitUntil(() => globalThis.__extraStarted, "sound-extra import to start");
      sound.stop("isaac_win");
      resolveExtra();
      await waitUntil(() => globalThis.__extraEvaluated, "sound-extra chunk evaluation");
      await settle();
      assert.equal(env.plays.some((p) => p.file === "isaac_win.mp3"), false, "stopped lazy extra clip does not play after chunk resolves");
      // Subsequent play works now that EXTRA_FILES is cached.
      await sleep(170);
      sound.play("isaac_win", 1);
      await waitUntil(() => env.plays.some((p) => p.file === "isaac_win.mp3"), "cached extra clip playback");
      assert.equal(env.plays.some((p) => p.file === "isaac_win.mp3"), true, "cached extra clip plays on later request");
      ok("stop() cancels in-flight lazy sound-extra playback");
    },
  );
  delete globalThis.__extraStarted;
  delete globalThis.__extraEvaluated;
  delete globalThis.__extraPromise;
}

// Case 2b: rejected lazy sound-extra import produces zero unhandled rejections.
{
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(String(reason));
  process.on("unhandledRejection", onUnhandled);
  globalThis.__extraThrew = false;
  try {
    await runCase(
      {
        ambience: "export function sync() {}",
        soundExtra: `globalThis.__extraThrew = true; throw new Error("simulated offline chunk failure");`,
      },
      async ({ sound, env }) => {
        env.window.dispatch("pointerdown");
        sound.play("isaac_win", 1);
        await waitUntil(() => globalThis.__extraThrew, "sound-extra rejection to throw");
        await settle();
        await sleep(25);
        assert.deepEqual(unhandled, [], "rejected sound-extra import produces no unhandled rejection");
        assert.equal(env.plays.length, 0, "failed sound-extra chunk stays silent");
        ok("failed lazy sound-extra import stays silent with zero unhandled rejections");
      },
    );
  } finally {
    process.off("unhandledRejection", onUnhandled);
    delete globalThis.__extraThrew;
  }
}

// Case 3: muting / turning off sea sounds while ambience chunk is loading never delivers stale non-zero level.
{
  let resolveAmb;
  globalThis.__ambStarted = false;
  globalThis.__ambEvaluated = false;
  globalThis.__ambPromise = new Promise((r) => { resolveAmb = r; });
  globalThis.__ambSyncCalls = [];
  await runCase(
    {
      ambience: `globalThis.__ambStarted = true; await globalThis.__ambPromise; globalThis.__ambEvaluated = true; export function sync(level) { globalThis.__ambSyncCalls.push(level); }`,
    },
    async ({ sea, env }) => {
      env.window.dispatch("pointerdown");
      await waitUntil(() => globalThis.__ambStarted, "ambience import to start");
      sea.setSeaSounds(false);
      resolveAmb();
      await waitUntil(() => globalThis.__ambEvaluated && globalThis.__ambSyncCalls.length >= 1, "ambience sync on resolution");
      await settle();
      assert.ok(globalThis.__ambSyncCalls.length >= 1, "ambience sync ran on resolution");
      assert.ok(globalThis.__ambSyncCalls.every((lvl) => lvl === 0), `ambience never received stale positive level: ${JSON.stringify(globalThis.__ambSyncCalls)}`);
      const beforeEnable = globalThis.__ambSyncCalls.length;
      sea.setSeaSounds(true);
      await waitUntil(() => globalThis.__ambSyncCalls.length > beforeEnable, "ambience sync after enabling sea sounds");
      assert.ok(Math.abs(globalThis.__ambSyncCalls.at(-1) - 0.12) < 1e-9, "enabling sea sounds later passes 0.12");
      ok("in-flight ambience import reads live level instead of stale 0.12");
    },
  );
  delete globalThis.__ambStarted;
  delete globalThis.__ambEvaluated;
  delete globalThis.__ambPromise;
  delete globalThis.__ambSyncCalls;
}

// Case 4: setSeaVolume ignores NaN / Infinity / -Infinity without poisoning state or localStorage.
await runCase(
  { ambience: "export function sync() {}" },
  async ({ sea, env }) => {
    sea.setSeaVolume(0.4);
    assert.equal(sea.getSeaVolume(), 0.4, "valid sea volume sets 0.4");
    assert.equal(env.store.get("emberisle-sea-volume"), "4", "valid sea volume persists step 4");
    let notified = 0;
    const unsub = sea.subscribeSeaSounds(() => { notified++; });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      sea.setSeaVolume(bad);
      assert.equal(sea.getSeaVolume(), 0.4, `setSeaVolume(${bad}) keeps 0.4`);
      assert.equal(env.store.get("emberisle-sea-volume"), "4", `setSeaVolume(${bad}) does not poison storage`);
    }
    unsub();
    assert.equal(notified, 0, "non-finite setSeaVolume calls do not notify subscribers");
    ok("setSeaVolume ignores non-finite values without poisoning state or storage");
  },
);

console.log(`sound-lifecycle-prove: ${checks} checks passed`);
