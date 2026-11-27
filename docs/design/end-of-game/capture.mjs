// End of game and game log design: today's win screen and Table menu, from a real practice game played to its end by
// play.mjs. Writes before-win-<size>.png, before-win-open-<size>.png (one row opened, phones) and before-menu-<size>.png
// here, at device scale 2, and saves the game in game.json. Run from the repo root:
//   node --import ./server/register.mjs docs/design/end-of-game/capture.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { play } from "./play.mjs";

const DIR = "docs/design/end-of-game";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
  { tag: "1280x720", width: 1280, height: 720 },
];

// One game for every picture: Ember wins, and a mid-game table exists for the menu.
let game = existsSync(`${DIR}/game.json`) ? JSON.parse(readFileSync(`${DIR}/game.json`, "utf8")) : null;
for (let seed = 11; !game; seed++) {
  const g = play(seed);
  if (g.over.winner === "p0" && g.mid) game = g;
}
writeFileSync(`${DIR}/game.json`, JSON.stringify(game));

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const PORT = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
    const load = (g) =>
      page.evaluate((g) => {
        const e = window.__emberisle;
        if (e.getState().screen !== "play") e.getState().startAi();
        const at = Date.now();
        e.setState({ runBots: () => {}, state: g, gameLog: g.log.map((text) => ({ at, text })), buildMode: "none", error: null, banner: null, toast: null });
      }, g);
    const settle = () => page.waitForTimeout(1200);
    const press = (loc) => (v.touch ? loc.tap() : loc.click());

    await load(game.mid);
    await page.getByTestId("build-open").waitFor();
    await press(page.getByRole("button", { name: "Table menu" }));
    await page.getByTestId("table-menu").waitFor();
    await settle();
    await page.screenshot({ path: `${DIR}/before-menu-${v.tag}.png` });
    await page.keyboard.press("Escape");

    await load(game.over);
    await page.getByTestId("win-menu").waitFor();
    await page.getByTestId("win-row").first().waitFor();
    await settle();
    await page.screenshot({ path: `${DIR}/before-win-${v.tag}.png` });
    if (v.touch) {
      await press(page.getByTestId("win-row").first());
      await settle();
      await page.screenshot({ path: `${DIR}/before-win-open-${v.tag}.png` });
    }
    await press(page.getByTestId("win-look"));
    await page.getByTestId("win-show").waitFor();
    await settle();
    await page.screenshot({ path: `${DIR}/before-win-hidden-${v.tag}.png` });
    await ctx.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`capture: ok, pictures in ${DIR}`);
} finally {
  await browser.close();
  await vite.close();
}
