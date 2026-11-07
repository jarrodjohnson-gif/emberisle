// #1101: the phone dock is one stationary box (docs/design/app-review/final, design laws 1, 2, 5 and 6). At 390x844 and
// 844x390 (touch) it cycles: your turn, an incoming offer, another seat's turn, an off-turn gain, an off-turn loss, an
// empty hand, the roll phase, a real roll (measured while the dice land and after), the robber, a discard, setup, a
// watcher and game over. In each it measures the dock box and every slot in it (x, y, width, height) and asserts they are
// identical to the first state: nothing appears, disappears or resizes. Every control in the dock is at least 44x44 px with
// 8 px to its neighbours; upright, every control sits in the bottom third. The island keeps at least 60 % of the height
// upright, and the full height beside the 320 px column sideways; no dock state reaches into its hole.
// Run: npm run stationary-dock-prove (add `--shots <dir>` to save a screenshot of every state, and a 1280x720 one).
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8111;
const STEP_MS = 30_000;
const at = process.argv.indexOf("--shots");
const shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
// The slots the dock always holds. Each falls back to what the same thing was before the dock, so a run on the old HUD
// measures it too (and finds the jump).
const SLOTS = {
  goods: '[data-slot="goods"], [data-testid="hand-dock"]',
  status: '[data-slot="status"], [data-testid="turn-banner"]',
  path: '[data-testid="build-path"]',
  outpost: '[data-testid="build-outpost"]',
  stronghold: '[data-testid="build-stronghold"]',
  card: '[data-testid="build-card"]',
  trade: '[data-slot="trade"]',
  fortunes: '[data-testid="fortunes-button"]',
  turn: '[data-slot="turn"]',
  menu: '[aria-label="Table menu"]',
  log: '[data-testid="log-line"]',
};
const SIZES = [
  { width: 390, height: 844, slots: Object.keys(SLOTS) },
  { width: 844, height: 390, slots: [...Object.keys(SLOTS), "seats", "chat"] },
];
const HAND = { timber: 3, clay: 1, wool: 2, grain: 2, ore: 0 };

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const failures = [];
const check = (ok, what, data) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${data === undefined ? "" : ` ${JSON.stringify(data)}`}`);
  if (!ok) failures.push(what);
};
const frames = (page, n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);
let code = 0;
try {
  for (const size of SIZES) {
    const tag = `${size.width}x${size.height}`;
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle?.renders > 0, null, { timeout: STEP_MS });
    // The bots hold still: every state below is set on the store.
    await page.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
    // One table state: the phase, whose turn, this seat's hand and fortunes, and an offer from the seat on turn.
    const set = (o) =>
      page.evaluate((o) => {
        const g = window.__emberisle;
        const s = g.getState();
        const st = structuredClone(s.state);
        const me = st.players.find((p) => p.id === s.localId);
        const other = st.players.find((p) => p.id !== s.localId);
        st.phase = o.phase ?? "main";
        st.current = o.mine ? me.id : other.id;
        st.dice = o.phase === "roll" || o.phase === "setupSettle" ? null : [3, 5];
        st.discardNeeded = o.phase === "discard" ? { [me.id]: 4 } : {};
        st.winner = o.phase === "over" ? me.id : null;
        st.seq++;
        me.resources = o.hand;
        me.hidden = { ...me.hidden, plenty: o.held };
        g.setState({
          state: st, spectator: !!o.watching, banner: null, error: null, buildMode: "none", tradeOutcome: null, tradeTaker: null, declined: [],
          offer: o.offer ? { tradeId: "t1101", from: other.id, fromName: other.name, give: { wool: 1 }, want: { timber: 1 }, until: Date.now() + 600_000 } : null,
        });
      }, o);
    const settle = async () => {
      await frames(page, 6);
      await page.waitForTimeout(350);
    };
    const measure = () =>
      page.evaluate(({ SLOTS, names }) => {
        const box = (el) => {
          if (!el || !el.getClientRects().length) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
        };
        const dock = document.querySelector('[data-testid="dock"]') ?? document.querySelector("[data-hud-stack]");
        const find = (name) => {
          const el = SLOTS[name] ? document.querySelector(SLOTS[name]) : null;
          if (el || name !== "trade") return el ?? document.querySelector(`[data-slot="${name}"]`);
          // The old HUD's Trade and End turn had no slot of their own.
          return [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Trade") ?? null;
        };
        const slots = Object.fromEntries(names.map((n) => [n, box(n === "turn" ? (find(n) ?? [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "End turn")) : find(n))]));
        // Every control in the dock a finger can press, as boxes, with a name for the report.
        const targets = dock
          ? [...dock.querySelectorAll('button, [role="button"], a[href], input, select, textarea, [tabindex="0"]')]
              .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.closest(".sr-only"))
              .map((el) => ({ name: (el.getAttribute("aria-label") || el.textContent || el.dataset.testid || el.tagName).trim().slice(0, 24), ...box(el) }))
          : [];
        const isle = window.__isle;
        const status = document.querySelector('[data-slot="status"]');
        return {
          dock: box(dock), slots, targets, hole: isle.insets(), live: isle.liveInsets(), vh: innerHeight, vw: innerWidth,
          moment: !!document.querySelector('[data-testid="roll-moment"]'),
          statusTurn: !!status?.querySelector('[data-testid="turn-banner"]'),
          statusDice: !!status?.querySelector('[data-testid="dice-row"]'),
          goodsEmpty: !document.querySelector('[data-slot="goods"]')?.children.length,
        };
      }, { SLOTS, names: size.slots });

    const states = [
      ["your turn", async () => set({ mine: true, hand: HAND, held: 1 })],
      ["offer", async () => set({ mine: false, hand: HAND, held: 1, offer: true })],
      ["other's turn", async () => set({ mine: false, hand: HAND, held: 1 })],
      ["off-turn gain", async () => {
        await set({ mine: false, hand: HAND, held: 1 });
        await settle();
        await set({ mine: false, hand: { ...HAND, timber: HAND.timber + 2 }, held: 1 });
        await page.locator('[data-testid="resource-flash"][data-sign="+"]').first().waitFor({ timeout: STEP_MS });
      }],
      ["off-turn loss", async () => {
        await set({ mine: false, hand: HAND, held: 1 });
        await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
        await set({ mine: false, hand: { ...HAND, wool: 0 }, held: 1 });
        await page.locator('[data-testid="resource-flash"][data-sign="-"]').first().waitFor({ timeout: STEP_MS });
      }],
      ["empty hand", async () => {
        await set({ mine: true, hand: { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 }, held: 0 });
        await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: STEP_MS });
      }],
      ["roll phase", async () => set({ mine: true, hand: HAND, held: 1, phase: "roll" })],
      // The roll itself, through the dock's own Roll button, measured while the dice land. The dice are steered to 3 and 5
      // (crypto.getRandomValues feeds rollDie), so no 7 sends the table to a discard first.
      ["rolling", async () => {
        await page.evaluate(() => {
          const queue = [2, 4];
          const real = crypto.getRandomValues.bind(crypto);
          crypto.getRandomValues = (buf) => (queue.length && buf instanceof Uint32Array && buf.length === 1 ? ((buf[0] = queue.shift()), buf) : real(buf));
        });
        await page.locator('[data-testid="dock"] [data-slot="turn"] button').click();
        await page.waitForFunction(() => window.__emberisle.getState().state.phase === "main", null, { timeout: STEP_MS });
      }],
      ["after the roll", async () => {
        const dice = await page.evaluate(() => window.__emberisle.getState().state.dice);
        check(JSON.stringify(dice) === "[3,5]", `${tag} rolling: the dock's Roll button rolled the steered dice`, dice);
        await page.waitForTimeout(1500);
      }],
      ["robber", async () => set({ mine: true, hand: HAND, held: 1, phase: "robber" })],
      ["discard", async () => {
        await set({ mine: true, hand: HAND, held: 1, phase: "discard" });
        await page.getByTestId("discard-count").waitFor({ timeout: STEP_MS });
      }],
      ["setup", async () => set({ mine: true, hand: { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 }, held: 0, phase: "setupSettle" })],
      ["watcher", async () => set({ mine: false, hand: HAND, held: 0, watching: true })],
      ["game over", async () => set({ mine: true, hand: HAND, held: 1, phase: "over" })],
    ];
    let first = null;
    for (const [name, enter] of states) {
      await enter();
      await settle();
      const m = await measure();
      const label = `${tag} ${name}`;
      if (shots) await page.screenshot({ path: `${shots}/${tag}-${name.replace(/[^a-z]+/g, "-").replace(/-$/, "")}.png` });
      console.log(`     ${label}: dock ${JSON.stringify(m.dock)} slots ${JSON.stringify(m.slots)}`);
      check(!!m.dock, `${label}: the dock is on screen`);
      for (const [slot, b] of Object.entries(m.slots)) check(!!b, `${label}: slot ${slot} is on screen`);
      if (m.vw > m.vh) check(!!m.dock && Math.abs(m.dock.w - 320) <= 0.5, `${label}: the sideways dock is the 320 px column`, m.dock);
      if (name === "rolling") check(m.moment, `${label}: measured while the roll moment is up`);
      // The win sheet covers the table at game over; the status slot keeps its place with no turn line, only the last dice.
      if (name === "game over") check(!m.statusTurn && m.statusDice, `${label}: the status slot drops the turn line and keeps the last dice`, { turn: m.statusTurn, dice: m.statusDice });
      // A watcher has no hand: the goods slot keeps its box with nothing in it.
      if (name === "watcher") check(m.goodsEmpty, `${label}: the goods slot is empty`);
      if (!first) first = { name, ...m };
      else {
        const same = (a, b) => !!a && !!b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= 0.5);
        check(same(first.dock, m.dock), `${label}: the dock box matches ${first.name}`, { was: first.dock, now: m.dock });
        const moved = Object.keys(m.slots).filter((s) => !same(first.slots[s], m.slots[s]));
        check(!moved.length, `${label}: every slot matches ${first.name}`, moved.map((s) => ({ slot: s, was: first.slots[s], now: m.slots[s] })));
      }
      // Law 6: 44 px targets, 8 px apart.
      const small = m.targets.filter((t) => t.w < 44 || t.h < 44);
      check(!small.length, `${label}: every control is at least 44x44`, small);
      const close = [];
      for (let i = 0; i < m.targets.length; i++)
        for (let j = i + 1; j < m.targets.length; j++) {
          const a = m.targets[i], b = m.targets[j];
          const gap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
          if (gap < 7.5) close.push(`${a.name} / ${b.name}: ${Math.round(gap * 10) / 10}`);
        }
      check(!close.length, `${label}: controls are at least 8 px apart`, close);
      // Law 5: upright, everything pressed sits in the bottom third.
      if (m.vh > m.vw) {
        const high = m.targets.filter((t) => t.y < (m.vh * 2) / 3 - 0.5);
        check(!high.length, `${label}: every control is in the bottom third (y >= ${Math.round((m.vh * 2) / 3)})`, high);
      }
      // Law 3: the island's hole holds its share, and the dock stays out of it.
      const holeH = m.vh - m.hole.top - m.hole.bottom;
      if (m.vh > m.vw) check(holeH >= 0.6 * m.vh, `${label}: the island keeps at least 60 % of the height`, { hole: m.hole, share: Math.round((holeH / m.vh) * 1000) / 10 });
      else check(m.hole.top <= 12 && m.hole.bottom <= 12 && m.dock && m.hole.left >= m.dock.x + m.dock.w, `${label}: the island takes the full height beside the column`, { hole: m.hole, dock: m.dock });
      const over = ["top", "right", "bottom", "left"].filter((k) => m.live[k] > m.hole[k] + 0.5);
      check(!over.length, `${label}: the dock stays out of the island's hole`, { live: m.live, hole: m.hole });
    }
    await ctx.close();
  }
  if (shots) {
    // The desktop table is out of scope (#1101); one picture shows it unchanged.
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle?.renders > 0, null, { timeout: STEP_MS });
    await page.evaluate(() => {
      const g = window.__emberisle;
      g.setState({ runBots: () => {} });
      const st = structuredClone(g.getState().state);
      st.phase = "main"; st.current = g.getState().localId; st.dice = [3, 5]; st.seq++;
      st.players.find((p) => p.id === st.current).resources = { timber: 3, clay: 1, wool: 2, grain: 2, ore: 0 };
      g.setState({ state: st, banner: null });
    });
    await frames(page, 6);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${shots}/1280x720-your-turn.png` });
    await page.close();
  }
  check(errors.length === 0, "zero console errors", errors);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log("stationary-dock-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
