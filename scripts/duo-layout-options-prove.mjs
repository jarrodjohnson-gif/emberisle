// #1829: layout options that raise the folded iPhone Duo's island to at least 0.60 of the height at 466x678 (the
// #1814 measure: law 3 in docs/design/app-review/laws/open-questions.md, `__isle.liveInsets()` height share). A measuring
// proof, like scripts/duo-viewport-prove.mjs: no src/ file changes. Each option is a CSS override injected into the real
// game at run time, plus the island's declared hole re-set to what the override leaves, so the board re-fits as a build
// would. Nothing here ships; the owner picks one (docs/research/iphone-duo-layout.md).
// It also reports how big the island really is (the span of the hex centres), since the hole's share ignores width.
// Options with `proposed: false` (and the baseline) are data only: their pictures and numbers are kept, they are never checked.
// What it fails on: a page error, an option under 0.60 at 466x678 (pre-roll or main phase), a missing or off-screen Roll,
// Build, Trade or End turn button, a tap target under 44 px, a control cut off or covered. It reports, as data, the same
// shares at the Safari viewports Apple publishes for the outer display (382x580 small, 382x618 large; WebKit blog, 2026-10-23).
// Run one browser proof at a time: npm run duo-layout-options-prove
// It writes to a new temp folder. Add --save to write into docs/design/duo-layout-options/, replacing the committed files.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { OPTIONS } from "./duo-layout-options.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv.includes("--save") ? path.join(root, "docs/design/duo-layout-options") : mkdtempSync(path.join(tmpdir(), "duo-layout-options-"));
mkdirSync(path.join(outDir, "pictures"), { recursive: true });
console.log(`output: ${outDir}`);

const SIZES = [
  { tag: "466x678", width: 466, height: 678, dsf: 2, required: true },
  { tag: "382x580", width: 382, height: 580, dsf: 1 },
  { tag: "382x618", width: 382, height: 618, dsf: 1 },
];
const PHASES = ["roll", "main"];
const TARGET = 0.6;

const failures = [];
const errors = [];
const check = (ok, msg) => {
  if (!ok) {
    failures.push(msg);
    console.log(`FAIL ${msg}`);
  }
  return ok;
};

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

// Measured in the page: the island's live hole, and every visible control's size, cut-off and cover.
const measure = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const controls = [...document.querySelectorAll("button, a[href], input, select, textarea, [role=button]")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.checkVisibility() && !el.closest("[hidden], [aria-hidden=true], [inert], .sr-only");
  });
  const issues = [];
  const seen = {};
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute("aria-label") || el.getAttribute("data-testid") || el.textContent.trim() || el.tagName).replace(/\s+/g, " ").slice(0, 28);
    seen[name] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) issues.push(`${name}: cut off by the viewport`);
    const top = document.elementFromPoint(Math.min(vw - 1, (r.left + r.right) / 2), Math.min(vh - 1, (r.top + r.bottom) / 2));
    if (top && top !== el && !el.contains(top) && !top.contains(el) && top.tagName !== "CANVAS") issues.push(`${name}: covered by ${top.tagName.toLowerCase()}${top.dataset.testid ? `[${top.dataset.testid}]` : ""}`);
    if (r.width < 43.5 || r.height < 43.5) issues.push(`${name}: under 44 px (${r.width.toFixed(1)} x ${r.height.toFixed(1)})`);
  }
  const n = window.__isle.liveInsets();
  const hole = { top: Math.round(n.top), right: Math.round(n.right), bottom: Math.round(n.bottom), left: Math.round(n.left) };
  // How big the island really is: the span of the 19 hex centres on screen. The hole's height share ignores the width the island needs.
  const pts = window.__emberisle.getState().state.hexes.map((h) => window.__isle.screenOf(h.id)).filter(Boolean);
  const span = (k, v) => +((Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]))) / v).toFixed(3);
  const hexSpan = { height: span("y", vh), width: span("x", vw) };
  const doc = document.documentElement;
  return { hole, hexSpan, heightShare: +((vh - n.top - n.bottom) / vh).toFixed(3), controls: controls.length, issues, seen, hscroll: Math.max(doc.scrollWidth, document.body.scrollWidth) > vw + 1 };
};

