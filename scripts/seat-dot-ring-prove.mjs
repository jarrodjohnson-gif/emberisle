// #1417: the same thin dark ring on every seat dot (docs/design/seat-dot-ring, owner option A for #1297). At 390x844 (the
// seat strip, the phone results list) and 1280x720 (the rail, the results table):
// - every seat dot in the seat rail or strip, the results (the winner and each row) and the chat list (a chat line, a
//   soundboard line and a reaction line) carries `inset 0 0 0 1.5px` in --control-line, is aria-hidden, and has a name
//   beside it;
// - Dune's dot (#f3ecd9) sits on a white seat card and carries the ring (fails without the SeatDot change);
// - removing the ring moves and resizes no dot, and the chat dots stay 8x8 and the lobby dots 12x12;
// - the lobby's empty seats (a transparent dot) get no ring, so they never draw a hollow circle.
// The table and the results are crafted through window.__emberisle.setState; the lobby is a real host with bots, and the
// chat lines are put in the stores. Zero console errors. Saves test-results/seat-dot-ring-<size>-<screen>.png.
// Run: npm run seat-dot-ring-prove
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8497;
const RING = "rgb(120, 131, 122) 0px 0px 0px 1.5px inset";
const DUNE = "rgb(243, 236, 217)";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true, seat: "seat" },
  { tag: "1280x720", width: 1280, height: 720, seat: "rail" },
];

