// #1156: the "Number tokens" setting through the real title and lobby, against a real host.
// At 320x568, 390x844, 440x956, 844x390, 956x440 and 1280x720: Game options shows "Online numbers" with Official spiral
// picked and its plain sentence; the choice is a 44 px control. In the lobby header, right of the code, the host's Numbers
// switch (owner answer B) names the setting in full and is a 44 px switch that doesn't touch the code; flipping it changes the
// table for every socket, and back. A guest browser reads the same words with no switch, and follows the host's flip. A table
// hosted with Random deals the Random deal for its seed; the default deals the spiral. Leaving for the title puts the choice
// back to Official spiral.
// Pictures: test-results/number-tokens-<title|lobby>-<width>x<height>.png.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "../server/node_modules/ws/wrapper.mjs";
import { chromium } from "./proof-browser.mjs";
import { hostPort as waitForHostPort } from "./proof-host-port.mjs";
import { createServer } from "vite";
import { createGame } from "../src/lib/game/board.ts";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-number-tokens-ui-"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sockets = [], errors = [];
let host, hostPort, vite, browser, port = Number(process.env.VITE_PORT) || 0;
process.on("exit", () => {
  if (host && host.exitCode === null && host.signalCode === null) host.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

async function client(hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${hostPort}`), messages = [];
  sockets.push(ws);
  let state;
  ws.on("message", (d) => { const m = JSON.parse(String(d)); messages.push(m); if (m.type === "state") state = m; });
  await new Promise((r) => ws.on("open", r));
  ws.send(JSON.stringify({ type: "hello", ...hello }));
  const next = async (type, test = () => true) => {
    for (let i = 0; i < 500; i++) { const m = messages.find((m) => m.type === type && test(m)); if (m) return structuredClone(m); await wait(10); }
    throw Error(`timeout ${type}: ${JSON.stringify(messages.slice(-3))}`);
  };
  const welcome = await next("welcome");
  return { ws, next, welcome, send: (m) => ws.send(JSON.stringify({ ...state?.actionStamp, cid: crypto.randomUUID(), ...m })) };
}
async function saved(code, test) {
  for (let i = 0; i < 200; i++) { try { const s = JSON.parse(readFileSync(path.join(dir, `${code}.json`))); if (test(s)) return s; } catch {} await wait(20); }
  throw Error(`save timeout ${code}`);
}
const url = () => `http://127.0.0.1:${port}/?host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}`)}`;
const pips = (hexes) => hexes.map((h) => `${h.id}:${h.pip}`).join(" ");
const caption = (page) => page.getByTestId("lobby-caption");
const NAME = { official: "Official spiral", random: "Random" };
const OTHER = { official: "random", random: "official" };
const numbers = (page) => page.getByTestId("lobby-numbers");

try {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL("../server/", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: dir, PROFILES_DIR: path.join(dir, "profiles"), RESULTS_DIR: path.join(dir, "results"), SAVE_MS: "20", GRACE_MS: "600000", HOLD_MS: "600000", LOBBY_HOLD_MS: "600000", TURN_MS: "600000", ACT_CAP: "1000", ACT_RATE: "1000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  hostPort = await waitForHostPort(host);
  vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: port !== 0 }, logLevel: "error" });
  await vite.listen();
  port = vite.httpServer.address().port;
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  mkdirSync("test-results", { recursive: true });

  const views = [[320, 568, "random"], [390, 844, "official"], [440, 956, "random"], [844, 390, "random"], [956, 440, "official"], [1280, 720, "official"]];
  for (const [width, height, mode] of views) {
    const tag = `${width}x${height}`;
    const touch = width < 900;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    await page.goto(url());
    await page.getByRole("button", { name: "Host a table", exact: true }).waitFor();
    await page.locator('[data-testid="wayfarer-setup"] > summary').click();
    const select = page.getByLabel("Online number tokens", { exact: true });
    await select.scrollIntoViewIfNeeded();
    assert.equal(await select.inputValue(), "official", `${tag}: Official spiral is the default`);
    assert.deepEqual(await select.locator("option").allTextContents(), ["Official spiral", "Random"], `${tag}: two choices`);
    const help = await page.locator("#number-tokens-help").innerText();
    assert.equal(help, "Official spiral lays the numbers in the printed order. Random shuffles them, and no 6 or 8 touch.", `${tag}: the plain sentence`);
    const box = await select.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width, `${tag}: a 44 px control on screen: ${JSON.stringify(box)}`);
    if (mode === "random") await select.selectOption("random");
    assert.equal(await page.evaluate(() => window.__emberisle.getState().numberTokensChoice), mode, `${tag}: the pick is held`);
    await page.screenshot({ path: `test-results/number-tokens-title-${tag}.png` });

    await page.getByRole("button", { name: "Host a table", exact: true }).click();
    await page.getByTestId("lobby-card").waitFor();
    await page.waitForFunction(() => window.__emberisle.getState().code.length === 4);
    const code = await page.evaluate(() => window.__emberisle.getState().code);
    await page.waitForFunction(() => document.querySelector('[data-testid="lobby-caption"]')?.textContent === "Wayfarer on");
    assert.equal(await caption(page).textContent(), "Wayfarer on", `${tag}: the caption is the wayfarer alone`);
    const toggle = page.getByRole("switch", { name: "Random numbers", exact: true });
    assert.equal(await toggle.getAttribute("aria-checked"), String(mode === "random"), `${tag}: the host's switch is ${mode}`);
    assert.equal(await numbers(page).innerText(), `Numbers\n${NAME[mode]}`, `${tag}: the host's lobby names the setting`);
    const sw = await toggle.boundingBox(), cb = await page.locator(".lobby-code").boundingBox();
    assert.ok(sw.height >= 44 && sw.width >= 44 && sw.x >= 0 && sw.x + sw.width <= width && sw.x >= cb.x + cb.width, `${tag}: a 44 px switch on screen, right of the code: ${JSON.stringify({ sw, cb })}`);
    const whole = await numbers(page).evaluate((el) => [...el.querySelectorAll("span, b")].every((t) => t.scrollWidth <= t.clientWidth + 1));
    assert.ok(whole, `${tag}: the Numbers words are shown in full`);
    console.log(`${tag}: lobby switch ${Math.round(sw.width)}x${Math.round(sw.height)} px at x ${Math.round(sw.x)}, code ends at ${Math.round(cb.x + cb.width)}`);

    const guests = [await client({ code, name: "Tide" }), await client({ code, name: "Pine" })];
    for (const g of guests) {
      assert.equal(g.welcome.numberTokens, mode, `${tag}: a guest's welcome says ${mode}`);
      assert.equal((await g.next("seats", (m) => m.seats.length === 3)).numberTokens, mode, `${tag}: a guest's seat list says ${mode}`);
    }
    await page.getByTestId("lobby-players").waitFor();
    await page.screenshot({ path: `test-results/number-tokens-lobby-${tag}.png` });
    // The host flips the switch: every socket hears the other setting, and back.
    for (const want of [OTHER[mode], mode]) {
      await toggle.click();
      for (const g of guests) assert.equal((await g.next("seats", (m) => m.numberTokens === want)).numberTokens, want, `${tag}: a guest hears ${want}`);
      await page.waitForFunction((v) => document.querySelector('[data-testid="lobby-numbers"]')?.getAttribute("aria-checked") === String(v === "random"), want);
      assert.equal(await numbers(page).innerText(), `Numbers\n${NAME[want]}`, `${tag}: the switch reads ${want}`);
      if (want !== mode && (tag === "440x956" || tag === "956x440")) await page.screenshot({ path: `test-results/number-tokens-lobby-flipped-${tag}.png` });
    }
    assert.equal((await saved(code, (s) => s.numberTokens === mode)).numberTokens, mode, `${tag}: flipped back, the table is saved with ${mode}`);

    if (tag === "390x844") {
      // A real guest browser joining by the link reads the same caption.
      const guest = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: "reduce" });
      const guestPage = await guest.newPage();
      guestPage.on("pageerror", (e) => errors.push(`guest: ${e.message}`));
      await guestPage.goto(`${url()}&code=${code}`);
      await guestPage.getByRole("button", { name: `Join table ${code}`, exact: true }).click();
      await guestPage.getByTestId("lobby-card").waitFor();
      await guestPage.waitForFunction((n) => document.querySelector('[data-testid="lobby-numbers"]')?.innerText.endsWith(n), NAME[mode]);
      assert.equal(await numbers(guestPage).innerText(), `Numbers\n${NAME[mode]}`, "a guest browser's lobby names the setting");
      assert.equal(await guestPage.getByRole("switch").count(), 0, "a guest browser has no switch");
      await toggle.click();
      await guestPage.waitForFunction((n) => document.querySelector('[data-testid="lobby-numbers"]')?.innerText.endsWith(n), NAME[OTHER[mode]]);
      await toggle.click();
      await guestPage.waitForFunction((n) => document.querySelector('[data-testid="lobby-numbers"]')?.innerText.endsWith(n), NAME[mode]);
      console.log(`${tag}: a guest browser reads "${NAME[mode]}" with no switch, and follows the host's flip`);
      await guest.close();
    }

    if (width === 320 || width === 1280) {
      // The started board is the setting's deal for the saved seed.
      for (const g of guests) g.send({ type: "ready", value: true });
      await page.getByRole("button", { name: "Ready", exact: true }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.waitForFunction(() => window.__emberisle.getState().state !== null);
      const room = await saved(code, (s) => s.game);
      assert.equal(room.numberTokens, mode, `${tag}: the table is saved with ${mode}`);
      const opts = { seed: room.game.seed, humans: room.game.players.map((p) => ({ name: p.name })), bots: 0, wayfarerMode: "on" };
      assert.equal(pips(room.game.hexes), pips(createGame({ ...opts, numberTokens: mode }).hexes), `${tag}: the board is the ${mode} deal`);
      assert.notEqual(pips(room.game.hexes), pips(createGame({ ...opts, numberTokens: mode === "random" ? "official" : "random" }).hexes), `${tag}: not the other deal`);
      const shown = await page.evaluate(() => window.__emberisle.getState().state.hexes.map((h) => `${h.id}:${h.pip}`).join(" "));
      assert.equal(shown, pips(room.game.hexes), `${tag}: the host's browser shows that board`);
      console.log(`${tag}: ${mode} table ${code} started on the ${mode} deal for seed ${room.game.seed}`);
    }

    // Back at the title, the choice is Official spiral again.
    await page.evaluate(() => window.__emberisle.getState().goTitle());
    await page.getByRole("button", { name: "Host a table", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__emberisle.getState().numberTokensChoice), "official", `${tag}: the title resets the choice`);
    for (const g of guests) g.ws.terminate();
    await context.close();
    console.log(`${tag}: title and lobby checked with ${mode}`);
  }
  assert.deepEqual(errors, []);
  console.log("number-tokens-prove: all passed; pictures in test-results/number-tokens-*.png");
} finally {
  for (const ws of sockets) ws.terminate();
  await browser?.close();
  await vite?.close();
  host?.kill("SIGKILL");
}
