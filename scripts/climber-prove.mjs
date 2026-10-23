// #966: the ore climber starts at the foot when the match starts, climbs, and reaches the summit (or falls).
// Sample at fixed board ages (not wall-clock waits). Title/lobby hold age at 0; reduced motion holds still.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = Number(process.env.VITE_PORT) || 8196;
const outDir = "test-results/climber";
mkdirSync(outDir, { recursive: true });

const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const errors = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) errors.push(name);
};

const climberAt = () =>
  page.evaluate(() => {
    const jelly = window.__isle.jellyBoard;
    if (!jelly) return null;
    const tile = [...jelly.byHex.values()].find((e) => e.k.kind === "ore")?.k.tile;
    if (!tile) return null;
    let c = null;
    tile.group.traverse((o) => {
      if (o.userData?.ref === "climber") c = o;
    });
    if (!c) return null;
    const p0 = tile.layout.peaks[0];
    const baseY = 0.29; // block + typical ground; only used for relative climb
    return {
      age: jelly.age(),
      envAge: tile.env.age ?? null,
      titleMode: window.__isle.titleMode,
      dist: +Math.hypot(c.position.x - p0.x, c.position.z - p0.z).toFixed(4),
      y: +c.position.y.toFixed(4),
      scaleY: +c.scale.y.toFixed(4),
      sit: c.scale.y < 1,
      peakR: +p0.r.toFixed(4),
      peakH: +p0.h.toFixed(4),
      baseY,
    };
  });

