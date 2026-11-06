// #1281: the startup loading screen, on the built page. A fresh visit opens on the loading card, not the title; the bar is
// determinate and only moves forward as the island's real parts arrive (the island chunk is held here, so the bar waits on
// it); Start before 100% shows its waiting line and nothing else; at 100% Start opens; tapping it pushes through the clouds
// for 2.4 s and the title card rises in, with the 56 px wordmark; with reduced motion it is a short cross-fade. A browser
// that reports itself automated (every other proof) opens on the title as before. Sizes: 320x568, 390x844, 844x390,
// 1280x720.
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

async function open(size, { human = true, reducedMotion = "no-preference", hold = false } = {}) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: SHOTS ? 2 : 1, reducedMotion, hasTouch: size.width < 900, isMobile: false });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // A person's browser: navigator.webdriver is false.
  if (human) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }));
  let release = () => {};
  if (hold) {
    const gate = new Promise((r) => (release = r));
    await page.route(`**/assets/${island}*`, async (route) => {
      await gate;
      await route.continue();
    });
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
    const wordmark = await page.getByTestId("title-card").locator("h1").evaluate((el) => getComputedStyle(el).fontSize);
    check(wordmark === "56px", `${tag}: the title wordmark is 56 px`, wordmark);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "play");
    check(true, `${tag}: Play still starts a game after the loading screen`);
    check(errors.length === 0, `${tag}: no browser errors`, errors);
    await ctx.close();
  }

  // Reduced motion: no push, a cross-fade that lands the title card in well under a second.
  {
    const { ctx, page, errors } = await open({ width: 390, height: 844 }, { reducedMotion: "reduce" });
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === "100", null, { timeout: 60_000 });
    await start(page).click();
    const t0 = Date.now();
    await page.getByTestId("title-card").waitFor();
    const moved = await page.getByTestId("loading-card").evaluateAll((els) => els.map((el) => el.style.transform).join(""));
    await page.getByTestId("loading-card").waitFor({ state: "detached", timeout: 2000 });
    const ms = Date.now() - t0;
    check(ms < 1000 && !moved, "reduced motion: a cross-fade only (the card never moves) and the title is up in under a second", { ms });
    check(errors.length === 0, "reduced motion: no browser errors", errors);
    await ctx.close();
  }

  // Every other proof drives an automated browser: it opens straight on the title, as before this screen.
  {
    const { ctx, page } = await open({ width: 1280, height: 720 }, { human: false });
    await page.getByTestId("title-card").waitFor();
    check((await page.getByTestId("loading-card").count()) === 0, "an automated browser opens on the title with no loading card");
    await ctx.close();
  }

  if (SHOTS) {
    // Frames of the push, in real time: one fresh load a frame, the picture taken that long after Start.
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
      const tag = `${size.width}x${size.height}`;
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
