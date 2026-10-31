// #552: crash intercepted development modules after a real online join. No crash hook ships in the application.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-render-recovery-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, GRACE_MS: "300000" },
});
process.on("exit", () => {
  host.kill("SIGKILL");
  rmSync(ROOMS_DIR, { recursive: true, force: true, maxRetries: 5 });
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));
const hostPort = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("host startup timed out")), 15_000);
  host.once("exit", () => reject(new Error("host exited before listening")));
  host.stdout.on("data", (data) => {
    const match = String(data).match(/listening (\d+)/);
    if (match) { clearTimeout(timer); resolve(Number(match[1])); }
  });
});
const vite = await createServer({ server: { host: "127.0.0.1", port: Number(process.env.VITE_PORT) || 8452, strictPort: true }, logLevel: "error" });
await vite.listen();
const port = vite.httpServer.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let other;
try {
  const owner = await browser.newPage();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  owner.setDefaultTimeout(15_000);
  page.setDefaultTimeout(15_000);
  const unexpected = [], deliberate = [];
  page.on("pageerror", (error) => {
    (error.message.includes("controlled table render failure") ? deliberate : unexpected).push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    (message.text().includes("controlled table render failure") ? deliberate : unexpected).push(message.text());
  });
  for (const [module, name, flag] of [["game/Hud", "Hud", "hud"], ["scene/IslandCanvas", "IslandCanvas", "canvas"]]) {
    await page.route(`**/src/components/${module}.tsx*`, async (route) => {
      const response = await route.fetch();
      const original = await response.text();
      const signature = `function ${name}() {`;
      assert(original.includes(signature), `found ${name} render entry for controlled injection`);
      const body = original.replace(signature, `${signature}\nif (window.__renderFault === "${flag}") throw new Error("controlled table render failure: ${flag}");`);
      await route.fulfill({ response, body });
    });
  }
  for (const [tab, name] of [[owner, "Ember"], [page, "Tide"]]) {
    await tab.addInitScript((name) => {
      localStorage.setItem("emberisle-name", name);
      localStorage.setItem("emberisle-water", "simple");
      window.__wire = { dials: 0, rejoins: 0, actions: 0 };
      const NativeWS = WebSocket;
      window.WebSocket = class extends NativeWS {
        constructor(...args) { super(...args); window.__wire.dials++; }
        send(data) {
          const message = JSON.parse(data);
          if (message.type === "hello" && typeof message.secret === "string") window.__wire.rejoins++;
          if (message.cid) window.__wire.actions++;
          return super.send(data);
        }
      };
    }, name);
    await tab.goto(`http://127.0.0.1:${port}/?host=ws://127.0.0.1:${hostPort}`);
  }
  await owner.getByRole("button", { name: "Host a table" }).click();
  const code = (await owner.getByTestId("table-code").textContent()).trim();
  assert.match(code, /^[A-Z0-9]{4}$/);
  await page.getByRole("textbox", { name: "Join code" }).fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.getByTestId("table-code").waitFor();
  other = new WebSocket(`ws://127.0.0.1:${hostPort}`);
  other.addEventListener("message", ({ data }) => {
    if (JSON.parse(String(data)).type === "welcome") other.send(JSON.stringify({ type: "ready", value: true }));
  });
  await once(other, "open");
  other.send(JSON.stringify({ type: "hello", code, name: "Pine" }));
  for (const tab of [owner, page]) await tab.evaluate(() => window.__emberisle.getState().setReady(true));
  await owner.waitForFunction(() => {
    const seats = window.__emberisle.getState().seats;
    return seats.length === 3 && seats.every((seat) => seat.ready);
  });
  await owner.evaluate(() => window.__emberisle.getState().startTable());
  await page.waitForFunction(() => window.__emberisle.getState().screen === "play");
  await page.locator("header").waitFor();
  const before = await page.evaluate(() => {
    const state = window.__emberisle.getState();
    return { seatId: state.seatId, localId: state.localId, game: JSON.stringify(state.state), synced: state.synced, wire: { ...window.__wire } };
  });
  const roomFile = path.join(ROOMS_DIR, `${code}.json`);
  // Save is debounced; verify the actual room file before comparing the recovered game.
  for (let n = 0; n < 100 && (!existsSync(roomFile) || !JSON.parse(readFileSync(roomFile)).game); n++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  const persisted = JSON.parse(readFileSync(roomFile)).game;
  assert.equal(JSON.parse(before.game).seq, persisted.seq);
  assert.deepEqual(JSON.parse(before.game).players.map((p) => p.id), persisted.players.map((p) => p.id));
  const showRecovery = async () => {
    await page.getByTestId("table-recovery").waitFor();
    assert.equal(await page.getByTestId("recovery-code").textContent(), code);
    await page.getByRole("button", { name: "Rejoin", exact: true }).waitFor();
    assert.equal(await page.locator("canvas, header").count(), 0, "recovery stands without the broken game subtree");
  };
  await page.evaluate(() => {
    window.__renderFault = "hud";
    window.__emberisle.setState({ error: "Trigger a table render" });
  });
  await showRecovery();
  console.log("ok  controlled HUD render failure reaches recovery with exact four-character room code and Rejoin");
  const stable = await page.evaluate(() => ({ ...window.__wire }));
  await page.waitForTimeout(1000);
  assert.deepEqual(await page.evaluate(() => window.__wire), stable, "no reconnect while waiting for a click");
  assert.deepEqual(JSON.parse(readFileSync(roomFile)).game, persisted, "render failure leaves saved game intact");

  // The next explicit retry gets the saved seat but meets a persistently broken Canvas. It must stop at the card again.
  await page.evaluate(() => { window.__renderFault = "canvas"; });
  await page.getByRole("button", { name: "Rejoin", exact: true }).click();
  await page.waitForFunction((synced) => window.__emberisle.getState().synced > synced, before.synced);
  await showRecovery();
  const failedRetry = await page.evaluate(() => ({ ...window.__wire }));
  assert.equal(failedRetry.rejoins, before.wire.rejoins + 1, "one saved-seat rejoin for one click");
  await page.waitForTimeout(1000);
  assert.deepEqual(await page.evaluate(() => window.__wire), failedRetry, "persistent render failure never retries itself");
  console.log("ok  Canvas failure also reaches recovery; a persistent error causes no reconnect loop");

  await page.evaluate((code) => {
    window.__savedRecoverySeat = localStorage.getItem("emberisle-seat");
    const seat = JSON.parse(window.__savedRecoverySeat);
    seat.code = code === "AAAA" ? "BBBB" : "AAAA";
    localStorage.setItem("emberisle-seat", JSON.stringify(seat));
  }, code);
  await page.getByRole("button", { name: "Rejoin", exact: true }).click();
  await page.getByText("This browser no longer has the saved seat for this table.").waitFor();
  assert.deepEqual(await page.evaluate(() => window.__wire), failedRetry, "a different saved room cannot receive this Rejoin");
  await page.evaluate(() => {
    localStorage.setItem("emberisle-seat", window.__savedRecoverySeat);
    delete window.__savedRecoverySeat;
    window.__originalRejoin = window.__emberisle.getState().rejoinTable;
    window.__stalledAttempts = 0;
    window.__emberisle.setState({ rejoinTable: () => { window.__stalledAttempts++; return true; } });
  });
  await page.getByRole("button", { name: "Rejoin", exact: true }).click();
  assert(await page.getByRole("button", { name: "Rejoining…", exact: true }).isDisabled());
  await page.getByText("Could not reach your table. Try Rejoin again.").waitFor({ timeout: 20_000 });
  assert(await page.getByRole("button", { name: "Rejoin", exact: true }).isEnabled());
  assert.equal(await page.evaluate(() => window.__stalledAttempts), 1, "stalled recovery waits for another explicit click");
  assert.deepEqual(await page.evaluate(() => window.__wire), failedRetry);
  await page.evaluate(() => {
    window.__emberisle.setState({ rejoinTable: window.__originalRejoin });
    delete window.__originalRejoin;
  });
  console.log("ok  a different saved room never dials; a stalled attempt becomes usable again without automatic retries");

  await page.evaluate(() => { window.__renderFault = null; });
  await page.getByRole("button", { name: "Rejoin", exact: true }).click();
  await page.locator("header").waitFor();
  await page.locator("canvas").waitFor();
  assert.equal(await page.getByTestId("table-recovery").count(), 0);
  const after = await page.evaluate(() => {
    const state = window.__emberisle.getState();
    return { seatId: state.seatId, localId: state.localId, game: JSON.stringify(state.state), wire: { ...window.__wire } };
  });
  assert.equal(after.seatId, before.seatId);
  assert.equal(after.localId, before.localId);
  assert.deepEqual(JSON.parse(after.game), JSON.parse(before.game));
  assert.deepEqual(JSON.parse(readFileSync(roomFile)).game, persisted);
  assert.equal(after.wire.rejoins, before.wire.rejoins + 2);
  assert.equal(after.wire.dials, before.wire.dials + 2);
  assert.equal(after.wire.actions, before.wire.actions);
  await page.waitForTimeout(1500);
  assert.deepEqual(await page.evaluate(() => window.__wire), after.wire, "recovery stays connected without extra dials");
  assert(deliberate.length >= 2, "React reports the deliberate render failures");
  assert.deepEqual(unexpected, [], "no additional uncaught or console errors");
  console.log("ok  Rejoin restores the same seat and persisted game, sends no game action, and introduces no additional error");
  console.log("render recovery prove ok");
} finally {
  other?.close();
  await browser.close();
  await vite.close();
  host.kill("SIGTERM");
}
