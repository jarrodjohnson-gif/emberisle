// #759: actual IsleRenderer and both production builders. Selection, cancellation, failure and shared-scene ownership.
// Delays wrap the real builders/compile; every positive case still constructs and publishes the production appearance.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8198;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true, hmr: false }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [], requests = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    localStorage.setItem("emberisle-water", "simple");
    localStorage.setItem("emberisle-jelly", "lite");
  });
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); else if (m.text().startsWith("classic-switch:")) console.log(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.landReady, null, { timeout: 120_000 });
  assert.equal(requests.some((url) => /classic-board|terrain-classic/.test(url)), false, "Jelly-only startup never requests Classic");
  console.log("ok Jelly-only startup never requests Classic");
  const checks = await page.evaluate(async () => {
    const r = window.__isle;
    const { ClassicBoard } = await import("/src/lib/scene/classic-board.ts");
    const { JellyBoard } = await import("/src/lib/scene/jelly-board.ts");
    const { createGame } = await import("/src/lib/game/board.ts");
    const out = [];
    const check = (name, ok, details) => {
      out.push({ name, ok: !!ok, details });
      console.log(`classic-switch: ${ok ? "ok" : "FAIL"} ${name}`);
      if (!ok) throw new Error(`${name}: ${JSON.stringify(details)}`);
    };
    const until = async (predicate, name) => {
      const start = performance.now();
      while (!predicate()) {
        if (performance.now() - start > 120_000) throw new Error(`timed out: ${name}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    // Stop only the automatic loop; each visual sample calls the production draw method explicitly.
    r.renderer.setAnimationLoop(null);
    const draw = () => r.draw();
    const originalClassic = ClassicBoard.create;
    const originalJelly = JellyBoard.create;
    const originalCompile = r.renderer.compileAsync.bind(r.renderer);
    const held = () => {
      let release;
      const wait = new Promise((resolve) => { release = resolve; });
      return { wait, release };
    };
    const shared = () => [r.land, r.pieces, r.marks, r.living, r.wayfarer, r.shore, r.beach, r.oceanLife, r.clock,
      ...r.tokens, ...r.pickables, ...r.boats, ...r.pieces.children, ...r.marks.children];
    const camera = () => JSON.stringify([r.cam().matrixWorld.elements, r.cam().projectionMatrix.elements, r.orbit.target.toArray()]);
    const snapshot = shared(), cameraBefore = camera(), stateBefore = JSON.stringify(r.lastState);
    const pending = { kind: "vertex", id: r.lastState.vertices[0].id };
    r.setPending(pending);
    const matches = () => shared().length === snapshot.length && shared().every((o, i) => o === snapshot[i]);
    const choose = async (look) => {
      r.setLandLook(look);
      await until(() => r.landStatus.displayed === look && !r.landStatus.loading && !r.landStatus.error, look);
    };
    check("initial status distinguishes request, display, quality and readiness", r.landStatus.requested === "jelly" && r.landStatus.displayed === "jelly" && r.landStatus.quality === "lite" && r.landStatus.ready && !r.landStatus.error, r.landStatus);
    const oldJelly = r.jellyBoard;
    const waitBuild = held();
    let began = false, cancelledBuilt = null;
    ClassicBoard.create = async (...args) => { began = true; await waitBuild.wait; return originalClassic.apply(ClassicBoard, args); };
    r.setLandLook("classic");
    await until(() => began, "held real Classic build");
    check("same-board loading keeps old Jelly and separate request", r.jellyBoard === oldJelly && r.landStatus.displayed === "jelly" && r.landStatus.requested === "classic" && r.landStatus.loading);
    waitBuild.release();
    await until(() => r.landStatus.displayed === "classic", "Classic publication");
    draw();
    check("Classic publishes atomically and preserves shared scene identities", matches());
    check("Classic never masquerades as Jelly proof access", r.jellyBoard === null && r.landAppearance.group.name === "classic-board");
    check("same-board switch preserves camera, pending selection and state", camera() === cameraBefore && r.pending === pending && JSON.stringify(r.lastState) === stateBefore);
    check("Classic diagnostics report actual lite geometry", r.terrainStats().ready && r.terrainStats().drawCalls === 19 && r.landAppearance.stats().quality === "lite", r.terrainStats());
    check("old Jelly is disposed after replacement attaches", oldJelly.group.children.length === 0 && r.landAppearance.group.parent === r.living);
    ClassicBoard.create = originalClassic;
    await choose("jelly");
    check("switch back restores real Jelly diagnostics", r.jellyBoard instanceof JellyBoard && matches());

    // A real fully built stale result is disposed, including when its producer ignores cancellation.
    const staleGate = held(); let staleStarted = false;
    ClassicBoard.create = async (...args) => {
      const built = await originalClassic.apply(ClassicBoard, args);
      cancelledBuilt = built; staleStarted = true; await staleGate.wait; return built;
    };
    r.setLandLook("classic");
    await until(() => staleStarted, "constructed stale candidate");
    r.setLandLook("jelly");
    staleGate.release();
    await until(() => cancelledBuilt.group.children.length === 0, "stale disposal");
    check("rapid choices reject and dispose stale construction", r.landStatus.displayed === "jelly" && !r.landStatus.loading && cancelledBuilt.group.parent === null);
    ClassicBoard.create = originalClassic;

    // A compile completion must not publish after selection ownership changed.
    const compileGate = held(); let compileStarted = false;
    r.renderer.compileAsync = async (...args) => { await originalCompile(...args); compileStarted = true; await compileGate.wait; };
    r.setLandLook("classic");
    await until(() => compileStarted, "held real shader compile");
    r.setLandLook("jelly"); compileGate.release();
    await new Promise((resolve) => setTimeout(resolve, 25));
    check("stale shader completion cannot overwrite latest selection", r.landStatus.displayed === "jelly" && r.landAppearance.group.parent === r.living);
    r.renderer.compileAsync = originalCompile;

    // Construction and shader failures preserve the matching land and expose explicit recovery.
    ClassicBoard.create = async () => { throw new Error("injected construction failure"); };
    r.setLandLook("classic");
    await until(() => r.landStatus.error, "construction error");
    check("construction failure keeps matching land and requested choice", r.landStatus.requested === "classic" && r.landStatus.displayed === "jelly" && r.landReady && r.landStatus.error === "Classic could not load");
    ClassicBoard.create = originalClassic;
    r.retryLandLook(); await until(() => r.landStatus.displayed === "classic" && !r.landStatus.error, "explicit recovery");
    check("explicit retry clears error on complete publication", !r.landStatus.loading && r.landReady);
    await choose("jelly");
    let failedCandidate;
    ClassicBoard.create = async (...args) => { failedCandidate = await originalClassic.apply(ClassicBoard, args); return failedCandidate; };
    r.renderer.compileAsync = async () => { throw new Error("injected shader failure"); };
    r.setLandLook("classic"); await until(() => r.landStatus.error, "shader error");
    check("shader failure disposes unpublished geometry and retains old land", failedCandidate.group.children.length === 0 && r.landStatus.displayed === "jelly" && r.landReady);
    r.renderer.compileAsync = originalCompile; ClassicBoard.create = originalClassic;
    r.setLandLook("jelly");

    // A canonical board change must remove the incompatible appearance before publishing its new tokens/picks.
    const next = createGame({ seed: 20261106, humans: [{ name: "Elm" }], bots: 0 });
    const nextBefore = JSON.stringify(next);
    const newGate = held(); let newStarted = false;
    JellyBoard.create = async (...args) => { newStarted = true; await newGate.wait; return originalJelly.apply(JellyBoard, args); };
    r.setBoard(next, { vertices: [], edges: [], hexes: [] }, false);
    check("new deal immediately drops old appearance and publishes current stand-ins", !r.landReady && r.slabs?.count === next.hexes.length && r.landStatus.displayed === null && r.jellyBoard === null);
    check("new deal tokens and pick IDs match current canonical board", r.tokens.every((o) => next.hexes.some((h) => h.id === o.userData.hex && h.pip === o.userData.token)) && r.pickables.filter((o) => o.userData.kind === "hex").every((o) => next.hexes.some((h) => h.id === o.userData.id)));
    await until(() => newStarted, "new board held build"); newGate.release();
    await until(() => r.landReady, "new board publication"); JellyBoard.create = originalJelly;
    check("new deal construction leaves canonical state untouched", JSON.stringify(next) === nextBefore);
    // Current payout and blocking signals are copied before replacement, without replaying roll or tap hooks.
    const paid = next.hexes.find((h) => h.terrain !== "waste").id;
    r.caps.get(paid).emissiveIntensity = 0.2;
    const signals = { roll: 0, tap: 0, glow: [], robber: [] };
    ClassicBoard.create = async (...args) => {
      const b = await originalClassic.apply(ClassicBoard, args);
      for (const method of ["roll", "tap", "glow", "robber"]) {
        const old = b[method].bind(b);
        b[method] = (...values) => { if (Array.isArray(signals[method])) signals[method].push(values); else signals[method]++; return old(...values); };
      }
      return b;
    };
    await choose("classic");
    check("switch copies current glow and blocking without replaying events", signals.roll === 0 && signals.tap === 0 && signals.glow.some(([id, level]) => id === paid && level === 0.2) && signals.robber.length > 0, signals);
    ClassicBoard.create = originalClassic;
    const context = r.visibility(), frozen = JSON.stringify(context);
    r.landAppearance.setVisibilityContext(context);
    check("visibility update does not mutate caller snapshot", JSON.stringify(context) === frozen);
    draw();
    // Render resource counts settle after each complete cycle, rather than growing with retired geometry.
    const counts = [];
    for (let i = 0; i < 3; ++i) {
      await choose("jelly"); draw(); await choose("classic"); draw();
      counts.push({ ...r.renderer.info.memory });
    }
    check("repeated swaps stabilize renderer resources", counts.slice(1).every((v) => v.geometries === counts[0].geometries && v.textures === counts[0].textures), counts);
    window.__switchProof = { counts, checks: out.length };
    return out;
  });
  for (const c of checks) console.log(`ok ${c.name}${c.details === undefined ? "" : ` ${JSON.stringify(c.details)}`}`);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/classic-switch-1280.png" });
  assert.deepEqual(errors, [], "zero unexpected browser errors");
  console.log("ok zero browser errors");
} finally {
  await browser.close();
  await vite.close();
}
