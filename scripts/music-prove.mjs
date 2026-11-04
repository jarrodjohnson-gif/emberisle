// #814: the gameplay background music (docs/design/sound.md, "Game music"). Headless Chromium on the practice table, with real
// audio elements (every `new Audio` is recorded so the proof can read the track's paused, volume, loop and currentTime).
// - nothing is requested or played before the first press or key, even on the play screen;
// - after it the track plays at 0.25, loops (seek to the end, it wraps and keeps playing) and the lobby counts as a play screen;
// - game_start ducks it to 30% (0.075) and its end, and a cut-off sting, restore 0.25;
// - mute stops it and unmuting resumes it, the same for a watcher; the Music toggle stops and resumes it and is remembered;
// - the win screen stops it (a rematch brings it back). Returning to the title keeps the same track playing (#1279).
// - on a fresh title, one tap starts it; the lobby keeps that same element; Music off never creates it; the title's
//   sound button mutes it and unmuting resumes it.
// - one fresh run goes title, lobby, then the practice start: the same element fires play once, never pause, and
//   does not rewind across that start, the game_start sting, and the first roll (#1279).
// Zero console errors. Run: npm run music-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8121;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const requests = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (what) => console.log(`ok ${what}`);
const TRACK = "old_tower_inn_loop.mp3";

