// Reproducible visual review of the same crafted table before/after art direction.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const direction = process.env.DIRECTION || "basalt";
const out = process.env.SHOTS_OUT || "test-results/design";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const metrics = [];
try {
  for (const [width, height] of [[1280, 720], [390, 844], [844, 390]]) {
    const phone = width !== 1280;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on("pageerror", error => { throw error; });
    await page.goto("http://localhost:8080");
    await page.waitForFunction(() => window.__isle?.renders > 2);
    if (direction !== "basalt") {
      const field = direction === "fieldwork";
      await page.addStyleTag({ content: field ? `
        :root { --table:#ffffff;--table-raised:#f4f5f0;--table-ink:#182824;--table-muted:#53665b;--table-line:#182824;--paper:#ffffff;--ink:#182824;--muted:#53665b;--accent:#245bce;--radius-control:4px;--radius-chip:4px; }
        .seat-card.seat-turn { box-shadow:inset 0 -3px #245bce; }
        .goods-card::before { content:'';position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:4px 0 0 4px; }
        ${['timber','clay','wool','grain','ore'].map(r=>`[data-testid='resource-${r}']::before{background:var(--color-${r})}`).join('')}
        .trade-yes,.action-utilities button.bg-fg { background:#245bce;color:#ffffff;border-color:#245bce; }
        .trade-clock { color:#245bce; }
        .title-wordmark { font-family:Georgia,serif;font-weight:600; }
        .trade-dock { border-left:3px solid #245bce; }
      ` : `
        :root { --table:#1c2941;--table-raised:#2c3b54;--table-ink:#f3f3eb;--table-muted:#b6c4d3;--table-line:#8191a6;--paper:#f3f3eb;--ink:#1c2941;--accent:#e8c777;--radius-control:10px;--radius-chip:10px; }
        ${Object.entries({timber:['#2f6855','#f3f3eb'],clay:['#ac5642','#ffffff'],wool:['#8daa76','#1c2941'],grain:['#c9aa60','#1c2941'],ore:['#51617a','#f3f3eb']}).map(([r,[bg,on]])=>`[data-testid='resource-${r}']{background:${bg};color:${on}} [data-testid='resource-${r}'] .goods-icon{color:${on}!important}`).join('')}
        .turn-stamp { font-family:Georgia,serif; }
      ` });
      await page.evaluate(field => {
        const r = window.__isle;
        const capPaint = field ? {timber:'#246347',clay:'#bc482f',wool:'#a4c078',grain:'#e0b448',ore:'#677992',waste:'#c9bb97'} : {timber:'#2f6855',clay:'#ac5642',wool:'#8daa76',grain:'#c9aa60',ore:'#708196',waste:'#afa58a'};
        const painted = new Set();
        for (const h of r.lastState.hexes) {
          const mat=r.caps.get(h.id), texture=mat?.map;
          if (!texture || painted.has(texture)) continue;
          painted.add(texture);
          const ctx=texture.image.getContext('2d');
          ctx.fillStyle=capPaint[h.terrain];ctx.fillRect(0,0,256,256);texture.needsUpdate=true;
        }
        r.water.uniforms.uShallow.value.set(field ? '#bfd3c6' : '#55788d');
        r.water.uniforms.uDeep.value.set(field ? '#a8c3bd' : '#314e68');
        r.water.uniforms.uFog.value.set(field ? '#a8c3bd' : '#314e68');
        r.renderer.setClearColor(field ? '#a8c3bd' : '#314e68');
      }, field);
    }
    await page.screenshot({ path: `${out}/${width}-title.png` });
    await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state);
    await page.evaluate(async () => {
      const game = window.__emberisle;
      const { createGame } = await import("/src/lib/game/board.ts");
      const st = createGame({ seed: 20261013, humans: [{name:"You"},{name:"Mira"},{name:"Finn"},{name:"Jules"}], bots: 0 });
      const land = st.vertices.filter(v => v.hexes.length >= 2);
      const step = Math.floor(land.length / 8);
      st.players.forEach((p, i) => {
        p.name = ["You", "Mira", "Finn", "Jules"][i];
        p.resources = { timber: 4, clay: 3, wool: 2, grain: 5, ore: 2 };
        for (let k = 0; k < 2; k++) {
          const v = land[(i * 2 + k) * step];
          v.building = { playerId: p.id, kind: k ? "stronghold" : "outpost" };
          const e = st.edges.find(e => (e.va === v.id || e.vb === v.id) && !e.path);
          if (e) e.path = p.id;
        }
      });
      st.log = ["You laid a path."];
      st.phase = "main";
      st.current = st.players[0].id;
      st.dice = [3, 5];
      st.seq++;
      game.setState({ state: st, localId: st.current, mode: "ai", buildMode: "none", banner: null, error: null, synced: game.getState().synced + 1 });
    });
    await page.waitForTimeout(2200);
    const measure = async name => {
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const r = window.__isle;
        const i = r.insets();
        const stack = document.querySelector('[data-hud-stack]').getBoundingClientRect();
        return { insets: i, hole: { width: innerWidth - i.left - i.right, height: innerHeight - i.top - i.bottom }, stack: { width: stack.width, height: stack.height, top: stack.top }, smallTargets: [...document.querySelectorAll('button, input, select')].filter(e => e.checkVisibility() && !e.closest('[aria-hidden="true"]')).map(e => ({ label: e.getAttribute('aria-label') || e.textContent.trim(), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })).filter(e => e.w < 44 || e.h < 44) };
      });
      metrics.push({ width, height, name, ...m });
      await page.screenshot({ path: `${out}/${width}-${name}.png` });
    };
    await measure("main");
    await page.evaluate(() => window.__emberisle.setState({ offer: { tradeId: "design-offer", from: "p1", fromName: "Mira", give: { wool: 2 }, want: { ore: 1 }, until: Date.now() + 20000 }, declined: [] }));
    await measure("offer");
    await page.evaluate(() => window.__emberisle.setState({ offer: null }));
    await page.getByRole("button", { name: "Table menu", exact: true }).click();
    await page.screenshot({ path: `${out}/${width}-menu.png` });
    await context.close();
  }
  writeFileSync(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics));
} finally {
  await browser.close();
}
