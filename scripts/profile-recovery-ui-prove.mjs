// #1437: the recovery code in the title's real Profile sheet (docs/design/recovery-code-1070), against a real rules host
// behind an HTTPS tunnel hop (the profiles-ui-prove fixture). At 430x932, 390x844, 375x812 and 820x1180, each with its own
// profile and visitor address:
//   Sign in shows "Forgot your PIN? Use your recovery code"; Create profile shows "Save your recovery code" with the code from
//   the host's reply, uncut and spelled out for screen readers; Done stays off until "I've written it down" is ticked; the
//   summary says when the code was made; New recovery code refuses a wrong PIN beside the field and shows a new code; after
//   Sign out, the recovery form refuses a 0, O, 1, I, L or U beside the field without sending it, refuses a wrong code with
//   the shared message, and signs in with the right one typed in lower case with a dash.
//   Every screen keeps the sheet on screen, its main button visible and every control at least 44 px; the page never
//   scrolls sideways.
// Then: a profile made before the feature says "No recovery code yet." and gets one with its PIN; a host without recoveryV1
// shows no link; Copy puts the code on the clipboard; a later reply without a code keeps the held one; a temporary PIN's
// Change PIN waits for the recovery chunk, so its new code is shown; codes appear only in the frames that make or use them,
// never in storage. With SHOTS=1 it writes the pictures in docs/proofs/1437/ at device scale 2.
// Run: npm run profile-recovery-ui-prove
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as httpServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const { WebSocketServer } = createRequire(new URL("../server/package.json", import.meta.url))("ws");
const root = new URL("../", import.meta.url);
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-recovery-ui-"));
const SHOTS = process.env.SHOTS === "1" ? "docs/proofs/1437" : null;
const FAILED = "Couldn't use that code. Check your login and code, or try again later.";
const CODE = /^[2-9A-HJKMNP-TV-Z]{6}$/;
let browser, vite, host, oldHost;
const ok = (message) => console.log(`ok ${message}`);

