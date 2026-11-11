// Design capture for #1300: the 672 x 176 desktop dock, drawn into the real running game. Not a CI proof.
// Run from the repo root: node docs/design/desktop-dock-1274/capture.mjs [--save]
// It writes to a temp folder by default; --save writes the pictures and measurements.json into this folder.
// A practice game against three bots plays its setup and a few rounds with the game's own bot moves, then each state is set
// on the store. dock.tsx renders the game's own hand, chips and buttons into the fixed slots of dock.css. No src/ file changes.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const dir = "docs/design/desktop-dock-1274";
const out = process.argv.includes("--save") ? dir : mkdtempSync(path.join(tmpdir(), "emberisle-1300-"));
mkdirSync(out, { recursive: true });
const css = readFileSync(`${dir}/dock.css`, "utf8");

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

async function open(width, height) {
  const phone = width < 1000;
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${width}x${height}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${width}x${height}: ${m.text()}`));
  await page.addInitScript(() => {
    localStorage.setItem("emberisle-name", "Jarrod");
    localStorage.setItem("emberisle-jelly", "lite");
  });
  await page.goto(url);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle, null, { timeout: 90_000 });
  // The bots stop moving on their own; the loop below moves every seat, the player's too, with the bots' own choices.
  await page.evaluate(async () => {
    const ai = await import("/src/lib/game/ai.ts");
    const g = window.__emberisle;
    g.setState({ runBots: () => {} });
    for (let i = 0; i < 600; i++) {
      const s = g.getState();
      const st = s.state;
      if (st.phase === "over" || (st.turn >= 12 && st.current === s.localId && st.phase === "roll")) break;
      const pid = st.phase === "discard" ? st.players.find((p) => (st.discardNeeded[p.id] ?? 0) > 0).id : st.current;
      const a = ai.chooseBotAction(st, pid);
      if (!(a && s.dispatch(a, pid, true).ok)) s.dispatch({ type: "endTurn" }, pid, true);
    }
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// One state on the store: whose turn, the phase, the dice, the player's hand and fortunes, an open offer or none.
const set = (page, f) =>
  page.evaluate((f) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const me = st.players.find((p) => p.id === g.getState().localId);
    const tide = st.players.find((p) => p.id !== me.id);
    st.current = f.mine ? me.id : tide.id;
    st.phase = f.phase ?? "main";
    if (f.dice) {
      st.dice = f.dice;
      st.rolls = (st.rolls ?? 0) + 1;
    }
    me.resources = { ...f.hand };
    me.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0, ...f.fortunes };
    me.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
    st.playedCard = false;
    st.seq += 1;
    const offer = f.offer ? { tradeId: "t1300", from: tide.id, fromName: tide.name, give: f.offer.give, want: f.offer.want, until: Date.now() + 600_000 } : null;
    g.setState({ state: st, offer, declined: [], buildMode: "none", error: null });
  }, f);

// Every number the README quotes comes from here.
function measure() {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { x: +b.x.toFixed(3), y: +b.y.toFixed(3), w: +b.width.toFixed(3), h: +b.height.toFixed(3) };
  };
  const dock = document.querySelector('[data-testid="mock-dock"]');
  const slots = Object.fromEntries([...dock.querySelectorAll("[data-slot]")].filter((el) => ["hand", "turn", "aside", "controls", "meta"].includes(el.dataset.slot)).map((el) => [el.dataset.slot, r(el)]));
  const controls = [...dock.querySelectorAll('[data-slot="controls"] > button')].map((b) => ({ name: b.dataset.control, ...r(b), disabled: b.getAttribute("aria-disabled") === "true", primary: b.classList.contains("bg-fg") }));
  const edges = [...dock.querySelectorAll('[data-slot="controls"] > button')].map((b) => b.getBoundingClientRect());
  const gaps = edges.slice(1).map((b, i) => +(b.left - edges[i].right).toFixed(3));
  const answers = [...dock.querySelectorAll('[data-slot="aside"] > button')].map((b) => ({ name: b.textContent.trim(), ...r(b) }));
  const costs = [...dock.querySelectorAll('[data-testid^="mock-build-"]')].map((b) => {
    const t = b.getBoundingClientRect();
    const chips = [...b.querySelectorAll('[data-testid^="cost-"]')];
    const inside = chips.every((c) => {
      const q = c.getBoundingClientRect();
      return q.left >= t.left - 0.5 && q.right <= t.right + 0.5 && q.top >= t.top - 0.5 && q.bottom <= t.bottom + 0.5;
    });
    return { kind: b.dataset.testid.replace("mock-build-", ""), chips: chips.length, short: chips.filter((c) => c.dataset.short).length, inside, why: b.querySelector(".dd-why")?.textContent ?? null };
  });
  // A tab is clipped if any box around it that hides overflow cuts it, or the window does.
  const tabs = [...dock.querySelectorAll(".goods-tab")].map((t) => {
    const q = t.getBoundingClientRect();
    let clipped = q.top < 0 || q.left < 0 || q.right > innerWidth || q.bottom > innerHeight;
    for (let a = t.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflow === "visible") continue;
      const c = a.getBoundingClientRect();
      if (q.top < c.top - 0.5 || q.left < c.left - 0.5 || q.right > c.right + 0.5 || q.bottom > c.bottom + 0.5) clipped = true;
    }
    return { text: t.textContent, ...r(t), clipped };
  });
  const small = [...dock.querySelectorAll("button, [role=button]")].filter((b) => {
    const q = b.getBoundingClientRect();
    return q.width < 44 || q.height < 44;
  }).map((b) => b.getAttribute("aria-label") || b.textContent.trim());
  const fonts = [...new Set([...dock.querySelectorAll("*")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => parseFloat(getComputedStyle(el).fontSize)))].sort((a, b) => a - b);
  // The scene: the band above the dock, right of the seat rail. Island pixels: the corners of every hex on screen.
  const rail = [...document.querySelectorAll(".seat-card")].map((c) => c.getBoundingClientRect());
  const railRight = Math.max(...rail.map((b) => b.right));
  const d = dock.getBoundingClientRect();
  const isle = window.__isle;
  const pts = window.__emberisle.getState().state.vertices.map((v) => isle.screenOf(v.id)).filter(Boolean);
  const island = { x: Math.round(Math.min(...pts.map((p) => p.x))), y: Math.round(Math.min(...pts.map((p) => p.y))) };
  island.w = Math.round(Math.max(...pts.map((p) => p.x))) - island.x;
  island.h = Math.round(Math.max(...pts.map((p) => p.y))) - island.y;
  const ins = isle.insets();
  const turn = dock.querySelector('[data-slot="turn"]');
  return {
    dock: r(dock), slots, turnLine: turn.textContent, turnFits: turn.scrollWidth <= turn.clientWidth, controls, gaps, answers, costs, tabs, under44: small, fontSizes: fonts,
    goodsNames: [...new Set([...dock.querySelectorAll(".goods-card > .goods-label")].map((el) => parseFloat(getComputedStyle(el).fontSize)))],
    scene: { x: Math.round(railRight), y: 0, w: Math.round(innerWidth - railRight), h: Math.round(d.top) },
    island, islandAboveDock: island.y + island.h <= d.top, islandClearOfRail: island.x >= railRight,
    fitHole: { x: ins.left, y: ins.top, w: innerWidth - ins.left - ins.right, h: innerHeight - ins.top - ins.bottom },
  };
}

const NONE = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
const HAND = { timber: 2, clay: 1, wool: 1, grain: 2, ore: 3 };
const STATES = [
  ["own-turn", { mine: true, dice: [5, 3], hand: HAND, fortunes: { knight: 1 } }],
  ["offer-a", { mine: false, hand: HAND, fortunes: { knight: 1 }, offer: { give: { wool: 2 }, want: { ore: 1 } } }, "slot"],
  ["offer-b", { mine: false, hand: HAND, fortunes: { knight: 1 }, offer: { give: { wool: 2 }, want: { ore: 1 } } }, "row"],
  ["other-turn", { mine: false, hand: HAND, fortunes: { knight: 1 } }],
  ["gain", { mine: false, dice: [4, 2], hand: { ...HAND, timber: 3, grain: 4 }, fortunes: { knight: 1 } }],
  ["loss", { mine: false, hand: { ...HAND, ore: 1 }, fortunes: { knight: 1 } }],
  ["empty", { mine: true, dice: [2, 1], hand: NONE }],
  ["roll", { mine: true, phase: "roll", hand: HAND, fortunes: { knight: 1 } }],
];
// Each state that shows a cue first sets the hand it starts from, so the change is what the cards show.
const BEFORE = { gain: HAND, loss: HAND };

const results = [];
// Pictures wait here and are written only after every check passes.
const pictures = [];
try {
  // Desktop: the mock dock in every state.
  const page = await open(1280, 720);
  await page.addStyleTag({ content: css });
  const mount = (place) => page.evaluate(async (place) => (await import("/docs/design/desktop-dock-1274/dock.tsx")).mount(place), place);
  for (const [name, f, place = "slot"] of STATES) {
    // A cue holds 2500 ms and fades over 500 ms, so each state waits out the last one's before it is drawn.
    if (BEFORE[name]) {
      await set(page, { ...f, hand: BEFORE[name], dice: undefined });
      await mount(place);
      await page.waitForTimeout(3500);
      await set(page, f);
      if (!(await mount(place))) throw new Error("the mock dock did not mount at 1280x720");
      await page.waitForTimeout(600);
    } else {
      await set(page, f);
      if (!(await mount(place))) throw new Error("the mock dock did not mount at 1280x720");
      await page.waitForTimeout(3500);
    }
    await page.mouse.move(0, 0);
    const m = await page.evaluate(measure);
    results.push({ state: name, viewport: "1280x720", ...m });
    pictures.push([`${name}-1280x720.png`, await page.screenshot()]);
    console.log(`${name}: dock ${m.dock.w}x${m.dock.h} at ${m.dock.x},${m.dock.y}; turn "${m.turnLine}" fits ${m.turnFits}; controls ${m.controls.map((c) => c.name).join("/")}; gaps ${[...new Set(m.gaps)].join("/")}; tabs ${m.tabs.map((t) => `${t.text}${t.clipped ? " CLIPPED" : ""}`).join(" ") || "none"}; under 44 ${m.under44.join(",") || "none"}; fonts ${m.fontSizes.join("/")}; scene ${m.scene.w}x${m.scene.h} at ${m.scene.x},0; island ${m.island.w}x${m.island.h} at ${m.island.x},${m.island.y}, above dock ${m.islandAboveDock}`);
  }
  await page.context().close();

  // Phones: today's game in the own-turn state, before and after mount(). The mock must change nothing there.
  for (const [width, height] of [[390, 844], [844, 390]]) {
    const tag = `${width}x${height}`;
    const phone = await open(width, height);
    await set(phone, STATES[0][1]);
    await phone.waitForTimeout(3500);
    const boxes = () => phone.evaluate(() => [...document.querySelectorAll("[data-hud-stack], [data-hud-stack] button, [data-hud-stack] [role=button]")].map((el) => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }));
    const before = await boxes();
    await phone.addStyleTag({ content: css });
    const mounted = await phone.evaluate(async () => (await import("/docs/design/desktop-dock-1274/dock.tsx")).mount("slot"));
    await phone.waitForTimeout(300);
    const after = await boxes();
    const unchanged = JSON.stringify(before) === JSON.stringify(after);
    results.push({ state: "own-turn", viewport: tag, mockMounted: mounted, hudBoxes: before.length, unchanged });
    pictures.push([`phone-${tag}.png`, await phone.screenshot()]);
    console.log(`${tag}: mock mounted ${mounted}; ${before.length} HUD boxes; unchanged ${unchanged}`);
    await phone.context().close();
  }

  // The slots must not move between states.
  const desk = results.filter((x) => x.viewport === "1280x720");
  const key = (x) => JSON.stringify({ dock: x.dock, slots: x.slots, controls: x.controls.map(({ x, y, w, h }) => [x, y, w, h]) });
  const same = desk.every((x) => key(x) === key(desk[0]));
  console.log(`slot rectangles equal in all ${desk.length} desktop states: ${same}`);
  if (errors.length) console.log(errors.join("\n"));
  // The README's claims, checked before anything is written: the run fails if any does not hold.
  const NAMES = "Path/Outpost/Stronghold/Buy fortune/Trade/Fortunes/End turn";
  const CHIPS = { path: 2, outpost: 4, stronghold: 2, card: 3 };
  const SIZES_OK = [9, 12, 14, 15, 16, 17.5, 30];
  const TABS = { gain: 2, loss: 1 };
  const fails = [];
  if (!same) fails.push("slot rectangles differ between states");
  for (const x of desk) {
    const names = x.controls.map((c) => c.name).join("/");
    if (x.controls.length !== 7) fails.push(`${x.state}: ${x.controls.length} controls`);
    if (x.state !== "offer-b" && names !== NAMES) fails.push(`${x.state}: controls ${names}`);
    if (x.under44.length) fails.push(`${x.state}: under 44 px ${x.under44.join(", ")}`);
    if (x.gaps.some((g) => g < 7.99 || g > 8.01)) fails.push(`${x.state}: gaps ${x.gaps.join("/")}`);
    if (x.tabs.length !== (TABS[x.state] ?? 0)) fails.push(`${x.state}: ${x.tabs.length} gain or loss tabs`);
    if (x.tabs.some((t) => t.clipped || Math.abs(t.y - (x.dock.y - 16)) > 0.5 || Math.abs(t.h - 28) > 0.5)) fails.push(`${x.state}: a tab is clipped, not 28 px tall or not 16 px above the dock`);
    if (x.costs.some((c) => !c.inside || (!c.why && c.chips !== CHIPS[c.kind]))) fails.push(`${x.state}: cost chips wrong or outside their tile`);
    if (!x.turnFits) fails.push(`${x.state}: the turn line is cut`);
    if (x.fontSizes.some((s) => !SIZES_OK.includes(s))) fails.push(`${x.state}: text sizes ${x.fontSizes.join("/")}`);
    if (x.goodsNames.join() !== "12") fails.push(`${x.state}: goods names ${x.goodsNames.join("/")} px, not 12`);
  }
  for (const x of results.filter((r) => r.viewport !== "1280x720")) if (x.mockMounted || !x.unchanged) fails.push(`${x.viewport}: the mock changed the phone layout`);
  if (errors.length) fails.push(`${errors.length} browser errors`);
  if (fails.length) throw new Error(`capture checks failed:\n${fails.join("\n")}`);
  for (const [file, png] of pictures) writeFileSync(`${out}/${file}`, png);
  writeFileSync(`${out}/measurements.json`, JSON.stringify({ chromium: browser.version(), slotsEqual: same, browserErrors: errors, results }, null, 2) + "\n");
  console.log(`chromium ${browser.version()}; written to ${out}; browser errors ${errors.length}`);
  console.log("capture checks passed: equal slots, 7 controls in order, 44 px targets, 8 px gaps, chip counts inside tiles, tab count and position, unclipped tabs, turn line fits, text sizes, 12 px goods names, phone layout untouched, no browser errors");
} finally {
  await browser.close();
  await vite.close();
}
