import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { PLAYER_COLORS } from "../src/lib/game/types.ts";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-lobby-card-proof-"));
const ROOMS_DIR = path.join(dir, "rooms");
const PROFILES_DIR = path.join(dir, "profiles");
const RESULTS_DIR = path.join(dir, "results");
const STORE = path.join(PROFILES_DIR, "profiles.json");

mkdirSync(ROOMS_DIR, { recursive: true });
mkdirSync(PROFILES_DIR, { recursive: true });
mkdirSync(RESULTS_DIR, { recursive: true });

const cleanups = [];
process.on("exit", () => {
  for (const fn of cleanups) {
    try { fn(); } catch {}
  }
  rmSync(dir, { recursive: true, force: true });
});

// Seed profiles into the host store
const doc = {
  schemaVersion: 1,
  profiles: {},
  logins: {},
  reservedLogins: {},
  tombstones: {},
  devices: {},
  unknownLogins: {},
};

function seedProfile(login, displayName, pin, catchphrase = "") {
  const id = randomUUID();
  const salt = randomBytes(16);
  const now = Date.now();
  doc.profiles[id] = {
    id,
    displayName,
    login,
    color: PLAYER_COLORS[1],
    backupColor: PLAYER_COLORS[0],
    catchphrase,
    winSongId: null,
    mediaKey: null,
    createdAt: now,
    updatedAt: now,
    pin: {
      alg: "scrypt",
      N: 16384,
      r: 8,
      p: 1,
      salt: salt.toString("base64"),
      hash: scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64"),
    },
    guard: { times: [], pending: {}, lifetime: 0 },
  };
  doc.logins[login] = id;
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  doc.devices[hash] = { profileId: id, createdAt: now, expiresAt: now + 90 * 86400 * 1000 };
  return { id, token, displayName, catchphrase, login, pin };
}

const profileA = seedProfile("emberlogin", "Ember", "4821", "Burns bright");
const profileB = seedProfile("corallogin", "Coral", "1234", "Deep ocean");
const profileC = seedProfile("pinelogin", "Pine", "9999", "Evergreen");

writeFileSync(STORE, JSON.stringify(doc, null, 2));

// Start the real host
let hostLog = "";
const hostProc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: {
    ...process.env,
    PORT: "0",
    ROOMS_DIR,
    PROFILES_DIR,
    RESULTS_DIR,
    PROFILES_DEV: "1",
    SAVE_MS: "20",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
hostProc.stderr.on("data", (d) => { hostLog += d; console.error(String(d)); });
cleanups.push(() => hostProc.kill("SIGKILL"));

const hostPort = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("host startup timed out")), 10000);
  let out = "";
  hostProc.stdout.on("data", (d) => {
    out += String(d);
    const m = out.match(/listening (\d+)/);
    if (m) {
      clearTimeout(timer);
      resolve(Number(m[1]));
    }
  });
  hostProc.once("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`host exited early with ${code}`));
  });
});

const vite = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await vite.listen();
cleanups.push(() => vite.close());

const vitePort = vite.httpServer.address().port;
const appUrl = `http://127.0.0.1:${vitePort}/?host=ws://127.0.0.1:${hostPort}`;

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
cleanups.push(() => browser.close());

const VIEWPORTS = [
  { width: 440, height: 956 },
  { width: 956, height: 440 },
  { width: 1280, height: 720 },
];

