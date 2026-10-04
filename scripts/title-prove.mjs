// #444: the title asks one question (docs/design/polish.md). At desktop, short-desktop, phone portrait and three short
// landscape sizes (incl. 667x375 and 640x360 from the #433 review):
// - exactly one primary button, and it is Play; Host a table and Join are the only other filled buttons;
// - no eyebrow, no tagline, no uppercase text on the card;
// - every element on the card sits inside the viewport and inside the card's own clip box, so nothing needs the card's
//   scroll at first paint (the colour dots were clipped at 667x375);
// - in portrait the card takes at most 60 % of the height;
// - Watch shows only once the field holds four characters.
// Zero console errors. Run: npm run title-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8106;
const VIEWS = [
  { width: 1280, height: 720 },
  { width: 1280, height: 500 },
  { width: 640, height: 360 },
  { width: 390, height: 844, touch: true },
  { width: 844, height: 390, touch: true },
  { width: 667, height: 375, touch: true },
];

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
    const tag = `${v.width}x${v.height}${v.touch ? " touch" : ""}`;
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, ...(v.touch ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    // Four characters in the field start the colour peek, which dials the rules host; no host runs here, so accept the
    // socket and say nothing back.
    await page.routeWebSocket(/:8787\//, () => {});
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play", exact: true }).waitFor();

    const card = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="title-card"]');
      const c = el.getBoundingClientRect();
      const fg = getComputedStyle(document.documentElement).getPropertyValue("--color-fg").trim();
      const probe = document.createElement("div");
      probe.style.backgroundColor = fg;
      document.body.append(probe);
      const fgRgb = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const buttons = [...el.querySelectorAll("button:not([role=radio])")];
      const filled = buttons.filter((b) => !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(b).backgroundColor));
      const out = [...el.querySelectorAll("h1, p, button, input")]
        .filter((n) => {
          const r = n.getBoundingClientRect();
          return r.top < Math.max(0, c.top) - 0.5 || r.left < Math.max(0, c.left) - 0.5 ||
            r.bottom > Math.min(innerHeight, c.bottom) + 0.5 || r.right > Math.min(innerWidth, c.right) + 0.5;
        })
        .map((n) => (n.textContent.trim() || n.getAttribute("aria-label") || n.tagName).slice(0, 24));
      return {
        primary: buttons.filter((b) => getComputedStyle(b).backgroundColor === fgRgb).map((b) => b.textContent.trim()),
        filled: filled.map((b) => b.textContent.trim()),
        uppercase: [...el.querySelectorAll("*")].filter((n) => getComputedStyle(n).textTransform === "uppercase").length,
        texts: [...el.querySelectorAll("p")].map((p) => p.textContent.trim()),
        out,
        scroll: el.scrollHeight - el.clientHeight,
        heightShare: c.height / innerHeight,
      };
    });
    assert.deepEqual(card.primary, ["Play"], `${tag}: the one primary`);
    assert.deepEqual([...card.filled].sort(), ["Host a table", "Join", "Play"], `${tag}: filled buttons`);
    assert.equal(card.uppercase, 0, `${tag}: uppercase text on the card`);
    assert.ok(!card.texts.some((t) => /living island|Claim hexes/.test(t)), `${tag}: eyebrow or tagline still there: ${card.texts}`);
    assert.deepEqual(card.out, [], `${tag}: outside the viewport or the card's clip box`);
    assert.ok(card.scroll <= 1, `${tag}: the card scrolls ${card.scroll} px at first paint`);
    if (v.touch && v.height > v.width) assert.ok(card.heightShare <= 0.6, `${tag}: portrait card is ${Math.round(card.heightShare * 100)} % tall`);

    const watch = page.getByRole("button", { name: "Watch", exact: true });
    assert.equal(await watch.count(), 0, `${tag}: Watch before a code`);
    await page.getByRole("textbox", { name: "Join code" }).fill("ABC");
    assert.equal(await watch.count(), 0, `${tag}: Watch at 3 characters`);
    await page.getByRole("textbox", { name: "Join code" }).fill("ABCD");
    await watch.waitFor();
    await page.getByRole("textbox", { name: "Join code" }).fill("");
    await page.screenshot({ path: `test-results/title-prove-${v.width}x${v.height}.png` });

    assert.deepEqual(errors, [], `${tag}: console errors`);
    console.log(`ok   ${tag}: one primary (Play), filled ${card.filled.join(" / ")}, card ${Math.round(card.heightShare * 100)} % tall, nothing clipped, Watch only at 4 characters`);
    await ctx.close();
  }
  console.log("title-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
