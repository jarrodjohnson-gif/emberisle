// #1419: How to play and Costs share one sheet chrome on one wash (owner option A, docs/design/help-sheets-1274).
// Both sheets are opened from the Table menu of a hotseat table, at 320x568, 390x844, 430x932, 375x812, 820x1180, 844x390
// and 1280x720. For each sheet it reads:
// - the wash: mist (--ground, rgb 243 246 245) at 70 % alpha, no blur, the same behind both sheets;
// - the gutter: 16 px on phones and 24 px from 1024 px wide (no safe-area inset in Chromium), and an upright phone's sheet
//   sits 16 px from the left, right and bottom edges;
// - the sheet: white, opaque, 20 px corners, the --shadow-sheet shadow, no border, 448 px wide at most, the same on both;
// - the title: 20 px / 26 px, weight 600, the UI face; the title row's 16 px padding; the body's 16 px sides;
// - Close: 44 x 44, focused on open, on screen. Each sheet has two Tab stops, Close and its scrolling body (a labelled
//   region). Tab pressed more times than that stays inside; Escape closes, focus returns to the Table menu button and
//   state.seq is unchanged.
// At 320x400 the Costs body overflows: the card itself does not scroll, the body does with a thin scrollbar, and the title
// row and Close keep their place and take the tap at both ends of the scroll. Tab reaches the body and Page Down scrolls
// it from the keyboard (WCAG 2.1.1). Zero console errors.
// Run: npm run help-sheets-prove
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8419;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const SHEETS = [
  { row: "How to play", sheet: '[aria-labelledby="howto-title"] > div', wash: '[aria-labelledby="howto-title"]', title: "#howto-title", body: '[role="region"]' },
  { row: "Costs", sheet: '[data-testid="cost-card"]', wash: 'div:has(> [data-testid="cost-card"])', title: "#costs-title", body: '[role="region"]' },
];
const SIZES = [[320, 568], [390, 844], [430, 932], [375, 812], [820, 1180], [844, 390], [1280, 720]];
const errors = [];
let code = 0;

// Everything the shared chrome promises, read from the open sheet.
const read = (s) => {
  const rgba = (css) => {
    const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    c.clearRect(0, 0, 1, 1);
    c.fillStyle = css;
    c.fillRect(0, 0, 1, 1);
    return [...c.getImageData(0, 0, 1, 1).data];
  };
  const sheet = document.querySelector(s.sheet);
  const wash = document.querySelector(s.wash);
  const title = sheet.querySelector(s.title);
  const head = title.parentElement;
  const body = sheet.querySelector(s.body);
  const close = sheet.querySelector('button[aria-label="Close"]');
  const cs = getComputedStyle(sheet);
  const ws = getComputedStyle(wash);
  const ts = getComputedStyle(title);
  const hs = getComputedStyle(head);
  const bs = getComputedStyle(body);
  const sb = sheet.getBoundingClientRect();
  const cb = close.getBoundingClientRect();
  const hit = document.elementFromPoint(cb.x + cb.width / 2, cb.y + cb.height / 2);
  return {
    wash: rgba(ws.backgroundColor),
    blur: ws.backdropFilter,
    gutter: [ws.paddingTop, ws.paddingRight, ws.paddingBottom, ws.paddingLeft],
    edges: { left: Math.round(sb.left), right: Math.round(innerWidth - sb.right), bottom: Math.round(innerHeight - sb.bottom) },
    width: Math.round(sb.width),
    fill: rgba(cs.backgroundColor),
    radius: cs.borderTopLeftRadius,
    border: cs.borderTopWidth,
    // Tailwind stacks transparent ring layers in front of the shadow; only the visible layers count.
    shadow: cs.boxShadow.split(/,(?![^(]*\))/).map((l) => l.trim()).filter((l) => !l.startsWith("rgba(0, 0, 0, 0)")).join(", "),
    sheetScrolls: sheet.scrollHeight > sheet.clientHeight + 1,
    title: `${ts.fontSize}/${ts.lineHeight}/${ts.fontWeight}/${ts.fontFamily}`,
    head: [hs.paddingTop, hs.paddingRight, hs.paddingLeft],
    bodySides: [bs.paddingLeft, bs.paddingRight],
    bodyScrollbar: bs.scrollbarWidth,
    close: { w: Math.round(cb.width), h: Math.round(cb.height), onScreen: cb.top >= 0 && cb.left >= 0 && cb.bottom <= innerHeight && cb.right <= innerWidth, focused: document.activeElement === close, takesTap: close === hit || close.contains(hit) },
  };
};

