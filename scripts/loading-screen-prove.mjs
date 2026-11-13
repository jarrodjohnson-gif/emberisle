// #1281: the startup loading screen, on the built page. A fresh visit opens on the loading card, not the title; the bar is
// determinate and only moves forward as the island's real parts arrive (the island chunk is held here, so the bar waits on
// it); Start before 100% shows its waiting line and nothing else; at 100% Start opens; tapping it pushes through the clouds
// for 2.4 s and the title card rises in (the Play page on a first visit, the 56 px wordmark later); with reduced motion it is a short cross-fade. A failed
// island download shows an error and Try again with Start still closed, and Try again loads it once the network is back; a
// slow connection fills the bar in steps with no error. A page with `__emberisleSkipIntro` set before load (every other
// proof, through scripts/proof-browser.mjs) opens on the title as before. Sizes: 320x568, 390x844, 844x390, 1280x720.
// #1151: a first visit's Start opens the Play page (two taps to a game); a later visit's Start opens the front page.
// This proof imports chromium from playwright itself, so its pages get the real screen.
//   node scripts/loading-screen-prove.mjs            the proof (needs `npm run build`)
//   node scripts/loading-screen-prove.mjs --shots    also writes the pictures to docs/proofs/1281/
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { chromium } from "playwright";
import { preview } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8528;
const URL_ = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.argv.includes("--shots");
const OUT = "docs/proofs/1281";
const island = readdirSync("dist/assets").find((f) => /^IslandCanvas-[\w-]+\.js$/.test(f));
assert.ok(island, "built IslandCanvas chunk (run npm run build)");

function check(ok, label, data) {
  assert.ok(ok, label + (data === undefined ? "" : " " + JSON.stringify(data)));
  console.log("ok  " + label + (data === undefined ? "" : " " + JSON.stringify(data)));
}

const vite = await preview({ preview: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function open(size, { skip = false, reducedMotion = "no-preference", hold = false, fail = false, slow = false, stall = 0, trace = false, early = false } = {}) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: SHOTS ? 2 : 1, reducedMotion, hasTouch: size.width < 900, isMobile: false });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  if (skip) await page.addInitScript(() => (window.__emberisleSkipIntro = true));
  if (trace) {
    // #1385: what the page did around Start, printed with the result: when the bar read 100%, the main thread's long tasks,
    // and the island's draws and GL programs since Start.
    await page.addInitScript(() => {
      const t = (window.__trace = { long: [], at100: 0, start: 0, renders: 0, programs: 0, title: 0, gone: 0, timers: [], frames: [] });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => t.long.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true });
      new MutationObserver(() => {
        if (!t.at100 && document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "100") t.at100 = performance.now();
        if (t.start && !t.title && document.querySelector('[data-testid="title-card"]')) t.title = performance.now();
        if (t.start && !t.gone && !document.querySelector('[data-testid="loading-card"]')) t.gone = performance.now();
      }).observe(document, { subtree: true, attributes: true, childList: true });
      // When the page's own timers and frames actually ran after Start (a 100 ms timer chain and every frame).
      const tick = () => {
        if (!t.start || t.timers.length >= 40) return setTimeout(tick, 100);
        t.timers.push(performance.now());
        setTimeout(tick, 100);
      };
      setTimeout(tick, 100);
      const frame = (now) => {
        if (t.start && t.frames.length < 60) t.frames.push(now);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      addEventListener("click", (e) => {
        if (t.start || e.target?.textContent !== "Start") return;
        t.start = performance.now();
        t.renders = window.__isle?.renders ?? 0;
        t.programs = window.__isle?.renderer?.info?.programs?.length ?? 0;
      }, true);
    });
  }
  if (stall) {
    // #1385: from the moment the title card appears, every animation frame is held back for `stall` ms while the page's
    // scripts and timers run on, as when a slow GPU or a loaded machine delays frames.
    await page.addInitScript((ms) => {
      const raf = window.requestAnimationFrame.bind(window);
      const caf = window.cancelAnimationFrame.bind(window);
      let until = 0;
      let n = 0;
      const live = new Map();
      window.requestAnimationFrame = (cb) => {
        const id = ++n;
        const step = (t) => {
          if (!live.has(id)) return;
          if (performance.now() < until) return live.set(id, raf(step));
          live.delete(id);
          cb(t);
        };
        live.set(id, raf(step));
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        if (live.has(id)) caf(live.get(id));
        live.delete(id);
      };
      new MutationObserver((_, obs) => {
        if (!document.querySelector('[data-testid="title-card"]')) return;
        until = performance.now() + ms;
        obs.disconnect();
      }).observe(document, { childList: true, subtree: true });
    }, stall);
  }
  if (early) {
    // #1383: the first frame after Start carries a timestamp 16 ms before the click, as a frame that began before the
    // click's handler ran. Each of the next 8 frames then records a 5x5 grid of the sky canvas's pixels.
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      const out = (window.__early = { first: 0, frames: [] });
      let click = 0;
      addEventListener("click", (e) => {
        if (!click && e.target?.textContent === "Start") click = performance.now();
      }, true);
      window.requestAnimationFrame = (cb) =>
        raf((t) => {
          if (!click || (out.frames.length >= 8 && out.frames.at(-1).t !== t)) return cb(t);
          out.first ||= t;
          cb(t === out.first ? click - 16 : t);
          const sky = document.querySelector(".loading-sky");
          if (!sky) return;
          const g = sky.getContext("2d");
          const grid = [];
          for (let i = 0; i < 5; i++)
            for (let j = 0; j < 5; j++) grid.push([...g.getImageData(Math.floor(((i + 0.5) * sky.width) / 5), Math.floor(((j + 0.5) * sky.height) / 5), 1, 1).data]);
          const last = out.frames.at(-1);
          if (last?.t === t) last.grid = grid;
          else out.frames.push({ t, grid });
        });
    });
  }
  let release = () => {};
  if (hold) {
    const gate = new Promise((r) => (release = r));
    await page.route(`**/assets/${island}*`, async (route) => {
      await gate;
      await route.continue();
    });
  }
  if (fail) {
    // Every request for the island chunk (the preload, the import and any retry under a fresh query) fails until released.
    // The one-time stale-deploy reload (lazy.ts, proven elsewhere) is marked as spent, so this page shows the failure.
    let down = true;
    release = () => (down = false);
    await page.addInitScript((url) => sessionStorage.setItem("emberisle-chunk-reloaded", JSON.stringify([url])), `${URL_}assets/${island}`);
    await page.route(`**/assets/${island}*`, (route) => (down ? route.abort() : route.continue()));
  }
  if (slow) {
    // A poor mobile link, 50 kB/s with 400 ms of latency: the island chunk alone (about 200 kB gzip) takes seconds.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 25_000 });
  }
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  return { ctx, page, errors, release };
}

