// #643 "My numbers": at 440x956 and 956x440, on a hotseat table with the seat's outposts and a stronghold placed,
// 1. the strip lists exactly the numbers on the hexes touching the seat's buildings, most pips first (ties by the lower);
// 2. a stronghold's hexes show their good twice;
// 3. rolling one of the numbers lights its chip, and it goes out after about 1.2 s;
// 4. before the seat's first outpost there is no strip;
// 5. the strip never moves the map: the tray's height, the declared hole and the live hole are the same with it shown as
//    without, and the live hole stays inside the declared one.
// Screenshots to test-results/my-numbers-<size>.png. Run: npm run my-numbers-prove
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8152;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures.push(name);
};
const frames = (page, n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);
let code = 0;
try {
  for (const [w, h] of [[440, 956], [956, 440]]) {
    const tag = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
    await page.getByRole("button", { name: "Four seats, one table" }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState, null, { timeout: STEP_MS });
    await page.evaluate(() => { const g = window.__emberisle; while (g.getState().state.phase === "rollOff") g.getState().dispatch({ type: "roll" }); });
    await page.waitForFunction(() => !document.querySelector('[data-testid="banner"]'), null, { timeout: STEP_MS });

    // The main phase for seat 0, with or without its buildings; the dice show a number no building touches.
    const deal = (withBuildings) =>
      page.evaluate((withBuildings) => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        const me = st.players[0].id;
        st.current = me;
        st.phase = "main";
        st.dice = [1, 1];
        st.seq++;
        for (const p of st.players) p.resources = { timber: 4, clay: 3, wool: 2, grain: 5, ore: 2 };
        for (const v of st.vertices) if (v.building?.playerId === me) v.building = null;
        if (withBuildings) {
          // Three corners well apart, each on numbered hexes: two outposts and a stronghold.
          const hexes = new Map(st.hexes.map((x) => [x.id, x]));
          const picks = [];
          for (const v of st.vertices) {
            if (picks.length === 3) break;
            if (v.building || v.hexes.filter((id) => hexes.get(id)?.pip).length < 2) continue;
            if (picks.some((q) => Math.hypot(q.x - v.x, q.z - v.z) < 2.5)) continue;
            picks.push(v);
          }
          picks.forEach((v, i) => (v.building = { playerId: me, kind: i === 2 ? "stronghold" : "outpost" }));
        }
        g.setState({ state: st, localId: me, banner: null, error: null });
        return me;
      }, withBuildings);
    const measure = async () => {
      await frames(page, 6);
      await page.waitForTimeout(200);
      return page.evaluate(() => ({
        live: window.__isle.liveInsets(),
        hole: window.__isle.insets(),
        stack: document.querySelector("[data-hud-stack]").getBoundingClientRect().height,
        strip: !!document.querySelector('[data-testid="my-numbers"]'),
      }));
    };

    await deal(false);
    const bare = await measure();
    check(`4 ${tag}: no strip before the seat's first outpost`, !bare.strip);
    const me = await deal(true);
    const shown = await measure();
    check(`5 ${tag}: the strip is shown`, shown.strip);

    // 1, 2: the expected numbers, worked out here from the board, not by the component.
    const want = await page.evaluate((me) => {
      const st = window.__emberisle.getState().state;
      const hexes = new Map(st.hexes.map((x) => [x.id, x]));
      const by = {};
      for (const v of st.vertices) {
        if (v.building?.playerId !== me) continue;
        for (const id of v.hexes) {
          const x = hexes.get(id);
          if (!x?.pip || x.terrain === "waste") continue;
          (by[x.pip] ??= []).push(...Array(v.building.kind === "stronghold" ? 2 : 1).fill(x.terrain));
        }
      }
      const pips = (n) => 6 - Math.abs(7 - n);
      const order = Object.keys(by).map(Number).sort((a, b) => pips(b) - pips(a) || a - b);
      return order.map((n) => ({ n, goods: by[n].sort().join(",") }));
    }, me);
    const got = await page.$$eval('[data-testid="my-numbers"] > li', (els) => els.map((e) => ({ n: Number(e.dataset.n), goods: e.dataset.goods.split(",").sort().join(","), icons: e.querySelectorAll("svg").length })));
    check(`1 ${tag}: the strip lists exactly the numbers on the seat's hexes, most pips first`, JSON.stringify(got.map((g) => g.n)) === JSON.stringify(want.map((x) => x.n)), `${got.map((g) => g.n).join(" ")} (want ${want.map((x) => x.n).join(" ")})`);
    check(`1 ${tag}: each chip pays the goods its hexes give`, JSON.stringify(got.map((g) => g.goods)) === JSON.stringify(want.map((x) => x.goods)));
    check(`2 ${tag}: one icon per paying building, a stronghold twice`, got.every((g) => g.icons === g.goods.split(",").length) && got.some((g) => g.icons >= 2), got.map((g) => `${g.n}:${g.icons}`).join(" "));

    // 5: the map does not move.
    check(`5 ${tag}: the tray is the same height with the strip`, Math.abs(shown.stack - bare.stack) < 0.5, `${bare.stack.toFixed(1)} -> ${shown.stack.toFixed(1)}`);
    check(`5 ${tag}: the declared hole is unchanged`, JSON.stringify(shown.hole) === JSON.stringify(bare.hole));
    check(`5 ${tag}: the live hole is unchanged and inside the declared one`, ["top", "right", "bottom", "left"].every((k) => Math.abs(shown.live[k] - bare.live[k]) < 0.5 && shown.live[k] <= shown.hole[k] + 0.5), JSON.stringify(shown.live));
    await page.screenshot({ path: `test-results/my-numbers-${tag}.png` });

    // 3: roll the strip's top number.
    const top = got[0]?.n ?? 8;
    await page.evaluate((top) => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      st.dice = top > 6 ? [6, top - 6] : [1, top - 1];
      st.rolls = (st.rolls ?? 0) + 1;
      st.seq++;
      g.setState({ state: st });
    }, top);
    await frames(page, 4);
    const lit = await page.$$eval('[data-testid="my-numbers"] > li[data-lit]', (els) => els.map((e) => Number(e.dataset.n)));
    check(`3 ${tag}: a roll of ${top} lights its chip, and only it`, lit.length === 1 && lit[0] === top, JSON.stringify(lit));
    await page.screenshot({ path: `test-results/my-numbers-${tag}-lit.png` });
    await page.waitForTimeout(1600);
    const after = await page.$$eval('[data-testid="my-numbers"] > li[data-lit]', (els) => els.length);
    check(`3 ${tag}: the chip goes out after about 1.2 s`, after === 0);
    await ctx.close();
  }
  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log("my-numbers-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
