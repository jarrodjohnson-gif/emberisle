// ProfileSheet and ProfileRecovery state and focus guards:
// - Back to sign in from Forgot your PIN returns focus to the Forgot your PIN link.
// - Switching between Sign in and Create profile clears typed PIN fields.
// - Signing out after Create profile on a profilesV1-only host returns to Sign in, not Create profile.
// - Transitioning from New recovery code to Save your recovery code resets form state.
// Zero page or console errors. Run: npm run profile-recovery-guards-prove
import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { createRequire } from "node:module";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const { WebSocketServer } = createRequire(new URL("../server/package.json", import.meta.url))("ws");
const STEP_MS = 30_000;

function makeMockHost(recovery) {
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
  let setAt = null;
  new WebSocketServer({ server: srv }).on("connection", (ws) => {
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      const base = { id: m.id };
      if (m.type === "profileHello") {
        ws.send(JSON.stringify({ ...base, type: "profileHello", caps: recovery ? ["profilesV1", "recoveryV1"] : ["profilesV1"], available: true, reason: null }));
      } else if (m.type === "profileCreate" || m.type === "profileLogin") {
        const reply = { ...base, type: "profileSession", profile, credential: "a".repeat(43), expiresAt: Date.now() + 600_000, recoverySetAt: setAt };
        if (recovery && m.type === "profileCreate") {
          setAt = Date.now();
          reply.recoverySetAt = setAt;
          reply.recoveryCode = "K7QM4X";
        }
        ws.send(JSON.stringify(reply));
      } else if (m.type === "profileNewCode") {
        setAt = Date.now();
        ws.send(JSON.stringify({ ...base, type: "profileRecoveryCode", code: "M9NP3W", setAt }));
      } else if (m.type === "profileLogout") {
        ws.send(JSON.stringify({ ...base, type: "profileLoggedOut" }));
      }
    });
  });
  return {
    listen: () => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port))),
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise((r) => srv.close(r));
    },
  };
}

const recHost = makeMockHost(true);
const oldHost = makeMockHost(false);
const recPort = await recHost.listen();
const oldPort = await oldHost.listen();

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const vitePort = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let code = 0;

