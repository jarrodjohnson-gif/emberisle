// #475: the in-game HUD keeps every control out of the notch and the home bar. Insets are emulated over CDP (Chromium has
// no standalone display mode; the page's env() is what installing changes), on three phones held both ways:
//   844x390 (47 left, 47 right, 21 bottom), 390x844 (47 top, 34 bottom) and 667x375 (44 left, 44 right, 21 bottom).
// At each, in a real practice game against the bots: the roll-off, the first setup outpost with the touch PlaceChip up,
// the setup path, the player's own roll, the main phase, a seat's player menu, the Table menu open, How to play, the trade panel and
// the win screen; and at a real three-seat online table through server/host.mjs, the chat button and the open chat sheet.
// Every time:
// - every visible interactive element (button, link, field, [role=button], tab stop), as far as it shows past any
//   scrolling ancestor, lies inside the safe rect;
// - the hole the HUD leaves (`__isle.insets()`) lies inside the safe rect, and every corner of the island, docks
//   included, projects inside that hole once the fit has settled (not checked over a full-screen sheet);
// - zero console errors.
// #491: on a sideways phone holding a full hand and every fortune, the column scrolls, and the Roll or End turn button
// (scrolled back to the top, the worst case) still lies fully inside the safe rect, is the topmost element at its centre
// and takes a real click.
// The chat dock and sheet are Chat.tsx (another lane): their controls are measured and listed, and fail the run only
// once CHAT_PENDING is set to false (#475's report names the change they need).
// Run: npm run hud-safe-area-prove. Port from VITE_PORT, default 8475. Screenshots to test-results/hud-safe-*.png.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const CHAT_PENDING = true;
// Software GL under a loaded CI runner can take seconds a frame; every wait gets this long.
const STEP_MS = 120_000;
const PORT = Number(process.env.VITE_PORT) || 8475;
const PHONES = [
  { width: 844, height: 390, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 390, height: 844, insets: { top: 47, right: 0, bottom: 34, left: 0 } },
  { width: 667, height: 375, insets: { top: 0, right: 44, bottom: 21, left: 44 } },
];
mkdirSync("test-results", { recursive: true });

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const URL_ = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const errors = [];
const fails = [];
const pending = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

async function phone({ width, height, insets }) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(STEP_MS);
  const tag = `${width}x${height}`;
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
  await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets });
  await page.goto(URL_);
  await page.waitForFunction(() => window.__emberisle);
  return { ctx, page, tag, insets };
}

const game = (page) => page.evaluate(() => window.__emberisle.getState().state);
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: STEP_MS });
const settled = (page) =>
  until(page, () => {
    const i = window.__isle;
    const st = window.__emberisle.getState().state;
    return i?.lastState && i.lastSeq === st.seq && !i.refitDue && !i.glide;
  });

