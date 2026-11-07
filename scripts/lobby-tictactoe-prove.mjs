// #1263: tic-tac-toe in the Play games shelf, two real tabs on one host through the Vite dev server. Ember (1280x720) invites
// Tide (a 390x844 phone) by name; the invite is a badge on Tide's tab; Tide takes it and both boards open. Checks the board
// above the footer at both sizes, 44 px targets, 8 px gaps and text contrast, a win, Play again, Quit, a decline, Ready
// leaving the game open, and Start closing it. Pictures at 1280x720, 390x844 and 844x390: docs/proofs/1263/.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const out = process.env.LOBBY_PROOF_OUT || "docs/proofs/1263";
mkdirSync(out, { recursive: true });

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1263-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms, RESULTS_DIR: `${rooms}/results` },
});
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (code) => reject(new Error(`host exited ${code}`)));
});
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const problems = [];

async function client(viewport, touch, name, code) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  await page.evaluate((c) => (c ? window.__emberisle.getState().joinTable(c) : window.__emberisle.getState().hostTable()), code);
  await page.getByTestId("lobby-card").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const tile = (page) => page.getByTestId("ttt-tile");
const line = (page) => tile(page).locator("span > span");
const turn = (page) => page.getByTestId("ttt-turn");
const cell = (page, i) => page.getByTestId("ttt").getByRole("button", { name: new RegExp(`^Square ${i + 1}(,|$)`) });

function lum(rgb) {
  const [r, g, b] = rgb.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text in the Play games area and the tabs, at 4.5:1. The X and O marks are game marks in seat colours, not text styles
// (docs/design/mini-games-shelf, "Text sizes that are not on the lobby scale"), so they are left out.
async function contrast(page, label) {
  const rows = await page.evaluate(() => {
    const px = (css) => {
      const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      c.fillStyle = "#000";
      c.fillStyle = css;
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data];
    };
    const bgOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const got = px(getComputedStyle(n).backgroundColor);
        if (got[3] > 200) return got.slice(0, 3);
      }
      return [243, 246, 245];
    };
    const seen = [];
    for (const el of document.querySelectorAll(".ly *, .lm button, .lm button span, .lm button b")) {
      if (el.closest(".lx-grid") || el.matches(".lx-who i") || el.children.length) continue;
      const text = el.textContent.trim();
      const box = el.getBoundingClientRect();
      if (!text || box.width < 1 || box.height < 1) continue;
      seen.push({ text, fg: px(getComputedStyle(el).color).slice(0, 3), bg: bgOf(el) });
    }
    return seen;
  });
  assert.ok(rows.length > 0, `${label}: contrast found text`);
  for (const row of rows) assert.ok(ratio(row.fg, row.bg) >= 4.5, `${label}: "${row.text}" contrast ${ratio(row.fg, row.bg).toFixed(2)}`);
}

// The open board ends above the footer, inside the screen; every control is 44 px and 8 px from its neighbours.
async function geometry(page, label) {
  const data = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const card = document.querySelector('[data-testid="lobby-card"]');
    const controls = [...card.querySelectorAll("button, input, [role=tab]")].filter((el) => el.getBoundingClientRect().width > 0);
    return {
      board: rect(document.querySelector('[data-testid="ttt"]')),
      foot: rect(document.querySelector('[data-testid="lobby-actions"]')),
      card: rect(card),
      viewH: innerHeight,
      viewW: innerWidth,
      controls: controls.map((el) => ({ label: el.getAttribute("aria-label") || el.textContent.trim(), ...rect(el) })),
    };
  });
  assert.ok(data.board.bottom <= data.foot.y + 0.5, `${label}: board bottom ${data.board.bottom} above footer ${data.foot.y}`);
  assert.ok(data.board.y >= 0 && data.board.x >= 0 && data.board.right <= data.viewW + 0.5, `${label}: board inside the screen ${JSON.stringify(data.board)}`);
  for (const c of data.controls) assert.ok(c.width >= 44 && c.height >= 44, `${label}: ${c.label} target ${c.width}x${c.height}`);
  for (let i = 0; i < data.controls.length; i++) for (const b of data.controls.slice(i + 1)) {
    const a = data.controls[i];
    const gap = Math.max(b.x - a.right, a.x - b.right, b.y - a.bottom, a.y - b.bottom);
    assert.ok(gap >= 7.99, `${label}: ${a.label} / ${b.label} gap ${gap}`);
  }
  return data;
}