// A practice table with pieces and goods, as scripts/duo-viewport-prove.mjs crafts it.
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

// The override, then the island's declared hole set to the chrome that is left, and a refit: what a build of the option would do.
const apply = async (page, option) => {
  if (!option.css) return;
  await page.evaluate((css) => {
    document.getElementById("duo-option")?.remove();
    const tag = document.createElement("style");
    tag.id = "duo-option";
    tag.textContent = css;
    document.head.append(tag);
  }, option.css);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const isle = window.__isle;
    const live = isle.liveInsets();
    // The real declared hole keeps 4 px under the tray for sub-pixel font differences (mobile-fit.ts playHole).
    const hole = { top: live.top, right: live.right, bottom: live.bottom + 4, left: live.left };
    isle.insets = () => hole;
    isle.refitDue = true;
    isle.resize();
  });
  await page.waitForTimeout(1200);
};

const out = { note: "Layout options for the folded iPhone Duo (#1829). CSS overrides injected at run time; nothing in src/ changes.", browser: browser.version(), target: TARGET, options: [] };
try {
  for (const option of OPTIONS) {
    const rec = { id: option.id, name: option.name, sizes: {} };
    for (const size of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: size.dsf, reducedMotion: "reduce" });
      await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`${option.id} ${size.tag}: ${e}`));
      page.on("console", (m) => m.type() === "error" && errors.push(`${option.id} ${size.tag}: ${m.text()}`));
      await page.goto(url);
      await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
      rec.sizes[size.tag] = {};
      for (const phase of PHASES) {
        await craft(page, phase);
        await apply(page, option);
        const m = await page.evaluate(measure);
        rec.sizes[size.tag][phase] = m;
        console.log(`${option.id.padEnd(9)} ${size.tag} ${phase.padEnd(5)} island height share ${m.heightShare}, hex span ${m.hexSpan.width} wide x ${m.hexSpan.height} high, hole ${JSON.stringify(m.hole)}, controls ${m.controls}, issues ${m.issues.length}`);
        if (process.argv.includes("--dump")) console.log(JSON.stringify(m.seen), m.issues);
        if (size.required) {
          if (option.baseline || option.proposed === false) { await page.screenshot({ path: path.join(outDir, "pictures", `${option.id}-${size.tag}-${phase}.png`) }); continue; }
          await page.screenshot({ path: path.join(outDir, "pictures", `${option.id}-${size.tag}-${phase}.png`) });
          check(m.heightShare >= TARGET, `${option.id} ${size.tag} ${phase}: island height share ${m.heightShare} is under ${TARGET}`);
          check(m.issues.length === 0, `${option.id} ${size.tag} ${phase}: ${m.issues.join("; ")}`);
          check(!m.hscroll, `${option.id} ${size.tag} ${phase}: horizontal scroll`);
          const need = phase === "roll" ? ["Roll"] : ["build-open", "Trade", "End turn"];
          for (const label of need) check(Object.keys(m.seen).some((k) => k.startsWith(label)), `${option.id} ${size.tag} ${phase}: no visible ${label} button`);
        }
      }
      await ctx.close();
    }
    out.options.push(rec);
  }
} catch (e) {
  console.log(`FAIL the proof stopped: ${e.stack || e}`);
  failures.push("stopped");
} finally {
  await browser.close();
  await vite.close();
}
check(errors.length === 0, `page errors: ${errors.join(" | ")}`);
out.errors = errors;
writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(out, null, 2));
console.log(`failures: ${failures.length}, page errors: ${errors.length}`);
if (failures.length) process.exit(1);
if (!process.argv.includes("--save")) rmSync(outDir, { recursive: true, force: true });
console.log("duo-layout-options-prove: ok");
