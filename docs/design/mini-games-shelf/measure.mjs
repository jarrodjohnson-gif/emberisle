// Measures the mini-games mock at each size: controls under 44 px, gaps under 8 px between neighbouring controls,
// whether the open game or shelf ends above the sticky footer, whether anything covers screen E's "Game closed." line,
// the card's top edge (the island's share), and the font sizes in use.
// Usage: [LAYER=hig-layer.css] node measure.mjs <repoRoot> <mockFile>
import { VIEWS, SHOTS, openMock, show } from "./views.mjs";

const [root, mock] = process.argv.slice(2);
const { browser, page } = await openMock(root, mock);
try {
  for (const [prefix, layout, w, h] of VIEWS) {
    const small = new Map();
    const tight = new Map();
    const fonts = new Map();
    const lines = [];
    for (const [name, screen, state] of SHOTS) {
      await show(page, layout, w, h, screen, state);
      const got = await page.evaluate(() => {
        const frame = document.getElementById("frame");
        const fr = frame.getBoundingClientRect();
        const out = { buttons: [], text: [], gaps: [] };
        const rects = [];
        for (const b of frame.querySelectorAll("button, [role=tab], a, .win span")) {
          const r = b.getBoundingClientRect();
          if (!r.width || getComputedStyle(b).visibility === "hidden" || b.closest(".frame-stage")) continue;
          const label = (b.getAttribute("aria-label") || b.textContent).trim().slice(0, 24);
          out.buttons.push({ label, h: Math.round(r.height), w: Math.round(r.width) });
          rects.push({ label, r });
        }
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i].r, b = rects[j].r;
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0;
          const gap = overlapY ? Math.max(b.left - a.right, a.left - b.right) : overlapX ? Math.max(b.top - a.bottom, a.top - b.bottom) : Infinity;
          if (gap >= 0 && gap < 8) out.gaps.push(`${rects[i].label} | ${rects[j].label}: ${Math.round(gap)} px`);
        }
        const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
        for (let n; (n = walker.nextNode()); ) {
          const t = n.textContent.trim();
          if (!t) continue;
          const el = n.parentElement;
          if (!el.getClientRects().length) continue;
          out.text.push({ t: t.slice(0, 28), px: parseFloat(getComputedStyle(el).fontSize) });
        }
        const card = frame.querySelector(".card");
        const foot = frame.querySelector(".foot");
        const body = frame.querySelector(".box") || frame.querySelector(".shelf");
        out.cardTop = Math.round(card.getBoundingClientRect().top - fr.top);
        out.cardH = Math.round(card.getBoundingClientRect().height);
        if (body && foot) {
          const shown = [...body.children].filter((el) => el.getClientRects().length);
          const last = shown[shown.length - 1].getBoundingClientRect().bottom;
          out.clip = Math.round(last - foot.getBoundingClientRect().top);
        }
        const toast = frame.querySelector(".toast");
        const stamp = frame.querySelector(".starting div");
        if (toast && stamp) {
          const a = toast.getBoundingClientRect(), b = stamp.getBoundingClientRect();
          out.covered = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        }
        return out;
      });
      for (const b of got.buttons) if (b.h < 44 || b.w < 44) small.set(`${b.label} ${b.w}x${b.h}`, name);
      for (const g of got.gaps) tight.set(g, name);
      for (const t of got.text) fonts.set(t.px, (fonts.get(t.px) ?? new Set()).add(t.t));
      const fit = got.clip === undefined ? "" : got.clip > 0 ? `; CLIPPED: content ends ${got.clip} px under the footer's top` : `; ends ${-got.clip} px above the footer`;
      const cover = got.covered === undefined ? "" : got.covered ? "; 'Game closed.' COVERED by the Starting stamp" : "; 'Game closed.' visible";
      lines.push(`   ${name}: card top ${got.cardTop} px, card height ${got.cardH} px (island share above the card ${Math.round((got.cardTop / h) * 100)}%)${fit}${cover}`);
    }
    console.log(`== ${prefix}: per screen`);
    for (const l of lines) console.log(l);
    console.log(`== ${prefix}: controls under 44 px (label WxH -> screen):${small.size ? "" : " none"}`);
    for (const [k, v] of small) console.log(`   ${k} -> ${v}`);
    console.log(`== ${prefix}: neighbouring controls closer than 8 px:${tight.size ? "" : " none"}`);
    for (const [k, v] of tight) console.log(`   ${k} -> ${v}`);
    console.log(`== ${prefix}: font sizes in use (px -> sample text):`);
    for (const [px, set] of [...fonts].sort((a, b) => a[0] - b[0])) console.log(`   ${px}px: ${[...set].slice(0, 5).join(" | ")}`);
  }
} finally {
  await browser.close();
}