// Every visible interactive element against the safe rect, and the island against the hole the HUD leaves.
async function prove(p, moment, { island = true } = {}) {
  const { page, tag, insets } = p;
  await page.waitForTimeout(350);
  if (island) await settled(page);
  const m = await page.evaluate(
    ({ insets, island }) => {
      const safe = { l: insets.left, t: insets.top, r: innerWidth - insets.right, b: innerHeight - insets.bottom };
      const env = getComputedStyle(document.body.appendChild(Object.assign(document.createElement("div"), {
        style: "position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
      })));
      const reached = [env.paddingTop, env.paddingRight, env.paddingBottom, env.paddingLeft].map(parseFloat);
      const sel = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
      const chat = (el) =>
        !!el.closest('[data-testid="chat-sheet"], section[aria-label="Table chat"]') || /^Open chat/.test(el.getAttribute("aria-label") ?? "");
      const out = [];
      const chatOut = [];
      let seen = 0;
      for (const el of document.querySelectorAll(sel)) {
        if (!el.checkVisibility({ visibilityProperty: true }) || el.closest(".sr-only")) continue;
        // What is on screen: the box clipped by every scrolling or clipping ancestor; scrolled out of view is not visible.
        const b = el.getBoundingClientRect();
        const r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (getComputedStyle(a).overflow === "visible") continue;
          const c = a.getBoundingClientRect();
          Object.assign(r, { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) });
        }
        if (r.right - r.left < 1 || r.bottom - r.top < 1) continue;
        seen++;
        if (r.left >= safe.l - 0.5 && r.top >= safe.t - 0.5 && r.right <= safe.r + 0.5 && r.bottom <= safe.b + 0.5) continue;
        const name = (el.getAttribute("aria-label") || el.getAttribute("data-testid") || el.textContent.trim() || el.tagName).slice(0, 28);
        (chat(el) ? chatOut : out).push(`${name}@${r.left | 0},${r.top | 0}-${r.right | 0},${r.bottom | 0}`);
      }
      if (!island) return { reached, seen, out, chatOut };
      const isle = window.__isle;
      const st = window.__emberisle.getState().state;
      const ins = isle.insets();
      const hole = { l: ins.left, t: ins.top, r: innerWidth - ins.right, b: innerHeight - ins.bottom };
      const holeSafe = hole.l >= safe.l && hole.t >= safe.t && hole.r <= safe.r && hole.b <= safe.b;
      const scale = (innerWidth / (isle.ortho.right - isle.ortho.left)) * isle.ortho.zoom;
      const corners = [];
      for (const v of st.vertices) {
        const q = isle.screenOf(v.id);
        const m = v.harbor ? 0.7 * scale : 0;
        if (Math.min(q.x - hole.l, hole.r - q.x, q.y - hole.t, hole.b - q.y) < m) corners.push(`${v.id}@${q.x | 0},${q.y | 0}`);
      }
      return {
        reached, seen, out, chatOut, overhead: isle.overhead, vertices: st.vertices.length, corners, holeSafe,
        hole: Object.fromEntries(Object.entries(hole).map(([k, v]) => [k, Math.round(v)])),
      };
    },
    { insets, island },
  );
  const want = [insets.top, insets.right, insets.bottom, insets.left];
  check(`${tag} ${moment}: the inset emulation reached env()`, m.reached.every((v, i) => v === want[i]), m.reached);
  check(`${tag} ${moment}: all ${m.seen} visible controls inside the safe area`, m.seen > 0 && m.out.length === 0, m.out.length ? m.out : undefined);
  if (m.chatOut.length) {
    if (CHAT_PENDING) {
      console.log(`PEND ${tag} ${moment}: chat controls under an inset (Chat.tsx) ${JSON.stringify(m.chatOut)}`);
      pending.push(`${tag} ${moment}`);
    } else check(`${tag} ${moment}: chat controls inside the safe area`, false, m.chatOut);
  }
  if (island) {
    check(`${tag} ${moment}: the HUD hole is inside the safe area`, m.overhead && m.holeSafe, m.hole);
    check(`${tag} ${moment}: all ${m.vertices} island corners and docks inside the hole`, m.vertices === 54 && m.corners.length === 0, m.corners.length ? m.corners.slice(0, 6) : undefined);
  }
  await page.screenshot({ path: `test-results/hud-safe-${tag}-${moment.replace(/[^a-z0-9]+/gi, "-")}.png` });
}

// A full hand and every fortune held, the column scrolled to its top: the primary action stays reachable (#491).
async function pinned(p, moment, name, mustScroll) {
  const { page, tag, insets } = p;
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const me = st.players.find((x) => x.id === g.getState().localId);
    for (const r of Object.keys(me.resources)) me.resources[r] = 5;
    for (const k of Object.keys(me.hidden)) me.hidden[k] = 2;
    for (const k of Object.keys(me.boughtThisTurn)) me.boughtThisTurn[k] = 0;
    st.playedCard = false;
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.waitForTimeout(350);
  const btn = page.getByRole("button", { name, exact: true });
  await btn.waitFor({ timeout: STEP_MS });
  const m = await btn.evaluate((el, insets) => {
    let sc = el.parentElement;
    while (sc && getComputedStyle(sc).overflowY !== "auto") sc = sc.parentElement;
    sc.scrollTop = 0;
    const b = el.getBoundingClientRect();
    const top = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    return {
      scrolls: sc.scrollHeight > sc.clientHeight,
      inside: b.left >= insets.left && b.top >= insets.top && b.right <= innerWidth - insets.right && b.bottom <= innerHeight - insets.bottom,
      box: [b.left, b.top, b.right, b.bottom].map(Math.round),
      topmost: el.contains(top),
      tall: b.height >= 44,
    };
  }, insets);
  if (mustScroll) check(`${tag} ${moment}: the column scrolls (full hand, every fortune)`, m.scrolls);
  check(`${tag} ${moment}: ${name} is inside the safe area, 44 px tall, uncovered, scrolled to the top`, m.inside && m.topmost && m.tall, m.box);
  // A trial click runs Playwright's actionability checks (visible, stable, receives events at its point) without pressing.
  const clickable = await btn.click({ trial: true, timeout: 5000 }).then(() => true, () => false);
  check(`${tag} ${moment}: ${name} is clickable`, clickable);
}

