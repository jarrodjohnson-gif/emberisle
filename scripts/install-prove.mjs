// #468: Add to Home Screen opens Emberisle full-screen. Against the built dist/, served both by server/host.mjs and by
// `vite preview`:
// - index.html carries the manifest link, theme-color, the iOS and mobile web-app tags, the apple-touch-icon and
//   viewport-fit=cover;
// - the manifest parses: standalone, any orientation, the stone `bg` token as theme and background, start_url inside scope
//   at the page's own address; every icon (192, 512, maskable 512) and the 180 px apple-touch-icon resolve as PNGs of the
//   size they claim;
// - on a 390x844 phone with an iPhone's safe-area insets (47 top, 34 bottom), the page cannot scroll or rubber-band, the
//   title's Play, the lobby's Ready and both cards sit inside the safe area, and so does every button of the in-game HUD;
// - held sideways (844x390, 47 left and right, 21 bottom), the title's Play, the lobby's Ready and both cards do too;
// - a join link (?code=) and a watch link (?watch=) opened at that address still fill the code and join or watch.
// Chromium has no standalone display-mode to emulate; the page's safe-area CSS is unconditional (env() is 0 in a plain
// tab), so the insets are what installing changes, and those are emulated over CDP. Zero console errors.
// Run: npm run build && npm run install-prove
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const PREVIEW_PORT = Number(process.env.VITE_PORT) || 8110;
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
if (!existsSync(`${DIST}index.html`)) {
  console.log("FAIL no dist/index.html: run npm run build first");
  process.exit(1);
}
const BG = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").match(/--color-bg:\s*(#[0-9a-f]{6})/i)[1].toLowerCase();
mkdirSync("test-results", { recursive: true });

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", DIST, ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await preview({ preview: { host: "127.0.0.1", port: PREVIEW_PORT, strictPort: true }, logLevel: "error" });
const HOST = `http://127.0.0.1:${hostPort}/`;
const ORIGINS = { host: HOST, "vite preview": `http://127.0.0.1:${PREVIEW_PORT}/` };

