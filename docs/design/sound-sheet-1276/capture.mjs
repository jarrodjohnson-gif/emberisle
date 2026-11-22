// Design capture for #1276: the Sound sheet options, drawn into the real running game. Not a CI proof.
// Run from the repo root: node docs/design/sound-sheet-1276/capture.mjs
// A real host, a real online table (Jarrod, Josh and a bot), the real HUD. Each option's sheet is added to the running
// page from sheet.mjs and sheet.css, which use the game's own tokens. No source file changes.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { OPTIONS, entryRow, sheet } from "./sheet.mjs";

const dir = "docs/design/sound-sheet-1276";
const css = readFileSync(`${dir}/sheet.css`, "utf8");
const sizes = [[390, 844], [844, 390], [1280, 720]];

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1276-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms },
});
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", d => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", code => reject(new Error(`host exited ${code}`)));
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
  page.on("pageerror", e => errors.push(`${name}: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  await page.addInitScript(n => {
    localStorage.setItem("emberisle-name", n);
    localStorage.setItem("emberisle-jelly", "lite");
  }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
}

// Every number the README quotes comes from here.
function measure() {
  const root = document.querySelector("[data-mock-sheet]");
  const r = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const box = r(root);
  const controls = [...root.querySelectorAll("button, input, [role=switch]")].filter(el => el.getClientRects().length);
  const label = el => el.getAttribute("aria-label") || el.textContent.trim().slice(0, 24);
  const fonts = [...new Set([...root.querySelectorAll("*")].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(el => parseFloat(getComputedStyle(el).fontSize)))].sort((a, b) => a - b);
  return {
    viewport: `${innerWidth}x${innerHeight}`,
    sheet: box,
    inside: box.x >= 0 && box.y >= 0 && box.x + box.w <= innerWidth + 0.5 && box.y + box.h <= innerHeight + 0.5,
    hiddenBelow: (b => b.scrollHeight - b.clientHeight)(root.querySelector("[data-scroll]")),
    controls: controls.length,
    under44: controls.filter(el => { const b = el.getBoundingClientRect(); return el.type !== "range" && (b.width < 43.5 || b.height < 43.5); }).map(label),
    sliderHit: controls.filter(el => el.type === "range").map(el => +el.getBoundingClientRect().height.toFixed(1)),
    fontSizes: fonts,
    canvas: r(document.querySelector("canvas")),
  };
}

const results = [];
try {
  for (const [width, height] of sizes) {
    const tag = `${width}x${height}`;
    const page = await client("Jarrod", { width, height }, width < 1000);
    await page.evaluate(() => window.__emberisle.getState().hostTable());
    await page.getByTestId("lobby-card").waitFor();
    const code = (await page.getByTestId("table-code").textContent()).trim();
    const guest = await client("Josh", { width: 390, height: 844 }, true);
    await guest.evaluate(c => window.__emberisle.getState().joinTable(c), code);
    await guest.getByTestId("lobby-card").waitFor();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    for (const p of [page, guest]) await p.getByRole("button", { name: "Ready", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "play" && !!window.__isle, null, { timeout: 90_000 });
    await page.waitForTimeout(4000);
    await page.evaluate(() => document.fonts.ready);
    // The other seats, with the colour of their dot on the seat card.
    const seats = await page.evaluate(() => {
      const s = window.__emberisle.getState();
      return s.seats.filter(x => x.id !== s.seatId).map(x => {
        const card = [...document.querySelectorAll(".seat-card")].find(c => c.textContent.includes(x.name));
        const dot = card?.querySelector(".seat-dot");
        return { name: x.name, color: dot ? getComputedStyle(dot).backgroundColor : "var(--line)" };
      });
    });
    // The HUD hole: under the Table menu button, above the dock (phone upright), right of the dock (phone sideways).
    const hole = await page.evaluate(() => {
      const menu = document.querySelector('button[aria-label="Table menu"]').getBoundingClientRect();
      const dock = [document.querySelector(".turn-instruction"), [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Roll")].filter(Boolean).map(e => e.getBoundingClientRect());
      return { top: Math.round(menu.bottom + 8), bottom: Math.round(innerHeight - Math.min(...dock.map(b => b.top)) + 8), left: Math.round(Math.max(...dock.map(b => b.right)) + 8) };
    });
    const before = await page.evaluate(() => { const b = document.querySelector("canvas").getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; });
    await page.evaluate(([c, h]) => {
      const s = document.createElement("style");
      s.textContent = `${c}\n:root { --mock-top: ${h.top}px; --mock-bottom: ${h.bottom}px; --mock-left: ${h.left}px; }`;
      document.body.append(s);
    }, [css, hole]);

    // The entry: the Table menu with its two sound rows folded into one "Sound" row.
    await page.getByRole("button", { name: "Table menu", exact: true }).click();
    await page.getByTestId("table-menu").waitFor();
    await page.evaluate(html => {
      const menu = document.querySelector('[data-testid="table-menu"]');
      menu.querySelector('[data-testid="music-toggle"]').remove();
      menu.querySelector('[data-testid="sound-toggle"]').outerHTML = html;
    }, entryRow());
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${dir}/entry-${tag}.png` });
    await page.keyboard.press("Escape");

    for (const option of OPTIONS) {
      await page.evaluate(html => document.body.insertAdjacentHTML("beforeend", html), sheet(option.id, { seats, width, height }));
      await page.waitForTimeout(150);
      const m = await page.evaluate(measure);
      const after = [m.canvas.x, m.canvas.y, m.canvas.w, m.canvas.h];
      m.mapMoved = JSON.stringify(after.map(v => Math.round(v))) !== JSON.stringify(before.map(v => Math.round(v)));
      results.push({ option: option.id, hole, ...m });
      await page.screenshot({ path: `${dir}/${option.id}-${tag}.png` });
      console.log(`${option.id} ${tag}: sheet ${m.sheet.w}x${m.sheet.h} at ${m.sheet.x},${m.sheet.y}; inside ${m.inside}; hidden below ${m.hiddenBelow}px; controls ${m.controls}; under 44: ${m.under44.join(",") || "none"}; slider hit ${[...new Set(m.sliderHit)].join("/")}; fonts ${m.fontSizes.join("/")}; map moved ${m.mapMoved}`);
      await page.evaluate(() => document.querySelector("[data-mock-sheet]").remove());
    }
    await page.context().close();
    await guest.context().close();
  }
  writeFileSync(`${dir}/measurements.json`, JSON.stringify({ chromium: browser.version(), results }, null, 2) + "\n");
  console.log(`chromium ${browser.version()}; ${results.length} option pictures; browser errors ${errors.length}`);
  if (errors.length) console.log(errors.join("\n"));
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