// One practice game against the bots, through its real phases.
async function practice(spec) {
  const p = await phone(spec);
  const { page } = p;
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await until(page, () => window.__emberisle.getState().state?.phase === "rollOff");
  const roll = page.getByRole("button", { name: "Roll", exact: true });
  await roll.waitFor({ timeout: STEP_MS });
  await prove(p, "roll-off");

  // A tie rolls again; the bots roll on their own.
  while ((await game(page)).phase === "rollOff") {
    if (await roll.isVisible()) await roll.click();
    await page.waitForTimeout(200);
  }

  // Setup: the first outpost is tapped on the board, which brings up the touch PlaceChip.
  await until(page, () => {
    const s = window.__emberisle.getState();
    return s.state.phase === "setupSettle" && s.state.current === s.localId;
  });
  await prove(p, "setup");
  // A tap that lands while a slow frame is still settling the camera can miss the mark, so it is re-read and tapped
  // again (it never places: the chip still has to be pressed).
  const chip = page.getByTestId("place-chip");
  for (let tries = 0; !(await chip.isVisible()); tries++) {
    if (tries === 5) throw new Error("setup: five taps on a legal corner brought up no PlaceChip");
    await settled(page);
    const spot = await page.evaluate(() => {
      const id = window.__emberisle.getState().highlights().vertices[0];
      return window.__isle.screenOf(id);
    });
    await page.touchscreen.tap(spot.x, spot.y);
    await chip.waitFor({ timeout: STEP_MS / 4 }).catch(() => {});
  }
  await prove(p, "setup PlaceChip");
  await page.getByTestId("place-chip").click();
  await until(page, () => window.__emberisle.getState().state.phase === "setupRoad");
  await prove(p, "setup path");

  // The rest of setup by the store, as the board's pick would; then wait for the player's own roll.
  for (;;) {
    const s = await page.evaluate(() => {
      const g = window.__emberisle.getState();
      return { phase: g.state.phase, mine: g.state.current === g.localId };
    });
    if (s.phase === "roll" && s.mine) break;
    if (s.mine && s.phase === "setupSettle") await page.evaluate(() => { const g = window.__emberisle.getState(); g.pickVertex(g.highlights().vertices[0]); });
    else if (s.mine && s.phase === "setupRoad") await page.evaluate(() => { const g = window.__emberisle.getState(); g.pickEdge(g.highlights().edges[0]); });
    else if (s.mine && s.phase === "robber") await page.evaluate(() => { const g = window.__emberisle.getState(); g.pickHex(g.highlights().hexes[0]); });
    await page.waitForTimeout(150);
  }
  await roll.waitFor({ timeout: STEP_MS });
  await prove(p, "roll");
  if (spec.width > spec.height) await pinned(p, "roll, full hand", "Roll");
  await roll.click();

  // A 7 sends the wayfarer first; then the main phase.
  for (;;) {
    const s = await page.evaluate(() => {
      const g = window.__emberisle.getState();
      return { phase: g.state.phase, mine: g.state.current === g.localId, steal: g.pendingSteal?.targets[0] ?? null, discard: g.state.discardNeeded[g.localId] ?? 0 };
    });
    if (s.phase === "main" && s.mine) break;
    if (s.steal) await page.evaluate((id) => window.__emberisle.getState().chooseSteal(id), s.steal);
    else if (s.mine && s.phase === "robber") await page.evaluate(() => { const g = window.__emberisle.getState(); g.pickHex(g.highlights().hexes[0]); });
    else if (s.phase === "discard" && s.discard > 0) {
      await page.evaluate((n) => {
        const g = window.__emberisle.getState();
        const me = g.state.players.find((x) => x.id === g.localId);
        const give = {};
        for (const r of Object.keys(me.resources)) {
          const k = Math.min(me.resources[r], n);
          if (k) give[r] = k;
          n -= k;
        }
        g.dispatch({ type: "discard", resources: give });
      }, s.discard);
    }
    await page.waitForTimeout(150);
  }
  await page.getByRole("button", { name: "End turn" }).waitFor({ timeout: STEP_MS });
  await prove(p, "main");
  if (spec.width > spec.height) await pinned(p, "main, full hand", "End turn", true);

  // A seat's player menu, the Table menu and the trade panel, each opened by its own control.
  // The player's own seat: in its main phase the menu carries the bank trade row.
  const seat = page.locator(`[data-menu-trigger="${await page.evaluate(() => window.__emberisle.getState().localId)}"]`);
  await seat.click();
  await page.getByTestId("player-menu").getByRole("button").first().waitFor({ timeout: STEP_MS });
  await prove(p, "player menu", { island: false });
  await seat.click();
  await page.getByTestId("player-menu").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Table menu" }).click();
  await page.getByTestId("table-menu").waitFor();
  await prove(p, "Table menu open", { island: false });
  await page.getByRole("button", { name: "How to play" }).click();
  await page.getByRole("dialog", { name: "How to play" }).waitFor();
  await prove(p, "How to play", { island: false });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "How to play" }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Trade", exact: true }).click();
  await page.getByTestId("trade-panel").waitFor();
  await prove(p, "trade panel", { island: false });
  await page.keyboard.press("Escape");
  await page.getByTestId("trade-panel").waitFor({ state: "detached" });

  // The win screen, on the real final state shape: this seat reaches the end.
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "over";
    st.winner = g.getState().localId;
    st.seq += 1;
    g.setState({ state: st });
  });
  await page.getByTestId("win-headline").waitFor({ timeout: STEP_MS });
  await prove(p, "win screen", { island: false });
  await p.ctx.close();
}

