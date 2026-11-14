// #1611 six players 8: the expanded lobby in real tabs through server/host.mjs (the host-side rules are in
// server/expanded-lobby-prove.mjs). At 390x844, 844x390 (touch) and 1280x720:
// - the Play page's Seats choice set to 6 makes "Host a table" open an expanded table;
// - a second and a third browser join with the code; every tab shows six seat rows, each with its seat number 1 to 6 and,
//   once taken, a colour dot, all six colours different;
// - the status asks for five ("Need N more players"), Start stays hidden at four even with everyone ready, the host's empty
//   rows offer Add bot up to the sixth seat and a guest's offer nothing;
// - the six rows sit inside the screen and the lobby card, do not overlap each other or the chat, every button in them is at
//   least 44x44 px and no text is under 12 px, also with the UI in the wide DejaVu Sans face (six-seats-prove's override);
// - Start opens a six-seat expanded game in every tab; the first turns are played (roll-off, setup), and a partner turn is
//   seen from two tabs: "Your partner turn" on the partner's, "<name>'s partner turn" on another;
// - a page that leaves the expanded capability out of its hello (stripped in that tab) is refused with "Update Emberisle
//   to join this table." on the Play page, and gets no seat;
// - the win screen's rematch choice (store-injected at 1280x720, the host's rules are in the node proof): the host gets
//   Fill with bots, Classic map and Cancel in place of Play again, a guest reads "The host is choosing how to rematch.";
// - after the host leaves with the choice up, a practice game's win shows Play again and none of the choice;
// - a seat that rejoins a started expanded game and leaves while expanded.ts is still on its way (held in this tab) has
//   nothing applied when it lands: still the title, no game, no live-table mark, no game log, no sound;
// - zero page errors.
// Every failure is listed before the run fails. SHOTS=1 writes real PNGs at device scale 2 into docs/proofs/1611/: the
// six-seat lobby from the host and from a guest, and the refused page, at each size.
// Run one browser proof at a time: flock /tmp/claude-0/browser.lock npm run expanded-lobby-ui-prove
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/1611";
const UPDATE = "Update Emberisle to join this table.";
const WIDE = 'html, body, button, input, select { font-family: "DejaVu Sans", sans-serif !important; }';
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
  { tag: "1280x720", width: 1280, height: 720 },
];

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-xlobby-ui-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, PROFILES_DIR: `${ROOMS_DIR}/profiles`, OPEN_CAP: "100", ACT_CAP: "1000", ACT_RATE: "1000", TURN_MS: "600000", TURN_TOTAL_MS: "6000000", BOT_ANSWER_MS: "50", PEOPLE_FIRST_MS: "0" },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const { chooseBotAction } = await vite.ssrLoadModule("/src/lib/game/ai.ts");
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

const errors = [];
const failures = [];
const check = (ok, msg) => {
  if (!ok) {
    failures.push(msg);
    console.log(`FAIL ${msg}`);
  } else console.log(`ok   ${msg}`);
  return ok;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = SHOTS ? 120_000 : 15_000) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(50);
  }
  throw new Error(`timed out: ${what}`);
};
const tap = (v, loc) => (v.touch ? loc.tap() : loc.click());
const store = (page, fn, arg) => page.evaluate(fn, arg);

