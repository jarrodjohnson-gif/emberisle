// #640: harbor corner access — boardwalks from each pier to its two corners, colored landings at the corners,
// and an enlarged rate plate. Nothing tall (> 0.36) within 0.14 of a corner (the landing disc sits at 0.34).
// Run: npm run harbor-access-prove
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8119;
const fails = [];
const errors = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
mkdirSync("test-results", { recursive: true });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-jelly", "full"));
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState && window.__isle.landReady && !window.__isle.refitDue, null, { timeout: STEP_MS });
  await page.waitForFunction(() => { let found = false; window.__isle.scene.traverse((o) => { if (o.name === "harbors") found = true; }); return found; }, null, { timeout: STEP_MS });
  await page.waitForFunction((r0) => window.__isle.renders > r0 + 2, await page.evaluate(() => window.__isle.renders), { timeout: STEP_MS });

  const result = await page.evaluate(() => {
    const isle = window.__isle;
    const st = window.__emberisle.getState().state;
    let group = null;
    isle.scene.traverse((o) => { if (o.name === "harbors" && !group) group = o.parent; });
    if (!group) return { error: "no shore group" };

    const harbors = group.getObjectByName("harbors");
    if (!harbors || !harbors.geometry) return { error: "no harbors mesh" };

    const goodsPiles = group.userData.goodsPiles ?? [];
    const piles = goodsPiles.length;

    const harborVertices = st.vertices.filter((v) => v.harbor);
    const dockCount = isle.docks?.length ?? 0;

    const pos = harbors.geometry.attributes.position;
    harbors.updateMatrixWorld(true);
    const mat = harbors.matrixWorld.elements;
    const harborVerts = [];
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      const wx = mat[0] * lx + mat[4] * ly + mat[8] * lz + mat[12];
      const wy = mat[1] * lx + mat[5] * ly + mat[9] * lz + mat[13];
      const wz = mat[2] * lx + mat[6] * ly + mat[10] * lz + mat[14];
      harborVerts.push({ x: wx, y: wy, z: wz });
    }

    const cornersWithNearbyGeom = [];
    const cornersWithoutGeom = [];
    for (const hv of harborVertices) {
      const near = harborVerts.some((p) => Math.hypot(p.x - hv.x, p.z - hv.z) < 0.12);
      if (near) cornersWithNearbyGeom.push(hv.id);
      else cornersWithoutGeom.push(hv.id);
    }

    // Landing disc height: the highest harbor vertex within 0.07 of each corner.
    const TOP = 0.34;
    const landingHeights = [];
    for (const hv of harborVertices) {
      let maxY = -Infinity;
      for (const p of harborVerts) {
        if (Math.hypot(p.x - hv.x, p.z - hv.z) < 0.07) maxY = Math.max(maxY, p.y);
      }
      landingHeights.push({ vid: hv.id, harbor: hv.harbor, y: +maxY.toFixed(3), top: TOP });
    }
    const landingAtTop = landingHeights.every((l) => Math.abs(l.y - l.top) < 0.02);

    // Landing colour per harbor: sample the colour attribute near each corner.
    const colAttr = harbors.geometry.attributes.color;
    const landingColours = {};
    if (colAttr) {
      for (const hv of harborVertices) {
        for (let i = 0; i < pos.count; i++) {
          const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
          const wx = mat[0] * lx + mat[4] * ly + mat[8] * lz + mat[12];
          const wy = mat[1] * lx + mat[5] * ly + mat[9] * lz + mat[13];
          const wz = mat[2] * lx + mat[6] * ly + mat[10] * lz + mat[14];
          if (Math.hypot(wx - hv.x, wz - hv.z) < 0.07 && wy > 0.3) {
            const r = colAttr.getX(i), g = colAttr.getY(i), b = colAttr.getZ(i);
            const hex = "#" + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
            landingColours[hv.harbor] = landingColours[hv.harbor] || new Set();
            landingColours[hv.harbor].add(hex);
            break;
          }
        }
      }
    }
    const uniqueKinds = Object.keys(landingColours);

    // Nothing tall (> 0.36, above the landing disc at 0.34) within 0.14 of any harbor corner.
    const tallNearCorner = [];
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      o.updateMatrixWorld(true);
      const p = o.geometry.attributes.position;
      const m = o.matrixWorld.elements;
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
        const wx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
        const wy = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        for (const hv of harborVertices) {
          const dist = Math.hypot(wx - hv.x, wz - hv.z);
          if (dist < 0.14 && wy > 0.36) {
            tallNearCorner.push({ vid: hv.id, height: +wy.toFixed(3), dist: +dist.toFixed(3) });
          }
        }
      }
    });

    const plates = group.getObjectByName("plates");
    const hasPlates = plates && plates.geometry && plates.geometry.attributes.position.count > 0;

    // Triangle count of the shore group.
    let triangles = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (g.index) triangles += g.index.count / 3;
      else if (g.attributes.position) triangles += g.attributes.position.count / 3;
    });

    // Plate pixel size at 1280x720.
    let plateMinPx = Infinity;
    if (plates?.geometry) {
      const pp = plates.geometry.attributes.position;
      plates.updateMatrixWorld(true);
      const pm = plates.matrixWorld.elements;
      const plateCount = Math.floor(pp.count / 6);
      for (let pi = 0; pi < plateCount; pi++) {
        const pts = [];
        for (let vi = pi * 6; vi < (pi + 1) * 6; vi++) {
          const lx = pp.getX(vi), ly = pp.getY(vi), lz = pp.getZ(vi);
          const wx = pm[0] * lx + pm[4] * ly + pm[8] * lz + pm[12];
          const wy = pm[1] * lx + pm[5] * ly + pm[9] * lz + pm[13];
          const wz = pm[2] * lx + pm[6] * ly + pm[10] * lz + pm[14];
          pts.push(isle.screenAt(wx, wy, wz));
        }
        const xs = pts.map((s) => s.x), ys = pts.map((s) => s.y);
        const sz = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        plateMinPx = Math.min(plateMinPx, sz);
      }
    }

    return {
      dockCount,
      harborCorners: harborVertices.length,
      cornersWithGeom: cornersWithNearbyGeom.length,
      cornersWithoutGeom,
      landingAtTop,
      landingHeights: landingHeights.slice(0, 4),
      uniqueKinds: uniqueKinds.length,
      tallNearCorner: tallNearCorner.slice(0, 5),
      tallCount: tallNearCorner.length,
      hasPlates,
      piles,
      triangles: Math.round(triangles),
      plateMinPx1280: +(plateMinPx === Infinity ? 0 : plateMinPx).toFixed(1),
    };
  });

  if (result.error) {
    check("shore loaded", false, result);
  } else {
    check("nine docks on a standard board", result.dockCount === 9, { docks: result.dockCount });
    check("18 harbor corners (two per dock)", result.harborCorners === 18, { corners: result.harborCorners });
    check("every harbor corner has boardwalk geometry nearby (within 0.12)", result.cornersWithGeom === 18 && result.cornersWithoutGeom.length === 0, { withGeom: result.cornersWithGeom, missing: result.cornersWithoutGeom });
    check("landing disc at corner top height (within 0.02 of topOf)", result.landingAtTop, { sample: result.landingHeights });
    check("landing colours differ across harbor kinds", result.uniqueKinds >= 4, { kinds: result.uniqueKinds });
    check("nothing tall (y > 0.36) within 0.14 of any harbor corner", result.tallCount === 0, { tallNearCorner: result.tallNearCorner });
    check("rate plates are present", result.hasPlates, { hasPlates: result.hasPlates });
    check("goods piles on each dock", result.piles === 9, { piles: result.piles });
    console.log(`info triangle count: ${result.triangles}`);
    console.log(`info plate min px at 1280x720: ${result.plateMinPx1280}`);
  }

  await page.screenshot({ path: "test-results/harbor-access-1280x720.png" });

  // 390x844 phone view — rate plate pixel sizes.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx2.addInitScript(() => localStorage.setItem("emberisle-jelly", "full"));
  const phone = await ctx2.newPage();
  phone.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  phone.on("pageerror", (e) => errors.push(String(e)));
  await phone.goto(`http://127.0.0.1:${PORT}/`);
  await phone.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });
  await phone.getByRole("button", { name: "Four seats, one table" }).click();
  await phone.waitForFunction(() => window.__emberisle?.getState().state && window.__isle.lastState && window.__isle.landReady && !window.__isle.refitDue, null, { timeout: STEP_MS });
  await phone.waitForFunction(() => { let found = false; window.__isle.scene.traverse((o) => { if (o.name === "plates") found = true; }); return found; }, null, { timeout: STEP_MS });
  await phone.waitForFunction((r0) => window.__isle.renders > r0 + 2, await phone.evaluate(() => window.__isle.renders), { timeout: STEP_MS });

  const phoneResult = await phone.evaluate(() => {
    const isle = window.__isle;
    let plates = null;
    isle.scene.traverse((o) => { if (o.name === "plates" && !plates) plates = o; });
    if (!plates?.geometry) return { error: "no plates" };
    const pos = plates.geometry.attributes.position;
    plates.updateMatrixWorld(true);
    const mat = plates.matrixWorld.elements;
    const pts = [];
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      const wx = mat[0] * lx + mat[4] * ly + mat[8] * lz + mat[12];
      const wy = mat[1] * lx + mat[5] * ly + mat[9] * lz + mat[13];
      const wz = mat[2] * lx + mat[6] * ly + mat[10] * lz + mat[14];
      pts.push(isle.screenAt(wx, wy, wz));
    }
    const plateCount = Math.floor(pos.count / 6);
    const plateSizes = [];
    for (let p = 0; p < plateCount; p++) {
      const slice = pts.slice(p * 6, (p + 1) * 6);
      const xs = slice.map((s) => s.x);
      const ys = slice.map((s) => s.y);
      plateSizes.push({ w: +(Math.max(...xs) - Math.min(...xs)).toFixed(1), h: +(Math.max(...ys) - Math.min(...ys)).toFixed(1) });
    }
    const smallest = Math.min(...plateSizes.map((s) => Math.max(s.w, s.h)));
    return { plateCount, smallest: +smallest.toFixed(1), plateSizes, view: isle.view };
  });

  if (phoneResult.error) {
    check("390x844: rate plates visible", false, phoneResult);
  } else {
    check("390x844: overhead view", phoneResult.view === "overhead", { view: phoneResult.view });
    check("390x844: rate plates present on the phone", phoneResult.plateCount >= 1, { count: phoneResult.plateCount });
    check("390x844: each rate plate is at least 12 px across on the phone", phoneResult.smallest >= 12, { smallest: phoneResult.smallest });
    console.log(`info plate sizes on phone (px): ${JSON.stringify(phoneResult.plateSizes?.slice(0, 3))}`);
  }

  await phone.screenshot({ path: "test-results/harbor-access-390x844.png" });
  await ctx.close();
  await ctx2.close();

  check("no console errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error("harbor-access-prove failed:", e);
  fails.push("exception");
}

await browser.close();
await vite.close();
if (fails.length) {
  console.log(`\n${fails.length} failed: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\nharbor-access-prove: all checks passed");
