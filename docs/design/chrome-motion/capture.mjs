// #1299 design capture: the three chrome pulses frozen at their peak, as drawn today and with after.css on top, under
// normal and reduced motion, at 390x844, 844x390 and 1280x720. No src/ file changes. Not a CI proof.
// Run from the repo root, one browser at a time: node docs/design/chrome-motion/capture.mjs
// It writes to a new temp folder. Add --save to write into pictures/ next to this file, replacing the committed files.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv.includes("--save") ? path.join(dir, "pictures") : mkdtempSync(path.join(tmpdir(), "chrome-motion-"));
mkdirSync(outDir, { recursive: true });
console.error(`pictures: ${outDir}`);
const afterCss = readFileSync(path.join(dir, "after.css"), "utf8");
const sizes = [[390, 844], [844, 390], [1280, 720]];
// Where each pulse peaks: build-ready at 50 % of 320 ms, my-number at 25 % of 1200 ms, the fortune cue at 40 % of 1600 ms.
const PEAK = { "build-ready": 160, "build-ready-ring": 160, "my-number-glow": 300, "my-number-ring": 300, "fortune-cue-glow": 640 };

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const out = { browser: browser.version(), peaks: PEAK, runs: [] };

// A main-phase practice table for Jarrod with pieces, an empty hand and no fortunes: nothing pulses yet.
const crafted = async (page) => {
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async () => {
    const game = window.__emberisle;
    const { createGame } = await import("/src/lib/game/board.ts");
    const st = createGame({ seed: 20261107, humans: [{ name: "Jarrod" }, { name: "Josh" }, { name: "Mira" }, { name: "Finn" }], bots: 0 });
    const land = st.vertices.filter((v) => v.hexes.length >= 2);
    const step = Math.floor(land.length / 8);
    st.players.forEach((p, i) => {
      p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
      for (let k = 0; k < 2; k++) {
        const v = land[(i * 2 + k) * step];
        v.building = { playerId: p.id, kind: k ? "stronghold" : "outpost" };
        const e = st.edges.find((e) => (e.va === v.id || e.vb === v.id) && !e.path);
        if (e) e.path = p.id;
      }
    });
    st.phase = "main";
    st.current = st.players[0].id;
    st.dice = [1, 1];
    st.rolls = 1;
    st.seq++;
    game.setState({ state: st, localId: st.current, mode: "ai", buildMode: "none", banner: null, error: null, synced: game.getState().synced + 1 });
  });
  await page.waitForTimeout(1500);
};

// One state change starts all three: goods for a path (build ready), a roll of one of my numbers (my numbers), and a
// wayfarer in hand at the start of the turn (the fortunes cue). The 1.2 s timer that unlights the chip is stretched so
// the frozen frame can be taken.
const trigger = (page) =>
  page.evaluate(() => {
    const st0 = window.setTimeout;
    window.setTimeout = (fn, ms, ...a) => st0(fn, ms === 1200 ? 60000 : ms, ...a);
    const game = window.__emberisle;
    const st = structuredClone(game.getState().state);
    const me = st.players[0];
    me.resources = { timber: 1, clay: 1, wool: 0, grain: 0, ore: 0 };
    me.hidden = { knight: 1, road: 0, plenty: 0, monopoly: 0, vp: 0 };
    me.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
    const chip = document.querySelector('[data-testid="my-numbers"] > li');
    const n = chip ? Number(chip.dataset.n) : 8;
    st.dice = n > 6 ? [6, n - 6] : [1, n - 1];
    st.rolls = (st.rolls ?? 0) + 1;
    st.seq++;
    game.setState({ state: st });
    return n;
  });

// Freeze every pulse at its peak and report what is animating and what each pulsing element draws.
const freeze = (page) =>
  page.evaluate((PEAK) => {
    const anims = document.getAnimations().filter((a) => a.animationName in PEAK);
    for (const a of anims) { a.pause(); a.currentTime = PEAK[a.animationName]; }
    const style = (el, pseudo) => { const cs = getComputedStyle(el, pseudo); return { shadow: cs.boxShadow, opacity: cs.opacity, transform: cs.transform, animation: cs.animationName }; };
    const path = document.querySelector('[data-testid="build-path"]');
    const lit = document.querySelector('[data-testid="my-numbers"] > li[data-lit]');
    const cue = document.querySelector('[data-testid="fortune-cue-glow"]');
    return {
      animations: anims.map((a) => `${a.animationName}@${a.currentTime}`).sort(),
      path: path && { pulsing: path.classList.contains("build-ready"), ...style(path), ring: style(path, "::after") },
      myNumber: lit && { n: lit.dataset.n, ...style(lit), ring: style(lit, "::after") },
      cue: cue && style(cue),
    };
  }, PEAK);

try {
  for (const [width, height] of sizes) {
    const phone = width !== 1280;
    for (const motion of ["normal", "reduced"]) {
      for (const variant of ["before", "after"]) {
        const tag = `${width}x${height}-${motion}-${variant}`;
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, reducedMotion: motion === "reduced" ? "reduce" : "no-preference" });
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
        page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
        await page.addInitScript(() => localStorage.setItem("emberisle-name", "Jarrod"));
        await page.goto(url);
        await page.waitForFunction(() => !!window.__emberisle);
        await crafted(page);
        if (variant === "after") await page.addStyleTag({ content: afterCss });
        await page.locator('[data-testid="my-numbers"] > li').first().waitFor();
        const n = await trigger(page);
        await page.waitForFunction(() => document.querySelector('[data-testid="build-path"]')?.classList.contains("build-ready") || matchMedia("(prefers-reduced-motion: reduce)").matches);
        await page.waitForTimeout(60);
        const frozen = await freeze(page);
        // The roll moment the trigger's roll starts is not a chrome pulse: let it leave before the picture.
        await page.waitForTimeout(1600);
        await page.screenshot({ path: `${outDir}/${tag}.jpg`, type: "jpeg", quality: 78 });
        out.runs.push({ tag, rolled: n, ...frozen });
        console.log(tag, JSON.stringify({ animations: frozen.animations, path: frozen.path?.shadow, ring: `${frozen.path?.ring.shadow} @ ${frozen.path?.ring.opacity}`, lit: frozen.myNumber?.n, cue: `${frozen.cue?.shadow} @ ${frozen.cue?.opacity}` }));
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await vite.close();
}
out.errors = errors;
writeFileSync(`${outDir}/measurements.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
