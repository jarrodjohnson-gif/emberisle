// #1151: real-game pictures of the title after the owner's answers (A on all three cards), full size (device scale 1).
// Front page, Play page with 0 and 6 open tables, Game options open, and the host/join/watch step (a code typed), at
// 430x932, 390x844, 844x390 and 1280x720. The open-table list rides a routed WebSocket, so no rules host runs.
// Run: node docs/proofs/1151/capture.mjs (writes PNGs next to this file). Prints each state's tray scroll and height.
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const out = new URL("./", import.meta.url).pathname;
const SIX = [
  { code: "K7QP", name: "Ember's table", seated: 1, total: 4, status: "lobby" },
  { code: "M2RT", name: "Tide's table", seated: 2, total: 4, status: "lobby" },
  { code: "Q9ZX", name: "Dune's table", seated: 3, total: 3, status: "lobby" },
  { code: "B4NH", name: "Fern's table", seated: 4, total: 4, status: "playing" },
  { code: "W8LC", name: "Ash's table", seated: 2, total: 3, status: "lobby" },
  { code: "J3VD", name: "Moss's table", seated: 4, total: 4, status: "over" },
];
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:9`;
const browser = await chromium.launch({ front: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const VIEWS = [
  { width: 430, height: 932, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 844, height: 390, touch: true },
  { width: 1280, height: 720 },
];
const tray = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="title-card"]');
    const r = c.getBoundingClientRect();
    return { page: c.dataset.page, scroll: c.scrollHeight - c.clientHeight, top: Math.round(r.top), height: Math.round(r.height) };
  });
let code = 0;
try {
  for (const v of VIEWS) {
    const tag = `${v.width}x${v.height}`;
    for (const tables of [[], SIX]) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, ...(v.touch ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.addInitScript(() => localStorage.setItem("emberisle-name", "Ember"));
      const page = await ctx.newPage();
      await page.routeWebSocket(/127\.0\.0\.1:9\//, (ws) => {
        ws.onMessage((m) => {
          if (JSON.parse(String(m)).type === "list") ws.send(JSON.stringify({ type: "openTables", tables }));
        });
      });
      await page.goto(base);
      await page.getByTestId("title-card").waitFor();
      const shot = async (name) => {
        await page.mouse.move(1, 1);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${out}${name}-${tag}.png` });
        console.log(`${tag} ${name}`, JSON.stringify(await tray(page)));
      };
      const press = (name) => page.getByRole("button", { name, exact: true }).click();
      if (!tables.length) await shot("front");
      await press("Play");
      if (tables.length) await page.getByTestId("open-tables").waitFor();
      await shot(tables.length ? "play-6-tables" : "play-0-tables");
      if (!tables.length) {
        await page.locator("[data-testid='wayfarer-setup'] summary").click();
        await page.getByRole("combobox").first().waitFor();
        await shot("game-options");
        await page.locator("[data-testid='wayfarer-setup'] summary").click();
        await page.getByRole("textbox", { name: "Join code" }).fill("K7QP");
        await page.getByRole("button", { name: "Watch", exact: true }).waitFor();
        await shot("host-join-watch");
      }
      await ctx.close();
    }
  }
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
