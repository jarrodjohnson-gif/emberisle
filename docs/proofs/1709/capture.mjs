// #1709: pictures of the lobby's left column. `node docs/proofs/1709/capture.mjs` on main took the today-* pictures and the
// option mocks for the Question on PR #1905; `node docs/proofs/1709/capture.mjs after` on this branch takes the built after-*
// pictures (option C, the look decision), with no mock. Not a proof: it asserts nothing. It runs a real host and the Vite dev server, seats Jarrod (host), Josh and two bots,
// and captures the Table tab and the Sandwich Stacker wait box. A mock is one extra stylesheet laid over today's CSS;
// no game file changes. Run from the repository root: node docs/proofs/1709/capture.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { hostPort as waitForHostPort } from "../../../scripts/proof-host-port.mjs";

const out = "docs/proofs/1709";
const after = process.argv[2] === "after";
// The mocks touch only short landscape screens, where #1709 was seen; portrait and desktop stay as they are.
const LAND = "@media (max-height: 600px) and (orientation: landscape)";
const ONE_LINE_TAB = `html .lobby-layout .lm button:last-child { width: auto !important; white-space: nowrap !important; }
  html .lobby-layout .lm button:last-child span { max-width: none !important; }`;
const MOCKS = {
  // A: the caption is hidden where it cannot read in full; "Play games" is one line.
  "a-hide": `${LAND} { ${ONE_LINE_TAB}
    html .lobby-rule-status > [data-testid="lobby-caption"] { display: none !important; } }`,
  // B: the caption sits beside the code at every width; Numbers takes its second header row, as #1750 built.
  "b-header": `${LAND} { ${ONE_LINE_TAB}
    html .lobby-head-rule { display: block !important; }
    html .lobby-rule-status > [data-testid="lobby-caption"] { display: none !important; } }`,
  // C: the caption takes its own line under the tabs, uncut, as #1750 already does above 100% text.
  "c-own-line": `${LAND} { ${ONE_LINE_TAB}
    html .lobby-layout .lobby-layout-cover > .lobby-rules { flex-wrap: wrap !important; height: auto !important; row-gap: 0; }
    html .lobby-layout .lobby-layout-cover > .lobby-rules > .lobby-rule-status { flex: 1 0 100% !important; height: auto !important; min-height: 0 !important; padding-left: 0; }
    html .lobby-rule-status > [data-testid="lobby-caption"] { display: block !important; } }`,
};

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1709-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms, PROFILES_DIR: path.join(rooms, "profiles"), RESULTS_DIR: `${rooms}/results` },
});
process.on("exit", () => {
  if (host.exitCode === null && host.signalCode === null) host.kill("SIGKILL");
  rmSync(rooms, { recursive: true, force: true });
});
const hostPort = await waitForHostPort(host);
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function client(name, viewport) {
  const touch = viewport.width < 1000;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript((n) => { localStorage.setItem("emberisle-name", n); localStorage.setItem("emberisle-jelly", "lite"); }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
}
const settle = (page) => page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));

// What the left column shows: the caption's text and whether it is cut, and each tab's height and line count.
async function measure(page) {
  return page.evaluate(() => {
    const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
    const shown = [...document.querySelectorAll('[data-testid="lobby-caption"], .lobby-head-rule')].find((el) => el.getBoundingClientRect().width > 0);
    const tabs = [...document.querySelectorAll('.lobby-rules [role="tab"], .lobby-rules > button')].map((el) => ({ name: el.textContent.trim(), height: Math.round(el.getBoundingClientRect().height), lines: lines(el) }));
    const style = shown && getComputedStyle(shown), card = document.querySelector(".lobby-cover");
    const left = shown && Math.round(shown.getBoundingClientRect().left - document.querySelector(".lobby-rules").getBoundingClientRect().left);
    return { caption: shown ? { text: shown.textContent, cut: shown.scrollWidth > shown.clientWidth + 0.5, font: `${style.fontSize}/${style.lineHeight} ${style.fontWeight} ${style.color}`, left } : "hidden", tabs, cardScrolls: card.scrollHeight > card.clientHeight + 1 };
  });
}

const host1 = await client("Jarrod", { width: 844, height: 390 });
await host1.evaluate(() => window.__emberisle.getState().hostTable());
await host1.getByTestId("lobby-card").waitFor();
const code = (await host1.getByTestId("table-code").textContent()).trim();
const guest = await client("Josh", { width: 390, height: 844 });
await guest.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
await host1.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
for (const n of [3, 4]) {
  await host1.getByTestId("add-bot").first().click();
  await host1.waitForFunction((k) => window.__emberisle.getState().seats.length === k, n);
}

async function shoot(name, viewport, mock) {
  await host1.setViewportSize(viewport);
  const tag = mock ? await host1.addStyleTag({ content: MOCKS[mock] }) : null;
  await settle(host1);
  const file = `${out}/${name}.png`;
  await host1.screenshot({ path: file });
  console.log(`${file}: ${JSON.stringify(await measure(host1))}`);
  await tag?.evaluate((el) => el.remove());
}

const sizes = [[844, 390], [667, 375], [440, 956], [956, 440], [1280, 720]];
const pre = after ? "after" : "today";
const mocks = after ? [] : Object.keys(MOCKS);
for (const [width, height] of sizes) await shoot(`${pre}-${width}x${height}`, { width, height });
for (const mock of mocks) for (const [width, height] of sizes) await shoot(`${mock}-${width}x${height}`, { width, height }, mock);

// The wait box: Play games, then Sandwich Stacker.
await host1.setViewportSize({ width: 844, height: 390 });
await host1.getByRole("tab", { name: "Play games" }).click();
await host1.locator(".lt button").click();
await host1.getByTestId("lobby-wait").waitFor();
await host1.waitForFunction(() => !/Loading/.test(document.querySelector('[data-testid="lobby-wait-status"]')?.textContent ?? "Loading"), null, { timeout: 25000 });
for (const [width, height] of after ? [sizes[0], sizes[1], sizes[3]] : sizes.slice(0, 2)) {
  await shoot(`${pre}-${width}x${height}-wait`, { width, height });
  for (const mock of mocks) await shoot(`${mock}-${width}x${height}-wait`, { width, height }, mock);
}

await browser.close();
await vite.close();
host.kill("SIGKILL");
console.log("capture: done");
