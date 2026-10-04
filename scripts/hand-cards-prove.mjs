// #436: the hand cards wear their resource colours and the count is the hero. At 1280x720 and 390x844 (coarse) on a hotseat table:
// each card's computed fill is its polish.md token (= the terrain cap's PAINT base), the count is 28 px / 600 and the largest text
// on the card, the count's computed colour against the fill is >= 4.5:1, a card holding 0 is 40 % opacity, the uppercase label is gone
// from view (kept as title and for screen readers), and an icon is still on every card. A gain adds exactly one 2 px white ring
// pulse (one animation per change, not per render), a loss likewise, no emerald / rose fill; under reduced motion the pulse is a 1 ms step.
// Run: npm run hand-cards-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8436;
const STEP_MS = 15_000;
const RESOURCES = ["timber", "clay", "wool", "grain", "ore"];
const FILL = { timber: "#2f6b3a", clay: "#b5522a", wool: "#8fbf5a", grain: "#e0b13a", ore: "#6e7580" };
const ON = { timber: "#ffffff", clay: "#ffffff", wool: "#1c1915", grain: "#1c1915", ore: "#ffffff" };
const VIEWS = [
  { tag: "desk", width: 1280, height: 720 },
  { tag: "port", width: 390, height: 844, touch: true },
];

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;

async function open(v, reducedMotion) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    ...(v.touch ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Four seats, one table" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
  const roll = page.getByRole("button", { name: "Roll", exact: true });
  for (let i = 0; i < 40; i++) {
    const before = await page.evaluate(() => window.__emberisle.getState().state);
    if (before.phase !== "rollOff") break;
    await roll.focus({ timeout: STEP_MS });
    await page.keyboard.press("Enter");
    await page.waitForFunction((s) => window.__emberisle.getState().state.seq > s, before.seq, { timeout: STEP_MS });
  }
  await page.locator('[data-testid="resource-timber"]').waitFor({ timeout: STEP_MS });
  return { ctx, page, errors };
}

// Sets the current seat's hand; `seat` stays so the diff reads it as a change of count, not of seat.
const setHand = (page, hand) =>
  page.evaluate((hand) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    Object.assign(st.players.find((p) => p.id === st.current).resources, hand);
    st.seq += 1;
    g.setState({ state: st });
  }, hand);