function pngSize(buf) {
  assert.equal(buf.subarray(1, 4).toString(), "PNG", "not a PNG");
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

async function fetchPng(url, size, what) {
  const r = await fetch(url);
  assert.equal(r.status, 200, `${what}: ${url} is ${r.status}`);
  assert.equal(r.headers.get("content-type"), "image/png", `${what}: content-type`);
  assert.equal(pngSize(Buffer.from(await r.arrayBuffer())), size, `${what}: pixel size`);
}

async function proveStatic(name, origin) {
  const html = await (await fetch(origin)).text();
  const tag = (re, what) => {
    const m = html.match(re);
    assert.ok(m, `${name}: index.html has no ${what}`);
    return m[1];
  };
  assert.match(tag(/<meta name="viewport" content="([^"]+)"/, "viewport"), /viewport-fit=cover/, `${name}: viewport-fit=cover`);
  assert.equal(tag(/<meta name="theme-color" content="([^"]+)"/, "theme-color").toLowerCase(), BG, `${name}: theme-color`);
  assert.equal(tag(/<meta name="apple-mobile-web-app-capable" content="([^"]+)"/, "apple-mobile-web-app-capable"), "yes");
  assert.equal(tag(/<meta name="mobile-web-app-capable" content="([^"]+)"/, "mobile-web-app-capable"), "yes");
  tag(/<meta name="apple-mobile-web-app-status-bar-style" content="([^"]+)"/, "apple-mobile-web-app-status-bar-style");
  assert.equal(tag(/<meta name="apple-mobile-web-app-title" content="([^"]+)"/, "apple-mobile-web-app-title"), "Emberisle");
  await fetchPng(new URL(tag(/<link rel="apple-touch-icon" href="([^"]+)"/, "apple-touch-icon"), origin), "180x180", `${name} apple-touch-icon`);

  const manifestUrl = new URL(tag(/<link rel="manifest" href="([^"]+)"/, "manifest link"), origin);
  const r = await fetch(manifestUrl);
  assert.equal(r.status, 200, `${name}: manifest is ${r.status}`);
  if (name === "host") assert.equal(r.headers.get("content-type"), "application/manifest+json", "host: manifest content-type");
  const m = JSON.parse(await r.text());
  assert.equal(m.name, "Emberisle");
  assert.ok(m.short_name && m.short_name.length <= 12, `${name}: short_name fits under an icon`);
  assert.equal(m.display, "standalone");
  assert.equal(m.orientation, "any");
  assert.equal(m.theme_color.toLowerCase(), BG, `${name}: theme_color is the stone token`);
  assert.equal(m.background_color.toLowerCase(), BG, `${name}: background_color is the stone token`);
  const start = new URL(m.start_url, manifestUrl).href;
  const scope = new URL(m.scope, manifestUrl).href;
  assert.equal(start, origin, `${name}: start_url opens the page`);
  assert.ok(start.startsWith(scope), `${name}: start_url inside scope`);
  assert.equal((await fetch(start)).status, 200, `${name}: start_url loads`);
  const want = [
    ["192x192", "any"],
    ["512x512", "any"],
    ["512x512", "maskable"],
  ];
  for (const [sizes, purpose] of want) {
    const icon = m.icons.find((i) => i.sizes === sizes && (i.purpose ?? "any").split(" ").includes(purpose));
    assert.ok(icon, `${name}: no ${sizes} ${purpose} icon`);
    await fetchPng(new URL(icon.src, manifestUrl), sizes, `${name} ${sizes} ${purpose} icon`);
  }
  console.log(`ok   ${name}: meta tags, manifest (start_url ${start}, scope ${scope}) and 4 icons`);
  return scope;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

async function phone(width, height, insets) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const tag = `${width}x${height}`;
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
  return { ctx, page, tag, insets };
}

// The element's box against the viewport minus the insets, read in the page so env() is the real one.
async function inSafe({ page, insets }, locator, what) {
  await locator.waitFor();
  const r = await locator.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { top: b.top, left: b.left, bottom: b.bottom, right: b.right, vw: innerWidth, vh: innerHeight };
  });
  const ok =
    r.top >= insets.top - 0.5 && r.left >= insets.left - 0.5 && r.bottom <= r.vh - insets.bottom + 0.5 && r.right <= r.vw - insets.right + 0.5;
  assert.ok(ok, `${what} at ${JSON.stringify(r)} is outside the safe area ${JSON.stringify(insets)}`);
}

