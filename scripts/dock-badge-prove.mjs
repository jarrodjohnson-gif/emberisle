// #846: every dock's badge on the board shows which good it takes, without a tap. In the browser, on the full Hex Jelly board
// with the jelly shore in:
// - nine docks, nine badges (the shore's "plates" mesh), each 2:1 badge's row of the atlas holds its good's icon (pixels of
//   the good's colour in the icon cell, a dark halo round them, a different shape from every other good's) and its short name,
//   and a 3:1 badge reads "3:1 any" with no icon;
// - the badge's ink outline against its light plate, and the outline against the deepest water and the sand, are at least 3:1;
// - on screen, at 1280x720 and 1920x1080 (fine pointer, default view) and 390x844 (coarse pointer, overhead), every badge is
//   at least MIN px wide and half that tall, so its icon (0.45 of the width) is about as big as a number token (28 px at 1280x720);
// Saves test-results/dock-badge-{1280,1920,390}.png. Port from VITE_PORT, default 8113.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8113;
// Smallest badge width in CSS px, by screen. The phone is the overhead view, the fit's smallest island.
const MIN_W = { 1280: 55, 1920: 100, 390: 38 };
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
mkdirSync("test-results", { recursive: true });

async function play(width, height, touch) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(() => {
    localStorage.setItem("emberisle-water", "crystal");
    localStorage.setItem("emberisle-jelly", "full");
  });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await page.waitForFunction(
    () => window.__isle?.lastState && window.__isle.landReady && !window.__isle.refitDue && !window.__isle.glide && window.__isle.shore?.group.getObjectByName("plates"),
    null,
    { timeout: STEP_MS },
  );
  // A few more frames so the camera has settled on the fitted view.
  await page.evaluate(async () => {
    const isle = window.__isle;
    isle.wake?.();
    const r0 = isle.renders;
    await new Promise((res) => {
      const poll = () => (isle.renders >= r0 + 3 ? res() : requestAnimationFrame(poll));
      poll();
    });
  });
  return page;
}

// The atlas, read back: per kind, the icon cell's pixels of the good's colour, its dark halo, and a mask of the icon.
const atlas = (page) =>
  page.evaluate(async () => {
    const isle = window.__isle;
    const { PAINT } = await import("/src/lib/scene/palette.ts");
    const tex = isle.shore.group.getObjectByName("plates").material.map;
    const img = tex.image;
    const W = img.width;
    const H = img.height / 6;
    const x = img.getContext("2d");
    const kinds = ["any", "timber", "clay", "wool", "grain", "ore"];
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const near = (p, c, t) => Math.abs(p[0] - c[0]) < t && Math.abs(p[1] - c[1]) < t && Math.abs(p[2] - c[2]) < t;
    const rows = {};
    kinds.forEach((k, i) => {
      const d = x.getImageData(0, i * H, W, H).data;
      const good = k === "any" ? null : hex(PAINT[k][0]);
      const ink = hex("#2a2118");
      const mask = new Uint8Array(W * H);
      let colour = 0;
      let halo = 0;
      let textInk = 0;
      for (let py = 0; py < H; py++)
        for (let px = 0; px < W; px++) {
          const o = (py * W + px) * 4;
          const p = [d[o], d[o + 1], d[o + 2]];
          const inIcon = px >= 20 && px < 262 && py >= 30 && py < 278;
          if (inIcon && good && near(p, good, 14)) {
            colour++;
            mask[py * W + px] = 1;
          }
          if (inIcon && near(p, ink, 14)) halo++;
          if (((px >= 262 && py >= 60 && py < 230) || py >= 285) && px < 500 && near(p, ink, 40)) textInk++;
        }
      rows[k] = { colour, halo, textInk, mask: Array.from(mask).filter((_, j) => j % 4 === 0).join("") };
    });
    return { W, H, rows };
  });

const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