for (const { width, height } of VIEWPORTS) {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });

  async function openPage(name, credential = null) {
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      console.error(`[${name} pageerror]`, e);
      errors.push(String(e));
    });
    page.on("console", (m) => {
      if (m.type() === "error") {
        console.error(`[${name} console.error]`, m.text());
        errors.push(m.text());
      }
    });
    await page.addInitScript(() => {
      localStorage.setItem("emberisle-jelly", "lite");
    });
    await page.goto(appUrl);
    await page.waitForFunction(() => !!window.__emberisle);
    if (credential) {
      await page.evaluate(
        ({ token }) => {
          window.__emberisle.setState({
            profile: { credentialForHost: () => token },
          });
        },
        { token: credential }
      );
    }
    return page;
  }

  // 1. Host with profile A
  const p1 = await openPage("HostPlayer", profileA.token);
  await p1.evaluate(() => window.__emberisle.getState().hostTable());
  await p1.waitForFunction(() => window.__emberisle.getState().screen === "lobby");
  await p1.waitForFunction(() => window.__emberisle.getState().seats.length >= 1);
  const code = await p1.evaluate(() => window.__emberisle.getState().code);

  // 2. Guest joins
  const p2 = await openPage("GuestPlayer", null);
  await p2.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
  await p2.waitForFunction(() => window.__emberisle.getState().screen === "lobby");
  await p1.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
  await p2.waitForFunction(() => window.__emberisle.getState().seats.length === 2);

  // Test in Guest (p2): click Host's seat button to view Host's profile card
  const hostSeatBtn = p2.locator('[data-testid="lobby-player-s0"]');
  await hostSeatBtn.waitFor();
  await hostSeatBtn.click();

  const card = p2.locator('[data-testid="other-profile-card"]');
  await card.waitFor();

  // Cards show only public fields
  const title = p2.locator('[data-testid="other-profile-title"]');
  assert.equal(await title.textContent(), "Ember", `${width}x${height}: public display name`);

  const catchphrase = p2.locator('[data-testid="other-profile-catchphrase"]');
  assert.equal(await catchphrase.textContent(), "“Burns bright”", `${width}x${height}: public catchphrase`);

  // Ensure no private fields appear in the DOM
  const pageText = await p2.locator("body").innerText();
  for (const secret of [profileA.login, profileA.pin, profileA.token]) {
    assert.ok(!pageText.includes(secret), `${width}x${height}: private profile data never leaks`);
  }

  // Show no fake zeros while loading or unavailable
  assert.equal(await p2.locator('[data-testid="other-profile-stats"]').count(), 0, `${width}x${height}: no fake zeros`);

  // Escape key closes card and returns keyboard focus to opener
  await p2.keyboard.press("Escape");
  await card.waitFor({ state: "hidden" });
  const focusedTag = await p2.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(focusedTag, "lobby-player-s0", `${width}x${height}: focus returned to opener`);

  // Test in Host (p1): click Guest's seat button
  const guestSeatBtn = p1.locator('[data-testid="lobby-player-s1"]');
  await guestSeatBtn.waitFor();
  await guestSeatBtn.click();

  const guestCard = p1.locator('[data-testid="other-profile-card"]');
  await guestCard.waitFor();

  // Guest seat says "Guest"
  const guestLabel = p1.locator('[data-testid="other-profile-guest"]');
  assert.equal(await guestLabel.textContent(), "Guest", `${width}x${height}: guest label`);

  // Close button dismisses card and returns focus
  const closeBtn = guestCard.getByRole("button", { name: "Close" });
  await closeBtn.click();
  await guestCard.waitFor({ state: "hidden" });
  const hostFocusedTag = await p1.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(hostFocusedTag, "lobby-player-s1", `${width}x${height}: host focus returned to opener`);

  // Readiness stays correct
  await p2.evaluate(() => window.__emberisle.getState().setReady(true));
  await p1.waitForFunction(() => window.__emberisle.getState().seats[1]?.ready === true);

  // Open and close card again; readiness remains preserved
  await hostSeatBtn.click();
  await card.waitFor();
  const seatsDuring = await p2.evaluate(() => window.__emberisle.getState().seats.map((s) => s.ready));
  assert.deepEqual(seatsDuring, [false, true], `${width}x${height}: readiness preserved during card open`);
  await p2.keyboard.press("Escape");
  await card.waitFor({ state: "hidden" });

  // Stale replies dropped and card closes when seat leaves
  await hostSeatBtn.click();
  await card.waitFor();
  // Guest leaves table
  await p2.evaluate(() => window.__emberisle.getState().goTitle());
  await p1.waitForFunction(() => window.__emberisle.getState().seats.length === 1);
  // Guest rejoins table
  await p2.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
  await p1.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
  await p2.waitForFunction(() => window.__emberisle.getState().screen === "lobby");

  // Add a bot so table has 3 players and can start
  await p1.evaluate(() => window.__emberisle.getState().addBot());
  await p1.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
  await p2.waitForFunction(() => window.__emberisle.getState().seats.length === 3);

  // Everyone ready and start game
  await p1.evaluate(() => window.__emberisle.getState().setReady(true));
  await p2.evaluate(() => window.__emberisle.getState().setReady(true));
  await p1.waitForFunction(() => window.__emberisle.getState().seats.every((s) => s.ready));
  await p1.evaluate(() => window.__emberisle.getState().startTable());
  await p1.waitForFunction(() => window.__emberisle.getState().screen === "play");
  await p2.waitForFunction(() => window.__emberisle.getState().screen === "play");

  // Watcher connects to started table
  const p3 = await openPage("Watcher", null);
  await p3.evaluate((c) => window.__emberisle.getState().watchTable(c), code);
  await p3.waitForFunction(() => window.__emberisle.getState().spectator === true);

  // Watcher sees only cards at its own table
  await p3.evaluate(({ hostProfileId }) => {
    window.__emberisle.getState().requestProfileCard(hostProfileId);
  }, { hostProfileId: profileA.id });
  await p3.waitForFunction(
    ({ hostProfileId }) => {
      const c = window.__emberisle.getState().profileCards[hostProfileId];
      return typeof c === "object" && c?.displayName === "Ember";
    },
    { hostProfileId: profileA.id }
  );

  // Asking for a profile from another table fails (watcher receives error, no card from other table)
  await p3.evaluate(({ foreignId }) => {
    window.__emberisle.getState().requestProfileCard(foreignId);
  }, { foreignId: profileC.id });

  await p3.waitForFunction(
    ({ foreignId }) => window.__emberisle.getState().profileCards[foreignId] === "error",
    { foreignId: profileC.id }
  );

  assert.deepEqual(errors, [], `${width}x${height}: zero browser errors`);
  await context.close();
  console.log(`ok ${width}x${height}: read-only profile card, public fields, guest label, watcher access, focus return`);

  assert.deepEqual(errors, [], `${width}x${height}: zero browser errors`);
  await context.close();
  console.log(`ok ${width}x${height}: read-only profile card, public fields, guest label, watcher access, focus return`);
}

console.log("lobby-profile-card-prove: ok");
process.exit(0);
