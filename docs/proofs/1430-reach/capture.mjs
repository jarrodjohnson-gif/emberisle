// #1430 reach, option A: real pictures of the BUILT lobby, before (main) and after (this branch). Not a CI proof; the
// geometry is asserted in scripts/lobby-code-copy-prove.mjs. It drives the real lobby on the checkout it runs from: a real
// host (Jarrod), a real guest (Josh, Ready, one chat line), one bot and one empty seat, the same table as the #1470 mock.
// Run from the repo root, one browser at a time:
//   flock <lock file> node docs/proofs/1430-reach/capture.mjs <before|after> [out dir]   pictures and <label>.json
//   node docs/proofs/1430-reach/capture.mjs compose [out dir]                             compare-<size>.png from both
// "before" is run from a checkout of main with this file copied in; "after" from this branch.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";

const label = process.argv[2];
const out = path.resolve(process.argv[3] ?? fileURLToPath(new URL(".", import.meta.url)));
mkdirSync(out, { recursive: true });
const SIZES = [[390, 844], [430, 932], [820, 1180], [844, 390]];
const CONTROLS = [
  ["Code", ".lobby-code"],
  ["Table tab", ".lm > button:nth-child(1)"],
  ["Play games tab", ".lm > button:nth-child(2)"],
  ["Rules", ".lobby-rules > button"],
  ["Add bot", '[data-testid="add-bot"]'],
  ["Chat input", "#chat-input"],
  ["Ready", ".lobby-action-buttons > button:first-child"],
  ["Leave the table", ".lobby-action-buttons > button:last-child"],
];

if (label === "compose") {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of SIZES) {
      const tag = `${width}x${height}`;
      const scale = Math.min(1, 1700 / (2 * width + 3 * 16));
      const figs = ["before", "after"].map((s) => `<figure><figcaption>${s === "before" ? "Before (main)" : "After (this PR, option A)"}, ${tag}</figcaption><img src="data:image/png;base64,${readFileSync(`${out}/${s}-${tag}.png`).toString("base64")}" width="${width}" height="${height}"></figure>`).join("");
      const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        body { margin: 0; padding: 16px; background: #fff; font: 600 ${Math.round(18 / scale)}px/1.3 system-ui, sans-serif; color: #263b3b; }
        main { display: flex; gap: 16px; align-items: flex-start; zoom: ${scale}; } figure { margin: 0; } figcaption { margin: 0 0 8px; white-space: nowrap; }
        img { display: block; border: 1px solid #cbd3d3; }
      </style></head><body><main>${figs}</main></body></html>`);
      const size = await page.evaluate(() => ({ w: Math.ceil(document.documentElement.scrollWidth), h: Math.ceil(document.documentElement.scrollHeight) }));
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.screenshot({ path: `${out}/compare-${tag}.png`, fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`compose: ${SIZES.map(([w, h]) => `compare-${w}x${h}.png`).join(", ")}`);
  process.exit(0);
}
if (label !== "before" && label !== "after") throw new Error("usage: capture.mjs <before|after|compose> [out dir]");

const { createServer } = await import("vite");
const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1430-reach-build-"));
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

async function client(name, viewport) {
  const touch = viewport.width < 1000;
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

const results = {};
try {
  for (const [width, height] of SIZES) {
    const tag = `${width}x${height}`;
    const page = await client("Jarrod", { width, height });
    await page.evaluate(() => window.__emberisle.getState().hostTable());
    await page.getByTestId("lobby-card").waitFor();
    const code = await page.evaluate(() => window.__emberisle.getState().code);
    const guest = await client("Josh", { width: 390, height: 844 });
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
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${label}-${tag}.png` });
    results[tag] = await page.evaluate((controls) => {
      const card = document.querySelector('[data-testid="lobby-card"]');
      const cover = card.querySelector(".lobby-cover");
      return {
        cardScrolls: cover.scrollHeight > cover.clientHeight + 1,
        controls: Object.fromEntries(controls.map(([name, sel]) => {
          const el = card.querySelector(sel);
          if (!el) return [name, null];
          const b = el.getBoundingClientRect();
          const centre = innerHeight - (b.top + b.bottom) / 2;
          return [name, { fromBottom: Math.round(innerHeight - b.bottom), band: centre <= innerHeight / 3 ? "easy" : centre <= (2 * innerHeight) / 3 ? "stretch" : "hard", w: Math.round(b.width), h: Math.round(b.height) }];
        })),
      };
    }, CONTROLS);
    const c = results[tag].controls;
    console.log(`${label} ${tag}: ${Object.entries(c).map(([n, v]) => `${n} ${v ? `${v.fromBottom} (${v.band})` : "-"}`).join("; ")}; card scrolls ${results[tag].cardScrolls}`);
    await guest.context().close();
    await page.context().close();
  }
  writeFileSync(`${out}/${label}.json`, JSON.stringify({ chromium: browser.version(), browserErrors: errors, results }, null, 2) + "\n");
  console.log(`chromium ${browser.version()}; browser errors ${errors.length}`);
  if (errors.length) console.log(errors.join("\n"));
} finally {
  rmSync(rooms, { recursive: true, force: true });
  await browser.close();
  await vite.close();
  host.kill();
}
