// #468: the home-screen icons, all rendered from public/icons/icon.svg in headless Chromium. Run after editing the SVG,
// then commit the PNGs: npm run make-icons
// - icon-192/512 (purpose any): the mark alone on a transparent square, scaled up to fill it;
// - icon-maskable-512: full-bleed stone with the mark at its own size, inside the maskable safe circle;
// - apple-touch-icon (180): full-bleed stone (iOS fills transparency with black), the mark scaled up as for any.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const DIR = fileURLToPath(new URL("../public/icons/", import.meta.url));
const SVG = readFileSync(`${DIR}icon.svg`, "utf8");
const OUT = [
  { file: "icon-192.png", size: 192, bg: false, scale: 1.15 },
  { file: "icon-512.png", size: 512, bg: false, scale: 1.15 },
  { file: "icon-maskable-512.png", size: 512, bg: true, scale: 1 },
  { file: "apple-touch-icon.png", size: 180, bg: true, scale: 1.15 },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});
try {
  for (const o of OUT) {
    const page = await browser.newPage({ viewport: { width: o.size, height: o.size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${o.size}px;height:${o.size}px}</style>${SVG}`);
    await page.evaluate(({ bg, scale }) => {
      if (!bg) document.getElementById("bg").remove();
      document.getElementById("mark").setAttribute("transform", `translate(256 256) scale(${scale}) translate(-256 -256)`);
    }, o);
    await page.screenshot({ path: `${DIR}${o.file}`, omitBackground: !o.bg });
    await page.close();
    console.log(`wrote public/icons/${o.file}`);
  }
} finally {
  await browser.close();
}