try {
  const ember = await client({ width: 1280, height: 720 }, false, "Ember");
  const code = await ember.evaluate(() => window.__emberisle.getState().code);
  const tide = await client({ width: 390, height: 844 }, true, "Tide", code);
  await ember.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
  await ember.getByTestId("add-bot").first().click();
  await ember.waitForFunction(() => window.__emberisle.getState().seats.length === 3);

  // The shelf: a table-mate is there, so the tile says so; the picker lists people only, never the bot.
  await ember.getByRole("button", { name: "Play games" }).click();
  await tile(ember).waitFor();
  assert.equal(await line(ember).textContent(), "With a table-mate");
  await tile(ember).getByRole("button", { name: "Play", exact: true }).click();
  assert.equal(await line(ember).textContent(), "Play with…");
  const picks = await tile(ember).locator(".lx-pick button").allTextContents();
  assert.deepEqual(picks, ["Tide"], "the picker names Tide and not the bot");
  await contrast(ember, "picker 1280");
  await ember.screenshot({ path: `${out}/1280x720-pick.png` });
  await tile(ember).getByRole("button", { name: "Tide", exact: true }).click();
  await ember.waitForFunction(() => window.__emberisle.getState().ttt?.game?.status === "invited");
  assert.equal(await line(ember).textContent(), "Waiting for Tide…");
  console.log("ok  1280x720: the tile names a table-mate, the picker lists Tide only, and the invite waits");

  // Tide's tab carries the badge; no popup opens. Tide takes the invite and both boards open.
  await tide.getByRole("button", { name: "Play games, 1 invite" }).waitFor();
  assert.equal(await tide.locator(".lb").textContent(), "1");
  assert.equal(await tide.getByTestId("ttt").count(), 0, "an invite never opens a board by itself");
  await contrast(tide, "badge 390");
  await tide.screenshot({ path: `${out}/390x844-badge.png` });
  await tide.getByRole("button", { name: "Play games, 1 invite" }).click();
  assert.equal(await line(tide).textContent(), "Ember wants to play");
  await contrast(tide, "invited 390");
  await tide.screenshot({ path: `${out}/390x844-invited.png` });
  await tile(tide).getByRole("button", { name: "Play", exact: true }).click();
  await tide.getByTestId("ttt").waitFor();
  await ember.getByTestId("ttt").waitFor();
  assert.equal(await tide.locator(".lb").count(), 0, "the badge goes once the invite is taken");
  assert.equal(await turn(ember).textContent(), "Your turn");
  assert.equal(await turn(tide).textContent(), "Ember's turn");
  assert.equal(await ember.getByRole("heading", { name: "While you wait" }).count(), 0, "the board takes the shelf's place");
  console.log("ok  390x844: the badge, no popup, Play opens both boards, Ember first");

  // A win: Ember takes the top row.
  for (const [page, other, i] of [[ember, tide, 0], [tide, ember, 3], [ember, tide, 1], [tide, ember, 4], [ember, tide, 2]]) {
    assert.equal(await cell(other, i).isDisabled(), true, "not the other seat's turn");
    await cell(page, i).click();
    for (const p of [page, other]) await p.waitForFunction((n) => window.__emberisle.getState().ttt?.game?.board[n] !== ".", i);
  }
  assert.equal(await turn(ember).textContent(), "You won");
  assert.equal(await turn(tide).textContent(), "Ember won");
  assert.equal(await ember.locator(".lx-win").count(), 3, "the winning line is marked");
  assert.equal(await cell(tide, 8).isDisabled(), true, "no move after the win");
  const desk = await geometry(ember, "1280x720");
  const phone = await geometry(tide, "390x844");
  assert.ok(phone.card.y < 16, "phone card grows upward while the board is open");
  await contrast(ember, "board 1280");
  await contrast(tide, "board 390");
  await ember.screenshot({ path: `${out}/1280x720-board.png` });
  await tide.screenshot({ path: `${out}/390x844-board.png` });
  console.log(`ok  a win: "You won" and "Ember won"; board ends ${(desk.foot.y - desk.board.bottom).toFixed(0)} px above the footer at 1280x720 and ${(phone.foot.y - phone.board.bottom).toFixed(0)} px at 390x844`);

  // The sideways phone: the wide card scrolls under the fixed Ready row (docs/design/mini-games-shelf, "The sideways phone").
  await tide.setViewportSize({ width: 844, height: 390 });
  await tide.getByTestId("ttt").locator(".lx-foot").scrollIntoViewIfNeeded();
  await tide.screenshot({ path: `${out}/844x390-board.png` });
  await tide.setViewportSize({ width: 390, height: 844 });
  console.log("ok  844x390: picture saved");

  // Play again: Tide goes first. Close keeps the game; Quit ends it for both.
  await tide.getByRole("button", { name: "Play again" }).click();
  for (const page of [ember, tide]) await page.waitForFunction(() => window.__emberisle.getState().ttt?.game?.status === "playing");
  assert.equal(await turn(tide).textContent(), "Your turn");
  await cell(tide, 4).click();
  await ember.waitForFunction(() => window.__emberisle.getState().ttt?.game?.board[4] === "o");
  await ember.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(await line(ember).textContent(), "You and Tide");
  await tile(ember).getByRole("button", { name: "Open" }).click();
  assert.equal(await cell(ember, 4).textContent(), "O", "Close kept the game");
  await tide.getByRole("button", { name: "Quit game" }).click();
  await ember.getByTestId("ttt").waitFor({ state: "detached" });
  assert.equal(await line(ember).textContent(), "Tide closed the game.");
  console.log("ok  Play again with Tide first, Close keeps the game, Quit closes it for both");

  // A decline.
  await tile(ember).getByRole("button", { name: "Play", exact: true }).click();
  await tile(ember).getByRole("button", { name: "Tide", exact: true }).click();
  await tile(tide).getByRole("button", { name: "No", exact: true }).click();
  await ember.waitForFunction(() => window.__emberisle.getState().ttt?.reason === "declined");
  assert.equal(await line(ember).textContent(), "Tide said no.");
  console.log("ok  decline: Ember's tile says Tide said no.");

  // Ready leaves the game open; Start closes it on both tabs.
  await tile(ember).getByRole("button", { name: "Play", exact: true }).click();
  await tile(ember).getByRole("button", { name: "Tide", exact: true }).click();
  await tile(tide).getByRole("button", { name: "Play", exact: true }).click();
  await ember.getByTestId("ttt").waitFor();
  await tide.getByRole("button", { name: "Ready", exact: true }).click();
  await ember.getByRole("button", { name: "Ready", exact: true }).click();
  await ember.waitForFunction(() => window.__emberisle.getState().seats.every((s) => s.ready));
  assert.equal(await tide.getByTestId("ttt").count(), 1, "Ready does not close the game");
  await ember.getByRole("button", { name: "Start", exact: true }).click();
  for (const page of [ember, tide]) {
    await page.waitForFunction(() => window.__emberisle.getState().screen === "play");
    await page.waitForFunction(() => window.__emberisle.getState().ttt?.reason === "start");
    assert.equal(await page.getByTestId("ttt").count(), 0, "Start closes the board");
  }
  console.log("ok  Ready keeps the game; Start closes it on both tabs");

  assert.deepEqual(problems, [], `browser errors:\n${problems.join("\n")}`);
  console.log("lobby-tictactoe-prove: ok");
} catch (error) {
  if (problems.length) console.error(problems.join("\n"));
  throw error;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
