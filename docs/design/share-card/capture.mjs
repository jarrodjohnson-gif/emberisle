// #1454 design capture: share-your-game cards (1080x1350 feed, 1080x1920 story, 4p & 6p, Options A & B)
// plus real 390x844 WinScreen button placement comparison (Option A vs Option B).
// No src/ changes. Not a CI proof. Run from repo root with Playwright lock:
//   node --import ./server/register.mjs docs/design/share-card/capture.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { applyAction, totalVP, victoryTarget } from "../../../src/lib/game/rules.ts";
import { chooseBotAction } from "../../../src/lib/game/ai.ts";
import { createAnyGame } from "../../../src/lib/game/expanded.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(dir, { recursive: true });

// Deterministic RNG for repeatable real finished games.
let rngState = 1;
const nextWord = () => {
  rngState ^= rngState << 13;
  rngState >>>= 0;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState;
};
crypto.getRandomValues = (buf) => {
  for (let i = 0; i < buf.length; i++) buf[i] = nextWord();
  return buf;
};
const reseed = (seed) => {
  rngState = (Math.imul(seed + 1, 2654435761) >>> 0) || 1;
};

function playFinishedGame(names, seed) {
  reseed(seed);
  const humans = names.map((name) => ({ name }));
  let g = createAnyGame({ humans, bots: 0, seed });
  for (const p of g.players) p.kind = "bot";
  let steps = 0;
  while (g.phase !== "over" && steps < 4000) {
    const actor = g.phase === "discard"
      ? Object.keys(g.discardNeeded).find((id) => g.discardNeeded[id] > 0) ?? g.current
      : g.current;
    let action = chooseBotAction(g, actor);
    let res = applyAction(g, actor, action);
    if (res.error) {
      res = applyAction(g, actor, { type: "endTurn" });
    }
    if (res.error) throw new Error(`stuck at step ${steps}: ${res.error}`);
    g = res.state;
    steps++;
  }
  if (g.phase !== "over") throw new Error(`game did not finish in ${steps} steps`);
  for (const p of g.players) p.kind = "human";
  return g;
}

function buildRows(g, awardPool) {
  const winner = g.players.find((p) => p.id === g.winner);
  const sorted = [...g.players]
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      vp: totalVP(g, p.id),
      isWinner: p.id === winner.id,
      longestRoad: g.longestRoad === p.id,
      largestArmy: g.largestArmy === p.id,
      outposts: g.vertices.filter((v) => v.building?.playerId === p.id && v.building.kind === "outpost").length,
      strongholds: g.vertices.filter((v) => v.building?.playerId === p.id && v.building.kind === "stronghold").length,
    }))
    .sort((a, b) => Number(b.isWinner) - Number(a.isWinner) || b.vp - a.vp);

  return sorted.map((row, idx) => ({
    ...row,
    rank: idx + 1,
    award: awardPool[idx] ?? null,
  }));
}

const g4 = playFinishedGame(["Jarrod", "Josh", "Maya", "Elena"], 1454);
const g6 = playFinishedGame(["Jarrod", "Josh", "Maya", "Elena", "Moss", "Flint"], 1456);

const rows4 = buildRows(g4, [
  "Crown winner · Built an outpost",
  "Trade broker · 4 table trades",
  "Wayfarer's target · Hit 5 times",
  "Brick baron · 14 brick rolled",
]);

const rows6 = buildRows(g6, [
  "Crown winner · Expanded table",
  "Road builder · 11 trails laid",
  "Trade broker · 3 table trades",
  "Wool baron · 12 sheep rolled",
  "Hit by 7s · Discarded 9 goods",
  "Quiet harbour · 2 dock deals",
]);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function dotStyle(hex) {
  const needsRing = hex.toLowerCase() === "#f3ecd9";
  return `background:${hex};${needsRing ? "border:2px solid #78837a;" : "border:2px solid rgba(38,61,60,0.16);"}`;
}

