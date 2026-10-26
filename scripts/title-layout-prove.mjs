import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = process.env.TITLE_PROOF_OUTPUT || "test-results/title-1102";
mkdirSync(output, { recursive: true });
const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-title-1102-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, NODE_NO_WARNINGS: "1", PORT: "0", ROOMS_DIR: rooms, PROFILES_DIR: path.join(rooms, "profiles") },
});
let hostErrors = "";
host.stderr.on("data", d => hostErrors += d);
const hostPort = await new Promise((resolve, reject) => {
  host.stdout.on("data", d => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  host.once("error", reject);
  host.once("exit", c => reject(Error(`host ${c}: ${hostErrors}`)));
});
const vite = await createServer({ server: { host: "127.0.0.1", port: 18602, strictPort: true }, logLevel: "error" });
let browser;
const errors = [];
try {
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  async function pageAt(width, height, threeTables = false) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(String(e)));
    if (threeTables) await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:/, route => {
      const server = route.connectToServer();
      server.onMessage(raw => {
        const message = JSON.parse(String(raw));
        if (message.type === "openTables" && message.tables.length) {
          const table = message.tables[0];
          message.tables = [table, ...["K7QP", "ABCD", "EFGH"].filter(code => code !== table.code).slice(0, 2).map(code => ({ ...table, code }))];
        }
        route.send(JSON.stringify(message));
      });
    });
    await page.goto(`http://127.0.0.1:18602/?host=ws://127.0.0.1:${hostPort}`);
    await page.getByRole("button", { name: "Play against bots", exact: true }).waitFor();
    return { context, page };
  }
  async function sheetTargets(sheet) {
    const boxes = await sheet.locator("button, input, select").evaluateAll(nodes => nodes.filter(n => n.checkVisibility()).map(n => n.getBoundingClientRect().toJSON()));
    for (const r of boxes) assert.ok(r.width >= 43.9 && r.height >= 43.9, "sheet controls >=44px");
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(Math.max(a.left - b.right, b.left - a.right, 0) >= 7.9 || Math.max(a.top - b.bottom, b.top - a.bottom, 0) >= 7.9, "sheet control gaps >=8px");
    }
  }
  const listedHosts = [];
  for (let i = 0; i < 1; i++) {
    const host = await pageAt(390, 844);
    await host.page.getByTestId("open-mode-toggle").click();
    await host.page.getByRole("button", { name: "Host a table", exact: true }).click();
    await host.page.getByTestId("lobby-card").waitFor().catch(async e => { console.log("listed host", i, await host.page.evaluate(() => { const s = window.__emberisle.getState(); return { error: s.error, screen: s.screen, code: s.code }; })); throw e; });
    listedHosts.push(host);
  }
  for (const [width, height] of [[844, 390], [1280, 720]]) {
    const listed = await pageAt(width, height, true);
    const card = listed.page.getByTestId("title-card");
    await card.getByTestId("open-tables").locator("li").nth(2).waitFor();
    await listed.page.evaluate(() => window.__emberisle.setState({ error: "That table is unavailable. Try another table." }));
    await card.getByRole("alert").waitFor();
    const top = await card.locator("h1").boundingBox();
    console.log(`listed ${width}x${height}: wordmark top ${top?.y}`);
    assert.ok(top && top.y >= 0, "listed tables plus error keep wordmark visible");
    const play = card.getByRole("button", { name: "Play against bots", exact: true });
    const r = await play.boundingBox();
    assert.ok(r && r.y >= 0 && r.y + r.height <= height, "listed tables plus error keep Play visible");
    assert.equal(await play.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true, "listed tables do not cover Play");
    const last = card.getByTestId("open-tables").locator("li").nth(2).getByRole("button").first();
    await last.scrollIntoViewIfNeeded();
    const b = await last.boundingBox();
    assert.ok(b && b.y >= 0 && b.y + b.height <= height, "last listed table remains reachable by scrolling");
    await listed.page.screenshot({ path: `${output}/${width}x${height}-listed.png` });
    await listed.context.close();
  }
  for (const host of listedHosts) { await host.page.evaluate(() => window.__emberisle.getState().goTitle()); await host.context.close(); }
  for (const [width, height] of [[390, 844], [844, 390], [1280, 720]]) {
    const { context, page } = await pageAt(width, height);
    const card = page.getByTestId("title-card");
    for (const name of ["Play against bots", "Host a table", "Join", "Watch", "Pass this device", "Wayfarer rules", "How to play", "Sound on"]) {
      assert.equal(await card.getByRole("button", { name, exact: true }).isVisible(), true, `${width}: ${name} visible`);
    }
    const geometry = await card.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const controls = [...el.querySelectorAll("button, input, summary, select")].filter(n => n.checkVisibility());
      const boxes = controls.map(n => ({ name: n.getAttribute("aria-label") || n.textContent.trim() || n.tagName, r: n.getBoundingClientRect().toJSON() }));
      const gaps = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        const dx = Math.max(a.left - b.right, b.left - a.right, 0);
        const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
        if (dx < 7.9 && dy < 7.9) gaps.push([boxes[i].name, boxes[j].name, dx, dy]);
      }
      return { rect: rect.toJSON(), scroll: el.scrollHeight - el.clientHeight, boxes, gaps, background: getComputedStyle(el).backgroundColor };
    });
    assert.ok(geometry.scroll <= 1, `${width}: no card scrolling: ${geometry.scroll}`);
    assert.ok(geometry.rect.top >= 0 && geometry.rect.bottom <= height && geometry.rect.left >= 0 && geometry.rect.right <= width, `${width}: card fits viewport`);
    for (const { name, r } of geometry.boxes) {
      assert.ok(r.width >= 43.9 && r.height >= 43.9, `${width}: ${name} >=44px: ${r.width}x${r.height}`);
      assert.ok(r.top >= geometry.rect.top && r.bottom <= geometry.rect.bottom && r.left >= geometry.rect.left && r.right <= geometry.rect.right, `${width}: ${name} inside card`);
    }
    assert.deepEqual(geometry.gaps, [], `${width}: 8px control gaps`);
    assert.equal(geometry.background, "rgb(244, 247, 246)", "approved neutral card");
    for (const locator of [card.locator("h1"), card.getByLabel("Your name", { exact: true }), card.getByRole("button", { name: "Your color", exact: true }), card.getByTestId("open-mode-toggle")]) {
      await locator.waitFor({ state: "visible" });
      const r = await locator.boundingBox();
      assert.ok(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height, `${width}: identity and lock visible inside viewport`);
    }
    if (height > width || width === 1280) {
      assert.equal(await card.getByText("Play online", { exact: true }).isVisible(), true, "online heading visible");
      for (const text of ["Just you and three bots. No network needed.", "Four people, one screen."]) assert.equal(await card.getByText(text, { exact: true }).isVisible(), true, "helper visible");
    }
    if (width === 1280) assert.ok(Math.abs(geometry.rect.left - 40) < 1 && Math.abs(geometry.rect.bottom - (height - 40)) < 1 && Math.abs(geometry.rect.width - 384) < 1, "desktop lower-left approved footprint");
    if (width === 844) assert.ok(geometry.rect.right <= width - 200 && geometry.rect.left >= 11, "landscape retains visible island beside card");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${output}/${width}x${height}.png` });
    const rulesButton = card.getByRole("button", { name: "Wayfarer rules", exact: true });
    await rulesButton.click();
    const sheet = page.getByRole("dialog", { name: "Wayfarer rules", exact: true });
    for (const [key, label] of [["ai", "Play against bots"], ["online", "Host a table online"], ["hotseat", "Pass this device"]]) {
      const select = sheet.getByRole("combobox", { name: label, exact: true });
      assert.equal(await select.inputValue(), "on", `${key}: default On`);
      await select.selectOption("off");
      assert.equal(await page.evaluate(key => window.__emberisle.getState().wayfarerChoices[key], key), "off", `${key}: existing store setting changes`);
    }
    await sheetTargets(sheet);
    assert.equal(await sheet.getByRole("button", { name: "Play against bots", exact: true }).count(), 0, "play choices stay outside rules");
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });
    assert.equal(await rulesButton.evaluate(el => document.activeElement === el), true, "Escape restores focus");
    await card.getByRole("button", { name: "Sound on", exact: true }).click();
    assert.equal(await card.getByRole("button", { name: "Sound off", exact: true }).getAttribute("aria-pressed"), "false");
    await card.getByRole("button", { name: "Sound off", exact: true }).click();
    await card.getByRole("button", { name: "How to play", exact: true }).click();
    await page.getByRole("dialog", { name: "How to play", exact: true }).waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByLabel("Your name", { exact: true }).fill("12345678901234567890");
    assert.equal(await page.getByLabel("Your name", { exact: true }).inputValue(), "1234567890123456", "16 character name");
    await page.getByLabel("Your name", { exact: true }).fill("😀".repeat(20));
    assert.equal(await page.getByLabel("Your name", { exact: true }).inputValue(), "😀".repeat(16), "16 Unicode code-point name");
    await page.getByLabel("Your name", { exact: true }).fill("");
    await card.getByRole("button", { name: "Your color", exact: true }).click();
    assert.equal(await page.getByRole("radio").count(), 4, "four colour choices");
    await sheetTargets(page.getByRole("dialog", { name: "Your color", exact: true }));
    await page.getByRole("radio").nth(1).click();
    await card.getByRole("button", { name: "Play against bots", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "play");
    const ai = await page.evaluate(() => { const s = window.__emberisle.getState(); return { name: s.name, mode: s.state.wayfarerMode, players: s.state.players.length, bots: s.state.players.filter(p => p.kind === "bot").length }; });
    assert.deepEqual(ai, { name: "Ember", mode: "off", players: 4, bots: 3 }, "real practice starts with chosen rule and blank-name fallback");
    await context.close();
    const hot = await pageAt(width, height);
    await hot.page.getByRole("button", { name: "Pass this device", exact: true }).click();
    await hot.page.waitForFunction(() => window.__emberisle.getState().screen === "play");
    assert.equal(await hot.page.evaluate(() => window.__emberisle.getState().mode === "hotseat"), true, "real hotseat starts");
    await hot.context.close();
    console.log(`ok ${width}x${height}: all choices visible, 44px targets, 8px gaps, neutral card, no scroll; rules, focus, sound, help, name, colours, bots and pass-device`);
  }
  const creator = await pageAt(390, 844);
  await creator.page.getByRole("button", { name: "Host a table", exact: true }).click();
  await creator.page.getByTestId("lobby-card").waitFor();
  const code = await creator.page.evaluate(() => window.__emberisle.getState().code);
  assert.equal(code.length, 4, "real hosting allocates table");
  const guest = await pageAt(390, 844);
  await guest.page.getByRole("textbox", { name: "Join code", exact: true }).fill(code);
  await guest.page.waitForFunction(() => window.__emberisle.getState().seats.length === 1);
  await guest.page.getByRole("button", { name: "Your color", exact: true }).click();
  assert.equal(await guest.page.getByRole("radio", { disabled: true }).count(), 1, "taken-colour peek disables occupied colour");
  await guest.page.keyboard.press("Escape");
  await guest.page.getByRole("button", { name: "Join", exact: true }).click();
  await guest.page.getByTestId("lobby-card").waitFor();
  assert.equal(await guest.page.evaluate(() => window.__emberisle.getState().seats.length), 2, "real join seats the guest");
  await creator.page.getByTestId("add-bot").first().click();
  await creator.page.getByRole("button", { name: "Ready", exact: true }).click();
  await guest.page.getByRole("button", { name: "Ready", exact: true }).click();
  await creator.page.getByRole("button", { name: "Start", exact: true }).click();
  await creator.page.waitForFunction(() => window.__emberisle.getState().screen === "play");
  const watcher = await pageAt(390, 844);
  await watcher.page.getByRole("textbox", { name: "Join code", exact: true }).fill(code);
  await watcher.page.getByRole("button", { name: "Watch", exact: true }).click();
  await watcher.page.waitForFunction(() => window.__emberisle.getState().spectator === true);
  console.log("ok real host/join/watch and taken-colour peek; existing network paths retained");
  await creator.context.close(); await guest.context.close(); await watcher.context.close();
  assert.equal(hostErrors, "", "no host errors");
  assert.deepEqual(errors, [], "no page errors");
  console.log("title-layout-prove: ok");
} finally {
  await browser?.close();
  await vite.close();
  host.kill();
}
