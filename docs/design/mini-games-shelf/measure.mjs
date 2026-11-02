// Measures the mini-games mock's controls and text at phone and desktop: every visible button's height and width, and
// the font sizes of visible text in the frame. Usage: node measure929.mjs <repoRoot> <mockFile>
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [root, mock] = process.argv.slice(2);
const { chromium } = await import(path.join(root, "node_modules/playwright/index.mjs"));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});
const screens = [["A"], ["B", "idle"], ["B", "invited"], ["C"], ["D"], ["E"]];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  await page.goto(pathToFileURL(mock).href);
  // Mock bug fix (both sets): the host's Start button is `btn lg sea`, and `.sea` is also the full-screen ocean
  // (position: absolute; inset: 0), so on host screens the button filled the whole card.
  await page.addStyleTag({ content: ".callout { display: none !important; } .btn.sea { position: relative !important; inset: auto !important; }" });
  // Optional: a CSS layer to apply on top (the accepted lobby type and target scale).
  if (process.env.LAYER) await page.addStyleTag({ path: process.env.LAYER });
  for (const vp of ["phone", "desk"]) {
    await page.evaluate((v) => window.setVp(v), vp);
    const small = new Map();
    const fonts = new Map();
    for (const [s, st] of screens) {
      await page.evaluate(([s, st]) => (st === undefined ? window.go(s) : window.go(s, st)), [s, st]);
      await page.waitForTimeout(150);
      const got = await page.evaluate(() => {
        const frame = document.getElementById("frame");
        const fr = frame.getBoundingClientRect();
        const scale = fr.width / frame.offsetWidth || 1;
        const out = { buttons: [], text: [] };
        for (const b of frame.querySelectorAll("button, [role=tab], a")) {
          const r = b.getBoundingClientRect();
          if (!r.width || getComputedStyle(b).visibility === "hidden") continue;
          out.buttons.push({ label: (b.getAttribute("aria-label") || b.textContent).trim().slice(0, 24), h: Math.round(r.height / scale), w: Math.round(r.width / scale) });
        }
        const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
        for (let n; (n = walker.nextNode()); ) {
          const t = n.textContent.trim();
          if (!t) continue;
          const el = n.parentElement;
          if (!el.getClientRects().length) continue;
          out.text.push({ t: t.slice(0, 28), px: parseFloat(getComputedStyle(el).fontSize) });
        }
        return out;
      });
      for (const b of got.buttons) if (b.h < 44 || b.w < 44) small.set(`${b.label} ${b.w}x${b.h}`, `${s}${st ? "/" + st : ""}`);
      for (const t of got.text) fonts.set(t.px, (fonts.get(t.px) ?? new Set()).add(t.t));
    }
    console.log(`== ${vp}: controls under 44 px (label WxH -> screen):`);
    for (const [k, v] of small) console.log(`   ${k} -> ${v}`);
    console.log(`== ${vp}: font sizes in use (px -> sample text):`);
    for (const [px, set] of [...fonts].sort((a, b) => a[0] - b[0])) console.log(`   ${px}px: ${[...set].slice(0, 5).join(" | ")}`);
  }
} finally {
  await browser.close();
}
