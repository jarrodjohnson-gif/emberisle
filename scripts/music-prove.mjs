// #814: the gameplay background music (docs/design/sound.md, "Game music"). Headless Chromium on the practice table, with real
// audio elements (every `new Audio` is recorded so the proof can read the track's paused, volume, loop and currentTime).
// - nothing is requested or played before the first press or key, even on the play screen;
// - after it the track plays at 0.25, loops (seek to the end, it wraps and keeps playing) and the lobby counts as a play screen;
// - game_start ducks it to 30% (0.075) and its end, and a cut-off sting, restore 0.25;
// - mute stops it and unmuting resumes it, the same for a watcher; the Music toggle stops and resumes it and is remembered;
// - the win screen stops it (a rematch brings it back), and so does leaving to the title.
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
  await page.getByRole("button", { name: "Table menu" }).first().click().catch(() => {});
  const row = page.getByTestId("music-toggle");
  if (await row.count()) {
    await row.click();
    assert.equal(await playing(), false, "the menu row switches it off");
    await row.click();
    await until(playing, "the menu row switches it on");
    ok("the Table menu's Music row switches it off and on");
  } else console.log("note: Table menu not opened in this layout; toggle covered through the module");

  // ---- The lobby counts, the win screen stops it, a rematch resumes it, the title stops it.
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
  await page.evaluate(() => window.__emberisle.getState().goTitle());
  await until(async () => (await track()).paused, "stopped on the title");
  assert.equal((await track()).t, 0, "rewound on leaving");
  ok("it stops when you leave to the title");

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