try {
  const openSheet = async (page) => {
    await page.waitForFunction(() => window.__emberisle);
    if (!(await page.evaluate(() => document.querySelector("details.seat-settings").open))) await page.locator("details.seat-settings > summary").click();
    const button = page.getByRole("button", { name: "Profile", exact: true });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const sheet = page.getByTestId("profile-sheet");
    await sheet.waitFor();
    return sheet;
  };

  // 1. Recovery host: Forgot your PIN focus return + Sign in / Create PIN clear + code->save reset.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`rec: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`rec: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${vitePort}/?host=${encodeURIComponent(`ws://127.0.0.1:${recPort}`)}`);
    const sheet = await openSheet(page);

    // Wait for Forgot your PIN link (recovery chunk loaded).
    const forgot = sheet.getByRole("button", { name: "Forgot your PIN? Use your recovery code" });
    await forgot.waitFor();

    // Check 1: Back to sign in from Forgot your PIN returns focus to Forgot your PIN link.
    await forgot.click();
    await sheet.getByRole("heading", { name: "Forgot your PIN?" }).waitFor();
    await sheet.getByRole("button", { name: "Back to sign in" }).click();
    await forgot.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-opens") === "recover", null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-opens")), "recover", "Back to sign in focuses Forgot your PIN link");

    // Check 2: Switching Sign in <-> Create profile clears typed PIN fields.
    await sheet.getByLabel("PIN", { exact: true }).fill("4821");
    await sheet.getByRole("button", { name: "Create profile" }).click();
    await sheet.getByRole("form", { name: "Create profile" }).waitFor();
    assert.equal(await sheet.getByLabel("PIN", { exact: true }).inputValue(), "", "switching Sign in -> Create profile clears PIN");

    await sheet.getByLabel("PIN", { exact: true }).fill("4821");
    await sheet.getByLabel("Confirm PIN", { exact: true }).fill("4821");
    await sheet.getByRole("button", { name: "Sign in instead" }).click();
    await sheet.getByRole("form", { name: "Sign in" }).waitFor();
    assert.equal(await sheet.getByLabel("PIN", { exact: true }).inputValue(), "", "switching Create profile -> Sign in clears PIN");

    // Check 3: mounted ProfileRecovery resets PIN, errors, written, and copied across code <-> save.
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
    await sheet.getByLabel("Login").fill("ember-user");
    await sheet.getByLabel("PIN", { exact: true }).fill("4821");
    await sheet.getByRole("button", { name: "Sign in", exact: true }).click();
    await sheet.getByText("Signed in as").waitFor();
    await sheet.getByRole("button", { name: "Get a recovery code" }).click();
    await sheet.getByLabel("Current PIN").fill("48");
    await sheet.getByRole("button", { name: "Make new code" }).click();
    await sheet.getByText("Enter four digits.").waitFor();
    await sheet.getByLabel("Current PIN").fill("4821");
    // Keep view="code" while switching kind code -> save -> code -> save on the same mounted instance.
    await page.evaluate(() => window.__emberisle.getState().profile.code("K7QM4X", Date.now()));
    await sheet.getByRole("heading", { name: "Save your recovery code" }).waitFor();
    await sheet.getByRole("button", { name: "Copy" }).click();
    await sheet.getByRole("button", { name: "Copied" }).waitFor();
    await sheet.getByLabel("I've written it down").check();
    assert.equal(await sheet.getByRole("button", { name: "Done" }).isDisabled(), false, "Done enables when written is ticked");

    await page.evaluate(() => window.__emberisle.getState().profile.code(null, Date.now()));
    await sheet.getByLabel("Current PIN").waitFor();
    assert.equal(await sheet.getByLabel("Current PIN").inputValue(), "", "returning to code clears typed PIN");
    assert.equal(await sheet.getByText("Enter four digits.").count(), 0, "returning to code clears prior field error");

    await sheet.getByLabel("Current PIN").fill("4821");
    await sheet.getByRole("button", { name: "Make new code" }).click();
    await sheet.getByRole("heading", { name: "Save your recovery code" }).waitFor();
    assert.equal(await sheet.getByLabel("I've written it down").isChecked(), false, "save screen starts with written box unchecked");
    assert.equal(await sheet.getByRole("button", { name: "Done" }).isDisabled(), true, "save screen keeps Done disabled until ticked");
    assert.equal(await sheet.getByRole("button", { name: "Copy", exact: true }).count(), 1, "save screen resets Copied back to Copy");
    assert.equal(await sheet.locator("input").evaluateAll((els) => els.some((el) => el.value === "4821")), false, "no input on save screen holds typed PIN");
    await sheet.getByLabel("I've written it down").check();
    await sheet.getByRole("button", { name: "Done" }).click();
    await sheet.getByRole("button", { name: "New recovery code" }).click();
    assert.equal(await sheet.getByLabel("Current PIN").inputValue(), "", "New recovery code opens with empty PIN");

    console.log("ok recovery host: focus return, PIN clear on form switch, and code->save reset");
    await ctx.close();
  }

  // 2. profilesV1-only host: Sign out after Create profile returns to Sign in, not Create profile.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`old: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`old: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${vitePort}/?host=${encodeURIComponent(`ws://127.0.0.1:${oldPort}`)}`);
    const sheet = await openSheet(page);

    await sheet.getByRole("button", { name: "Create profile" }).click();
    await sheet.getByRole("form", { name: "Create profile" }).waitFor();
    await sheet.getByLabel("Display name").fill("Ember");
    await sheet.getByLabel("Login").fill("ember-user");
    await sheet.getByLabel("PIN", { exact: true }).fill("4821");
    await sheet.getByLabel("Confirm PIN", { exact: true }).fill("4821");
    await sheet.getByRole("button", { name: "Create profile" }).last().click();
    await sheet.getByText("Signed in as").waitFor();

    await sheet.getByRole("button", { name: "Sign out" }).click();
    await sheet.getByRole("form", { name: "Sign in" }).waitFor({ timeout: 3000 });
    assert.equal(await sheet.getByRole("form", { name: "Create profile" }).count(), 0, "Sign out lands on Sign in, not Create profile");

    console.log("ok profilesV1-only host: Sign out after Create profile returns to Sign in");
    await ctx.close();
  }

  assert.equal(errors.length, 0, `page errors:\n${errors.join("\n")}`);
  console.log("profile-recovery-guards-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  await recHost.close();
  await oldHost.close();
}
process.exit(code);
