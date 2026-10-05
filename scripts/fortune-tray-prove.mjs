// #423: the fortune tray. In hotseat at 1280x720, 390x844 (touch) and 844x390 (touch), with every fortune kind crafted into
// the hand in `main`:
// - the action row has exactly one Fortunes button ("Fortunes ×N") and the page has no <select>; the button (on a phone)
//   and the tray's Play buttons, chips and Close are all at least 44 px;
// - the tray lists one row per held kind, named as the README's Names section says (wayfarer, path, plenty, monopoly,
//   points; never "knight"), each with its effect; points has no Play; the tray sits inside the viewport, under the header
//   (or the portrait seat strip) and, on a sideways phone, inside the left column;
// - the wayfarer and the path fortune arm their board pick from the tray and close it; the Fortunes button stays pressed
//   while armed and a second press cancels; Plenty takes the two tapped goods (two taps on one good is "×2", a third tap
//   replaces the oldest) from the bank; Monopoly takes every other seat's tapped good; each play closes the tray;
// - a fortune bought this turn is marked "Bought this turn" and its Play refuses; the seat menu's "Your fortunes" breakdown
//   (#482) uses the same names, "wayfarer ×1 · plenty ×1 (1 new) · points ×1";
// - (#410/#412) a good the bank has none of is a greyed chip that cannot be picked, a pick the bank empties while the tray
//   is open is dropped, and with the bank empty of everything Plenty says so and refuses;
// - Esc closes the tray and puts focus back on the Fortunes button, Tab stays inside it, and a press outside closes it;
// - under reduced motion the tray's entry animation collapses to 1 ms;
// - a seat change (hotseat) closes an open tray even when the next seat holds fortunes, and a phase change within the turn
//   (a roll with the tray up, through robber to main) closes it and it does not come back;
// - your last fortune played takes the Fortunes button with the tray, and focus falls to End turn;
// - a second pick of a good the bank has only one of is refused and says so, while a tap with two picked still replaces the
//   oldest; Monopoly's chips are radios and Plenty's caption is a live region.
// Zero console errors. Saves test-results/fortune-tray-<size>.png. Run: npm run fortune-tray-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8423;
const STEP_MS = 15_000;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true, portrait: true },
  { tag: "844x390", width: 844, height: 390, touch: true, column: true },
];
// The README's Names section is the one vocabulary the player sees (#411).
const NAMES = readFileSync("README.md", "utf8").match(/^## Names\n[\s\S]*?^Say (.*)$/m)[1];
assert.match(NAMES, /\bfortune\b/);
assert.match(NAMES, /\bwayfarer\b/);
assert.doesNotMatch(NAMES, /\bknight\b/);
const ROWS = ["wayfarer", "path", "plenty", "monopoly", "points"];
const KINDS = ["knight", "road", "plenty", "monopoly", "vp"];

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
    page.on("response", (r) => r.status() >= 400 && errors.push(`${v.tag}: ${r.status()} ${r.url()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.waitForFunction(() => window.__emberisle.getState().state);

    // Hand the current seat every fortune kind (none bought this turn), goods, a full bank and 2 ore on every other seat.
    const craft = (hidden, bought = {}, bank = {}) =>
      page.evaluate(({ hidden, bought, bank }) => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        const me = st.players.find((p) => p.id === st.current);
        st.phase = "main";
        st.playedCard = false;
        st.dice = [3, 4];
        me.resources = { timber: 2, clay: 2, wool: 2, grain: 2, ore: 2 };
        me.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0, ...hidden };
        me.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0, ...bought };
        me.pathsLeft = 10;
        // An outpost of mine on a three-hex corner, so the path fortune has edges to lay from.
        if (!st.vertices.some((x) => x.building?.playerId === me.id)) st.vertices.find((x) => x.hexes.length === 3).building = { playerId: me.id, kind: "outpost" };
        for (const p of st.players) if (p !== me) p.resources.ore = 2;
        st.bank = { timber: 10, clay: 10, wool: 10, grain: 10, ore: 10, ...bank };
        st.seq += 1;
        g.setState({ state: st, buildMode: "none", roadPicks: [], pendingSteal: null, pendingPlace: null, error: null });
        return me.id;
      }, { hidden, bought, bank });
    const me = () => page.evaluate(() => { const st = window.__emberisle.getState().state; return st.players.find((p) => p.id === st.current); });
    const store = (fn, arg) => page.evaluate(fn, arg);
    const rect = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
    const button = page.getByTestId("fortunes-button");
    const tray = page.getByTestId("fortune-tray");
    const open = async () => {
      await button.click({ timeout: STEP_MS });
      await tray.waitFor({ timeout: STEP_MS });
    };
    const closed = () => tray.waitFor({ state: "detached", timeout: STEP_MS });

    await craft({ knight: 2, road: 1, plenty: 1, monopoly: 1, vp: 1 });
    await button.waitFor({ timeout: STEP_MS });
    const row = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="fortunes-button"]').parentElement;
      return {
        fortunes: [...document.querySelectorAll("button")].filter((b) => /^Fortunes/.test(b.textContent.trim())).map((b) => b.textContent.trim()),
        selects: document.querySelectorAll("select").length,
        stale: [...bar.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => /knight|Wayfarer card|Path fortune|Plenty|Monopoly/.test(t)),
      };
    });
    assert.deepEqual(row.fortunes, ["Fortunes ×6"], `${v.tag}: one Fortunes button with the held count, got ${JSON.stringify(row.fortunes)}`);
    assert.equal(row.selects, 0, `${v.tag}: no <select> on the page`);
    assert.deepEqual(row.stale, [], `${v.tag}: no per-fortune buttons left in the row`);
    // The row's buttons are 44 px on a phone, as the other build buttons are (the desktop row is 32 px under a fine pointer).
    const bRect = await rect(button);
    if (v.touch) assert.ok(bRect.height >= 44 && bRect.width >= 44, `${v.tag}: Fortunes button ${bRect.width}x${bRect.height} is a 44 px target`);

    // The tray: five named rows in deck order, an effect on each, Play on all but points, every control 44 px, inside the viewport.
    await open();
    const listed = await tray.evaluate((el) => {
      const r = (x) => x.getBoundingClientRect();
      const box = r(el);
      const rows = [...el.querySelectorAll('[data-testid^="fortune-row-"]')].map((li) => ({
        kind: li.dataset.testid.slice("fortune-row-".length),
        name: li.querySelector("p").firstElementChild.textContent,
        count: li.querySelector("p").lastElementChild.textContent,
        effect: li.querySelectorAll("p")[1].textContent,
        play: li.querySelector('[data-testid^="fortune-play-"]')?.textContent ?? null,
        blocked: li.querySelector('[data-testid="fortune-blocked"]')?.textContent ?? null,
      }));
      const small = [...el.querySelectorAll("button")].map((b) => ({ t: b.getAttribute("aria-label") || b.textContent.trim(), ...r(b) })).filter((b) => b.width < 44 || b.height < 44).map((b) => `${b.t} ${Math.round(b.width)}x${Math.round(b.height)}`);
      const header = r(document.querySelector("header > .pointer-events-auto"));
      const strip = document.querySelector('[data-testid="seat-strip"]');
      const chrome = strip && !strip.closest("header") ? r(strip).bottom : header.bottom;
      return {
        rows,
        small,
        text: el.textContent,
        box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        chrome,
        inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
        role: el.getAttribute("role"),
        modal: el.getAttribute("aria-modal"),
        title: document.getElementById(el.getAttribute("aria-labelledby"))?.textContent,
        focused: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent,
        anim: parseFloat(getComputedStyle(el).animationDuration),
      };
    });
    assert.deepEqual(listed.rows.map((r) => r.name), ROWS, `${v.tag}: rows read ${JSON.stringify(listed.rows.map((r) => r.name))}`);
    assert.deepEqual(listed.rows.map((r) => r.count), ["×2", "×1", "×1", "×1", "×1"], `${v.tag}: counts ${JSON.stringify(listed.rows.map((r) => r.count))}`);
    assert.ok(listed.rows.every((r) => r.effect.length > 8), `${v.tag}: every row has an effect line ${JSON.stringify(listed.rows)}`);
    assert.deepEqual(listed.rows.map((r) => r.play), ["Play", "Play", "Play", "Play", null], `${v.tag}: Play on all but points`);
    assert.ok(listed.rows.every((r) => r.blocked === null), `${v.tag}: nothing blocked with no card bought this turn`);
    assert.doesNotMatch(listed.text, /knight|Wayfarer card|Path fortune/i, `${v.tag}: tray text follows the README Names`);
    assert.deepEqual(listed.small, [], `${v.tag}: every tray control is 44 px, small: ${JSON.stringify(listed.small)}`);
    assert.ok(listed.inside, `${v.tag}: tray inside the viewport ${JSON.stringify(listed.box)}`);
    assert.ok(listed.box.top >= listed.chrome, `${v.tag}: tray top ${listed.box.top} is under the chrome at ${listed.chrome}`);
    if (v.column) assert.ok(listed.box.right <= v.width / 2, `${v.tag}: tray inside the left column, right edge ${listed.box.right}`);
    assert.equal(listed.role, "dialog");
    assert.equal(listed.modal, "true");
    assert.equal(listed.title, "Fortunes");
    assert.equal(listed.focused, "Close", `${v.tag}: focus lands on Close, got ${JSON.stringify(listed.focused)}`);
    assert.ok(listed.anim >= 0.2, `${v.tag}: the tray rises in over --duration-base, got ${listed.anim}s`);
    assert.equal(await button.getAttribute("aria-expanded"), "true");
    await page.waitForTimeout(400); // the entry animation, so the shot shows the tray
    await page.screenshot({ path: `test-results/fortune-tray-${v.tag}.png` });
    console.log(`${v.tag}: Fortunes ×6, tray ${JSON.stringify(listed.rows.map((r) => `${r.name} ${r.count}: ${r.effect}`))}`);

    // Wayfarer: Play arms the hex pick and closes the tray; the button stays pressed and a press cancels; the pick plays the card.
    await page.getByTestId("fortune-play-knight").click();
    await closed();
    assert.equal(await store(() => window.__emberisle.getState().buildMode), "knight", `${v.tag}: wayfarer armed`);
    assert.equal(await button.getAttribute("aria-pressed"), "true", `${v.tag}: Fortunes pressed while armed`);
    const banner = await page.getByTestId("turn-banner").textContent();
    assert.match(banner, /Pick a hex for the wayfarer · (tap Fortunes again to cancel|Esc cancels)/, `${v.tag}: banner "${banner}"`);
    await button.click();
    await page.waitForFunction(() => window.__emberisle.getState().buildMode === "none", null, { timeout: STEP_MS });
    await open();
    await page.getByTestId("fortune-play-knight").click();
    await closed();
    const knight = await store(() => {
      const g = window.__emberisle.getState();
      g.pickHex(g.highlights().hexes[0]);
      const st = window.__emberisle.getState().state;
      const me = st.players.find((p) => p.id === st.current);
      return { played: me.knightsPlayed, left: me.hidden.knight, card: st.playedCard, error: window.__emberisle.getState().error };
    });
    assert.deepEqual(knight, { played: 1, left: 1, card: true, error: null }, `${v.tag}: wayfarer ${JSON.stringify(knight)}`);
    console.log(`${v.tag}: wayfarer armed, cancelled, armed again and played`);

    // One fortune a turn: the rest are blocked now, and say so.
    await open();
    const oneATurn = await tray.evaluate((el) => [...el.querySelectorAll('[data-testid="fortune-blocked"]')].map((p) => p.textContent));
    assert.deepEqual(oneATurn, ["One fortune a turn", "One fortune a turn", "One fortune a turn", "One fortune a turn"], `${v.tag}: ${JSON.stringify(oneATurn)}`);
    await page.getByRole("button", { name: "Close" }).click();
    await closed();

    // Path fortune: Play arms the two-edge pick; two picks lay two paths.
    await craft({ knight: 1, road: 1, plenty: 1, monopoly: 1, vp: 1 });
    await open();
    await page.getByTestId("fortune-play-road").click();
    await closed();
    const road = await store(() => {
      const g = window.__emberisle.getState();
      const mode = g.buildMode;
      const had = g.state.edges.filter((e) => e.path === g.state.current).length;
      g.pickEdge(g.highlights().edges[0]);
      window.__emberisle.getState().pickEdge(window.__emberisle.getState().highlights().edges[0]);
      const st = window.__emberisle.getState().state;
      return { mode, laid: st.edges.filter((e) => e.path === st.current).length - had, left: st.players.find((p) => p.id === st.current).hidden.road, card: st.playedCard };
    });
    assert.deepEqual(road, { mode: "roadCard", laid: 2, left: 0, card: true }, `${v.tag}: path fortune ${JSON.stringify(road)}`);
    console.log(`${v.tag}: path fortune laid two paths`);

    // Plenty: chips, not a select. Two taps on timber read "×2", a third tap on ore replaces the oldest; Play takes ore and wool.
    await craft({ knight: 1, road: 1, plenty: 1, monopoly: 1, vp: 1 });
    await open();
    const chips = page.locator('[data-testid^="plenty-chip-"]');
    assert.equal(await chips.count(), 5, `${v.tag}: five plenty chips`);
    assert.equal(await page.getByTestId("fortune-play-plenty").getAttribute("aria-disabled"), "true", `${v.tag}: Plenty waits for two picks`);
    await page.getByTestId("plenty-chip-timber").click();
    await page.getByTestId("plenty-chip-timber").click();
    assert.equal(await page.getByTestId("plenty-picks").textContent(), "Timber ×2");
    assert.equal(await page.getByTestId("plenty-chip-timber").getAttribute("aria-label"), "Timber, picked 2");
    await page.getByTestId("plenty-chip-ore").click();
    assert.equal(await page.getByTestId("plenty-picks").textContent(), "Timber and ore");
    await page.getByTestId("plenty-chip-wool").click();
    assert.equal(await page.getByTestId("plenty-picks").textContent(), "Ore and wool");
    const before = await me();
    await page.getByTestId("fortune-play-plenty").click();
    await closed();
    const after = await me();
    const plenty = { ore: after.resources.ore - before.resources.ore, wool: after.resources.wool - before.resources.wool, timber: after.resources.timber - before.resources.timber, left: after.hidden.plenty };
    assert.deepEqual(plenty, { ore: 1, wool: 1, timber: 0, left: 0 }, `${v.tag}: plenty ${JSON.stringify(plenty)}`);
    console.log(`${v.tag}: plenty took ore and wool through the chips`);

    // Monopoly: one chip, Play takes every other seat's ore (3 seats × 2).
    await craft({ knight: 1, road: 1, plenty: 1, monopoly: 1, vp: 1 });
    await open();
    assert.equal(await page.locator('[data-testid^="monopoly-chip-"]').count(), 5, `${v.tag}: five monopoly chips`);
    assert.equal(await page.getByTestId("fortune-play-monopoly").getAttribute("aria-disabled"), "true", `${v.tag}: Monopoly waits for a pick`);
    await page.getByTestId("monopoly-chip-ore").click();
    assert.equal(await page.getByTestId("monopoly-pick").textContent(), "Every other seat's ore");
    assert.deepEqual(await page.locator('[role="radio"]').evaluateAll((els) => els.map((b) => b.getAttribute("aria-checked"))), ["false", "false", "false", "false", "true"], `${v.tag}: monopoly chips are radios`);
    await page.getByTestId("fortune-play-monopoly").click();
    await closed();
    const mono = await store(() => {
      const st = window.__emberisle.getState().state;
      const me = st.players.find((p) => p.id === st.current);
      return { ore: me.resources.ore, others: st.players.filter((p) => p !== me).reduce((n, p) => n + p.resources.ore, 0), left: me.hidden.monopoly, card: st.playedCard };
    });
    assert.deepEqual(mono, { ore: 8, others: 0, left: 0, card: true }, `${v.tag}: monopoly ${JSON.stringify(mono)}`);
    console.log(`${v.tag}: monopoly took 6 ore`);

    // Bought this turn: marked, and Play refuses. The seat menu's breakdown uses the same names and marks the new card.
    await craft({ knight: 1, plenty: 1, vp: 1 }, { plenty: 1 });
    await open();
    const fresh = await tray.evaluate((el) => ({
      blocked: [...el.querySelectorAll('[data-testid^="fortune-row-"]')].map((li) => [li.dataset.testid.slice(12), li.querySelector('[data-testid="fortune-blocked"]')?.textContent ?? null]),
      play: el.querySelector('[data-testid="fortune-play-plenty"]').getAttribute("aria-disabled"),
      why: el.querySelector('[data-testid="fortune-play-plenty"]').getAttribute("aria-description"),
      chips: el.querySelectorAll('[data-testid^="plenty-chip-"]').length,
    }));
    assert.deepEqual(fresh, { blocked: [["knight", null], ["plenty", "Bought this turn"], ["vp", null]], play: "true", why: "Bought this turn", chips: 0 }, `${v.tag}: ${JSON.stringify(fresh)}`);
    await page.getByTestId("fortune-play-plenty").click({ force: true });
    const refused = await me();
    assert.ok(refused.hidden.plenty === 1 && !(await store(() => window.__emberisle.getState().state.playedCard)), `${v.tag}: the new plenty was not played`);
    await page.getByRole("button", { name: "Close" }).click();
    await closed();
    await store(() => window.__emberisle.getState().openMenu(window.__emberisle.getState().state.current));
    const facts = await page.getByTestId("menu-facts").evaluate((dl) => Object.fromEntries([...dl.querySelectorAll("div")].map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent])));
    assert.equal(facts["Your fortunes"], "wayfarer ×1 · plenty ×1 (1 new) · points ×1", `${v.tag}: seat menu breakdown ${JSON.stringify(facts)}`);
    await store(() => window.__emberisle.getState().openMenu(null));
    console.log(`${v.tag}: new card blocked; seat menu says "${facts["Your fortunes"]}"`);

    // #410: no ore in the bank: the ore chip is greyed, described, and cannot be picked. #412: a pick the bank then empties is
    // dropped; a bank empty of everything turns Plenty off and says why.
    await craft({ plenty: 1 }, {}, { ore: 0 });
    await open();
    const ore = page.getByTestId("plenty-chip-ore");
    assert.equal(await ore.getAttribute("aria-disabled"), "true");
    assert.equal(await ore.getAttribute("aria-description"), "The bank has no ore.");
    await ore.click({ force: true });
    assert.equal(await page.getByTestId("plenty-picks").textContent(), "Tap two goods", `${v.tag}: the empty ore cannot be picked`);
    await page.getByTestId("plenty-chip-timber").click();
    await page.getByTestId("plenty-chip-clay").click();
    assert.equal(await page.getByTestId("plenty-picks").textContent(), "Timber and clay");
    assert.equal(await page.getByTestId("plenty-picks").getAttribute("aria-live"), "polite");
    // One timber in the bank and one picked: a second timber is short, said so, but with two picked a tap replaces the oldest
    // (that timber), so the chip stays live.
    await store(() => { const g = window.__emberisle; const st = structuredClone(g.getState().state); st.bank.timber = 1; st.seq += 1; g.setState({ state: st }); });
    await page.waitForFunction(() => document.querySelector('[data-testid="plenty-chip-timber"]')?.getAttribute("aria-disabled") === null, null, { timeout: STEP_MS });
    await page.getByTestId("plenty-chip-timber").click();
    assert.equal(await page.getByTestId("plenty-picks").textContent(), "Clay and timber", `${v.tag}: with two picked, a tap replaces the oldest`);
    const only = await page.getByTestId("plenty-chip-timber").evaluate((b) => [b.getAttribute("aria-disabled"), b.getAttribute("aria-description")]);
    assert.deepEqual(only, ["true", "The bank has only 1 timber."], `${v.tag}: a second timber the bank lacks: ${JSON.stringify(only)}`);
    await page.getByTestId("plenty-chip-clay").click();
    assert.equal(await page.getByTestId("plenty-picks").textContent(), "Timber and clay");
    await store(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.bank.timber = 0;
      st.seq += 1;
      g.setState({ state: st });
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="plenty-picks"]')?.textContent === "Clay", null, { timeout: STEP_MS });
    assert.equal(await page.getByTestId("fortune-play-plenty").getAttribute("aria-disabled"), "true", `${v.tag}: one pick left, Play waits`);
    await page.getByTestId("plenty-chip-clay").click();
    await page.getByTestId("fortune-play-plenty").click();
    await closed();
    const drained = await me();
    assert.equal(drained.resources.clay, 4, `${v.tag}: the dropped timber pick did not pay, clay ×2 did`);
    await craft({ plenty: 1 }, {}, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 });
    await open();
    const dry = await tray.evaluate((el) => ({ why: el.querySelector('[data-testid="fortune-blocked"]')?.textContent, play: el.querySelector('[data-testid="fortune-play-plenty"]').getAttribute("aria-disabled"), chips: el.querySelectorAll('[data-testid^="plenty-chip-"]').length }));
    assert.deepEqual(dry, { why: "The bank is empty", play: "true", chips: 0 }, `${v.tag}: ${JSON.stringify(dry)}`);
    console.log(`${v.tag}: empty ore greyed, emptied timber dropped, empty bank refused`);

    // The last fortune played takes the Fortunes button with the tray: focus falls to End turn, not to the body.
    await page.keyboard.press("Escape");
    await closed();
    await craft({ plenty: 1 });
    await open();
    await page.getByTestId("plenty-chip-wool").click();
    await page.getByTestId("plenty-chip-wool").click();
    await page.getByTestId("fortune-play-plenty").click();
    await closed();
    assert.equal(await button.count(), 0, `${v.tag}: no fortunes left, no Fortunes button`);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "End turn", `${v.tag}: focus fell to End turn`);
    await craft({ plenty: 1 }, {}, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 });
    await open();

    // Esc closes and focus returns to Fortunes; Tab stays inside; a press outside closes.
    await page.keyboard.press("Escape");
    await closed();
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), "fortunes-button", `${v.tag}: focus back on Fortunes after Esc`);
    await craft({ knight: 1, road: 1, plenty: 1, monopoly: 1, vp: 1 });
    await open();
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.activeElement?.closest('[data-testid="fortune-tray"]') !== null), `${v.tag}: Tab stays inside the tray`);
    const outside = await page.evaluate(() => { const r = document.querySelector("header > .pointer-events-auto").getBoundingClientRect(); return { x: 8, y: r.bottom + 8 }; });
    await page.mouse.click(outside.x, outside.y);
    await closed();
    console.log(`${v.tag}: Esc, Tab and a press outside behave`);

    // A seat change closes an open tray: the next seat holds a plenty in `main`, so it has the Fortunes button, and must not
    // inherit the last seat's open tray.
    await open();
    await store(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      const next = st.players.find((p) => p.id !== st.current);
      st.current = next.id;
      next.hidden.plenty = 1;
      next.boughtThisTurn.plenty = 0;
      st.turn += 1;
      st.seq += 1;
      g.setState({ state: st, buildMode: "none" });
    });
    await closed();
    await button.waitFor({ timeout: STEP_MS });
    await page.waitForTimeout(300);
    assert.equal(await tray.count(), 0, `${v.tag}: the next seat's Fortunes button is up and its tray stays closed`);
    console.log(`${v.tag}: the tray closed with the seat change`);

    // A phase change within one turn closes it and it stays closed: open before the roll (a wayfarer in hand), the roll is a 7,
    // robber, then main; the tray must not come back or take focus when the Fortunes button returns in `main`.
    await craft({ knight: 1, plenty: 1 });
    await store(() => { const g = window.__emberisle; const st = structuredClone(g.getState().state); st.phase = "roll"; st.dice = null; st.seq += 1; g.setState({ state: st }); });
    await open();
    for (const phase of ["robber", "main"]) {
      await store((phase) => { const g = window.__emberisle; const st = structuredClone(g.getState().state); st.phase = phase; st.dice = [3, 4]; st.seq += 1; g.setState({ state: st }); }, phase);
      await page.waitForTimeout(300);
      assert.equal(await tray.count(), 0, `${v.tag}: tray closed through ${phase}`);
    }
    await button.waitFor({ timeout: STEP_MS });
    assert.equal(await button.getAttribute("aria-expanded"), "false", `${v.tag}: Fortunes is back in main, not expanded`);
    assert.notEqual(await page.evaluate(() => document.activeElement?.closest('[data-testid="fortune-tray"]')?.tagName ?? null), "SECTION");
    console.log(`${v.tag}: a roll with the tray up closed it for the rest of the turn`);

    // Reduced motion: the entry animation collapses to 1 ms.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await craft({ knight: 1 });
    await open();
    const reduced = await tray.evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    assert.ok(reduced <= 0.001, `${v.tag}: reduced motion tray animation ${reduced}s`);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    console.log(`${v.tag}: reduced motion ok (${reduced}s)`);

    await ctx.close();
  }
} catch (e) {
  console.error("fortune-tray-prove failed:", e);
  code = 1;
}
if (errors.length) {
  console.error("console errors:", errors);
  code = 1;
}
await browser.close();
await vite.close();
console.log(code ? "fortune-tray-prove: FAIL" : "fortune-tray-prove: ok");
process.exit(code);
