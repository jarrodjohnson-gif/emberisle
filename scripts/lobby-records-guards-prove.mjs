// Lobby, CopyText, and ProfileRecords lifecycle and focus guards:
// - ProfileRecords clears stale load error alerts after Try again succeeds.
// - ProfileRecords guards Show more against duplicate clicks before re-render.
// - useCopy catches synchronous clipboard throws, ignores stale async replies after room change, and clears timers on unmount.
// - LobbyView OwnName returns focus to rename-seat on Escape and Enter, without stealing focus on blur.
// - Lobby SeatName clears open OtherProfileCard state when the seat leaves so rejoining does not reopen it.
// Zero page or console errors. Run: npm run lobby-records-guards-prove
import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { createRequire } from "node:module";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const { WebSocketServer } = createRequire(new URL("../server/package.json", import.meta.url))("ws");
const STEP_MS = 30_000;

function makeMockHost() {
  const srv = httpServer();
  const sockets = new Set();
  srv.on("connection", (s) => {
    sockets.add(s);
    s.once("close", () => sockets.delete(s));
  });
  const profile = {
    profileId: "11111111-1111-4111-8111-111111111111",
    displayName: "Ember",
    login: "ember-user",
    color: "#e23d2e",
    backupColor: "#2d6ee8",
    catchphrase: "",
    winSongId: null,
  };
  let failRecords = true;
  let after20Calls = 0;
  const page1 = Array.from({ length: 20 }, (_, i) => ({
    rank: i + 1,
    displayName: i === 0 ? "Ember" : `Player ${i + 1}`,
    games: 3,
    wins: 2,
    losses: 1,
    winRate: 66.7,
    streak: 1,
    you: i === 0,
  }));
  const page2 = [{ rank: 21, displayName: "Player 21", games: 2, wins: 1, losses: 1, winRate: 50, streak: 0, you: false }];

  new WebSocketServer({ server: srv }).on("connection", (ws) => {
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      const base = { id: m.id };
      if (m.type === "profileHello") {
        ws.send(JSON.stringify({ ...base, type: "profileHello", caps: ["profilesV1"], available: true, reason: null }));
      } else if (m.type === "profileLogin") {
        ws.send(JSON.stringify({ ...base, type: "profileSession", profile, credential: "a".repeat(43), expiresAt: Date.now() + 600_000, recoverySetAt: null }));
      } else if (m.type === "profileRecord") {
        if (failRecords) {
          ws.send(JSON.stringify({ ...base, type: "profileError", code: "unavailable" }));
        } else {
          ws.send(JSON.stringify({ ...base, type: "profileRecord", record: { games: 3, wins: 2, losses: 1, winRate: 66.7, streak: 1, lastPlayed: Date.UTC(2026, 10, 10) } }));
        }
      } else if (m.type === "profileWins") {
        if (m.after === 20) {
          after20Calls++;
          setTimeout(() => {
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ ...base, type: "profileWins", rows: page2, next: null }));
          }, 80);
        } else {
          ws.send(JSON.stringify({ ...base, type: "profileWins", rows: page1, next: 20 }));
        }
      }
    });
  });
  return {
    listen: () => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port))),
    setFailRecords: (v) => { failRecords = v; },
    stats: () => ({ after20Calls }),
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise((r) => srv.close(r));
    },
  };
}

const host = makeMockHost();
const hostPort = await host.listen();
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const vitePort = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let code = 0;

const frames = (page, n = 3) =>
  page.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);

