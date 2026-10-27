// #1158: Multi-seed harbour goods visibility proof.
// Verifies that terrain features (canopies, peaks, ridges) do not occlude pier goods across seeds and token modes.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = Number(process.env.VITE_PORT) || 18747;
const vite = await createServer({
  server: { host: "127.0.0.1", port, strictPort: true },
  logLevel: "error",
});
await vite.listen();

let browser;
const errors = [];

try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });

  mkdirSync("test-results", { recursive: true });
  mkdirSync("docs/proofs/1158", { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.addInitScript(() => {
    localStorage.setItem("emberisle-jelly", "full");
    localStorage.setItem("emberisle-water", "simple");
  });

  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => typeof window.__emberisle?.getState().startHotseat === "function");
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));

  async function testBoard(seed, numberTokens) {
    await page.evaluate(
      async ({ seed, numberTokens }) => {
        const { createGame } = await import("/src/lib/game/board.ts");
        const s = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Dune" }], bots: 0, seed, numberTokens });
        s.phase = "main";
        s.rollOff = null;
        s.current = "p0";
        s.seq = 991;
        window.__emberisle.setState({ state: s, mode: "hotseat", localId: "p0", banner: null, coachDismissed: true });
      },
      { seed, numberTokens },
    );

    await page.waitForFunction(
      () =>
        window.__isle?.lastSeq === 991 &&
        window.__isle.shore?.group.userData.goodsPiles?.length === 9 &&
        !window.__isle.refitDue &&
        !window.__isle.glide,
      null,
      { timeout: 60000 },
    );

    await page.evaluate(() => {
      const isle = window.__isle;
      isle.shore.update = () => {};
      const canvas = document.createElement("canvas");
      const gl = isle.renderer.domElement;
      const draw = isle.composer.render.bind(isle.composer);
      window.__cargoFrame = canvas;
      isle.composer.render = (...args) => {
        const result = draw(...args);
        canvas.width = gl.width;
        canvas.height = gl.height;
        canvas.getContext("2d").drawImage(gl, 0, 0);
        return result;
      };
    });

    async function frame() {
      await page.evaluate(async () => {
        const isle = window.__isle;
        const start = isle.renders;
        const deadline = performance.now() + 60000;
        isle.wake();
        await new Promise((resolve, reject) => {
          const poll = () => (isle.renders >= start + 2 ? resolve() : performance.now() > deadline ? reject(Error("cargo frame did not draw")) : requestAnimationFrame(poll));
          poll();
        });
      });
    }

    await frame();

    await page.evaluate(async () => {
      const { Vector3, Matrix4 } = await import("/node_modules/three/build/three.module.js");
      const isle = window.__isle;
      const piles = isle.shore.group.userData.goodsPiles;
      const frame = window.__cargoFrame;
      window.__cargoNormal = frame.getContext("2d").getImageData(0, 0, frame.width, frame.height);
      const rows = piles.map((pile, index) => {
        const matrix = new Matrix4().fromArray(pile.frame);
        const points = [];
        for (const x of [pile.min[0], pile.max[0]])
          for (const y of [pile.min[1], pile.max[1]])
            for (const z of [pile.min[2], pile.max[2]]) {
              const p = new Vector3(x, y, z).applyMatrix4(matrix);
              points.push(isle.screenAt(p.x, p.y, p.z));
            }
        const rectangle = {
          left: Math.min(...points.map((p) => p.x)),
          right: Math.max(...points.map((p) => p.x)),
          top: Math.min(...points.map((p) => p.y)),
          bottom: Math.max(...points.map((p) => p.y)),
        };
        return { index, kind: pile.kind, rectangle };
      });
      window.__cargoRectangles = rows;
      const colors = isle.shore.group.getObjectByName("harbors").geometry.attributes.color;
      window.__cargoColors = colors.array.slice();
      for (const pile of piles)
        for (let vertex = pile.start; vertex < pile.start + pile.count; vertex++)
          colors.setXYZ(vertex, 1, 0, 1);
      colors.needsUpdate = true;
    });

    await frame();

    const pixels = await page.evaluate(() => {
      const canvas = window.__cargoFrame;
      const normal = window.__cargoNormal;
      const mask = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      const ratio = canvas.width / innerWidth;
      const expected = (kind, r, g, b) =>
        kind === "timber"
          ? r > g * 1.1 && g > b * 1.1
          : kind === "clay"
            ? r > g * 1.3 && r > b * 1.6
            : kind === "wool"
              ? r > 160 && g > 150 && b > 120 && r - b < 90
              : kind === "grain"
                ? r > 120 && r > g * 1.05 && g > b * 1.15
                : kind === "ore"
                  ? Math.max(r, g, b) - Math.min(r, g, b) < 55 && b >= r * 0.85
                  : true;

      return window.__cargoRectangles.map((pile) => {
        let visible = 0;
        let coloured = 0;
        const rect = pile.rectangle;
        for (let y = Math.max(0, Math.floor(rect.top * ratio) - 1); y < Math.min(canvas.height, Math.ceil(rect.bottom * ratio) + 1); y++) {
          for (let x = Math.max(0, Math.floor(rect.left * ratio) - 1); x < Math.min(canvas.width, Math.ceil(rect.right * ratio) + 1); x++) {
            const i = (y * canvas.width + x) * 4;
            const [r, g, b] = mask.data.slice(i, i + 3);
            if (r > g + 40 && b > g + 40) {
              visible++;
              if (expected(pile.kind, ...normal.data.slice(i, i + 3))) coloured++;
            }
          }
        }
        return { index: pile.index, kind: pile.kind, visible: visible / (ratio * ratio), colour: coloured / (ratio * ratio) };
      });
    });

    await page.evaluate(() => {
      const colors = window.__isle.shore.group.getObjectByName("harbors").geometry.attributes.color;
      colors.array.set(window.__cargoColors);
      colors.needsUpdate = true;
    });

    return pixels;
  }

  // Diverse test boards covering northern piers bordering timber, ore, wool, and clay hexes,
  // in both random and official spiral token distribution modes.
  const testCases = [
    { seed: 14, mode: "official" }, // Issue #1158 repro (grain pier near timber)
    { seed: 105, mode: "official" }, // Issue #1158 repro (ore pier)
    { seed: 10, mode: "random" }, // Northern pier behind timber hex
    { seed: 5, mode: "random" }, // Northern pier behind ore hex
    { seed: 2, mode: "random" }, // Northern pier behind wool hex (oak crest)
    { seed: 7, mode: "random" }, // Northern pier behind wool hex
    { seed: 12, mode: "official" }, // Northern pier behind timber hex (official mode)
    { seed: 88, mode: "random" }, // Northern pier behind clay hex
  ];

  const MIN_VISIBLE_PIXELS = 20;

  for (const { seed, mode } of testCases) {
    const piles = await testBoard(seed, mode);
    assert.equal(piles.length, 9, `seed ${seed} (${mode}): must have 9 goods piles`);
    for (const pile of piles) {
      assert(
        pile.colour >= MIN_VISIBLE_PIXELS,
        `Seed ${seed} (${mode}) pile ${pile.index} (${pile.kind}): ${pile.colour.toFixed(1)} px visible; need >= ${MIN_VISIBLE_PIXELS}`,
      );
    }
    console.log(
      `ok   seed ${seed} (${mode}): all 9 piles visible (min ${Math.min(...piles.map((p) => p.colour)).toFixed(1)} px, max ${Math.max(...piles.map((p) => p.colour)).toFixed(1)} px)`,
    );
  }

  // Capture proof screenshot for Seed 14 official
  await testBoard(14, "official");
  await page.screenshot({ path: "test-results/dock-piles-seed-14.png" });
  await page.screenshot({ path: "docs/proofs/1158/dock-piles-seed-14.png" });

  assert.deepEqual(errors, []);
  console.log("dock piles visibility prove ok");
  await context.close();
} finally {
  await browser?.close();
  await vite.close();
}
