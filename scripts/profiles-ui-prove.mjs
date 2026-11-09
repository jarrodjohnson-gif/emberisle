// #766 first slice: the title's Profile sheet against real rules hosts behind an HTTPS tunnel hop (the client proof's fixture).
// At 390x844, 844x390, 440x956, 956x440 and 1280x720: the Profile button and every sheet control are at least 44 px and on
// screen, focus starts on Close, Tab stays inside, Escape closes and focus returns to Profile, and guest Play, Host and the
// typed join code stay usable. Then, on the real host: field errors sit beside their fields; create and sign in; a second
// device signs in and out without revoking the first; a remembered profile resumes only after a press; another host never
// sees the remembered credential; blocked storage and offline or unsupported hosts leave guest play and the saved seat alone;
// Host a table carries the credential once and the seat shows the profile. PINs and credentials never appear in any other
// frame. Second slice, on host B: Edit profile and Change PIN fit at 440x956, 956x440 and 1280x720, take and return the
// focus, refuse beside their fields, persist across a resume, reject the old login, sign the other device out on a PIN
// change and still attach on Host a table. On host C, a temporary PIN from a local reset must be changed before anything
// else. With SHOTS=1 it writes the pictures in docs/proofs/766/ at device scale 2.
// Run: npm run profiles-ui-prove
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as httpServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const { WebSocketServer } = createRequire(new URL("../server/package.json", import.meta.url))("ws");
const root = new URL("../", import.meta.url);
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-profile-ui-"));
const SHOTS = process.env.SHOTS === "1" ? "docs/proofs/766" : null;
const hosts = [];
let browser, vite, legacyServer;
const ok = (message) => console.log(`ok ${message}`);

async function host(name) {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL("../server/", import.meta.url),
    env: { ...process.env, PORT: "0", ROOMS_DIR: path.join(dir, name, "rooms"), PROFILES_DIR: path.join(dir, name, "profiles"), PROFILES_DEV: "", SAVE_MS: "20" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const item = { proc };
  hosts.push(item);
  item.port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("profile host startup timed out")), 10000);
    let output = "";
    proc.stdout.on("data", (data) => { output += data; const m = output.match(/listening (\d+)/); if (m) { clearTimeout(timer); resolve(Number(m[1])); } });
    proc.once("exit", () => { clearTimeout(timer); reject(Error("profile host exited before startup")); });
  });
  return item;
}

// Every frame each page sends or receives, with its socket URL. Nothing in the app changes.
const observe = () => {
  window.__wire = [];
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      this.addEventListener("message", (e) => window.__wire.push({ url: this.url, dir: "in", raw: String(e.data) }));
    }
    send(raw) { window.__wire.push({ url: this.url, dir: "out", raw: String(raw) }); return super.send(raw); }
  };
};
// Only the profile keys refuse: blocking every key stops the title from loading at all, on main too (filed separately).
const blockStorage = () => {
  for (const name of ["getItem", "setItem", "removeItem"]) {
    const native = Storage.prototype[name];
    Storage.prototype[name] = function (key, ...rest) {
      if (String(key).startsWith("emberisle-profile:")) throw new DOMException("blocked", "SecurityError");
      return native.call(this, key, ...rest);
    };
  }
};

