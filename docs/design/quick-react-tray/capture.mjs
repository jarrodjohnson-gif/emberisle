// #1370: pictures and measurements for docs/design/quick-react-tray.md, taken from the real game on `main`.
// A real host and three seated tabs: Ada at 1280x720, Bo at 390x844 and Cy at 844x390 (touch phones).
// Run from the repo root: node docs/design/quick-react-tray/capture.mjs > /tmp/measurements.txt
// It writes nine JPEGs to a new temp folder and prints the measurements that measurements.txt keeps.
// Add --save to write the JPEGs next to this file instead, replacing the committed pictures.
// Send the printed output outside the repo, then copy it in: a file growing inside Vite's root reloads the pages mid-run.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const OUT = process.argv.includes("--save") ? path.dirname(fileURLToPath(import.meta.url)) : mkdtempSync(path.join(tmpdir(), "quick-react-tray-"));
console.error(`pictures: ${OUT}`);
const PORT = Number(process.env.VITE_PORT) || 8197;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results` },
});
process.on("exit", () => host.kill());
const hostPort = await new Promise((resolve) => host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); }));
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const url = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;
const errors = [];
const say = (line) => console.log(line);

async function seat(name, width, height) {
  const phone = width !== 1280;
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  await page.addInitScript((n) => { localStorage.setItem("emberisle-name", n); localStorage.setItem("emberisle-chat-tab", "chat"); }, name);
  // As in chat-prove: three software-rendered scenes starve the machine, so the island draws only while a picture is taken.
  await page.addInitScript(() => {
    window.__draw = false;
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const orig = WebGL2RenderingContext.prototype[fn];
      WebGL2RenderingContext.prototype[fn] = function (...args) {
        if (window.__draw) return orig.apply(this, args);
      };
    }
  });
  await page.goto(url);
  return { name, size: `${width}x${height}`, page };
}

const ada = await seat("Ada", 1280, 720);
const bo = await seat("Bo", 390, 844);
const cy = await seat("Cy", 844, 390);
const all = [ada, bo, cy];
const panel = (t) => t.page.locator('section[aria-label="Table chat"], [data-testid="lobby-chat"]').first();
async function shot(t, file) {
  // The island can remount (the phone lobby does), so read it fresh each time and wait for two drawn frames.
  await t.page.evaluate(() => { window.__draw = true; window.__shotFrom = window.__isle?.renders ?? 0; window.__shotIsle = window.__isle; });
  await t.page.waitForFunction(() => window.__isle && (window.__isle !== window.__shotIsle ? window.__isle.renders >= 2 : window.__isle.renders >= window.__shotFrom + 2), null, { timeout: 60_000 });
  await t.page.screenshot({ path: path.join(OUT, `${file}-${t.size}.jpg`), type: "jpeg", quality: 72 });
  await t.page.evaluate(() => (window.__draw = false));
}
const settle = (t) => t.page.waitForTimeout(400);

// The panel's geometry and every control's size, as the player sees it now.
async function measure(t, where) {
  const m = await panel(t).evaluate((root) => {
    const r = root.getBoundingClientRect();
    const buttons = [...root.querySelectorAll("button, input, [role=tab]")].filter((el) => el.getClientRects().length);
    const small = buttons.map((el) => { const b = el.getBoundingClientRect(); return { name: el.getAttribute("aria-label") || el.textContent.trim() || el.tagName, w: Math.round(b.width), h: Math.round(b.height) }; }).filter((b) => b.w < 44 || b.h < 44);
    const scroller = root.querySelector('[data-testid="sounds-tab"]');
    return {
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      sideways: document.documentElement.scrollWidth > innerWidth,
      controls: buttons.length,
      small,
      emoji: root.querySelectorAll('[data-testid="emoji-row"] button').length,
      chips: root.querySelectorAll('[data-testid="soundboard"] button').length,
      stickers: root.querySelectorAll('[data-testid="stickers"] button').length,
      tabScroll: scroller ? `${scroller.clientHeight} of ${scroller.scrollHeight} px shown` : "-",
    };
  });
  say(`${t.size} ${where}: panel at x,y,w,h ${m.box.join(",")}; inside viewport ${m.inside}; sideways scroll ${m.sideways}; ${m.controls} controls; emoji ${m.emoji}, sound chips ${m.chips}, stickers ${m.stickers}; tab scroll ${m.tabScroll}; under 44 px: ${m.small.length ? m.small.map((s) => `${s.name} ${s.w}x${s.h}`).join("; ") : "none"}`);
}
const openTab = async (t, name) => { await t.page.getByRole("tab", { name, exact: true }).click(); await settle(t); };

// Lobby: three seats, everyone ready, Sounds & stickers open.
await ada.page.getByRole("button", { name: "Host a table" }).click();
const code = (await ada.page.getByTestId("table-code").textContent()).trim();
for (const t of [bo, cy]) {
  await t.page.getByPlaceholder(/code/i).fill(code);
  await t.page.getByRole("button", { name: "Join" }).click();
  await t.page.getByTestId("table-code").waitFor();
}
for (const t of all) await t.page.getByRole("button", { name: "Ready", exact: true }).click();
await ada.page.getByRole("button", { name: "Start", exact: true }).waitFor();
for (const t of all) {
  await openTab(t, "Sounds & stickers");
  await measure(t, "lobby, Sounds & stickers");
  await shot(t, "lobby-sounds");
  await openTab(t, "Chat");
}

// Game: chat open on the Chat tab, with a reaction and a sound bubbling at a seat, then the Sounds & stickers tab.
await ada.page.getByRole("button", { name: "Start", exact: true }).click();
for (const t of all) await t.page.getByRole("button", { name: /^Open chat/ }).waitFor({ timeout: 30_000 });
for (const t of all) {
  await t.page.getByRole("button", { name: /^Open chat/ }).click();
  await settle(t);
}
await bo.page.getByTestId("emoji-row").getByRole("button", { name: "React clap", exact: true }).click();
await cy.page.getByTestId("emoji-row").getByRole("button", { name: "React fire", exact: true }).click();
await ada.page.waitForTimeout(300);
for (const t of all) {
  await measure(t, "game, Chat tab");
  await shot(t, "game-chat");
}
for (const t of all) {
  await openTab(t, "Sounds & stickers");
  await measure(t, "game, Sounds & stickers");
  await shot(t, "game-sounds");
}

// 320 px wide: the narrowest phone #736 names.
await bo.page.setViewportSize({ width: 320, height: 640 });
await settle(bo);
bo.size = "320x640";
await measure(bo, "game, Sounds & stickers");
await openTab(bo, "Chat");
await measure(bo, "game, Chat tab");
await bo.page.setViewportSize({ width: 390, height: 844 });
bo.size = "390x844";

// Send deadlines today: the 1 s emoji/sticker wait and the 3 s sound wait outlive closing and reopening the panel.
const p = ada.page;
await openTab(ada, "Chat");
await p.getByTestId("emoji-row").getByRole("button", { name: "React happy", exact: true }).click();
await p.getByRole("button", { name: "Minimize chat" }).click();
await p.getByRole("button", { name: /^Open chat/ }).click();
const emojiWait = await p.getByTestId("emoji-row").getByRole("button", { name: "React angry", exact: true }).isDisabled();
await p.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
const stickerWait = await p.getByTestId("stickers").locator("button").first().isDisabled();
await p.waitForTimeout(1100);
await p.getByTestId("soundboard").getByRole("button", { name: "Play sound Bong", exact: true }).click();
await p.getByRole("button", { name: "Minimize chat" }).click();
await p.getByRole("button", { name: /^Open chat/ }).click();
const soundWait = await p.getByTestId("soundboard").locator("button").first().isDisabled();
const emojiFree = await p.getByTestId("stickers").locator("button").first().isEnabled();
say(`deadlines: after an emoji, close and reopen: emoji waiting ${emojiWait}, sticker waiting ${stickerWait}; after a sound, close and reopen: sounds waiting ${soundWait}, stickers free ${emojiFree}`);

// Focus rules today, at 1280x720 with Path armed.
await p.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
await p.getByTestId("stickers").locator("button").first().focus();
await p.keyboard.press("Escape");
const afterChipEscape = await p.evaluate(() => ({ open: window.__emberisle.getState().chatOpen, build: window.__emberisle.getState().buildMode }));
say(`focus: Escape on a sticker button with Path armed: chat open ${afterChipEscape.open}, build ${afterChipEscape.build}`);
const tabs = await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].map((el) => `${el.textContent.trim()} tabindex=${el.tabIndex}`).join(", "));
await p.getByRole("tab", { name: "Chat", exact: true }).click();
await p.getByRole("tab", { name: "Chat", exact: true }).focus();
await p.keyboard.press("ArrowRight");
const arrow = await p.evaluate(() => document.querySelector('[role=tab][aria-selected=true]').textContent.trim());
say(`focus: tabs ${tabs}; ArrowRight on Chat leaves "${arrow}" selected`);
await p.getByRole("button", { name: "Minimize chat" }).focus();
await p.keyboard.press("Enter");
const after = await p.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName);
say(`focus: after Minimize chat by keyboard, focus is on ${after}`);

say(`console errors: ${errors.length}${errors.length ? `\n${errors.join("\n")}` : ""}`);
await browser.close();
await vite.close();
process.exit(errors.length ? 1 : 0);
