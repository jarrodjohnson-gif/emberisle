// Real-game pictures for #1430, the lobby reach mock. NOT a CI proof and NOT a src change.
// It drives the real lobby on the current checkout (a real host, a guest, a bot, an empty seat, one chat line), measures where
// every control sits as a distance from the bottom edge, then injects throwaway CSS and one DOM move to show options A, B and C.
// Run from the repo root, one browser at a time:
//   flock <lock file> node docs/design/lobby-reach-1430/capture.mjs [out dir]
// It writes <today|a|b|c>-<size>.png, <state>-start-390x844.png, compare-<size>.png, zones-390x844.png and measurements.json.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const out = path.resolve(process.argv[2] ?? fileURLToPath(new URL(".", import.meta.url)));
mkdirSync(out, { recursive: true });
const SIZES = [[430, 932], [390, 844], [375, 812], [820, 1180], [844, 390]];
const STATES = ["today", "a", "b", "c"];
const LABEL = { today: "Today (main)", a: "A: view row at the bottom", b: "B: A, seats under the chat", c: "C: view row on the bottom edge" };

// Shared by A, B and C: the owner's answer on q1430-code-placement (option C of PR #1456). The Wayfarer and connection lines
// move into the header, at the right of the code; the code is underlined title text with no box. The view row (Table, Play
// games, Rules) then fills its row as three equal boxes, like a tab bar, so Play games reads on one line where it fits.
const BASE_CSS = `
.lobby-header { justify-content: space-between; }
.lobby-header > .lobby-rule-status { margin-left: auto; align-items: flex-start; min-width: 0; flex: 0 1 auto; overflow: hidden; }
.lobby-layout .lobby-code { border: 0; padding: 0 8px; text-decoration: underline dotted; text-underline-offset: 6px; }
.lobby-rules { display: grid; grid-template-columns: calc((100% - 16px) * 2 / 3 + 8px) minmax(0, 1fr); gap: 8px; align-items: center; }
.lobby-layout .lm { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.lobby-layout .lm button, .lobby-layout .lm button:last-child { width: auto; min-width: 0; }
.lobby-layout .lm button:last-child span { max-width: none; }
`;
// Sideways, every option is the same: the view row sits at the bottom of the left column, above Ready, and the chat keeps
// the right column from top to bottom. The 72 px hole under the seats takes the row.
const SIDEWAYS_CSS = `
@media (max-height: 600px) and (orientation: landscape) {
  .lobby-layout .lobby-layout-cover { grid-template: 44px 112px minmax(0, 1fr) 44px / minmax(0, 36fr) minmax(0, 60fr); }
  .lobby-players { grid-column: 1; grid-row: 2; }
  .lobby-rules { grid-column: 1; grid-row: 3; align-self: end; }
  .lobby-chat-panel { grid-column: 2; grid-row: 1 / 4; }
  .lobby-layout .ly { grid-column: 2; grid-row: 1 / 4; }
  .lobby-actions { grid-column: 1 / -1; grid-row: 4; }
}
`;
const OPTION_CSS = {
  today: "",
  // A: header, seats, chat, view row, summary and Ready. The view row drops from row 2 to row 4.
  a: `${BASE_CSS}
.lobby-layout .lobby-layout-cover { grid-template-rows: 44px 112px minmax(0, 1fr) 44px 96px; }
.lobby-players { grid-row: 2; } .lobby-chat-panel { grid-row: 3; } .lobby-layout .ly { grid-row: 2 / 4; } .lobby-rules { grid-row: 4; } .lobby-actions { grid-row: 5; }
${SIDEWAYS_CSS}`,
  // B: header, chat, seats, view row, summary and Ready. Every host control but the code sits in the bottom half.
  b: `${BASE_CSS}
.lobby-layout .lobby-layout-cover { grid-template-rows: 44px minmax(0, 1fr) 112px 44px 96px; }
.lobby-chat-panel { grid-row: 2; } .lobby-players { grid-row: 3; } .lobby-layout .ly { grid-row: 2 / 4; } .lobby-rules { grid-row: 4; } .lobby-actions { grid-row: 5; }
${SIDEWAYS_CSS}`,
  // C: header, seats, chat, summary and Ready, then the view row on the card's bottom edge, like an iOS tab bar.
  c: `${BASE_CSS}
.lobby-layout .lobby-layout-cover { grid-template-rows: 44px 112px minmax(0, 1fr) 96px 44px; }
.lobby-players { grid-row: 2; } .lobby-chat-panel { grid-row: 3; } .lobby-layout .ly { grid-row: 2 / 4; } .lobby-actions { grid-row: 4; } .lobby-rules { grid-row: 5; }
${SIDEWAYS_CSS}`,
};