const open = async (page, s) => {
  await page.getByRole("button", { name: "Table menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: s.row, exact: true }).click();
  await page.locator(s.sheet).waitFor();
};

// Focus on open was read before this; here Tab stays inside, Escape closes, focus returns, and the game does not move.
const keys = async (page, s, tag) => {
  const stops = await page.locator(s.sheet).evaluate((el) => el.querySelectorAll('button, [tabindex="0"]').length);
  assert.equal(stops, 2, `${tag}: two Tab stops, Close and the scrolling body`);
  for (let i = 0; i < stops + 3; i++) {
    await page.keyboard.press("Tab");
    assert.ok(await page.locator(s.sheet).evaluate((el) => el.contains(document.activeElement)), `${tag}: Tab ${i + 1} stays inside the sheet`);
  }
  const seq = await page.evaluate(() => window.__emberisle.getState().state.seq);
  await page.keyboard.press("Escape");
  await page.locator(s.sheet).waitFor({ state: "detached" });
  assert.ok(await page.getByRole("button", { name: "Table menu", exact: true }).evaluate((el) => document.activeElement === el), `${tag}: Escape returns the focus to the Table menu button`);
  assert.equal(await page.evaluate(() => window.__emberisle.getState().state.seq), seq, `${tag}: the game state is unchanged`);
  return stops;
};

const table = async (width, height) => {
  const phone = width < 1024;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${width}x${height}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${width}x${height}: ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle);
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(() => window.__emberisle.getState().state);
  return { context, page };
};

try {
  for (const [width, height] of SIZES) {
    const size = `${width}x${height}`;
    const { context, page } = await table(width, height);
    const seen = [];
    for (const s of SHEETS) {
      const tag = `${size} ${s.row}`;
      await open(page, s);
      const got = await page.evaluate(read, s);
      // color-mix keeps the mist's colour and carries 70 % as alpha: 0.7 x 255 = 178.5. The canvas stores a translucent
      // pixel premultiplied, so a channel can read back one off.
      assert.ok([243, 246, 245].every((v, i) => Math.abs(got.wash[i] - v) <= 1), `${tag}: the wash is mist (${got.wash})`);
      assert.ok(Math.abs(got.wash[3] - 178.5) <= 1, `${tag}: the wash is 70 % opaque (alpha ${got.wash[3]} of 255)`);
      assert.equal(got.blur, "none", `${tag}: no blur behind the sheet`);
      const gutter = width >= 1024 ? "24px" : "16px";
      assert.deepEqual(got.gutter, [gutter, gutter, gutter, gutter], `${tag}: the gutter is ${gutter}`);
      if (width < 640) assert.deepEqual(got.edges, { left: 16, right: 16, bottom: 16 }, `${tag}: an upright phone's sheet sits 16 px from the edges`);
      assert.ok(got.width <= 448 && got.width === Math.min(448, width - 2 * parseInt(gutter)), `${tag}: the sheet is ${got.width} px wide, the gutter's width up to 448`);
      assert.deepEqual(got.fill, [255, 255, 255, 255], `${tag}: the sheet is opaque white, so its text keeps its contrast on the wash`);
      assert.equal(got.radius, "20px", `${tag}: 20 px corners`);
      assert.equal(got.border, "0px", `${tag}: no border`);
      assert.match(got.shadow, /^rgba\(24, 51, 45, 0\.18\) 0px 10px 28px 0px$/, `${tag}: the sheet shadow`);
      assert.match(got.title, /^20px\/26px\/600\/ui-sans-serif/, `${tag}: the title is 20/26, weight 600, the UI face (${got.title})`);
      assert.deepEqual(got.head, ["16px", "16px", "16px"], `${tag}: the title row has 16 px padding`);
      assert.deepEqual(got.bodySides, ["16px", "16px"], `${tag}: the body has 16 px sides`);
      assert.equal(got.bodyScrollbar, "thin", `${tag}: the body has a thin scrollbar`);
      assert.ok(!got.sheetScrolls, `${tag}: the sheet itself does not scroll; only its body may`);
      assert.deepEqual({ w: got.close.w, h: got.close.h }, { w: 44, h: 44 }, `${tag}: Close is 44 x 44`);
      assert.ok(got.close.focused && got.close.onScreen && got.close.takesTap, `${tag}: Close is focused on open, on screen and takes the tap ${JSON.stringify(got.close)}`);
      const stops = await keys(page, s, tag);
      seen.push(got);
      console.log(`${tag}: wash rgba(${got.wash}), gutter ${gutter}, sheet ${got.width} px, edges ${JSON.stringify(got.edges)}, title ${got.title.split("/").slice(0, 3).join("/")}, Close 44x44 focused; ${stops} stops, Tab stays inside, Escape returns focus, seq unchanged`);
    }
    const same = ({ wash, blur, gutter, width: w, fill, radius, border, shadow, title, head, bodySides }) => ({ wash, blur, gutter, w, fill, radius, border, shadow, title, head, bodySides });
    assert.deepEqual(same(seen[1]), same(seen[0]), `${size}: How to play and Costs share one chrome`);
    await context.close();
  }

  // A short screen: the Costs body overflows. The title row and Close stay put while the body scrolls.
  {
    const tag = "320x400 Costs";
    const s = SHEETS[1];
    const { context, page } = await table(320, 400);
    await open(page, s);
    const got = await page.locator(s.sheet).evaluate((sheet, bodySel) => {
      const body = sheet.querySelector(bodySel);
      const title = sheet.querySelector("#costs-title");
      const close = sheet.querySelector('button[aria-label="Close"]');
      const place = () => {
        const t = title.getBoundingClientRect();
        const c = close.getBoundingClientRect();
        const hit = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
        return { title: Math.round(t.top), close: Math.round(c.top), onScreen: c.top >= 0 && c.bottom <= innerHeight, takesTap: close === hit || close.contains(hit) };
      };
      const out = { hidden: body.scrollHeight - body.clientHeight, sheetScrolls: sheet.scrollHeight > sheet.clientHeight + 1, closeInBody: body.contains(close), scrollbar: getComputedStyle(body).scrollbarWidth };
      body.scrollTop = 0;
      out.top = place();
      body.scrollTop = body.scrollHeight;
      out.scrolled = body.scrollTop;
      out.bottom = place();
      body.scrollTop = 0;
      return out;
    }, s.body);
    assert.ok(got.hidden > 0, `${tag}: the body overflows at this height (${got.hidden} px hidden)`);
    assert.ok(!got.sheetScrolls, `${tag}: the card itself does not scroll`);
    assert.ok(!got.closeInBody, `${tag}: Close is outside the scrolling body`);
    assert.equal(got.scrollbar, "thin", `${tag}: the body has a thin scrollbar`);
    assert.ok(got.scrolled > 0, `${tag}: the body scrolls`);
    assert.deepEqual(got.bottom, got.top, `${tag}: the title row and Close keep their place while the body scrolls`);
    assert.ok(got.top.onScreen && got.top.takesTap, `${tag}: Close is on screen and takes the tap ${JSON.stringify(got)}`);
    assert.ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Close"), `${tag}: Close has the focus on open`);
    // The keyboard reaches the hidden worth rows: Tab to the body, then Page Down scrolls it.
    const region = page.locator(s.sheet).getByRole("region", { name: "Costs" });
    await page.keyboard.press("Tab");
    assert.ok(await region.evaluate((el) => document.activeElement === el), `${tag}: Tab moves the focus from Close to the scrolling body`);
    // DOM focus updates before Chromium commits its keyboard scroll target; let the focused region paint first (as howto-prove).
    await region.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    let keyScrolled = 0;
    for (let attempt = 0; attempt < 5 && !keyScrolled; attempt++) {
      await page.keyboard.press("PageDown");
      await page.waitForFunction(() => document.querySelector('[data-testid="cost-card"] [role="region"]').scrollTop > 0, null, { timeout: 1000 }).catch(() => {});
      keyScrolled = await region.evaluate((el) => el.scrollTop);
    }
    assert.ok(keyScrolled > 0, `${tag}: Page Down scrolls the body from the keyboard`);
    assert.ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Costs"), `${tag}: the body keeps the focus while it scrolls`);
    await region.evaluate((el) => { el.scrollTop = 0; });
    const stops = await keys(page, s, tag);
    console.log(`${tag}: body hides ${got.hidden} px and scrolls ${got.scrolled}; title at ${got.top.title}, Close at ${got.top.close} at both ends; thin scrollbar; Tab reaches the body, Page Down scrolls it ${keyScrolled} px; ${stops} stops, Escape returns focus, seq unchanged`);
    await context.close();
  }
  assert.deepEqual(errors, [], "no console errors");
  console.log("help-sheets-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
