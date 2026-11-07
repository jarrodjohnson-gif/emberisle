// #766 first slice: the title's Profile sheet against real rules hosts behind an HTTPS tunnel hop (the client proof's fixture).
// At 390x844, 844x390, 440x956, 956x440 and 1280x720: the Profile button and every sheet control are at least 44 px and on
// screen, focus starts on Close, Tab stays inside, Escape closes and focus returns to Profile, and guest Play, Host and the
// typed join code stay usable. Then, on the real host: field errors sit beside their fields; create and sign in; a second
// device signs in and out without revoking the first; a remembered profile resumes only after a press; another host never
// sees the remembered credential; blocked storage and offline or unsupported hosts leave guest play and the saved seat alone;
// Host a table carries the credential once and the seat shows the profile. PINs and credentials never appear in any other
// frame. With SHOTS=1 it writes the pictures in docs/proofs/766/ at device scale 2.
// Run: npm run profiles-ui-prove
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as httpServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
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
      proxy: { "/a": tunnel(a.port), "/b": tunnel(b.port), "/legacy": { target: `ws://127.0.0.1:${legacyServer.address().port}`, ws: true } } },
  });
  await vite.listen();
  const origin = `https://127.0.0.1:${vite.httpServer.address().port}`;
  const wss = origin.replace("https:", "wss:");
  const A = `${wss}/a`, B = `${wss}/b`;
  const at = (hostUrl) => `${origin}/?host=${encodeURIComponent(hostUrl)}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
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
  await sheet(two).getByLabel("Remember me on this device").uncheck();
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
