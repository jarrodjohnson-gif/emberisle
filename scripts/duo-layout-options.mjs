// #1829: the layout options for the folded iPhone Duo (466x678), as CSS overrides injected at run time by
// scripts/duo-layout-options-prove.mjs. Nothing here ships. `baseline` is today's layout, the reference, not an option.
export const OPTIONS = [
  { id: "baseline", name: "Today", baseline: true, css: "" },
  {
    id: "a-slim-goods",
    name: "A. Slim goods row",
    // The goods cards drop to the 44 px the short phone already uses (no name, symbol and count only), and the tray's padding tightens.
    css: `
      .upright-table .goods-card { height: 44px; }
      .upright-table .goods-label { display: none; }
      .upright-table .goods-card, .upright-table .goods-lit { justify-content: flex-start; }
      .upright-table .goods-tray { padding-top: 6px; padding-bottom: 2px; }
      .hud-tray { padding: 8px 14px 10px; gap: 8px; }
    `,
  },
  {
    id: "b-words-on-button",
    name: "B. Instruction on the button",
    // The turn line and the last event leave the tray (the instruction moves onto the primary button's label); goods stay full size.
    css: `.hud-tray > .tray-top { display: none; }`,
  },
  {
    id: "c-both",
    name: "C. Both: slim goods, no instruction row, bar 8 px higher",
    css: `
      .upright-table .goods-card { height: 44px; }
      .upright-table .goods-label { display: none; }
      .upright-table .goods-card, .upright-table .goods-lit { justify-content: flex-start; }
      .upright-table .goods-tray { padding-top: 6px; padding-bottom: 2px; }
      .hud-tray { padding: 8px 14px 10px; gap: 8px; }
      .hud-tray > .tray-top { display: none; }
      .hud-header { padding-top: 4px; }
    `,
  },
  {
    id: "d-side-rail",
    proposed: false,
    name: "D. Controls on the side (tried, not proposed)",
    // Apple's iPhone Duo guidance puts bars on the side of the outer display. The goods and the action buttons stack in a
    // 112 px right rail under the seat strip. The hole keeps its height, but the island is width-bound and shrinks: see hexSpan.
    css: `
      div.upright-table:has([data-hud-stack]) { top: 68px; bottom: 12px; left: auto; right: 12px; width: 112px; padding: 0; }
      div.upright-table:has([data-hud-stack]) > .relative { height: 100%; max-width: none; margin: 0; }
      .hud-stack.hud-tray { height: 100%; max-height: none; justify-content: flex-end; padding: 8px; border-radius: 16px; }
      .hud-stack .tray-event { display: none; }
      .hud-stack .goods-tray { flex-direction: column; padding: 0; }
      .hud-stack .goods-card { height: 44px; }
      .hud-stack .goods-label { display: none; }
      .hud-stack .goods-card, .hud-stack .goods-lit { justify-content: flex-start; flex-direction: row; gap: 6px; align-items: center; padding: 0 10px; }
      .hud-stack .action-utilities { grid-auto-flow: row; }
    `,
  },
];