mkdirSync("test-results", { recursive: true });
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results` },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const url = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;
const errors = [];
let code = 0;

// Every dot under `root`: its box, fill, ring, first painted surface behind it, aria-hidden, and the name beside it.
const dots = (page, root, sel) =>
  page.evaluate(
    ([root, sel]) =>
      [...document.querySelectorAll(root)].flatMap((r) => [...r.querySelectorAll(sel)]).filter((d) => d.getClientRects().length && getComputedStyle(d).visibility !== "hidden").map((d) => {
        const b = d.getBoundingClientRect();
        const cs = getComputedStyle(d);
        let el = d.parentElement;
        let surface = "";
        while (el && !surface) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg !== "transparent" && !bg.endsWith(", 0)")) surface = bg;
          el = el.parentElement;
        }
        const name = (d.closest("button")?.getAttribute("aria-label") || d.parentElement.textContent).replace(/\s+/g, " ").trim();
        return { box: [b.x, b.y, b.width, b.height].map((v) => +v.toFixed(2)), fill: cs.backgroundColor, ring: cs.boxShadow, surface, hidden: d.getAttribute("aria-hidden"), name };
      }),
    [root, sel],
  );

// The ring is inset: with every box-shadow forced off, every dot keeps its exact box.
async function ringMovesNothing(page, root, sel, label) {
  const withRing = await dots(page, root, sel);
  const off = await page.addStyleTag({ content: "* { box-shadow: none !important; }" });
  const without = await dots(page, root, sel);
  await off.evaluate((s) => s.remove());
  assert.equal(without.length, withRing.length, `${label}: the same dots with and without the ring`);
  without.forEach((d, i) => assert.deepEqual(withRing[i].box, d.box, `${label}: dot ${i} (${d.name}) keeps its box with the ring`));
  return withRing;
}

function ringed(list, label, min) {
  assert.ok(list.length >= min, `${label}: at least ${min} seat dots (got ${list.length})`);
  for (const d of list) {
    assert.equal(d.ring, RING, `${label}: ${d.name || d.fill} dot carries the ring`);
    assert.equal(d.hidden, "true", `${label}: ${d.name} dot is aria-hidden`);
    assert.ok(d.name, `${label}: a ${d.fill} dot has a name beside it`);
  }
  console.log(`  ${label}: ${list.length} dots ringed (${[...new Set(list.map((d) => d.box[2]))].join("/")} px)`);
}

async function open(v, name) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  await page.goto(url);
  await page.waitForFunction(() => window.__emberisle);
  return page;
}

try {
  for (const v of VIEWS) {
    console.log(v.tag);
    // A crafted four-seat table: Mira in Dune (seat 3), Jarrod on turn, so Dune's dot has no on-turn outline.
    const page = await open(v, "Jarrod");
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.waitForFunction(() => window.__emberisle.getState().state);
    await page.evaluate(async () => {
      const game = window.__emberisle;
      const { createGame } = await import("/src/lib/game/board.ts");
      const st = createGame({ seed: 20261107, humans: [{ name: "Jarrod" }, { name: "Josh" }, { name: "Mira" }, { name: "Finn" }], bots: 0 });
      st.phase = "main";
      st.current = st.players[0].id;
      st.dice = [3, 5];
      st.seq++;
      game.setState({ state: st, localId: st.current, mode: "hotseat", buildMode: "none", banner: null, error: null, synced: game.getState().synced + 1 });
    });
    const ids = await page.evaluate(() => window.__emberisle.getState().state.players.map((p) => p.id));
    await page.getByTestId(`${v.seat}-${ids[3]}`).waitFor();
    await page.waitForTimeout(400);

    const seatRoot = `[data-testid^="${v.seat}-p"]`;
    const seats = await ringMovesNothing(page, seatRoot, ".seat-dot", `${v.tag} seats`);
    ringed(seats, `${v.tag} seats`, 4);
    const dune = seats.find((d) => d.fill === DUNE);
    assert.ok(dune, `${v.tag}: Dune's seat dot is on the table`);
    assert.equal(dune.surface, "rgb(255, 255, 255)", `${v.tag}: Dune's dot sits on a white seat card`);
    assert.equal(dune.ring, RING, `${v.tag}: Dune's dot on the white seat card carries the ring`);
    await page.screenshot({ path: `test-results/seat-dot-ring-${v.tag}-table.png` });

    // Results: Mira (Dune) wins, so the winner's dot is the pale one; the headline dot and one per row.
    await page.evaluate(() => {
      const game = window.__emberisle;
      const st = structuredClone(game.getState().state);
      st.phase = "over";
      st.winner = st.players[2].id;
      st.seq++;
      game.setState({ state: st });
    });
    await page.getByTestId("win-screen").waitFor();
    await page.getByTestId("win-table-wrap").locator("span.rounded-full").nth(3).waitFor();
    const win = await ringMovesNothing(page, '[data-testid="win-screen"]', 'span.rounded-full[style*="background"]', `${v.tag} results`);
    ringed(win, `${v.tag} results`, 5);
    assert.equal(win.filter((d) => d.fill === DUNE).length, 2, `${v.tag}: Dune's dot in the headline and in its row`);
    await page.screenshot({ path: `test-results/seat-dot-ring-${v.tag}-results.png` });
    await page.context().close();

    // Lobby: a real host with one bot. The two empty seats pass a transparent dot and get no ring.
    const lobby = await open(v, "Jarrod");
    await lobby.evaluate(() => window.__emberisle.getState().hostTable());
    await lobby.getByTestId("lobby-card").waitFor();
    await lobby.getByTestId("add-bot").first().click();
    await lobby.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    const empty = await lobby.evaluate(() => [...document.querySelectorAll(".lobby-layout .dot")].filter((d) => d.style.background === "transparent").map((d) => getComputedStyle(d).boxShadow));
    assert.deepEqual(empty, ["none", "none"], `${v.tag}: the lobby's two empty seats draw no ring`);
    for (let n = 3; n <= 4; n++) {
      await lobby.getByTestId("add-bot").first().click();
      await lobby.waitForFunction((n) => window.__emberisle.getState().seats.length === n, n);
    }
    const lobbyDots = await ringMovesNothing(lobby, ".lobby-layout", ".dot", `${v.tag} lobby seats`);
    ringed(lobbyDots, `${v.tag} lobby seats`, 4);
    for (const d of lobbyDots) assert.deepEqual(d.box.slice(2), [12, 12], `${v.tag}: lobby dot ${d.name} stays 12x12`);

    // The chat list: a chat line from each seat colour, a soundboard line and a reaction line (Chat.tsx Line and ReactRow).
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
    await lobby.getByTestId("sound-line").waitFor();
    const chatDots = await ringMovesNothing(lobby, '[data-testid="chat-log"]', "li > span.rounded-full", `${v.tag} chat`);
    ringed(chatDots, `${v.tag} chat`, 6);
    for (const d of chatDots) assert.deepEqual(d.box.slice(2), [8, 8], `${v.tag}: chat dot ${d.name} stays 8x8`);
    assert.equal(chatDots.filter((d) => d.fill === DUNE).length, 3, `${v.tag}: Dune's chat, sound and reaction dots are all ringed`);
    await lobby.screenshot({ path: `test-results/seat-dot-ring-${v.tag}-lobby.png` });
    await lobby.context().close();
  }
  assert.deepEqual(errors, [], "console errors");
  console.log("seat-dot-ring-prove: ok");
} catch (e) {
  console.error(e);
  console.error(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  // The host saves its rooms as it stops, so the temp folder goes only once it has exited.
  host.kill();
  await once(host, "exit");
}
process.exit(code);