try {
  // Texture checks, once, on the desktop page.
  const page = await play(1280, 720, false);
  const { W, H, rows } = await atlas(page);
  check("atlas: a row of 512x416 per kind", W === 512 && H === 416, { W, H });
  const goods = ["timber", "clay", "wool", "grain", "ore"];
  for (const k of goods) {
    const r = rows[k];
    check(`atlas: the ${k} badge draws its icon in the good's colour, with a dark halo, and a rate and name in ink`, r.colour > 3000 && r.halo > 1500 && r.textInk > 2500, { colour: r.colour, halo: r.halo, textInk: r.textInk });
  }
  const jac = (a, b) => {
    let i = 0;
    let u = 0;
    for (let j = 0; j < a.length; j++) {
      if (a[j] === "1" || b[j] === "1") u++;
      if (a[j] === "1" && b[j] === "1") i++;
    }
    return i / u;
  };
  let worst = 0;
  for (const a of goods) for (const b of goods) if (a < b) worst = Math.max(worst, jac(rows[a].mask, rows[b].mask));
  check("atlas: the five icons are five different shapes", worst < 0.6, { worstOverlap: +worst.toFixed(2) });
  check("atlas: the 3:1 badge has no icon, only ink text", rows.any.colour === 0 && rows.any.textInk > 4000, { textInk: rows.any.textInk });
  const faces = await page.evaluate(() => {
    const { docks } = window.__isle;
    return { docks: docks.length, kinds: docks.map((d) => d.kind) };
  });
  check("nine docks, each with a badge", faces.docks === 9, faces);
  check("contrast: the ink outline on the light plate is at least 3:1", ratio("#2a2118", "#fbf6ea") >= 3, ratio("#2a2118", "#fbf6ea").toFixed(1));
  check("contrast: the outline on the deepest water (#4ab9b5) and on sand (#e8d5a8) is at least 3:1", Math.min(ratio("#2a2118", "#4ab9b5"), ratio("#2a2118", "#e8d5a8")) >= 3, { water: ratio("#2a2118", "#4ab9b5").toFixed(1), sand: ratio("#2a2118", "#e8d5a8").toFixed(1) });
  await page.context().close();

  for (const [w, h, touch] of [[1280, 720, false], [1920, 1080, false], [390, 844, true]]) {
    const tag = `${w}x${h}`;
    const p = await play(w, h, touch);
    const m = await p.evaluate(() => {
      const isle = window.__isle;
      const mesh = isle.shore.group.getObjectByName("plates");
      mesh.updateWorldMatrix(true, false);
      const pos = mesh.geometry.attributes.position;
      const v = new (mesh.position.constructor)();
      const pt = (i) => {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        return isle.screenAt(v.x, v.y, v.z);
      };
      const out = [];
      const vw = innerWidth;
      const vh = innerHeight;
      for (let i = 0; i + 3 < pos.count; i += 4) {
        const [tl, tr, bl] = [pt(i), pt(i + 1), pt(i + 2)];
        const cx = (tl.x + tr.x) / 2;
        const cy = (tl.y + bl.y) / 2;
        out.push({ w: Math.hypot(tr.x - tl.x, tr.y - tl.y), h: Math.hypot(bl.x - tl.x, bl.y - tl.y), on: cx > 0 && cx < vw && cy > 0 && cy < vh });
      }
      return { view: isle.view, out, kinds: isle.docks.map((d) => d.kind) };
    });
    const minW = Math.min(...m.out.map((b) => b.w));
    const minH = Math.min(...m.out.map((b) => b.h));
    check(`${tag}: nine badges, all on the canvas`, m.out.length === 9 && m.out.every((b) => b.on), { n: m.out.length });
    check(`${tag}: every badge is at least ${MIN_W[w]} px wide and ${MIN_W[w] / 2} px tall (icon ${(0.45 * minW).toFixed(0)} px)`, minW >= MIN_W[w] && minH >= MIN_W[w] / 2, { minW: +minW.toFixed(1), minH: +minH.toFixed(1), view: m.view });
    await p.screenshot({ path: `test-results/dock-badge-${w}.png`, timeout: 180_000 });
    await p.context().close();
  }
  check("no console errors", errors.length === 0, errors);
} catch (e) {
  console.error("dock-badge-prove failed:", e);
  fails.push("exception");
}
await browser.close();
await vite.close();
if (fails.length) {
  console.log(`\n${fails.length} failed: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("\ndock-badge-prove: all checks passed");
