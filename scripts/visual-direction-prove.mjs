// Geometry, AA colour pairs, offer placement/refit, touch targets and truly static reduced motion.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = Number(process.env.VITE_PORT ?? 8171);
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const metrics = [];
const baseline = {
  "1280": { main: [1020, 412], offer: [1020, 412] },
  "390": { main: [366, 344], offer: [366, 238] },
  "844": { main: [488, 310], offer: [424, 310] },
};
const settle = async page => {
  await page.evaluate(() => window.__isle.remeasure());
  await page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide);
};
try {
  for (const [width, height, reduced] of [[1920, 1080, false], [1280, 720, false], [390, 844, false], [844, 390, false], [320, 568, false], [390, 844, true]]) {
    const phone = width < 768 || width === 844;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.__isle?.renders > 1);
    await page.locator(".seat-settings > summary").click();
    await page.getByRole("radio", { name: "Tide", exact: true }).click();
    await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.current = st.players[0].id;
      st.phase = "main";
      st.dice = [3, 5];
      st.seq++;
      for (const p of st.players) p.resources = { timber: 4, clay: 3, wool: 2, grain: 5, ore: 2 };
      // At least one owned outpost lets the upgrade button show its real cost too.
      const v = st.vertices.find(v => v.hexes.length === 3);
      v.building = { playerId: st.current, kind: "outpost" };
      g.setState({ state: st, localId: st.current, banner: null, error: null });
    });
    const targets = async () => {
      const bad = await page.evaluate(() => [...document.querySelectorAll('button, input, summary')].filter(el => el.checkVisibility()).map(el => {
        const r = el.getBoundingClientRect();
        return { label: el.getAttribute('aria-label') || el.textContent.trim(), w: r.width, h: r.height };
      }).filter(r => r.w < 43.9 || r.h < 43.9));
      assert.deepEqual(bad, [], `${width}: all interactive targets ≥44px`);
    };
    let mainFit = "";
    let mainHole = null;
    for (const phase of ["main", "offer"]) {
      if (phase === "offer") await page.evaluate(() => window.__emberisle.setState({ offer: { tradeId: "audit", from: "p1", fromName: "Mira", give: { wool: 2 }, want: { ore: 1 }, until: Date.now() + 60000 }, declined: [] }));
      await settle(page);
      await targets();
      if (phase === "main" && width === 844) {
        const dice = await page.evaluate(() => {
          const row = document.querySelector('[data-testid="dice-row"]'), r = row?.getBoundingClientRect();
          const foot = document.querySelector('[data-slot="turn"]')?.getBoundingClientRect(), end = document.querySelector('[data-slot="turn"] button')?.getBoundingClientRect();
          const status = document.querySelector('[data-slot="status"]')?.getBoundingClientRect();
          return { clipped: !foot || !end || end.right > foot.right + 0.5 || end.left < foot.left || end.top < foot.top || end.bottom > foot.bottom + 0.5, dice: [...document.querySelectorAll('[data-testid="die"]')].filter(d => d.checkVisibility()).length, sum: row?.lastElementChild?.textContent, inside: !!r && r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!status && r.left >= status.left && r.right <= status.right && r.top >= status.top && r.bottom <= status.bottom };
        });
        assert.deepEqual(dice, { clipped: false, dice: 2, sum: "8", inside: true }, `${width}: two dice and the sum show in your own main phase`);
      }
      // The main phase's HUD can still be growing as its chunks land (the base hole grows with it, once); take the fit once it holds still.
      let fitNow = "";
      for (let k = 0; k < 12; k++) {
        const f = await page.evaluate(async () => { await new Promise(r => setTimeout(r, 400)); return JSON.stringify(window.__isle.fit); });
        if (f === fitNow) break;
        fitNow = f;
      }
      // On a phone the offer slides over the board and the camera does not move (#625): its corners are held to the hole the main phase left.
      const holeFor = phone && phase === "offer" ? mainHole : null;
      const geometry = await page.evaluate((holeFor) => {
        const r = window.__isle;
        const i = r.insets();
        const hole = holeFor ?? { left: i.left, top: i.top, right: innerWidth - i.right, bottom: innerHeight - i.bottom };
        // Px per world unit at the island's centre (the diorama view, #597, is the default; a far corner is smaller).
        const scale = r.pxPerUnit(0, 0.35, 0);
        // Every corner, and a dock's pier and boat 0.7 out along the coast at the waterline, inside the hole.
        const inHole = p => Math.min(p.x - hole.left, hole.right - p.x, p.y - hole.top, hole.bottom - p.y) >= -0.5;
        const out = window.__emberisle.getState().state.vertices.filter(v => {
          const m = r.coastMiter.get(v.id);
          return !inHole(r.screenOf(v.id)) || (v.harbor && !inHole(r.screenAt(v.x + m.mx * 0.7, 0.1, v.z + m.mz * 0.7)));
        }).map(v => v.id);
        // No corner (so no legal one) under the HUD: each one's screen point is the canvas.
        const covered = window.__emberisle.getState().state.vertices.map(v => v.id).filter(id => { const p = r.screenOf(id); return document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS'; });
        const clippedCosts = [...document.querySelectorAll('.build-tile')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.getAttribute('aria-label'));
        const offer = document.querySelector('[data-testid="trade-toast"]');
        const stack = document.querySelector('[data-hud-stack]').getBoundingClientRect();
        const b = offer?.getBoundingClientRect();
        const slot = document.querySelector('[data-slot="status"]')?.getBoundingClientRect();
        return { scale, hole, out, covered, clippedCosts, offer: b ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right, inSlot: !!slot && ["x", "y", "width", "height"].every(k => Math.abs(b[k] - slot[k]) <= 0.5), insideStack: b.top >= stack.top && b.bottom <= stack.bottom + 0.5, modal: offer.getAttribute('aria-modal') } : null };
      }, holeFor);
      if (phase === "main") { mainFit = fitNow; mainHole = geometry.hole; }
      else assert.equal(fitNow, mainFit, `${width}: the offer opening leaves the fit where it was`);
      assert.deepEqual(geometry.out, [], `${width} ${phase}: all corners and dock clearance inside board hole`);
      if (!holeFor) assert.deepEqual(geometry.covered, [], `${width} ${phase}: no corner under the HUD`);
      assert.deepEqual(geometry.clippedCosts, [], `${width} ${phase}: all build prices fit`);
      if (baseline[width]) {
        const [w, h] = baseline[width][phase];
        const oldScale = Math.min(w / 12, h / (2 * (5.6 * Math.cos(25 * Math.PI / 180) + 1.15 * Math.sin(25 * Math.PI / 180))));
        assert.ok(geometry.scale > oldScale, `${width} ${phase}: larger island than captured baseline`);
        geometry.boardAreaGainPercent = Math.round((geometry.scale ** 2 / oldScale ** 2 - 1) * 100);
      }
      if (geometry.offer) {
        assert.equal(geometry.offer.modal, null);
        assert.ok(geometry.offer.insideStack && geometry.offer.bottom <= height - 12 + 0.5, `${width}: offer in visible bottom stack`);
        if (phone) assert.equal(geometry.offer.inSlot, true, `${width}: the offer fills the exact fixed status slot`);
      }
      metrics.push({ width, height, reduced, phase, ...geometry });
    }
    await page.getByRole("button", { name: "No", exact: true }).click();
    await page.getByTestId("trade-toast").waitFor({ state: "detached" });
    await settle(page);
    // #625: an offer overlays the board and declining it hands nothing back: the fit stays where it was.
    assert.equal(await page.evaluate(() => JSON.stringify(window.__isle.fit)), mainFit, `${width}: declining leaves the fit where it was`);
    // All text-bearing surfaces are opaque; calculate the exact AA token pairs used by cards, offers and sheets.
    const ratios = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const luminance = hex => {
        const c = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
        return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
      };
      return [['ink','paper'],['muted','paper'],['table-ink','table'],['table-muted','table-raised'],['accent','table'],['gain','paper'],['loss','paper'],...['timber','clay','wool','grain','ore'].map(r=>[`${r}-on`,r])].map(([a,b]) => {
        const x=luminance(css.getPropertyValue(`--${a}`).trim()),y=luminance(css.getPropertyValue(`--${b}`).trim());
        return [a,b,(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)];
      });
    });
    assert.ok(ratios.every(([, ,r]) => r >= 4.5), `${width}: AA ink pairs ${JSON.stringify(ratios)}`);
    if (reduced) {
      await page.evaluate(() => {
        const g=window.__emberisle, st=structuredClone(g.getState().state);
        st.players[0].resources.wool++; st.seq++; g.setState({state:st});
      });
      // #773: a gain shows on the hand's card only (the +N tab and the fill), never as text over the island. Several cards may
      // show at once (the crafted hand's own cues can still be up), so any one tab satisfies the wait.
      await page.getByTestId('resource-flash').first().waitFor();
      assert.equal(await page.locator('[data-testid="gain-float"]').count(), 0, 'no gain text over the island');
      const cues=await page.evaluate(()=>[...document.querySelectorAll('[data-testid="resource-flash"], [data-testid="goods-lit"]')].map(e=>({animation:getComputedStyle(e).animationName, opacity:getComputedStyle(e).opacity})));
      assert.ok(cues.length >= 2 && cues.every(c=>c.animation==='none'&&c.opacity==='1'), `reduced motion retains fully static readable gain information ${JSON.stringify(cues)}`);
      // The island's scenes (jelly-board.ts) hold their clock still: carts, miners, creatures.
      await page.waitForFunction(()=>window.__isle.landReady,null,{timeout:120_000});
      const a=await page.evaluate(()=>window.__isle.jellyT);
      await page.waitForTimeout(1700);
      const b=await page.evaluate(()=>window.__isle.jellyT);
      assert.equal(b,a,'reduced motion freezes the island scenes (wagons, miners, creatures)');
      assert.ok(await page.getByTestId('resource-flash').first().isVisible(),'gain still visible after 1700ms');
      await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'));
    }
    if (phone && !reduced) {
      await page.evaluate(async () => {
        const { online } = await import("/src/components/game/chunks.ts");
        await online.prefetch();
        window.__emberisle.setState({ mode: "online", offer: null, declined: [], tradeOutcome: null });
      });
      await page.getByRole("button", { name: "Open chat", exact: true }).click();
      await page.getByTestId("chat-sheet").waitFor();
      await page.locator("#chat-input").focus();
      await page.evaluate(() => {
        Object.defineProperty(visualViewport, "height", { value: innerHeight - 180, configurable: true });
        Object.defineProperty(visualViewport, "offsetTop", { value: 0, configurable: true });
        visualViewport.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => document.querySelector('[data-testid="chat-sheet"]').dataset.keyboardOpen === "true");
      const keyboard = await page.evaluate(() => {
        const input = document.querySelector("#chat-input"), box = input.getBoundingClientRect();
        const sheet = document.querySelector('[data-testid="chat-sheet"]').getBoundingClientRect();
        return { bottom: box.bottom, keyboardTop: visualViewport.height, top: sheet.top, inputSize: getComputedStyle(input).fontSize, reserve: window.__isle.safe().bottom };
      });
      assert.ok(keyboard.bottom <= keyboard.keyboardTop + 0.5 && keyboard.top >= 68, `${width}: typing stays above keyboard and clear of seats ${JSON.stringify(keyboard)}`);
      assert.equal(keyboard.inputSize, "16px", `${width}: phone field prevents Safari focus zoom`);
      assert.ok(keyboard.reserve >= 180, `${width}: board respects the keyboard`);
    }
    if (phone && !reduced) {
      await page.evaluate(() => {
        delete visualViewport.height;
        delete visualViewport.offsetTop;
        visualViewport.dispatchEvent(new Event("resize"));
        const g=window.__emberisle, st=g.getState().state;
        g.setState({ offer:{tradeId:"own-offer",from:st.current,fromName:st.players[0].name,give:{wool:2},want:{ore:1},until:Date.now()+60000},pendingSteal:{hexId:st.robberHex,targets:["p1","p2"]} });
      });
      const chat=page.getByTestId("chat-sheet");
      if (!(await chat.isVisible())) await page.getByRole("button", {name:"Open chat",exact:true}).click();
      await chat.waitFor();
      await page.waitForTimeout(300);
      const joint=await page.evaluate(()=>{
        const offer=document.querySelector('[data-testid="trade-toast"]').getBoundingClientRect();
        const prompt=[...document.querySelectorAll('div')].find(e=>e.querySelector('button')&&e.firstElementChild?.textContent==='Take from whom?').getBoundingClientRect();
        const sheet=document.querySelector('[data-testid="chat-sheet"]').getBoundingClientRect();
        return {offerTop:offer.top,offerBottom:offer.bottom,promptTop:prompt.top,promptBottom:prompt.bottom,sheetTop:sheet.top};
      });
      assert.ok(joint.promptTop>=68 && joint.promptBottom<=joint.offerTop && joint.offerBottom<=joint.sheetTop, `${width}: own offer and robbery choices stack above chat ${JSON.stringify(joint)}`);
    }
    await context.close();
  }
  assert.deepEqual(errors, [], 'zero browser errors');
  mkdirSync('test-results/design', {recursive:true});
  writeFileSync('test-results/design/verification.json',JSON.stringify(metrics,null,2));
  console.log('visual-direction-prove: all passed',JSON.stringify(metrics.map(({width,phase,reduced,boardAreaGainPercent})=>({width,phase,reduced,boardAreaGainPercent}))));
} finally { await browser.close(); await vite.close(); }
