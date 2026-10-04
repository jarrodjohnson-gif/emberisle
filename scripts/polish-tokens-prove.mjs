// #435: the docs/design/polish.md tokens are on :root, the Button primitive reads them, and the title and the
// practice table render with zero console errors at 1280x720, 390x844 and 844x390.
// Run: npm run polish-tokens-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8105;
const TOKENS = {
  "--text-caption": "0.75rem",
  "--text-body": "0.9375rem",
  "--text-title": "1.25rem",
  "--text-number": "1.75rem",
  "--text-display": "3.5rem",
  "--radius-control": "12px",
  "--radius-chip": "16px",
  "--radius-sheet": "24px",
  "--duration-press": "80ms",
  "--duration-quick": "150ms",
  "--duration-base": "220ms",
  "--duration-settle": "280ms",
  "--duration-pulse": "1.2s",
  "--duration-moment": "900ms",
  "--ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
  "--ease-snap": "cubic-bezier(0.34, 1.56, 0.64, 1)",
  "--ease-in": "cubic-bezier(0.4, 0, 1, 1)",
};
const RESOURCES = ["timber", "clay", "wool", "grain", "ore"];
const VIEWS = [
  { tag: "desk", width: 1280, height: 720 },
  { tag: "port", width: 390, height: 844, touch: true },
  { tag: "land", width: 844, height: 390, touch: true },
];

const lum = (h) => {
  const [R, G, B] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// The Button primitive's computed radius, press timing and focus ring, read from a real rendered button.
const buttonStyle = (page, name) =>
  page.evaluate((name) => {
    const el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
    const s = getComputedStyle(el);
    return { radius: s.borderTopLeftRadius, duration: s.transitionDuration, easing: s.transitionTimingFunction };
  }, name);

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;
try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      ...(v.touch ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play", exact: true }).waitFor();
    await page.waitForFunction(() => window.__isle?.land.children.length > 30);

    const root = await page.evaluate(
      (names) => Object.fromEntries(names.map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()])),
      [...Object.keys(TOKENS), ...RESOURCES.flatMap((r) => [`--color-${r}`, `--color-${r}-on`])],
    );
    for (const [n, want] of Object.entries(TOKENS)) assert.equal(root[n], want, `${v.tag}: ${n}`);
    for (const r of RESOURCES) {
      const c = ratio(root[`--color-${r}`], root[`--color-${r}-on`]);
      assert.ok(c >= 4.5, `${v.tag}: ${r}-on on ${r} is ${c.toFixed(2)}:1`);
    }

    const host = await buttonStyle(page, "Play");
    assert.deepEqual(host, { radius: "12px", duration: "0.08s", easing: TOKENS["--ease-out"] }, `${v.tag}: Play`);
    await page.screenshot({ path: `test-results/polish-tokens-${v.tag}-title.png` });

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state?.phase === "rollOff");
    await page.getByRole("button", { name: /^Roll/ }).first().waitFor();
    const roll = await buttonStyle(page, "Roll");
    assert.deepEqual(roll, host, `${v.tag}: Roll matches Play`);

    // The focus ring shows on keyboard focus only.
    if (!v.touch) {
      const before = await page.evaluate(
        () => getComputedStyle([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Roll")).outlineStyle,
      );
      assert.equal(before, "none", `${v.tag}: no ring before focus`);
      let focused = null;
      for (let i = 0; i < 40 && focused !== "Roll"; i++) {
        await page.keyboard.press("Tab");
        focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
      }
      assert.equal(focused, "Roll", `${v.tag}: Tab reaches Roll`);
      const after = await page.evaluate(() => {
        const s = getComputedStyle(document.activeElement);
        return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset };
      });
      assert.deepEqual(after, { style: "solid", width: "2px", offset: "2px" }, `${v.tag}: focus ring`);
    }
    await page.screenshot({ path: `test-results/polish-tokens-${v.tag}-rolloff.png` });
    assert.deepEqual(errors, [], `${v.tag}: console errors`);
    console.log(`${v.tag} ${v.width}x${v.height}: tokens ok, Button radius ${host.radius} ${host.duration} ${host.easing}, 0 console errors`);
    await ctx.close();
  }
  console.log("polish-tokens-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
