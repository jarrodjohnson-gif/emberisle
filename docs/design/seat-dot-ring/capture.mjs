// #1297 design capture: the real game, before and after the seat-dot ring, at 390x844, 844x390 and 1280x720.
// "After" adds after.css to the running page. No src/ file changes. Reports measurements; not a CI proof.
// The title is the real title; the lobby is a real host with a guest and a bot; the table and results are crafted with
// window.__emberisle.setState, not played.
// Run from the repo root, one browser at a time: node docs/design/seat-dot-ring/capture.mjs
// It writes to a new temp folder. Add --save to write into pictures/ next to this file, replacing the committed files.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv.includes("--save") ? path.join(dir, "pictures") : mkdtempSync(path.join(tmpdir(), "seat-dot-ring-"));
mkdirSync(out, { recursive: true });
console.error(`pictures: ${out}`);
const afterCss = readFileSync(path.join(dir, "after.css"), "utf8");
const sizes = [[390, 844], [844, 390], [1280, 720]];

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1297-rooms-"));
process.on("exit", () => rmSync(rooms, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: new URL("../../../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: rooms } });
process.on("exit", () => host.kill());
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  host.on("exit", (code) => reject(new Error(`host exited ${code}`)));
});
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const result = { browser: browser.version(), ring: "inset 0 0 0 1.5px #78837a", contrast: {}, sizes: [] };

// WCAG relative luminance and contrast. Colours as #rrggbb or the computed rgb(r, g, b).
const parse = (c) => (c.startsWith("#") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+/g).slice(0, 3).map(Number));
const lum = (c) => { const [r, g, b] = parse(c).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => +((Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)).toFixed(2);
result.contrast = { white: contrast("#78837a", "#ffffff"), mist: contrast("#78837a", "#f3f6f5"), dune: contrast("#78837a", "#f3ecd9"), lobbyRingToday: contrast("#bfbfbf", "#ffffff") };

// Every seat dot on the page: its box, fill and ring, the first painted surface behind it, and the name assistive
// technology gets for it (the dot is aria-hidden; the name is the enclosing control's label or the text beside it).
const measure = () =>
  [...document.querySelectorAll('span[aria-hidden="true"].inline-block.shrink-0.rounded-full, .lobby-layout .dot')]
    .filter((d) => d.getClientRects().length && getComputedStyle(d).visibility !== "hidden")
    .map((d) => {
      const r = d.getBoundingClientRect();
      const cs = getComputedStyle(d);
      let el = d.parentElement, surface = "";
      while (el && !surface) { const bg = getComputedStyle(el).backgroundColor; if (bg && !bg.endsWith(", 0)") && bg !== "transparent") surface = bg; el = el.parentElement; }
      const owner = d.closest("button, summary, li, tr, p, [role]");
      const name = (owner?.getAttribute("aria-label") || owner?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), fill: cs.backgroundColor, ring: cs.boxShadow, outline: cs.outlineStyle === "none" ? "" : `${cs.outlineWidth} ${cs.outlineColor}`, surface, ariaHidden: d.getAttribute("aria-hidden"), name };
    });

// A main-phase table with pieces and goods, set through the store so the seats carry real points and counts. Seat 3 is
// Dune; Jarrod is on turn, so Dune's dot has no on-turn outline.
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

