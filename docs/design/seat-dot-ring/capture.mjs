// #1297 design capture: the real game, before and after the seat-dot ring, at 390x844, 844x390 and 1280x720.
// "After" adds after.css to the running page. No src/ file changes. Reports measurements; not a CI proof.
// Run from the repo root, one browser at a time: node docs/design/seat-dot-ring/capture.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const dir = "docs/design/seat-dot-ring";
mkdirSync(`${dir}/pictures`, { recursive: true });
const afterCss = readFileSync(`${dir}/after.css`, "utf8");
const sizes = [[390, 844], [844, 390], [1280, 720]];

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const out = { browser: browser.version(), ring: "inset 0 0 0 1.5px #78837a", contrast: {}, sizes: [] };

// WCAG relative luminance and contrast, for the ring colour against the two chrome surfaces.
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => +((Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)).toFixed(2);
out.contrast = { white: contrast("#78837a", "#ffffff"), mist: contrast("#78837a", "#f3f6f5"), dune: contrast("#78837a", "#f3ecd9") };

// Every SeatDot on the page: its box, fill and ring. The selector is SeatDot's own three classes plus aria-hidden.
const measure = () =>
  [...document.querySelectorAll('span[aria-hidden="true"].inline-block.shrink-0.rounded-full, .lobby-layout .dot')]
    .filter((d) => d.getClientRects().length)
    .map((d) => {
      const r = d.getBoundingClientRect();
      const cs = getComputedStyle(d);
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), fill: cs.backgroundColor, ring: cs.boxShadow, outline: cs.outlineStyle === "none" ? "" : `${cs.outlineWidth} ${cs.outlineColor}` };
    });

// A main-phase table with pieces and goods, so the seats carry real points and counts. Seat 3 is Dune.
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
      p.resources = { timber: 2, clay: 1, wool: 3, grain: 1, ore: 2 };
      for (let k = 0; k < 2; k++) {
        const v = land[(i * 2 + k) * step];
        v.building = { playerId: p.id, kind: k ? "stronghold" : "outpost" };
        const e = st.edges.find((e) => (e.va === v.id || e.vb === v.id) && !e.path);
        if (e) e.path = p.id;
      }
    });
    st.log = ["Jarrod laid a path."];
    st.phase = "main";
    st.current = st.players[0].id;
    st.dice = [3, 5];
    st.seq++;
    game.setState({ state: st, localId: st.current, mode: "hotseat", buildMode: "none", banner: null, error: null, synced: game.getState().synced + 1 });
  });
  await page.waitForTimeout(1500);
};

try {
  for (const [width, height] of sizes) {
    const phone = width !== 1280;
    const tag = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
    await page.addInitScript(() => localStorage.setItem("emberisle-name", "Jarrod"));
    await page.goto(url);
    await page.waitForFunction(() => !!window.__emberisle);
    const shot = (name) => page.screenshot({ path: `${dir}/pictures/${tag}-${name}.jpg`, type: "jpeg", quality: 82 });
    const rec = { size: tag, screens: {} };

    // Title: the seat row open, so the 16 px seat dot and the four 28 px swatches show.
    await page.locator('summary[aria-label="Your seat"]').click();
    await page.waitForTimeout(300);
    rec.screens.title = { before: await page.evaluate(measure) };
    await shot("title-before");
    const style = await page.addStyleTag({ content: afterCss });
    rec.screens.title.after = await page.evaluate(measure);
    await shot("title-after");
    await style.evaluate((s) => s.remove());

    // Table: the strip or rail, with Dune's player menu open in the "after" picture.
    await crafted(page);
    rec.screens.table = { before: await page.evaluate(measure) };
    await shot("table-before");
    await page.addStyleTag({ content: afterCss });
    rec.screens.table.after = await page.evaluate(measure);
    await shot("table-after");
    await page.evaluate(() => window.__emberisle.getState().openMenu(window.__emberisle.getState().state.players[2].id));
    await page.getByTestId("player-menu").waitFor();
    await page.waitForTimeout(300);
    rec.screens.menu = { after: await page.evaluate(measure) };
    await shot("menu-after");
    await page.evaluate(() => window.__emberisle.getState().openMenu(null));

    // Results: Dune wins, so the winner dot is the pale one.
    await page.evaluate(() => {
      const game = window.__emberisle;
      const st = structuredClone(game.getState().state);
      st.phase = "over";
      st.winner = st.players[2].id;
      st.seq++;
      game.setState({ state: st });
    });
    await page.getByTestId("win-screen").waitFor();
    await page.waitForTimeout(500);
    rec.screens.results = { after: await page.evaluate(measure) };
    await shot("results-after");

    // The ring must not move a dot: same boxes before and after, and a ring on every dot after.
    for (const [name, s] of Object.entries(rec.screens)) {
      if (s.before) {
        const box = (d) => [d.x, d.y, d.w, d.h].join(",");
        if (s.before.map(box).join("|") !== s.after.map(box).join("|")) throw new Error(`${tag} ${name}: a dot moved`);
      }
      const unringed = s.after.filter((d) => !d.ring.includes("inset"));
      if (unringed.length) throw new Error(`${tag} ${name}: ${unringed.length} dots without a ring ${JSON.stringify(unringed)}`);
    }
    rec.dots = Object.fromEntries(Object.entries(rec.screens).map(([k, s]) => [k, s.after.length]));
    out.sizes.push(rec);
    await context.close();
    console.log(tag, rec.dots);

    // A 3x close-up of the seat strip or rail, before and after, so the 10 to 12 px dots can be judged.
    const zoom = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 3, reducedMotion: "reduce" });
    const zp = await zoom.newPage();
    zp.on("pageerror", (e) => errors.push(`${tag} zoom: ${e}`));
    await zp.addInitScript(() => localStorage.setItem("emberisle-name", "Jarrod"));
    await zp.goto(url);
    await zp.waitForFunction(() => !!window.__emberisle);
    await crafted(zp);
    const clip = await zp.evaluate(() => {
      const strip = document.querySelector('[data-testid="seat-strip"]');
      const el = strip ?? document.querySelector('[data-testid="rail-p1"]').parentElement.parentElement;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: Math.min(innerWidth, r.width + 8), height: r.height + 8 };
    });
    await zp.screenshot({ path: `${dir}/pictures/${tag}-seats-3x-before.png`, clip });
    await zp.addStyleTag({ content: afterCss });
    await zp.screenshot({ path: `${dir}/pictures/${tag}-seats-3x-after.png`, clip });
    await zoom.close();
  }
} finally {
  await browser.close();
  await vite.close();
}
out.errors = errors;
writeFileSync(`${dir}/pictures/measurements.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ contrast: out.contrast, errors }));
if (errors.length) process.exit(1);
