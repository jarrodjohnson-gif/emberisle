import { createServer } from "vite";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";

const prefix = process.argv[2] || "after"; // "before" or "after"
const port = 18755;
const vite = await createServer({
  server: { host: "127.0.0.1", port, strictPort: true },
  logLevel: "error",
});
await vite.listen();

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  mkdirSync("docs/proofs/1158", { recursive: true });
  // Phone size: 390x844
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("emberisle-jelly", "full");
    localStorage.setItem("emberisle-water", "simple");
  });

  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => typeof window.__emberisle?.getState().startHotseat === "function");
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));

  const testBoards = [
    { seed: 10, mode: "random", name: "north-seed-10" },
    { seed: 14, mode: "official", name: "non-north-seed-14" },
  ];

  for (const { seed, mode, name } of testBoards) {
    await page.evaluate(
      async ({ seed, mode }) => {
        const { createGame } = await import("/src/lib/game/board.ts");
        const s = createGame({
          humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Dune" }],
          bots: 0,
          seed,
          numberTokens: mode,
        });
        s.phase = "main";
        s.rollOff = null;
        s.current = "p0";
        s.seq = 991;
        window.__emberisle.setState({ state: s, mode: "hotseat", localId: "p0", banner: null, coachDismissed: true });
      },
      { seed, mode },
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

    await page.evaluate(async () => {
      const isle = window.__isle;
      const start = isle.renders;
      isle.wake();
      await new Promise((r) => {
        const p = () => (isle.renders >= start + 2 ? r() : requestAnimationFrame(p));
        p();
      });
    });

    const outPath = `docs/proofs/1158/phone-${prefix}-${name}.png`;
    await page.screenshot({ path: outPath });
    console.log(`Saved full-board phone screenshot: ${outPath}`);
  }
} finally {
  await browser?.close();
  await vite.close();
}
