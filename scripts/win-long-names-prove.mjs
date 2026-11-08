// #1406: the real built desktop results table keeps all seven columns visible with four long names.
// Uses the production WinScreen and computed game scores; no CSS overrides or shortened fixture names.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { preview } from "vite";
import { createGame } from "../src/lib/game/board.ts";
import { totalVP } from "../src/lib/game/rules.ts";

const game = createGame({ humans: [
  { name: "Bartholomew Featherstonehaugh" },
  { name: "Guinevere Wigglesworth-Smythe" },
  { name: "Maximilian Oppenheimer III" },
  { name: "Cordelia Fitzgerald-Hartwell" },
], bots: 0, seed: 1406 });
game.rollOff = null;
game.phase = "over";
game.current = game.winner = "p0";
game.victoryTarget = 10;
for (let i = 0; i < 4; ++i) game.vertices[i].building = { playerId: "p0", kind: "stronghold" };
game.players.forEach((p, i) => { p.hidden.vp = [2, 3, 1, 0][i]; });
game.winReason = { trigger: "pointFortune", points: totalVP(game, "p0"), target: 10 };
const expected = Object.fromEntries(game.players.map((p) => [p.id, { name: p.name, total: totalVP(game, p.id) }]));
const out = process.env.PROOF_OUT || "test-results/win-long-names";
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], { env: { ...process.env, NODE_ENV: "production" }, stdio: "inherit" });
const server = await preview({ preview: { host: "127.0.0.1", port: Number(process.env.VITE_PORT) || 18552, strictPort: true }, logLevel: "error" });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const measurements = [];
try {
  for (const [width, height] of [[1280, 720], [1024, 768], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: false, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(`http://127.0.0.1:${server.config.preview.port}/`);
    await page.waitForFunction(() => !!window.__emberisle);
    await page.evaluate((game) => {
      const store = window.__emberisle;
      store.setState({ spectator: false, isHost: true, menuFor: null, chatOpen: false });
      store.getState().loadState(game, "p0", true, "LONG");
    }, game);
    await page.getByTestId("win-screen").waitFor();
    await page.waitForFunction(() => window.__isle?.landReady);
    const result = await page.getByTestId("win-table-wrap").evaluate((wrap) => {
      const bounds = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      return {
        viewport: [innerWidth, innerHeight], wrap: bounds(wrap), clientWidth: wrap.clientWidth, scrollWidth: wrap.scrollWidth,
        headers: [...wrap.querySelectorAll("th")].map((el) => ({ text: el.textContent, ...bounds(el) })),
        rows: [...wrap.querySelectorAll('[data-testid="win-row"]')].map((row) => ({
          id: row.dataset.player, name: row.cells[0].textContent.trim(), total: row.querySelector('[data-testid="win-total"]').textContent.trim(),
          cells: [...row.cells].map(bounds),
        })),
      };
    });
    measurements.push(result);
    writeFileSync(`${out}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${out}/${width}x${height}.png` });
    console.log(`measured ${width}x${height}: ${JSON.stringify(result)}`);
    assert.equal(result.headers.length, 7, "all seven desktop columns remain present");
    assert.deepEqual(result.headers.map((h) => h.text), ["Player", "Outposts", "Strongholds", "Longest path", "Largest army", "Hidden", "Total"]);
    assert.ok(result.scrollWidth <= result.clientWidth + 1, `${width}x${height}: no sideways scroll (${result.scrollWidth} <= ${result.clientWidth})`);
    assert.equal(result.rows.length, 4, "every player remains present");
    for (const row of result.rows) {
      assert.equal(row.name, expected[row.id].name, "the complete name remains available");
      assert.equal(Number(row.total), expected[row.id].total, "the displayed total matches the game");
      assert.equal(row.cells.length, 7);
      for (const cell of row.cells) {
        assert.ok(cell.left >= result.wrap.left - 1 && cell.right <= result.wrap.right + 1, `${width}x${height}: every result cell fits the wrapper`);
        assert.ok(cell.left >= 0 && cell.right <= width && cell.top >= 0 && cell.bottom <= height, "every result cell fits the viewport");
      }
    }
    for (const header of result.headers) assert.ok(header.left >= result.wrap.left - 1 && header.right <= result.wrap.right + 1, "every heading fits the wrapper");
    assert.equal(requests.some((url) => /\/src\//.test(url)), false, "the proof uses the production build only");
    assert.deepEqual(errors, [], "no browser errors");
    console.log(`ok ${width}x${height}: four full names, seven columns and every score visible without sideways scroll`);
    await context.close();
  }
  console.log("win-long-names-prove: all passed");
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
