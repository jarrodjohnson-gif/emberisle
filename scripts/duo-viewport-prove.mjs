// #1814: the game on the iPhone Duo's four estimated Safari viewports, folded (466x678, 678x466) and opened (626x890,
// 890x626). Estimates from secondary sources, not Apple. A measuring proof: no src/ file changes, and the layout gaps it
// finds are written down as data (measurements.json, docs/design/duo-viewports/README.md), not failed on; failing on them
// is the design follow-up's job. What it does fail on:
// - the game state, the turn deadline, an open sheet and the page itself surviving a fold and unfold mid-turn
//   (466x678 -> 626x890 -> 890x626 -> 466x678), the page never reloading, and the board re-fitting on every step: the
//   canvas takes the new size, the declared island hole is recomputed, every hex is inside the viewport, and the way back
//   to 466x678 lands on the very extent it started from;
// - a page error, and a screen that cannot be reached at a size.
// Per size it captures the title, the lobby (a real host, a guest and a bot), a practice table before the roll, the main
// phase with the Build list open, and the results screen, each as a JPG, and measures: controls cut off, covered or off
// the viewport, horizontal scroll, tap targets under 44 px, and the island's share of the viewport (law 3 in
// docs/design/app-review/laws/open-questions.md: at least 60 % of the height upright; sideways the full height beside a
// column of at most 42 % of the width).
// The table is a practice table with a crafted state, as docs/design/button-audit/capture.mjs builds it; the results
// screen is that table with its phase set to "over" (no played game, so its numbers are the sheet's, not a real score).
// Run one browser proof at a time: npm run duo-viewport-prove
// It writes to a new temp folder. Add --save to write into docs/design/duo-viewports/, replacing the committed files.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv.includes("--save") ? path.join(root, "docs/design/duo-viewports") : mkdtempSync(path.join(tmpdir(), "duo-viewports-"));
mkdirSync(path.join(outDir, "pictures"), { recursive: true });
console.log(`output: ${outDir}`);

const SIZES = [
  { name: "folded upright", width: 466, height: 678 },
  { name: "folded sideways", width: 678, height: 466 },
  { name: "opened upright", width: 626, height: 890 },
  { name: "opened sideways", width: 890, height: 626 },
];
const FOLD = [[466, 678], [626, 890], [890, 626], [466, 678]];
const STEP_MS = 30_000;

const failures = [];
const errors = [];
const check = (ok, msg) => {
  if (!ok) {
    failures.push(msg);
    console.log(`FAIL ${msg}`);
  }
  return ok;
};

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1814-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: new URL("../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: rooms } });
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  host.on("exit", (code) => reject(new Error(`host exited ${code}`)));
});
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