const pct = (page) => page.getByRole("progressbar", { name: "Loading Emberisle" }).getAttribute("aria-valuenow").then(Number);
const start = (page) => page.getByRole("button", { name: "Start", exact: true });

try {
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
    const tag = `${size.width}x${size.height}`;
    const { ctx, page, errors, release } = await open(size, { hold: true });
    await page.getByTestId("loading-card").waitFor();
    check((await page.getByTestId("title-card").count()) === 0, `${tag}: a fresh visit opens on the loading card, not the title`);

    // Held island chunk: the bar is short of 100 and Start waits.
    await page.waitForTimeout(600);
    const held = await pct(page);
    check(held < 100 && (await start(page).getAttribute("aria-disabled")) === "true", `${tag}: while the island is held the bar waits below 100% and Start is closed`, { held });
    // aria-disabled keeps it focusable and tappable; Playwright counts it as not enabled, so the tap is forced.
    await start(page).click({ force: true });
    await page.waitForTimeout(200);
    const waiting = await page.getByRole("status").filter({ hasText: "Start opens at 100%" }).count();
    check(waiting === 1 && (await page.getByTestId("title-card").count()) === 0 && (await pct(page)) < 100, `${tag}: Start before 100% shows its waiting line and nothing else happens`);

    // Released: the bar only moves forward, to 100, and Start opens.
    const seen = [held];
    release();
    const deadline = Date.now() + 60_000;
    while (seen.at(-1) < 100) {
      assert.ok(Date.now() < deadline, `${tag}: the bar reaches 100% within 60 s (last ${seen.at(-1)}%)`);
      await page.waitForTimeout(100);
      seen.push(await pct(page));
    }
    const steps = [...new Set(seen)];
    check(steps.every((v, i) => i === 0 || v > steps[i - 1]) && steps.length >= 3, `${tag}: the bar fills forward in real steps`, steps);
    check((await start(page).getAttribute("aria-disabled")) === "false", `${tag}: at 100% Start opens`);
    check((await page.getByRole("status").textContent()) === "Ready when you are", `${tag}: the status line says it is ready`);

    const geo = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="loading-card"]').getBoundingClientRect();
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Start").getBoundingClientRect();
      const h1 = getComputedStyle(document.querySelector('[data-testid="loading-card"] h1'));
      return { card: [card.left, card.top, card.right, card.bottom], btn: btn.height, font: h1.fontSize, w: innerWidth, h: innerHeight };
    });
    check(geo.card[0] >= 16 && geo.card[1] >= 0 && geo.card[2] <= geo.w - 16 && geo.card[3] <= geo.h - 16 && geo.btn >= 44 && geo.font === "56px",
      `${tag}: the card sits inside the screen (16 px in), Start is at least 44 px tall, the wordmark is 56 px`, geo);
    if (SHOTS) {
      if (size.width !== 320) {
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: `${OUT}/${tag}-ready.png` });
      }
    }

    await start(page).click();
    const t0 = Date.now();
    await page.getByTestId("title-card").waitFor();
    const arrive = Date.now() - t0;
    check(arrive >= 1500 && arrive <= 5000, `${tag}: Start pushes through the clouds and the title card arrives near the end of the 2.4 s push`, { ms: arrive });
    await page.getByTestId("loading-card").waitFor({ state: "detached", timeout: 6000 });
    check((await page.locator(".loading-sky").count()) === 0, `${tag}: the clouds and the loading card are gone once the camera settles`);
    const wordmark = await page.getByTestId("title-card").locator("h1").count();
    check(wordmark === 0, `${tag}: a first visit lands past the wordmark, on the Play page (a later visit's front page shows it at 56 px)`, wordmark);
    check((await page.getByTestId("title-card").getAttribute("data-page")) === "play", `${tag}: a first visit's Start opens the Play page`);
    await page.getByRole("button", { name: "Play with bots", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "play");
    check(true, `${tag}: Play still starts a game after the loading screen`);
    check(errors.length === 0, `${tag}: no browser errors`, errors);
    await ctx.close();
  }

  // Reduced motion: no push, a cross-fade that lands the title card in well under a second.
  {
    const { ctx, page, errors } = await open({ width: 390, height: 844 }, { reducedMotion: "reduce", trace: true });
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "100", null, { timeout: 60_000 });
    await start(page).click();
    const t0 = Date.now();
    const traced = () =>
      page.evaluate(() => {
        const t = window.__trace;
        return {
          at100: Math.round(t.at100),
          start: Math.round(t.start),
          long: t.long.filter(([s, d]) => s + d >= t.at100).map(([s, d]) => `${Math.round(s - t.start)}+${Math.round(d)}`),
          title: Math.round(t.title - t.start),
          gone: t.gone ? Math.round(t.gone - t.start) : null,
          timers: t.timers.map((x) => Math.round(x - t.start)).slice(0, 30),
          frames: t.frames.map((x) => Math.round(x - t.start)).slice(0, 30),
          hidden: document.visibilityState,
          draws: (window.__isle?.renders ?? 0) - t.renders,
          programs: `${t.programs}->${window.__isle?.renderer?.info?.programs?.length ?? 0}`,
        };
      });
    let ms;
    try {
      await page.getByTestId("title-card").waitFor();
      const moved = await page.getByTestId("loading-card").evaluateAll((els) => els.map((el) => el.style.transform).join(""));
      await page.getByTestId("loading-card").waitFor({ state: "detached", timeout: 2000 });
      ms = await page.evaluate(() => Math.round(window.__trace.gone - window.__trace.start));
      check(ms < 1000 && !moved, "reduced motion: a cross-fade only (the card never moves) and the title is up in under a second", { ms });
    } finally {
      console.log(`     reduced motion trace (ms from navigation; long tasks as ms-from-Start+duration): ${JSON.stringify({ ms: ms ?? Date.now() - t0, ...(await traced()) })}`);
    }
    check(errors.length === 0, "reduced motion: no browser errors", errors);
    await ctx.close();
  }

  // #1385: frames that stop for 2.5 s just as the title arrives do not hold the loading card: the fade ends on its own clock.
  {
    const { ctx, page, errors } = await open({ width: 390, height: 844 }, { reducedMotion: "reduce", stall: 2500, trace: true });
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "100", null, { timeout: 60_000 });
    await start(page).click();
    const t0 = Date.now();
    await page.getByTestId("title-card").waitFor();
    await page.getByTestId("loading-card").waitFor({ state: "detached", timeout: 2000 });
    const ms = await page.evaluate(() => Math.round(window.__trace.gone - window.__trace.start));
    check(ms < 1000, "reduced motion: with frames stalled 2.5 s as the title arrives, the loading card is still gone within a second of Start", { ms });
    check(errors.length === 0, "reduced motion with stalled frames: no browser errors", errors);
    await ctx.close();
  }

  // #1383: a first push frame stamped before the Start click must not paint the whiteout over the whole sky.
  {
    const { ctx, page, errors } = await open({ width: 390, height: 844 }, { early: true });
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "100", null, { timeout: 60_000 });
    await start(page).click();
    await page.waitForFunction(() => window.__early.frames.length >= 8, null, { timeout: 5000 });
    const frames = await page.evaluate(() => window.__early.frames.map(({ grid }) => grid));
    const wash = (p) => Math.abs(p[0] - 243) <= 2 && Math.abs(p[1] - 246) <= 2 && Math.abs(p[2] - 245) <= 2 && p[3] === 255;
    const covered = frames.map((grid, i) => (grid.every(wash) ? i : -1)).filter((i) => i >= 0);
    check(frames.length >= 8 && covered.length === 0, "a first push frame stamped 16 ms before the Start click: no frame is fully covered by the wash",
      { frames: frames.length, covered, first: frames[0][0] });
    await page.getByTestId("title-card").waitFor();
    check(errors.length === 0, "early first frame: no browser errors", errors);
    await ctx.close();
  }

  // #1385: a slow machine (CPU 6x slower) and Start tapped the instant the bar reads 100%, as on CI's failing runs. The bar
  // must only read 100% once the island's heavy first frames are behind it, so the fade still lands within a second.
  for (let run = 1; run <= 3; run++) {
    const { ctx, page, errors } = await open({ width: 390, height: 844 }, { reducedMotion: "reduce", trace: true });
    await (await ctx.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const box = await start(page).boundingBox();
    await page.waitForFunction(() => window.__trace.at100 > 0, null, { polling: 5, timeout: 120_000 });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const t0 = Date.now();
    await page.getByTestId("title-card").waitFor();
    await page.getByTestId("loading-card").waitFor({ state: "detached", timeout: 2000 });
    const ms = await page.evaluate(() => Math.round(window.__trace.gone - window.__trace.start));
    const gap = await page.evaluate(() => Math.round(window.__trace.start - window.__trace.at100));
    check(ms < 1000, `reduced motion, CPU 6x, Start tapped ${gap} ms after 100% (run ${run} of 3): the title is up and the loading card gone within a second`, { ms });
    check(errors.length === 0, `reduced motion, CPU 6x, instant Start (run ${run} of 3): no browser errors`, errors);
    await ctx.close();
  }

  // A failed island download: an error and Try again, Start closed and inert; Try again loads it once the network is back.
  {
    const { ctx, page, errors, release } = await open({ width: 390, height: 844 }, { fail: true });
    const alert = page.getByRole("alert").filter({ hasText: "Couldn't load the game" });
    await alert.waitFor({ timeout: 30_000 });
    const retry = page.getByRole("button", { name: "Try again", exact: true });
    const box = await retry.boundingBox();
    check((await start(page).getAttribute("aria-disabled")) === "true" && (await pct(page)) < 100 && box.height >= 44,
      "failed island download: an error and a 44 px Try again show, Start stays closed below 100%", { pct: await pct(page), retry: box.height });
    await start(page).click({ force: true });
    await page.waitForTimeout(300);
    check((await page.getByTestId("title-card").count()) === 0 && (await start(page).getAttribute("aria-disabled")) === "true",
      "failed island download: Start does nothing");
    await retry.click();
    await alert.waitFor({ timeout: 30_000 });
    check((await start(page).getAttribute("aria-disabled")) === "true", "Try again while the network is still down fails again, Start still closed");
    release();
    await retry.click();
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "100", null, { timeout: 60_000 });
    check((await alert.count()) === 0 && (await start(page).getAttribute("aria-disabled")) === "false" && (await page.evaluate(() => !!window.__isle)),
      "Try again after the network is back loads the island: the error goes, the island renders, Start opens");
    await start(page).click();
    await page.getByTestId("title-card").waitFor();
    check(true, "the push runs to the title after a retried load");
    const unexpected = errors.filter((e) => !/Failed to (load resource|fetch dynamically imported module)|IslandCanvas/.test(e));
    check(unexpected.length === 0, "failed island download: no browser errors beyond the refused chunk", unexpected);
    await ctx.close();
  }

  // A slow connection: the bar fills in steps over several seconds, no error shows, and Start opens at 100%.
  {
    const { ctx, page, errors } = await open({ width: 390, height: 844 }, { slow: true });
    await page.getByTestId("loading-card").waitFor({ timeout: 60_000 });
    const t0 = Date.now();
    const seen = [await pct(page)];
    while (seen.at(-1) < 100) {
      assert.ok(Date.now() - t0 < 120_000, `slow connection: the bar reaches 100% within 120 s (last ${seen.at(-1)}%)`);
      assert.equal(await page.getByRole("alert").count(), 0, "slow connection: no error while loading");
      await page.waitForTimeout(200);
      seen.push(await pct(page));
    }
    const steps = [...new Set(seen)];
    check(steps[0] < 100 && steps.length >= 3 && steps.every((v, i) => i === 0 || v > steps[i - 1]) && (await start(page).getAttribute("aria-disabled")) === "false",
      "slow connection: the card shows below 100%, the bar fills forward in steps with no error, and Start opens at 100%", { steps, ms: Date.now() - t0 });
    check(errors.length === 0, "slow connection: no browser errors", errors);
    await ctx.close();
  }

  // #1151 (owner, card A): a later visit's Start opens the front page. Back from the Play page shows it too.
  {
    const { ctx, page, errors } = await open({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "100", null, { timeout: 60_000 });
    await start(page).click();
    await page.getByTestId("title-card").waitFor();
    await page.close();
    const again = await ctx.newPage();
    again.on("pageerror", (e) => errors.push(String(e)));
    await again.goto(URL_, { waitUntil: "domcontentloaded" });
    await again.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "100", null, { timeout: 60_000 });
    await start(again).click();
    await again.getByTestId("title-card").waitFor();
    check((await again.getByTestId("title-card").getAttribute("data-page")) === "front", "a later visit: Start opens the front page");
    const frontMark = await again.getByTestId("title-card").locator("h1").evaluate((el) => getComputedStyle(el).fontSize);
    check(frontMark === "56px", "a later visit: the front page's wordmark is 56 px", frontMark);
    await again.getByRole("button", { name: "Play", exact: true }).click();
    await again.getByRole("button", { name: "Back", exact: true }).click();
    check((await again.getByTestId("title-card").getAttribute("data-page")) === "front", "a later visit: Back from the Play page shows the front page");
    check(errors.length === 0, "a later visit: no browser errors", errors);
    await ctx.close();
  }

  // Every other proof sets the skip flag before load (scripts/proof-browser.mjs): it opens straight on the title.
  {
    const { ctx, page } = await open({ width: 1280, height: 720 }, { skip: true });
    await page.getByTestId("title-card").waitFor();
    check((await page.getByTestId("loading-card").count()) === 0, "a page with __emberisleSkipIntro opens on the title with no loading card");
    await ctx.close();
  }

  if (SHOTS) {
    // Frames of the push, in real time: one fresh load a frame, the picture taken that long after Start.
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
      const tag = `${size.width}x${size.height}`;
      {
        const { ctx, page } = await open(size, { fail: true });
        await page.getByRole("alert").waitFor({ timeout: 30_000 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${tag}-error.png` });
        await ctx.close();
      }
      for (const [ms, name] of [[0, "loading"], [700, "push-1-clouds"], [1700, "push-2-island"], [2350, "push-3-aerial"], [5000, "title"]]) {
        const { ctx, page, release } = await open(size, { hold: !ms });
        if (!ms) {
          await page.getByTestId("loading-card").waitFor();
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
          release();
          await ctx.close();
          continue;
        }
        await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "100", null, { timeout: 60_000 });
        await page.waitForTimeout(1500);
        await start(page).click();
        await page.waitForTimeout(ms);
        await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
        await ctx.close();
      }
    }
    console.log(`shots in ${OUT}/`);
  }
  console.log("loading-screen-prove: ok");
} finally {
  await browser.close();
  await vite.close();
}
