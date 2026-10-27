import { createServer } from "vite";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";

const vite = await createServer({ server: { host: "127.0.0.1", port: 18752, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});

try {
  mkdirSync("test-results/issue-1158", { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("emberisle-jelly", "full");
    localStorage.setItem("emberisle-water", "simple");
  });
  await page.goto("http://127.0.0.1:18752");
  await page.waitForFunction(() => window.__emberisle);
  await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();

  for (const { seed, mode, pileIndex } of [
    { seed: 5, mode: "random", pileIndex: 2 },
    { seed: 10, mode: "random", pileIndex: 2 },
    { seed: 12, mode: "official", pileIndex: 2 },
    { seed: 14, mode: "official", pileIndex: 1 },
  ]) {
    await page.evaluate(async ({ seed, mode }) => {
      const { createGame } = await import("/src/lib/game/board.ts");
      const s = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Dune" }], bots: 0, seed, numberTokens: mode });
      s.phase = "main"; s.rollOff = null; s.current = "p0"; s.seq = 991;
      window.__emberisle.setState({ state: s, mode: "hotseat", localId: "p0", banner: null, coachDismissed: true });
    }, { seed, mode });

    await page.waitForFunction(() => window.__isle?.lastSeq === 991 && window.__isle.shore?.group.userData.goodsPiles?.length === 9 && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: 60000 });

    await page.evaluate(async () => {
      const isle = window.__isle, start = isle.renders;
      isle.wake();
      await new Promise(r => { const p = () => isle.renders >= start + 2 ? r() : requestAnimationFrame(p); p(); });
    });

    const rect = await page.evaluate(async ({ pileIndex }) => {
      const { Vector3, Matrix4 } = await import("/node_modules/three/build/three.module.js");
      const isle = window.__isle;
      const pile = isle.shore.group.userData.goodsPiles[pileIndex];
      const mat = new Matrix4().fromArray(pile.frame);
      const center = new Vector3((pile.min[0] + pile.max[0]) / 2, (pile.min[1] + pile.max[1]) / 2, (pile.min[2] + pile.max[2]) / 2).applyMatrix4(mat);
      const sc = isle.screenAt(center.x, center.y, center.z);
      return { x: sc.x, y: sc.y, kind: pile.kind };
    }, { pileIndex });

    const clip = {
      x: Math.max(0, Math.round(rect.x - 150)),
      y: Math.max(0, Math.round(rect.y - 150)),
      width: 300,
      height: 300,
    };

    await page.screenshot({ path: `test-results/issue-1158/crop-${seed}-${mode}-pile${pileIndex}-${rect.kind}.png`, clip });
    console.log(`Captured test-results/issue-1158/crop-${seed}-${mode}-pile${pileIndex}-${rect.kind}.png at`, clip);
  }
} finally {
  await browser?.close();
  await vite.close();
}