// Measured in the page. Every visible control, the page's scroll, and the island's hole.
const measure = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden], [aria-hidden=true], [inert], .sr-only");
  };
  const label = (el) => (el.getAttribute("aria-label") || el.getAttribute("data-testid") || el.textContent.trim() || el.tagName).replace(/\s+/g, " ").slice(0, 32);
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=tab], [role=button], [role=switch], [role=checkbox]')].filter(seen);
  // A modal (a dialog, the results sheet) covers the controls behind it by design: those are not "covered" findings.
  const modal = document.querySelector('[role=dialog][aria-modal=true], [data-testid=win-screen], [data-testid=table-menu]');
  const items = [];
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const issues = [];
    // Clip the box by every ancestor that hides its overflow. Nothing left: collapsed or slid away, not a control on screen.
    let clip = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    let cutBy = "";
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      if (["auto", "scroll"].includes(cs.overflowY) || ["auto", "scroll"].includes(cs.overflowX)) continue;
      const ar = a.getBoundingClientRect();
      clip = { left: Math.max(clip.left, ar.left), top: Math.max(clip.top, ar.top), right: Math.min(clip.right, ar.right), bottom: Math.min(clip.bottom, ar.bottom) };
      if (!cutBy && (r.left < ar.left - 0.5 || r.right > ar.right + 0.5 || r.top < ar.top - 0.5 || r.bottom > ar.bottom + 0.5)) cutBy = `${a.tagName.toLowerCase()}${a.dataset.testid ? `[${a.dataset.testid}]` : ""}`;
    }
    if (clip.right - clip.left < 1 || clip.bottom - clip.top < 1) continue;
    if (cutBy) issues.push(`cut off by ${cutBy}`);
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) issues.push("cut off by the viewport");
    const cx = Math.min(vw - 1, Math.max(0, (clip.left + clip.right) / 2));
    const cy = Math.min(vh - 1, Math.max(0, (clip.top + clip.bottom) / 2));
    const top = document.elementFromPoint(cx, cy);
    // The island's canvas takes taps for picking and sits over the dock inspectors by design: not a finding.
    if (top && top !== el && !el.contains(top) && !top.contains(el) && top.tagName !== "CANVAS" && !(modal && !modal.contains(el))) issues.push(`covered by ${top.tagName.toLowerCase()}${top.dataset.testid ? `[${top.dataset.testid}]` : ""}`);
    if (r.width < 43.5 || r.height < 43.5) issues.push(`under 44 px (${r.width.toFixed(1)} x ${r.height.toFixed(1)})`);
    items.push({ label: label(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1), left: +r.left.toFixed(1), top: +r.top.toFixed(1), issues });
  }
  const doc = document.documentElement;
  const wide = Math.max(doc.scrollWidth, document.body.scrollWidth);
  const isle = window.__isle;
  let island = null;
  if (isle?.insets) {
    const i = isle.insets();
    const live = isle.liveInsets();
    const of = (n) => {
      const w = vw - n.left - n.right;
      const h = vh - n.top - n.bottom;
      return { hole: { top: Math.round(n.top), right: Math.round(n.right), bottom: Math.round(n.bottom), left: Math.round(n.left) }, heightShare: +(h / vh).toFixed(3), widthShare: +(w / vw).toFixed(3), areaShare: +((w * h) / (vw * vh)).toFixed(3), chromeWidthShare: +((n.left + n.right) / vw).toFixed(3) };
    };
    island = { declared: of(i), live: of(live) };
  }
  return {
    viewport: [vw, vh],
    horizontalScroll: wide > vw + 1 ? { scrollWidth: wide, viewport: vw } : null,
    verticalScroll: doc.scrollHeight > vh + 1 ? { scrollHeight: doc.scrollHeight, viewport: vh } : null,
    controls: items.length,
    issues: items.filter((c) => c.issues.length).map((c) => ({ label: c.label, w: c.w, h: c.h, left: c.left, top: c.top, issues: c.issues })),
    island,
  };
};

// Law 3, as data: upright the island keeps 60 % of the height; sideways the full height beside a column of at most 42 %.
const law3 = (m, width, height) => {
  if (!m.island) return null;
  const d = m.island.live;
  return height > width ? { rule: "upright: island height share >= 0.60", value: d.heightShare, met: d.heightShare >= 0.6 } : { rule: "sideways: a column of at most 0.42 of the width (the height share is reported, the header takes the top)", value: { heightShare: d.heightShare, columnWidthShare: d.chromeWidthShare }, met: d.chromeWidthShare <= 0.42 };
};

// A practice table with pieces and goods, as docs/design/button-audit/capture.mjs crafts it.
const craft = async (page, phase) => {
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async (phase) => {
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
    st.phase = phase;
    st.current = st.players[0].id;
    st.dice = phase === "main" ? [3, 5] : null;
    st.seq++;
    game.setState({ state: st, localId: st.current, mode: "ai", buildMode: "none", banner: null, error: null, synced: game.getState().synced + 1 });
  }, phase);
  await page.waitForTimeout(1500);
};

const open = async (size, { init } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(STEP_MS);
  const tag = `${size.width}x${size.height}`;
  page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
  if (init) await page.evaluate(init);
  return page;
};

// A host with a guest and a bot, the guest ready: the host's page is returned, still in the lobby.
const lobby = async (size) => {
  const page = await open(size);
  await page.evaluate(() => window.__emberisle.getState().hostTable());
  await page.getByTestId("lobby-card").waitFor();
  const code = (await page.getByTestId("table-code").textContent()).trim();
  const guest = await open({ width: 390, height: 844 });
  await guest.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
  await guest.getByTestId("lobby-card").waitFor();
  await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
  await page.getByTestId("add-bot").first().click();
  await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
  await guest.evaluate(() => window.__emberisle.getState().setReady(true));
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.mouse.move(0, 0);
  return { page, guest };
};

