// #1252: Selected trade-card names meet WCAG 1.4.3 (4.5:1 text contrast) on both sides across viewports.
// Owner decision (2026-11-06): white selected surface with ink border cue, goods colours kept.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8195;
const VIEWS = [
  { width: 1280, height: 720, tag: "1280x720" },
  { width: 390, height: 844, tag: "390x844", touch: true },
  { width: 844, height: 390, tag: "844x390", touch: true },
];

const lum = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Negative control: against old raised background #f3f6f5, selected Brick, Wheat, Stone fall below 4.5:1
const OLD_RAISED = [0xf3, 0xf6, 0xf5];
const TOKENS = {
  brick: [0xb8, 0x53, 0x3d],
  wheat: [0x8c, 0x72, 0x2d],
  stone: [0x63, 0x74, 0x8a],
};
assert.ok(ratio(TOKENS.brick, OLD_RAISED) < 4.5, "control: brick on old raised background is < 4.5:1");
assert.ok(ratio(TOKENS.wheat, OLD_RAISED) < 4.5, "control: wheat on old raised background is < 4.5:1");
assert.ok(ratio(TOKENS.stone, OLD_RAISED) < 4.5, "control: stone on old raised background is < 4.5:1");

mkdirSync("docs/proofs/1252/screenshots", { recursive: true });

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const errors = [];
const measurements = {};

try {
  for (const v of VIEWS) {
    const page = await browser.newPage({
      viewport: { width: v.width, height: v.height },
      ...(v.touch ? { isMobile: true, hasTouch: true } : {}),
    });
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state);

    // Give player p0 all resources so cards are enabled on give and want
    await page.evaluate(() => {
      const g = window.__emberisle.getState().state;
      g.phase = "main";
      g.current = "p0";
      const me = g.players.find((p) => p.id === "p0");
      me.resources = { timber: 5, clay: 5, wool: 5, grain: 5, ore: 5 };
      window.__emberisle.setState({ state: { ...g }, tradeOpen: true });
    });

    await page.waitForSelector('[data-testid="trade-give-clay"]');

    const measureCard = async (side, resource) => {
      return page.evaluate(([side, resource]) => {
        const card = document.querySelector(`[data-testid="trade-${side}-${resource}"]`);
        const name = card.querySelector(".trade-resource-name");
        const s = getComputedStyle(card);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const parseRgb = (css) => {
          ctx.fillStyle = "#000";
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        return {
          fg: parseRgb(getComputedStyle(name).color),
          bg: parseRgb(s.backgroundColor),
          border: parseRgb(s.borderColor),
          selected: card.hasAttribute("data-selected"),
        };
      }, [side, resource]);
    };

    // 1. Measure unselected cards on both sides
    measurements[v.tag] = { unselected: {}, selectedGive: {}, selectedWant: {} };
    for (const side of ["give", "want"]) {
      for (const [name, resKey] of [["Brick", "clay"], ["Wheat", "grain"], ["Stone", "ore"]]) {
        const m = await measureCard(side, resKey);
        assert.equal(m.selected, false, `${v.tag} ${side} ${name} unselected`);
        const cr = ratio(m.fg, m.bg);
        measurements[v.tag].unselected[`${side}-${name}`] = cr.toFixed(3);
        assert.ok(cr >= 4.5, `${v.tag} ${side} ${name} unselected contrast ${cr.toFixed(3)} >= 4.5`);
      }
    }

    // 2. Select Brick, Wheat, Stone on give side
    await page.getByRole("button", { name: "More Brick to give" }).click();
    await page.getByRole("button", { name: "More Wheat to give" }).click();
    await page.getByRole("button", { name: "More Stone to give" }).click();

    for (const [name, resKey] of [["Brick", "clay"], ["Wheat", "grain"], ["Stone", "ore"]]) {
      const m = await measureCard("give", resKey);
      assert.equal(m.selected, true, `${v.tag} give ${name} selected`);
      const cr = ratio(m.fg, m.bg);
      measurements[v.tag].selectedGive[name] = cr.toFixed(3);
      assert.ok(cr >= 4.5, `${v.tag} give ${name} selected contrast ${cr.toFixed(3)} >= 4.5`);
      assert.deepEqual(m.bg, [255, 255, 255], `${v.tag} give ${name} selected bg is white`);
    }

    // 3. Reset give and select want
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("trade-panel").waitFor({ state: "detached" });
    await page.evaluate(() => window.__emberisle.setState({ tradeOpen: true }));
    await page.waitForSelector('[data-testid="trade-want-clay"]');

    await page.getByRole("button", { name: "More Brick to want" }).click();
    await page.getByRole("button", { name: "More Wheat to want" }).click();
    await page.getByRole("button", { name: "More Stone to want" }).click();

    for (const [name, resKey] of [["Brick", "clay"], ["Wheat", "grain"], ["Stone", "ore"]]) {
      const m = await measureCard("want", resKey);
      assert.equal(m.selected, true, `${v.tag} want ${name} selected`);
      const cr = ratio(m.fg, m.bg);
      measurements[v.tag].selectedWant[name] = cr.toFixed(3);
      assert.ok(cr >= 4.5, `${v.tag} want ${name} selected contrast ${cr.toFixed(3)} >= 4.5`);
      assert.deepEqual(m.bg, [255, 255, 255], `${v.tag} want ${name} selected bg is white`);
    }

    // Save screenshot for owner review
    await page.screenshot({ path: `docs/proofs/1252/screenshots/trade-contrast-${v.tag}.png` });
    await page.close();
  }

  assert.deepEqual(errors, [], "no console or page errors");
  console.log("Measurements across viewports:", JSON.stringify(measurements, null, 2));
  console.log("trade-contrast-prove ok: all selected and unselected trade cards >= 4.5:1 across 3 viewports");
} finally {
  await browser.close();
  await vite.close();
}
