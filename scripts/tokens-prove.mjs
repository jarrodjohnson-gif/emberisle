// #239 Debug: number tokens are rimmed and legible, and nothing is placed or wanders within 0.39 of a hex centre.
// The six checks in docs/design/tokens.md.
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8093;
const CLEAR = 0.39;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) fails.push(name);
};

// Check 5: WCAG 2 contrast, plain arithmetic on hex values.
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Read in the page: every placed prop against the CLEAR rule, and every token.
const readScene = (demoBoard) => {
  const iso = window.__isle;
  return import("/src/lib/game/board.ts").then((board) => {
    const { worldOfHex, hexHeight } = board;
    const hexes = (demoBoard ? board.demoBoard() : window.__emberisle.getState().state).hexes;
    const at = new Map(hexes.map((h) => [h.id, { ...worldOfHex(h), terrain: h.terrain }]));
    const props = iso.living.children.filter((o) => o.userData?.prop);
    const margins = props.map((o) => {
      const c = at.get(o.userData.hex);
      return { prop: o.userData.prop, margin: Math.hypot(o.position.x - c.x, o.position.z - c.z) - o.userData.reach };
    });
    const tokens = iso.land.children
      .filter((o) => o.userData?.token != null)
      .map((g) => {
        const [disc, label] = g.children;
        const hex = hexes.find((h) => {
          const w = worldOfHex(h);
          return Math.abs(w.x - g.position.x) < 1e-6 && Math.abs(w.z - g.position.z) < 1e-6;
        });
        const img = label.material.map.image;
        const row = img.getContext("2d").getImageData(0, 196, 256, 1).data;
        const runs = [];
        let len = 0;
        for (let x = 0; x <= 256; x++) {
          const dark = x < 256 && row[x * 4 + 3] > 0 && 0.299 * row[x * 4] + 0.587 * row[x * 4 + 1] + 0.114 * row[x * 4 + 2] < 128;
          if (dark) len++;
          else if (len) (runs.push(len), (len = 0));
        }
        return {
          n: g.userData.token,
          rim: disc.material.color.getHexString(),
          rTop: disc.geometry.parameters.radiusTop,
          rLabel: label.geometry.parameters.radius,
          dy: g.position.y - (0.04 + 0.26 + hexHeight(hex.terrain) * 0.35), // TILE_Y + SLAB + height * 0.35 = topOf
          runs,
        };
      });
    return { margins, tokens, sheep: props.filter((o) => o.userData.prop === "sheep").length };
  });
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle && window.__isle.living.children.length > 20 && window.__isle.land.children.length > 30);

  const demo = await page.evaluate(readScene, true);
  await page.getByRole("button", { name: "Play versus the isle" }).click();
  await page.waitForFunction(() => window.__emberisle.getState().screen === "play" && window.__emberisle.getState().state);
  await page.waitForTimeout(500);
  const practice = await page.evaluate(readScene, false);

  // 1. Clear space on placement, both boards.
  for (const [name, s] of [["title demo", demo], ["practice", practice]]) {
    const worst = Math.min(...s.margins.map((m) => m.margin));
    check(`1 placement clear (${name})`, s.margins.length > 0 && worst >= CLEAR - 1e-9, `${s.margins.length} props, nearest point ${worst.toFixed(3)}`);
  }

  // 2. Clear space while wandering: every sheep, every 100 ms for 10 s.
  const wander = await page.evaluate(() => {
    const iso = window.__isle;
    return import("/src/lib/game/board.ts").then(async ({ worldOfHex }) => {
      const at = new Map(window.__emberisle.getState().state.hexes.map((h) => [h.id, worldOfHex(h)]));
      let worst = Infinity;
      let samples = 0;
      for (let i = 0; i < 100; i++) {
        for (const o of iso.living.children) {
          if (o.userData?.prop !== "sheep") continue;
          const c = at.get(o.userData.hex);
          worst = Math.min(worst, Math.hypot(o.position.x - c.x, o.position.z - c.z) - o.userData.reach);
          samples++;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return { worst, samples };
    });
  });
  check("2 wander clear", wander.samples > 0 && wander.worst >= CLEAR - 1e-9, `${wander.samples} samples, nearest point ${wander.worst.toFixed(3)}`);

  // 3. Token geometry, 4. rim rule, 6. pips, on both boards.
  for (const [name, s] of [["title demo", demo], ["practice", practice]]) {
    const t = s.tokens;
    check(`3 token geometry (${name})`, t.length === 18 && t.every((k) => k.rTop === 0.34 && k.rLabel === 0.29 && Math.abs(k.dy - 0.04) < 1e-9), `${t.length} tokens`);
    check(`4 rim rule (${name})`, t.every((k) => k.rim === (k.n === 6 || k.n === 8 ? "b3261e" : "1c1916")));
    const fives = t.filter((k) => k.n === 5);
    check(
      `6 pips on canvas (${name})`,
      fives.length > 0 && fives.every((k) => k.runs.length === 4 && k.runs.every((r) => r >= 19 && r <= 21)),
      fives.map((k) => k.runs.join("/")).join(" "),
    );
  }
} finally {
  await browser.close();
  await vite.close();
}

// 5. Contrast, from the hex values.
const caps = { timber: "#2f6b3a", clay: "#b5522a", wool: "#8fbf5a", grain: "#e0b13a", ore: "#6e7580", waste: "#c4a574" };
for (const [k, cap] of Object.entries(caps)) {
  const best = Math.max(contrast("#f4ead6", cap), contrast("#1c1916", cap));
  check(`5 contrast on ${k}`, best >= 3.0, best.toFixed(2));
}
check("5 red on cream", contrast("#b3261e", "#f4ead6") >= 4.5, contrast("#b3261e", "#f4ead6").toFixed(2));
check("5 dark on cream", contrast("#1c1916", "#f4ead6") >= 7, contrast("#1c1916", "#f4ead6").toFixed(2));

check("no console errors", errors.length === 0, errors.join(" | "));
if (fails.length) {
  console.error("tokens-prove FAILED:", fails.join(", "));
  process.exit(1);
}
console.log("tokens-prove ok");
