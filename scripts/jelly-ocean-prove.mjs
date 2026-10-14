// Living ocean is decoration: bounds, timing, picks, state isolation, pausing and GPU/mesh budget.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = Number(process.env.VITE_PORT || 8172);
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
mkdirSync("test-results/jelly", { recursive: true });
const settle = page => page.waitForFunction(() => !window.__isle.refitDue && !window.__isle.glide);
try {
  for (const [width, height, phone] of [[1280,720,false],[390,844,true],[844,390,true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone });
    // The crystal sea (crystal-water.md), whatever the probe would pick on software GL: the visitors ride its waves.
    await context.addInitScript(() => localStorage.setItem("emberisle-water", "crystal"));
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => m.type() === "error" && errors.push(m.text()));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();
    await page.waitForFunction(() => window.__isle?.lastState);
    await page.evaluate(() => {
      const g = window.__emberisle, state = structuredClone(g.getState().state);
      state.phase = "main"; state.current = state.players[0].id; state.dice = [3,5]; state.seq++;
      state.players.forEach(p => p.resources = { timber:4, clay:3, wool:2, grain:5, ore:2 });
      state.vertices.find(v => v.hexes.length === 3).building = { playerId: state.current, kind: "outpost" };
      g.setState({ state, localId:state.current, banner:null, error:null });
    });
    await settle(page);
    const geometry = await page.evaluate(async () => {
      const r = window.__isle, state = window.__emberisle.getState().state;
      const before = JSON.stringify(state), seq = state.seq;
      const life = r.oceanLife, view = r.oceanViewport();
      const routes = [], observed = new Set();
      let minRadius = Infinity, maxMeshes = 0;
      for (const species of ["dolphin","turtle","whale"]) {
        const lane = life.lane(species, view);
        routes.push({species, fits:!!lane});
        if (!lane) continue; // An oversized visitor waits when the phone has no suitable water lane.
        life.reset(`proof-${species}`);
        life.begin(species, lane);
        for (let age = 0; age <= life.active.duration; age += 0.5) {
          life.active.age = age;
          life.pose(life.active);
          life.group.updateMatrixWorld(true);
          const root = life.creatures[species].root;
          root.traverse(o => {
            if (!o.isMesh) return;
            const a = o.geometry.attributes.position;
            const p = root.position.clone();
            for (let i = 0; i < a.count; i++) {
              p.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);
              minRadius = Math.min(minRadius, Math.hypot(p.x,p.z));
            }
          });
          let meshes = 0;
          life.group.traverseVisible(o => { if (o.isMesh) meshes++; });
          maxMeshes = Math.max(maxMeshes, meshes);
        }
      }
      life.reset("scheduled-visits-proof");
      let waitAfterVisit = Infinity;
      for (let i = 0; i < 40_000; i++) {
        const was = life.snapshot().active;
        life.step(0.1, true, () => view);
        const next = life.snapshot();
        if (next.active) observed.add(next.active.species);
        if (was && !next.active) waitAfterVisit = Math.min(waitAfterVisit,next.next);
        if (next.visible > 1) throw new Error("overlapping wildlife visits");
      }
      const frozen = JSON.stringify(life.snapshot());
      life.step(60,false,() => view);
      const disabledUnchanged = frozen === JSON.stringify(life.snapshot());
      const fieldMargins = r.living.children.filter(o => o.userData.field).map(o => {
        const a = o.geometry.attributes.position;
        let min = Infinity;
        for (let i=0;i<a.count;i++) min=Math.min(min,Math.hypot(a.getX(i),a.getZ(i)));
        return min;
      });
      const pickable = new Set(r.pickables.flatMap(o => { const nodes=[];o.traverse(n=>nodes.push(n));return nodes; }));
      let visitorPickables=0;
      life.group.traverse(o => { if(pickable.has(o))visitorPickables++; });
      const props = r.scene.getObjectByName("floor-props");
      const floorTris = props.geometry.index ? props.geometry.index.count / 3 : props.geometry.attributes.position.count / 3;
      return {floorTris, water: window.__emberisle.water, seq, stateUnchanged:before===JSON.stringify(state),routes,observed:[...observed],minRadius,maxMeshes,waitAfterVisit,disabledUnchanged,fieldMargins,farms:r.farmWork.length,ore:r.oreWork.length,visitorPickables};
    });
    assert.equal(geometry.water?.path, "crystal", `${width}: the crystal sea is on`);
    assert.ok(geometry.floorTris > 0 && geometry.floorTris < 2000, `${width}: sea-floor props under 2k triangles (${geometry.floorTris})`);
    assert.ok(geometry.stateUnchanged, `${width}: ambient events preserve full game state/RNG`);
    assert.ok(geometry.minRadius > 5.65, `${width}: wildlife clears the entire coast, piers and build targets`);
    assert.ok(geometry.maxMeshes <= 4, `${width}: at most four visitor draw meshes`);
    assert.ok(geometry.waitAfterVisit >= 20, `${width}: quiet interval between visits`);
    assert.ok(geometry.disabledUnchanged, `${width}: disabled scheduler does not advance`);
    assert.ok(geometry.observed.length > 0, `${width}: suitable water exists for visits on this viewport`);
    assert.equal(geometry.visitorPickables,0,`${width}: wildlife cannot intercept board picks`);
    assert.ok(geometry.farms>0&&geometry.ore>0&&geometry.fieldMargins.every(m=>m>=0.4),`${width}: farmers/carts exist and crops clear tokens`);
    if(!phone) assert.deepEqual(geometry.observed.sort(),["dolphin","turtle","whale"],"all three species arrive through the random scheduler");

    // Freeze an actual visible visit and all workers, including when the preference flips during motion.
    await page.evaluate(() => {
      const r=window.__isle, life=r.oceanLife;
      life.reset("freeze-proof");
      const lane=life.lane("turtle",r.oceanViewport());
      if(lane) { life.begin("turtle",lane);life.active.age=8;life.pose(life.active); }
    });
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.waitForFunction(()=>window.__isle.wasCalm);
    const snapshot=()=>page.evaluate(()=>{
      const r=window.__isle;
      return JSON.stringify({life:r.oceanLife.snapshot(),time:r.ambientTime,water:r.water.uniforms.uTime.value,props:r.living.children.filter(o=>o.userData.prop).map(o=>[o.position.toArray(),o.rotation.toArray()])});
    });
    const frozen=await snapshot();
    assert.equal(await page.evaluate(()=>window.__isle.motion.value),0,`${width}: reduced motion lays the waves and the breakers flat`);
    await page.waitForTimeout(1250);
    assert.equal(await snapshot(),frozen,`${width}: reduced motion freezes ocean, sheep, farmers and miners`);
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.waitForFunction(()=>!window.__isle.wasCalm);
    await page.evaluate(()=>{
      Object.defineProperty(document,"hidden",{configurable:true,value:true});
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hidden=await snapshot();
    await page.waitForTimeout(350);
    assert.equal(await snapshot(),hidden,`${width}: a hidden page freezes ambient activity`);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event("visibilitychange"));});
    await page.screenshot({path:`test-results/jelly/${width}-living-ocean.png`});
    console.log(`${width}×${height}: game state preserved, clear water lanes, ≤4 animal meshes, random visits, workers, hidden/reduced pause`,JSON.stringify(geometry.routes));
    await context.close();
  }
  assert.deepEqual(errors,[],"zero browser/GL errors");
  console.log("jelly-ocean-prove: all checks passed");
} finally {await browser.close();await vite.close();}
