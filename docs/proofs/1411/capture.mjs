// #1411: real-game pictures of the results screen, before and after "who wants to play again".
// A real host loads the #748 four-player finish (Bartholomew hosts and won, Cordelia is a bot). Guinevere, on a socket, has
// said yes. Each size shows the host's screen and Maximilian's (a guest who has not said yet); at 390 x 844 also Maximilian
// after his tap. Device scale 2, touch. Run from the repo root, one browser at a time:
//   node --import ./server/register.mjs docs/proofs/1411/capture.mjs before|after
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "../../../server/node_modules/ws/wrapper.mjs";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";
import { createGame } from "../../../src/lib/game/board.ts";
import { totalVP } from "../../../src/lib/game/rules.ts";

const label = process.argv[2];
if (label !== "before" && label !== "after") throw Error("say before or after");
const out = path.dirname(new URL(import.meta.url).pathname);
const port = Number(process.env.VITE_PORT || 18792);
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-1411-shots-"));
const code = "PLAY";
const g = createGame({ humans: ["Bartholomew Featherstonehaugh", "Guinevere Wigglesworth-Smythe", "Maximilian Oppenheimer III", "Cordelia Fitzgerald-Hartwell"].map((name) => ({ name })), bots: 0, seed: 559, wayfarerMode: "off" });
g.rollOff = null; g.log = []; g.victoryTarget = 10;
[["p0", "stronghold"], ["p0", "stronghold"], ["p0", "stronghold"], ["p0", "outpost"], ["p0", "outpost"], ["p1", "stronghold"], ["p1", "stronghold"], ["p1", "outpost"], ["p1", "outpost"], ["p2", "stronghold"], ["p2", "stronghold"]]
  .forEach(([playerId, kind], i) => { g.vertices[i].building = { playerId, kind }; });
g.longestRoad = "p0"; g.largestArmy = "p2"; g.players[2].knightsPlayed = 3; g.players[3].kind = "bot";
g.players.forEach((p, i) => { p.hidden.vp = [1, 3, 3, 0][i]; });
g.phase = "over"; g.winner = "p0"; g.current = "p0";
g.winReason = { trigger: "outpost", points: totalVP(g, "p0"), target: 10 };
const seats = g.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `fixture-${p.id}`, ...(i === 3 ? { bot: true } : {}) }));
writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ code, host: "s0", next: 4, chat: [], chatSeq: 0, game: g, seats, shape: 2, savedAt: Date.now(), victoryTarget: 10, wayfarerMode: "off" }));

const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: new URL("../../../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: dir, RESULTS_DIR: path.join(dir, "results"), PROFILES_DIR: path.join(dir, "profiles"), GRACE_MS: "600000", HOLD_MS: "600000", TURN_MS: "600000" }, stdio: ["ignore", "pipe", "inherit"] });
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
let browser, ws;
try {
  const hostPort = await new Promise((resolve) => host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); }));
  await vite.listen();
  ws = new WebSocket(`ws://127.0.0.1:${hostPort}`);
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "hello", code, secret: "fixture-p1" }));
  await once(ws, "message");
  ws.send(JSON.stringify({ type: "wantAgain", value: true }));
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const [width, height] of [[430, 932], [390, 844], [375, 812], [820, 1180], [844, 390]]) {
    for (const who of ["host", "guest"]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: "reduce", deviceScaleFactor: 2 });
      await context.addInitScript((w) => { localStorage.setItem("emberisle-seat", JSON.stringify(w)); localStorage.setItem("emberisle-seat-live", w.code); }, { code, secret: `fixture-${who === "host" ? "p0" : "p2"}` });
      const page = await context.newPage();
      page.on("pageerror", (e) => { throw e; });
      await page.goto(`http://127.0.0.1:${port}/?host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}`)}`);
      await page.locator('[data-testid="win-table-wrap"] ul [data-testid="win-row"]').nth(3).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(out, `${label}-${who}-${width}x${height}.png`) });
      const want = page.getByTestId("win-want");
      if (who === "guest" && width === 390 && (await want.count())) {
        await want.tap();
        await page.waitForFunction(() => document.querySelector('[data-testid="win-want"]').getAttribute("aria-pressed") === "true");
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(out, `${label}-guest-tapped-${width}x${height}.png`) });
        await want.tap();
        await page.waitForFunction(() => document.querySelector('[data-testid="win-want"]').getAttribute("aria-pressed") === "false");
      }
      await context.close();
      console.log(`${label} ${who} ${width}x${height}`);
    }
  }
} finally {
  ws?.terminate();
  await browser?.close();
  await vite.close();
  host.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
}
