// #1417 pictures: the real game at 430x932, 390x844, 375x812 and 820x1180, device scale 2. Not a CI proof.
// Run from the root of the checkout to picture, one browser at a time: node <path to>/capture.mjs <out dir> <before|after>
// "before" is main built without this change; "after" is this branch. Same script, same crafted states:
// - table: a four-seat table set through window.__emberisle.setState, Mira in Dune, Jarrod on turn;
// - seats-3x: the seat strip or rail at device scale 3, so the 10 to 12 px dots can be judged;
// - lobby: a real host with three bots and a chat line from each seat, a soundboard line and a reaction (Mira, Dune);
// - results: Mira (Dune) wins, so the winner's dot is the pale one.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

const [out, label] = process.argv.slice(2);
if (!out || !["before", "after"].includes(label)) throw new Error("usage: capture.mjs <out dir> <before|after>");
mkdirSync(out, { recursive: true });
const { chromium } = await import(pathToFileURL(path.resolve("scripts/proof-browser.mjs")).href);
const SIZES = [[430, 932], [390, 844], [375, 812], [820, 1180]];

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1417-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: path.resolve("server"), env: { ...process.env, PORT: "0", ROOMS_DIR: rooms, RESULTS_DIR: `${rooms}/results` } });
const hostPort = await new Promise((resolve) => host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); }));
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

const open = async ([width, height], scale = 2) => {
  const phone = width < 800;
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: phone, deviceScaleFactor: scale, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${width}x${height}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${width}x${height}: ${m.text()}`));
  await page.addInitScript(() => localStorage.setItem("emberisle-name", "Jarrod"));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
};

// The design packet's crafted table (docs/design/seat-dot-ring/capture.mjs): pieces and goods so seats carry real counts.
const crafted = async (page) => {
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async () => {
    const game = window.__emberisle;
    const { createGame } = await import("/src/lib/game/board.ts");
    const st = createGame({ seed: 20261107, humans: [{ name: "Jarrod" }, { name: "Josh" }, { name: "Mira" }, { name: "Finn" }], bots: 0 });
    const land = st.vertices.filter((v) => v.hexes.length >= 2);
    const step = Math.floor(land.length / 8);
    st.players.forEach((p, i) => {
      p.resources = { timber: 2, clay: 1, wool: 3, grain: 1, ore: 2 };
      for (let k = 0; k < 2; k++) {
        const v = land[(i * 2 + k) * step];
        v.building = { playerId: p.id, kind: k ? "stronghold" : "outpost" };
        const e = st.edges.find((e) => (e.va === v.id || e.vb === v.id) && !e.path);
        if (e) e.path = p.id;
      }
    });
    st.log = ["Jarrod laid a path."];
    st.phase = "main";
    st.current = st.players[0].id;
    st.dice = [3, 5];
    st.seq++;
    game.setState({ state: st, localId: st.current, mode: "hotseat", buildMode: "none", banner: null, error: null, synced: game.getState().synced + 1 });
  });
  await page.waitForTimeout(1500);
};
const jpg = (page, name) => page.screenshot({ path: path.join(out, `${name}-${label}.jpg`), type: "jpeg", quality: 80 });

try {
  for (const size of SIZES) {
    const tag = size.join("x");
    const page = await open(size);
    await crafted(page);
    await jpg(page, `${tag}-table`);
    await page.evaluate(() => {
      const game = window.__emberisle;
      const st = structuredClone(game.getState().state);
      st.phase = "over";
      st.winner = st.players[2].id;
      st.seq++;
      game.setState({ state: st });
    });
    await page.getByTestId("win-screen").waitFor();
    await page.waitForTimeout(800);
    await jpg(page, `${tag}-results`);
    await page.context().close();

    const zoom = await open(size, 3);
    await crafted(zoom);
    const clip = await zoom.evaluate(() => {
      const strip = document.querySelector('[data-testid="seat-strip"]');
      const el = strip ?? document.querySelector('[data-testid="rail-p1"]').parentElement.parentElement;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: Math.min(innerWidth - Math.max(0, r.x - 4), r.width + 8), height: r.height + 8 };
    });
    await zoom.screenshot({ path: path.join(out, `${tag}-seats-3x-${label}.png`), clip });
    await zoom.context().close();

    const lobby = await open(size);
    await lobby.evaluate(() => window.__emberisle.getState().hostTable());
    await lobby.getByTestId("lobby-card").waitFor();
    for (let n = 2; n <= 4; n++) {
      await lobby.getByTestId("add-bot").first().click();
      await lobby.waitForFunction((n) => window.__emberisle.getState().seats.length === n, n);
    }
    await lobby.evaluate(async () => {
      const game = window.__emberisle;
      const { useTalk } = await import("/src/components/game/talk.tsx");
      const seats = game.getState().seats;
      const now = Date.now();
      const chat = seats.map((s, i) => ({ id: i + 1, seat: s.id, player: null, name: s.name, color: s.color, text: `hello from ${s.name}`, at: now + i }));
      chat.push({ id: 9, seat: seats[2].id, player: null, name: seats[2].name, color: seats[2].color, text: "🔊 Cheer", sound: "cheer", at: now + 10 });
      game.setState({ chat });
      useTalk.setState({ reactLog: [{ id: 1, seat: seats[2].id, name: seats[2].name, color: seats[2].color, emote: "🔥", at: now + 20 }] });
    });
    await lobby.getByTestId("react-line").waitFor();
    await lobby.mouse.move(0, 0);
    await lobby.waitForTimeout(500);
    await jpg(lobby, `${tag}-lobby`);
    await lobby.context().close();
    console.log(`${tag}: table, results, seats-3x, lobby`);
  }
} finally {
  await browser.close();
  await vite.close();
  host.kill();
  await once(host, "exit");
  rmSync(rooms, { recursive: true, force: true });
}
console.log(JSON.stringify({ label, errors }));
if (errors.length) process.exit(1);
