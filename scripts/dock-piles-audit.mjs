// Audit dock piles visibility across multiple seeds and token modes (Issue #1158)
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const port = Number(process.env.VITE_PORT) || 18749;
const vite = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
});
await vite.listen();

let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('emberisle-jelly', 'full');
    localStorage.setItem('emberisle-water', 'simple');
  });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => window.__emberisle);
  await page.getByRole('button', { name: 'Four seats, one table', exact: true }).click();

  async function testBoard(seed, numberTokens) {
    await page.evaluate(async ({ seed, numberTokens }) => {
      const { createGame } = await import('/src/lib/game/board.ts');
      const s = createGame({ humans: [{ name: 'Ember' }, { name: 'Tide' }, { name: 'Dune' }], bots: 0, seed, numberTokens });
      s.phase = 'main'; s.rollOff = null; s.current = 'p0'; s.seq = 991;
      window.__emberisle.setState({ state: s, mode: 'hotseat', localId: 'p0', banner: null, coachDismissed: true });
    }, { seed, numberTokens });

    await page.waitForFunction(
      () => window.__isle?.lastSeq === 991 && window.__isle.shore?.group.userData.goodsPiles?.length === 9 && !window.__isle.refitDue && !window.__isle.glide,
      null,
      { timeout: 60000 }
    );

    await page.evaluate(() => {
      const isle = window.__isle;
      isle.shore.update = () => {};
      const canvas = document.createElement('canvas'), gl = isle.renderer.domElement, draw = isle.composer.render.bind(isle.composer);
      window.__cargoFrame = canvas;
      isle.composer.render = (...args) => {
        const result = draw(...args);
        canvas.width = gl.width; canvas.height = gl.height;
        canvas.getContext('2d').drawImage(gl, 0, 0);
        return result;
      };
    });

    async function frame() {
      await page.evaluate(async () => {
        const isle = window.__isle, start = isle.renders, deadline = performance.now() + 60000;
        isle.wake();
        await new Promise((resolve, reject) => {
          const poll = () => isle.renders >= start + 2 ? resolve() : performance.now() > deadline ? reject(Error('cargo frame did not draw')) : requestAnimationFrame(poll);
          poll();
        });
      });
    }

    await frame();

    await page.evaluate(async () => {
      const { Vector3, Matrix4 } = await import('/node_modules/three/build/three.module.js');
      const isle = window.__isle, piles = isle.shore.group.userData.goodsPiles;
      const frame = window.__cargoFrame;
      window.__cargoNormal = frame.getContext('2d').getImageData(0, 0, frame.width, frame.height);
      const rows = piles.map(pile => {
        const matrix = new Matrix4().fromArray(pile.frame), points = [];
        for (const x of [pile.min[0], pile.max[0]]) for (const y of [pile.min[1], pile.max[1]]) for (const z of [pile.min[2], pile.max[2]]) {
          const p = new Vector3(x, y, z).applyMatrix4(matrix);
          points.push(isle.screenAt(p.x, p.y, p.z));
        }
        const rectangle = { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
        return { kind: pile.kind, rectangle };
      });
      window.__cargoRectangles = rows;
      const colors = isle.shore.group.getObjectByName('harbors').geometry.attributes.color;
      window.__cargoColors = colors.array.slice();
      for (const pile of piles) for (let vertex = pile.start; vertex < pile.start + pile.count; vertex++) colors.setXYZ(vertex, 1, 0, 1);
      colors.needsUpdate = true;
    });

    await frame();

    const pixels = await page.evaluate(() => {
      const canvas = window.__cargoFrame, normal = window.__cargoNormal, mask = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height), ratio = canvas.width / innerWidth;
      const expected = (kind, r, g, b) => kind === 'timber' ? r > g * 1.1 && g > b * 1.1 : kind === 'clay' ? r > g * 1.3 && r > b * 1.6 : kind === 'wool' ? r > 160 && g > 150 && b > 120 && r - b < 90 : kind === 'grain' ? r > 120 && r > g * 1.05 && g > b * 1.15 : kind === 'ore' ? Math.max(r, g, b) - Math.min(r, g, b) < 55 && b >= r * 0.85 : true;
      return window.__cargoRectangles.map(pile => {
        let visible = 0, coloured = 0;
        const rect = pile.rectangle;
        for (let y = Math.max(0, Math.floor(rect.top * ratio) - 1); y < Math.min(canvas.height, Math.ceil(rect.bottom * ratio) + 1); y++) {
          for (let x = Math.max(0, Math.floor(rect.left * ratio) - 1); x < Math.min(canvas.width, Math.ceil(rect.right * ratio) + 1); x++) {
            const i = (y * canvas.width + x) * 4, [r, g, b] = mask.data.slice(i, i + 3);
            if (r > g + 40 && b > g + 40) {
              visible++;
              if (expected(pile.kind, ...normal.data.slice(i, i + 3))) coloured++;
            }
          }
        }
        return { kind: pile.kind, visible: visible / (ratio * ratio), colour: coloured / (ratio * ratio) };
      });
    });

    await page.evaluate(() => {
      const colors = window.__isle.shore.group.getObjectByName('harbors').geometry.attributes.color;
      colors.array.set(window.__cargoColors);
      colors.needsUpdate = true;
    });

    return pixels;
  }

  const results = [];
  const testSeeds = [14, 105, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 20, 25, 30, 42, 50, 64, 77, 88, 99];
  const modes = ['random', 'official'];

  let minCount = Infinity;
  let minPileInfo = null;
  const under20 = [];

  for (const mode of modes) {
    for (const seed of testSeeds) {
      const piles = await testBoard(seed, mode);
      for (let i = 0; i < piles.length; i++) {
        const p = piles[i];
        if (p.colour < minCount) {
          minCount = p.colour;
          minPileInfo = { seed, mode, pileIndex: i, ...p };
        }
        if (p.colour < 20) {
          under20.push({ seed, mode, pileIndex: i, ...p });
          console.log(`[UNDER 20] Seed ${seed} (${mode}) pile ${i} (${p.kind}): colour=${p.colour.toFixed(1)}, visible=${p.visible.toFixed(1)}`);
        }
      }
    }
  }

  console.log(`\nAudit completed across ${testSeeds.length * modes.length} boards (${testSeeds.length * modes.length * 9} piles).`);
  console.log(`Piles with fewer than 20 visible pixels: ${under20.length}`);
  console.log(`Smallest visible count seen: ${minCount.toFixed(1)} (${JSON.stringify(minPileInfo)})`);
  console.log(`Full under-20 list:`, JSON.stringify(under20, null, 2));

  await context.close();
} finally {
  await browser?.close();
  await vite.close();
}
