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
  async function pageAt(width, height) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:18602/?host=ws://127.0.0.1:${hostPort}`);
    await page.getByRole("button", { name: "Play against bots", exact: true }).waitFor();
    return { context, page };
  }
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
    await page.getByLabel("Your name", { exact: true }).fill("");
    await card.getByRole("button", { name: "Your color", exact: true }).click();
    assert.equal(await page.getByRole("radio").count(), 4, "four colour choices");
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
