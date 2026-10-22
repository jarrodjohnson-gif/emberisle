// #937: the lobby's "Play while you wait" box, in a real tab through the Vite dev server and server/host.mjs.
// 1. Closed and muted by default, and only in the online lobby: nothing under /minigames/ is requested and there is no Ruffle until it opens.
// 2. Opening loads exactly one ruffle-player (Ruffle's script and wasm and the SWF, all self-hosted), on a 580:320 stage.
// 3. The held Left and Right buttons fire ArrowLeft/ArrowRight keydown at the player and keyup on release, and the stage changes.
// 4. Keyboard isolation: arrows are default-prevented only while focus is inside the box, and still reach the window (nothing
//    stops propagation, which would starve Ruffle); the lobby card does not scroll.
// 5. Closing the box, leaving the lobby and starting the game each leave zero ruffle-player elements; Start is not delayed.
// 6. No console errors, no failed requests.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8111;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RENAME_MS: "0" },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
});

const T0 = Date.now();
const problems = [];
const requests = [];
let code = 0;
const check = (ok, what) => {
  if (!ok) throw new Error(what);
  console.log(`ok ${what}`, `+${((Date.now() - T0) / 1000).toFixed(1)}s`);
};
const until = async (fn, what, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out: ${what}`);
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
page.on("requestfailed", (r) => problems.push(`failed ${r.url()}`));
page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
page.on("request", (r) => requests.push(r.url()));
const minigameRequests = () => requests.filter((u) => u.includes("/minigames/"));
const players = () => page.evaluate(() => document.querySelectorAll("ruffle-player").length);
const toggle = page.getByTestId("lobby-wait-box-toggle");

async function hostTable() {
  await page.getByRole("button", { name: "Host a table" }).click();
  await page.getByTestId("table-code").waitFor();
  await page.getByTestId("lobby-wait-box").waitFor();
}
async function seatBots() {
  await page.getByTestId("add-bot").first().click();
  await until(async () => (await page.getByTestId("add-bot").count()) === 2, "first bot seated");
  await page.getByTestId("add-bot").first().click();
  await until(async () => (await page.getByTestId("add-bot").count()) === 1, "second bot seated");
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).waitFor();
}
async function openBox() {
  await toggle.click();
  await until(async () => (await page.getByTestId("lobby-wait-left").isEnabled()), "the player has loaded (Left is enabled)");
}

try {
  await page.goto(`http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`);
  await page.getByTestId("title-card").waitFor();
  check((await page.getByTestId("lobby-wait-box").count()) === 0, "title: there is no wait box outside the online lobby");

  // 1. Closed by default.
  await hostTable();
  check((await toggle.getAttribute("aria-expanded")) === "false" && (await page.getByTestId("lobby-wait-box-stage").count()) === 0, "lobby: the box is closed by default");
  await page.waitForLoadState("networkidle");
  check(minigameRequests().length === 0, "lobby: nothing under /minigames/ was requested while the box is closed");
  check((await players()) === 0 && (await page.evaluate(() => !window.RufflePlayer && !document.querySelector('script[src*="ruffle"]'))), "lobby: no ruffle-player and no Ruffle script while closed");

  // 2. Open.
  await openBox();
  check((await players()) === 1, "open: exactly one ruffle-player");
  const urls = minigameRequests().map((u) => new URL(u).pathname);
  check(urls.includes("/minigames/ruffle/ruffle.js") && urls.some((u) => u.endsWith(".wasm")) && urls.includes("/minigames/sandwichStacker.swf"), `open: Ruffle, its wasm and the SWF are fetched from /minigames/ (${urls.length} requests)`);
  check((await page.getByTestId("lobby-wait-sound").isChecked()) === false, "open: muted by default (Sound is off)");
  const stage = await page.getByTestId("lobby-wait-box-stage").boundingBox();
  check(Math.abs(stage.width / stage.height - 580 / 320) < 0.01, `open: the stage is 580:320 (${stage.width} x ${stage.height})`);

  // 3. Held buttons.
  await page.evaluate(() => {
    window.__keys = [];
    const p = document.querySelector("ruffle-player");
    for (const t of ["keydown", "keyup"]) p.addEventListener(t, (e) => window.__keys.push(`${t}:${e.code}`));
  });
  const shot = () => page.getByTestId("lobby-wait-box-stage").screenshot().then((b) => b.toString("base64"));
  const hold = async (id, ms) => {
    const box = await page.getByTestId(id).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    check(await page.evaluate(([x, y, id]) => document.elementFromPoint(x, y)?.closest(`[data-testid=${id}]`) !== null, [box.x + box.width / 2, box.y + box.height / 2, id]), `buttons: ${id} is on screen and not covered by the sticky Ready/Leave footer`);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    const during = await page.evaluate(() => [...window.__keys]);
    await page.mouse.up();
    return during;
  };
  await page.getByTestId("lobby-wait-box-stage").click({ position: { x: stage.width * 0.905, y: stage.height * 0.89 } });
  await page.waitForTimeout(1500);
  const before = await shot();
  const left = await hold("lobby-wait-left", 1500);
  check(left.includes("keydown:ArrowLeft") && !left.includes("keyup:ArrowLeft"), "buttons: holding Left fires ArrowLeft keydown at the player and no keyup yet");
  check((await page.evaluate(() => window.__keys)).at(-1) === "keyup:ArrowLeft", "buttons: releasing Left fires ArrowLeft keyup");
  const right = await hold("lobby-wait-right", 1500);
  check(right.includes("keydown:ArrowRight") && !right.includes("keyup:ArrowRight"), "buttons: holding Right fires ArrowRight keydown at the player and no keyup yet");
  check((await page.evaluate(() => window.__keys)).at(-1) === "keyup:ArrowRight", "buttons: releasing Right fires ArrowRight keyup");
  check((await shot()) !== before, "buttons: after PLAY the stage keeps changing: the game is running");

  // 4. Keyboard isolation.
  const card = page.getByTestId("lobby-card").locator("> div").first();
  await page.evaluate(() => {
    window.__seen = [];
    window.addEventListener("keydown", (e) => window.__seen.push({ key: e.key, prevented: e.defaultPrevented }));
  });
  await page.evaluate(() => document.querySelector("ruffle-player").focus());
  const scrollBefore = await card.evaluate((el) => el.scrollTop);
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowDown"]) await page.keyboard.press(k);
  const inside = await page.evaluate(() => window.__seen.splice(0));
  check(inside.length === 3 && inside.every((e) => e.prevented), "keys: arrows with focus in the box reach the window (not stopped) and are default-prevented, so the card does not scroll");
  check((await card.evaluate((el) => el.scrollTop)) === scrollBefore, "keys: the lobby card did not scroll");
  await page.evaluate(() => document.activeElement?.blur());
  await page.getByTestId("table-code").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  const outside = await page.evaluate(() => window.__seen.splice(0));
  check(outside.length === 2 && outside.every((e) => !e.prevented), "keys: with focus outside the box the box does not touch the arrows");

  // 5a. Closing unloads.
  await toggle.click();
  await until(async () => (await players()) === 0, "closing unloads");
  check((await page.getByTestId("lobby-wait-box-stage").count()) === 0, "close: zero ruffle-player and no stage; the box is closed again");
  await openBox();
  check((await players()) === 1, "reopen: exactly one ruffle-player again (not two)");
  const requestsAfterReopen = minigameRequests().filter((u) => u.endsWith("ruffle.js")).length;
  check(requestsAfterReopen === 1, "reopen: Ruffle's script is fetched once for the page");

  // 5b. Leaving the lobby unloads.
  await page.getByRole("button", { name: "Leave the table" }).click();
  await page.getByTestId("title-card").waitFor();
  check((await players()) === 0, "leave: zero ruffle-player after leaving the lobby");

  // 5c. Game start unloads, and Start is not held up.
  await hostTable();
  await seatBots();
  await openBox();
  check((await players()) === 1, "second lobby: the box opens again with one player");
  const t = Date.now();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForFunction(() => window.__emberisle.getState().screen === "play");
  const startMs = Date.now() - t;
  check(startMs < 3000, `start: the table is on screen ${startMs} ms after Start, with the box open`);
  check((await players()) === 0, "start: zero ruffle-player once the game starts");

  check(problems.length === 0, "zero console errors and no failed requests");
  console.log("lobby wait box prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  if (problems.length) console.log(problems.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
  if (host.exitCode === null && host.signalCode === null) await Promise.race([once(host, "exit"), new Promise((r) => setTimeout(r, 3000).unref())]);
}
process.exit(code);
