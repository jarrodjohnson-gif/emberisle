// Two actual tabs use the host vote, observe its shared deadline, and retain it after an action/reload.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-vote-ui-"));
const code = "XVAA";
let game = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 11 });
while (game.phase !== "roll") {
  const next = applyAction(game, game.current, chooseBotAction(game, game.current));
  assert.ifError(next.error);
  game = next.state;
}
game.current = "p0";
game.phase = "main";
game.turn = 7;
game.players.sort((a, b) => a.id.localeCompare(b.id));
game.players[0].resources = { timber: 8, grain: 0, ore: 0, clay: 0, wool: 0 };
const seats = game.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, pid: p.id, secret: `ui-${p.id}` }));
writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, shape: 2, savedAt: Date.now() }));
const secondCode = "XVAB";
writeFileSync(path.join(dir, `${secondCode}.json`), JSON.stringify({ code: secondCode, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, shape: 2, savedAt: Date.now() }));
let host, vite, browser;
const errors = [];
let hostErrors = "";
const until = async (check, label, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await check(); if (value) return value; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error(`timed out: ${label}; ${hostErrors}`);
};
const view = (page) => page.evaluate(() => {
  const s = window.__emberisle.getState();
  return { deadline: s.turnTimer?.deadline, extension: s.net?.getTurnExtension(), current: s.state?.current, seq: s.state?.seq };
});
try {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: new URL("../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: dir, TURN_MS: "25000", GRACE_MS: "120000", HOLD_MS: "180000", ACT_CAP: "1000", ACT_RATE: "1000" } });
  host.stderr.on("data", (d) => { hostErrors += d; });
  const port = await new Promise((resolve, reject) => {
    host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
    host.on("exit", (c) => reject(new Error(`host exited ${c}: ${hostErrors}`)));
  });
  vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const tabs = [];
  for (const [i, viewport] of [{ width: 1280, height: 720 }, { width: 390, height: 844 }].entries()) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    page.on("pageerror", (e) => errors.push(String(e)));
    if (i === 1) await (await page.context().newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, right: 0, bottom: 34, left: 0 } });
    await page.addInitScript(({ code, secret }) => {
      if (!localStorage.getItem("emberisle-seat")) {
        localStorage.setItem("emberisle-seat", JSON.stringify({ code, secret }));
        localStorage.setItem("emberisle-seat-live", code);
      }
      HTMLMediaElement.prototype.play = () => Promise.resolve();
    }, { code, secret: `ui-p${i}` });
    await page.goto(url);
    await page.getByTestId("turn-extension-ask").waitFor({ timeout: 30000 });
    tabs.push(page);
  }
  const [a, b] = tabs;
  const initial = await view(a);
  assert.equal(initial.extension.target, "p0");
  await a.getByTestId("turn-extension-ask").click();
  await Promise.all(tabs.map((p) => p.getByTestId("turn-extension-vote").waitFor()));
  assert.equal(await a.getByRole("button", { name: "Yes, more time" }).count(), 0, "target cannot vote");
  const pending = await view(b);
  assert.deepEqual(pending.extension.vote.voters, ["p1"], "away seat excluded");
  for (const [i, page] of tabs.entries()) {
    await page.waitForFunction(() => window.__isle?.lastState && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: 30000 });
    const fit = await page.evaluate(() => {
      const isle = window.__isle;
      const hole = isle.insets();
      const live = isle.liveInsets();
      const overflow = ["top", "right", "bottom", "left"].filter((k) => live[k] > hole[k] + 0.5);
      const corners = window.__emberisle.getState().state.vertices.filter((v) => {
        const p = isle.screenOf(v.id);
        return Math.min(p.x - hole.left, innerWidth - hole.right - p.x, p.y - hole.top, innerHeight - hole.bottom - p.y) < -0.5;
      }).map((v) => v.id);
      return { overflow, corners, hole, live };
    });
    console.log(`fit ${i}: ${JSON.stringify(fit)}`);
    assert.deepEqual({ overflow: fit.overflow, corners: fit.corners }, { overflow: [], corners: [] }, "vote keeps the declared board hole and island fit");
    const geometry = await page.getByTestId("turn-extension-vote").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const buttons = [...el.querySelectorAll("button")].map((b) => {
        const box = b.getBoundingClientRect();
        return { height: box.height, width: box.width, hit: b.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
      });
      const canvas = document.querySelector("canvas")?.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, buttons, canvas: canvas && { width: canvas.width, height: canvas.height } };
    });
    assert(geometry.x >= 0 && geometry.y >= (i === 1 ? 47 : 0) && geometry.right <= geometry.width && geometry.bottom <= geometry.height - (i === 1 ? 34 : 0), JSON.stringify(geometry));
    assert(geometry.canvas?.width > 200 && geometry.canvas?.height > 200, "board remains visible");
    for (const button of geometry.buttons) assert(button.height >= 44 && button.width >= 44 && button.hit, JSON.stringify(geometry));
  }
  mkdirSync("test-results", { recursive: true });
  await b.screenshot({ path: "test-results/turn-extension-phone.png" });
  await a.screenshot({ path: "test-results/turn-extension-desktop.png" });
  // The desktop voter has two 44px controls, unlike the timed player's desktop row.
  await (await b.context().newCDPSession(b)).send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 0, bottom: 0, left: 0 } });
  await b.setViewportSize({ width: 1280, height: 720 });
  await b.waitForFunction(() => window.__isle?.lastState && !window.__isle.refitDue && !window.__isle.glide);
  const desktopVoter = await b.evaluate(() => {
    const hole = window.__isle.insets();
    const live = window.__isle.liveInsets();
    return { overflow: ["top", "right", "bottom", "left"].filter((k) => live[k] > hole[k] + 0.5), bottom: live.bottom, declared: hole.bottom };
  });
  assert.deepEqual(desktopVoter.overflow, [], `desktop voter fits: ${JSON.stringify(desktopVoter)}`);
  console.log(`desktop voter: ${JSON.stringify(desktopVoter)}`);
  await b.screenshot({ path: "test-results/turn-extension-desktop-voter.png" });
  await b.getByRole("button", { name: "Yes, more time" }).click();
  for (const page of tabs) {
    await page.getByTestId("turn-extension-result").filter({ hasText: "Ember gets 60 seconds more." }).waitFor();
    const state = await view(page);
    assert.equal(state.deadline, initial.deadline + 60000, "exact shared extension");
    assert.equal(await page.getByTestId("turn-countdown").count(), 0, "extended clock leaves urgent countdown range");
    assert.equal(await page.getByTestId("turn-extension-ask").count(), 0, "one request per turn");
  }
  await a.evaluate(() => window.__emberisle.getState().net.act({ type: "bankTrade", give: "timber", want: "grain" }));
  await until(async () => (await view(a)).seq > initial.seq, "accepted bank trade");
  const rearmed = await view(a);
  assert(rearmed.deadline >= initial.deadline + 60000, "accepted action retains bonus");
  await b.reload();
  await b.getByTestId("turn-extension-result").waitFor();
  assert.equal((await view(b)).deadline, rearmed.deadline, "reload retains host deadline");
  await a.evaluate(() => window.__emberisle.getState().net.act({ type: "endTurn" }));
  await until(async () => (await view(b)).current === "p1", "next turn");
  await b.getByTestId("turn-extension-ask").waitFor();
  await a.getByTestId("turn-extension-ask").click();
  await b.getByTestId("turn-extension-result").filter({ hasText: "Tide gets 60 seconds more." }).waitFor();
  assert.equal((await view(b)).extension.result.outcome, "passed", "requester auto yes");
  // A cancelled vote must not leave a result that hides the next turn's request button.
  for (const [i, page] of tabs.entries()) {
    await page.evaluate(({ code, secret }) => {
      localStorage.setItem("emberisle-seat", JSON.stringify({ code, secret }));
      localStorage.setItem("emberisle-seat-live", code);
    }, { code: secondCode, secret: `ui-p${i}` });
    await page.reload();
    await page.getByTestId("turn-extension-ask").waitFor();
  }
  await a.getByTestId("turn-extension-ask").click();
  await b.getByTestId("turn-extension-vote").waitFor();
  const cancelledId = (await view(b)).extension.vote.id;
  await a.evaluate(() => window.__emberisle.getState().net.act({ type: "endTurn" }));
  await until(async () => (await view(b)).current === "p1", "cancelled vote next turn");
  for (const page of tabs) {
    await page.getByTestId("turn-extension-ask").waitFor();
    assert.equal((await view(page)).extension.vote, null);
    assert.equal((await view(page)).extension.result, null);
  }
  await b.getByTestId("turn-extension-ask").click();
  await a.getByTestId("turn-extension-vote").waitFor();
  assert.notEqual((await view(a)).extension.vote.id, cancelledId);
  await a.getByRole("button", { name: "No", exact: true }).click();
  await b.getByTestId("turn-extension-result").filter({ hasText: "More time vote did not pass." }).waitFor();
  assert.equal(await b.getByTestId("turn-extension-ask").count(), 0, "failed vote consumes request");
  assert.deepEqual(errors, []);
  console.log("PASS turn-extension-prove: two tabs, 1280x720 and 390x844; connected electorate, target excluded, 44px unobscured vote controls, phone safe area and board fit, desktop voter fit; exact +60000ms, action/reload retention, once per turn, next-turn requester auto-yes, cancelled-vote recovery and No result; zero page errors");
} finally {
  await browser?.close();
  await vite?.close();
  host?.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
}
