// #363 / #445: practice versus the isle trades with its bots, in the browser, with no host.
//   1. The person opens Trade, steps 1 grain to give and 1 wool to want, and presses Ask the table. The bot that needs
//      grain takes it after its delay: the toast reads "<bot> takes it." and the goods move.
//   2. A bot one grain short asks on its own turn: the toast is one line ("<bot> offers 1 wool for 1 grain") with Yes and
//      No, the bot's turn waits on it, the person's Yes moves the goods, and the bot plays on.
//   3. The same ask, and the person says No: once every seat has declined it closes, and the bot still plays on.
// Every wait is on the store or the page, never a fixed sleep. Zero console errors.
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import { chooseBotAction, chooseTradeAsk, shouldAcceptTrade } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

// CI renders the island with software GL, where one frame can take seconds; a step gets this long to show.
const STEP_MS = 15_000;
const PORT = 8098;

// A practice game past setup and into `main` for `current`, with these hands (as server/practice-trade-prove.mjs).
function game(current, hands, seed) {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  g.phase = "main";
  g.current = current;
  g.dice = [3, 4];
  for (const p of g.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0, ...hands[p.id] };
  for (const r of RESOURCES) g.bank[r] = 19 - g.players.reduce((n, p) => n + p.resources[r], 0);
  return g;
}
// The bot p2 saves for a stronghold and lacks one grain; p1 and p3 hold no wool and no grain.
const HANDS = { p0: { ore: 1, timber: 1, grain: 1 }, p1: { clay: 1 }, p2: { grain: 2, ore: 2, wool: 2 }, p3: { timber: 1 } };
const gA = game("p0", HANDS, 11);
const gC = game("p2", { ...HANDS, p0: { grain: 1, clay: 1 } }, 11);
if (!shouldAcceptTrade(gA, "p2", { from: "p0", give: { grain: 1 }, want: { wool: 1 } })) throw new Error("hands: p2 would not take the ask");
const askC = chooseTradeAsk(gC, "p2");
if (!askC) throw new Error("hands: p2 would not ask");
const bot = gA.players.find((p) => p.id === "p2").name;

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Play versus the isle" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state);
  // Each step starts a fresh practice game (as the Title's button does) and swaps in the hand-built state.
  const load = (g) =>
    page.evaluate((g) => {
      const s = window.__emberisle.getState();
      s.goTitle();
      s.startAi();
      window.__emberisle.setState({ state: g });
    }, g);
  const toast = page.getByTestId("trade-toast");
  // Every hand at the moment the open offer closes. Once it has, the bot's turn plays on (a build, a fortune, the next
  // seat's roll) and moves goods for its own reasons, so the trade is judged on this snapshot, not on a later read.
  const watchClose = () =>
    page.evaluate(() => {
      window.__closed = null;
      const stop = window.__emberisle.subscribe((now, prev) => {
        if (prev.offer && !now.offer) {
          window.__closed = Object.fromEntries(now.state.players.map((p) => [p.id, { ...p.resources }]));
          stop();
        }
      });
    });
  const closedHands = async () => {
    await page.waitForFunction(() => window.__closed, null, { timeout: STEP_MS });
    return page.evaluate(() => window.__closed);
  };

  // 1. The person asks through the panel.
  await load(gA);
  await page.getByRole("button", { name: "Trade", exact: true }).click({ timeout: STEP_MS });
  const panel = page.getByTestId("trade-panel");
  await panel.getByRole("button", { name: "More grain to give" }).click();
  await panel.getByRole("button", { name: "More wool to want" }).click();
  await watchClose();
  await panel.getByRole("button", { name: "Ask the table" }).click();
  await page.waitForFunction(() => window.__emberisle.getState().offer?.from === "p0", null, { timeout: STEP_MS });
  await toast.getByText(`${bot} takes it.`).waitFor({ timeout: STEP_MS });
  const h1 = await closedHands();
  console.log(`person asks: "${bot} takes it."; Ember ${JSON.stringify(h1.p0)}, ${bot} ${JSON.stringify(h1.p2)}`);
  if (h1.p0.grain !== 0 || h1.p0.wool !== 1 || h1.p2.grain !== 3 || h1.p2.wool !== 1) throw new Error("the goods did not move");

  // 2. The bot asks on its turn; the person answers from the toast.
  await load(gC);
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor({ timeout: STEP_MS });
  await watchClose();
  const line = await dialog.locator("p").first().textContent();
  const buttons = await dialog.getByRole("button").allTextContents();
  const want = `${bot} offers 1 ${Object.keys(askC.give)[0]} for 1 ${Object.keys(askC.want)[0]}`;
  console.log(`bot asks: "${line}" [${buttons.join(" / ")}]`);
  if (line !== want || buttons.join(",") !== "Yes,No") throw new Error(`the bot's ask reads ${JSON.stringify({ line, buttons })}, wanted "${want}" + Yes/No`);
  const waiting = await page.evaluate(() => {
    const s = window.__emberisle.getState();
    return { current: s.state.current, phase: s.state.phase, seq: s.state.seq };
  });
  if (waiting.current !== "p2" || waiting.phase !== "main") throw new Error(`the bot's turn did not wait on its ask: ${JSON.stringify(waiting)}`);
  await dialog.getByRole("button", { name: "Yes" }).click();
  const h2 = await closedHands();
  if (h2.p0.grain !== 0 || h2.p2.grain !== 3) throw new Error(`the person's Yes moved nothing: ${JSON.stringify(h2)}`);
  await page.waitForFunction(() => window.__emberisle.getState().state.current !== "p2", null, { timeout: STEP_MS });
  const log = await page.evaluate((n) => window.__emberisle.getState().gameLog.map((l) => l.text).filter((t) => t.startsWith(n)), bot);
  console.log(`person says Yes: Ember ${JSON.stringify(h2.p0)}; ${bot} plays on: ${JSON.stringify(log.slice(-3))}`);

  // 3. The same ask, and the person says No: with every seat declined the offer closes with no move made, and the bot's
  //    turn still plays on.
  await load(gC);
  await dialog.waitFor({ timeout: STEP_MS });
  await watchClose();
  await dialog.getByRole("button", { name: "No" }).click();
  const h3 = await closedHands();
  if (h3.p0.grain !== 1 || h3.p0.wool !== 0 || h3.p2.grain !== 2 || h3.p2.wool !== 2) throw new Error(`a declined ask moved goods: ${JSON.stringify(h3)}`);
  await page.waitForFunction(() => window.__emberisle.getState().state.current !== "p2", null, { timeout: STEP_MS });
  console.log(`person says No: nothing moves, and ${bot} plays on`);

  if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
  console.log("practice trade ui prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  process.exit(code);
}
