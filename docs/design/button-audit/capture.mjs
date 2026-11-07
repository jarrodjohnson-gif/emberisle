// #1298 design capture: every button family in the real game, before and after the proposed mechanical fixes, at
// 390x844, 844x390 and 1280x720. "After" adds after.css to the running page. No src/ file changes. Not a CI proof.
// Run from the repo root, one browser at a time: node docs/design/button-audit/capture.mjs
// It writes to a new temp folder. Add --save to write into pictures/ next to this file, replacing the committed files.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv.includes("--save") ? path.join(dir, "pictures") : mkdtempSync(path.join(tmpdir(), "button-audit-"));
mkdirSync(out, { recursive: true });
console.error(`pictures: ${out}`);
const afterCss = readFileSync(path.join(dir, "after.css"), "utf8");
const sizes = [[390, 844], [844, 390], [1280, 720]];

// A real host for the lobby picture (Start is the one `sea` fill). Rooms go to a temp folder.
const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1298-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: new URL("../../../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: rooms } });
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
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
const out = { browser: browser.version(), sizes: [] };

// Every visible button: its label, box, fill, text, edge, corners, type and focus outline.
const measure = () => {
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  return [...document.querySelectorAll("button, [role=tab]")].filter(visible).map((b) => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      label: (b.getAttribute("aria-label") || b.textContent.trim() || b.tagName).slice(0, 28),
      primitive: b.classList.contains("rounded-control"),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      bg: cs.backgroundColor, color: cs.color, border: cs.borderTopWidth !== "0px" ? cs.borderTopColor : "", radius: cs.borderTopLeftRadius,
      font: `${parseFloat(cs.fontSize)}/${cs.fontWeight}`,
      disabled: b.disabled || b.getAttribute("aria-disabled") === "true" ? (b.disabled ? "native" : "aria") : "",
      pressed: b.getAttribute("aria-pressed"),
      focused: document.activeElement === b ? `${cs.outlineWidth} ${cs.outlineColor}` : "",
    };
  });
};

// A main-phase practice table with pieces and goods: Path is ready, Outpost has no spot, Stronghold is short.
const crafted = async (page, mode) => {
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async (mode) => {
    const game = window.__emberisle;
    const { createGame } = await import("/src/lib/game/board.ts");
    const st = createGame({ seed: 20261107, humans: [{ name: "Jarrod" }, { name: "Josh" }, { name: "Mira" }, { name: "Finn" }], bots: 0 });
    const land = st.vertices.filter((v) => v.hexes.length >= 2);
    const step = Math.floor(land.length / 8);
    st.players.forEach((p, i) => {
      p.resources = { timber: 2, clay: 1, wool: 3, grain: 1, ore: 2 };
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
    game.setState({ state: st, localId: st.current, mode, buildMode: "none", banner: null, error: null, synced: game.getState().synced + 1 });
  }, mode);
  await page.waitForTimeout(1500);
};

try {
  for (const [width, height] of sizes) {
    const phone = width !== 1280;
    const tag = `${width}x${height}`;
    const rec = { size: tag, screens: {} };
    const open = async (name, viewport) => {
      const context = await browser.newContext({ viewport, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
      await page.addInitScript((n) => { localStorage.setItem("emberisle-name", n); Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } }); }, name);
      await page.goto(url);
      await page.waitForFunction(() => !!window.__emberisle);
      return page;
    };
    // The same screen twice: as it is, then with after.css on top.
    const pair = async (page, name) => {
      const shot = (s) => page.screenshot({ path: `${out}/${tag}-${name}-${s}.jpg`, type: "jpeg", quality: 82 });
      const before = await page.evaluate(measure);
      await shot("before");
      const style = await page.addStyleTag({ content: afterCss });
      await page.waitForTimeout(100);
      const after = await page.evaluate(measure);
      await shot("after");
      await style.evaluate((s) => s.remove());
      rec.screens[name] = { before, after };
    };

    // Title: one primary (Play), secondaries (Host, Join), ghosts (Pass this device, How to play, sound).
    const page = await open("Jarrod", { width, height });
    await page.waitForTimeout(500);
    await pair(page, "title");

    // Lobby: Josh joins, one bot, host Ready. Start is the one `sea` fill; Send is ink; the rest outline and ghost.
    await page.evaluate(() => window.__emberisle.getState().hostTable());
    await page.getByTestId("lobby-card").waitFor();
    const code = (await page.getByTestId("table-code").textContent()).trim();
    const guest = await open("Josh", { width: 390, height: 844 });
    await guest.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
    await guest.getByTestId("lobby-card").waitFor();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    await guest.evaluate(() => window.__emberisle.getState().setReady(true));
    await page.getByRole("button", { name: "Ready", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).waitFor();
    await page.waitForTimeout(500);
    await page.mouse.move(0, 0);
    await pair(page, "lobby");
    await guest.context().close();
    await page.context().close();

    // Table, main phase: keyboard focus on the Outpost tile, which is aria-disabled ("No spot") and still inspectable.
    const table = await open("Jarrod", { width, height });
    await crafted(table, "ai");
    for (let i = 0; i < 80; i++) {
      await table.keyboard.press("Tab");
      if (await table.evaluate(() => document.activeElement?.dataset.testid === "build-outpost")) break;
    }
    await pair(table, "table");

    // An incoming offer: Yes is the ink fill, No the secondary, under the trade dock's accent top edge.
    await table.evaluate(() => window.__emberisle.setState({ offer: { tradeId: "design-offer", from: "p2", fromName: "Mira", give: { wool: 2 }, want: { ore: 1 }, until: Date.now() + 60000 }, declined: [] }));
    await table.locator('[data-testid="trade-dock"], .trade-dock').first().waitFor();
    await table.waitForTimeout(400);
    await pair(table, "offer");
    await table.evaluate(() => window.__emberisle.setState({ offer: null }));

    // The table menu: ghost rows, a Water and View pair of default/ghost toggles, the glass trigger.
    await table.getByRole("button", { name: "Table menu", exact: true }).click();
    await table.getByTestId("table-menu").waitFor();
    await table.waitForTimeout(300);
    await pair(table, "menu");
    await table.keyboard.press("Escape");

    // Results: a hotseat win, so Play again is the fill and Back to menu the secondary.
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
    await pair(table, "results");
    await table.context().close();

    for (const [name, s] of Object.entries(rec.screens)) {
      const fills = (list) => new Set(list.filter((b) => b.primitive).map((b) => `${b.bg}|${b.color}|${b.border}`)).size;
      const fonts = (list) => [...new Set(list.filter((b) => b.primitive).map((b) => b.font))].sort();
      const bg = (list) => list.filter((b) => b.primitive).map((b) => b.bg);
      if (bg(s.before).join() !== bg(s.after).join()) throw new Error(`${tag} ${name}: a fill changed`);
      s.summary = { buttons: s.after.length, primitive: s.after.filter((b) => b.primitive).length, looksBefore: fills(s.before), looksAfter: fills(s.after), fontsBefore: fonts(s.before), fontsAfter: fonts(s.after), under44: s.after.filter((b) => b.w < 44 || b.h < 44).map((b) => `${b.label} ${b.w}x${b.h}`), focused: s.after.find((b) => b.focused)?.label ?? "" };
      console.log(tag, name, JSON.stringify(s.summary));
    }
    out.sizes.push(rec);
  }
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
out.errors = errors;
writeFileSync(`${out}/measurements.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
