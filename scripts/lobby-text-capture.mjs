// #1235 research utility: record root-font scaling, without asserting layout compliance.
// Run: node scripts/lobby-text-capture.mjs --run <name> --out <directory>
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const { values } = parseArgs({ options: {
  run: { type: "string" }, out: { type: "string", default: "test-results/lobby-text-capture" },
} });
assert.ok(values.run, "--run must name the capture");
const out = resolve(values.out);
mkdirSync(out, { recursive: true });
const records = [], errors = [];
const metadata = {
  run: values.run,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  scriptSHA256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
  node: process.version,
  fixture: "real host/guest/bot/empty seat; desktop Chromium CSS viewports; reduced motion; device scale 1",
};
const save = () => writeFileSync(join(out, "measurements.json"), JSON.stringify({ ...metadata, records, errors }, null, 2) + "\n");
const rooms = mkdtempSync(join(tmpdir(), "emberisle-lobby-text-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms, RESULTS_DIR: join(rooms, "results") },
});
let vite, browser;
try {
  const port = await new Promise((resolve, reject) => {
    host.on("error", reject);
    host.stdout.on("data", data => { const m = String(data).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
    host.stderr.on("data", data => writeFileSync(join(out, "host-stderr.log"), data, { flag: "a" }));
    host.on("exit", code => reject(new Error(`host exited ${code}`)));
  });
  vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await vite.listen();
  const { JOIN_CODE } = await vite.ssrLoadModule("/src/lib/net/proto.ts");
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${port}`;
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  metadata.browser = browser.version();
  async function client(name) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await context.addInitScript(name => {
      localStorage.setItem("emberisle-name", name);
      localStorage.setItem("emberisle-water", "simple");
    }, name);
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__emberisle, null, { timeout: 60_000 });
    return page;
  }
  const page = await client("Jarrod");
  await page.evaluate(() => window.__emberisle.getState().hostTable());
  await page.getByTestId("lobby-card").waitFor({ timeout: 60_000 });
  const code = (await page.getByTestId("table-code").textContent()).trim();
  assert.match(code, JOIN_CODE); // Validate the real protocol, which permits letters and digits.
  const guest = await client("Josh");
  await guest.evaluate(code => window.__emberisle.getState().joinTable(code), code);
  await guest.getByTestId("lobby-card").waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
  await page.getByTestId("add-bot").first().click();
  await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
  await guest.locator("#chat-input").fill("Ready when you are!");
  await guest.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByTestId("chat-log").getByText("Ready when you are!").waitFor();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.waitForFunction(() => { const g = window.__emberisle.getState(); return g.seats.find(s => s.id === g.seatId)?.ready; });
  const base = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [844, 390], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    for (const scale of [1, 1.25, 1.5]) {
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, base * scale);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const observed = await page.evaluate(() => {
        const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
        const range = element => { const r = document.createRange(); r.selectNodeContents(element); return rect(r); };
        const overflow = element => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight });
        const code = document.querySelector('[data-testid="table-code"]');
        const box = rect(code), glyphs = range(code), button = rect(code.closest("button"));
        const selectors = {
          code: '[data-testid="table-code"]', name: '[data-testid="lobby-name"] button', status: ".lobby-player-status",
          chat: '[data-testid="chat-log"] > li', input: "#chat-input", ready: ".lobby-action-buttons > button", summary: '[data-testid="lobby-status"]',
        };
        return {
          root: parseFloat(getComputedStyle(document.documentElement).fontSize), code: code.textContent.trim(),
          codeFits: glyphs.x >= box.x - 0.5 && glyphs.right <= box.right + 0.5 && glyphs.y >= button.y - 0.5 && glyphs.bottom <= button.bottom + 0.5,
          cardOverflow: overflow(document.querySelector(".lobby-cover")),
          peopleOverflow: overflow(document.querySelector('[data-testid="lobby-players"]')),
          documentOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          fonts: Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])),
        };
      });
      assert.equal(observed.code, code);
      assert.equal(observed.root, base * scale);
      const tag = `${width}x${height}-${Math.round(scale * 100)}`;
      await page.screenshot({ path: join(out, `${tag}.png`) });
      records.push({ width, height, scale, tag, ...observed });
      save();
      console.log(JSON.stringify({ run: values.run, tag, ...observed }));
    }
  }
  assert.equal(errors.length, 0, "capture must have no console or page errors");
  console.log(`${values.run}: ${records.length} captures complete; this records observations, not layout compliance`);
} finally {
  await browser?.close();
  await vite?.close();
  host.kill();
  save();
}
