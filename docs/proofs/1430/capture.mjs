// Real-game pictures for #1430: the lobby on a real local host with a guest, a bot and one chat line. Not a CI proof.
// Run from the repo root: node docs/proofs/1430/capture.mjs <before|after> [out dir]. It writes <state>-<size>.png and
// <state>.json (the header, Table row and chat boxes) into docs/proofs/1430 unless an out dir is given.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const stage = process.argv[2];
if (stage !== "before" && stage !== "after") throw new Error("usage: capture.mjs <before|after> [out dir]");
const out = process.argv[3] ?? "docs/proofs/1430";
mkdirSync(out, { recursive: true });
const SIZES = [[430, 932], [390, 844], [375, 812], [820, 1180], [844, 390]];

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1430-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
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
const errors = [];

async function client(name, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.addInitScript((n) => {
    localStorage.setItem("emberisle-name", n);
    localStorage.setItem("emberisle-jelly", "lite");
    window.__copies = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { window.__copies.push(t); } } });
  }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
}

function measure() {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const card = document.querySelector(".lobby-cover");
  const chat = document.querySelector('[data-testid="lobby-chat"]');
  const cb = card.getBoundingClientRect();
  return {
    card: r(card),
    header: [...document.querySelectorAll(".lobby-header button")].map((el) => ({ name: el.getAttribute("aria-label") || el.textContent.trim(), ...r(el) })),
    views: [...document.querySelectorAll(".lobby-rules .lm button, .lobby-rules > button")].map((el) => ({ name: el.textContent.trim(), ...r(el) })),
    chat: r(chat),
    chatShare: chat ? +((chat.getBoundingClientRect().width * chat.getBoundingClientRect().height) / (cb.width * cb.height)).toFixed(4) : null,
    chatLog: r(document.querySelector('[data-testid="chat-log"]'))?.h ?? null,
    copies: window.__copies.slice(-1)[0] ?? null,
  };
}

const results = {};
try {
  for (const [width, height] of SIZES) {
    const tag = `${width}x${height}`;
    const page = await client("Jarrod", { width, height }, width < 1000);
    await page.evaluate(() => window.__emberisle.getState().hostTable());
    await page.getByTestId("lobby-card").waitFor();
    const code = await page.evaluate(() => window.__emberisle.getState().code);
    const guest = await client("Josh", { width: 390, height: 844 }, true);
    await guest.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
    await guest.getByTestId("lobby-card").waitFor();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.locator("#chat-input").fill("Ready when you are!");
    await guest.keyboard.press("Enter");
    await page.getByTestId("chat-log").getByText("Ready when you are!").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const shot = async (state) => {
      await page.mouse.move(0, 0);
      await page.waitForTimeout(250);
      (results[state] ??= {})[tag] = await page.evaluate(measure);
      await page.screenshot({ path: `${out}/${state}-${tag}.png` });
      const m = results[state][tag];
      console.log(`${state} ${tag}: chat ${m.chat ? `${m.chat.w}x${m.chat.h} at y ${m.chat.y}` : "-"}; log ${m.chatLog ?? "-"}; share ${m.chatShare ?? "-"}; header ${m.header.map((h) => `${h.name} ${h.w}x${h.h}`).join(", ")}`);
    };
    await shot(stage);
    if (stage === "after") {
      // The tap, held at its end state (reduced motion), then the Play games tab.
      await page.locator(".lobby-code").click();
      await page.locator(".lobby-code[data-copied]").waitFor();
      await shot("copied");
      await page.locator(".lobby-code:not([data-copied])").waitFor();
      await page.getByRole("tab", { name: "Play games" }).click();
      await page.locator(".ly").waitFor();
      await shot("games");
    }
    await guest.context().close();
    await page.context().close();
  }
  writeFileSync(`${out}/${stage}.json`, JSON.stringify({ chromium: browser.version(), browserErrors: errors, results }, null, 2) + "\n");
  console.log(`chromium ${browser.version()}; browser errors ${errors.length}`);
  if (errors.length) console.log(errors.join("\n"));
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
