// The title's How to play is a dialog over the whole screen, not a box inside the title card: on a phone (portrait and
// landscape) and at 1280x720 its backdrop covers the viewport, its Close button is on screen and takes the tap, and
// Close actually closes it. Zero console errors.
// #425: a press plays click_001.wav and Close / Escape play back_001.wav, once each; with the sound toggle off nothing plays.
// #442: on the table the entry point is the How to play row of the table menu, at the same three sizes.
// #749: the dialog holds an illustrated setup reference: the roll-off order, the outpost-plus-path placement, and the
// second outpost's starting goods. At 440x956 and 956x440 with touch and at 1280x720, with and without reduced motion, from the
// title and from a live table: the labelled diagrams and their text are present, nothing overflows sideways, every line scrolls
// into view, Close stays on screen and takes a tap, Escape closes and hands the focus back. The goods example is checked
// against the rules' own grantSecondSettlement (through applyAction).
// Run: npm run howto-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8104;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const { wayfarerRules } = await vite.ssrLoadModule("/src/lib/game/fortunes.ts");
const rules = await vite.ssrLoadModule("/src/lib/game/rules.ts");
const { createGame } = await vite.ssrLoadModule("/src/lib/game/board.ts");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  const cases = [
    { name: "phone portrait 390x844", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "phone landscape 844x390", opts: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "desktop 1280x720", opts: { viewport: { width: 1280, height: 720 } } },
  ];
  for (const c of cases) {
    const ctx = await browser.newContext(c.opts);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${c.name}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${c.name}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    const open = page.getByRole("button", { name: "How to play" });
    await open.scrollIntoViewIfNeeded();
    await open.click();
    const dialog = page.getByRole("dialog", { name: "How to play" });
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Win at 10 points/, `${c.name}: default target in title help`);
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    // #442: the table's entry point is a row of the table menu; the menu is gone once the dialog is up.
    await page.evaluate(() => { const g=window.__emberisle; g.getState().setWayfarerChoice("hotseat", "off"); g.getState().startHotseat(4); g.setState({ state: { ...g.getState().state, victoryTarget: 7 } }); });
    await page.getByRole("button", { name: "Table menu" }).click();
    await page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Win at 7 points/, `${c.name}: selected target in table help`);
    assert.match(await dialog.innerText(), /No movement, blocked land or taking cards/, `${c.name}: fixed Off rule in table help`);
    assert.match(await dialog.innerText(), /Wayfarer fortunes add 1 to the army/, `${c.name}: useful Off fortunes in help`);
    assert.equal(await page.getByTestId("table-menu").count(), 0, `${c.name}: the table menu closes behind the dialog`);
    const got = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-labelledby="howto-title"]');
      const close = dialog.querySelector('button[aria-label="Close"]');
      const d = dialog.getBoundingClientRect();
      const r = close.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        backdrop: { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height) },
        close: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
        closeTakesTheTap: close === hit || close.contains(hit),
        vw: innerWidth,
        vh: innerHeight,
      };
    });
    assert.deepEqual(got.backdrop, { x: 0, y: 0, w: got.vw, h: got.vh }, `${c.name}: the backdrop covers the viewport`);
    assert.ok(got.close.top >= 0 && got.close.bottom <= got.vh && got.close.left >= 0 && got.close.right <= got.vw, `${c.name}: Close is on screen ${JSON.stringify(got.close)}`);
    assert.ok(got.closeTakesTheTap, `${c.name}: Close takes the tap at its centre`);
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => !window.__emberisle.getState().howTo);
    assert.equal(await dialog.count(), 0, `${c.name}: Close closes the dialog`);
    assert.ok(await page.getByRole("button", { name: "Table menu" }).evaluate((el) => document.activeElement === el), `${c.name}: Close hands the focus back to the table menu button`);
    console.log(`${c.name}: title and table menu entry points; backdrop ${got.backdrop.w}x${got.backdrop.h}, Close at ${got.close.top}-${got.close.bottom} px on screen and tappable, closes`);
    await ctx.close();
  }
  // #749: the help's claims about starting goods match the rules. Outposts of the first round pay nothing; the second round's
  // pays one card per hex it touches, and a wastes hex adds none.
  {
    const game = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 749 });
    const n = game.players.length;
    const place = (round, vertexId) => {
      const state = structuredClone(game);
      state.phase = "setupSettle";
      state.setupIndex = round === 1 ? 0 : n;
      state.current = state.players[round === 1 ? 0 : n - 1].id;
      const pid = state.current;
      const before = Object.values(state.players.find((p) => p.id === pid).resources).reduce((a, b) => a + b, 0);
      const out = rules.applyAction(state, pid, { type: "setupSettle", vertexId });
      assert.equal(out.error, undefined, `setup outpost at ${vertexId}: ${out.error}`);
      const me = out.state.players.find((p) => p.id === pid);
      return { me, gained: Object.values(me.resources).reduce((a, b) => a + b, 0) - before };
    };
    const terrainsAt = (v) => v.hexes.map((id) => game.hexes.find((h) => h.id === id).terrain);
    const legal = rules.legalSettle({ ...game, phase: "setupSettle", setupIndex: 0 }, game.players[0].id, true);
    const withWaste = game.vertices.find((v) => legal.includes(v.id) && v.hexes.length === 3 && terrainsAt(v).includes("waste"));
    const allLand = game.vertices.find((v) => legal.includes(v.id) && v.hexes.length === 3 && !terrainsAt(v).includes("waste"));
    assert.ok(withWaste && allLand, "the seed offers a corner on the wastes and one off them");
    assert.equal(place(1, withWaste.id).gained, 0, "the first outpost pays nothing");
    const wasteGrant = place(2, withWaste.id);
    assert.equal(wasteGrant.gained, 2, "the second outpost on the wastes pays one card per productive hex, none for the wastes");
    const landGrant = place(2, allLand.id);
    assert.equal(landGrant.gained, 3, "the second outpost on three productive hexes pays three cards");
    // Same terrain twice pays twice, one card per hex.
    for (const [v, grant] of [[withWaste, wasteGrant], [allLand, landGrant]]) {
      for (const t of new Set(terrainsAt(v))) if (t !== "waste") assert.equal(grant.me.resources[t] - 0, terrainsAt(v).filter((x) => x === t).length, `one ${t} per ${t} hex`);
    }
    // Setup order for 3 seats: 1, 2, 3, then 3, 2, 1 (the help's four-seat example is the same walk with one more seat).
    for (const seats of [3, 4]) {
      const g = createGame({ humans: Array.from({ length: seats }, (_, i) => ({ name: `P${i}` })), bots: 0, seed: 749 });
      const order = [];
      const state = structuredClone(g);
      state.phase = "setupSettle";
      state.setupIndex = 0;
      state.current = state.players[0].id;
      let s = state;
      for (let step = 0; step < seats * 2; step++) {
        order.push(s.players.findIndex((p) => p.id === s.current) + 1);
        const v = rules.legalSettle(s, s.current, true)[0];
        s = rules.applyAction(s, s.current, { type: "setupSettle", vertexId: v }).state;
        s = rules.applyAction(s, s.current, { type: "setupRoad", edgeId: rules.legalRoads(s, s.current, true)[0] }).state;
      }
      const want = [...Array.from({ length: seats }, (_, i) => i + 1), ...Array.from({ length: seats }, (_, i) => seats - i)];
      assert.deepEqual(order, want, `${seats} seats place ${want.join(",")}`);
      if (seats === 4) assert.deepEqual(order, [1, 2, 3, 4, 4, 3, 2, 1], "the help's four-seat example order");
    }
    console.log("rules: first outpost pays 0; second pays one card per productive hex (wastes + 2 land = 2, 3 land = 3); setup walks 1..n then n..1");
  }
  const sizes = [
    { name: "440x956 touch", viewport: { width: 440, height: 956 }, touch: true },
    { name: "956x440 touch", viewport: { width: 956, height: 440 }, touch: true },
    { name: "1280x720", viewport: { width: 1280, height: 720 }, touch: false },
  ];
  // The setup reference, read from an open dialog.
  const checkSetup = async (page, dialog, tag, touch, want) => {
    await dialog.getByRole("figure").first().waitFor();
    const text = await dialog.innerText();
    assert.match(text, /Win at 10 points|Win at 7 points/, `${tag}: target stays`);
    assert.ok(text.includes(want.wayfarer), `${tag}: the mode's wayfarer text stays`);
    assert.match(text, new RegExp(`Win at ${want.target} points`), `${tag}: target ${want.target}`);
    assert.match(text, /Drag to orbit the isle/, `${tag}: quick reference stays`);
    assert.match(text, /each player rolls one die/, `${tag}: the roll-off sets the order`);
    assert.match(text, /In a rematch, the last winner places first/, `${tag}: winner-first rematch rule`);
    assert.match(text, /once, then back through it in reverse/, `${tag}: forward then back`);
    assert.match(text, /Each placement is one outpost and one path from it/, `${tag}: outpost plus path`);
    assert.match(text, /Only your second outpost pays starting goods\. Your first pays nothing/, `${tag}: only the second outpost pays`);
    assert.match(text, /one card for each hex it touches that makes goods\. The wastes pay nothing/, `${tag}: one card per productive hex, wastes pay nothing`);
    assert.match(text, /Example for a four-seat table: seats place 1, 2, 3, 4, then 4, 3, 2, 1/, `${tag}: four-seat order is labelled as an example`);
    assert.match(text, /A three-seat table runs 1, 2, 3, then 3, 2, 1/, `${tag}: not every table has four seats`);
    assert.match(text, /a second outpost touching a wood hex, a wheat hex and the wastes pays 1 wood and 1 wheat\. The wastes pay nothing/, `${tag}: goods example text`);
    const figures = dialog.getByRole("figure");
    await figures.first().waitFor();
    assert.equal(await figures.count(), 3, `${tag}: three figures`);
    for (let i = 0; i < 3; i++) {
      const f = figures.nth(i);
      assert.ok((await f.locator("figcaption").innerText()).trim().length > 40, `${tag}: figure ${i} has a text alternative`);
      assert.equal(await f.locator("figcaption").count(), 1, `${tag}: figure ${i} has one caption`);
      // The picture is hidden from assistive tech; the caption says the same.
      assert.equal(await f.locator(":scope > svg[aria-hidden='true'], :scope > div[aria-hidden='true']").first().count(), 1, `${tag}: figure ${i} picture is aria-hidden behind its caption`);
    }
    // Order diagram: chips run 1 2 3 4 then 4 3 2 1.
    assert.deepEqual(await figures.nth(0).locator("[aria-hidden] span.rounded-full").allInnerTexts(), ["1", "2", "3", "4", "4", "3", "2", "1"], `${tag}: order diagram chips`);
    assert.match(await figures.nth(0).innerText(), /Out[\s\S]*Back/, `${tag}: order diagram rows are labelled`);
    // Placement diagram: an outpost and a path, labelled.
    assert.deepEqual(await figures.nth(1).locator("svg text").allTextContents(), ["Outpost", "Path"], `${tag}: placement diagram labels`);
    // Goods diagram: wood, wheat and wastes hexes with the shared resource symbols.
    assert.deepEqual(await figures.nth(2).locator("svg text").allTextContents(), ["Wood", "Wheat", "Wastes"], `${tag}: goods diagram hex labels`);
    assert.equal(await figures.nth(2).locator("svg svg").count(), 2, `${tag}: goods diagram uses the shared symbols for wood and wheat`);
    assert.equal(await figures.nth(2).locator("div[aria-hidden] svg").count(), 2, `${tag}: goods chips use the shared symbols`);
    assert.equal(await figures.nth(2).locator("div[aria-hidden]").innerText().then((t) => t.replace(/\s+/g, " ").trim()), "1 1 Wastes: 0", `${tag}: one card each, none from the wastes`);
    // Layout: no sideways overflow; the whole help scrolls into view; Close stays up and takes the tap.
    const region = dialog.getByRole("region", { name: "Rules and setup" });
    const lay = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-labelledby="howto-title"]');
      const body = dlg.querySelector('[role="region"]');
      const close = dlg.querySelector('button[aria-label="Close"]');
      const vis = (el, box) => { const r = el.getBoundingClientRect(); return r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= box.left - 1 && r.right <= box.right + 1; };
      const hits = () => { const r = close.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return close === h || close.contains(h); };
      const out = { vw: innerWidth, vh: innerHeight, docX: document.documentElement.scrollWidth, bodyX: [body.scrollWidth, body.clientWidth], dlgX: [dlg.scrollWidth, dlg.clientWidth], scrolls: body.scrollHeight > body.clientHeight, minTap: Math.min(close.getBoundingClientRect().width, close.getBoundingClientRect().height) };
      const view = body.getBoundingClientRect();
      body.scrollTop = 0;
      out.topVisible = vis(body.querySelector("p"), view);
      out.closeAtTop = vis(close, { top: 0, bottom: innerHeight, left: 0, right: innerWidth }) && hits();
      body.scrollTop = body.scrollHeight;
      const last = [...body.querySelectorAll("figcaption")].at(-1);
      out.lastVisible = vis(last, view);
      out.closeAtBottom = vis(close, { top: 0, bottom: innerHeight, left: 0, right: innerWidth }) && hits();
      out.figureX = [...body.querySelectorAll("figure")].every((f) => f.scrollWidth <= f.clientWidth + 1 && f.getBoundingClientRect().right <= view.right + 1);
      body.scrollTop = 0;
      return out;
    });
    assert.ok(lay.docX <= lay.vw, `${tag}: page has no sideways overflow ${lay.docX} > ${lay.vw}`);
    assert.ok(lay.bodyX[0] <= lay.bodyX[1] && lay.dlgX[0] <= lay.dlgX[1], `${tag}: dialog has no sideways overflow ${JSON.stringify(lay)}`);
    assert.ok(lay.figureX, `${tag}: diagrams fit the width`);
    assert.ok(lay.topVisible && lay.lastVisible, `${tag}: first and last help lines scroll into view`);
    assert.ok(lay.closeAtTop && lay.closeAtBottom, `${tag}: Close is on screen and takes the tap at both ends of the scroll`);
    if (touch) assert.ok(lay.minTap >= 44, `${tag}: Close is a 44 px target (${lay.minTap})`);
    // Keyboard: Tab goes Close -> scroll area -> Close; Shift+Tab reverses; the scroll area scrolls from the keyboard.
    const label = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);
    assert.equal(await label(), "Close", `${tag}: Close has the focus on open`);
    await page.keyboard.press("Tab");
    assert.equal(await label(), "Rules and setup", `${tag}: Tab reaches the scrolling help`);
    await page.keyboard.press("Tab");
    assert.equal(await label(), "Close", `${tag}: Tab wraps to Close, the focus stays in the dialog`);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await label(), "Rules and setup", `${tag}: Shift+Tab wraps back`);
    if (lay.scrolls) {
      await page.keyboard.press("End");
      await page.waitForFunction(() => { const b = document.querySelector('[role="region"][aria-label="Rules and setup"]'); return b.scrollTop + b.clientHeight >= b.scrollHeight - 1; });
      // PageUp, not Home: on a live table Home is the camera reset.
      for (let i = 0; i < 40 && (await region.evaluate((el) => el.scrollTop)) > 0; i++) {
        await page.keyboard.press("PageUp");
        await page.waitForTimeout(60);
      }
      assert.equal(await region.evaluate((el) => el.scrollTop), 0, `${tag}: the keyboard scrolls the help back to the top`);
    }
    await page.keyboard.press("Shift+Tab");
    assert.equal(await label(), "Close", `${tag}: Shift+Tab returns to Close`);
    await region.evaluate((el) => { el.scrollTop = 0; });
    return lay;
  };
  for (const size of sizes) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const tag = `${size.name} ${reducedMotion === "reduce" ? "reduced motion" : "motion"}`;
      const ctx = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1, reducedMotion });
      const page = await ctx.newPage();
      page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
      page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.waitForFunction(() => window.__emberisle);
      assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), reducedMotion === "reduce", `${tag}: motion preference applied`);
      const dialog = page.getByRole("dialog", { name: "How to play" });
      // From the title.
      const open = page.getByRole("button", { name: "How to play" });
      await open.scrollIntoViewIfNeeded();
      await (size.touch ? open.tap() : open.click());
      await dialog.waitFor();
      const titleLay = await checkSetup(page, dialog, `${tag} title`, size.touch, { target: 10, wayfarer: wayfarerRules("on") });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.ok(await open.evaluate((el) => document.activeElement === el), `${tag}: Escape returns the focus to the title's How to play`);
      await (size.touch ? open.tap() : open.click());
      await dialog.waitFor();
      await (size.touch ? dialog.getByRole("button", { name: "Close" }).tap() : dialog.getByRole("button", { name: "Close" }).click());
      await dialog.waitFor({ state: "detached" });
      assert.ok(await open.evaluate((el) => document.activeElement === el), `${tag}: Close returns the focus to the title's How to play`);
      // From a live table.
      await page.evaluate(() => { const g = window.__emberisle; g.getState().setWayfarerChoice("hotseat", "off"); g.getState().startHotseat(4); g.setState({ state: { ...g.getState().state, victoryTarget: 7 } }); });
      const menu = page.getByRole("button", { name: "Table menu" });
      await (size.touch ? menu.tap() : menu.click());
      await (size.touch ? page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: "How to play" }).tap() : page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: "How to play" }).click());
      await dialog.waitFor();
      await checkSetup(page, dialog, `${tag} table`, size.touch, { target: 7, wayfarer: wayfarerRules("off") });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.ok(await menu.evaluate((el) => document.activeElement === el), `${tag}: Escape returns the focus to the table menu button`);
      // A table with the wayfarer on and the default target.
      await page.evaluate(() => { const g = window.__emberisle; g.setState({ state: { ...g.getState().state, victoryTarget: 10, wayfarerMode: "on" } }); });
      await (size.touch ? menu.tap() : menu.click());
      await (size.touch ? page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: "How to play" }).tap() : page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: "How to play" }).click());
      await dialog.waitFor();
      await checkSetup(page, dialog, `${tag} table on`, size.touch, { target: 10, wayfarer: wayfarerRules("on") });
      await (size.touch ? dialog.getByRole("button", { name: "Close" }).tap() : dialog.getByRole("button", { name: "Close" }).click());
      await dialog.waitFor({ state: "detached" });
      console.log(`${tag}: setup reference from the title and a live table; 3 labelled diagrams with captions; no sideways overflow; body scrolls ${titleLay.scrolls ? "(scrollable here)" : "(fits here)"}; Close on screen and tappable at both ends; Tab/Shift+Tab trap; Escape and Close return focus`);
      await ctx.close();
    }
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`sound: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`sound: ${e}`));
    // The sea choice is saved so the GPU probe never runs here: it starts a second after the title settles, which is when
    // these clicks happen, and on SwiftShader its crystal stage draws the real scene and blocks on a pixel read for most
    // of a second per frame, starving the quiet wait below (main's CI run 803 timed out after Enter/Escape). The same
    // saved choice keeps idle-prove and restore-prove (#614) out of the probe; the clicks measured here are not the water's.
    await page.addInitScript(() => {
      localStorage.setItem("emberisle-water", "simple");
      window.__plays = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        // #814: the background music is music-prove's, not a table sound.
        if (this.src.endsWith("/old_tower_inn_loop.mp3")) return play.call(this);
        window.__plays.push(new URL(this.src).pathname);
        return play.call(this);
      };
    });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    // Clips start 150 ms apart (#609) and a slow frame can hold that timer longer, so wait for the count a step should
    // reach (a missing clip still shows in the assertion), then a further 400 ms of quiet so an extra one shows too.
    const plays = async (want) => {
      if (want) await page.waitForFunction((n) => window.__plays.length >= n, want, { timeout: 4000 }).catch(() => {});
      // Polled on a timer, not on a frame: a slow software-GL frame would hold a frame poll past the budget.
      await page.waitForFunction(() => {
        const n = window.__plays.length;
        return new Promise((r) => setTimeout(() => r(window.__plays.length === n), 400));
      }, null, { polling: 100, timeout: 6000 });
      return page.evaluate(() => window.__plays.map((p) => p.split("/").pop()));
    };
    const dialog = page.getByRole("dialog", { name: "How to play" });
    await page.getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(await plays(4), ["click_001.wav", "back_001.wav", "click_001.wav", "back_001.wav"], "open, Close, open, Escape");
    // Enter on a focused button clicks too (no pointer).
    await page.getByRole("button", { name: "How to play" }).focus();
    await page.keyboard.press("Enter");
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual((await plays(6)).slice(4), ["click_001.wav", "back_001.wav"], "Enter on How to play, Escape");
    // Muting is silent.
    await page.getByRole("button", { name: "Table sounds on" }).click();
    assert.equal((await plays()).length, 6, "muting is silent");
    const before = (await plays()).length;
    await page.getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "How to play" }).click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal((await plays()).length, before, "muted: nothing plays");
    // Unmuting clicks.
    await page.getByRole("button", { name: "Table sounds off" }).click();
    assert.deepEqual((await plays(before + 1)).slice(before), ["click_001.wav"], "unmuting clicks once");
    console.log("sounds: open click_001, Close back_001, Escape back_001, Enter click_001, once each; muting and muted play nothing; unmuting clicks");
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