let code = 0;
try {
  let scope;
  for (const [name, origin] of Object.entries(ORIGINS)) {
    const s = await proveStatic(name, origin);
    if (name === "host") scope = s;
  }

  // Portrait iPhone 14/15: the notch and the home bar.
  const p = await phone(390, 844, { top: 47, bottom: 34, left: 0, right: 0 });
  await p.page.goto(HOST);
  const env = await p.page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)";
    document.body.append(probe);
    const cs = getComputedStyle(probe);
    const out = [cs.paddingTop, cs.paddingBottom];
    probe.remove();
    return out;
  });
  assert.deepEqual(env, ["47px", "34px"], "the inset emulation reached env()");
  await inSafe(p, p.page.getByRole("button", { name: "Play", exact: true }), `${p.tag} title Play`);
  await inSafe(p, p.page.getByTestId("title-card"), `${p.tag} title card`);
  const page = await p.page.evaluate(() => ({
    scroll: document.scrollingElement.scrollHeight - innerHeight,
    overscroll: [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY],
    overflow: [getComputedStyle(document.documentElement).overflowY, getComputedStyle(document.body).overflowY],
  }));
  assert.ok(page.scroll <= 0, `${p.tag}: the page scrolls ${page.scroll} px`);
  assert.deepEqual(page.overscroll, ["none", "none"], `${p.tag}: html and body overscroll-behavior`);
  assert.deepEqual(page.overflow, ["hidden", "hidden"], `${p.tag}: html and body overflow`);
  await p.page.screenshot({ path: "test-results/install-title-390x844.png" });
  console.log(`ok   ${p.tag}: Play and the title card inside the safe area; the page cannot scroll or bounce`);

  await p.page.getByRole("button", { name: "Host a table" }).click();
  const tableCode = (await p.page.getByTestId("table-code").textContent()).trim();
  await inSafe(p, p.page.getByRole("button", { name: "Ready", exact: true }), `${p.tag} lobby Ready`);
  await inSafe(p, p.page.getByTestId("lobby-card"), `${p.tag} lobby card`);
  await p.page.screenshot({ path: "test-results/install-lobby-390x844.png" });
  console.log(`ok   ${p.tag}: Ready and the lobby card inside the safe area (table ${tableCode})`);

  // A join link opened at the installed address: inside the manifest scope, so Android opens it in the app.
  const join = await phone(390, 844, { top: 47, bottom: 34, left: 0, right: 0 });
  const joinUrl = `${HOST}?code=${tableCode}`;
  assert.ok(joinUrl.startsWith(scope), "the join link is inside the manifest scope");
  await join.page.goto(joinUrl);
  const field = join.page.getByRole("textbox", { name: "Join code" });
  await field.waitFor();
  assert.equal(await field.inputValue(), tableCode, "?code= fills the join field");
  await join.page.getByRole("button", { name: "Join", exact: true }).click();
  await join.page.getByTestId("table-code").getByText(tableCode).waitFor();
  await p.page.getByTestId("lobby-card").getByText("Waiting").nth(1).waitFor();
  await join.ctx.close();
  console.log(`ok   ?code=${tableCode} fills the field and Join seats a second player`);

  const watch = await phone(390, 844, { top: 47, bottom: 34, left: 0, right: 0 });
  await watch.page.goto(`${HOST}?watch=${tableCode}`);
  await watch.page.getByRole("textbox", { name: "Join code" }).waitFor();
  assert.equal(await watch.page.getByRole("textbox", { name: "Join code" }).inputValue(), tableCode, "?watch= fills the field");
  const watchBtn = watch.page.getByRole("button", { name: "Watch", exact: true });
  await inSafe(watch, watchBtn, `${watch.tag} Watch`);
  await watch.ctx.close();
  console.log(`ok   ?watch=${tableCode} fills the field and shows Watch inside the safe area`);

  // In game: every button the HUD shows sits inside the safe area.
  await p.page.getByRole("button", { name: "Leave the table" }).click();
  await p.page.getByRole("button", { name: "Play", exact: true }).click();
  await p.page.getByTestId("seat-strip").waitFor();
  await p.page.waitForTimeout(500);
  const out = await p.page.evaluate(({ top, bottom }) => {
    return [...document.querySelectorAll("button")]
      .filter((b) => b.checkVisibility() && !b.closest(".sr-only"))
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && (r.top < top - 0.5 || r.bottom > innerHeight - bottom + 0.5 || r.left < -0.5 || r.right > innerWidth + 0.5);
      })
      .map((b) => (b.textContent.trim() || b.getAttribute("aria-label") || "button").slice(0, 24));
  }, p.insets);
  assert.deepEqual(out, [], `${p.tag} in game: buttons outside the safe area`);
  await p.page.screenshot({ path: "test-results/install-game-390x844.png" });
  await p.ctx.close();
  console.log(`ok   ${p.tag} in game: every HUD button inside the safe area`);

  // Held sideways: the notch is on a side and the home bar is shorter.
  const l = await phone(844, 390, { top: 0, bottom: 21, left: 47, right: 47 });
  await l.page.goto(HOST);
  await inSafe(l, l.page.getByRole("button", { name: "Play", exact: true }), `${l.tag} title Play`);
  await inSafe(l, l.page.getByTestId("title-card"), `${l.tag} title card`);
  await l.page.getByRole("button", { name: "Host a table" }).click();
  await inSafe(l, l.page.getByRole("button", { name: "Ready", exact: true }), `${l.tag} lobby Ready`);
  await inSafe(l, l.page.getByTestId("lobby-card"), `${l.tag} lobby card`);
  await l.page.screenshot({ path: "test-results/install-lobby-844x390.png" });
  await l.ctx.close();
  console.log(`ok   ${l.tag}: Play, Ready and both cards inside the safe area`);

  assert.deepEqual(errors, [], "console errors");
  console.log("install-prove: ok");
} catch (e) {
  console.log(`FAIL ${e.message}`);
  if (errors.length) console.log(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
process.exit(code);