const out = { note: "Estimated Duo Safari viewports in CSS px (secondary sources, not Apple). Layout findings are data, not failures; see README.md.", browser: browser.version(), sizes: [], fold: [] };
let exit = 0;
try {
  for (const size of SIZES) {
    const tag = `${size.width}x${size.height}`;
    const rec = { size: tag, name: size.name, screens: {}, unreached: [] };
    const take = async (page, name) => {
      await page.screenshot({ path: path.join(outDir, "pictures", `${tag}-${name}.jpg`), type: "jpeg", quality: 55 });
      const m = await page.evaluate(measure);
      // The island's hole is the table's; the title and the lobby show the free view behind the card.
      if (name === "title" || name === "lobby") m.island = null;
      m.law3 = law3(m, size.width, size.height);
      rec.screens[name] = m;
      console.log(tag, name.padEnd(8), `controls ${m.controls}, issues ${m.issues.length}, hscroll ${m.horizontalScroll ? m.horizontalScroll.scrollWidth : "none"}, island height ${m.island ? m.island.live.heightShare : "n/a"}`);
    };
    const reach = async (name, fn) => {
      try { await fn(); } catch (e) { rec.unreached.push(`${name}: ${String(e).split("\n")[0]}`); check(false, `${tag}: could not reach ${name} (${String(e).split("\n")[0]})`); }
    };

    await reach("title", async () => {
      const page = await open(size);
      await page.waitForTimeout(500);
      await take(page, "title");
      await page.context().close();
    });
    await reach("lobby", async () => {
      const { page, guest } = await lobby(size);
      await take(page, "lobby");
      await guest.context().close();
      await page.context().close();
    });
    await reach("table", async () => {
      const page = await open(size);
      await craft(page, "roll");
      await page.getByRole("button", { name: "Roll" }).first().waitFor();
      await take(page, "pre-roll");
      await craft(page, "main");
      await page.getByTestId("build-open").waitFor();
      await page.getByTestId("build-open").click();
      await page.getByTestId("build-list").waitFor();
      await page.waitForTimeout(400);
      await take(page, "build");
      await page.keyboard.press("Escape");
      await page.getByTestId("build-list").waitFor({ state: "detached" });
      await page.evaluate(() => {
        const game = window.__emberisle;
        const st = structuredClone(game.getState().state);
        st.phase = "over";
        st.winner = st.players[0].id;
        st.seq++;
        game.setState({ state: st, mode: "hotseat" });
      });
      await page.getByTestId("win-screen").waitFor();
      await page.waitForTimeout(500);
      await take(page, "results");
      await page.context().close();
    });
    out.sizes.push(rec);
  }

  // The fold: one turn lived through 466x678 -> 626x890 -> 890x626 -> 466x678, in the page, never reloaded. First a
  // practice table in its main phase with the Build list open (a synthetic turn clock, as a practice table has none),
  // then a real hosted game on its roll-off with the real clock and the table menu open.
  const probe = (sheet) => {
    const isle = window.__isle;
    const game = window.__emberisle.getState();
    const c = isle.renderer.domElement;
    const sheetEl = document.querySelector(sheet);
    const hexes = game.state.hexes.map((h) => isle.screenOf(h.id)).filter(Boolean);
    const inside = hexes.filter((p) => p.x >= 0 && p.x <= window.innerWidth && p.y >= 0 && p.y <= window.innerHeight).length;
    const sr = sheetEl?.getBoundingClientRect();
    return {
      marker: window.__duoMarker ?? null,
      state: JSON.stringify(game.state),
      deadline: game.turnTimer?.deadline ?? null,
      player: game.turnTimer?.player ?? null,
      sheet: sheetEl ? { within: sr.left >= -0.5 && sr.top >= -0.5 && sr.right <= window.innerWidth + 0.5 && sr.bottom <= window.innerHeight + 0.5, rect: [Math.round(sr.left), Math.round(sr.top), Math.round(sr.right), Math.round(sr.bottom)] } : null,
      canvas: [c.clientWidth, c.clientHeight],
      viewport: [window.innerWidth, window.innerHeight],
      hole: isle.insets(),
      renders: window.__isle.renders,
      hexes: hexes.length,
      bbox: [Math.min(...hexes.map((p) => p.x)), Math.min(...hexes.map((p) => p.y)), Math.max(...hexes.map((p) => p.x)), Math.max(...hexes.map((p) => p.y))].map(Math.round),
      hexesInside: inside,
    };
  };
  const foldTest = async (page, label, sheet) => {
    const at = (n, v) => `${label} step ${n} ${v[0]}x${v[1]}`;
    await page.evaluate(() => { window.__duoMarker = "same page"; });
    let navigations = 0;
    page.on("framenavigated", (f) => f === page.mainFrame() && navigations++);
    const read = () => page.evaluate(probe, sheet);
    const start = await read();
    check(start.sheet !== null, `${label}: the sheet ${sheet} is not open before the fold`);
    const rec = { label, steps: [] };
    let prev = start;
    for (const [n, v] of FOLD.slice(1).entries()) {
      await page.setViewportSize({ width: v[0], height: v[1] });
      await page.waitForFunction(([w, h]) => { const c = window.__isle.renderer.domElement; return c.clientWidth === w && c.clientHeight === h; }, v);
      await page.waitForTimeout(1200);
      const now = await read();
      const s = at(n + 1, v);
      check(now.marker === "same page" && navigations === 0, `${s}: the page reloaded`);
      check(now.state === start.state, `${s}: the game state changed`);
      check(now.deadline === start.deadline && now.player === start.player, `${s}: the turn deadline changed (${start.deadline} -> ${now.deadline})`);
      check(now.sheet !== null, `${s}: the open sheet ${sheet} is gone`);
      check(now.canvas[0] === v[0] && now.canvas[1] === v[1], `${s}: the canvas is ${now.canvas} for a ${v} viewport`);
      check(now.bbox.some((x, i) => Math.abs(x - prev.bbox[i]) > 2), `${s}: the board did not re-fit (hex extent ${now.bbox} is the one it had at ${prev.viewport})`);
      check(now.hexes === start.hexes && now.hexesInside === now.hexes, `${s}: ${now.hexes - now.hexesInside} of ${now.hexes} hexes are outside the viewport`);
      check(now.renders > prev.renders, `${s}: the board drew no new frame`);
      if (n === 2) check(now.bbox.every((x, i) => Math.abs(x - start.bbox[i]) <= 2), `${s}: back at the start size the hex extent is ${now.bbox}, not ${start.bbox}`);
      rec.steps.push({ viewport: v, sheetWithinViewport: now.sheet?.within ?? null, sheetRect: now.sheet?.rect ?? null, hole: now.hole, hexExtent: now.bbox, hexesInside: `${now.hexesInside}/${now.hexes}`, deadline: now.deadline, statesEqual: now.state === start.state });
      prev = now;
    }
    out.fold.push(rec);
    console.log(label, JSON.stringify(rec.steps.map((s) => [s.viewport.join("x"), s.sheetWithinViewport, s.hexesInside])));
  };

  {
    const page = await open({ width: 466, height: 678 });
    await craft(page, "main");
    await page.evaluate(() => {
      const g = window.__emberisle;
      const now = Date.now();
      g.setState({ turnTimer: { at: now + 90_000, player: g.getState().localId, deadline: now + 90_000, host: now } });
    });
    await page.getByTestId("build-open").click();
    await page.getByTestId("build-list").waitFor();
    await page.waitForTimeout(500);
    await foldTest(page, "practice main, Build list open", '[data-testid="build-list"]');
    await page.context().close();
  }
  {
    const { page, guest } = await lobby({ width: 466, height: 678 });
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().state && window.__emberisle.getState().turnTimer);
    // Wait for the table to be still: the bots have rolled and nothing moves while this seat waits.
    let last = "";
    for (let i = 0; i < 20; i++) {
      const now = await page.evaluate(() => JSON.stringify(window.__emberisle.getState().state));
      if (now === last) break;
      last = now;
      await page.waitForTimeout(1500);
    }
    await page.getByRole("button", { name: "Table menu", exact: true }).click();
    await page.getByTestId("table-menu").waitFor();
    await page.waitForTimeout(500);
    await foldTest(page, "hosted roll-off, real clock, table menu open", '[data-testid="table-menu"]');
    await guest.context().close();
    await page.context().close();
  }
} catch (e) {
  console.log(`FAIL the proof stopped: ${e.stack || e}`);
  exit = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
check(errors.length === 0, `page errors: ${errors.join(" | ")}`);
out.errors = errors;
writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(out, null, 2));
console.log(`failures: ${failures.length}, page errors: ${errors.length}`);
if (failures.length || exit) process.exit(1);
console.log("duo-viewport-prove: ok");
