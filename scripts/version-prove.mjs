// #913: the Table menu shows client and server git short SHAs at the bottom.
// Client SHA is stamped at build/dev time. Server SHA comes from the welcome (or set in proofs).
// When they differ the line notes it. Zero console errors.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8113;
mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector("[data-testid=title-play]");
  // Enter a table so the menu exists.
  await page.evaluate(() => {
    window.__emberisle.setState({
      screen: "play",
      mode: "online",
      code: "TEST",
      serverSha: "abc1234",
      state: { turn: 1, phase: "roll", current: "p0", players: [], vertices: [], edges: [], hexes: [], log: [] },
    });
  });
  const menuBtn = page.getByRole("button", { name: "Table menu" });
  await menuBtn.click();
  const line = page.getByTestId("version-line");
  await line.waitFor();
  const text = await line.textContent();
  assert.match(text ?? "", /client [0-9a-f]{7} · server abc1234/, "shows client and server SHA");
  assert.match(text ?? "", /\(differ\)/, "notes when they differ");
  // Same SHA: no differ. Client SHA is available on the page via the injected env.
  const clientSha = await page.evaluate(() => import.meta.env.VITE_GIT_SHA);
  await page.evaluate((sha) => window.__emberisle.setState({ serverSha: sha }), clientSha);
  // Wait a tick for re-render; the line updates.
  await page.waitForTimeout(100);
  const text2 = await line.textContent();
  assert.match(text2 ?? "", /client [0-9a-f]{7} · server [0-9a-f]{7}/, "same SHA");
  assert.doesNotMatch(text2 ?? "", /\(differ\)/, "no differ when equal");
  console.log("version line ok:", text2);
  await page.screenshot({ path: "test-results/version-line.png" });
} finally {
  await browser.close();
  await vite.close();
}
assert.equal(errors.length, 0, `console errors: ${errors.join("; ")}`);
console.log("version-prove: ok");
