// #1828: the keyboard focus ring round a good in the hand sits evenly on the card: the same gap on all four sides (within 1 px),
// the whole ring inside the tray and the viewport (nothing clipped), on every good, at 440x956 and 1280x720 (deviceScaleFactor 2).
// The ring is the card's outline: it stands outline-offset clear of the card's border box, outline-width thick. The card's face
// runs symbol, count and name down to 2 px of the bottom edge, so a ring on the edge itself (offset 0) touches the name.
// Set HAND_RING_SHOTS=<dir> to write a PNG of the focused hand per view.
// Run: npm run hand-focus-ring-prove
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8447;
const STEP_MS = 15_000;
const SHOTS = process.env.HAND_RING_SHOTS;
const RESOURCES = ["timber", "clay", "wool", "grain", "ore"];
const VIEWS = [
  { tag: "phone", width: 440, height: 956, touch: true },
  { tag: "desk", width: 1280, height: 720 },
];

mkdirSync("test-results", { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
let code = 0;

try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2, ...(v.touch ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Pass and play" }).focus();
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
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      Object.assign(st.players.find((p) => p.id === st.current).resources, { timber: 3, clay: 0, wool: 12, grain: 1, ore: 2 });
      st.seq += 1;
      g.setState({ state: st });
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="resource-wool"]')?.textContent.includes("12"), null, { timeout: STEP_MS });
    await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"], [data-testid="goods-lit"], [data-testid="goods-lost"]'), null, { timeout: STEP_MS });
    await page.waitForTimeout(600);

    for (const r of RESOURCES) {
      // Keyboard focus (Tab-style): :focus-visible only matches when the last input was the keyboard.
      await page.keyboard.press("Shift");
      await page.locator(`[data-testid="resource-${r}"]`).focus();
      await page.waitForTimeout(100);
      const m = await page.evaluate((r) => {
        const el = document.querySelector(`[data-testid="resource-${r}"]`);
        const cs = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        const w = parseFloat(cs.outlineWidth) || 0;
        const off = cs.outlineStyle === "none" ? 0 : parseFloat(cs.outlineOffset) || 0;
        const o = off + w;
        const ring = { l: b.left - o, t: b.top - o, r: b.right + o, b: b.bottom + o };
        // The gap is the clear space between the ring's inner edge and the card, on each side.
        const gap = { l: b.left - (ring.l + w), t: b.top - (ring.t + w), r: ring.r - w - b.right, b: ring.b - w - b.bottom };
        // Anything between the ring and the viewport edge that would cut it: the tray and the dock are not scrollers, but read overflow up the chain.
        let clip = null;
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const pc = getComputedStyle(p);
          if (pc.overflowX === "visible" && pc.overflowY === "visible") continue;
          const pb = p.getBoundingClientRect();
          if (ring.l < pb.left - 0.5 || ring.t < pb.top - 0.5 || ring.r > pb.right + 0.5 || ring.b > pb.bottom + 0.5) clip = `${p.className || p.tagName} ${JSON.stringify(pb)}`;
        }
        return { style: cs.outlineStyle, width: w, offset: cs.outlineOffset, ring, gap, clip, vw: innerWidth, vh: innerHeight };
      }, r);
      if (SHOTS) {
        const t = await page.evaluate((r) => { const q = document.querySelector(`[data-testid="resource-${r}"]`).closest(".goods-tray").getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; }, r);
        await page.screenshot({ path: `${SHOTS}/${v.tag}-${r}.png`, clip: { x: Math.max(0, t.l - 8), y: Math.max(0, t.t - 8), width: Math.min(v.width, t.r - t.l + 16), height: t.b - t.t + 16 } });
      }
      assert.notEqual(m.style, "none", `${v.tag} ${r}: a focused good shows a ring`);
      const g = Object.values(m.gap);
      assert.ok(Math.max(...g) - Math.min(...g) <= 1, `${v.tag} ${r}: ring gap is equal on four sides (${JSON.stringify(m.gap)})`);
      assert.ok(g.every((x) => x >= 2), `${v.tag} ${r}: the ring stands at least 2 px clear of the card on every side (${JSON.stringify(m.gap)})`);
      assert.equal(m.clip, null, `${v.tag} ${r}: the ring is clipped by ${m.clip}`);
      assert.ok(m.ring.l >= 0 && m.ring.t >= 0 && m.ring.r <= m.vw && m.ring.b <= m.vh, `${v.tag} ${r}: the ring stays on screen (${JSON.stringify(m.ring)})`);
      console.log(`${v.tag} ${r}: ok gap ${JSON.stringify(m.gap)} offset ${m.offset} width ${m.width}`);
    }
    assert.deepEqual(errors, [], `${v.tag}: console errors`);
    await ctx.close();
  }
  console.log("hand-focus-ring-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  process.exit(code);
}
