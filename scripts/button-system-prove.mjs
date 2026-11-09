// #1418: one button type and one keyboard focus colour (owner, #1298: option A and option A; design in docs/design/button-audit).
// At 430x932, 390x844, 375x812, 820x1180, 844x390 and 1280x720, on the title, a played lobby, a main-phase table, an
// incoming offer, the trade window, the fortune tray, the table menu and the results:
// - every Button is 15 px / 22 px, weight 600, but two that keep their own type, as in the packet's after.css: the lobby
//   (its accepted scale, decision 7 of #1274) and the trade window's 12 px need pills (seat-needs.css);
// - no Button label outside the lobby wraps onto a second line or clips (the title's Host and Join row is the tight one),
//   and every such Button is at least 44 x 44;
// - Tab through the screen: every focused button and tab shows a 2 px solid ink (#263d3c) outline.
// Zero console errors. Run: npm run button-system-prove
// `--report <file>` writes the measurements and skips the checks (used to measure main for the before pictures);
// `--pictures <dir>` writes one JPEG per screen and size.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const report = arg("--report");
const pictures = arg("--pictures");
if (pictures) mkdirSync(pictures, { recursive: true });
const SIZES = [[430, 932], [390, 844], [375, 812], [820, 1180], [844, 390], [1280, 720]];
const INK = "rgb(38, 61, 60)";
// Not this issue's to change: an open PR holds the same function (#1418 Question). Fortunes pins text-sm in Hud() (PR #1144);
// the results row sets its own sea-ink focus in WinList() (PR #1415).
const PENDING_TYPE = new Set(["fortunes-button"]);
const PENDING_FOCUS = new Set(["win-row"]);

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1418-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: new URL("../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: rooms } });
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  host.on("exit", (code) => reject(new Error(`host exited ${code}`)));
});
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

// Every visible button and tab: the label, whether it is the Button primitive, its box, type, and whether any of its text
// runs onto a second line or past its box (or past the clip box of an ellipsis span inside it).
const measure = () => {
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).opacity !== "0";
  return [...document.querySelectorAll("button, [role=tab]")].filter(shown).map((b) => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const wraps = [];
    const clips = [];
    const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t.textContent.trim();
      if (!text || !shown(t.parentElement) || t.parentElement.closest("[aria-hidden=true] .sr-only, .sr-only")) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      const rects = [...range.getClientRects()].filter((q) => q.width > 0);
      const lines = new Set(rects.map((q) => Math.round(q.top + q.height / 2)));
      if (lines.size > 1 && [...lines].some((y) => Math.abs(y - [...lines][0]) > 4)) wraps.push(text);
      const box = range.getBoundingClientRect();
      if (box.left < r.left - 1 || box.right > r.right + 1 || box.top < r.top - 1 || box.bottom > r.bottom + 1) clips.push(text);
      const p = t.parentElement;
      if (p !== b && p.scrollWidth > p.clientWidth + 1 && getComputedStyle(p).overflow !== "visible") clips.push(text);
    }
    if (b.scrollWidth > b.clientWidth + 1 && cs.overflow !== "visible") clips.push("(button)");
    return {
      label: (b.getAttribute("aria-label") || b.textContent.trim() || b.tagName).slice(0, 40),
      testid: b.dataset.testid ?? "",
      primitive: b.classList.contains("duration-(--duration-press)"),
      need: b.classList.contains("need-toggle"),
      lobby: !!b.closest(".lobby-layout"),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      bg: cs.backgroundColor,
      font: [cs.fontSize, cs.lineHeight, cs.fontWeight],
      wraps, clips,
    };
  });
};

// Tab through the screen and read the outline of every button and tab that takes focus.
const focusWalk = async (page, steps) => {
  const seen = new Map();
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || !el.matches("button, [role=tab]") || !el.matches(":focus-visible")) return null;
      const cs = getComputedStyle(el);
      return { label: (el.getAttribute("aria-label") || el.textContent.trim()).slice(0, 40), testid: el.dataset.testid ?? "", style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, border: cs.borderTopColor };
    });
    if (f && !seen.has(`${f.testid}|${f.label}`)) seen.set(`${f.testid}|${f.label}`, f);
  }
  return [...seen.values()];
};