try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  // A profile made before this feature: the store's own create, without a code.
  execFileSync(process.execPath, ["--import", "./register.mjs", "--input-type=module", "-e", `
    import { openProfiles } from "./profiles.mjs";
    import { PLAYER_COLORS } from "../src/lib/game/types.ts";
    const store = openProfiles(process.env.PROFILES_DIR, { colors: PLAYER_COLORS });
    await store.create({ displayName: "Elder", login: "elder-user", pin: "6060", pinConfirm: "6060", color: PLAYER_COLORS[2] });
    process.exit(0);
  `], { cwd: new URL("../server/", import.meta.url), env: { ...process.env, PROFILES_DIR: path.join(dir, "profiles") } });
  // A profile a local reset left on a temporary PIN (the store's own reset, as the admin command runs it).
  const tempPin = JSON.parse(execFileSync(process.execPath, ["--import", "./register.mjs", "--input-type=module", "-e", `
    import { openProfiles } from "./profiles.mjs";
    import { PLAYER_COLORS } from "../src/lib/game/types.ts";
    const store = openProfiles(process.env.PROFILES_DIR, { colors: PLAYER_COLORS });
    const made = await store.create({ displayName: "Tide", login: "tide-user", pin: "7070", pinConfirm: "7070", color: PLAYER_COLORS[1] });
    process.stdout.write(JSON.stringify((await store.localResetPin(made.profile.profileId)).tempPin));
    process.exit(0);
  `], { cwd: new URL("../server/", import.meta.url), env: { ...process.env, PROFILES_DIR: path.join(dir, "profiles") }, encoding: "utf8" }));
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL("../server/", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: path.join(dir, "rooms"), PROFILES_DIR: path.join(dir, "profiles"), PROFILES_DEV: "", SAVE_MS: "20" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let hostLog = "";
  host.stderr.on("data", (d) => (hostLog += d));
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("host startup timed out")), 10000);
    let out = "";
    host.stdout.on("data", (d) => { out += d; hostLog += d; const m = out.match(/listening (\d+)/); if (m) { clearTimeout(timer); resolve(Number(m[1])); } });
    host.once("exit", () => { clearTimeout(timer); reject(Error("host exited before startup")); });
  });
  // A host that offers profiles but not recovery codes (profilesV1 only).
  oldHost = httpServer();
  new WebSocketServer({ server: oldHost }).on("connection", (ws) => ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "profileHello") ws.send(JSON.stringify({ type: "profileHello", id: m.id, caps: ["profilesV1"], available: true, reason: null }));
  }));
  await new Promise((resolve) => oldHost.listen(0, "127.0.0.1", resolve));
  // One tunnel path per visitor address, so each size has its own create and code allowances.
  const tunnel = (ip) => ({ target: `ws://127.0.0.1:${port}`, ws: true, changeOrigin: false, headers: { "cf-connecting-ip": ip, "x-forwarded-proto": "https" } });
  const proxy = { "^/old(?:[/?]|$)": { target: `ws://127.0.0.1:${oldHost.address().port}`, ws: true } };
  for (let i = 0; i < 6; i++) proxy[`^/h${i}(?:[/?]|$)`] = tunnel(`198.51.100.${40 + i}`);
  proxy["^/h6(?:[/?]|$)"] = tunnel("198.51.100.46");
  vite = await createServer({
    root: root.pathname, logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, hmr: false, https: { key: readFileSync(path.join(dir, "key.pem")), cert: readFileSync(path.join(dir, "cert.pem")) }, proxy },
  });
  await vite.listen();
  const origin = `https://127.0.0.1:${vite.httpServer.address().port}`;
  const wss = origin.replace("https:", "wss:");
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const errors = [];
  const observe = () => {
    window.__wire = [];
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) { super(...args); this.addEventListener("message", (e) => window.__wire.push({ dir: "in", raw: String(e.data) })); }
      send(raw) { window.__wire.push({ dir: "out", raw: String(raw) }); return super.send(raw); }
    };
  };
  const open = async (opts, hostPath) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...opts });
    await ctx.addInitScript(observe);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && !/WebSocket connection|ERR_CONNECTION_REFUSED/.test(m.text()) && errors.push(m.text()));
    await page.goto(`${origin}/?host=${encodeURIComponent(`${wss}/${hostPath}`)}`);
    await page.waitForFunction(() => window.__emberisle);
    return page;
  };
  const sheet = (page) => page.getByRole("dialog", { name: "Profile" });
  const openSheet = async (page) => {
    if (!(await page.evaluate(() => document.querySelector("details.seat-settings").open))) await page.locator("details.seat-settings > summary").click();
    const button = page.getByRole("button", { name: "Profile", exact: true });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await sheet(page).waitFor();
  };
  const frames = async (page) => (await page.evaluate(() => window.__wire)).map((f) => ({ ...f, m: JSON.parse(f.raw) }));
  const sent = async (page, type) => (await frames(page)).filter((f) => f.dir === "out" && f.m.type === type);
  // The sheet on screen, no sideways scroll, every control at least 44 px, and the screen's main button inside the sheet.
  const fits = async (page, main, label) => {
    const bad = await page.evaluate((main) => {
      const d = document.querySelector('[data-testid="profile-sheet"]');
      const out = [];
      const r = d.getBoundingClientRect();
      if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) out.push(`sheet ${r.left},${r.top},${r.right},${r.bottom}`);
      if (d.scrollWidth > d.clientWidth) out.push("sheet scrolls sideways");
      if (document.documentElement.scrollWidth > innerWidth) out.push("page scrolls sideways");
      for (const el of d.querySelectorAll('button, input:not([type="checkbox"]), label:has(input[type="checkbox"])')) {
        const b = el.getBoundingClientRect();
        if (b.height < 44 || b.width < 44) out.push(`${el.getAttribute("aria-label") || el.textContent.trim() || el.tagName} ${b.width}x${b.height}`);
      }
      const button = [...d.querySelectorAll("button")].find((b) => b.textContent.trim() === main);
      if (!button) out.push(`no ${main} button`);
      else {
        const b = button.getBoundingClientRect();
        if (b.top < r.top || b.bottom > r.bottom + 0.5) out.push(`${main} outside the sheet ${b.top},${b.bottom}`);
      }
      return out;
    }, main);
    assert.deepEqual(bad, [], `${label}: sheet on screen, ${main} visible and every control at least 44 px`);
  };
  const shot = async (page, name, size) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${name}-${size}.png` });
  };
  const codeOf = async (page) => page.getByTestId("recovery-code").innerText();
  const tickAndDone = async (page) => {
    const done = sheet(page).getByRole("button", { name: "Done" });
    assert.ok(await done.isDisabled(), "Done stays off until the tick");
    await sheet(page).getByLabel("I've written it down").check();
    assert.ok(await done.isEnabled(), "the tick turns Done on");
    await done.click();
  };

  const sizes = [
    { name: "430x932", opts: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } },
    { name: "390x844", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "375x812", opts: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: "820x1180", opts: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
  ];
  const allCodes = [];
  for (const [i, size] of sizes.entries()) {
    const login = `rowan-${i}`;
    const page = await open({ ...size.opts, deviceScaleFactor: SHOTS ? 2 : 1 }, `h${i}`);
    await openSheet(page);
    const forgot = sheet(page).getByRole("button", { name: "Forgot your PIN? Use your recovery code" });
    await forgot.waitFor();
    await fits(page, "Sign in", `${size.name} sign in`);
    await shot(page, "signin", size.name);

    // Create: the save screen shows the host's code, uncut, spelled out, with Done off until the tick.
    await sheet(page).getByRole("button", { name: "Create profile" }).click();
    await sheet(page).getByLabel("Display name").fill("Rowan");
    await sheet(page).getByLabel("Login").fill(login);
    await sheet(page).getByLabel("PIN", { exact: true }).fill("4821");
    await sheet(page).getByLabel("Confirm PIN").fill("4821");
    await sheet(page).getByRole("button", { name: "Create profile" }).last().click();
    await sheet(page).getByRole("heading", { name: "Save your recovery code" }).waitFor();
    const made = (await frames(page)).find((f) => f.dir === "in" && f.m.type === "profileSession").m.recoveryCode;
    assert.match(made, CODE, `${size.name}: the host's reply carries a six-symbol code`);
    allCodes.push(made);
    assert.equal(await codeOf(page), `${made.slice(0, 3)}-${made.slice(3)}`, `${size.name}: the code shows as two groups of three`);
    const box = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="recovery-code"]');
      return { cut: t.scrollWidth > t.clientWidth + 1, spoken: t.getAttribute("aria-label"), group: t.closest('[role="group"]')?.getAttribute("aria-label"), focused: document.activeElement?.getAttribute("aria-label") };
    });
    assert.deepEqual(box, { cut: false, spoken: made.split("").join(", "), group: "Your recovery code", focused: "Your recovery code" }, `${size.name}: the code is uncut, spelled out, in a labelled group that takes the focus`);
    assert.equal(await sheet(page).getByText("Signed in as").count(), 0, `${size.name}: the save screen comes before the summary`);
    await fits(page, "Done", `${size.name} save`);
    await shot(page, "save", size.name);
    await tickAndDone(page);

    // The summary says when the code was made and offers a new one.
    await sheet(page).getByText("Signed in as").waitFor();
    await sheet(page).getByText(/^Recovery code made \d{1,2} [A-Z][a-z]{2} \d{4}\.$/).waitFor();
    await fits(page, "Done", `${size.name} summary`);
    await shot(page, "summary", size.name);

    // New recovery code: a wrong PIN beside the field, then a new code.
    await sheet(page).getByRole("button", { name: "New recovery code" }).click();
    const newForm = sheet(page).getByRole("form", { name: "New recovery code" });
    await newForm.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.closest("label")?.firstChild?.textContent), "Current PIN", `${size.name}: the form focuses Current PIN`);
    await fits(page, "Make new code", `${size.name} new code`);
    await newForm.getByLabel("Current PIN").fill("4821");
    await shot(page, "newcode", size.name);
    await newForm.getByLabel("Current PIN").fill("0000");
    await newForm.getByRole("button", { name: "Make new code" }).click();
    await page.locator("#recovery-pin-error").filter({ hasText: "Check your current PIN" }).waitFor();
    await newForm.getByLabel("Current PIN").fill("4821");
    await newForm.getByRole("button", { name: "Make new code" }).click();
    await sheet(page).getByRole("heading", { name: "Save your recovery code" }).waitFor();
    const second = (await frames(page)).find((f) => f.dir === "in" && f.m.type === "profileRecoveryCode").m.code;
    assert.ok(CODE.test(second) && second !== made, `${size.name}: New recovery code shows a new code`);
    allCodes.push(second);
    assert.equal(await codeOf(page), `${second.slice(0, 3)}-${second.slice(3)}`);
    await tickAndDone(page);
    await sheet(page).getByText("Signed in as").waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-opens") === "code", null, { timeout: 5000 }).catch(() => assert.fail(`${size.name}: focus returns to New recovery code`));

    // Sign out, then Forgot your PIN.
    await sheet(page).getByRole("button", { name: "Sign out" }).click();
    await forgot.click();
    const form = sheet(page).getByRole("form", { name: "Use your recovery code" });
    await form.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.closest("label")?.firstChild?.textContent), "Login", `${size.name}: the form focuses Login`);
    assert.equal(await form.getByLabel("Recovery code").getAttribute("aria-describedby"), "recovery-code-hint", `${size.name}: the code's hint is linked to its field`);
    await form.getByLabel("Login").fill(login);
    await form.getByLabel("Recovery code").fill(`${second.slice(0, 3)}-${second.slice(3)}`);
    await form.getByLabel("New PIN", { exact: true }).fill("1357");
    await form.getByLabel("Confirm new PIN").fill("1357");
    await fits(page, "Reset PIN and sign in", `${size.name} recover`);
    await shot(page, "recover", size.name);
    await form.getByLabel("Recovery code").fill("K7Q-M4O");
    await form.getByRole("button", { name: "Reset PIN and sign in" }).click();
    assert.match(await page.locator("#recovery-code-error").innerText(), /never uses 0, O, 1, I, L or U/);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-describedby")), "recovery-code-hint recovery-code-error", `${size.name}: the refused code field takes the focus`);
    assert.equal((await sent(page, "profileRecover")).length, 0, `${size.name}: a code with a left-out symbol is never sent`);
    const wrong = second.slice(0, 5) + (second[5] === "Z" ? "Y" : "Z");
    await form.getByLabel("Recovery code").fill(wrong);
    await form.getByRole("button", { name: "Reset PIN and sign in" }).click();
    await form.getByRole("alert").filter({ hasText: FAILED }).waitFor();
    if (size.name === "390x844") { await form.getByRole("alert").scrollIntoViewIfNeeded(); await shot(page, "recover-error", size.name); }
    await form.getByLabel("Recovery code").fill(` ${second.slice(0, 3).toLowerCase()}-${second.slice(3).toLowerCase()} `);
    await form.getByRole("button", { name: "Reset PIN and sign in" }).click();
    await sheet(page).getByText("Signed in as Rowan").waitFor();
    const recovered = (await sent(page, "profileRecover")).map((f) => f.m);
    assert.deepEqual(recovered.map((m) => [m.login, m.code, m.newPin, m.newPinConfirm]), [[login, wrong, "1357", "1357"], [login, second, "1357", "1357"]], `${size.name}: the form sends the code upper-cased without its dash and spaces`);
    assert.equal(await page.evaluate(() => Object.values(localStorage).some((v) => /"credential"/.test(v))), true, `${size.name}: Remember me keeps the recovered session on this device`);
    ok(`${size.name}: sign in link, save screen (Done off until ticked), summary, New recovery code and Forgot your PIN all fit, and each refusal sits beside its field`);
    if (i > 0) await page.context().close();
    else sizes.first = page;
  }

  // Copy puts the code on the clipboard (the player's choice).
  {
    const page = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ["clipboard-read", "clipboard-write"] }, "h4");
    await openSheet(page);
    await sheet(page).getByRole("button", { name: "Create profile" }).click();
    await sheet(page).getByLabel("Display name").fill("Copy");
    await sheet(page).getByLabel("Login").fill("copy-user");
    await sheet(page).getByLabel("PIN", { exact: true }).fill("2468");
    await sheet(page).getByLabel("Confirm PIN").fill("2468");
    await sheet(page).getByRole("button", { name: "Create profile" }).last().click();
    await sheet(page).getByRole("button", { name: "Copy" }).click();
    await sheet(page).getByRole("button", { name: "Copied" }).waitFor();
    const code = (await frames(page)).find((f) => f.m.type === "profileSession").m.recoveryCode;
    allCodes.push(code);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code, "Copy puts the bare code on the clipboard");
    // Closing the sheet keeps the code in this page's memory: the save screen is back on the next opening, until Done.
    await page.keyboard.press("Escape");
    await sheet(page).waitFor({ state: "detached" });
    await openSheet(page);
    await sheet(page).getByRole("heading", { name: "Save your recovery code" }).waitFor();
    assert.equal(await codeOf(page), `${code.slice(0, 3)}-${code.slice(3)}`, "the same code shows again until Done");
    // A later session reply that carries no code (an edit, a resume) leaves the held code and its save screen in place.
    await page.evaluate(async () => { const c = window.__emberisle.getState().profile; await c.edit({ catchphrase: "Still here" }); await c.resume(); });
    const later = (await frames(page)).filter((f) => f.dir === "in" && f.m.type === "profileSession").slice(1).map((f) => f.m);
    assert.deepEqual(later.map((m) => [m.profile.catchphrase, "recoveryCode" in m]), [["Still here", false], ["Still here", false]], "an edit and a resume answer without a code");
    await sheet(page).getByRole("heading", { name: "Save your recovery code" }).waitFor();
    assert.equal(await codeOf(page), `${code.slice(0, 3)}-${code.slice(3)}`, "a reply without a code keeps the held code on the save screen");
    await tickAndDone(page);
    await page.context().close();
    ok("Copy puts the code on the clipboard; closing the sheet before Done shows the same save screen again on the next opening");
    ok("an edit or resume reply without a code keeps the held code on the save screen until Done");
  }

  // A profile made before the feature has no code: the summary says so and Get a recovery code makes one with the PIN.
  {
    const page = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 }, "h5");
    await openSheet(page);
    await sheet(page).getByLabel("Login").fill("elder-user");
    await sheet(page).getByLabel("PIN", { exact: true }).fill("6060");
    await sheet(page).getByRole("button", { name: "Sign in", exact: true }).click();
    await sheet(page).getByText("No recovery code yet.").waitFor();
    await shot(page, "summary-no-code", "390x844");
    await sheet(page).getByRole("button", { name: "Get a recovery code" }).click();
    const form = sheet(page).getByRole("form", { name: "New recovery code" });
    await form.getByRole("heading", { name: "Get a recovery code" }).waitFor();
    await form.getByLabel("Current PIN").fill("6060");
    await form.getByRole("button", { name: "Make new code" }).click();
    await sheet(page).getByRole("heading", { name: "Save your recovery code" }).waitFor();
    allCodes.push((await frames(page)).find((f) => f.m.type === "profileRecoveryCode").m.code);
    await tickAndDone(page);
    await sheet(page).getByText(/^Recovery code made /).waitFor();
    await sheet(page).getByRole("button", { name: "New recovery code" }).waitFor();
    await page.context().close();
    ok("a profile with no code says so, and Get a recovery code makes one with its PIN");
  }

  // A temporary PIN's change answers with a new code, so Change PIN opens only once the recovery chunk is in. With that chunk
  // blocked, the summary says the form couldn't load and no PIN change is sent; once it loads, the change shows the code.
  {
    const before = errors.length;
    const page = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, "h6");
    await page.route(/ProfileRecovery\.tsx/, (route) => route.abort("connectionrefused"));
    await openSheet(page);
    await sheet(page).getByLabel("Login").fill("tide-user");
    await sheet(page).getByLabel("PIN", { exact: true }).fill(tempPin);
    await sheet(page).getByRole("button", { name: "Sign in", exact: true }).click();
    await sheet(page).getByRole("alert").filter({ hasText: "Couldn't load this form. Try again." }).waitFor();
    assert.equal(await sheet(page).getByRole("form", { name: "Change PIN" }).count(), 0, "Change PIN waits for the recovery chunk");
    assert.equal((await sent(page, "profileChangePin")).length, 0, "no PIN change is sent while the recovery chunk is down");
    await page.unroute(/ProfileRecovery\.tsx/);
    await sheet(page).getByRole("button", { name: "Change PIN" }).click();
    const forced = sheet(page).getByRole("form", { name: "Change PIN" });
    await forced.waitFor();
    await forced.getByLabel("Current PIN").fill(tempPin);
    await forced.getByLabel("New PIN", { exact: true }).fill("9191");
    await forced.getByLabel("Confirm new PIN").fill("9191");
    await forced.getByRole("button", { name: "Save PIN" }).click();
    await sheet(page).getByRole("heading", { name: "Save your recovery code" }).waitFor();
    const minted = (await frames(page)).filter((f) => f.dir === "in" && f.m.type === "profileSession").at(-1).m.recoveryCode;
    assert.match(minted, CODE, "the PIN change's reply carries a new code");
    allCodes.push(minted);
    assert.equal(await codeOf(page), `${minted.slice(0, 3)}-${minted.slice(3)}`, "the save screen shows the PIN change's code");
    await tickAndDone(page);
    await sheet(page).getByText("Signed in as Tide").waitFor();
    await page.context().close();
    // The blocked chunk's own load failures, which React reports as it hands them to the sheet's boundaries, are expected here.
    const blocked = /Failed to fetch dynamically imported module: \S+\/ProfileRecovery\.tsx(\?retry=\d+)? The above error occurred in the <Lazy> component/;
    errors.push(...errors.splice(before).filter((e) => !blocked.test(e)));
    ok("a temporary PIN's Change PIN waits for the recovery chunk, so the new code it answers with is always shown");
  }

  // A host without recoveryV1 shows no link, and its sign in still works as before.
  {
    const page = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, "old");
    await openSheet(page);
    await sheet(page).getByRole("button", { name: "Sign in", exact: true }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await sheet(page).getByRole("button", { name: /Forgot your PIN/ }).count(), 0, "no recovery link without recoveryV1");
    await page.context().close();
    ok("a host without recoveryV1 shows no recovery link");
  }

  // Codes appear only in the frames that make or use them, and never in storage or the host's log.
  const page = sizes.first;
  const codes = new Set(allCodes);
  for (const f of await frames(page)) {
    for (const c of codes) {
      if (!f.raw.includes(`"${c}"`)) continue;
      assert.ok((f.dir === "in" && ["profileSession", "profileRecoveryCode"].includes(f.m.type)) || (f.dir === "out" && f.m.type === "profileRecover"), `a code only in its own frames, saw ${f.dir} ${f.m.type}`);
    }
  }
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.ok(![...codes].some((c) => stored.includes(c)), "no code in browser storage");
  assert.ok(![...codes].some((c) => hostLog.includes(c)), "no code in the host's log");
  assert.ok(![...codes].some((c) => readFileSync(path.join(dir, "profiles", "profiles.json"), "utf8").includes(c)), "no code in the profile file");
  await page.context().close();
  ok("codes stay in their own frames, never in browser storage, the host's log or the profile file");

  assert.deepEqual(errors, [], "no browser errors");
  console.log("profile-recovery-ui-prove: pass");
} finally {
  await browser?.close();
  await vite?.close();
  oldHost?.closeAllConnections();
  if (oldHost) await new Promise((resolve) => oldHost.close(resolve));
  if (host && host.exitCode === null) { host.kill("SIGTERM"); await new Promise((resolve) => { host.once("exit", resolve); setTimeout(() => { host.kill("SIGKILL"); resolve(); }, 5000).unref(); }); }
  rmSync(dir, { recursive: true, force: true });
}