function renderCardOptionA({ width, height, rows, islandUrl, turns, target, code, seatCount }) {
  const isStory = height > 1500;
  const isSix = seatCount > 4;
  const winner = rows[0];
  const padTop = isStory ? 110 : 44;
  const padBottom = isStory ? 110 : 40;
  const boardH = isStory ? (isSix ? 640 : 720) : (isSix ? 500 : 540);
  const gridCols = isSix && !isStory ? "grid-template-columns: 1fr 1fr; gap: 14px;" : "grid-template-columns: 1fr; gap: 12px;";
  const rowPad = isSix && !isStory ? "14px 18px" : isSix ? "16px 24px" : isStory ? "22px 26px" : "18px 24px";

  const rowsHtml = rows.map((r) => `
    <div class="row ${r.isWinner ? "winner" : ""}" style="padding:${rowPad}">
      <div class="row-left">
        <span class="dot" style="${dotStyle(r.color)}"></span>
        <div class="row-text">
          <div class="name-line">
            <span class="name">${esc(r.name)}</span>
            ${r.isWinner ? `<span class="badge-win">Winner</span>` : ""}
            ${r.longestRoad ? `<span class="badge-meta">Path</span>` : ""}
            ${r.largestArmy ? `<span class="badge-meta">Army</span>` : ""}
          </div>
          ${r.award ? `<div class="award">${esc(r.award)}</div>` : ""}
        </div>
      </div>
      <div class="score">${r.vp}<span class="pts">VP</span></div>
    </div>
  `).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: linear-gradient(165deg, #1b5e67 0%, #158e9a 48%, #214e52 100%);
    color: #263d3c;
    display: flex;
    flex-direction: column;
    padding: ${padTop}px 48px ${padBottom}px 48px;
  }
  .card {
    flex: 1;
    background: #ffffff;
    border-radius: 36px;
    border: 2px solid rgba(203, 207, 198, 0.9);
    box-shadow: 0 28px 64px rgba(13, 41, 45, 0.34);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .header {
    padding: ${isStory ? "34px 40px 26px" : "26px 36px 20px"};
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #e3e7e2;
    background: #f8faf9;
  }
  .brand {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .brand-kicker {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #246d72;
  }
  .headline {
    font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
    font-size: ${isStory ? "44px" : "38px"};
    font-weight: 800;
    line-height: 1.1;
    color: #162423;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .head-dot {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    display: inline-block;
    flex: none;
  }
  .meta-pill {
    background: #eef4f3;
    border: 1px solid #cbcfc6;
    border-radius: 16px;
    padding: 12px 20px;
    text-align: right;
    font-size: 18px;
    font-weight: 600;
    color: #263d3c;
    line-height: 1.35;
  }
  .meta-sub {
    font-size: 15px;
    font-weight: 500;
    color: #555e58;
  }
  .island-wrap {
    height: ${boardH}px;
    width: 100%;
    position: relative;
    background: #158e9a;
    overflow: hidden;
    border-bottom: 1px solid #e3e7e2;
  }
  .island-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 48%;
    display: block;
  }
  .island-tag {
    position: absolute;
    bottom: 18px;
    left: 24px;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid #cbcfc6;
    border-radius: 999px;
    padding: 8px 18px;
    font-size: 16px;
    font-weight: 700;
    color: #263d3c;
  }
  .standings {
    flex: 1;
    padding: ${isStory ? "28px 36px 20px" : "22px 32px 16px"};
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: #ffffff;
  }
  .section-label {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #555e58;
  }
  .rows {
    display: grid;
    ${gridCols}
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid #d9ded9;
    border-radius: 18px;
    background: #fbfcfb;
  }
  .row.winner {
    background: #f0f7f6;
    border: 2px solid #246d72;
  }
  .row-left {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .dot {
    width: 20px;
    height: 20px;
    border-radius: 999px;
    flex: none;
  }
  .row-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .name-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .name {
    font-size: ${isSix && !isStory ? "21px" : "24px"};
    font-weight: 750;
    color: #162423;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badge-win {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    background: #246d72;
    padding: 3px 10px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex: none;
  }
  .badge-meta {
    font-size: 12px;
    font-weight: 700;
    color: #246d72;
    background: #e1f0ef;
    padding: 2px 8px;
    border-radius: 999px;
    flex: none;
  }
  .award {
    font-size: ${isSix && !isStory ? "15px" : "17px"};
    font-weight: 500;
    color: #555e58;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .score {
    font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
    font-size: ${isSix && !isStory ? "30px" : "34px"};
    font-weight: 800;
    color: #162423;
    font-variant-numeric: tabular-nums;
    display: flex;
    align-items: baseline;
    gap: 4px;
    flex: none;
  }
  .pts {
    font-size: 14px;
    font-weight: 700;
    color: #555e58;
  }
  .footer {
    padding: 18px 36px;
    background: #f3f6f5;
    border-top: 1px solid #d9ded9;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 18px;
    font-weight: 600;
    color: #263d3c;
  }
  .footer-url {
    color: #246d72;
    font-weight: 700;
  }
</style>
</head>
<body>
  <div class="card">
    <header class="header">
      <div class="brand">
        <span class="brand-kicker">Emberisle · ${seatCount}-Player Island</span>
        <div class="headline">
          <span class="head-dot" style="${dotStyle(winner.color)}"></span>
          <span>${esc(winner.name)} wins</span>
        </div>
      </div>
      <div class="meta-pill">
        <div>${winner.vp} pts · Target ${target}</div>
        <div class="meta-sub">${turns} turns · Table ${esc(code)}</div>
      </div>
    </header>
    <div class="island-wrap">
      <img src="${islandUrl}" alt="Final Emberisle board" />
      <div class="island-tag">Final board · ${seatCount === 6 ? "30-hex expanded island" : "19-hex classic island"}</div>
    </div>
    <section class="standings">
      <div class="section-label">Standings &amp; Island Awards</div>
      <div class="rows">${rowsHtml}</div>
    </section>
    <footer class="footer">
      <span>Play with friends in the browser</span>
      <span class="footer-url">emberisle.app</span>
    </footer>
  </div>
</body>
</html>`;
}

function renderCardOptionB({ width, height, rows, islandUrl, turns, target, code, seatCount }) {
  const winner = rows[0];
  const rowsHtml = rows.map((r) => `
    <div class="row ${r.isWinner ? "winner" : ""}">
      <div class="row-left">
        <span class="dot" style="${dotStyle(r.color)}"></span>
        <div class="row-text">
          <div class="name-line">
            <span class="name">${esc(r.name)}</span>
            ${r.isWinner ? `<span class="badge-win">Winner</span>` : ""}
          </div>
          ${r.award ? `<div class="award">${esc(r.award)}</div>` : ""}
        </div>
      </div>
      <div class="score">${r.vp}<span class="pts">VP</span></div>
    </div>
  `).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    position: relative;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #b7e0dc;
    color: #263d3c;
  }
  .bg {
    position: absolute;
    left: 0;
    right: 0;
    top: -150px;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center center;
  }
  .top-pill {
    position: absolute;
    top: 40px;
    left: 44px;
    right: 44px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .chip {
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid #cbcfc6;
    border-radius: 999px;
    padding: 12px 24px;
    font-size: 19px;
    font-weight: 800;
    color: #162423;
    box-shadow: 0 10px 28px rgba(13, 41, 45, 0.22);
  }
  .tray {
    position: absolute;
    left: 40px;
    right: 40px;
    bottom: 40px;
    background: rgba(255, 255, 255, 0.96);
    border: 2px solid #cbcfc6;
    border-radius: 32px;
    padding: 30px 34px 24px;
    box-shadow: 0 24px 60px rgba(13, 41, 45, 0.34);
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .tray-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .headline {
    font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
    font-size: 42px;
    font-weight: 800;
    color: #162423;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .head-dot {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    display: inline-block;
  }
  .sub {
    font-size: 19px;
    font-weight: 600;
    color: #555e58;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 15px 22px;
    border-radius: 16px;
    background: #f5f7f6;
    border: 1px solid #d9ded9;
  }
  .row.winner {
    background: #edf6f5;
    border: 2px solid #246d72;
  }
  .row-left { display: flex; align-items: center; gap: 14px; }
  .dot { width: 18px; height: 18px; border-radius: 999px; }
  .row-text { display: flex; flex-direction: column; gap: 2px; }
  .name-line { display: flex; align-items: center; gap: 8px; }
  .name { font-size: 23px; font-weight: 750; color: #162423; }
  .badge-win {
    font-size: 13px; font-weight: 700; color: #fff; background: #246d72;
    padding: 3px 10px; border-radius: 999px; text-transform: uppercase;
  }
  .award { font-size: 16px; color: #555e58; }
  .score { font-family: ui-rounded, system-ui, sans-serif; font-size: 32px; font-weight: 800; color: #162423; }
  .pts { font-size: 14px; color: #555e58; margin-left: 4px; }
  .tray-foot {
    display: flex;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid #d9ded9;
    font-size: 17px;
    font-weight: 600;
    color: #555e58;
  }
  .url { color: #246d72; font-weight: 700; }
</style>
</head>
<body>
  <img class="bg" src="${islandUrl}" alt="Full-bleed final island" />
  <div class="top-pill">
    <div class="chip">Emberisle · ${seatCount}-Player Island</div>
    <div class="chip">Table ${esc(code)} · ${turns} turns</div>
  </div>
  <div class="tray">
    <div class="tray-head">
      <div class="headline">
        <span class="head-dot" style="${dotStyle(winner.color)}"></span>
        <span>${esc(winner.name)} wins</span>
      </div>
      <div class="sub">${winner.vp} points · target ${target}</div>
    </div>
    <div class="rows">${rowsHtml}</div>
    <div class="tray-foot">
      <span>Option B · Full-bleed island poster</span>
      <span class="url">emberisle.app</span>
    </div>
  </div>
</body>
</html>`;
}

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
let browser;
try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  const appUrl = `http://127.0.0.1:${port}/`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });

  async function captureIsland(game, width, height) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(appUrl);
    await page.waitForFunction(() => !!window.__emberisle);
    await page.evaluate((g) => {
      const s = window.__emberisle;
      s.setState({ spectator: false, isHost: true, menuFor: null, chatOpen: false });
      s.getState().loadState(g, "p0", true, "SHAR");
    }, game);
    await page.waitForFunction(() => !!window.__isle);
    await page.locator('[data-testid="win-look"]').waitFor({ timeout: 15000 });
    await page.locator('[data-testid="win-look"]').click();
    // Hide all HUD overlays so only the clean 3D rendered ocean & island remain for the card graphic.
    await page.addStyleTag({ content: `#root > div > :not(canvas), [data-testid="win-chip"], [data-testid="seat-rail"], [data-testid="seat-strip"], header, nav, aside { opacity: 0 !important; pointer-events: none !important; }` });
    // Let the renderer draw several settled frames after hiding the sheet.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250))))));
    const buf = await page.screenshot({ type: "png" });
    await context.close();
    return `data:image/png;base64,${buf.toString("base64")}`;
  }

  console.log("Capturing live 3D islands (4p classic and 6p expanded)...");
  const island4p = await captureIsland(g4, 1080, 760);
  const island6p = await captureIsland(g6, 1080, 760);
  const island4pTall = await captureIsland(g4, 1080, 1350);

  async function renderPng(html, width, height, filename) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const outPath = path.join(dir, filename);
    await page.screenshot({ path: outPath, type: "png" });
    await context.close();
    console.log(`wrote ${filename} (${width}x${height})`);
  }

  await renderPng(renderCardOptionA({ width: 1080, height: 1350, rows: rows4, islandUrl: island4p, turns: g4.turn, target: victoryTarget(g4), code: "SHAR", seatCount: 4 }), 1080, 1350, "card-1080x1350-4p.png");
  await renderPng(renderCardOptionA({ width: 1080, height: 1350, rows: rows6, islandUrl: island6p, turns: g6.turn, target: victoryTarget(g6), code: "EXPN", seatCount: 6 }), 1080, 1350, "card-1080x1350-6p.png");
  await renderPng(renderCardOptionA({ width: 1080, height: 1920, rows: rows4, islandUrl: island4p, turns: g4.turn, target: victoryTarget(g4), code: "SHAR", seatCount: 4 }), 1080, 1920, "card-1080x1920-4p.png");
  await renderPng(renderCardOptionA({ width: 1080, height: 1920, rows: rows6, islandUrl: island6p, turns: g6.turn, target: victoryTarget(g6), code: "EXPN", seatCount: 6 }), 1080, 1920, "card-1080x1920-6p.png");
  await renderPng(renderCardOptionB({ width: 1080, height: 1350, rows: rows4, islandUrl: island4pTall, turns: g4.turn, target: victoryTarget(g4), code: "SHAR", seatCount: 4 }), 1080, 1350, "card-1080x1350-option-b.png");

  // Real 390x844 WinScreen button placement comparison (Option A vs Option B).
  async function captureWinScreenVariant(variant) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce", deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(appUrl);
    await page.waitForFunction(() => !!window.__emberisle);
    await page.evaluate((g) => {
      const s = window.__emberisle;
      const seats = g.players.map((p, i) => ({ id: `s${i}`, name: p.name, color: p.color, ready: true, host: i === 0, player: p.id, again: i < 2 }));
      s.setState({ spectator: false, isHost: true, seatId: "s0", seats, menuFor: null, chatOpen: false });
      s.getState().loadState(g, "p0", true, "SHAR");
    }, g4);
    await page.locator('[data-testid="win-row"]').first().waitFor({ timeout: 15000 });
    await page.evaluate((mode) => {
      const look = document.querySelector('[data-testid="win-look"]');
      if (!look) throw new Error("win-look missing");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = look.className;
      btn.setAttribute("data-testid", "win-share-mock");
      btn.textContent = "Share";
      btn.style.boxShadow = "0 0 0 2px #246d72";
      if (mode === "A") {
        look.parentElement.insertBefore(btn, look);
      } else {
        const headRow = document.querySelector("#win-headline")?.parentElement;
        if (!headRow) throw new Error("win-headline missing");
        headRow.style.justifyContent = "space-between";
        btn.className = btn.className.replace(/\bflex-1\b/g, "");
        btn.style.minHeight = "44px";
        btn.style.padding = "0 14px";
        btn.style.marginLeft = "auto";
        btn.style.flex = "none";
        headRow.appendChild(btn);
      }
    }, variant);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 200)))));
    const buf = await page.screenshot({ type: "png" });
    await context.close();
    return `data:image/png;base64,${buf.toString("base64")}`;
  }

  console.log("Capturing real 390x844 WinScreen button placement options...");
  const shotA = await captureWinScreenVariant("A");
  const shotB = await captureWinScreenVariant("B");

  const compareHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 900px;
    height: 1010px;
    background: #f1efe9;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #162423;
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .title { font-size: 22px; font-weight: 800; }
  .sub { font-size: 14px; color: #555e58; margin-top: 2px; }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
    flex: 1;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }
  .label {
    font-size: 15px;
    font-weight: 700;
    color: #246d72;
    background: #ffffff;
    border: 1px solid #cbcfc6;
    border-radius: 999px;
    padding: 6px 16px;
  }
  .frame {
    width: 390px;
    height: 844px;
    border-radius: 28px;
    overflow: hidden;
    border: 3px solid #263d3c;
    box-shadow: 0 14px 36px rgba(13, 41, 45, 0.2);
  }
  .frame img { width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
  <div>
    <div class="title">WinScreen Share Button Placement (390 × 844 phone)</div>
    <div class="sub">Outlined in sea teal: Option A sits beside Hide scores in .win-actions; Option B sits in the sheet header.</div>
  </div>
  <div class="grid">
    <div class="col">
      <div class="label">Option A — Action bar (Recommended)</div>
      <div class="frame"><img src="${shotA}" alt="Option A" /></div>
    </div>
    <div class="col">
      <div class="label">Option B — Sheet header</div>
      <div class="frame"><img src="${shotB}" alt="Option B" /></div>
    </div>
  </div>
</body>
</html>`;

  await renderPng(compareHtml, 900, 1010, "winscreen-share-button-390x844.png");
  console.log("share-card capture complete");
} finally {
  await browser?.close();
  await vite?.close();
}