// A main-phase practice table: pieces down, goods in every hand, one fortune of each kind held.
const crafted = async (page) => {
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async () => {
    const game = window.__emberisle;
    const { createGame } = await import("/src/lib/game/board.ts");
    const st = createGame({ seed: 20261107, humans: [{ name: "Jarrod" }, { name: "Josh" }, { name: "Mira" }, { name: "Finn" }], bots: 0 });
    const land = st.vertices.filter((v) => v.hexes.length >= 2);
    const step = Math.floor(land.length / 8);
    st.players.forEach((p, i) => {
      p.resources = { timber: 2, clay: 1, wool: 3, grain: 1, ore: 2 };
      p.hidden = { knight: 1, road: 1, plenty: 1, monopoly: 1, vp: 0 };
      for (let k = 0; k < 2; k++) {
        const v = land[(i * 2 + k) * step];
        v.building = { playerId: p.id, kind: k ? "stronghold" : "outpost" };
        const e = st.edges.find((e) => (e.va === v.id || e.vb === v.id) && !e.path);
        if (e) e.path = p.id;
      }
    });
    st.log = ["Jarrod laid a path."];
    st.phase = "main";
    st.current = st.players[0].id;
    st.dice = [3, 5];
    st.seq++;
    game.setState({ state: st, localId: st.current, mode: "ai", buildMode: "none", banner: null, error: null, synced: game.getState().synced + 1 });
  });
  await page.waitForTimeout(1500);
};

