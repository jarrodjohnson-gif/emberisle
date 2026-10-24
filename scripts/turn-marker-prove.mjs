// #531 (T-2): the seat on turn always carries the current-turn marker. In a 3-seat hotseat game at 1280x720 (the rail), 390x844
// and 844x390 (the phone strip, touch), after every move (the roll-off, every setup placement, every roll, robber and discard,
// and every pass):
// - exactly one `[data-current-turn="true"]` is mounted in the page, and exactly one is visible. The rail and the strip never
//   mount together (Hud.tsx), so the attribute sits on the one card that shows; the proof counts mounted elements, not only
//   visible ones, so a hidden second marker would fail it too;
// - its seat id equals `state.current`, and it has a non-zero box inside the viewport;
// - it wears the ring (a 3 px inset ring in the seat's colour, read from the card's ::before) and a turn mark with a
//   non-zero box: the non-colour cue, so the turn never rests on colour alone (#312);
// - the check itself fails on zero markers and on two, proved on the live page (the attribute removed, a clone added).
// Also:
// - on the strip the card rises 2 px (translateY(-2px)) under motion and does not under reduced motion, while its button, the
//   control on the safe-area edge, stays level with the other seats'; on the rail nothing rises;
// - an open trade offer from the seat on turn, and the win row of the seat on turn, wear the ring and the turn mark without
//   adding a second `[data-current-turn]`, and a win row is the same height with and without them; an offer from a seat that is
//   not on turn wears neither.
// Zero console errors. Saves test-results/turn-marker-<size>*.png. Run: npm run turn-marker-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8531;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720, seat: "rail", strip: false },
  { tag: "390x844", width: 390, height: 844, touch: true, seat: "seat", strip: true },
  { tag: "844x390", width: 844, height: 390, touch: true, seat: "seat", strip: true },
];
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

// The check on what the page shows: null when it holds, else why it fails. `read` is { mounted, visible: [marker] } from the page.
function verdict(read, want) {
  if (read.mounted === 0 || read.visible.length === 0) return `no [data-current-turn] marker (${read.mounted} mounted, ${read.visible.length} visible)`;
  if (read.mounted > 1 || read.visible.length > 1) return `${read.mounted} markers mounted, ${read.visible.length} visible: ${JSON.stringify(read.visible.map((m) => m.id))}`;
  const [m] = read.visible;
  if (m.id !== `${want.seat}-${want.id}`) return `the marker is on ${m.id}, state.current is ${want.id}`;
  if (!(m.w > 0 && m.h > 0)) return `the marker has a ${m.w}x${m.h} box`;
  if (!m.inView) return `the marker is outside the viewport ${JSON.stringify(m.box)}`;
  if (!m.ring.startsWith(`${want.rgb} 0px 0px 0px 3px inset`)) return `the ring is not 3 px in ${want.rgb}: ${m.ring}`;
  if (!(m.markW > 0 && m.markH > 0)) return `the turn mark has a ${m.markW}x${m.markH} box`;
  return null;
}