// The controls, in the order a host meets them. "uses" is a judgement of how often a host taps each one per table.
const CONTROLS = [
  ["Code (tap copies the link)", ".lobby-code", "once"],
  ["Table tab", ".lm > button:nth-child(1)", "few"],
  ["Play games tab", ".lm > button:nth-child(2)", "few"],
  ["Rules", ".lobby-rules > button", "rare"],
  ["Add bot", '[data-testid="add-bot"]', "0 to 3"],
  ["Remove bot", '[data-testid="remove-bot"]', "rare"],
  ["Your name", '[data-testid="rename-seat"]', "rare"],
  ["Chat tab", "#chat-tab-chat", "few"],
  ["Sounds & stickers tab", "#chat-tab-sounds", "few"],
  ["Emoji row", '[data-testid="emoji-row"] > button:first-child', "many"],
  ["Chat input", "#chat-input", "many"],
  ["Send", "#chat-input + button", "many"],
  ["Win at 7", '[aria-label="7 points"]', "rare"],
  ["Win at 10", '[aria-label="10 points"]', "rare"],
  ["Ready", ".lobby-action-buttons > button:first-child", "once"],
  ["Start", ".lobby-action-buttons > button:nth-child(2):not(:last-child)", "once"],
  ["Leave the table", ".lobby-action-buttons > button:last-child", "once"],
];

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1430-reach-rooms-"));
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
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
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

// The mock: one <style id="mock"> whose text is the option's CSS, plus the status move for A, B and C (back for today).
function apply([state, css]) {
  let style = document.getElementById("mock");
  if (!style) {
    style = document.createElement("style");
    style.id = "mock";
    document.head.append(style);
  }
  style.textContent = css;
  const status = document.querySelector(".lobby-rule-status");
  (state === "today" ? document.querySelector(".lobby-rules") : document.querySelector(".lobby-header")).append(status);
}

function measure(controls) {
  const H = innerHeight;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) }; };
  const card = document.querySelector('[data-testid="lobby-card"]');
  const cover = card.querySelector(".lobby-cover");
  const fits = (el) => el.scrollWidth <= el.clientWidth;
  // Each control: its box, its bottom edge and centre as a distance from the screen's bottom edge, and the thumb band its
  // centre falls in. Easy is the bottom third, stretch the middle third, hard the top third (the brief's zones).
  const list = controls.map(([name, sel, uses]) => {
    const el = card.querySelector(sel);
    if (!el || !el.getBoundingClientRect().width) return { name, uses, shown: false };
    const b = el.getBoundingClientRect();
    const centre = H - (b.top + b.bottom) / 2;
    return { name, uses, shown: true, box: r(el), fromBottom: +(H - b.bottom).toFixed(1), centreFromBottom: +centre.toFixed(1), zone: centre <= H / 3 ? "easy" : centre <= (2 * H) / 3 ? "stretch" : "hard", target44: b.width >= 43.5 && b.height >= 43.5 };
  });
  // Smallest gap between any two visible targets in the card (buttons, inputs, tabs, radios), as a rule check.
  const targets = [...card.querySelectorAll('button, input, [role="tab"], [role="radio"]')].map((el) => el.getBoundingClientRect()).filter((b) => b.width && b.height);
  let minGap = Infinity;
  let minGapPair = null;
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j];
    if (a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5) {
      const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      const gap = Math.max(dx, dy);
      if (gap < minGap) { minGap = gap; minGapPair = [a.width + "x" + a.height, b.width + "x" + b.height]; }
    }
  }
  const header = card.querySelector(".lobby-header"), rules = card.querySelector(".lobby-rules"), chat = card.querySelector('[data-testid="lobby-chat"]');
  const caption = card.querySelector('[data-testid="lobby-caption"]'), conn = card.querySelector('[data-testid="connection-status"]');
  const playSpan = card.querySelector(".lm > button:nth-child(2) span");
  const cb = cover.getBoundingClientRect();
  return {
    viewport: { w: innerWidth, h: H },
    card: r(cover),
    cardScrolls: cover.scrollHeight > cover.clientHeight + 1,
    header: r(header), rules: r(rules),
    statusInHeader: !!header.querySelector(".lobby-rule-status"),
    status: { caption: caption.textContent, captionFits: fits(caption), connection: conn.textContent, connectionFits: fits(conn) },
    code: { text: card.querySelector('[data-testid="table-code"]').textContent, fontSize: getComputedStyle(card.querySelector('[data-testid="table-code"]')).fontSize, underline: getComputedStyle(card.querySelector(".lobby-code")).textDecorationLine },
    playGamesLines: playSpan ? Math.round(playSpan.getBoundingClientRect().height / 20) : null,
    chat: chat ? { ...r(chat), share: +((chat.getBoundingClientRect().width * chat.getBoundingClientRect().height) / (cb.width * cb.height)).toFixed(4), log: r(card.querySelector('[data-testid="chat-log"]'))?.h ?? null, logFont: getComputedStyle(card.querySelector('[data-testid="chat-log"]')).fontSize } : null,
    minGap: minGap === Infinity ? null : { px: +minGap.toFixed(1), pair: minGapPair },
    controls: list,
  };
}

