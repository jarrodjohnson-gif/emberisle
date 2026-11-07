// #1301 design capture: the seats and the player menu in the real game, before and after after.css, at 390x844,
// 844x390 and 1280x720: own seat, an opponent, a watcher, a long name, Dune on turn, and a seat with nothing.
// No src/ file changes. Not a CI proof. Run from the repo root, one browser at a time: node docs/design/seat-details-1274/capture.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const dir = "docs/design/seat-details-1274";
mkdirSync(`${dir}/pictures`, { recursive: true });
const afterCss = readFileSync(`${dir}/after.css`, "utf8");
const sizes = [[390, 844], [844, 390], [1280, 720]];

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const out = { browser: browser.version(), runs: [] };

// Jarrod (own seat, on turn, one hidden point), Bartholomew (a long name, largest army), Mira (Dune), Finn (no pieces, no goods).
const crafted = async (page) => {
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  await page.evaluate(async () => {
    const game = window.__emberisle;
    const { createGame } = await import("/src/lib/game/board.ts");
    const st = createGame({ seed: 20261107, humans: [{ name: "Jarrod" }, { name: "Bartholomew Longfellow" }, { name: "Mira" }, { name: "Finn" }], bots: 0 });
    const land = st.vertices.filter((v) => v.hexes.length >= 2);
    const step = Math.floor(land.length / 8);
    st.players.forEach((p, i) => {
      if (i === 3) { p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 }; return; }
      p.resources = { timber: 2, clay: 1, wool: 3, grain: 1, ore: 2 };
      for (let k = 0; k < 2; k++) {
        const v = land[(i * 2 + k) * step];
        v.building = { playerId: p.id, kind: k ? "stronghold" : "outpost" };
        const e = st.edges.find((e) => (e.va === v.id || e.vb === v.id) && !e.path);
        if (e) e.path = p.id;
      }
    });
    st.players[0].hidden = { knight: 1, road: 0, plenty: 0, monopoly: 0, vp: 1 };
    st.players[1].knightsPlayed = 3;
    st.largestArmy = st.players[1].id;
    st.phase = "main";
    st.current = st.players[0].id;
    st.dice = [3, 5];
    st.seq++;
    game.setState({ state: st, localId: st.players[0].id, mode: "ai", buildMode: "none", banner: null, error: null, synced: game.getState().synced + 1 });
  });
  await page.waitForTimeout(1500);
};

// The seats' boxes and text, the hint, and the open menu's rows and facts.
const measure = () => {
  const r = (el) => { const b = el.getBoundingClientRect(); return [+b.x.toFixed(1), +b.y.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)]; };
  const shown = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const seats = [...document.querySelectorAll('[data-testid^="rail-p"], [data-testid^="seat-p"]')].map((el) => ({ id: el.dataset.testid, box: r(el), text: el.textContent.replace(/\s+/g, " ").trim().slice(0, 60) }));
  const menu = document.querySelector('[data-testid="player-menu"]');
  const hint = [...document.querySelectorAll('[data-testid="hidden-point-hint"]')].filter(shown);
  return {
    seats,
    hintShown: hint.length,
    menu: menu && {
      box: r(menu), label: menu.getAttribute("aria-label"), radius: getComputedStyle(menu).borderTopLeftRadius, padding: getComputedStyle(menu).padding,
      heading: menu.querySelector('[data-testid="menu-seat"]')?.textContent.trim() ?? null,
      facts: [...menu.querySelectorAll('[data-testid="menu-facts"] > div')].map((d) => `${d.querySelector("dt").textContent}: ${d.querySelector("dd").textContent}`),
      score: [...menu.querySelectorAll('[data-testid="score-breakdown"] dt')].map((dt) => `${dt.textContent}: ${dt.nextElementSibling.textContent}`),
      ledgerNote: getComputedStyle(menu.querySelector('[data-testid="score-breakdown"]'), "::after").content,
      privateRows: menu.querySelectorAll('[data-testid="private-points"], [data-testid="private-total"]').length,
      rows: [...menu.querySelectorAll("button")].map((b) => ({ text: b.textContent.trim(), h: +b.getBoundingClientRect().height.toFixed(1), font: parseFloat(getComputedStyle(b).fontSize) })),
      focusInside: menu.contains(document.activeElement),
      inView: r(menu)[1] >= 0 && r(menu)[1] + r(menu)[3] <= innerHeight + 0.5,
    },
  };
};

try {
  for (const [width, height] of sizes) {
    const phone = width !== 1280;
    const tag = `${width}x${height}`;
    for (const variant of ["before", "after"]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
      await page.addInitScript(() => localStorage.setItem("emberisle-name", "Jarrod"));
      await page.goto(url);
      await page.waitForFunction(() => !!window.__emberisle);
      await crafted(page);
      if (variant === "after") await page.addStyleTag({ content: afterCss });
      await page.waitForTimeout(200);
      const ids = await page.evaluate(() => window.__emberisle.getState().state.players.map((p) => p.id));
      const shot = (name) => page.screenshot({ path: `${dir}/pictures/${tag}-${name}-${variant}.jpg`, type: "jpeg", quality: 82 });
      const rec = { size: tag, variant, screens: {} };
      rec.screens.rail = await page.evaluate(measure);
      await shot("rail");

      // Open each seat's menu from its card, as a player does; the other seats must not move.
      const open = async (name, id, watcher = false) => {
        if (watcher) await page.evaluate(() => window.__emberisle.setState({ spectator: true }));
        const closed = await page.evaluate(measure);
        await page.locator(`[data-menu-trigger="${id}"]`).click();
        await page.getByTestId("player-menu").waitFor();
        await page.waitForTimeout(300);
        const m = await page.evaluate(measure);
        m.seatsMoved = m.seats.filter((s, i) => s.box.join() !== closed.seats[i].box.join()).map((s) => s.id);
        await shot(name);
        await page.keyboard.press("Escape");
        await page.getByTestId("player-menu").waitFor({ state: "detached" });
        m.focusAfterEscape = await page.evaluate((id) => document.activeElement?.dataset.menuTrigger === id, id);
        if (watcher) await page.evaluate(() => window.__emberisle.setState({ spectator: false }));
        rec.screens[name] = m;
      };
      await open("own", ids[0]);
      await open("opponent", ids[2]);
      await open("empty", ids[3]);
      await open("watcher", ids[1], true);
      for (const [name, s] of Object.entries(rec.screens)) {
        if (!s.menu) continue;
        if (name !== "own" && s.menu.privateRows) throw new Error(`${tag} ${variant} ${name}: private points shown`);
        console.log(tag, variant, name, JSON.stringify({ moved: s.seatsMoved, box: s.menu.box, facts: s.menu.facts.length, score: s.menu.score.length, note: s.menu.ledgerNote !== "none", rows: s.menu.rows.map((x) => x.text.slice(0, 18)), focus: [s.menu.focusInside, s.focusAfterEscape], inView: s.menu.inView }));
      }
      out.runs.push(rec);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await vite.close();
}
out.errors = errors;
writeFileSync(`${dir}/pictures/measurements.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
