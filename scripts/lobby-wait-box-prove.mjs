// #1262: the Play games shelf and Sandwich Stacker, in a real tab through the Vite dev server.
// Checks the two lobby tabs, the shelf, the open game fully above the footer at 390x844 and 1280x720,
// 44 px targets, 8 px gaps, text contrast, Start closing the game, and Ready leaving it open.
// Ruffle is a script tag, never a static import. Pictures: docs/proofs/1262/.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const out = process.env.LOBBY_PROOF_OUT || "docs/proofs/1262";
mkdirSync(out, { recursive: true });

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) walk(file, acc);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name)) acc.push(file);
  }
  return acc;
}
const importRuffle = /(?:import\s*\(|from\s+|require\s*\()\s*["'][^"']*ruffle[^"']*["']/;
for (const file of walk("src")) {
  assert.doesNotMatch(readFileSync(file, "utf8"), importRuffle, `${file} imports Ruffle`);
}
const waitSrc = readFileSync("src/components/game/LobbyWaitBox.tsx", "utf8");
assert.match(waitSrc, /script\.src\s*=\s*`\$\{base\}minigames\/ruffle\/ruffle\.js`/);
assert.match(waitSrc, /allowScriptAccess:\s*false/);
assert.match(waitSrc, /allowNetworking:\s*"none"/);
assert.match(waitSrc, /volume:\s*0/);
assert.doesNotMatch(readFileSync("src/components/game/chunks.ts", "utf8"), /LobbyWaitBox/);
assert.doesNotMatch(readFileSync("vite.config.ts", "utf8"), importRuffle);
if (existsSync("dist/assets")) {
  for (const file of readdirSync("dist/assets").filter((name) => name.endsWith(".js"))) {
    const text = readFileSync(`dist/assets/${file}`, "utf8");
    assert.doesNotMatch(text, /@ruffle-rs\/ruffle/, `${file} names the Ruffle package`);
    if (!file.startsWith("LobbyWaitBox-")) assert.doesNotMatch(text, /minigames\/ruffle\/ruffle\.js/, `${file} points at Ruffle`);
  }
}
console.log("ok  source graph: Ruffle is not imported");

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1262-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
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
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
});
const problems = [];
const requests = [];

function assertNoRuffleModule() {
  for (const id of vite.moduleGraph.idToModuleMap.keys()) {
    assert.ok(!id.includes("@ruffle-rs/ruffle") && !id.includes("ruffle.js"), `Ruffle entered the Vite module graph: ${id}`);
  }
}

async function client(viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: touch ? "coarse" : "fine" }] });
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("requestfailed", (r) => problems.push(`failed ${r.url()}`));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  page.on("request", (r) => requests.push(r.url()));
  await page.addInitScript((name) => localStorage.setItem("emberisle-name", name), "Jarrod");
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  await page.evaluate(() => window.__emberisle.getState().hostTable());
  await page.getByTestId("lobby-card").waitFor();
  return page;
}