// The check must fail on zero markers and on two, whatever the page does: proved here on fixtures, and below on the live page.
{
  const ok = { id: "seat-p1", w: 80, h: 44, inView: true, box: {}, ring: "rgb(45, 110, 232) 0px 0px 0px 3px inset, x", markW: 10, markH: 5 };
  const want = { seat: "seat", id: "p1", rgb: "rgb(45, 110, 232)" };
  assert.equal(verdict({ mounted: 1, visible: [ok] }, want), null, "a good marker passes");
  assert.match(verdict({ mounted: 0, visible: [] }, want), /no \[data-current-turn\] marker/, "zero markers fail");
  assert.match(verdict({ mounted: 2, visible: [ok, { ...ok, id: "seat-p0" }] }, want), /2 markers mounted, 2 visible/, "two markers fail");
  assert.match(verdict({ mounted: 2, visible: [ok] }, want), /2 markers mounted, 1 visible/, "a hidden second marker fails");
  assert.match(verdict({ mounted: 1, visible: [{ ...ok, id: "seat-p0" }] }, want), /state.current is p1/, "the wrong seat fails");
  assert.match(verdict({ mounted: 1, visible: [{ ...ok, w: 0 }] }, want), /0x44 box/, "a zero box fails");
  assert.match(verdict({ mounted: 1, visible: [{ ...ok, markW: 0 }] }, want), /turn mark/, "no turn mark fails");
  assert.match(verdict({ mounted: 1, visible: [{ ...ok, ring: "none" }] }, want), /ring is not 3 px/, "no ring fails");
}

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(3));
    await page.getByTestId(`${v.seat}-p0`).waitFor();
    const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    // What the page shows now: every mounted marker, the visible ones with their box, ring and turn mark, and the seat on turn.
    const read = () =>
      page.evaluate(() => {
        const st = window.__emberisle.getState().state;
        const cur = st.players.find((p) => p.id === st.current);
        const all = [...document.querySelectorAll('[data-current-turn="true"]')];
        const visible = all
          .filter((el) => el.checkVisibility({ visibilityProperty: true }) && el.getClientRects().length > 0)
          .map((el) => {
            const b = el.getBoundingClientRect();
            const mark = el.querySelector('[data-testid="turn-mark"]')?.getBoundingClientRect();
            return {
              id: el.dataset.testid,
              w: b.width,
              h: b.height,
              box: { l: b.left, t: b.top, r: b.right, b: b.bottom },
              inView: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
              ring: getComputedStyle(el, "::before").boxShadow,
              markW: mark?.width ?? 0,
              markH: mark?.height ?? 0,
            };
          });
        return { read: { mounted: all.length, visible }, id: cur.id, color: cur.color };
      });
    const want = (r) => ({ seat: v.seat, id: r.id, rgb: rgb(r.color) });
    const check = async (at) => {
      await settle();
      const r = await read();
      const why = verdict(r.read, want(r));
      assert.equal(why, null, `${v.tag} ${at}: ${why}`);
      return r;
    };

    // Play the game: a legal move at a time, the marker checked after each. A pass is an endTurn in the main phase.
    const step = () =>
      page.evaluate(() => {
        const g = window.__emberisle;
        const s = g.getState();
        const st = s.state;
        const hi = s.highlights();
        const ph = st.phase;
        if (ph === "rollOff" || ph === "roll") s.dispatch({ type: "roll" });
        else if (ph === "setupSettle" && hi.vertices[0]) s.pickVertex(hi.vertices[0]);
        else if (ph === "setupRoad" && hi.edges[0]) s.pickEdge(hi.edges[0]);
        else if (ph === "robber" && hi.hexes[0]) {
          s.pickHex(hi.hexes[0]);
          const steal = g.getState().pendingSteal;
          if (steal) g.getState().chooseSteal(steal.targets[0]);
        } else if (ph === "discard") {
          for (const [pid, n] of Object.entries(st.discardNeeded)) {
            let left = n;
            const resources = {};
            for (const [res, have] of Object.entries(st.players.find((p) => p.id === pid).resources)) {
              const take = Math.min(have, left);
              if (take) resources[res] = take;
              left -= take;
            }
            s.dispatch({ type: "discard", resources }, pid);
          }
        } else if (ph === "main") {
          if (!s.dispatch({ type: "endTurn" }).ok) return { ph, stuck: true };
          return { ph, pass: true };
        } else return { ph, stuck: true };
        return { ph };
      });
    const turns = new Set();
    let passes = 0;
    let moves = 0;
    const first = await check("start");
    turns.add(first.id);
    for (; passes < 7 && moves < 150; moves++) {
      const s = await step();
      assert.ok(!s.stuck, `${v.tag}: no legal move in phase ${s.ph}`);
      if (s.pass) passes++;
      turns.add((await check(`after move ${moves + 1} (${s.ph}${s.pass ? ", a pass" : ""})`)).id);
    }
    assert.equal(passes, 7, `${v.tag}: seven passes were played`);
    assert.deepEqual([...turns].sort(), ["p0", "p1", "p2"], `${v.tag}: the turn visited all three seats`);
    console.log(`${v.tag}: ${moves} moves, ${passes} passes, the marker on exactly one visible seat after each, always on state.current`);

    // The check fails on zero and on two, on the live page.
    const live = await read();
    await page.evaluate(() => {
      const el = document.querySelector('[data-current-turn="true"]');
      window.__clone = el.cloneNode(true);
      el.after(window.__clone);
    });
    assert.match(verdict((await read()).read, want(live)), /2 markers mounted, 2 visible/, `${v.tag}: a cloned marker is two markers`);
    await page.evaluate(() => {
      window.__clone.remove();
      const el = document.querySelector('[data-current-turn="true"]');
      window.__stash = el;
      el.removeAttribute("data-current-turn");
    });
    assert.match(verdict((await read()).read, want(live)), /no \[data-current-turn\] marker/, `${v.tag}: a removed marker is zero markers`);
    await page.evaluate(() => window.__stash.setAttribute("data-current-turn", "true"));
    assert.equal(verdict((await read()).read, want(live)), null, `${v.tag}: the restored marker passes again`);

    // The rise: on the strip the card rises 2 px under motion and not under reduced motion, while its button (the control, on the
    // safe-area edge) stays level with the other seats'; the rail never rises.
    const rise = () =>
      page.evaluate((seat) => {
        const cur = document.querySelector('[data-current-turn="true"]');
        const other = [...document.querySelectorAll(`[data-testid^="${seat}-p"]`)].find((c) => c !== cur);
        const btn = cur.querySelector(":scope > button");
        const top = (el) => el.getBoundingClientRect().top;
        return {
          card: getComputedStyle(cur).transform,
          button: getComputedStyle(btn).transform,
          kids: [...btn.children].map((k) => getComputedStyle(k).transform),
          cardAbove: top(other) - top(cur),
          buttonAbove: top(other.querySelector(":scope > button")) - top(btn),
          cardToButton: top(btn) - top(cur),
        };
      }, v.seat);
    const matrix = (y) => `matrix(1, 0, 0, 1, 0, ${y})`;
    await page.waitForTimeout(400);
    const moving = await rise();
    if (v.strip) {
      assert.deepEqual([moving.card, moving.button, ...new Set(moving.kids)], [matrix(-2), matrix(2), matrix(-2)], `${v.tag}: card, button and content transforms ${JSON.stringify(moving)}`);
      assert.deepEqual([moving.cardAbove, moving.buttonAbove], [2, 0], `${v.tag}: the card is 2 px above the other seats and its button level with theirs ${JSON.stringify(moving)}`);
    } else {
      assert.deepEqual([moving.card, moving.button, ...new Set(moving.kids)], ["none", "none", "none"], `${v.tag}: nothing rises on the rail ${JSON.stringify(moving)}`);
      assert.equal(moving.cardToButton, 0, `${v.tag}: the rail card and its button share a top ${JSON.stringify(moving)}`);
    }
    await page.screenshot({ path: `test-results/turn-marker-${v.tag}.png` });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(100);
    const calm = await rise();
    assert.deepEqual([calm.card, calm.button, ...new Set(calm.kids)], ["none", "none", "none"], `${v.tag}: no rise under reduced motion ${JSON.stringify(calm)}`);
    if (v.strip) assert.deepEqual([calm.cardAbove, calm.buttonAbove], [0, 0], `${v.tag}: level under reduced motion ${JSON.stringify(calm)}`);
    assert.equal(verdict((await read()).read, want(live)), null, `${v.tag}: the ring and mark stay under reduced motion`);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // The trade toast: an offer from the seat on turn wears that seat's ring and turn mark; no second [data-current-turn].
    const chip = (testid) =>
      page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        const mark = el.querySelector('[data-testid="turn-mark"]')?.getBoundingClientRect();
        return { ring: el.dataset.turnRing ?? null, shadow: getComputedStyle(el, "::before").boxShadow, markW: mark?.width ?? 0, markH: mark?.height ?? 0 };
      }, testid);
    const offerFrom = (pick) =>
      page.evaluate((pick) => {
        const g = window.__emberisle;
        const st = g.getState().state;
        const from = pick === "current" ? st.current : st.players.find((p) => p.id !== st.current).id;
        g.setState({ offer: { tradeId: "t531", from, fromName: st.players.find((p) => p.id === from).name, give: { wool: 1 }, want: { ore: 1 }, until: Date.now() + 600_000 }, declined: [] });
      }, pick);
    await offerFrom("current");
    await page.getByTestId("trade-toast").waitFor();
    let toast = await chip("trade-toast");
    const cur = await check("trade toast open");
    assert.equal(toast.ring, "true", `${v.tag}: the offer from the seat on turn wears the ring`);
    assert.ok(toast.shadow.startsWith(`${rgb(cur.color)} 0px 0px 0px 3px inset`) && toast.markW > 0 && toast.markH > 0, `${v.tag}: the offer's ring is the seat's colour and has a turn mark ${JSON.stringify(toast)}`);
    await page.screenshot({ path: `test-results/turn-marker-${v.tag}-trade.png` });
    await offerFrom("other");
    await settle();
    toast = await chip("trade-toast");
    assert.deepEqual([toast.ring, toast.markW], [null, 0], `${v.tag}: an offer from a seat that is not on turn wears no ring or mark ${JSON.stringify(toast)}`);
    await page.evaluate(() => window.__emberisle.setState({ offer: null }));

    // The win rows: the row of the seat on turn wears the ring and turn mark, takes no room, and the page still has the one marker.
    const rows = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="win-row"]')].map((row) => {
          const c = row.querySelector(".turn-chip");
          const mark = row.querySelector('[data-testid="turn-mark"]')?.getBoundingClientRect();
          return { player: row.dataset.player, h: row.getBoundingClientRect().height, ring: c.dataset.turnRing ?? null, shadow: getComputedStyle(c, "::before").boxShadow, markW: mark?.width ?? 0 };
        }),
      );
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.phase = "over";
      st.winner = st.current;
      g.setState({ state: st });
    });
    await page.getByTestId("win-screen").waitFor();
    const onTurn = await check("win screen open");
    const withRing = await rows();
    assert.equal(withRing.length, 3, `${v.tag}: three win rows`);
    for (const r of withRing) {
      const mine = r.player === onTurn.id;
      assert.equal(r.ring, mine ? "true" : null, `${v.tag}: win row ${r.player} ring ${r.ring}, turn is ${onTurn.id}`);
      assert.equal(r.markW > 0, mine, `${v.tag}: win row ${r.player} turn mark ${r.markW}`);
      if (mine) assert.ok(r.shadow.startsWith(`${rgb(onTurn.color)} 0px 0px 0px 3px inset`), `${v.tag}: the win row's ring is the seat's colour ${r.shadow}`);
    }
    await page.screenshot({ path: `test-results/turn-marker-${v.tag}-win.png` });
    // Move the turn to another seat (the winner stays): the same rows, with the ring on another one, are the same heights.
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.current = st.players.find((p) => p.id !== st.winner).id;
      g.setState({ state: st });
    });
    const moved = await check("win screen, turn moved");
    const without = await rows();
    assert.deepEqual(without.map((r) => r.player), withRing.map((r) => r.player), `${v.tag}: the rows keep their order`);
    assert.deepEqual(without.map((r) => r.h), withRing.map((r) => r.h), `${v.tag}: the ring and mark take no room (${JSON.stringify(withRing.map((r) => r.h))} vs ${JSON.stringify(without.map((r) => r.h))})`);
    assert.deepEqual(without.filter((r) => r.ring === "true").map((r) => r.player), [moved.id], `${v.tag}: the ring moved with the turn`);
    console.log(`${v.tag}: strip rise ${v.strip ? "2 px under motion, none under reduced motion" : "none on the rail"}; trade offer and win row wear the ring and mark; zero and two markers fail`);
    await ctx.close();
  }
  assert.deepEqual(errors, [], "console errors");
  console.log("turn-marker-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