// A three-seat online table: the phone hosts, two small tabs join. The chat dock only exists online.
async function online(spec) {
  const p = await phone(spec);
  const { page } = p;
  const guests = [];
  await page.getByRole("button", { name: "Host a table" }).click();
  const code = (await page.getByTestId("table-code").textContent()).trim();
  for (let i = 0; i < 2; i++) {
    // Small, so their islands cost software GL little and the phone under test keeps its frames.
    const g = await browser.newPage({ viewport: { width: 360, height: 400 } });
    g.setDefaultTimeout(STEP_MS);
    g.on("pageerror", (e) => errors.push(`guest: ${e}`));
    await g.goto(`${URL_}&code=${code}`);
    // The join link fills the field after the first render; Enter before that submits nothing.
    await g.waitForFunction((c) => document.querySelector('input[aria-label="Join code"]')?.value === c, code, { timeout: STEP_MS });
    // Enter in the filled field submits the join (the same form as the Join button).
    await g.getByRole("textbox", { name: "Join code" }).press("Enter");
    await g.getByTestId("table-code").waitFor({ timeout: STEP_MS });
    // Guests are scaffolding: the keyboard presses their buttons without waiting on their island's frames.
    await g.getByRole("button", { name: "Ready", exact: true }).press("Enter");
    guests.push(g);
  }
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await until(page, () => window.__emberisle.getState().state?.phase === "rollOff");
  await page.getByRole("button", { name: /^Open chat/ }).waitFor({ timeout: STEP_MS });
  await prove(p, "online, chat closed");
  await page.getByRole("button", { name: /^Open chat/ }).click();
  await page.getByTestId("chat-sheet").waitFor();
  await prove(p, "online, chat open", { island: false });
  for (const g of guests) await g.close();
  await p.ctx.close();
}

let code = 0;
try {
  for (const spec of PHONES) {
    await practice(spec);
    await online(spec);
  }
  check("zero console errors", errors.length === 0, errors.length ? errors.slice(0, 8) : undefined);
  if (pending.length) console.log(`note ${pending.length} moments have chat controls under an inset, pending Chat.tsx (#475)`);
  if (fails.length) throw new Error(`${fails.length} check(s) failed`);
  console.log("hud-safe-area-prove: ok");
} catch (e) {
  console.log(`FAIL ${e.message}`);
  if (errors.length) console.log(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
process.exit(code);
