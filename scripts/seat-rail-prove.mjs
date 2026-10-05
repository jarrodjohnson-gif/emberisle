// #443: each seat is one line with the points as the number. In hotseat at 1280x720 (the rail), 390x844, 667x375 and
// 844x390 (the strip, touch):
// - every seat box is at most 44 px tall and its points are the largest text in it; no seat text says "0 goods",
//   "0 fortunes", "goods ·" or " vp"; a seat with goods or fortunes shows them as small counts ("1 good", "3 goods",
//   "1 fortune" for screen readers) where the cell is at least 160 px wide, a seat with none shows no count;
// - the roll-off die is on every seat during the roll-off and on none once it is settled;
// - exactly the seat on turn carries `seat-turn` and aria-current, its dot has the pulse animation and an ink ring, and
//   both move when the turn moves; under reduced motion the ring stays and the animation goes;
// - your own seat shows your hidden points as "+N" ("N points, plus N hidden" for screen readers) and nobody else's does;
// - tapping a seat opens its facts, which match the line, tapping again closes them; your own facts list your fortunes by
//   kind ("knight ×1 · points ×2 (1 new)");
// - a dropped seat shows a visible reconnecting marker at every size and its facts say so;
// - no seat overlaps the Table menu button or the Watching chip, and every seat is inside the viewport.
// Zero console errors. Saves test-results/seat-rail-<size>.png. Run: npm run seat-rail-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8443;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720, seat: "rail" },
  { tag: "390x844", width: 390, height: 844, touch: true, seat: "seat" },
  { tag: "667x375", width: 667, height: 375, touch: true, seat: "seat" },
  { tag: "844x390", width: 844, height: 390, touch: true, seat: "seat" },
];

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
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    const ids = await page.evaluate(() => window.__emberisle.getState().state.players.map((p) => p.id));
    const seat = (id) => page.getByTestId(`${v.seat}-${id}`);
    await seat(ids[0]).waitFor();
    const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    // Every seat line, read from the page: its box, the text drawn in it, the largest font and the one on the points.
    const lines = () =>
      page.evaluate((sel) => {
        const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).position !== "absolute";
        return [...document.querySelectorAll(`[data-testid^="${sel}-p"]`)].map((el) => {
          const r = el.getBoundingClientRect();
          const texts = [...el.querySelectorAll("*")].filter((x) => shown(x) && [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
          const vp = el.querySelector('[data-testid="seat-vp"]');
          const dot = el.querySelector(".seat-dot");
          const ds = getComputedStyle(dot);
          const button = el.querySelector("button");
          return {
            id: el.dataset.testid,
            h: Math.round(r.height),
            box: { l: r.left, t: r.top, r: r.right, b: r.bottom },
            inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            text: el.textContent,
            spill: texts.filter((x) => x.getBoundingClientRect().top < r.top || x.getBoundingClientRect().bottom > r.bottom).length,
            maxFont: Math.max(...texts.map((x) => parseFloat(getComputedStyle(x).fontSize))),
            vpShown: shown(vp),
            vpFont: parseFloat(getComputedStyle(vp).fontSize),
            vpWeight: getComputedStyle(vp).fontWeight,
            vp: vp.textContent,
            goods: el.querySelector('[data-testid="seat-goods"]')?.textContent ?? null,
            fortunes: el.querySelector('[data-testid="seat-fortunes"]')?.textContent ?? null,
            die: [...el.querySelectorAll('[data-testid="rolloff-die"]')].filter(shown).length,
            away: (() => {
              const a = el.querySelector('[data-testid="seat-away"]');
              return a ? { w: Math.round(a.getBoundingClientRect().width), word: shown(a.lastElementChild.previousElementSibling) } : null;
            })(),
            turn: el.classList.contains("seat-turn"),
            current: button.getAttribute("aria-current"),
            expanded: button.getAttribute("aria-expanded"),
            dotAnim: ds.animationName,
            dotRing: ds.outlineStyle !== "none" && parseFloat(ds.outlineWidth) >= 2,
          };
        });
      }, v.seat);
    const current = () => page.evaluate(() => window.__emberisle.getState().state.current);
    const checkLines = (ls, phase) => {
      assert.equal(ls.length, 4, `${v.tag} ${phase}: four seats`);
      for (const l of ls) {
        assert.ok(l.h <= 44, `${v.tag} ${phase}: ${l.id} is ${l.h} px tall`);
        assert.ok(l.inView, `${v.tag} ${phase}: ${l.id} is off screen ${JSON.stringify(l.box)}`);
        assert.equal(l.spill, 0, `${v.tag} ${phase}: ${l.id} has ${l.spill} text nodes outside its box`);
        // #420: a strip cell under 100 px shows the die without the points during the roll-off.
        if (l.vpShown) assert.ok(l.vpFont === l.maxFont && l.vpFont >= 20 && Number(l.vpWeight) >= 600, `${v.tag} ${phase}: ${l.id} points ${l.vpFont}px/${l.vpWeight}, largest ${l.maxFont}px`);
        else assert.ok(phase === "rollOff" && l.die === 1 && l.box.r - l.box.l < 100, `${v.tag} ${phase}: ${l.id} hides its points outside a narrow roll-off cell`);
        assert.doesNotMatch(l.text, /0 goods|0 fortunes|goods ·| vp\b/, `${v.tag} ${phase}: ${l.id} says "${l.text}"`);
      }
    };
    const checkTurn = (ls, id, phase) => {
      const on = ls.filter((l) => l.turn);
      assert.deepEqual(on.map((l) => l.id), [`${v.seat}-${id}`], `${v.tag} ${phase}: seat-turn on ${JSON.stringify(on.map((l) => l.id))}, turn is ${id}`);
      assert.ok(ls.every((l) => l.turn === (l.current === "true")), `${v.tag} ${phase}: aria-current follows the turn`);
      assert.ok(on[0].dotAnim === "seat-pulse" && on[0].dotRing, `${v.tag} ${phase}: the dot on turn pulses and wears a ring ${JSON.stringify({ anim: on[0].dotAnim, ring: on[0].dotRing })}`);
      assert.ok(ls.filter((l) => !l.turn).every((l) => l.dotAnim === "none" && !l.dotRing), `${v.tag} ${phase}: the other dots are still`);
    };

    // Roll-off: a die on every seat, no counts yet (nobody holds anything).
    let ls = await lines();
    checkLines(ls, "rollOff");
    checkTurn(ls, await current(), "rollOff");
    assert.ok(ls.every((l) => l.die === 1), `${v.tag} rollOff: a die on every seat`);
    assert.ok(ls.every((l) => l.goods === null && l.fortunes === null), `${v.tag} rollOff: no counts on an empty seat`);

    // The turn moves: so does the pulse, and only the pulse.
    const next = ids[2];
    await page.evaluate((id) => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.current = id;
      g.setState({ state: st });
    }, next);
    await settle();
    checkTurn(await lines(), next, "turn moved");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await settle();
    const calm = (await lines()).find((l) => l.turn);
    assert.ok(calm.dotAnim === "none" && calm.dotRing, `${v.tag}: under reduced motion the ring stays and the pulse stops ${JSON.stringify({ anim: calm.dotAnim, ring: calm.dotRing })}`);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // Through the roll-off and setup to the main phase: the die leaves, the hands fill, your hidden points show as +N.
    const mid = await page.evaluate(async () => {
      const g = window.__emberisle;
      for (let i = 0; i < 60; i++) {
        const s = g.getState();
        const ph = s.state.phase;
        const hi = s.highlights();
        if (ph === "rollOff") s.dispatch({ type: "roll" });
        else if (ph === "setupSettle" && hi.vertices[0]) s.pickVertex(hi.vertices[0]);
        else if (ph === "setupRoad" && hi.edges[0]) s.pickEdge(hi.edges[0]);
        else if (ph === "roll") s.dispatch({ type: "roll" });
        else if (ph === "robber" && hi.hexes[0]) {
          s.pickHex(hi.hexes[0]);
          const steal = g.getState().pendingSteal;
          if (steal) g.getState().chooseSteal(steal.targets[0]);
        } else break;
      }
      const st = structuredClone(g.getState().state);
      // The seat on turn is the actor in hotseat, so its hidden points show; another seat's never do.
      st.players.forEach((p) => {
        p.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
        p.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
      });
      const me = st.players.find((p) => p.id === st.current);
      const [a, b, c] = st.players.filter((p) => p !== me);
      me.hidden.vp = 2;
      me.hidden.knight = 1;
      me.boughtThisTurn.vp = 1;
      b.hidden.vp = 1;
      a.resources = { timber: 2, clay: 1, wool: 0, grain: 0, ore: 0 };
      b.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
      c.resources = { timber: 0, clay: 0, wool: 1, grain: 0, ore: 0 };
      g.setState({ state: st });
      return { phase: st.phase, me: me.id, a: a.id, b: b.id, c: c.id };
    });
    assert.equal(mid.phase, "main", `${v.tag}: reached the main phase`);
    await settle();
    ls = await lines();
    checkLines(ls, "main");
    checkTurn(ls, mid.me, "main");
    const by = (id) => ls.find((l) => l.id === `${v.seat}-${id}`);
    assert.ok(ls.every((l) => l.die === 0), `${v.tag} main: no roll-off die after the roll-off`);
    // On a strip cell under 160 px the counts yield to the name (the facts are a tap away), so they are read where they fit.
    const cellW = by(mid.a).box.r - by(mid.a).box.l;
    const wide = v.seat === "rail" || cellW >= 160;
    console.log(`${v.tag}: cells ${Math.round(cellW)} px, counts ${wide ? "shown" : "folded into the facts"}`);
    if (wide) {
      assert.equal(by(mid.a).goods, "3 goods", `${v.tag} main: seat a shows 3 goods, got ${JSON.stringify(by(mid.a).goods)}`);
      assert.equal(by(mid.b).fortunes, "1 fortune", `${v.tag} main: seat b shows 1 fortune, got ${JSON.stringify(by(mid.b).fortunes)}`);
      assert.equal(by(mid.c).goods, "1 good", `${v.tag} main: seat c shows 1 good`);
    }
    assert.equal(by(mid.b).goods, null, `${v.tag} main: seat b holds nothing and shows no goods count`);
    assert.equal(by(mid.c).fortunes, null, `${v.tag} main: seat c has no fortune and shows no fortunes count`);
    assert.match(by(mid.me).vp, /^\d+ points, plus 2 hidden\+2$/, `${v.tag} main: your seat shows your hidden points, got ${JSON.stringify(by(mid.me).vp)}`);
    assert.ok(ls.filter((l) => l.id !== `${v.seat}-${mid.me}`).every((l) => !l.vp.includes("+")), `${v.tag} main: nobody else's hidden points show`);
    await page.screenshot({ path: `test-results/seat-rail-${v.tag}.png` });

    // A tap opens the seat's facts, which match the line; the same tap closes them.
    const menu = page.getByTestId("player-menu");
    const factsOf = async (id) => {
      const button = seat(id).getByRole("button");
      await button.click();
      await menu.waitFor();
      assert.equal(await button.getAttribute("aria-expanded"), "true", `${v.tag}: the tapped seat is expanded`);
      const facts = await menu.getByTestId("menu-facts").locator("dd").allTextContents();
      const labels = await menu.getByTestId("menu-facts").locator("dt").allTextContents();
      const fits = await menu.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      });
      assert.ok(fits, `${v.tag}: the facts are inside the viewport`);
      await button.click();
      await menu.waitFor({ state: "detached" });
      return Object.fromEntries(labels.map((l, i) => [l, facts[i]]));
    };
    const aFacts = await factsOf(mid.a);
    const line = (await lines()).find((l) => l.id === `${v.seat}-${mid.a}`);
    const fromLine = [3, 0, Number(line.vp.match(/\d+/)[0])];
    assert.deepEqual([aFacts["Cards in hand"], aFacts["Fortunes held"], aFacts["Points shown"]].map(Number), fromLine, `${v.tag}: facts ${JSON.stringify(aFacts)} match the line`);
    assert.equal(aFacts["Your fortunes"], undefined, `${v.tag}: another seat's facts list no fortunes by kind`);
    const myFacts = await factsOf(mid.me);
    assert.equal(myFacts["Your fortunes"], "knight ×1 · points ×2 (1 new)", `${v.tag}: your facts list your fortunes by kind, got ${JSON.stringify(myFacts)}`);

    // A dropped seat: a visible marker on the line at every size, the word only where it fits, and a fact in its menu.
    await page.evaluate((name) => window.__emberisle.setState({ seats: [{ name, ready: true, host: false, away: true, url: null }] }), await page.evaluate((id) => window.__emberisle.getState().state.players.find((p) => p.id === id).name, mid.b));
    await seat(mid.b).getByTestId("seat-away").waitFor();
    const dropped = (await lines()).find((l) => l.id === `${v.seat}-${mid.b}`);
    assert.ok(dropped.away && dropped.away.w >= 12 && dropped.h <= 44 && dropped.spill === 0, `${v.tag}: the dropped seat shows a marker ${JSON.stringify(dropped.away)}`);
    assert.equal(dropped.away.word, wide, `${v.tag}: the word "reconnecting…" shows where the cell is wide ${JSON.stringify(dropped.away)}`);
    assert.ok((await lines()).filter((l) => l.id !== `${v.seat}-${mid.b}`).every((l) => l.away === null), `${v.tag}: no marker on a seated seat`);
    assert.equal((await factsOf(mid.b))["Connection"], "reconnecting…", `${v.tag}: the dropped seat's facts say so`);
    await page.evaluate(() => window.__emberisle.setState({ seats: [] }));

    // Nothing in the seats overlaps the menu button or the Watching chip (shown by flagging the store a watcher).
    await page.evaluate(() => window.__emberisle.setState({ spectator: true }));
    await page.getByTestId("watching-badge").waitFor();
    const clash = await page.evaluate((sel) => {
      const r = (el) => el.getBoundingClientRect();
      const chrome = [r(document.querySelector('[aria-label="Table menu"]')), r(document.querySelector('[data-testid="watching-badge"]'))];
      const seats = [...document.querySelectorAll(`[data-testid^="${sel}-p"]`)].map(r);
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return { hits: seats.filter((s) => chrome.some((c) => hit(s, c))).length, inView: seats.every((s) => s.right <= innerWidth && s.left >= 0), badge: chrome[1].width > 0 };
    }, v.seat);
    await page.evaluate(() => window.__emberisle.setState({ spectator: false }));
    assert.ok(clash.badge && clash.hits === 0 && clash.inView, `${v.tag}: seats clear of the menu button and the Watching chip ${JSON.stringify(clash)}`);
    console.log(`${v.tag}: four one-line seats (<= 44 px, points ${ls[0].vpFont}px/${ls[0].vpWeight}), pulse follows the turn, die only in the roll-off, counts only when held, facts on tap (fortunes by kind, dropped seat), clear of the menu and the Watching chip`);
    await ctx.close();
  }
  assert.deepEqual(errors, [], "console errors");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