// A labelled side-by-side picture from the saved PNGs, drawn by Chromium. Scaled so four columns fit about 1,700 px.
async function compose(file, items, scale, bands) {
  const page = await browser.newPage();
  const figs = items.map(([label, png, w, h]) => {
    const data = readFileSync(png).toString("base64");
    const overlay = bands ? `<div class="band hard" style="height:${h / 3}px"><span>Hard: top third</span></div><div class="band stretch" style="top:${h / 3}px;height:${h / 3}px"><span>Stretch: middle third</span></div><div class="band easy" style="top:${(2 * h) / 3}px;height:${h / 3}px"><span>Easy: bottom third</span></div>` : "";
    return `<figure><figcaption>${label}</figcaption><div class="pic" style="width:${w}px;height:${h}px"><img src="data:image/png;base64,${data}" width="${w}" height="${h}">${overlay}</div></figure>`;
  }).join("");
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; padding: 16px; background: #fff; font: 600 ${Math.round(18 / scale)}px/1.3 system-ui, sans-serif; color: #263b3b; }
    main { display: flex; gap: 16px; align-items: flex-start; zoom: ${scale}; }
    figure { margin: 0; } figcaption { margin: 0 0 8px; white-space: nowrap; }
    .pic { position: relative; border: 1px solid #cbd3d3; } img { display: block; }
    .band { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: flex-start; justify-content: flex-end; padding: 6px 8px; box-sizing: border-box; font-size: 15px; }
    .band span { background: rgba(255,255,255,.9); border-radius: 6px; padding: 2px 6px; }
    .hard { background: rgba(200, 40, 40, .18); border-bottom: 2px dashed rgba(200,40,40,.7); }
    .stretch { background: rgba(230, 160, 20, .16); border-bottom: 2px dashed rgba(230,160,20,.8); }
    .easy { background: rgba(40, 150, 80, .16); }
  </style></head><body><main>${figs}</main></body></html>`);
  await page.setViewportSize({ width: 100, height: 100 });
  const size = await page.evaluate(() => ({ w: Math.ceil(document.documentElement.scrollWidth), h: Math.ceil(document.documentElement.scrollHeight) }));
  await page.setViewportSize({ width: Math.min(size.w, 16000), height: Math.min(size.h, 16000) });
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

const results = {};
const log = [];
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
    const shot = async (state, phase, picture) => {
      await page.evaluate(apply, [state, OPTION_CSS[state]]);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(250);
      const m = await page.evaluate(measure, CONTROLS);
      ((results[state] ??= {})[tag] ??= {})[phase] = m;
      if (picture) await page.screenshot({ path: `${out}/${state}${phase === "start" ? "-start" : ""}-${tag}.png` });
      const line = `${state} ${phase} ${tag}: ${m.controls.filter((c) => c.shown).map((c) => `${c.name} ${c.fromBottom} (${c.zone})`).join("; ")}; chat log ${m.chat?.log}, share ${m.chat?.share}; min gap ${m.minGap?.px}; scrolls ${m.cardScrolls}; status fits ${m.status.captionFits}/${m.status.connectionFits}; Play games lines ${m.playGamesLines}`;
      log.push(line);
      console.log(line);
    };
    for (const state of STATES) await shot(state, "waiting", true);
    // Then the host is Ready too: with three seats all ready, Start shows next to Not ready, with the empty seat kept.
    await page.getByRole("button", { name: "Ready", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).waitFor();
    for (const state of STATES) await shot(state, "start", tag === "390x844");
    await guest.context().close();
    await page.context().close();
  }
  // Labelled before/after pictures, one per size, and the thumb bands over today at 390 x 844.
  for (const [width, height] of SIZES) {
    const tag = `${width}x${height}`;
    const scale = Math.min(1, 1700 / (4 * width + 5 * 16));
    await compose(`${out}/compare-${tag}.png`, STATES.map((s) => [LABEL[s], `${out}/${s}-${tag}.png`, width, height]), scale, false);
  }
  await compose(`${out}/compare-start-390x844.png`, STATES.map((s) => [`${LABEL[s]}, Start showing`, `${out}/${s}-start-390x844.png`, 390, 844]), 1, false);
  await compose(`${out}/zones-390x844.png`, [["Today, thumb bands", `${out}/today-390x844.png`, 390, 844], ["A, thumb bands", `${out}/a-390x844.png`, 390, 844], ["B, thumb bands", `${out}/b-390x844.png`, 390, 844]], 1, true);
  writeFileSync(`${out}/measurements.json`, JSON.stringify({ base: "main (see README)", chromium: browser.version(), browserErrors: errors, controls: CONTROLS, results }, null, 2) + "\n");
  writeFileSync(`${out}/capture.log`, log.join("\n") + `\nchromium ${browser.version()}; browser errors ${errors.length}\n${errors.join("\n")}`);
  console.log(`chromium ${browser.version()}; browser errors ${errors.length}`);
  if (errors.length) console.log(errors.join("\n"));
} finally {
  rmSync(rooms, { recursive: true, force: true });
  await browser.close();
  await vite.close();
  host.kill();
}
