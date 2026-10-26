// GitHub Pages serves the build under /emberisle/. Build with that base, serve dist only under that prefix (anything else is a
// 404, as on Pages), and check the title screen loads with no console errors and no failed requests, and that an audio file
// and the manifest resolve under the prefix. Run: npm run pages-prove
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const BASE = "/emberisle/";
const PORT = Number(process.env.PAGES_PORT) || 8110;
const DIST = join(process.cwd(), "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wav": "audio/wav", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

execFileSync("npm", ["run", "build", "--", `--base=${BASE}`], { stdio: "inherit" });

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!path.startsWith(BASE)) return void res.writeHead(404).end();
  let file = normalize(join(DIST, path.slice(BASE.length)));
  if (!file.startsWith(DIST)) return void res.writeHead(404).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;
try {
  const page = await (await browser.newContext()).newPage();
  const problems = [];
  const sockets = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
  page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  page.on("requestfailed", (r) => problems.push(`failed ${r.url()}`));
  await page.routeWebSocket(/:8787\//, () => {});
  const origin = `http://127.0.0.1:${PORT}`;
  await page.goto(`${origin}${BASE}`);
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");

  // #833: both optional title modules must resolve under the hosted prefix too.
  const mode = page.getByTestId("open-mode-toggle");
  await mode.waitFor();
  assert.equal(await mode.getAttribute("aria-pressed"), "false");
  const wayfarer = page.locator('select[aria-label="Online wayfarer"]');
  await wayfarer.waitFor({ state: "attached" });
  assert.equal(await wayfarer.inputValue(), "on");

  // #987: a static non-root title must never start automatic discovery or retries.
  await page.waitForTimeout(17000);
  assert.deepEqual(sockets, [], "static title opens no automatic host connection");
  console.log("PASS static non-root title: zero automatic WebSockets after 17 seconds");

  const hrefs = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]').href,
    preload: [...document.querySelectorAll('link[rel="modulepreload"]')].map((l) => l.href),
  }));
  assert.equal(hrefs.manifest, `${origin}${BASE}manifest.webmanifest`);
  for (const h of hrefs.preload) assert.ok(h.startsWith(`${origin}${BASE}assets/`), `preload outside ${BASE}: ${h}`);
  const manifest = await (await page.request.get(hrefs.manifest)).json();
  for (const i of manifest.icons) {
    const r = await page.request.get(new URL(i.src, hrefs.manifest).href);
    assert.equal(r.status(), 200, `icon ${i.src}`);
  }

  // The sound module builds its URL from BASE_URL; ask it to play, and see which URL the page asks for.
  const audio = page.waitForRequest((r) => r.url().endsWith(".wav"), { timeout: 5000 });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const url = (await audio).url();
  assert.ok(url.startsWith(`${origin}${BASE}audio/`), `audio URL ${url}`);
  assert.equal((await page.request.get(url)).status(), 200);
  await page.waitForTimeout(500);

  assert.deepEqual(problems, []);
  console.log(`PASS pages-prove: title loads under ${BASE}; manifest, icons, preloads and ${url.replace(origin, "")} all resolve; no console errors, no 404s`);
} catch (e) {
  console.error("FAIL pages-prove:", e);
  code = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(code);
