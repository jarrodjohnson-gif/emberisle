// #1305 design capture: How to play and Costs in the real game, opened from the Table menu, before and after the shared
// sheet chrome, at 320x400 (short, so Costs overflows), 320x568, 390x844, 844x390 and 1280x720. Also checks focus on
// open, Tab staying inside, Escape, and focus return. The table is a hotseat table started through the store.
// No src/ file changes. Not a CI proof. Run from the repo root, one browser at a time: node docs/design/help-sheets-1274/capture.mjs
// It writes to a new temp folder. Add --save to write into pictures/ next to this file, replacing the committed files.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv.includes("--save") ? path.join(dir, "pictures") : mkdtempSync(path.join(tmpdir(), "help-sheets-1274-"));
mkdirSync(out, { recursive: true });
console.error(`pictures: ${out}`);
const afterCss = readFileSync(path.join(dir, "after.css"), "utf8");
const sizes = [[320, 400], [320, 568], [390, 844], [844, 390], [1280, 720]];
const SHEETS = [
  { name: "howto", row: "How to play", sheet: '[aria-labelledby="howto-title"] > div', title: "#howto-title", body: '[aria-labelledby="howto-title"] [role="region"] > p', backdrop: '[aria-labelledby="howto-title"]' },
  { name: "costs", row: "Costs", sheet: '[data-testid="cost-card"]', title: "#costs-title", body: '[data-testid^="cost-row-"]', backdrop: 'div:has(> [data-testid="cost-card"])' },
];

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const result = { browser: browser.version(), runs: [] };

// The sheet's geometry and chrome, the gutter around it, and whether its body needs to scroll.
const measure = (s) => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const sheet = document.querySelector(s.sheet);
  const title = document.querySelector(s.title);
  const body = document.querySelector(s.body);
  const close = sheet.querySelector('button[aria-label="Close"]');
  const scroller = [sheet, ...sheet.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY));
  const cs = getComputedStyle(sheet);
  const cb = close.getBoundingClientRect();
  const sb = sheet.getBoundingClientRect();
  const fonts = [...new Set([...sheet.querySelectorAll("p, li, h2, span, dt, dd")].filter((el) => el.getClientRects().length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => `${parseFloat(getComputedStyle(el).fontSize)}/${getComputedStyle(el).fontWeight}`))].sort();
  return {
    sheet: r(sheet), gutter: { left: +sb.left.toFixed(1), right: +(innerWidth - sb.right).toFixed(1), bottom: +(innerHeight - sb.bottom).toFixed(1) },
    padding: cs.padding, radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, shadow: cs.boxShadow.slice(0, 40), fill: cs.backgroundColor,
    backdrop: getComputedStyle(document.querySelector(s.backdrop)).backgroundColor,
    title: { text: title.textContent, font: `${parseFloat(getComputedStyle(title).fontSize)}/${getComputedStyle(title).fontWeight}`, family: getComputedStyle(title).fontFamily.split(",")[0] },
    close: { ...r(close), inView: cb.top >= 0 && cb.left >= 0 && cb.bottom <= innerHeight && cb.right <= innerWidth, focused: document.activeElement === close },
    body: { font: `${parseFloat(getComputedStyle(body).fontSize)}/${getComputedStyle(body).lineHeight}`, color: getComputedStyle(body).color },
    scrolls: scroller ? { what: scroller === sheet ? "the whole sheet" : scroller.getAttribute("role") || scroller.tagName.toLowerCase(), hidden: scroller.scrollHeight - scroller.clientHeight, closeInside: scroller.contains(close), scrollbar: getComputedStyle(scroller).scrollbarWidth } : null,
    fonts,
  };
};

try {
  for (const [width, height] of sizes) {
    const phone = width !== 1280;
    const tag = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
    await page.addInitScript(() => localStorage.setItem("emberisle-name", "Jarrod"));
    await page.goto(url);
    await page.waitForFunction(() => !!window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.waitForFunction(() => window.__emberisle.getState().state);
    await page.waitForTimeout(1200);
    for (const s of SHEETS) {
      // Open from the Table menu, so the opener is the real one and focus return can be checked.
      await page.getByRole("button", { name: "Table menu", exact: true }).click();
      await page.getByRole("button", { name: s.row, exact: true }).click();
      await page.locator(s.sheet).waitFor();
      await page.waitForTimeout(300);
      const rec = { size: tag, sheet: s.name };
      rec.before = await page.evaluate(measure, s);
      await page.screenshot({ path: path.join(out, `${tag}-${s.name}-before.jpg`), type: "jpeg", quality: 82 });
      const style = await page.addStyleTag({ content: afterCss });
      await page.waitForTimeout(100);
      rec.after = await page.evaluate(measure, s);
      await page.screenshot({ path: path.join(out, `${tag}-${s.name}-after.jpg`), type: "jpeg", quality: 82 });
      await style.evaluate((el) => el.remove());
      // Tab, pressed more times than the sheet has stops, never leaves the sheet.
      const stops = await page.evaluate((sel) => document.querySelector(sel).querySelectorAll('button, [tabindex="0"]').length, s.sheet);
      let inside = true;
      for (let i = 0; i < stops + 3; i++) {
        await page.keyboard.press("Tab");
        if (!(await page.evaluate((sel) => document.querySelector(sel).contains(document.activeElement), s.sheet))) inside = false;
      }
      rec.tab = { stops, staysInside: inside };
      // Escape closes the sheet and focus goes back to the Table menu button; the game state is untouched.
      const seqBefore = await page.evaluate(() => window.__emberisle.getState().state.seq);
      await page.keyboard.press("Escape");
      await page.locator(s.sheet).waitFor({ state: "detached" });
      rec.afterEscape = await page.evaluate((seq) => ({ focus: document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName, sameState: window.__emberisle.getState().state.seq === seq }), seqBefore);
      // The menu closed itself when the row was picked; make sure nothing is left open before the next sheet.
      await page.locator('[data-testid="table-menu"]').waitFor({ state: "detached" }).catch(() => page.keyboard.press("Escape"));
      if (!rec.tab.staysInside) throw new Error(`${tag} ${s.name}: Tab left the sheet`);
      if (!rec.before.close.focused || !rec.before.close.inView || !rec.after.close.inView) throw new Error(`${tag} ${s.name}: Close not focused or off screen`);
      if (rec.afterEscape.focus !== "Table menu" || !rec.afterEscape.sameState) throw new Error(`${tag} ${s.name}: Escape did not return focus or changed the state`);
      result.runs.push(rec);
      console.log(tag, s.name, JSON.stringify({ before: { sheet: rec.before.sheet, gutter: rec.before.gutter, title: rec.before.title.font, body: rec.before.body.font, scrolls: rec.before.scrolls }, after: { sheet: rec.after.sheet, gutter: rec.after.gutter, title: rec.after.title.font, body: rec.after.body.font, scrolls: rec.after.scrolls }, tab: rec.tab, escape: rec.afterEscape }));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await vite.close();
}
result.errors = errors;
writeFileSync(path.join(out, "measurements.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