try {
  for (const v of VIEWS) {
    const { ctx, page, errors } = await open(v, false);
    await setHand(page, { timber: 3, clay: 0, wool: 12, grain: 1, ore: 0 });
    await page.waitForFunction(() => document.querySelector('[data-testid="resource-wool"]')?.textContent.includes("12"), null, { timeout: STEP_MS });
    await page.waitForTimeout(1500); // the first set's flashes are over
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="resource-timber"]')).opacity === "1", null, { timeout: STEP_MS });
    const cards = await page.evaluate(() =>
      Object.fromEntries(
        ["timber", "clay", "wool", "grain", "ore"].map((r) => {
          const el = document.querySelector(`[data-testid="resource-${r}"]`);
          const cs = getComputedStyle(el);
          const count = el.querySelector('[data-testid="hand-count"]');
          const cc = getComputedStyle(count);
          const sizes = [...el.querySelectorAll("*")]
            .filter((e) => e.textContent.trim() && !e.querySelector("*"))
            .map((e) => ({ t: e.textContent.trim(), px: parseFloat(getComputedStyle(e).fontSize) }));
          const visible = [...el.querySelectorAll("*")].filter((e) => e.textContent.trim() && !e.querySelector("*") && e.getBoundingClientRect().width > 1);
          return [r, {
            fill: cs.backgroundColor, opacity: cs.opacity, title: el.title, text: count.textContent, color: cc.color,
            size: cc.fontSize, weight: cc.fontWeight, tabular: cc.fontVariantNumeric, sizes,
            visibleText: visible.map((e) => e.textContent.trim()), icon: !!el.querySelector("svg"),
            iconOpacity: el.querySelector("svg") && getComputedStyle(el.querySelector("svg")).opacity,
            name: el.textContent,
          }];
        }),
      ),
    );
    const want = { timber: 3, clay: 0, wool: 12, grain: 1, ore: 0 };
    for (const r of RESOURCES) {
      const c = cards[r];
      const fill = parse(c.fill);
      assert.deepEqual(fill, rgb(FILL[r]), `${v.tag} ${r}: fill ${c.fill}`);
      assert.deepEqual(parse(c.color), rgb(ON[r]), `${v.tag} ${r}: count colour ${c.color}`);
      const cr = ratio(parse(c.color), fill);
      assert.ok(cr >= 4.5, `${v.tag} ${r}: count contrast ${cr.toFixed(2)}`);
      assert.equal(c.text, String(want[r]), `${v.tag} ${r}: count`);
      assert.equal(c.size, "28px", `${v.tag} ${r}: count size`);
      assert.equal(c.weight, "600", `${v.tag} ${r}: count weight`);
      assert.match(c.tabular, /tabular-nums/, `${v.tag} ${r}: tabular`);
      assert.ok(c.sizes.every((s) => s.px <= 28), `${v.tag} ${r}: count is the largest text ${JSON.stringify(c.sizes)}`);
      assert.ok(c.sizes.filter((s) => s.px === 28).length === 1, `${v.tag} ${r}: only the count is 28 px`);
      assert.equal(c.opacity, want[r] === 0 ? "0.4" : "1", `${v.tag} ${r}: opacity`);
      assert.ok(c.icon && c.iconOpacity === "0.7", `${v.tag} ${r}: icon at 70 % (${c.iconOpacity})`);
      assert.deepEqual(c.visibleText, [String(want[r])], `${v.tag} ${r}: only the count is visible text`);
      assert.equal(c.title, { timber: "Timber", clay: "Clay", wool: "Wool", grain: "Grain", ore: "Ore" }[r], `${v.tag} ${r}: title`);
      assert.match(c.name, new RegExp(`${c.title}`, "i"), `${v.tag} ${r}: accessible name kept for screen readers`);
    }
    const tinted = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="resource-"]')].filter((e) => /emerald|rose/.test(e.className)).length);
    assert.equal(tinted, 0, `${v.tag}: no emerald / rose fill`);

    // A gain and a loss each pulse the ring once. Counted from the DOM, so a re-render cannot hide a second one.
    await page.evaluate(() => {
      window.__rings = [];
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.dataset?.testid === "hand-ring") window.__rings.push(n.parentElement.dataset.testid);
      }).observe(document.body, { childList: true, subtree: true });
    });
    await setHand(page, { timber: 5 });
    await page.locator('[data-testid="hand-ring"]').waitFor({ timeout: STEP_MS });
    await page.evaluate(() => { const g = window.__emberisle; g.setState({ state: structuredClone(g.getState().state) }); });
    await page.waitForTimeout(300);
    const ring = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="hand-ring"]');
      const kf = [...document.styleSheets].flatMap((s) => [...s.cssRules]).find((r) => r.name === "resource-ring");
      return { anim: getComputedStyle(el).animationName, rings: window.__rings.slice(), n: document.querySelectorAll('[data-testid="hand-ring"]').length, kf: kf?.cssText ?? "" };
    });
    assert.equal(ring.anim, "resource-ring", `${v.tag}: ring animation`);
    assert.deepEqual(ring.rings, ["resource-timber"], `${v.tag}: one gain, one ring on timber: ${JSON.stringify(ring.rings)}`);
    assert.equal(ring.n, 1, `${v.tag}: one ring on the page`);
    assert.match(ring.kf, /rgb\(255, 255, 255\) 0px 0px 0px 2px/, `${v.tag}: 2 px ring`);
    await page.screenshot({ path: `test-results/hand-cards-${v.tag}.png` });
    await page.waitForTimeout(1500);
    await setHand(page, { timber: 4 });
    await page.waitForFunction(() => window.__rings.length === 2, null, { timeout: STEP_MS });
    assert.equal(await page.locator('[data-testid="resource-flash"]').textContent(), "-1", `${v.tag}: loss label`);
    assert.deepEqual(errors, [], `${v.tag}: console errors`);
    console.log(`${v.tag} ${v.width}x${v.height}: fills ${RESOURCES.map((r) => cards[r].fill).join(" ")}; counts 28px/600, contrast ` +
      RESOURCES.map((r) => ratio(parse(cards[r].color), parse(cards[r].fill)).toFixed(1)).join(" ") + "; zero cards 0.4; 1 ring per change; 0 console errors");
    await ctx.close();
  }

  // Reduced motion: the ring is still there for one change but runs as a 1 ms step.
  const rm = await open(VIEWS[0], true);
  await setHand(rm.page, { timber: 2 });
  await rm.page.locator('[data-testid="hand-ring"]').waitFor({ timeout: STEP_MS });
  const dur = await rm.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="hand-ring"]')).animationDuration);
  assert.equal(dur, "0.001s", "reduced motion: ring duration");
  assert.deepEqual(rm.errors, [], "reduced motion: console errors");
  console.log(`reduced motion: ring runs ${dur}`);
  await rm.ctx.close();
  console.log("hand-cards-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
