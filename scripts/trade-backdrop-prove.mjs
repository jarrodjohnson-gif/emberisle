// Browser proof for TradePanel backdrop close guard (src/components/game/TradePanel.tsx):
// 1. A drag starting inside TradePanel and releasing on its backdrop keeps TradePanel open and preserves the draft offer.
// 2. A direct click on the backdrop closes TradePanel, clears the draft, and returns focus to the Trade opener.
// Run: npm run trade-backdrop-prove
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let checks = 0;
const ok = (msg) => { checks++; console.log(`ok   ${msg}`); };

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(url);
  await page.waitForFunction(() => window.__emberisle);
  await page.evaluate(async () => {
    const { createGame } = await import("/src/lib/game/board.ts");
    const st = createGame({ seed: 20261118, humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0 });
    st.phase = "main";
    st.rollOff = null;
    st.dice = [3, 4];
    st.current = "p0";
    st.seq = 10;
    st.players[0].resources = { timber: 4, clay: 4, wool: 4, grain: 4, ore: 4 };
    window.__emberisle.setState({
      screen: "play",
      mode: "practice",
      localId: "p0",
      spectator: false,
      state: st,
      buildMode: "none",
      pendingPlace: null,
      howTo: false,
      costs: false,
      tradeOpen: false,
      menuFor: null,
      banner: null,
      error: null,
    });
  });

  const tradeBtn = page.getByRole("button", { name: "Trade", exact: true });
  await tradeBtn.waitFor({ timeout: 15_000 });
  await tradeBtn.click();

  const panel = page.getByTestId("trade-panel");
  await panel.waitFor({ timeout: 10_000 });
  const giveRow = page.getByTestId("trade-give-row");
  const wantRow = page.getByTestId("trade-want-row");
  await giveRow.getByRole("button").first().waitFor({ timeout: 10_000 });
  await giveRow.getByRole("button").first().click();
  await wantRow.getByRole("button").nth(1).click();
  const preview = page.getByTestId("trade-player-preview");
  const beforeDrag = (await preview.textContent())?.trim() ?? "";
  assert.ok(beforeDrag.includes("Give") && beforeDrag.includes("Get"), `draft populated before drag: ${beforeDrag}`);

  const box = await panel.boundingBox();
  assert.ok(box, "trade panel has bounding box");
  const out = await page.evaluate(() => {
    const panelEl = document.querySelector('[data-testid="trade-panel"]');
    const bd = panelEl?.parentElement;
    if (!bd) return null;
    const r = bd.getBoundingClientRect();
    for (const [x, y] of [[r.left + 8, r.top + 8], [r.right - 8, r.top + 8]]) {
      if (document.elementFromPoint(x, y) === bd) return { x, y };
    }
    return null;
  });
  assert.ok(out, "trade panel backdrop point is exposed");

  // 1. Pointer down inside TradePanel dragged out to the backdrop must keep TradePanel and its draft intact.
  await page.mouse.move(box.x + box.width / 2, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(out.x, out.y, { steps: 4 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__emberisle.getState().tradeOpen), true, "drag from inside TradePanel to backdrop keeps it open");
  assert.equal(await panel.isVisible(), true, "TradePanel stays visible after inside-to-backdrop drag");
  assert.equal((await preview.textContent())?.trim(), beforeDrag, "inside-to-backdrop drag preserves the draft offer");
  ok("TradePanel resists inside-to-backdrop drag and preserves its draft offer");

  // 2. Direct click on the backdrop closes TradePanel and returns focus to Trade opener.
  await page.mouse.click(out.x, out.y);
  await panel.waitFor({ state: "detached", timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__emberisle.getState().tradeOpen), false, "direct backdrop click closes TradePanel");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Trade", "backdrop close restores focus to Trade button");
  ok("direct backdrop click closes TradePanel and restores focus to Trade opener");

  // 3. Reopening starts with an empty draft.
  await tradeBtn.click();
  await panel.waitFor({ timeout: 5000 });
  assert.equal((await preview.textContent())?.trim(), "Pick what to give and what to get.", "reopening TradePanel starts with a fresh empty draft");
  ok("reopening TradePanel starts with a fresh empty draft");

  await ctx.close();
  assert.deepEqual(errors, [], `console/page errors: ${errors.join("; ")}`);
  console.log(`trade-backdrop-prove: ${checks} checks passed`);
} finally {
  await browser.close();
  await vite.close();
}
