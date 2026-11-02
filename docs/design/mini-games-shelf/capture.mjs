// Renders the mini-games mock (docs/design/mini-games-hub/mock.html) screen by screen at four sizes, 1:1, cropped
// to the device frame. Usage: [LAYER=hig-layer.css] node capture.mjs <repoRoot> <mockFile> <outDir>
import { mkdirSync } from "node:fs";
import path from "node:path";
import { VIEWS, SHOTS, openMock, show } from "./views.mjs";

const [root, mock, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const { browser, page } = await openMock(root, mock);
try {
  for (const [prefix, layout, w, h, drawn] of VIEWS) {
    if (!drawn) continue;
    for (const [name, screen, state] of SHOTS) {
      await show(page, layout, w, h, screen, state);
      const file = path.join(outDir, `${prefix}-${name}.png`);
      await page.locator("#frame").screenshot({ path: file });
      console.log("saved", path.basename(file));
    }
  }
} finally {
  await browser.close();
}