try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  const a = await host("a"), b = await host("b");
  // Host C starts with a profile a local reset left on a temporary PIN (the store's own reset, as the admin command runs it).
  const tempPin = JSON.parse(execFileSync(process.execPath, ["--import", "./register.mjs", "--input-type=module", "-e", `
    import { openProfiles } from "./profiles.mjs";
    import { PLAYER_COLORS } from "../src/lib/game/types.ts";
    const store = openProfiles(process.env.PROFILES_DIR, { colors: PLAYER_COLORS });
    const made = await store.create({ displayName: "Kelp", login: "kelp-user", pin: "5555", pinConfirm: "5555", color: PLAYER_COLORS[3] });
    process.stdout.write(JSON.stringify((await store.localResetPin(made.profile.profileId)).tempPin));
  `], { cwd: new URL("../server/", import.meta.url), env: { ...process.env, PROFILES_DIR: path.join(dir, "c", "profiles") }, encoding: "utf8" }));
  const c = await host("c");
  legacyServer = httpServer();
  const legacy = new WebSocketServer({ server: legacyServer });
  legacy.on("connection", (ws) => ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    assert.ok(!m.credential && !m.pin && (m.type === "profileHello" || !m.type.startsWith("profile")), `an unsupported host never receives a credential, saw ${m.type}`);
    if (m.type === "profileHello") ws.send(JSON.stringify({ type: "profileHello", id: m.id, caps: [], available: false }));
  }));
  await new Promise((resolve) => legacyServer.listen(0, "127.0.0.1", resolve));
  const tunnel = (port) => ({ target: `ws://127.0.0.1:${port}`, ws: true, changeOrigin: false, headers: { "cf-connecting-ip": "198.51.100.25", "x-forwarded-proto": "https" } });
  vite = await createServer({
    root: root.pathname, logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, hmr: false, https: { key: readFileSync(path.join(dir, "key.pem")), cert: readFileSync(path.join(dir, "cert.pem")) },
      // Anchored: a bare "/a" key is a prefix match and would send /audio/* to host A.
      proxy: { "^/a(?:[/?]|$)": tunnel(a.port), "^/b(?:[/?]|$)": tunnel(b.port), "^/c(?:[/?]|$)": tunnel(c.port), "^/legacy(?:[/?]|$)": { target: `ws://127.0.0.1:${legacyServer.address().port}`, ws: true } } },
  });
  await vite.listen();
  const origin = `https://127.0.0.1:${vite.httpServer.address().port}`;
  const wss = origin.replace("https:", "wss:");
  const A = `${wss}/a`, B = `${wss}/b`;
  const at = (hostUrl) => `${origin}/?host=${encodeURIComponent(hostUrl)}`;
  browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const errors = [];
  const open = async (opts, init = []) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...opts });
    await ctx.addInitScript(observe);
    for (const script of init) await ctx.addInitScript(script);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && !/WebSocket connection|ERR_CONNECTION_REFUSED/.test(m.text()) && errors.push(m.text()));
    return page;
  };
  const goto = async (page, hostUrl) => { await page.goto(at(hostUrl)); await page.waitForFunction(() => window.__emberisle); };
  const sheet = (page) => page.getByRole("dialog", { name: "Profile" });
  // Profile sits inside the closed "Your seat" settings, below the colours.
  const reveal = async (page) => {
    if (!(await page.evaluate(() => document.querySelector("details.seat-settings").open))) await page.locator("details.seat-settings > summary").click();
  };
  const openSheet = async (page) => {
    await reveal(page);
    const button = page.getByRole("button", { name: "Profile", exact: true });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await sheet(page).waitFor();
  };
  const wire = (page) => page.evaluate(() => window.__wire);
  // #1437: Create, and the change of a temporary PIN, first show "Save your recovery code": tick "I've written it down", press Done.
  const saveCode = async (page) => {
    await sheet(page).getByLabel("I've written it down").check();
    await sheet(page).getByRole("button", { name: "Done" }).click();
  };

  // Layout, focus and guest controls at the five sizes.
  const sizes = [
    { name: "390x844", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "844x390", opts: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
    { name: "440x956", opts: { viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true } },
    { name: "956x440", opts: { viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true } },
    { name: "1280x720", opts: { viewport: { width: 1280, height: 720 } } },
  ];
  const fits = async (page, label) => {
    const bad = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="profile-sheet"]');
      const out = [];
      const r = d.getBoundingClientRect();
      if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) out.push(`sheet ${r.left},${r.top},${r.right},${r.bottom}`);
      if (d.scrollWidth > d.clientWidth) out.push("sheet scrolls sideways");
      for (const el of d.querySelectorAll('button, input:not([type="checkbox"]), label:has(input[type="checkbox"])')) {
        const b = el.getBoundingClientRect();
        if (b.height < 44 || b.width < 44) out.push(`${el.getAttribute("aria-label") || el.textContent.trim() || el.tagName} ${b.width}x${b.height}`);
      }
      // The main action shows inside the sheet without scrolling (sticky action row).
      const submit = d.querySelector('button[type="submit"]').getBoundingClientRect();
      if (submit.top < r.top || submit.bottom > r.bottom + 0.5) out.push(`submit outside the sheet ${submit.top},${submit.bottom}`);
      return out;
    });
    assert.deepEqual(bad, [], `${label}: sheet on screen and every control at least 44 px`);
  };
  for (const size of sizes) {
    const page = await open(size.opts);
    await goto(page, A);
    await reveal(page);
    const profile = page.getByRole("button", { name: "Profile", exact: true });
    await profile.scrollIntoViewIfNeeded();
    const box = await profile.boundingBox();
    assert.ok(box.height >= 44 && box.width >= 44, `${size.name}: Profile button is ${box.width}x${box.height}`);
    await openSheet(page);
    await sheet(page).getByRole("button", { name: "Sign in", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close", `${size.name}: focus starts on Close`);
    assert.match(await page.getByTestId("profile-host").innerText(), new RegExp(`Host: ${A.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${size.name}: the host shows before any credential`);
    await fits(page, `${size.name} sign in`);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => document.querySelector('[data-testid="profile-sheet"]').contains(document.activeElement)), `${size.name}: Tab stays in the sheet`);
    }
    if (SHOTS && ["390x844", "844x390", "1280x720"].includes(size.name)) {
      const shot = await open({ ...size.opts, deviceScaleFactor: 2 });
      await goto(shot, A);
      await reveal(shot);
      await shot.getByRole("button", { name: "Profile", exact: true }).scrollIntoViewIfNeeded();
      await shot.waitForTimeout(500);
      mkdirSync(SHOTS, { recursive: true });
      await shot.screenshot({ path: `${SHOTS}/title-${size.name}.png` });
      await openSheet(shot);
      await sheet(shot).getByRole("button", { name: "Sign in", exact: true }).waitFor();
      await shot.waitForTimeout(500);
      mkdirSync(SHOTS, { recursive: true });
      await shot.screenshot({ path: `${SHOTS}/sign-in-${size.name}.png` });
      await sheet(shot).getByRole("button", { name: "Create profile" }).click();
      await sheet(shot).getByRole("button", { name: "Create profile" }).last().click();
      await shot.screenshot({ path: `${SHOTS}/create-errors-${size.name}.png` });
      await shot.context().close();
    }
    await sheet(page).getByRole("button", { name: "Create profile" }).click();
    await sheet(page).getByRole("form", { name: "Create profile" }).waitFor();
    await fits(page, `${size.name} create`);
    await page.keyboard.press("Escape");
    await sheet(page).waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Profile", `${size.name}: Escape returns focus to Profile`);
    await page.getByRole("textbox", { name: "Join code" }).fill("K7QP");
    assert.equal(await page.getByRole("textbox", { name: "Join code" }).inputValue(), "K7QP", `${size.name}: typed join code kept`);
    for (const name of ["Play", "Host a table", "Join"]) assert.ok(await page.getByRole("button", { name, exact: true }).isEnabled(), `${size.name}: ${name} usable`);
    assert.equal((await wire(page)).filter((f) => f.dir === "out" && /"profile(?!Hello)/.test(f.raw)).length, 0, `${size.name}: opening and closing sends no credential request`);
    await page.context().close();
  }
  ok("five sizes: Profile and the sheet fit with 44 px controls; focus starts on Close, stays inside, returns to Profile; guest controls and typed code stay");

  // Field errors beside their fields, then a real create on host A, remembered.
  const desk = { viewport: { width: 1280, height: 720 } };
  const one = await open({ ...desk, deviceScaleFactor: SHOTS ? 2 : 1 });
  await goto(one, A);
  await one.evaluate(() => localStorage.setItem("emberisle-seat", "seat-recovery-sentinel"));
  await openSheet(one);
  await sheet(one).getByRole("button", { name: "Create profile" }).click();
  await sheet(one).getByLabel("Display name").fill("Ember");
  await sheet(one).getByLabel("Login").fill("No Spaces");
  await sheet(one).getByLabel("PIN", { exact: true }).fill("12");
  await sheet(one).getByRole("button", { name: "Create profile" }).last().click();
  assert.equal(await sheet(one).getByLabel("Login").getAttribute("aria-invalid"), "true");
  assert.equal(await one.evaluate(() => document.activeElement?.getAttribute("aria-describedby")), "profile-login-error", "the first refused field takes the focus");
  assert.match(await one.locator("#profile-login-error").innerText(), /lowercase/);
  assert.match(await one.locator("#profile-pin-error").innerText(), /four digits/);
  assert.equal((await wire(one)).filter((f) => /profileCreate/.test(f.raw)).length, 0, "invalid fields send nothing");
  await sheet(one).getByLabel("Login").fill("ember-user");
  await sheet(one).getByLabel("PIN", { exact: true }).fill("4821");
  await sheet(one).getByLabel("Confirm PIN").fill("4821");
  await sheet(one).getByRole("radio", { name: "Tide" }).click();
  await sheet(one).getByRole("button", { name: "Create profile" }).last().click();
  await saveCode(one);
  await sheet(one).getByText("Signed in as").waitFor();
  assert.match(await sheet(one).innerText(), /Remembered on this device/);
  const session = (await wire(one)).map((f) => ({ ...f, m: JSON.parse(f.raw) })).find((f) => f.m.type === "profileSession");
  const credential = session.m.credential;
  assert.equal(session.url, A);
  assert.equal(session.m.profile.color, "#2d6ee8");
  assert.deepEqual(await one.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("emberisle-profile:"))), [`emberisle-profile:${encodeURIComponent(A)}`]);
  assert.equal(await one.evaluate(() => localStorage.getItem("emberisle-seat")), "seat-recovery-sentinel");
  if (SHOTS) {
    for (const size of ["390x844", "844x390", "1280x720"]) {
      const [width, height] = size.split("x").map(Number);
      await one.setViewportSize({ width, height });
      await one.waitForTimeout(400);
      await one.screenshot({ path: `${SHOTS}/signed-in-${size}.png` });
    }
    await one.setViewportSize(desk.viewport);
  }
  await sheet(one).getByRole("button", { name: "Done" }).click();
  ok("field errors sit beside their fields and send nothing; create on the real host remembers only that host and keeps the saved seat");

  // A second device signs in without remembering, then signs out; the first device's credential survives.
  const two = await open(desk);
  await goto(two, A);
  await openSheet(two);
  await sheet(two).getByLabel("Login").fill("ember-user");
  await sheet(two).getByLabel("PIN", { exact: true }).fill("0000");
  await sheet(two).getByLabel("Remember me").uncheck();
  await sheet(two).getByRole("button", { name: "Sign in", exact: true }).click();
  await sheet(two).getByRole("alert").filter({ hasText: "Couldn't sign in" }).waitFor();
  await sheet(two).getByLabel("PIN", { exact: true }).fill("4821");
  await sheet(two).getByRole("button", { name: "Sign in", exact: true }).click();
  await sheet(two).getByText("Not remembered on this device.").waitFor();
  assert.equal(await two.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("emberisle-profile:"))), false);
  await sheet(two).getByRole("button", { name: "Sign out" }).click();
  await sheet(two).getByRole("button", { name: "Sign in", exact: true }).waitFor();
  const logout = (await wire(two)).map((f) => JSON.parse(f.raw)).find((m) => m.type === "profileLogout");
  assert.ok(logout.credential && logout.credential !== credential, "the second device revokes only its own credential");
  ok("a wrong PIN is refused; a second device signs in and out without remembering or revoking the first");

  // Another host on the same page origin never sees host A's remembered credential.
  await goto(one, B);
  await openSheet(one);
  await sheet(one).getByRole("button", { name: "Sign in", exact: true }).waitFor();
  assert.equal(await sheet(one).getByRole("button", { name: "Continue with remembered profile" }).count(), 0, "host B offers no resume");
  const toB = (await wire(one)).filter((f) => f.url === B && f.dir === "out");
  assert.deepEqual(toB.map((f) => JSON.parse(f.raw).type).filter((t) => t.startsWith("profile")), ["profileHello"]);
  assert.equal(toB.some((f) => f.raw.includes(credential) || f.raw.includes('"4821"')), false, "host B never receives host A's credential or PIN");
  await one.keyboard.press("Escape");
  ok("switching to host B shows no remembered profile and sends B only the capability check");

  // Back on host A: nothing is sent until the player presses Continue, then Host a table carries the credential once.
  await goto(one, A);
  await openSheet(one);
  const resume = sheet(one).getByRole("button", { name: "Continue with remembered profile" });
  await resume.waitFor();
  assert.equal((await wire(one)).filter((f) => f.dir === "out" && /profileResume/.test(f.raw)).length, 0, "no resume before the press");
  await resume.click();
  await sheet(one).getByText("Signed in as").waitFor();
  await sheet(one).getByRole("button", { name: "Done" }).click();
  await one.getByRole("button", { name: "Host a table" }).click();
  await one.waitForFunction(() => window.__emberisle.getState().screen === "lobby");
  await one.waitForFunction(() => window.__emberisle.getState().seats[0]?.profile);
  const frames = await wire(one);
  const hello = frames.map((f) => ({ ...f, m: JSON.parse(f.raw) })).filter((f) => f.dir === "out" && f.m.type === "hello");
  assert.equal(hello.length, 1);
  assert.equal(hello[0].url, A);
  assert.equal(hello[0].m.credential, credential, "Host a table attaches the remembered credential");
  const seat = await one.evaluate(() => window.__emberisle.getState().seats[0]);
  assert.equal(seat.profile.displayName, "Ember");
  assert.equal(seat.profile.profileId, session.m.profile.profileId);
  assert.equal(await one.evaluate(() => /ember-user|4821/.test(JSON.stringify(window.__emberisle.getState().seats))), false, "no login or PIN in seats");
  ok("a remembered profile resumes only after a press; Host a table attaches it once and the seat shows the profile");

  // Private values stay in their own frames on every page.
  for (const [name, page] of [["first", one], ["second", two]]) {
    for (const f of (await wire(page)).map((f) => ({ ...f, m: JSON.parse(f.raw) }))) {
      if (f.raw.includes('"4821"')) assert.ok(f.dir === "out" && ["profileCreate", "profileLogin"].includes(f.m.type), `${name}: PIN only in create or login, saw ${f.m.type}`);
      if (f.raw.includes(credential)) assert.ok((f.dir === "in" && f.m.type === "profileSession") || (f.dir === "out" && ["profileResume", "hello"].includes(f.m.type)), `${name}: credential only in its own frames, saw ${f.dir} ${f.m.type}`);
      if (f.dir === "in" && f.raw.includes("ember-user")) assert.equal(f.m.type, "profileSession", `${name}: login only in the owner's session`);
    }
  }
  assert.ok((await wire(one)).some((f) => f.dir === "in" && ["seats", "welcome"].includes(JSON.parse(f.raw).type)), "the table frames were inspected");
  ok("PINs, credentials and the login appear only in their own requests and replies, never in seats, chat, state or log frames");
  await two.context().close();

  // Blocked storage: create still signs in, says not remembered, and guest play stands.
  const blocked = await open(desk, [blockStorage]);
  await goto(blocked, A);
  await openSheet(blocked);
  await sheet(blocked).getByRole("button", { name: "Create profile" }).click();
  await sheet(blocked).getByLabel("Display name").fill("Brine");
  await sheet(blocked).getByLabel("Login").fill("brine-user");
  await sheet(blocked).getByLabel("PIN", { exact: true }).fill("7390");
  await sheet(blocked).getByLabel("Confirm PIN").fill("7390");
  await sheet(blocked).getByRole("button", { name: "Create profile" }).last().click();
  await saveCode(blocked);
  await sheet(blocked).getByText("Not remembered on this device.").waitFor();
  await sheet(blocked).getByRole("button", { name: "Done" }).click();
  assert.ok(await blocked.getByRole("button", { name: "Play", exact: true }).isEnabled());
  await blocked.context().close();
  ok("blocked storage signs in for this page only and keeps guest play");

  // Unsupported and offline hosts: one plain message, no credential frame, guest controls and saved seat untouched.
  for (const [label, hostUrl, text] of [["unsupported", `${wss}/legacy`, "Profiles unavailable on this host."], ["offline", "wss://127.0.0.1:9/", "The host is offline. You can still play as a guest."]]) {
    const page = await open(desk);
    await goto(page, hostUrl);
    await page.evaluate(() => localStorage.setItem("emberisle-seat", "seat-recovery-sentinel"));
    await openSheet(page);
    await sheet(page).getByRole("status").filter({ hasText: text }).waitFor();
    assert.equal(await sheet(page).getByRole("textbox").count(), 0, `${label}: no credential fields`);
    await sheet(page).getByRole("button", { name: "Continue as guest" }).click();
    await sheet(page).waitFor({ state: "detached" });
    const sent = (await wire(page)).filter((f) => f.dir === "out").map((f) => JSON.parse(f.raw));
    assert.ok(sent.every((m) => !m.credential && !m.pin && (m.type === "profileHello" || !m.type.startsWith("profile"))), `${label}: only the capability check is sent`);
    assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-seat")), "seat-recovery-sentinel");
    assert.ok(await page.getByRole("button", { name: "Play", exact: true }).isEnabled());
    await page.context().close();
  }
  ok("unsupported and offline hosts say so, send no credential and leave guest play and the saved seat");

  // The first page sits in a lobby rendering the board; at device scale 2 (SHOTS) it starves the pages below of frames.
  await one.context().close();

  // Slice 2, on host B: edit the profile and change the PIN. The forms fit at the three sizes, take the focus on opening and
  // hand it back to the button that opened them.
  const frame = (f) => ({ ...f, m: JSON.parse(f.raw) });
  const sent = async (page, type) => (await wire(page)).map(frame).filter((f) => f.dir === "out" && f.m.type === type);
  const focused = (page) => page.evaluate(() => [document.activeElement?.getAttribute("data-opens"), document.activeElement?.closest("label")?.firstChild?.textContent]);
  // The form hands the focus back once the summary is drawn, a frame after it closes.
  const returned = (page, to, message) => page.waitForFunction((to) => document.activeElement?.getAttribute("data-opens") === to, to, { timeout: 5000 }).catch(() => assert.fail(message));
  const shots = async (page, name) => {
    if (!SHOTS) return;
    for (const size of ["320x568", "390x844", "844x390", "1280x720"]) {
      const [width, height] = size.split("x").map(Number);
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/${name}-${size}.png` });
    }
  };
  const layout = async (page, label) => {
    for (const [width, height] of [[440, 956], [956, 440], [1280, 720]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(200);
      await fits(page, `${width}x${height} ${label}`);
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press("Tab");
        assert.ok(await page.evaluate(() => document.querySelector('[data-testid="profile-sheet"]').contains(document.activeElement)), `${width}x${height} ${label}: Tab stays in the sheet`);
      }
    }
    await page.setViewportSize({ width: 440, height: 956 });
  };
  const coral = await open({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 });
  await goto(coral, B);
  await openSheet(coral);
  await sheet(coral).getByRole("button", { name: "Create profile" }).click();
  await sheet(coral).getByLabel("Display name").fill("Coral");
  await sheet(coral).getByLabel("Login").fill("coral-user");
  await sheet(coral).getByLabel("PIN", { exact: true }).fill("2468");
  await sheet(coral).getByLabel("Confirm PIN").fill("2468");
  // Blocked before signing in: the sheet prefetches the forms once signed in, and that quiet prefetch fails too.
  await coral.route(/ProfileForms\.tsx/, (route) => route.abort("connectionrefused"));
  await sheet(coral).getByRole("button", { name: "Create profile" }).last().click();
  await saveCode(coral);
  await sheet(coral).getByText("Signed in as").waitFor();
  await shots(coral, "signed-in-edit-buttons");
  await coral.setViewportSize({ width: 440, height: 956 });
  const firstCredential = (await wire(coral)).map(frame).find((f) => f.m.type === "profileSession").m.credential;

  // The forms load on first open. A failed load says so on the summary and the same button tries the network again.
  await sheet(coral).getByRole("button", { name: "Edit profile" }).click();
  await sheet(coral).getByRole("alert").filter({ hasText: "Couldn't load this form. Try again." }).waitFor();
  assert.ok(await sheet(coral).getByText("Signed in as Coral").isVisible(), "a failed load leaves the summary in place");
  assert.equal(await sheet(coral).getByRole("form", { name: "Edit profile" }).count(), 0);
  await coral.unroute(/ProfileForms\.tsx/);
  await sheet(coral).getByRole("button", { name: "Edit profile" }).click();
  const editForm = sheet(coral).getByRole("form", { name: "Edit profile" });
  await editForm.waitFor();
  assert.deepEqual(await focused(coral), [null, "Display name"], "Edit profile focuses its first field");
  assert.equal(await editForm.getByLabel("Current PIN").count(), 0, "no PIN is asked while the login is unchanged");
  await layout(coral, "edit profile");
  await editForm.getByLabel("Display name").fill("Coral Reef");
  await editForm.getByLabel("Catchphrase (optional)").fill("Waves first.");
  await editForm.getByRole("radiogroup", { name: "Favourite colour" }).getByRole("radio", { name: "Pine" }).click();
  await editForm.getByRole("radiogroup", { name: "Backup colour" }).getByRole("radio", { name: "Dune" }).click();
  assert.ok(await editForm.getByRole("radiogroup", { name: "Backup colour" }).getByRole("radio", { name: "Pine" }).isDisabled(), "the favourite can't also be the backup");
  await shots(coral, "edit");
  await coral.setViewportSize({ width: 440, height: 956 });
  await editForm.getByRole("button", { name: "Save" }).click();
  await sheet(coral).getByText("Signed in as Coral Reef").waitFor();
  await sheet(coral).getByText("“Waves first.”").waitFor();
  await returned(coral, "edit", "saving returns the focus to Edit profile");
  const [edit] = await sent(coral, "profileEdit");
  assert.deepEqual({ ...edit.m, id: 0 }, { type: "profileEdit", id: 0, credential: firstCredential, displayName: "Coral Reef", login: "coral-user", catchphrase: "Waves first.", color: "#8a4fd3", backupColor: "#f3ecd9" }, "an edit without a login change carries no PIN");

  // Picking the backup as favourite swaps the two; Cancel sends nothing and hands the focus back.
  await sheet(coral).getByRole("button", { name: "Edit profile" }).click();
  await editForm.getByRole("radiogroup", { name: "Favourite colour" }).getByRole("radio", { name: "Dune" }).click();
  assert.equal(await editForm.getByRole("radiogroup", { name: "Backup colour" }).getByRole("radio", { name: "Pine" }).getAttribute("aria-checked"), "true", "the old favourite becomes the backup");
  await editForm.getByRole("button", { name: "Cancel" }).click();
  await returned(coral, "edit", "Cancel returns the focus to Edit profile");
  assert.equal((await sent(coral, "profileEdit")).length, 1, "Cancel sends nothing");

  // A login change asks for the current PIN, refuses a wrong one beside that field, then renames.
  await sheet(coral).getByRole("button", { name: "Edit profile" }).click();
  await editForm.getByLabel("Login").fill("reef-user");
  await editForm.getByRole("button", { name: "Save" }).click();
  assert.match(await coral.locator("#profile-pin-error").innerText(), /four digits/);
  assert.equal((await sent(coral, "profileEdit")).length, 1, "a missing PIN sends nothing");
  await editForm.getByLabel("Current PIN").fill("0000");
  await editForm.getByRole("button", { name: "Save" }).click();
  await coral.locator("#profile-pin-error").filter({ hasText: "Check your current PIN" }).waitFor();
  assert.equal(await coral.evaluate(() => document.activeElement?.getAttribute("aria-describedby")), "profile-pin-error", "the refused PIN takes the focus");
  await editForm.getByLabel("Current PIN").fill("2468");
  await editForm.getByRole("button", { name: "Save" }).click();
  await sheet(coral).getByText("Login: reef-user").waitFor();
  ok("edit profile: a failed form load says so and retries on the next press; the form fits at 440x956, 956x440 and 1280x720 with 44 px controls; colours never match; a login change needs the current PIN, refused beside it; focus returns to Edit profile");

  // Another device: the old login is refused, the new one signs in (not remembered).
  const kelpie = await open(desk);
  await goto(kelpie, B);
  await openSheet(kelpie);
  await sheet(kelpie).getByLabel("Login").fill("coral-user");
  await sheet(kelpie).getByLabel("PIN", { exact: true }).fill("2468");
  await sheet(kelpie).getByLabel("Remember me").uncheck();
  await sheet(kelpie).getByRole("button", { name: "Sign in", exact: true }).click();
  await sheet(kelpie).getByRole("alert").filter({ hasText: "Couldn't sign in" }).waitFor();
  await sheet(kelpie).getByLabel("Login").fill("reef-user");
  await sheet(kelpie).getByRole("button", { name: "Sign in", exact: true }).click();
  await sheet(kelpie).getByText("Signed in as Coral Reef").waitFor();

  // The edits persist across a resume on the first device. The page reload clears its frame log, so keep the earlier frames.
  const coralEarly = await wire(coral);
  await goto(coral, B);
  await openSheet(coral);
  await sheet(coral).getByRole("button", { name: "Continue with remembered profile" }).click();
  await sheet(coral).getByText("Signed in as Coral Reef").waitFor();
  await sheet(coral).getByText("“Waves first.”").waitFor();
  await sheet(coral).getByText("Login: reef-user").waitFor();
  ok("the old login is refused after a rename; edits persist across a resume");

  // Change PIN: a mismatch and a wrong current PIN are refused beside their fields; the change keeps this device remembered
  // under a new credential and signs the other device out.
  await sheet(coral).getByRole("button", { name: "Change PIN" }).click();
  const pinForm = sheet(coral).getByRole("form", { name: "Change PIN" });
  await pinForm.waitFor();
  assert.deepEqual(await focused(coral), [null, "Current PIN"], "Change PIN focuses its first field");
  await layout(coral, "change PIN");
  await shots(coral, "change-pin");
  await coral.setViewportSize({ width: 440, height: 956 });
  await pinForm.getByLabel("Current PIN").fill("1111");
  await pinForm.getByLabel("New PIN", { exact: true }).fill("1357");
  await pinForm.getByLabel("Confirm new PIN").fill("7531");
  await pinForm.getByRole("button", { name: "Save PIN" }).click();
  assert.match(await coral.locator("#profile-pinConfirm-error").innerText(), /don't match/);
  assert.equal((await sent(coral, "profileChangePin")).length, 0, "a mismatch sends nothing");
  await pinForm.getByLabel("Confirm new PIN").fill("1357");
  await pinForm.getByRole("button", { name: "Save PIN" }).click();
  await coral.locator("#profile-pin-error").filter({ hasText: "Check your current PIN" }).waitFor();
  await pinForm.getByLabel("Current PIN").fill("2468");
  await pinForm.getByRole("button", { name: "Save PIN" }).click();
  await sheet(coral).getByText("Remembered on this device.").waitFor();
  await returned(coral, "pin", "saving returns the focus to Change PIN");
  const newSession = (await wire(coral)).map(frame).filter((f) => f.m.type === "profileSession").at(-1);
  const newCredential = newSession.m.credential;
  assert.ok(newCredential && newCredential !== firstCredential, "the change issues this device a new credential");
  assert.equal(JSON.parse(await coral.evaluate((key) => localStorage.getItem(key), `emberisle-profile:${encodeURIComponent(B)}`)).credential, newCredential, "the remembered credential is the new one");
  await sheet(kelpie).getByRole("button", { name: "Edit profile" }).click();
  await sheet(kelpie).getByLabel("Display name").fill("Not Saved");
  await sheet(kelpie).getByRole("button", { name: "Save" }).click();
  await sheet(kelpie).getByRole("alert").filter({ hasText: "Signed out on this device. Sign in again." }).waitFor();
  await sheet(kelpie).getByRole("form", { name: "Sign in" }).waitFor();
  await sheet(kelpie).getByLabel("Login").fill("reef-user");
  await sheet(kelpie).getByLabel("PIN", { exact: true }).fill("2468");
  await sheet(kelpie).getByRole("button", { name: "Sign in", exact: true }).click();
  await sheet(kelpie).getByRole("alert").filter({ hasText: "Couldn't sign in" }).waitFor();
  await sheet(kelpie).getByLabel("PIN", { exact: true }).fill("1357");
  await sheet(kelpie).getByRole("button", { name: "Sign in", exact: true }).click();
  await sheet(kelpie).getByText("Signed in as Coral Reef").waitFor();
  ok("change PIN: the form fits at the three sizes; refusals sit beside their fields; the new credential replaces the remembered one; the other device is signed out and the old PIN no longer works");

  // The changed profile still rides on Host a table, once, and the seat shows the edited name.
  await sheet(coral).getByRole("button", { name: "Done" }).click();
  await coral.getByRole("button", { name: "Host a table" }).click();
  await coral.waitForFunction(() => window.__emberisle.getState().seats[0]?.profile);
  const coralHello = (await sent(coral, "hello"));
  assert.equal(coralHello.length, 1);
  assert.equal(coralHello[0].m.credential, newCredential, "Host a table attaches the new credential");
  assert.equal(await coral.evaluate(() => window.__emberisle.getState().seats[0].profile.displayName), "Coral Reef");
  assert.equal(await coral.evaluate(() => /reef-user|coral-user|2468|1357/.test(JSON.stringify(window.__emberisle.getState().seats))), false, "no login or PIN in seats");

  // Private values stay in their own frames.
  for (const [name, frames] of [["first", [...coralEarly, ...(await wire(coral))]], ["second", await wire(kelpie)]]) {
    for (const f of frames.map(frame)) {
      if (/"(2468|1357|0000|1111|7531)"/.test(f.raw)) assert.ok(f.dir === "out" && ["profileCreate", "profileLogin", "profileEdit", "profileChangePin"].includes(f.m.type), `${name}: PIN only in its own requests, saw ${f.dir} ${f.m.type}`);
      for (const cred of [firstCredential, newCredential]) if (f.raw.includes(cred)) assert.ok((f.dir === "in" && f.m.type === "profileSession") || (f.dir === "out" && ["profileResume", "profileEdit", "profileChangePin", "profileLogout", "hello"].includes(f.m.type)), `${name}: credential only in its own frames, saw ${f.dir} ${f.m.type}`);
      if (f.dir === "in" && /reef-user|coral-user/.test(f.raw)) assert.equal(f.m.type, "profileSession", `${name}: login only in the owner's session`);
    }
  }
  await kelpie.context().close();
  await coral.context().close();
  ok("an edited profile with a new PIN attaches once on Host a table; PINs, credentials and logins stay in their own frames");

  // Host C: a temporary PIN from a local reset opens Change PIN at once, offers Sign out instead of Cancel, and attaches
  // nothing to a table until it is changed.
  const kelp = await open({ ...desk, deviceScaleFactor: SHOTS ? 2 : 1 });
  const C = `${wss}/c`;
  await goto(kelp, C);
  await openSheet(kelp);
  await sheet(kelp).getByLabel("Login").fill("kelp-user");
  await sheet(kelp).getByLabel("PIN", { exact: true }).fill(tempPin);
  await sheet(kelp).getByRole("button", { name: "Sign in", exact: true }).click();
  const forced = sheet(kelp).getByRole("form", { name: "Change PIN" });
  await forced.waitFor();
  await forced.getByRole("alert").filter({ hasText: "Change your PIN before continuing." }).waitFor();
  assert.equal(await forced.getByRole("button", { name: "Cancel" }).count(), 0, "no way round the change but Sign out");
  assert.equal(await sheet(kelp).getByRole("button", { name: "Edit profile" }).count(), 0, "no editing before the change");
  assert.equal(await kelp.evaluate((host) => window.__emberisle.getState().profile.credentialForHost(host), C), null, "a table gets no credential before the change");
  await shots(kelp, "must-change-pin");
  await kelp.setViewportSize(desk.viewport);
  await forced.getByLabel("Current PIN").fill(tempPin);
  await forced.getByLabel("New PIN", { exact: true }).fill("8080");
  await forced.getByLabel("Confirm new PIN").fill("8080");
  await forced.getByRole("button", { name: "Save PIN" }).click();
  await saveCode(kelp);
  await sheet(kelp).getByText("Signed in as Kelp").waitFor();
  assert.ok(await kelp.evaluate((host) => window.__emberisle.getState().profile.credentialForHost(host), C), "after the change a table gets the credential");
  await sheet(kelp).getByRole("button", { name: "Done" }).click();
  await kelp.getByRole("button", { name: "Host a table" }).click();
  await kelp.waitForFunction(() => window.__emberisle.getState().seats[0]?.profile);
  assert.equal(await kelp.evaluate(() => window.__emberisle.getState().seats[0].profile.displayName), "Kelp");
  for (const f of (await wire(kelp)).map(frame)) {
    if (f.raw.includes(`"${tempPin}"`) || f.raw.includes('"8080"')) assert.ok(f.dir === "out" && ["profileLogin", "profileChangePin"].includes(f.m.type), `temporary and new PIN only in their own requests, saw ${f.dir} ${f.m.type}`);
  }
  await kelp.context().close();
  ok("a temporary PIN must be changed first: Change PIN opens with Sign out, no table credential until then, Host a table attaches after");

  assert.deepEqual(errors, [], "no browser errors");
  console.log("profiles-ui-prove: pass");
} finally {
  await browser?.close();
  await vite?.close();
  legacyServer?.closeAllConnections();
  if (legacyServer) await new Promise((resolve) => legacyServer.close(resolve));
  for (const { proc } of hosts) if (proc.exitCode === null) { proc.kill("SIGTERM"); await new Promise((resolve) => { proc.once("exit", resolve); setTimeout(() => { proc.kill("SIGKILL"); resolve(); }, 5000).unref(); }); }
  rmSync(dir, { recursive: true, force: true });
}
