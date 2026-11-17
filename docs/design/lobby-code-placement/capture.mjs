// Real-game pictures for #1430, the room-code placement mock. NOT a CI proof and NOT a src change.
// It drives the real lobby from a checkout of PR #1451's branch (the lobby "today"), then injects throwaway markup and CSS in the
// page to show option A and option C. Run from anywhere:
//   node docs/design/lobby-code-placement/capture.mjs <path to a #1451 checkout with node_modules> [out dir]
// It writes <today|a|c>-<size>.png and measurements.json into the out dir (default: this folder).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(path.join(src, "src/components/game/lobby.css"))) throw new Error("usage: capture.mjs <#1451 checkout> [out dir]");
const out = path.resolve(process.argv[3] ?? fileURLToPath(new URL(".", import.meta.url)));
mkdirSync(out, { recursive: true });
const { chromium } = await import(pathToFileURL(path.join(src, "scripts/proof-browser.mjs")));
const { createServer } = createRequire(path.join(src, "package.json"))("vite");
const SIZES = [[430, 932], [390, 844], [375, 812], [820, 1180], [844, 390]];

// Option A: the Wayfarer and connection lines leave the Table row and sit at the right of the header row.
const A_CSS = `
.lobby-header { justify-content: space-between; }
.lobby-header > .lobby-rule-status { margin-left: auto; align-items: flex-start; min-width: 0; flex: 0 1 auto; overflow: hidden; }
`;
// Option C: A, with the code as plain title text. It keeps the 44 px button, the 8 px side padding, the fade to "Copied" and the
// aria name; only the box goes, and the editable seat name's dotted underline marks it as tappable text.
const C_CSS = `
.lobby-layout .lobby-code { border: 0; padding: 0 8px; text-decoration: underline dotted; text-underline-offset: 6px; }
`;
const moveStatus = () => {
  const status = document.querySelector(".lobby-rule-status");
  document.querySelector(".lobby-header").append(status);
};

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1430-mock-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: path.join(src, "server"),
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
const vite = await createServer({ root: src, server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
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
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } });
  }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
}

function measure() {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const card = document.querySelector(".lobby-cover");
  const header = document.querySelector(".lobby-header");
  const rules = document.querySelector(".lobby-rules");
  const code = document.querySelector(".lobby-code");
  const caption = document.querySelector('[data-testid="lobby-caption"]');
  const conn = document.querySelector('[data-testid="connection-status"]');
  const fits = (el) => el.scrollWidth <= el.clientWidth;
  const status = {
    box: r(document.querySelector(".lobby-rule-status")),
    inHeader: !!header.querySelector(".lobby-rule-status"),
    caption: caption.textContent, captionFits: fits(caption),
    connection: conn.textContent, connectionFits: fits(conn),
  };
  // Worst case: the longest line the connection status can show, measured against the status box it sits in and the header,
  // not against itself. "fits" means the text is not clipped by the box (scrollWidth <= clientWidth of both), the box stays inside
  // the header, and the code button keeps its width.
  const saved = conn.textContent;
  const box = document.querySelector(".lobby-rule-status");
  const codeBefore = code.getBoundingClientRect().width;
  conn.textContent = "Reconnecting · 2999 ms";
  const cb = conn.getBoundingClientRect(), bb = box.getBoundingClientRect(), hbr = header.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(conn);
  const textW = range.getBoundingClientRect().width;
  status.worstCase = {
    text: conn.textContent, textWidth: +textW.toFixed(1), connectionBox: +cb.width.toFixed(1), statusBox: +bb.width.toFixed(1),
    connScrollOk: conn.scrollWidth <= conn.clientWidth, boxScrollOk: box.scrollWidth <= box.clientWidth,
    textInsideBox: textW <= bb.width + 0.5 && range.getBoundingClientRect().right <= bb.right + 0.5,
    boxInsideHeader: bb.right <= hbr.right + 0.5 && bb.left >= hbr.left - 0.5,
    codeKeptWidth: Math.abs(code.getBoundingClientRect().width - codeBefore) < 0.5,
  };
  status.worstCase.fits = status.worstCase.connScrollOk && status.worstCase.boxScrollOk && status.worstCase.textInsideBox && status.worstCase.boxInsideHeader && status.worstCase.codeKeptWidth;
  conn.textContent = saved;
  const cs = getComputedStyle(code);
  const ts = code.querySelector('[data-testid="table-code"]');
  const chat = document.querySelector('[data-testid="lobby-chat"]');
  const hb = header.getBoundingClientRect();
  const kids = [...header.children].map((c) => c.getBoundingClientRect()).filter((b) => b.width);
  return {
    card: r(card),
    header: r(header),
    code: { ...r(code), border: cs.borderTopWidth, paddingLeft: cs.paddingLeft, underline: { button: [cs.textDecorationLine, cs.textDecorationStyle, cs.textUnderlineOffset].join(" "), text: [getComputedStyle(ts).textDecorationLine, getComputedStyle(ts).textDecorationStyle, getComputedStyle(ts).textUnderlineOffset].join(" ") }, text: r(ts) },
    status,
    headerFreeX: +(hb.width - kids.reduce((s, b) => s + b.width, 0)).toFixed(1),
    rulesRow: { box: r(rules), buttons: [...rules.querySelectorAll("button")].map((el) => ({ name: el.textContent.trim(), ...r(el) })) },
    chat: r(chat),
  };
}

const results = { today: {}, a: {}, c: {} };
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
      const m = (results[state][tag] = await page.evaluate(measure));
      await page.screenshot({ path: `${out}/${state}-${tag}.png` });
      console.log(`${state} ${tag}: code ${m.code.w}x${m.code.h}; status ${m.status.box.w}x${m.status.box.h} in header ${m.status.inHeader}; fits ${m.status.captionFits}/${m.status.connectionFits}, worst case ${m.status.worstCase.fits} (text ${m.status.worstCase.textWidth}, box ${m.status.worstCase.statusBox}); underline ${m.code.underline.button} | ${m.code.underline.text}`);
    };
    await shot("today");
    await page.evaluate(moveStatus);
    await page.addStyleTag({ content: A_CSS });
    await shot("a");
    await page.addStyleTag({ content: C_CSS });
    await shot("c");
    await guest.context().close();
    await page.context().close();
  }
  writeFileSync(`${out}/measurements.json`, JSON.stringify({ base: "PR #1451 head", chromium: browser.version(), browserErrors: errors, results }, null, 2) + "\n");
  console.log(`chromium ${browser.version()}; browser errors ${errors.length}`);
  if (errors.length) console.log(errors.join("\n"));
} finally {
  rmSync(rooms, { recursive: true, force: true });
  await browser.close();
  await vite.close();
  host.kill();
}
