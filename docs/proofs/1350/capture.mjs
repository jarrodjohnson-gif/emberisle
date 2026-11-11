import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const outDir = path.resolve("docs/proofs/1350");
mkdirSync(outDir, { recursive: true });

const SIZES = [
  [440, 956],
  [956, 440],
  [1280, 720],
];

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1350-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms, RESULTS_DIR: `${rooms}/results` },
});

const cleanups = [];
process.on("exit", () => {
  for (const fn of cleanups) {
    try { fn(); } catch {}
  }
  rmSync(rooms, { recursive: true, force: true });
});
cleanups.push(() => host.kill("SIGTERM"));

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
cleanups.push(() => vite.close());

const vitePort = vite.httpServer.address().port;
const url = `http://127.0.0.1:${vitePort}/?host=ws://127.0.0.1:${hostPort}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
cleanups.push(() => browser.close());

for (const [width, height] of SIZES) {
  const isTouch = width <= 956 && height <= 956;
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: isTouch,
    isMobile: isTouch,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("emberisle-name", "Player 1");
    localStorage.setItem("emberisle-jelly", "lite");
  });

  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  await page.evaluate(() => window.__emberisle.getState().hostTable());
  await page.waitForFunction(() => window.__emberisle.getState().screen === "lobby");
  await page.waitForSelector('[data-testid="lobby-players"]');

  // Setup seats:
  // Seat 0: Host ("Player 1")
  // Seat 1: Profile with records ("Rowan")
  // Seat 2: Profile with no games ("Zephyr")
  // Seat 3: Guest ("Guest Piper")
  await page.evaluate(() => {
    const store = window.__emberisle.getState();
    const s0 = store.seats[0];
    const s1 = { id: "s1", name: "Rowan", color: "#e23d2e", ready: true, host: false, profile: { profileId: "p-records", displayName: "Rowan" } };
    const s2 = { id: "s2", name: "Zephyr", color: "#f3ecd9", ready: false, host: false, profile: { profileId: "p-no-games", displayName: "Zephyr" } };
    const s3 = { id: "s3", name: "Guest Piper", color: "#8a4fd3", ready: false, host: false };
    const profileCards = {
      ...store.profileCards,
      "p-records": {
        profileId: "p-records",
        displayName: "Rowan",
        catchphrase: "Rolling for gold since day one!",
        games: 15,
        wins: 9,
        losses: 6,
        winRate: 60,
        streak: 3,
      },
      "p-no-games": {
        profileId: "p-no-games",
        displayName: "Zephyr",
        catchphrase: "Ready for my first match.",
        games: 0,
        wins: 0,
        losses: 0,
        winRate: null,
        streak: 0,
      },
    };
    window.__emberisle.setState({ seats: [s0, s1, s2, s3], profileCards });
  });

  await page.waitForSelector('[data-testid="lobby-player-s1"]');

  // 1. Capture lobby with name buttons visible
  await page.screenshot({ path: path.join(outDir, `lobby-${width}x${height}.png`), fullPage: false });

  // 2. Capture card for profile with records (Rowan, s1)
  await page.click('[data-testid="lobby-player-s1"]');
  await page.waitForSelector('[data-testid="other-profile-card"]');
  await page.screenshot({ path: path.join(outDir, `card-records-${width}x${height}.png`), fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="other-profile-card"]', { state: "detached" });

  // 3. Capture card for profile with no games (Zephyr, s2)
  await page.click('[data-testid="lobby-player-s2"]');
  await page.waitForSelector('[data-testid="other-profile-card"]');
  await page.screenshot({ path: path.join(outDir, `card-no-games-${width}x${height}.png`), fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="other-profile-card"]', { state: "detached" });

  // 4. Capture guest seat card (Guest Piper, s3)
  await page.click('[data-testid="lobby-player-s3"]');
  await page.waitForSelector('[data-testid="other-profile-card"]');
  await page.screenshot({ path: path.join(outDir, `card-guest-${width}x${height}.png`), fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="other-profile-card"]', { state: "detached" });

  // 5. Capture loading state card
  await page.evaluate(() => {
    const store = window.__emberisle.getState();
    const profileCards = { ...store.profileCards, "p-loading": "loading" };
    const s1 = { ...store.seats[1], name: "LoadingUser", profile: { profileId: "p-loading", displayName: "LoadingUser" } };
    window.__emberisle.setState({ seats: [store.seats[0], s1, store.seats[2], store.seats[3]], profileCards });
  });
  await page.click('[data-testid="lobby-player-s1"]');
  await page.waitForSelector('[data-testid="other-profile-loading"]');
  await page.screenshot({ path: path.join(outDir, `card-loading-${width}x${height}.png`), fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="other-profile-card"]', { state: "detached" });

  await context.close();
  console.log(`captured ${width}x${height}`);
}

console.log("capture complete");
process.exit(0);
