// #1101 owner pictures, 2026-11-07: a real practice game at five touch sizes, on the player's turn, on another seat's turn
// (Trade and Wait greyed, with a reason), and with the Sound panel opened from the dock Menu.
// Run from the repo root: node docs/proofs/1101/2026-11-07/capture.mjs
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const OUT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.VITE_PORT) || 8112;
const SIZES = [[430, 932], [390, 844], [375, 812], [820, 1180], [844, 390]];
const HAND = { timber: 3, clay: 1, wool: 2, grain: 2, ore: 0 };

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const frames = (page, n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);
let code = 0;
try {
  for (const [width, height] of SIZES) {
    const tag = `${width}x${height}`;
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state && window.__isle?.renders > 0, null, { timeout: 120_000 });
    await page.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
    const set = (mine) =>
      page.evaluate(({ mine, HAND }) => {
        const g = window.__emberisle;
        const s = g.getState();
        const st = structuredClone(s.state);
        const me = st.players.find((p) => p.id === s.localId);
        const other = st.players.find((p) => p.id !== s.localId);
        st.phase = "main";
        st.current = mine ? me.id : other.id;
        st.dice = [3, 5];
        st.seq++;
        me.resources = HAND;
        me.hidden = { ...me.hidden, plenty: 1 };
        g.setState({ state: st, banner: null, error: null, buildMode: "none" });
      }, { mine, HAND });
    const shot = async (name) => {
      await frames(page, 6);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}${tag}-${name}.png` });
      console.log(`saved ${tag}-${name}.png`);
    };
    await set(true);
    await shot("your-turn");
    await set(false);
    await shot("other-turn");
    await page.getByRole("button", { name: "Table menu" }).click();
    await page.getByTestId("sound-entry").click();
    await page.getByRole("dialog", { name: "Sound" }).waitFor();
    await shot("sound-panel");
    await ctx.close();
  }
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