const open = async (name, viewport, phone, scale = 1) => {
  const context = await browser.newContext({ viewport, hasTouch: phone, isMobile: phone, deviceScaleFactor: scale, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${viewport.width}x${viewport.height}: ${e}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${viewport.width}x${viewport.height}: ${m.text()}`); });
  await page.addInitScript((n) => { localStorage.setItem("emberisle-name", n); Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } }); }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
};

try {
  for (const [width, height] of sizes) {
    const phone = width !== 1280;
    const tag = `${width}x${height}`;
    const rec = { size: tag, screens: {} };
    // The same screen twice: as it is, then with after.css on top.
    const pair = async (page, name) => {
      const shot = (s) => page.screenshot({ path: path.join(out, `${tag}-${name}-${s}.jpg`), type: "jpeg", quality: 82 });
      const before = await page.evaluate(measure);
      await shot("before");
      const style = await page.addStyleTag({ content: afterCss });
      await page.waitForTimeout(100);
      const after = await page.evaluate(measure);
      await shot("after");
      await style.evaluate((s) => s.remove());
      rec.screens[name] = { before, after };
    };

    // Title: the seat row open, so the 16 px seat dot and the four 28 px swatches show.
    const page = await open("Jarrod", { width, height }, phone);
    await page.locator('summary[aria-label="Your seat"]').click();
    await page.waitForTimeout(300);
    await pair(page, "title");

    // Lobby (the mist screen): Jarrod hosts, Josh joins, one bot takes Dune. Device scale 2, so the 12 px dots can be judged.
    const lobby = await open("Jarrod", { width, height }, phone, 2);
    await lobby.evaluate(() => window.__emberisle.getState().hostTable());
    await lobby.getByTestId("lobby-card").waitFor();
    const code = (await lobby.getByTestId("table-code").textContent()).trim();
    const guest = await open("Josh", { width: 390, height: 844 }, true);
    await guest.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
    await guest.getByTestId("lobby-card").waitFor();
    await lobby.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await lobby.getByTestId("add-bot").first().click();
    await lobby.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    await lobby.waitForTimeout(500);
    await lobby.mouse.move(0, 0);
    await pair(lobby, "lobby");
    await guest.context().close();
    await lobby.context().close();

    // Table: the strip or rail, with Dune's player menu open in the "after" picture.
    await crafted(page);
    await pair(page, "table");
    await page.addStyleTag({ content: afterCss });
    await page.evaluate(() => window.__emberisle.getState().openMenu(window.__emberisle.getState().state.players[2].id));
    await page.getByTestId("player-menu").waitFor();
    await page.waitForTimeout(300);
    rec.screens.menu = { after: await page.evaluate(measure) };
    await page.screenshot({ path: path.join(out, `${tag}-menu-after.jpg`), type: "jpeg", quality: 82 });
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
    await page.screenshot({ path: path.join(out, `${tag}-results-after.jpg`), type: "jpeg", quality: 82 });
    await page.context().close();

    // Checks: the ring moves no dot; every dot carries it after; every dot is aria-hidden with a name beside it; and the
    // ring reads at 3:1 or better against the surface actually behind each dot.
    for (const [name, s] of Object.entries(rec.screens)) {
      if (s.before) {
        const box = (d) => [d.x, d.y, d.w, d.h].join(",");
        if (s.before.map(box).join("|") !== s.after.map(box).join("|")) throw new Error(`${tag} ${name}: a dot moved`);
      }
      const unringed = s.after.filter((d) => !d.ring.includes("inset"));
      if (unringed.length) throw new Error(`${tag} ${name}: ${unringed.length} dots without a ring ${JSON.stringify(unringed)}`);
      const unnamed = s.after.filter((d) => d.ariaHidden !== "true" || !d.name);
      if (unnamed.length) throw new Error(`${tag} ${name}: ${unnamed.length} dots not aria-hidden or without a name ${JSON.stringify(unnamed)}`);
      for (const d of s.after) d.ringContrast = contrast("#78837a", d.surface || "#ffffff");
      const low = s.after.filter((d) => d.ringContrast < 3);
      if (low.length) throw new Error(`${tag} ${name}: ring under 3:1 ${JSON.stringify(low)}`);
    }
    rec.summary = Object.fromEntries(Object.entries(rec.screens).map(([k, s]) => [k, { dots: s.after.length, surfaces: [...new Set(s.after.map((d) => d.surface))], names: s.after.map((d) => d.name) }]));
    result.sizes.push(rec);
    console.log(tag, JSON.stringify(Object.fromEntries(Object.entries(rec.summary).map(([k, v]) => [k, `${v.dots} dots on ${v.surfaces.join(" / ")}`]))));

    // A 3x close-up of the seat strip or rail, before and after, so the 10 to 12 px dots can be judged.
    const zp = await open("Jarrod", { width, height }, phone, 3);
    await crafted(zp);
    const clip = await zp.evaluate(() => {
      const strip = document.querySelector('[data-testid="seat-strip"]');
      const el = strip ?? document.querySelector('[data-testid="rail-p1"]').parentElement.parentElement;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: Math.min(innerWidth, r.width + 8), height: r.height + 8 };
    });
    await zp.screenshot({ path: path.join(out, `${tag}-seats-3x-before.png`), clip });
    await zp.addStyleTag({ content: afterCss });
    await zp.screenshot({ path: path.join(out, `${tag}-seats-3x-after.png`), clip });
    await zp.context().close();
  }
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
result.errors = errors;
writeFileSync(path.join(out, "measurements.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ contrast: result.contrast, errors }));
if (errors.length) process.exit(1);