let page;
const screenshotAge = async (age, viewport) => {
  await page.evaluate((age) => {
    const isle = window.__isle;
    isle.renderer.setAnimationLoop(null);
    isle.jellyBoard.setAge(age);
    isle.draw();
    isle.renderer.getContext().finish();
  }, age);
  try {
    const actual = await climberAt();
    check(`screenshot ${viewport}: rendered age ${age}`, actual && actual.age === age && actual.envAge === age, actual);
    await page.screenshot({ path: `${outDir}/play-age${age}-${viewport}.png` });
  } finally {
    await page.evaluate(() => {
      const isle = window.__isle;
      isle.renderer.setAnimationLoop(isle.tick);
      isle.wake();
    });
  }
};
try {
  // --- Title: age stays 0 even as the renderer clock runs ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-jelly", "full");
      localStorage.setItem("emberisle-water", "simple");
    });
    page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.__isle?.landReady && window.__isle.jellyBoard, null, { timeout: 180_000 });
    await page.waitForTimeout(2500);
    const title = await climberAt();
    check("title: board age stays 0", title && title.age === 0 && title.envAge === 0, title);
    check("title: climber at the foot (not on the summit)", title && title.dist > title.peakR * 1.5 && !title.sit, title);
    await page.screenshot({ path: `${outDir}/title-1280x720.png` });
    await ctx.close();
  }

  // --- First game: sample fixed ages ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-jelly", "full");
      localStorage.setItem("emberisle-water", "simple");
    });
    page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();
    await page.waitForFunction(
      () => window.__emberisle.getState().screen === "play" && window.__isle?.landReady && window.__isle.jellyBoard && !window.__isle.titleMode,
      null,
      { timeout: 180_000 },
    );
    // Let a live play frame start t0, then sample via setAge (desk: fixed ages, not wall waits).
    await page.waitForFunction(() => window.__isle.jellyBoard.age() >= 0 && !window.__isle.titleMode);
    await page.waitForTimeout(200);
    const liveStart = await climberAt();
    await page.waitForTimeout(21_000);
    const liveLater = await climberAt();
    check("first game: natural clock advances over at least 20s", liveStart && liveLater && liveLater.age - liveStart.age >= 20, { liveStart, liveLater });
    check("first game: climber naturally leaves the foot and moves up the flank", liveStart && liveLater && liveLater.y > liveStart.y + 0.05 && liveLater.dist < liveStart.dist - 0.05, { liveStart, liveLater });

    const samples = await page.evaluate(() => {
      const jelly = window.__isle.jellyBoard;
      const tile = [...jelly.byHex.values()].find((e) => e.k.kind === "ore").k.tile;
      const p0 = tile.layout.peaks[0];
      const read = () => {
        let c = null;
        tile.group.traverse((o) => {
          if (o.userData?.ref === "climber") c = o;
        });
        return {
          age: jelly.age(),
          dist: +Math.hypot(c.position.x - p0.x, c.position.z - p0.z).toFixed(4),
          y: +c.position.y.toFixed(4),
          sit: c.scale.y < 1,
          peakR: p0.r,
        };
      };
      const out = {};
      for (const a of [0, 4, 20, 100, 160]) {
        jelly.setAge(a);
        out[a] = read();
      }
      return out;
    });
    console.log("ages", JSON.stringify(samples));
    check("age 0: at the foot", samples[0].dist > samples[0].peakR * 1.5 && !samples[0].sit, samples[0]);
    check("age 4: still in gear-out near the foot", samples[4].dist > samples[4].peakR && !samples[4].sit, samples[4]);
    check(
      "age 20: climbing (higher and closer than age 0)",
      samples[20].y > samples[0].y + 0.05 && samples[20].dist < samples[0].dist - 0.05 && !samples[20].sit,
      { a0: samples[0], a20: samples[20] },
    );
    // Age 100: mid-climb or gearing after a fall — never sitting on the summit yet.
    check("age 100: not sitting on the summit", !samples[100].sit, samples[100]);
    // Age 160: either on the summit (sit) or mid/late climb / fall recovery — must have left the foot.
    const late = samples[160];
    check(
      "age 160: left the foot (summit, climb, or fall)",
      late.sit || late.dist < late.peakR * 1.2 || late.y > samples[0].y + 0.15,
      late,
    );
    // If the seeded story reaches the top by 160s without a late fall, he sits.
    if (late.sit) check("age 160: on the summit when seated", late.dist < 0.05, late);

    await screenshotAge(4, "1280x720");
    await screenshotAge(160, "1280x720");

    // Rematch / new deal: a fresh island, climber story restarts at age 0.
    const previousBoard = await page.evaluateHandle(() => window.__isle.jellyBoard);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.waitForFunction(
      (previous) => window.__isle?.landReady && window.__isle.jellyBoard && window.__isle.jellyBoard !== previous,
      previousBoard,
      { timeout: 180_000 },
    );
    await page.waitForTimeout(300);
    const afterRematch = await page.evaluate(() => {
      const jelly = window.__isle.jellyBoard;
      const tile = [...jelly.byHex.values()].find((e) => e.k.kind === "ore").k.tile;
      let c = null;
      tile.group.traverse((o) => {
        if (o.userData?.ref === "climber") c = o;
      });
      const p0 = tile.layout.peaks[0];
      return {
        age: jelly.age(),
        dist: +Math.hypot(c.position.x - p0.x, c.position.z - p0.z).toFixed(4),
        sit: c.scale.y < 1,
        peakR: p0.r,
      };
    });
    check("rematch: natural age below 2s at the foot on a new board", afterRematch.age >= 0 && afterRematch.age < 2 && afterRematch.dist > afterRematch.peakR * 1.5 && !afterRematch.sit, afterRematch);
    await previousBoard.dispose();

    await ctx.close();
  }

  // --- Phone viewport screenshots at two ages ---
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-jelly", "full");
      localStorage.setItem("emberisle-water", "simple");
    });
    page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();
    await page.waitForFunction(() => window.__isle?.landReady && window.__isle.jellyBoard && !window.__isle.titleMode, null, { timeout: 180_000 });
    await screenshotAge(4, "390x844");
    await screenshotAge(160, "390x844");
    await ctx.close();
  }

  // --- Board built after the lobby: start age when play begins, not when the demo aged ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-jelly", "full");
      localStorage.setItem("emberisle-water", "simple");
    });
    page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.__isle?.landReady && window.__isle.jellyBoard, null, { timeout: 180_000 });
    // Linger longer than the allowed initial play age, so a clock started on the title fails.
    await page.waitForTimeout(4000);
    const lingered = await climberAt();
    check("lobby/title linger: still age 0 at the foot", lingered && lingered.age === 0 && !lingered.sit && lingered.dist > lingered.peakR, lingered);
    await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();
    await page.waitForFunction(() => window.__isle?.landReady && window.__isle.jellyBoard && !window.__isle.titleMode, null, { timeout: 180_000 });
    await page.waitForTimeout(300);
    const justPlay = await page.evaluate(() => {
      const jelly = window.__isle.jellyBoard;
      // Natural age shortly after play — must still be early in the story.
      const tile = [...jelly.byHex.values()].find((e) => e.k.kind === "ore").k.tile;
      let c = null;
      tile.group.traverse((o) => {
        if (o.userData?.ref === "climber") c = o;
      });
      const p0 = tile.layout.peaks[0];
      return {
        age: jelly.age(),
        dist: +Math.hypot(c.position.x - p0.x, c.position.z - p0.z).toFixed(4),
        sit: c.scale.y < 1,
        peakR: p0.r,
      };
    });
    check(
      "after lobby: natural play age below 2s, excluding the 4s title linger",
      justPlay.age >= 0 && justPlay.age < 2 && !justPlay.sit && justPlay.dist > justPlay.peakR,
      justPlay,
    );
    await ctx.close();
  }

  // --- Reduced motion: holds still at the foot ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-jelly", "full");
      localStorage.setItem("emberisle-water", "simple");
    });
    page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();
    await page.waitForFunction(() => window.__isle?.landReady && window.__isle.jellyBoard && window.__isle.wasCalm, null, { timeout: 180_000 });
    const a = await climberAt();
    await page.waitForTimeout(2000);
    const b = await climberAt();
    check("reduced motion: age stays 0", a && a.age === 0 && b && b.age === 0, { a, b });
    check("reduced motion: holds at the foot", a && b && a.dist === b.dist && !a.sit && !b.sit, { a, b });
    await ctx.close();
  }

  assert.equal(errors.length, 0, `climber-prove failed: ${errors.join("; ")}`);
  console.log("climber-prove: ok");
} finally {
  await browser.close();
  await vite.close();
}