try {
  // 1 & 2. ProfileRecords: stale alert cleared after retry + Show more duplicate-click guard.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`records: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`records: ${m.text()}`));
    await page.addInitScript(() => localStorage.setItem("emberisle-jelly", "lite"));
    await page.goto(`http://127.0.0.1:${vitePort}/?host=ws://127.0.0.1:${hostPort}`, { timeout: STEP_MS });
    await page.waitForFunction(() => !!window.__emberisle, { timeout: STEP_MS });

    if (!(await page.evaluate(() => document.querySelector("details.seat-settings").open))) {
      await page.locator("details.seat-settings > summary").click();
    }
    const profileBtn = page.getByRole("button", { name: "Profile", exact: true });
    await profileBtn.scrollIntoViewIfNeeded();
    await profileBtn.click();
    const sheet = page.getByTestId("profile-sheet");
    await sheet.waitFor({ timeout: STEP_MS });

    await sheet.getByLabel("Login", { exact: true }).fill("ember-user");
    await sheet.getByLabel("PIN", { exact: true }).fill("1234");
    await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
    const winsBtn = sheet.locator('[data-opens="wins"]');
    await winsBtn.waitFor({ timeout: STEP_MS });
    await winsBtn.click();

    const records = sheet.getByTestId("profile-records");
    await records.waitFor({ timeout: STEP_MS });
    await records.getByRole("alert").waitFor({ timeout: STEP_MS });
    assert.equal(await records.getByRole("alert").textContent(), "Profiles unavailable on this host.");

    host.setFailRecords(false);
    await records.getByRole("button", { name: "Try again", exact: true }).click();
    await records.getByTestId("wins-row").first().waitFor({ timeout: STEP_MS });
    assert.equal(await records.getByTestId("wins-row").count(), 20);
    assert.equal(await records.getByRole("alert").count(), 0, "Try again recovery clears stale error alert");
    console.log("ok   ProfileRecords: Try again recovery clears stale error alert");

    const showMore = records.getByRole("button", { name: "Show more", exact: true });
    await showMore.waitFor({ timeout: STEP_MS });
    await showMore.evaluate((el) => { el.click(); el.click(); });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="wins-row"]').length >= 21, { timeout: STEP_MS });
    await frames(page, 6);
    assert.equal(host.stats().after20Calls, 1, "rapid double-click on Show more sends only one page request");
    assert.equal(await records.getByTestId("wins-row").count(), 21, "Show more appends page 2 exactly once");
    console.log("ok   ProfileRecords: Show more ignores duplicate clicks before re-render");
    await ctx.close();
  }

  // 3, 4 & 5. CopyText + LobbyView + Lobby SeatName guards.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`lobby: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`lobby: ${m.text()}`));
    await page.addInitScript(() => {
      localStorage.setItem("emberisle-jelly", "lite");
      const active1500 = new Set();
      const origSet = window.setTimeout.bind(window);
      const origClear = window.clearTimeout.bind(window);
      window.__active1500 = active1500;
      window.setTimeout = (fn, ms, ...args) => {
        const id = origSet((...a) => {
          active1500.delete(id);
          return typeof fn === "function" ? fn(...a) : undefined;
        }, ms, ...args);
        if (ms === 1500) active1500.add(id);
        return id;
      };
      window.clearTimeout = (id) => {
        active1500.delete(id);
        return origClear(id);
      };
    });
    await page.goto(`http://127.0.0.1:${vitePort}/`, { timeout: STEP_MS });
    await page.waitForFunction(() => !!window.__emberisle, { timeout: STEP_MS });

    const setLobby = (codeStr, seats) =>
      page.evaluate(({ codeStr, seats }) => {
        window.__emberisle.setState({
          screen: "lobby",
          code: codeStr,
          seatId: "s0",
          isHost: true,
          seats,
          tableVariant: undefined,
          error: null,
        });
      }, { codeStr, seats });

    const s0 = { id: "s0", name: "Ember", color: "#e23d2e", ready: false, host: true, bot: false };
    const s1 = { id: "s1", name: "Tide", color: "#2d6ee8", ready: true, host: false, bot: false, profile: { profileId: "p-tide" } };

    await setLobby("AAAA", [s0, s1]);
    await page.getByTestId("lobby-card").waitFor({ timeout: STEP_MS });

    // 3a. Synchronous throw in navigator.clipboard.writeText falls back cleanly with zero pageerror.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText() { throw new Error("sync deny"); } },
      });
    });
    await page.locator(".lobby-code").click();
    const fallback = page.getByTestId("copy-fallback");
    await fallback.waitFor({ timeout: STEP_MS });
    assert.ok((await fallback.inputValue()).includes("?code=AAAA"), "fallback shows AAAA join link after sync throw");
    console.log("ok   CopyText: synchronous clipboard throw opens fallback without uncaught error");

    // 3b. Changing lobby room code clears stale fallback state.
    await setLobby("BBBB", [s0, s1]);
    await page.waitForFunction(() => document.querySelector('[data-testid="table-code"]')?.textContent === "BBBB", { timeout: STEP_MS });
    await frames(page, 3);
    assert.equal(await page.getByTestId("copy-fallback").count(), 0, "changing room code clears stale copy fallback");
    console.log("ok   LobbyView: room code change clears stale copy fallback");

    // 3c. Pending async clipboard promise settled after room change is ignored.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText() {
            return new Promise((res, rej) => {
              window.__resolveCopy = res;
              window.__rejectCopy = rej;
            });
          },
        },
      });
    });
    await page.locator(".lobby-code").click();
    await page.waitForFunction(() => typeof window.__resolveCopy === "function", { timeout: STEP_MS });
    await setLobby("CCCC", [s0, s1]);
    await page.waitForFunction(() => document.querySelector('[data-testid="table-code"]')?.textContent === "CCCC", { timeout: STEP_MS });
    await page.evaluate(() => window.__resolveCopy());
    await frames(page, 4);
    assert.equal(await page.locator(".lobby-code[data-copied]").count(), 0, "stale clipboard promise does not mark new room as Copied");
    assert.equal(await page.getByTestId("copy-fallback").count(), 0, "stale clipboard promise does not open fallback");
    console.log("ok   CopyText: late clipboard resolution after room change is ignored");

    // 3d. Unmounting LobbyView clears active 1500 ms Copied timer.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.resolve() },
      });
    });
    await page.locator(".lobby-code").click();
    await page.locator(".lobby-code[data-copied]").waitFor({ timeout: STEP_MS });
    assert.ok(await page.evaluate(() => window.__active1500.size > 0), "1500 ms copy timer is active before unmount");
    await page.evaluate(() => window.__emberisle.setState({ screen: "title" }));
    await page.getByTestId("title-card").waitFor({ timeout: STEP_MS });
    await frames(page, 3);
    assert.equal(await page.evaluate(() => window.__active1500.size), 0, "unmounting LobbyView clears 1500 ms copy timer");
    console.log("ok   CopyText: unmount clears pending 1500 ms Copied timer");

    // 4. OwnName keyboard focus return on Escape and Enter, without stealing focus on blur.
    await setLobby("DDDD", [s0, s1]);
    await page.getByTestId("lobby-card").waitFor({ timeout: STEP_MS });

    await page.getByTestId("rename-seat").click();
    await page.getByTestId("rename-input").waitFor({ timeout: STEP_MS });
    await page.keyboard.press("Escape");
    await page.getByTestId("rename-seat").waitFor({ timeout: STEP_MS });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.testid), "rename-seat", "Escape returns focus to rename-seat button");

    await page.getByTestId("rename-seat").click();
    await page.getByTestId("rename-input").waitFor({ timeout: STEP_MS });
    await page.keyboard.type("Nova");
    await page.keyboard.press("Enter");
    await page.getByTestId("rename-seat").waitFor({ timeout: STEP_MS });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.testid), "rename-seat", "Enter returns focus to rename-seat button");

    await page.getByTestId("rename-seat").click();
    await page.getByTestId("rename-input").waitFor({ timeout: STEP_MS });
    const readyBtn = page.getByRole("button", { name: "Ready", exact: true });
    await readyBtn.click();
    await page.getByTestId("rename-seat").waitFor({ timeout: STEP_MS });
    await frames(page, 3);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Ready", "blur to another control does not steal focus back to rename-seat");
    console.log("ok   LobbyView: OwnName returns focus on Escape and Enter without stealing blur focus");

    // 5. SeatName clears open OtherProfileCard when seat leaves so rejoining does not auto-reopen it.
    await page.getByTestId("lobby-player-s1").click();
    await page.getByTestId("other-profile-card").waitFor({ timeout: STEP_MS });
    await setLobby("DDDD", [s0]);
    await page.waitForFunction(() => !document.querySelector('[data-testid="other-profile-card"]'), { timeout: STEP_MS });
    await frames(page, 3);
    await setLobby("DDDD", [s0, s1]);
    await page.getByTestId("lobby-player-s1").waitFor({ timeout: STEP_MS });
    await frames(page, 4);
    assert.equal(await page.getByTestId("other-profile-card").count(), 0, "rejoining seat does not spontaneously reopen closed OtherProfileCard");
    console.log("ok   Lobby: SeatName clears open card state when seat leaves");

    await ctx.close();
  }

  assert.deepEqual(errors, [], `console/page errors: ${errors.join("\n")}`);
  console.log("lobby-records-guards-prove: ok");
} catch (err) {
  code = 1;
  console.error(err);
} finally {
  await browser?.close().catch(() => {});
  await vite?.close().catch(() => {});
  await host?.close().catch(() => {});
  process.exit(code);
}
