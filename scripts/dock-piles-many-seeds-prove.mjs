import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = Number(process.env.VITE_PORT) || 18749;
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { localStorage.setItem("emberisle-jelly", "full"); localStorage.setItem("emberisle-water", "simple"); });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => window.__emberisle);
  await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();
  await page.waitForFunction(() => window.__isle?.shore?.group.userData.goodsPiles?.length === 9, null, { timeout: 60000 });
  const result = await page.evaluate(async () => {
    const { createGame } = await import("/src/lib/game/board.ts");
    const { buildShore } = await import("/src/lib/scene/harbor-jelly.ts");
    const { hashStr } = await import("/src/lib/utils.ts");
    const isle = window.__isle, failures = [], overhang = [], buried = [], kinds = new Set();
    let count = 0, lifted = 0;
    for (const mode of ["official", "random"]) for (let seed = 0; seed < 40; seed++) {
      const state = createGame({ seed, numberTokens: mode, humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Dune" }], bots: 0 });
      const vbyId = new Map(state.vertices.map(v => [v.id, v]));
      const docks = [];
      for (let i = 0; i < isle.coastOrder.length; i++) {
        const va = vbyId.get(isle.coastOrder[i]), vb = vbyId.get(isle.coastOrder[(i + 1) % isle.coastOrder.length]);
        if (!va?.harbor || va.harbor !== vb?.harbor) continue;
        const ma = isle.coastMiter.get(va.id), mb = isle.coastMiter.get(vb.id);
        docks.push({ cx: (va.x + vb.x) / 2, cz: (va.z + vb.z) / 2, mx: (ma.mx + mb.mx) / 2, mz: (ma.mz + mb.mz) / 2, kind: va.harbor, vids: [va.id, vb.id] });
      }
      if (docks.length !== 9) throw Error(`${mode} seed ${seed}: ${docks.length} docks`);
      const hexes = state.hexes.map(h => `${h.id}:${h.terrain}:${h.pip ?? ""}`).join(",");
      const ids = state.vertices.filter(v => v.harbor).map(v => v.id).join(",");
      const shore = buildShore(isle.coast, docks, hashStr(`${hexes}|${ids}|shore`));
      for (const pile of shore.group.userData.goodsPiles) {
        kinds.add(pile.kind); count++;
        // #1158: a lifted pier's skid must cover the packed goods end to end (no overhang) and the lifebuoy must stand on top of it
        // (not inside it); an unlifted pier has no skid and the lifebuoy stays on the deck.
        const e = 0.001, sk = pile.skid;
        if (sk) {
          lifted++;
          if (!(pile.min[2] >= sk.from - e && pile.max[2] <= sk.to + e && pile.min[0] >= -sk.halfWidth - e && pile.max[0] <= sk.halfWidth + e)) overhang.push({ mode, seed, kind: pile.kind, min: pile.min, max: pile.max, skid: sk });
          if (!(pile.buoy.baseY >= sk.top - 1e-6 && pile.buoy.z >= sk.from - e && pile.buoy.z <= sk.to + e && Math.abs(pile.buoy.x) <= sk.halfWidth)) buried.push({ mode, seed, kind: pile.kind, buoy: pile.buoy, skid: sk });
        } else if (Math.abs(pile.buoy.baseY - 0.1) > 1e-6) buried.push({ mode, seed, kind: pile.kind, buoy: pile.buoy, skid: null });
        if (!(pile.min[0] >= -pile.deck.width / 2 - 0.001 && pile.max[0] <= pile.deck.width / 2 + 0.001 && pile.min[2] >= pile.deck.from - 0.001 && pile.max[2] <= pile.deck.to + 0.001)) failures.push({ mode, seed, kind: pile.kind, min: pile.min, max: pile.max, deck: pile.deck });
      }
      shore.dispose();
    }
    return { failures, overhang, buried, lifted, kinds: [...kinds].sort(), count };
  });
  assert.deepEqual(result.failures, [], JSON.stringify(result.failures));
  assert.deepEqual(result.overhang, [], `goods overhang their skid: ${JSON.stringify(result.overhang.slice(0, 3))}`);
  assert.deepEqual(result.buried, [], `lifebuoy hidden in the skid or off the deck: ${JSON.stringify(result.buried.slice(0, 3))}`);
  assert(result.lifted > 0, "no pier was lifted: the skid checks above proved nothing");
  assert.deepEqual(result.kinds, ["any", "clay", "grain", "ore", "timber", "wool"]);
  assert.equal(result.count, 720);
  console.log(`dock-piles-many-seeds-prove: ${result.count} piles within piers across 40 seeds in each mode; all six kinds; ${result.lifted} lifted piers have goods on their skid and a visible lifebuoy`);
} finally {
  await browser?.close();
  await vite.close();
}