async function until(check, what, ms = 15_000) {
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
  const page = await (await browser.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await page.addInitScript(() => {
    window.__audios = [];
    const Real = window.Audio;
    window.Audio = function (src) {
      const a = new Real(src);
      window.__audios.push(a);
      return a;
    };
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle);
  // The track as the page sees it, or null before the page has asked for it.
  const track = () =>
    page.evaluate((f) => {
      const a = window.__audios.find((x) => x.src.endsWith(f));
      return a && { paused: a.paused, volume: a.volume, loop: a.loop, t: a.currentTime, d: a.duration, ended: a.ended };
    }, TRACK);
  const sound = (fn, arg) => page.evaluate(async ([f, a]) => { const m = await import("/src/lib/sound.ts"); return new Function("m", "a", `return (${f})(m, a)`)(m, a); }, [fn.toString(), arg]);
  const set = (patch) => page.evaluate((p) => window.__emberisle.setState(p), patch);
  const playing = async () => { const t = await track(); return !!t && !t.paused; };

  // ---- Before the first interaction: the play screen, and still nothing asked for or played.
  await page.evaluate(() => window.__emberisle.getState().startAi());
  await page.waitForFunction(() => window.__emberisle.getState().screen === "play");
  await sleep(1200);
  assert.equal(await track(), undefined, "no track element before the first interaction");
  assert.ok(!requests.some((r) => r.endsWith(TRACK)), "the track is not fetched before the first interaction");
  ok("nothing is requested or played before the first interaction, on the play screen");

  // ---- After it: plays quietly and loops.
  await page.keyboard.press("Shift");
  await until(playing, "the track plays after the first key");
  let t = await track();
  assert.equal(t.volume, 0.25, "volume 0.25");
  assert.equal(t.loop, true, "loop on");
  const t0 = (await track()).t;
  await until(async () => (await track()).t > t0 + 0.3, "currentTime advances");
  ok(`the track plays at ${t.volume}, loop=${t.loop}, and its clock advances`);
  t = await until(async () => { const x = await track(); return x.d > 10 && x; }, "the loop file decoded to its full length");
  await page.evaluate(([f, d]) => { const a = window.__audios.find((x) => x.src.endsWith(f)); a.currentTime = d - 0.6; }, [TRACK, t.d]);
  await until(async () => { const x = await track(); return x.t < 3 && !x.paused && !x.ended; }, "the track wraps to the start and keeps playing");
  ok("it loops: seeking to the last 0.6 s wraps to the start, still playing");

  // ---- Ducking under the game's own stings.
  await sound((m) => m.play("game_start", 0.5));
  await until(async () => (await track()).volume < 0.1, "ducked while game_start plays");
  t = await track();
  assert.ok(Math.abs(t.volume - 0.075) < 1e-9, `ducked to 30% (0.075), got ${t.volume}`);
  assert.ok(!t.paused, "still playing while ducked");
  ok(`game_start ducks it to ${t.volume}`);
  await until(async () => (await track()).volume === 0.25, "restored after game_start ends", 30_000);
  ok("the volume is back to 0.25 when game_start ends");
  await sleep(300);
  await sound((m) => m.play("game_lose", 0.5));
  await until(async () => (await track()).volume < 0.1, "ducked while game_lose plays");
  await sound((m) => m.stop("game_lose"));
  await until(async () => (await track()).volume === 0.25, "restored when the sting is cut off");
  ok("a cut-off sting restores it too");

  // ---- Mute, and the Music toggle.
  await sound((m) => m.setMuted(true));
  assert.equal(await playing(), false, "muted: stopped");
  await sleep(300);
  await sound((m) => m.setMuted(false));
  await until(playing, "unmuting resumes it");
  ok("mute stops it, unmuting resumes it");
  await set({ spectator: true });
  await sound((m) => m.setMuted(true));
  assert.equal(await playing(), false, "a muted watcher hears no music");
  await sound((m) => m.setMuted(false));
  await until(playing, "the watcher's unmute resumes it");
  await set({ spectator: false });
  ok("a watcher follows the same mute rule");
  await sound((m) => m.setMusicOn(false));
  assert.equal(await playing(), false, "Music off: stopped");
  assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-music")), "0", "the choice is remembered");
  await sound((m) => m.setMusicOn(true));
  await until(playing, "Music on resumes it");
  ok("the Music toggle stops and resumes it, and is stored");

  // ---- The Table menu's row drives the same switch.
  await page.getByRole("button", { name: "Table menu" }).first().click();
  const row = page.getByTestId("music-toggle");
  await row.waitFor({ timeout: 5000 });
  await row.click();
  assert.equal(await playing(), false, "the menu row switches it off");
  await row.click();
  await until(playing, "the menu row switches it on");
  ok("the Table menu's Music row switches it off and on");

  // ---- The lobby counts, the win screen stops it, a rematch resumes it, the title keeps the same track (#1279).
  await set({ screen: "lobby" });
  await sleep(300);
  assert.equal(await playing(), true, "plays in the lobby");
  await set({ screen: "play" });
  const phase = await page.evaluate(() => window.__emberisle.getState().state.phase);
  await page.evaluate(() => { const s = window.__emberisle.getState().state; window.__phase = s.phase; window.__emberisle.setState({ state: { ...s, phase: "over", winner: s.players[0].id } }); });
  await until(async () => !(await playing()), "stopped at the win screen");
  ok("it stops at the win screen");
  await page.evaluate((p) => { const s = window.__emberisle.getState().state; window.__emberisle.setState({ state: { ...s, phase: p, winner: null } }); }, phase);
  await until(playing, "a rematch brings it back");
  ok("it comes back when the game leaves the win screen");
  await page.evaluate((f) => {
    const a = window.__audios.find((x) => x.src.endsWith(f));
    a.currentTime = 20;
    a.dataset.ember = "held";
  }, TRACK);
  await page.evaluate(() => window.__emberisle.getState().goTitle());
  await sleep(400);
  const onTitle = await track();
  assert.equal(onTitle.paused, false, "still playing on the title");
  assert.ok(onTitle.t > 15, `the title did not rewind it (t=${onTitle.t})`);
  assert.equal(await page.evaluate((f) => window.__audios.find((x) => x.src.endsWith(f)).dataset.ember, TRACK), "held", "the same element is still the one that was playing");
  ok("returning to the title keeps the same track playing");
  await page.evaluate(() => window.__emberisle.getState().startAi());
  await until(playing, "a new game from the title keeps it playing");
  assert.equal(await page.evaluate((f) => window.__audios.filter((x) => x.src.endsWith(f)).length, TRACK), 1, "one track element after a title and game round trip");
  ok("a title and game round trip reuses the one track element");

  // ---- A fresh title: nothing until one tap, then the lobby continues that same play. Mute, and Music off.
  const stub = () => {
    window.__audios = [];
    const Real = window.Audio;
    window.Audio = function (src) {
      const a = new Real(src);
      window.__audios.push(a);
      return a;
    };
  };
  const titlePage = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const titleReqs = [];
  titlePage.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  titlePage.on("pageerror", (e) => errors.push(String(e)));
  titlePage.on("request", (r) => titleReqs.push(new URL(r.url()).pathname));
  await titlePage.addInitScript(stub);
  await titlePage.goto(`http://127.0.0.1:${PORT}/`);
  await titlePage.waitForFunction(() => window.__emberisle);
  await titlePage.getByTestId("title-card").waitFor();
  await sleep(800);
  const titleTrack = () => titlePage.evaluate((f) => {
    const a = window.__audios.find((x) => x.src.endsWith(f));
    return a && { paused: a.paused, t: a.currentTime };
  }, TRACK);
  assert.equal(await titleTrack(), undefined, "no track element on the title before a tap");
  assert.ok(!titleReqs.some((r) => r.endsWith(TRACK)), "the track is not fetched on the title before a tap");
  await titlePage.mouse.click(8, 8);
  await until(async () => { const x = await titleTrack(); return !!x && !x.paused; }, "the track plays on the title after one tap");
  await until(async () => (await titleTrack()).t > 0.2, "the title clock advances");
  const atTitle = (await titleTrack()).t;
  await titlePage.getByTestId("sound-toggle").click();
  await until(async () => (await titleTrack()).paused, "the title sound button mutes it");
  await titlePage.getByTestId("sound-toggle").click();
  await until(async () => { const x = await titleTrack(); return !!x && !x.paused; }, "the title sound button resumes it");
  await titlePage.evaluate(() => window.__emberisle.setState({ screen: "lobby" }));
  await sleep(400);
  const inLobby = await titleTrack();
  assert.equal(inLobby.paused, false, "still playing in the lobby");
  assert.ok(inLobby.t + 0.05 >= atTitle, `the lobby did not restart it (title ${atTitle}, lobby ${inLobby.t})`);
  assert.equal(await titlePage.evaluate((f) => window.__audios.filter((x) => x.src.endsWith(f)).length, TRACK), 1, "one track element from the title into the lobby");
  ok("one tap on the title starts the track; mute works; the lobby keeps that play");

  // ---- Title, lobby, then the practice start: one play, no pause, no rewind, through the sting and the first roll.
  const contPage = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  contPage.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  contPage.on("pageerror", (e) => errors.push(String(e)));
  await contPage.addInitScript(() => {
    window.__audios = [];
    const Real = window.Audio;
    window.Audio = function (src) {
      const a = new Real(src);
      a.__plays = 0;
      a.__pauses = 0;
      a.__last = 0;
      a.__rewound = false;
      a.addEventListener("play", () => { a.__plays += 1; });
      a.addEventListener("pause", () => { a.__pauses += 1; });
      const note = () => {
        if (a.currentTime + 0.15 < a.__last) a.__rewound = true;
        if (a.currentTime > a.__last) a.__last = a.currentTime;
      };
      a.addEventListener("timeupdate", note);
      a.addEventListener("seeked", note);
      window.__audios.push(a);
      return a;
    };
  });
  await contPage.goto(`http://127.0.0.1:${PORT}/`);
  await contPage.waitForFunction(() => window.__emberisle);
  await contPage.getByTestId("title-card").waitFor();
  const contTrack = () => contPage.evaluate((f) => {
    const a = window.__audios.find((x) => x.src.endsWith(f));
    return a && { paused: a.paused, t: a.currentTime, plays: a.__plays, pauses: a.__pauses, rewound: a.__rewound, volume: a.volume };
  }, TRACK);
  await contPage.mouse.click(8, 8);
  await until(async () => { const x = await contTrack(); return !!x && !x.paused && x.plays === 1; }, "one play starts the track on the title");
  await contPage.evaluate((f) => { window.__audios.find((x) => x.src.endsWith(f)).dataset.ember = "held"; }, TRACK);
  const atContTitle = await contTrack();
  await contPage.evaluate(() => window.__emberisle.setState({ screen: "lobby" }));
  await sleep(400);
  const atContLobby = await contTrack();
  assert.equal(atContLobby.paused, false, "still playing in the lobby before Start");
  assert.equal(atContLobby.plays, 1, "the lobby does not start the track again");
  assert.equal(atContLobby.pauses, 0, "the lobby does not pause the track");
  assert.equal(atContLobby.rewound, false, "the lobby does not rewind the track");
  assert.ok(atContLobby.t + 0.05 >= atContTitle.t, `lobby time went back (title ${atContTitle.t}, lobby ${atContLobby.t})`);
  await contPage.evaluate(() => window.__emberisle.getState().startAi());
  await until(async () => {
    const sting = await contPage.evaluate(() => {
      const a = window.__audios.find((x) => x.src.endsWith("game_start.mp3"));
      return !!a && !a.paused && !a.ended;
    });
    const x = await contTrack();
    return sting && x && !x.paused && x.volume < 0.1;
  }, "game_start ducks the track after Start");
  const duringSting = await contTrack();
  assert.equal(duringSting.plays, 1, "the sting does not play the track a second time");
  assert.equal(duringSting.pauses, 0, "the sting does not pause the track");
  assert.equal(duringSting.rewound, false, "the sting does not rewind the track");
  const started = await contPage.evaluate(async () => {
    const ai = await import("/src/lib/game/ai.ts");
    for (let i = 0; i < 40; i++) {
      const st = window.__emberisle.getState().state;
      if (!st) throw new Error("no game");
      if (st.phase === "roll") {
        const rolled = window.__emberisle.getState().dispatch({ type: "roll" }, st.current, true);
        if (!rolled.ok) throw new Error(rolled.error || "roll failed");
        const after = window.__emberisle.getState().state;
        return { rolls: after.rolls, phase: after.phase, screen: window.__emberisle.getState().screen };
      }
      const actor = st.current;
      const action = ai.chooseBotAction(st, actor);
      if (!action) throw new Error(`stuck in ${st.phase} for ${actor}`);
      const result = window.__emberisle.getState().dispatch(action, actor, true);
      if (!result.ok) throw new Error(result.error || `could not ${action.type}`);
    }
    throw new Error("never reached the first roll");
  });
  assert.equal(started.screen, "play", "Start left the lobby for the table");
  assert.ok(started.rolls >= 1, "the first roll happened");
  const afterStart = await contTrack();
  assert.equal(afterStart.plays, 1, "Start does not play the track a second time");
  assert.equal(afterStart.pauses, 0, "Start, the sting and the first roll never pause the track");
  assert.equal(afterStart.rewound, false, "Start does not rewind the track");
  assert.ok(afterStart.t + 0.05 >= atContLobby.t, `time went back at Start (lobby ${atContLobby.t}, play ${afterStart.t})`);
  assert.equal(await contPage.evaluate((f) => window.__audios.filter((x) => x.src.endsWith(f)).length, TRACK), 1, "one track element from the title through the first roll");
  assert.equal(await contPage.evaluate((f) => window.__audios.find((x) => x.src.endsWith(f)).dataset.ember, TRACK), "held", "the same element is still the one from the title");
  ok("title to lobby to Start keeps one play through the sting and the first roll");

  const offContext = await browser.newContext();
  const offPage = await offContext.newPage();
  const offReqs = [];
  offPage.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  offPage.on("pageerror", (e) => errors.push(String(e)));
  offPage.on("request", (r) => offReqs.push(new URL(r.url()).pathname));
  await offPage.addInitScript(() => {
    localStorage.setItem("emberisle-music", "0");
    window.__audios = [];
    const Real = window.Audio;
    window.Audio = function (src) {
      const a = new Real(src);
      window.__audios.push(a);
      return a;
    };
  });
  await offPage.goto(`http://127.0.0.1:${PORT}/`);
  await offPage.waitForFunction(() => window.__emberisle);
  await offPage.getByTestId("title-card").waitFor();
  await offPage.mouse.click(8, 8);
  await sleep(800);
  assert.equal(await offPage.evaluate((f) => window.__audios.some((x) => x.src.endsWith(f))), false, "Music off: no track element after a tap");
  assert.ok(!offReqs.some((r) => r.endsWith(TRACK)), "Music off: the track is never fetched");
  ok("with the saved music setting off, a tap on the title never starts it");

  assert.deepEqual(errors, [], "no console errors");
  ok("zero console errors");
  console.log("music-prove: pass");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  process.exit(code);
}
