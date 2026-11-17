// #1252: Selected trade-card names meet WCAG 1.4.3 (4.5:1 text contrast) on both sides across viewports.
// Owner decision (2026-11-06): white selected surface with ink border cue, goods colours kept.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "./proof-browser.mjs";

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

mkdirSync("docs/proofs/1252/screenshots", { recursive: true });

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const errors = [];
const measurements = { controlBefore: {}, productionAfter: {}, unselected: {} };

try {
  for (const v of VIEWS) {
    const page = await browser.newPage({
      viewport: { width: v.width, height: v.height },
      ...(v.touch ? { isMobile: true, hasTouch: true } : {}),
    });
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play with bots", exact: true }).click();
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
        const name = card.querySelector(".trade-resource-name, .trade-owned");
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
    measurements.unselected[v.tag] = {};
    for (const side of ["give", "want"]) {
      for (const [name, resKey] of [["Brick", "clay"], ["Wheat", "grain"], ["Stone", "ore"]]) {
        const m = await measureCard(side, resKey);
        assert.equal(m.selected, false, `${v.tag} ${side} ${name} unselected`);
        const cr = ratio(m.fg, m.bg);
        measurements.unselected[v.tag][`${side}-${name}`] = cr.toFixed(3);
        assert.ok(cr >= 4.5, `${v.tag} ${side} ${name} unselected contrast ${cr.toFixed(3)} >= 4.5`);
      }
    }

    // 2. Select Brick, Wheat, Stone on give side
    await page.getByRole("button", { name: "More Brick to give" }).click();
    await page.getByRole("button", { name: "More Wheat to give" }).click();
    await page.getByRole("button", { name: "More Stone to give" }).click();

    // --- CONTROL PHASE: Inject a low-contrast selected fill (the Give edge red) to prove the measure catches a failure (#1537) ---
    const controlStyle = await page.addStyleTag({
      content: ".trade-resource[data-selected] { background: var(--edge) !important; }",
    });

    measurements.controlBefore[v.tag] = {};
    for (const [name, resKey] of [["Brick", "clay"], ["Wheat", "grain"], ["Stone", "ore"]]) {
      const m = await measureCard("give", resKey);
      assert.equal(m.selected, true, `${v.tag} give ${name} selected (control)`);
      assert.deepEqual(m.bg, [0xb3, 0x26, 0x1e], `${v.tag} give ${name} control bg is the Give edge red #b3261e`);
      const cr = ratio(m.fg, m.bg);
      measurements.controlBefore[v.tag][name] = cr.toFixed(3);
      assert.ok(cr < 4.5, `${v.tag} give ${name} control contrast ${cr.toFixed(3)} must be < 4.5`);
    }

    // Capture BEFORE screenshot with the control fill
    await page.screenshot({ path: `docs/proofs/1252/screenshots/before-${v.tag}.png` });

    // Remove control style to restore the production Give tint
    await controlStyle.evaluate((el) => el.remove());

    // --- PRODUCTION PHASE: Verify the Give and Get tints meet >= 4.5:1 ---
    measurements.productionAfter[v.tag] = { give: {}, want: {} };
    for (const [name, resKey] of [["Brick", "clay"], ["Wheat", "grain"], ["Stone", "ore"]]) {
      const m = await measureCard("give", resKey);
      assert.equal(m.selected, true, `${v.tag} give ${name} selected (production)`);
      assert.deepEqual(m.bg, [0xfd, 0xec, 0xea], `${v.tag} give ${name} production bg is the Give tint #fdecea`);
      const cr = ratio(m.fg, m.bg);
      measurements.productionAfter[v.tag].give[name] = cr.toFixed(3);
      assert.ok(cr >= 4.5, `${v.tag} give ${name} production contrast ${cr.toFixed(3)} >= 4.5`);
    }

    // Capture AFTER screenshot with the production tint
    await page.screenshot({ path: `docs/proofs/1252/screenshots/after-${v.tag}.png` });

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
      assert.deepEqual(m.bg, [0xe4, 0xf4, 0xea], `${v.tag} want ${name} selected bg is the Get tint #e4f4ea`);
      const cr = ratio(m.fg, m.bg);
      measurements.productionAfter[v.tag].want[name] = cr.toFixed(3);
      assert.ok(cr >= 4.5, `${v.tag} want ${name} selected contrast ${cr.toFixed(3)} >= 4.5`);
    }

    await page.close();
  }

  assert.deepEqual(errors, [], "no console or page errors");
  console.log("Measurements across viewports:\n" + JSON.stringify(measurements, null, 2));
  console.log("trade-contrast-prove ok: control verified failure < 4.5:1 and production verified >= 4.5:1 across 3 viewports");
} finally {
  await browser.close();
  await vite.close();
}