// `drawn`: the island is drawn in this tab (only for pictures). Software WebGL at scale 2 is slow, so a tab that is never
// pictured never draws, and every wait is longer while pictures are taken.
async function tab(v, name, { old = false, drawn = SHOTS } = {}) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: SHOTS ? 2 : 1 });
  ctx.setDefaultTimeout(SHOTS ? 120_000 : 30_000);
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag} ${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${v.tag} ${name}: ${e}`));
  await page.addInitScript((name) => {
    window.__emberisleSkipIntro = true;
    localStorage.setItem("emberisle-name", name);
  }, name);
  // An old page: the same client with the capability taken out of every hello it sends.
  // Every sound the page starts, for the late-state check.
  await page.addInitScript(() => {
    window.__plays = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__plays.push(this.src);
      return play.call(this);
    };
  });
  if (old)
    await page.addInitScript(() => {
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        try {
          const msg = JSON.parse(data);
          if (msg.type === "hello") {
            delete msg.caps;
            return send.call(this, JSON.stringify(msg));
          }
        } catch {}
        return send.call(this, data);
      };
    });
  if (!drawn)
    await page.addInitScript(() => {
      for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) WebGL2RenderingContext.prototype[fn] = function () {};
    });
  await page.goto(url);
  await page.getByTestId("title-card").waitFor();
  return { ctx, page, name, v };
}

async function playPage(t) {
  const { page, v } = t;
  if ((await page.getByTestId("title-card").getAttribute("data-page")) === "front") await tap(v, page.getByRole("button", { name: "Play", exact: true }));
  await page.getByRole("button", { name: "Play with bots", exact: true }).waitFor();
}

async function join(t, code) {
  await playPage(t);
  // Enter in the code field does what Join does (EmberisleApp); a tap can wait out a long frame of the island being drawn.
  await t.page.getByPlaceholder("Code").fill(code);
  await t.page.getByPlaceholder("Code").press("Enter");
}

// Each seat row as drawn: its number, whether it has a dot, its box, and what it offers.
const rows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="lobby-players"] > li')].map((li) => {
      const r = li.getBoundingClientRect();
      const dot = li.querySelector("span.rounded-full");
      return {
        // The number as drawn; "Seat " before it is for screen readers only.
        n: li.querySelector(".seat-no")?.lastChild?.textContent ?? null,
        color: dot && getComputedStyle(dot).visibility !== "hidden" ? dot.style.background : null,
        box: [r.left, r.top, r.right, r.bottom],
        add: Boolean(li.querySelector('[data-testid="add-bot"]')),
      };
    }),
  );
const statusText = (page) => page.getByTestId("lobby-status").textContent();

// Layout of the seat rows: inside the screen and the card, no overlap with each other or the chat and actions, 44 px
// buttons, no text under 12 px.
async function layout(t, label) {
  const m = await t.page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    };
    const card = box(document.querySelector('[data-testid="lobby-card"] .lobby-layout-cover'));
    const lis = [...document.querySelectorAll('[data-testid="lobby-players"] > li')].map(box);
    const others = ["lobby-chat", "lobby-actions"].map((id) => document.querySelector(`[data-testid="${id}"]`)).filter(Boolean).map(box);
    const buttons = [...document.querySelectorAll('[data-testid="lobby-players"] button')].filter((b) => b.getClientRects().length).map(box);
    const small = [];
    for (const el of document.querySelectorAll('[data-testid="lobby-card"] *')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (el.closest(".sr-only") || !el.getClientRects().length || getComputedStyle(el).visibility === "hidden") continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 12) small.push(`${el.textContent.trim().slice(0, 20)} ${px}px`);
    }
    // Text cut inside a seat row: a name or status wider than its box.
    const cut = [...document.querySelectorAll('[data-testid="lobby-players"] .seat-no')].filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent);
    return { card, lis, others, buttons, small, cut, vw: innerWidth, vh: innerHeight };
  });
  const hit = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  check(m.lis.length === 6, `${label}: ${m.lis.length} seat rows`);
  check(m.lis.every((r) => r.l >= 0 && r.t >= 0 && r.r <= m.vw && r.b <= m.vh), `${label}: every seat row inside the screen`);
  check(m.lis.every((r) => r.l >= m.card.l && r.r <= m.card.r && r.t >= m.card.t && r.b <= m.card.b), `${label}: every seat row inside the lobby card`);
  check(!m.lis.some((a, i) => m.lis.some((b, j) => i < j && hit(a, b))), `${label}: seat rows do not overlap`);
  check(!m.lis.some((a) => m.others.some((b) => hit(a, b))), `${label}: seat rows do not overlap the chat or the actions`);
  check(m.buttons.every((b) => b.w >= 44 - 0.5 && b.h >= 44 - 0.5), `${label}: buttons in the seat rows are at least 44x44 (${m.buttons.map((b) => `${Math.round(b.w)}x${Math.round(b.h)}`).join(" ")})`);
  check(!m.small.length, `${label}: no text under 12 px ${m.small.join(", ")}`);
  check(!m.cut.length, `${label}: seat numbers not cut ${m.cut.join(", ")}`);
}

async function wideLayout(t, label) {
  const style = await t.page.addStyleTag({ content: WIDE });
  await sleep(150);
  await layout(t, `${label} wide font`);
  await style.evaluate((el) => el.remove());
}

async function shot(t, name) {
  if (!SHOTS) return;
  await sleep(600);
  await t.page.screenshot({ path: `${SHOT_DIR}/${name}-${t.v.tag}.png` });
}

const snap = (page) => store(page, () => { const g = window.__emberisle.getState(); return { state: g.state, localId: g.localId, legal: g.legal, screen: g.screen }; });

// The people play their own seats until a person's partner turn: they roll, place as the bot would, and end a primary
// turn at once. Bots are the host's.
async function toPartnerTurn(tabs) {
  const end = Date.now() + 120_000;
  for (;;) {
    if (Date.now() > end) throw new Error("no partner turn of a person in time");
    for (const t of tabs) {
      const { state: g, localId: me, legal } = await snap(t.page);
      if (!g || g.phase === "over") continue;
      if (g.role === "partner" && g.current === me) return t;
      const mine = legal && (legal.actions.length || legal.outpost.length || legal.path.length || legal.wayfarer.length || legal.discard);
      if (!mine) continue;
      const action = g.phase === "main" ? { type: "endTurn" } : g.phase === "roll" || g.phase === "rollOff" ? { type: "roll" } : chooseBotAction(g, me);
      if (!action) continue;
      await store(t.page, (a) => window.__emberisle.getState().dispatch(a), action);
      await sleep(80);
    }
    await sleep(40);
  }
}

try {
  for (const v of VIEWS) {
    // The host picks six seats on the Play page and hosts.
    const h = await tab(v, "Hana");
    await playPage(h);
    const options = h.page.getByTestId("wayfarer-setup");
    if (!(await options.evaluate((d) => d.open))) await tap(v, options.locator("summary"));
    await h.page.getByRole("combobox", { name: "Seats", exact: true }).selectOption("6");
    await tap(v, h.page.getByRole("button", { name: "Host a table", exact: true }));
    await h.page.getByTestId("table-code").waitFor();
    const code = (await h.page.getByTestId("table-code").textContent()).trim();
    check((await store(h.page, () => window.__emberisle.getState().tableVariant)) === "expanded", `${v.tag}: Seats 6 hosts an expanded table`);
    let hr = await rows(h.page);
    check(JSON.stringify(hr.map((r) => r.n)) === '["1","2","3","4","5","6"]', `${v.tag}: host sees six rows numbered 1 to 6 (${hr.map((r) => r.n)})`);
    check(hr.filter((r) => r.add).length === 5, `${v.tag}: host's five empty rows offer Add bot`);
    check((await statusText(h.page)) === "Need 4 more players", `${v.tag}: status "${await statusText(h.page)}"`);

    // Two guests join.
    const g1 = await tab(v, "Gus");
    await join(g1, code);
    const g2 = await tab(v, "Ivy", { drawn: false });
    await join(g2, code);
    for (const t of [g1, g2]) await t.page.getByTestId("table-code").waitFor();
    await until(async () => (await rows(h.page)).filter((r) => r.color).length === 3, "three seated on the host");
    const gr = await rows(g1.page);
    check(JSON.stringify(gr.map((r) => r.n)) === '["1","2","3","4","5","6"]', `${v.tag}: guest sees six rows numbered 1 to 6`);
    check(!gr.some((r) => r.add), `${v.tag}: a guest's empty rows offer nothing`);
    check((await statusText(g1.page)) === "Need 2 more players", `${v.tag}: guest status "${await statusText(g1.page)}"`);

    // An old page is refused on the Play page and gets no seat.
    const old = await tab(v, "Olaf", { old: true });
    await join(old, code);
    const alert = old.page.getByText(UPDATE, { exact: true }).first();
    await until(() => alert.isVisible(), "the update message");
    check(await alert.isVisible(), `${v.tag}: an old page reads "${UPDATE}"`);
    check((await store(old.page, () => window.__emberisle.getState().screen)) === "title", `${v.tag}: the old page stays on the Play page`);
    const px = await alert.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    check(px >= 12, `${v.tag}: the update message is ${px} px`);
    await shot(old, "refused");
    check((await rows(h.page)).filter((r) => r.color).length === 3, `${v.tag}: the old page took no seat`);
    await old.ctx.close();

    // Bots: one to four seats; four cannot start even with everyone ready.
    await tap(v, h.page.getByTestId("add-bot").first());
    await until(async () => (await rows(h.page)).filter((r) => r.color).length === 4, "four seated");
    for (const t of [h, g1, g2]) await tap(v, t.page.getByRole("button", { name: "Ready", exact: true }));
    await until(async () => (await statusText(h.page)) === "Need 1 more player", "status asks for one more");
    check((await statusText(h.page)) === "Need 1 more player", `${v.tag}: four ready still need one more`);
    check((await h.page.getByRole("button", { name: "Start", exact: true }).count()) === 0, `${v.tag}: no Start at four`);
    // To the cap.
    await tap(v, h.page.getByTestId("add-bot").first());
    await until(async () => (await rows(h.page)).filter((r) => r.color).length === 5, "five seated");
    check((await h.page.getByRole("button", { name: "Start", exact: true }).count()) === 1, `${v.tag}: Start at five`);
    await tap(v, h.page.getByTestId("add-bot").first());
    await until(async () => (await rows(h.page)).filter((r) => r.color).length === 6, "six seated");
    hr = await rows(h.page);
    check(!hr.some((r) => r.add), `${v.tag}: no Add bot once all six are seated`);
    check(new Set(hr.map((r) => r.color)).size === 6, `${v.tag}: six different colours (${hr.map((r) => r.color).join(" ")})`);
    await until(async () => (await rows(g2.page)).filter((r) => r.color).length === 6, "six seated on a guest");
    await layout(h, `${v.tag} host lobby`);
    await layout(g1, `${v.tag} guest lobby`);
    await shot(h, "lobby-host");
    await shot(g1, "lobby-guest");
    await wideLayout(h, `${v.tag} host lobby`);
    await wideLayout(g1, `${v.tag} guest lobby`);

    // Start: every tab gets the six-seat expanded game.
    await tap(v, h.page.getByRole("button", { name: "Start", exact: true }));
    for (const t of [h, g1, g2]) await t.page.waitForFunction(() => window.__emberisle.getState().screen === "play" && window.__emberisle.getState().state?.players.length === 6, null, { timeout: 15000 });
    const st = (await snap(h.page)).state;
    check(st.variant?.kind === "expanded" && st.hexes.length === 30, `${v.tag}: Start deals the expanded island (${st.hexes.length} hexes)`);
    check(JSON.stringify(st.players.map((p) => p.seat).sort()) === "[1,2,3,4,5,6]", `${v.tag}: seats numbered 1 to 6 in the game`);

    // First turns, to a person's partner turn, seen from two tabs.
    const partner = await toPartnerTurn([h, g1, g2]);
    const other = [h, g1, g2].find((t) => t !== partner);
    const pg = (await snap(partner.page)).state;
    const name = pg.players.find((p) => p.id === pg.current).name;
    await until(async () => (await partner.page.getByTestId("turn-banner").textContent()) === "Your partner turn", "the partner's status");
    check((await partner.page.getByTestId("turn-banner").textContent()) === "Your partner turn", `${v.tag}: ${partner.name}'s tab reads "Your partner turn"`);
    await until(async () => (await other.page.getByTestId("turn-banner").textContent()) === `${name}'s partner turn`, "another tab's status");
    check((await other.page.getByTestId("turn-banner").textContent()) === `${name}'s partner turn`, `${v.tag}: ${other.name}'s tab reads "${name}'s partner turn"`);
    if (v.tag === "1280x720") {
      // The finished game with the host choosing, as the host's seat list says it (only this tab's store is changed).
      const over = (t, choose) => store(t.page, (choose) => { const g = window.__emberisle; const st = g.getState().state; g.setState({ state: { ...st, phase: "over", winner: st.players[0].id }, rematchChoice: choose }); }, choose);
      await over(h, ["bots", "classic"]);
      await over(g1, ["bots", "classic"]);
      await h.page.getByTestId("win-again-bots").waitFor();
      check(await h.page.getByTestId("win-again-bots").textContent() === "Fill with bots" && await h.page.getByTestId("win-again-classic").textContent() === "Classic map" && await h.page.getByTestId("win-again-cancel").isVisible(), `${v.tag}: the host is offered Fill with bots, Classic map and Cancel`);
      check((await h.page.getByTestId("win-again").count()) === 0, `${v.tag}: no Play again while the host chooses`);
      check((await g1.page.getByTestId("win-waiting").textContent()) === "The host is choosing how to rematch.", `${v.tag}: a guest reads that the host is choosing`);
      check((await g1.page.getByTestId("win-again-bots").count()) === 0, `${v.tag}: a guest gets no choice`);
      await over(h, ["bots"]);
      check((await h.page.getByTestId("win-again-classic").count()) === 0, `${v.tag}: under three only the bot fill shows`);

      // The host leaves with the choice up and wins a practice game: Play again, and none of the old table's choice.
      await store(h.page, () => window.__emberisle.getState().goTitle());
      await store(h.page, () => window.__emberisle.getState().startAi());
      await h.page.waitForFunction(() => window.__emberisle.getState().mode === "ai" && window.__emberisle.getState().state);
      await store(h.page, () => { const g = window.__emberisle; const st = g.getState().state; g.setState({ state: { ...st, phase: "over", winner: st.players[0].id } }); });
      await h.page.getByTestId("win-again").waitFor();
      check(await h.page.getByTestId("win-again").isVisible(), `${v.tag}: after leaving, a practice win shows Play again`);
      check((await h.page.locator('[data-testid^="win-again-"]:not([data-testid="win-again-chip"])').count()) === 0, `${v.tag}: after leaving, a practice win shows none of the old table's choice`);

      // A seat back in the started game leaves while expanded.ts is held on the way: nothing is applied when it lands.
      const seat = await g2.page.evaluate(() => localStorage.getItem("emberisle-seat"));
      await g2.ctx.close();
      const r = await tab(v, "Rex", { drawn: false });
      await playPage(r);
      let release;
      const landed = new Promise((res) => (release = res));
      let asked = false;
      await r.page.route(/\/src\/lib\/game\/expanded\.ts/, async (route) => {
        asked = true;
        await landed;
        await route.continue();
      });
      await r.page.evaluate((seat) => {
        localStorage.setItem("emberisle-seat", seat);
        window.__emberisle.getState().rejoinTable();
      }, seat);
      await until(async () => asked && (await store(r.page, () => window.__emberisle.getState().code)), "the rejoin welcome, expanded.ts held");
      await sleep(800);
      check((await store(r.page, () => window.__emberisle.getState().state)) === null, `${v.tag}: the expanded state waits for expanded.ts`);
      await store(r.page, () => window.__emberisle.getState().goTitle());
      const plays = await r.page.evaluate(() => window.__plays.length);
      release();
      await sleep(1500);
      const after = await store(r.page, () => { const g = window.__emberisle.getState(); return { screen: g.screen, state: g.state, log: g.gameLog.length, live: localStorage.getItem("emberisle-seat-live"), plays: window.__plays.length }; });
      check(after.screen === "title" && after.state === null, `${v.tag}: after leaving, the late chunk applies no game (screen ${after.screen})`);
      check(after.live === null && after.log === 0, `${v.tag}: after leaving, no live-table mark and no game log from the late state`);
      check(after.plays === plays, `${v.tag}: after leaving, the late state plays no sound`);
      await r.ctx.close();
    }
    for (const t of [h, g1, g2]) await t.ctx.close().catch(() => {});
  }
} catch (e) {
  failures.push(String(e?.stack ?? e));
  console.log(`FAIL ${e?.stack ?? e}`);
}
check(!errors.length, `no page errors ${errors.join(" | ")}`);
await browser.close();
await vite.close();
if (failures.length) {
  console.log(`expanded-lobby-ui-prove: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("expanded-lobby-ui-prove: all checks passed at 390x844, 844x390 and 1280x720");
process.exit(0);