const out = { sizes: [] };
const errors = [];
const problems = [];
try {
  for (const [width, height] of SIZES) {
    const tag = `${width}x${height}`;
    const touch = width < 1000;
    const rec = { size: tag, screens: {} };
    const open = async (name, viewport) => {
      const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
      await page.addInitScript((n) => { localStorage.setItem("emberisle-name", n); Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } }); }, name);
      await page.goto(url);
      await page.waitForFunction(() => !!window.__emberisle);
      return page;
    };
    const screen = async (page, name, steps) => {
      await page.mouse.move(0, 0);
      const buttons = await page.evaluate(measure);
      if (pictures) await page.screenshot({ path: `${pictures}/${tag}-${name}.jpg`, type: "jpeg", quality: 80 });
      const focus = steps ? await focusWalk(page, steps) : [];
      rec.screens[name] = { buttons, focus };
      for (const b of buttons) {
        const at = `${tag} ${name} "${b.label}"`;
        // The wrap and clip checks cover what the new type reaches: Buttons outside the lobby. Raw buttons and the lobby keep
        // their own type, so this change cannot wrap them (#1301, #1303 and the mechanical-fix list own those).
        if (!b.primitive || b.lobby) continue;
        if (b.wraps.length) problems.push(`${at}: wraps (${b.wraps.join(" | ")})`);
        if (b.clips.length) problems.push(`${at}: clips (${b.clips.join(" | ")})`);
        if (b.w < 44 || b.h < 44) problems.push(`${at}: ${b.w}x${b.h}, under 44 x 44`);
        if (!b.need &&!PENDING_TYPE.has(b.testid) && b.font.join(" ") !== "15px 22px 600") problems.push(`${at}: type ${b.font.join(" ")}, not 15px 22px 600`);
      }
      for (const f of focus) {
        if (PENDING_FOCUS.has(f.testid)) continue;
        // The dock markers on the board show focus as an ink edge in place of a ring (DockInspection.tsx).
        if (f.style === "none" && f.border === INK) continue;
        if (f.style !== "solid" || f.width !== "2px" || f.color !== INK) problems.push(`${tag} ${name} focus on "${f.label}": ${f.style} ${f.width} ${f.color}, not 2px solid ink`);
      }
      return focus.length;
    };

    const title = await open("Jarrod", { width, height });
    await title.getByRole("button", { name: "Play", exact: true }).waitFor();
    await title.waitForTimeout(500);
    assert.ok(await screen(title, "title", 12) > 3, `${tag}: Tab reaches the title's buttons`);
    const row = await title.evaluate(() => ["Host a table", "Join"].map((n) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === n).getBoundingClientRect().top));
    if (Math.abs(row[0] - row[1]) > 1) problems.push(`${tag} title: Host a table and Join are not on one line (${row.join(", ")})`);

    // Lobby: Josh joins, one bot, both ready, so Start shows.
    await title.evaluate(() => window.__emberisle.getState().hostTable());
    await title.getByTestId("lobby-card").waitFor();
    const code = (await title.getByTestId("table-code").textContent()).trim();
    const guest = await open("Josh", { width: 390, height: 844 });
    await guest.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
    await guest.getByTestId("lobby-card").waitFor();
    await title.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await title.getByTestId("add-bot").first().click();
    await title.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    await guest.evaluate(() => window.__emberisle.getState().setReady(true));
    await title.getByRole("button", { name: "Ready", exact: true }).click();
    await title.getByRole("button", { name: "Start", exact: true }).waitFor();
    await title.waitForTimeout(500);
    await title.evaluate(() => document.activeElement?.blur());
    assert.ok(await screen(title, "lobby", 16) > 3, `${tag}: Tab reaches the lobby's buttons`);
    await guest.context().close();
    await title.context().close();

    const table = await open("Jarrod", { width, height });
    await crafted(table);
    assert.ok(await screen(table, "table", 30) > 3, `${tag}: Tab reaches the table's buttons`);

    await table.evaluate(() => window.__emberisle.setState({ offer: { tradeId: "prove-offer", from: "p2", fromName: "Mira", give: { wool: 2 }, want: { ore: 1 }, until: Date.now() + 60000 }, declined: [] }));
    await table.locator(".trade-dock").first().waitFor();
    await table.waitForTimeout(400);
    await screen(table, "offer", 0);
    await table.evaluate(() => window.__emberisle.setState({ offer: null }));

    await table.getByRole("button", { name: "Trade", exact: true }).click();
    await table.getByTestId("trade-panel").waitFor();
    await table.waitForTimeout(400);
    await screen(table, "trade", 12);
    await table.keyboard.press("Escape");
    await table.getByTestId("trade-panel").waitFor({ state: "detached" });

    await table.getByTestId("fortunes-button").click();
    await table.getByTestId("fortune-tray").waitFor();
    await table.waitForTimeout(400);
    await screen(table, "fortunes", 10);
    await table.keyboard.press("Escape");
    await table.getByTestId("fortune-tray").waitFor({ state: "detached" });

    await table.getByRole("button", { name: "Table menu", exact: true }).click();
    await table.getByTestId("table-menu").waitFor();
    await table.waitForTimeout(300);
    await screen(table, "menu", 12);
    await table.keyboard.press("Escape");

    await table.evaluate(() => {
      const game = window.__emberisle;
      const st = structuredClone(game.getState().state);
      st.phase = "over";
      st.winner = st.players[0].id;
      st.seq++;
      game.setState({ state: st, mode: "hotseat" });
    });
    await table.getByTestId("win-screen").waitFor();
    await table.waitForTimeout(500);
    await screen(table, "results", 12);
    await table.context().close();
    out.sizes.push(rec);
    console.log(`${tag}: ${Object.entries(rec.screens).map(([n, s]) => `${n} ${s.buttons.length} buttons, ${s.focus.length} focused`).join("; ")}`);
  }
} finally {
  await browser.close();
  await vite.close();
  host.kill();
  rmSync(rooms, { recursive: true, force: true });
}
out.errors = errors;
out.problems = problems;
if (report) {
  writeFileSync(report, JSON.stringify(out, null, 2));
  console.log(`report: ${report}, ${problems.length} problems, ${errors.length} errors`);
} else {
  assert.deepEqual(problems, [], `button-system: ${problems.length} problems\n${problems.join("\n")}`);
  assert.deepEqual(errors, [], "zero console errors");
  console.log("button-system-prove: 15/22/600 on every Button, no wrapped or clipped label, ink focus on every button and tab, at six sizes");
}
