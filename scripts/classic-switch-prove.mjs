// #759: actual IsleRenderer and both production builders. Selection, cancellation, failure and shared-scene ownership.
// Delays wrap the real builders/compile; every positive case still constructs and publishes the production appearance.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright";
import { build, createServer, preview } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8198;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true, hmr: false }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [], requests = [];
let production;
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
  let releaseImport, importStarted;
  const importGate = new Promise((resolve) => { releaseImport = resolve; });
  const observedImport = new Promise((resolve) => { importStarted = resolve; });
  await page.route("**/src/lib/scene/classic-board.ts", async (route) => {
    importStarted(); await importGate; await route.continue();
  });
  await page.evaluate(() => window.__isle.setLandLook("classic"));
  await observedImport;
  assert.equal(await page.evaluate(() => {
    const r = window.__isle;
    return r.landReady && r.landStatus.requested === "classic" && r.landStatus.displayed === "jelly" && r.landStatus.loading;
  }), true, "delayed real import keeps matching displayed Jelly");
  await page.evaluate(() => window.__isle.setLandLook("jelly"));
  const imported = page.waitForResponse((response) => response.url().includes("/src/lib/scene/classic-board.ts") && response.status() === 200);
  releaseImport(); await imported;
  await page.unroute("**/src/lib/scene/classic-board.ts");
  console.log("ok delayed real import preserves matching land and cancellation retains latest Jelly request");
  const evaluating = page.evaluate(async () => {
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
    check("cancelled import cannot publish Classic", r.landStatus.displayed === "jelly" && r.landStatus.requested === "jelly" && !r.landStatus.loading);
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

    // Exercise the production parallel-compile branch even on software GL without the extension.
    // Three's real compileAsync still compiles every actual shader, using its documented fallback when needed.
    const originalHas = r.renderer.extensions.has.bind(r.renderer.extensions);
    console.log(`classic-switch: native parallel compile extension ${originalHas("KHR_parallel_shader_compile")}`);
    let forceCompileBranch = false, controlledBranches = 0, realCompileCalls = 0;
    r.renderer.extensions.has = (name) => {
      if (name === "KHR_parallel_shader_compile" && forceCompileBranch) {
        forceCompileBranch = false; ++controlledBranches; return true;
      }
      return originalHas(name);
    };
    // A compile completion must not publish after selection ownership changed.
    const compileGate = held(); let compileStarted = false;
    r.renderer.compileAsync = async (...args) => { ++realCompileCalls; await originalCompile(...args); compileStarted = true; await compileGate.wait; };
    forceCompileBranch = true;
    r.setLandLook("classic");
    await until(() => compileStarted, "held real shader compile");
    r.setLandLook("jelly"); compileGate.release();
    await new Promise((resolve) => setTimeout(resolve, 25));
    check("stale shader completion cannot overwrite latest selection", r.landStatus.displayed === "jelly" && r.landAppearance.group.parent === r.living);
    check("controlled compile branch uses real Three compilation and held completion", controlledBranches === 1 && realCompileCalls === 1, { controlledBranches, realCompileCalls });
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
    forceCompileBranch = true;
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
    // Real timers exercise the unchanged initial-plus-five policy and four-second retry spacing.
    await choose("jelly");
    const attempts = [];
    ClassicBoard.create = async () => { attempts.push(performance.now()); throw new Error("injected repeated construction failure"); };
    r.setLandLook("classic");
    await until(() => attempts.length === 6 && !r.landStatus.loading, "six bounded attempts");
    await new Promise((resolve) => setTimeout(resolve, 4100));
    check("automatic retry stops after exactly six attempts at four-second spacing", attempts.length === 6 && attempts.slice(1).every((time, i) => time - attempts[i] >= 4000), attempts.map((time) => Math.round(time - attempts[0])));
    check("exhausted retries retain matching terrain and expose explicit recovery", r.landReady && r.landStatus.displayed === "jelly" && r.landStatus.requested === "classic" && r.landStatus.error === "Classic could not load");
    ClassicBoard.create = originalClassic;
    r.retryLandLook(); await until(() => r.landStatus.displayed === "classic" && !r.landStatus.loading, "recovery after exhausted retries");
    check("explicit retry recovers after exhaustion", !r.landStatus.error);

    // Full quality uses the same real renderer and production Classic builder.
    await choose("jelly"); r.lite = false;
    await choose("classic"); draw();
    check("full Classic publishes its actual props and preserves common ground plane", r.landAppearance.stats().quality === "full" && r.landAppearance.stats().drawCalls > 19 && next.hexes.every((h) => Math.abs(r.landAppearance.groundAt(h.id, 0, 0) - 0.34) < 1e-6), r.landAppearance.stats());
    const board = r.landAppearance;
    const pose = () => { const values = []; board.group.traverse((o) => values.push(...o.position.toArray(), ...o.scale.toArray(), ...o.quaternion.toArray())); return JSON.stringify(values); };
    board.update(10, true, true); const still = pose(); board.update(200, true, true);
    check("full Classic reduced motion retains a stable pose", pose() === still);
    // Save the actual renderer before the disposal fixture; no UI preference control is implied.
    window.__switchPicturesReady = true;
    await new Promise((resolve) => { window.__continueAfterPictures = resolve; });
    await choose("jelly"); r.lite = true;
    const disposalGate = held(); let disposalBuilt;
    ClassicBoard.create = async (...args) => { disposalBuilt = await originalClassic.apply(ClassicBoard, args); await disposalGate.wait; return disposalBuilt; };
    r.setLandLook("classic"); await until(() => disposalBuilt, "constructed candidate before dispose");
    r.dispose(); disposalGate.release();
    await until(() => disposalBuilt.group.children.length === 0, "disposed renderer rejects completion");
    check("renderer disposal cancels pending publication and frees its built candidate", disposalBuilt.group.parent === null && !r.landReady && r.appearanceRetry === undefined);
    ClassicBoard.create = originalClassic;
    window.__switchProof = { counts, checks: out.length };
    return out;
  });
  await Promise.race([page.waitForFunction(() => window.__switchPicturesReady, null, { timeout: 180_000 }), evaluating.then(() => { throw new Error("proof ended before its picture checkpoint"); })]);
  mkdirSync("test-results", { recursive: true });
  for (const [width, height] of [[1280, 720], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { window.__isle.resize(); window.__isle.draw(); });
    await page.screenshot({ path: `test-results/classic-switch-${width}x${height}.png` });
  }
  await page.evaluate(() => window.__continueAfterPictures());
  const checks = await evaluating;
  for (const c of checks) console.log(`ok ${c.name}${c.details === undefined ? "" : ` ${JSON.stringify(c.details)}`}`);
  mkdirSync("test-results", { recursive: true });
  assert.deepEqual(errors, [], "zero unexpected browser errors");
  console.log("ok zero browser errors");
  await page.close();

  // Production smoke validates compiler-owned hashed URLs and the fresh-query recovery path.
  await build({ logLevel: "error" });
  production = await preview({ preview: { host: "127.0.0.1", port: PORT + 1, strictPort: true }, logLevel: "error" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => {
    localStorage.setItem("emberisle-water", "simple");
    localStorage.setItem("emberisle-jelly", "lite");
  });
  const prod = await context.newPage(), prodRequests = [], prodErrors = [], expectedFailures = [];
  let injected = false;
  prod.on("request", (request) => prodRequests.push(request.url()));
  prod.on("pageerror", (error) => prodErrors.push(error.message));
  prod.on("console", (message) => {
    if (message.type() !== "error") return;
    if (injected && /\/assets\/classic-board-[^/]+\.js/.test(message.location().url) && /Failed to load resource/.test(message.text())) expectedFailures.push(message.text());
    else prodErrors.push(message.text());
  });
  await prod.goto(`http://127.0.0.1:${PORT + 1}/`);
  await prod.waitForFunction(() => window.__isle?.landReady, null, { timeout: 120_000 });
  assert.equal(prodRequests.some((url) => /classic-board|terrain-classic/.test(url)), false, "production Jelly startup never requests Classic");
  assert.equal(prodRequests.some((url) => /\/src\//.test(url)), false, "production startup uses built assets");
  await prod.route("**/assets/classic-board-*.js*", async (route) => {
    if (!injected) { injected = true; await route.abort("failed"); }
    else await route.continue();
  });
  await prod.evaluate(() => window.__isle.setLandLook("classic"));
  await prod.waitForFunction(() => window.__isle.landStatus.error, null, { timeout: 120_000 });
  assert.equal(await prod.evaluate(() => window.__isle.landStatus.displayed === "jelly" && window.__isle.landReady), true, "production failed import retains matching Jelly");
  await prod.evaluate(() => { window.__isle.lite = false; window.__isle.retryLandLook(); });
  await prod.waitForFunction(() => window.__isle.landStatus.displayed === "classic" && !window.__isle.landStatus.error, null, { timeout: 120_000 });
  assert.equal(prodRequests.some((url) => /\/assets\/classic-board-[^/]+\.js\?retry=\d+/.test(url)), true, "production recovery requests the hashed chunk with a fresh query");
  assert.equal(await prod.evaluate(() => window.__isle.landAppearance.stats().quality), "full", "production full Classic actually publishes");
  for (const [width, height] of [[1280, 720], [390, 844], [844, 390]]) {
    await prod.setViewportSize({ width, height });
    await prod.screenshot({ path: `test-results/classic-switch-production-${width}x${height}.png` });
  }
  await prod.evaluate(() => window.__isle.setLandLook("jelly"));
  await prod.waitForFunction(() => window.__isle.landStatus.displayed === "jelly" && !window.__isle.landStatus.loading, null, { timeout: 120_000 });
  assert.equal(prodRequests.some((url) => /\/src\//.test(url)), false, "production switching uses no source URLs");
  assert.deepEqual(prodErrors, [], "production has zero unexpected browser errors");
  console.log(`ok production hashed imports, failed-import recovery, full Classic and switchback; expected injected failures ${JSON.stringify(expectedFailures)}`);
  console.log(`production lazy requests ${JSON.stringify(prodRequests.filter((url) => /jelly-board|classic-board/.test(url)))}`);
  await context.close();
} finally {
  if (production) await new Promise((resolve) => production.httpServer.close(resolve));
  await browser.close();
  await vite.close();
}