async function until(fn, what, ms = 25000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out: ${typeof what === "function" ? await what() : what}`);
}

const minigames = () => requests.filter((item) => item.includes("/minigames/"));
// Ruffle names the first player ruffle-player and the next ruffle-player-1, after the first was removed.
const ruffleCount = (page) => page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => /^RUFFLE-PLAYER/.test(el.tagName)).length);

async function openShelf(page) {
  await page.getByRole("button", { name: "Play games" }).click();
  await page.locator(".ls").waitFor();
  await logo(page, ".lt", "shelf");
}

async function openStacker(page) {
  await page.locator(".lt button").click();
  await page.getByTestId("lobby-wait").waitFor();
  await until(async () => (await page.getByTestId("lobby-wait-status").textContent()) !== "Loading…", "Sandwich Stacker left Loading");
  const status = await page.getByTestId("lobby-wait-status").textContent();
  assert.ok(!status.includes("Couldn't"), `Sandwich Stacker failed to load (${status})`);
  await until(async () => (await ruffleCount(page)) === 1, "one ruffle player");
  await logo(page, ".lobby-wait-head", "header");
}

// #1280: the original captured art loads only with the shelf and is never stretched.
async function logo(page, selector, label) {
  const image = page.locator(selector).getByRole("img", { name: "Sandwich Stacker", exact: true });
  await image.waitFor();
  await image.evaluate((el) => el.decode());
  const m = await image.evaluate((el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return { natural: [el.naturalWidth, el.naturalHeight], complete: el.complete,
      fit: s.objectFit, x: r.x, y: r.y, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height, viewport: [innerWidth, innerHeight] };
  });
  assert.equal(m.complete, true, `${label}: logo loaded`);
  assert.deepEqual(m.natural, [240, 210], `${label}: original captured art dimensions`);
  assert.equal(m.fit, "contain", `${label}: logo preserves its natural aspect ratio`);
  assert.ok(m.width > 0 && m.height > 0 && m.x >= 0 && m.y >= 0 && m.right <= m.viewport[0] && m.bottom <= m.viewport[1], `${label}: logo visible inside viewport ${JSON.stringify(m)}`);
  const box = page.locator(selector);
  if (label === "shelf") {
    assert.equal(await box.getAttribute("aria-label"), "Sandwich Stacker", "shelf tile accessible name");
    const target = await box.locator("button").boundingBox();
    assert.ok(target.width >= 44 && target.height >= 44, "shelf Play target at least 44px");
  }
  console.log(`ok  ${m.viewport.join("x")} ${label}: captured logo loaded, contained and named ${JSON.stringify(m)}`);
  await page.screenshot({ path: `${out}/logo-${label}-${m.viewport.join("x")}.png` });
}

function lum(rgb) {
  const [r, g, b] = rgb.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function contrast(page, label) {
  const rows = await page.evaluate(() => {
    const px = (css) => {
      const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      c.fillStyle = "#000";
      c.fillStyle = css;
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data];
    };
    const bgOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const got = px(getComputedStyle(n).backgroundColor);
        if (got[3] > 200) return got.slice(0, 3);
      }
      return [243, 246, 245];
    };
    const seen = [];
    for (const el of document.querySelectorAll(".ly *, .lm button, .lm button span")) {
      let host = false;
      for (let n = el; n; n = n.parentElement) if (/^RUFFLE-PLAYER/.test(n.tagName)) host = true;
      if (host || el.children.length) continue;
      const text = el.textContent.trim();
      if (!text) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const s = getComputedStyle(el);
      seen.push({ text, fg: px(s.color).slice(0, 3), bg: bgOf(el) });
    }
    return seen;
  });
  assert.ok(rows.length > 0, `${label}: contrast found text`);
  for (const row of rows) assert.ok(ratio(row.fg, row.bg) >= 4.5, `${label}: "${row.text}" contrast ${ratio(row.fg, row.bg).toFixed(2)}`);
}

async function geometry(page, label) {
  const data = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const card = document.querySelector('[data-testid="lobby-card"]');
    const foot = document.querySelector('[data-testid="lobby-actions"]');
    const wait = document.querySelector('[data-testid="lobby-wait"]');
    const stage = document.querySelector('[data-testid="lobby-wait-stage"]');
    const controls = [...card.querySelectorAll("button, input, [role=tab]")].filter((el) => el.getBoundingClientRect().width > 0);
    return {
      wait: rect(wait), foot: rect(foot), stage: rect(stage),
      viewH: innerHeight, viewW: innerWidth,
      controls: controls.map((el) => ({ label: el.getAttribute("aria-label") || el.textContent.trim(), ...rect(el) })),
    };
  });
  assert.ok(data.wait.bottom <= data.foot.y + 0.5, `${label}: game bottom ${data.wait.bottom} above footer ${data.foot.y}`);
  assert.ok(data.stage.bottom <= data.foot.y + 0.5, `${label}: stage above the footer`);
  assert.ok(data.wait.y >= 0 && data.wait.x >= 0 && data.wait.bottom <= data.viewH + 0.5 && data.wait.right <= data.viewW + 0.5, `${label}: game inside the viewport ${JSON.stringify(data.wait)} view ${data.viewW}x${data.viewH}`);
  assert.ok(Math.abs(data.stage.width / data.stage.height - 580 / 320) < 0.02, `${label}: stage 580:320 (${data.stage.width}x${data.stage.height})`);
  for (const c of data.controls) assert.ok(c.width >= 44 && c.height >= 44, `${label}: ${c.label} target ${c.width}x${c.height}`);
  for (let i = 0; i < data.controls.length; i++) for (const b of data.controls.slice(i + 1)) {
    const a = data.controls[i];
    const gap = Math.max(b.x - a.right, a.x - b.right, b.y - a.bottom, a.y - b.bottom);
    assert.ok(gap >= 7.99, `${label}: ${a.label} / ${b.label} gap ${gap}`);
  }
}

try {
  const desk = await client({ width: 1280, height: 720 }, false);
  assert.equal(await desk.locator(".lm button").count(), 2, "two lobby controls");
  assert.equal(await desk.getByTestId("lobby-chat").getByRole("tab").count(), 2, "chat still has two tabs");
  assert.equal(await desk.getByRole("tab").count(), 2, "the page still has the two chat tabs");
  assert.equal(await desk.locator(".ls").count(), 0);
  assert.equal(await desk.getByTestId("lobby-players").count(), 1);
  await desk.evaluate(() => document.fonts.ready);
  assert.equal(minigames().length, 0, "nothing under /minigames/ before a game opens");
  assert.ok(!requests.some((r) => r.includes("sandwich-stacker-logo.png")), "logo is not fetched on the Table tab");
  assert.equal(await desk.locator("ruffle-player, script[src*='ruffle']").count(), 0);
  assert.equal(await desk.getByRole("button", { name: "Table", exact: true }).getAttribute("aria-pressed"), "true");
  await desk.getByTestId("add-bot").first().click();
  await desk.getByTestId("add-bot").first().click();
  await desk.waitForFunction(() => window.__emberisle.getState().seats.length === 3);

  await openShelf(desk);
  assert.equal(await desk.getByRole("heading", { name: "While you wait" }).count(), 1);
  assert.equal(await desk.locator(".lt").getByText("Sandwich Stacker", { exact: true }).count(), 1);
  assert.equal(await desk.locator(".lt").getByText("Solo", { exact: true }).count(), 1);
  assert.equal(await desk.locator(".lt button").count(), 1);
  assert.equal(await desk.getByText("Trivia").count(), 0);
  assert.equal(await desk.getByTestId("ttt-tile").getByText("Tic-tac-toe", { exact: true }).count(), 1);
  assert.equal(await desk.getByTestId("lobby-players").count(), 0);
  assert.equal(await desk.getByTestId("lobby-chat").count(), 0);
  assert.equal(await desk.locator(".lr").count(), 1);
  await desk.getByRole("button", { name: "Ready", exact: true }).waitFor();
  const rosterLines = await desk.locator(".lr").evaluate((el) => el.getClientRects().length);
  assert.equal(rosterLines, 1, "roster is one line");
  assert.equal(minigames().length, 0, "the shelf does not load Ruffle");
  await contrast(desk, "shelf 1280");

  await openStacker(desk);
  assertNoRuffleModule();
  const paths = minigames().map((item) => new URL(item).pathname);
  assert.ok(paths.includes("/minigames/ruffle/ruffle.js") && paths.some((item) => item.endsWith(".wasm")) && paths.includes("/minigames/sandwichStacker.swf"), `fetched Ruffle from /minigames (${paths.join(", ")})`);
  assert.equal(await desk.getByTestId("lobby-wait-sound").getAttribute("aria-pressed"), "false");
  assert.equal(await desk.evaluate(() => [...document.querySelectorAll("*")].find((el) => /^RUFFLE-PLAYER/.test(el.tagName)).ruffle().volume), 0);
  assert.equal(await desk.getByTestId("lobby-wait-left").isVisible(), false, "desktop has no Left button");
  assert.equal(await desk.getByTestId("lobby-wait-right").isVisible(), false, "desktop has no Right button");
  assert.match(await desk.getByTestId("lobby-wait-status").textContent(), /Arrow keys/);
  await geometry(desk, "1280x720");
  await contrast(desk, "game 1280");
  const scriptType = await desk.evaluate(() => [...document.scripts].find((s) => s.src.includes("ruffle.js"))?.type ?? "");
  assert.ok(scriptType === "" || scriptType === "text/javascript", `Ruffle script type ${scriptType}`);
  await desk.screenshot({ path: `${out}/1280x720.png` });

  await desk.evaluate(() => {
    window.__seen = [];
    window.addEventListener("keydown", (e) => window.__seen.push({ key: e.key, prevented: e.defaultPrevented }));
  });
  await desk.evaluate(() => [...document.querySelectorAll("*")].find((el) => /^RUFFLE-PLAYER/.test(el.tagName)).focus());
  await desk.keyboard.press("ArrowLeft");
  const inside = await desk.evaluate(() => window.__seen.splice(0));
  assert.ok(inside.length === 1 && inside[0].prevented, "arrow on the player is default-prevented");

  await desk.getByRole("button", { name: "Ready", exact: true }).click();
  assert.equal(await ruffleCount(desk), 1, "Ready does not close the game");
  await desk.getByTestId("lobby-wait").waitFor();
  await desk.getByRole("button", { name: "Start", exact: true }).click();
  await desk.waitForFunction(() => window.__emberisle.getState().screen === "play");
  assert.equal(await ruffleCount(desk), 0, "Start closes the game");
  await desk.context().close();
  console.log("ok  1280x720: shelf, stacker above the footer, Ready stays, Start closes");

  const phone = await client({ width: 390, height: 844 }, true);
  assert.equal(await phone.evaluate(() => matchMedia("(pointer: coarse)").matches), true, "phone pointer is coarse");
  await openShelf(phone);
  await openStacker(phone);
  assert.equal(await phone.getByTestId("lobby-wait-left").isVisible(), true);
  assert.equal(await phone.getByTestId("lobby-wait-right").isVisible(), true);
  assert.match(await phone.getByTestId("lobby-wait-status").textContent(), /Hold to move/);
  await geometry(phone, "390x844");
  await contrast(phone, "game 390");
  const grown = await phone.evaluate(() => {
    const card = document.querySelector('[data-testid="lobby-card"]').getBoundingClientRect();
    return card.top < 16;
  });
  assert.ok(grown, "phone card grows upward while the game is open");
  await phone.evaluate(() => {
    window.__keys = [];
    const player = [...document.querySelectorAll("*")].find((el) => /^RUFFLE-PLAYER/.test(el.tagName));
    player.addEventListener("keyup", (e) => window.__keys.push(`keyup:${e.code}`));
    player.addEventListener("keydown", (e) => window.__keys.push(`keydown:${e.code}`));
    document.querySelector('[data-testid="lobby-wait-left"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1 }));
  });
  await until(async () => ((await phone.evaluate(() => window.__keys)) ?? []).includes("keydown:ArrowLeft"), "Left holds ArrowLeft");
  await phone.getByRole("button", { name: "Close", exact: true }).click();
  await until(async () => (await ruffleCount(phone)) === 0, "Close removes the player");
  const keys = await phone.evaluate(() => window.__keys);
  assert.ok(keys.includes("keyup:ArrowLeft"), `Close releases the held key (${keys.join(", ")})`);
  await phone.locator(".ls").waitFor();
  await openStacker(phone);
  await phone.getByRole("button", { name: "Ready", exact: true }).click();
  assert.equal(await ruffleCount(phone), 1, "Ready does not close the phone game");
  await phone.screenshot({ path: `${out}/390x844.png` });
  await phone.getByRole("button", { name: "Leave the table" }).click();
  await phone.getByTestId("title-card").waitFor();
  assert.equal(await ruffleCount(phone), 0, "leaving removes the player");
  await phone.context().close();
  console.log("ok  390x844: touch buttons, above the footer, Close and Leave remove the player");

  const small = await client({ width: 320, height: 568 }, true);
  await openShelf(small);
  await openStacker(small);
  await small.screenshot({ path: `${out}/320x568.png` });
  await small.context().close();
  console.log("ok  320x568: picture saved");

  const sideways = await client({ width: 844, height: 390 }, true);
  await openShelf(sideways);
  await openStacker(sideways);
  await sideways.context().close();
  console.log("ok  844x390: shelf and header logo checked");

  assert.deepEqual(problems, [], `browser errors:\n${problems.join("\n")}`);
  console.log("lobby-wait-box-prove: ok");
} catch (error) {
  if (problems.length) console.error(problems.join("\n"));
  throw error;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
