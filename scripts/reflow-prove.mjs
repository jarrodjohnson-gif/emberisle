// #383: WCAG 1.4.4 / 1.4.10 reflow. At 640x360 (a 1280x720 window at 200 % zoom), at 320x568 and on an 844x390 touch phone (#421):
// - the title's "Emberisle" wordmark starts on screen, the Join button is fully on screen, no title button runs past the right
//   edge, and the page has no horizontal scroll;
// - in hotseat `main` with every fortune kind held, the bottom HUD stack starts below the header (landscape: header + 8 px)
//   or the seat strip (portrait), and at least 120 px of the island between them stays uncovered and takes the pointer.
// - #402: while the stack has content below the fold a static "more below" cue shows (it takes no pointer events), it is gone
//   once the stack is scrolled to the end, and it never shows at 1280x720 where nothing overflows.
// - #420: at 390x844 (touch) the four-seat strip stays 44 px and no seat name is cut off: under 100 px a cell
//   shows a short form, the roll-off die only during the roll-off and the points after it, never both side by side.
//   Two seats whose three letters match ("Ember", "Emberly") still read differently.
// - #419: on that touch screen an armed Path's banner ends "tap Path again to cancel", and a second tap restores it.
// Zero console errors. Run: npm run reflow-prove
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8100;
const BOARD_MIN = 120;
const VIEWPORTS = [
  { width: 640, height: 360 },
  { width: 320, height: 568 },
  { width: 1280, height: 720 },
  // Phone landscape (#421): the title must not run past the top edge.
  { width: 844, height: 390, touch: true },
  // Phone portrait, four seats in the strip (#420, #419).
  { width: 390, height: 844, touch: true, strip: true },
];

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const failures = [];
const check = (ok, what, data) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what} ${JSON.stringify(data)}`);
  if (!ok) failures.push(what);
};
let code = 0;
try {
  for (const viewport of VIEWPORTS) {
    const tag = `${viewport.width}x${viewport.height}`;
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: !!viewport.touch, isMobile: !!viewport.touch });
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);

    const join = page.getByRole("button", { name: "Join", exact: true });
    await join.waitFor();
    // Before anything scrolls (#421): Play's subtitle renders (#444 cut the hotseat one), and on phone landscape the whole
    // card is on screen: wordmark and every button inside the viewport.
    const fold = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="title-card"]');
      const out = [...card.querySelectorAll("p, h1, button, input")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top < 0 || r.left < 0 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5;
      }).map((el) => (el.textContent.trim() || el.getAttribute("aria-label") || el.tagName).slice(0, 24));
      return { out, subtitles: [...card.querySelectorAll("p")].map((p) => p.textContent).filter((s) => /^3 bots, no network$/.test(s)) };
    });
    check(fold.subtitles.length === 1, `${tag} title: Play's subtitle renders`, fold.subtitles);
    if (viewport.touch) check(fold.out.length === 0, `${tag} title: wordmark and buttons inside the viewport`, fold.out);
    await join.scrollIntoViewIfNeeded();
    const title = await page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect();
      const card = document.querySelector('[data-testid="title-card"]');
      const join = [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Join");
      const j = r(join);
      const c = r(card);
      const over = [...card.querySelectorAll("button")]
        .filter((b) => r(b).right > innerWidth + 0.5 || r(b).left < -0.5)
        .map((b) => `${b.textContent.trim() || b.getAttribute("aria-label")} ${Math.round(r(b).left)}..${Math.round(r(b).right)}`);
      return {
        join: [j.left, j.top, j.right, j.bottom].map(Math.round),
        // Fully visible: inside the viewport and inside the card's own scroll box.
        joinVisible: j.left >= 0 && j.top >= 0 && j.right <= innerWidth && j.bottom <= innerHeight &&
          j.left >= c.left && j.top >= c.top && j.right <= c.right && j.bottom <= c.bottom,
        over,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
      };
    });
    check(title.joinVisible, `${tag} title: Join fully visible`, title.join);
    check(title.over.length === 0, `${tag} title: no button past the right edge`, title.over);
    check(title.scrollWidth <= title.innerWidth, `${tag} title: no horizontal scroll`, { scrollWidth: title.scrollWidth });

    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await page.waitForFunction(() => window.__emberisle?.getState().state);
    // #420: read every portrait strip cell: the name actually drawn (not the screen-reader copy), whether it is cut off, die and points.
    const strip = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="seat-strip"]');
        if (!el || el.closest("header")) return null;
        const shown = (x) => !!x && x.getClientRects().length > 0 && getComputedStyle(x).position !== "absolute";
        return {
          h: el.getBoundingClientRect().height,
          cells: [...el.querySelectorAll('[data-testid^="seat-p"]')].map((cell) => {
            const name = [...cell.querySelectorAll('[data-testid="seat-name"]')].find(shown);
            const row = name?.parentElement;
            return {
              w: Math.round(cell.getBoundingClientRect().width),
              name: name?.textContent ?? null,
              cut: !name || name.scrollWidth > name.clientWidth || row.scrollWidth > row.clientWidth,
              die: shown(cell.querySelector('[data-testid="rolloff-die"]')),
              vp: shown(cell.querySelector('[data-testid="seat-vp"]')),
            };
          }),
        };
      });
    const checkStrip = (s, phase) => {
      const narrow = s.cells.filter((c) => c.w < 100);
      check(s.h === 44 && s.cells.length === 4 && s.cells.every((c) => !c.cut), `${tag} strip (${phase}): 44 px, four cells, no name cut off`, s);
      if (narrow.length) {
        check(narrow.every((c) => (phase === "rollOff" ? c.die && !c.vp : !c.die && c.vp)), `${tag} strip (${phase}): under 100 px, ${phase === "rollOff" ? "die without points" : "points without die"}`, narrow);
      }
    };
    if (viewport.strip) {
      await page.getByTestId("seat-strip").waitFor();
      checkStrip(await strip(), "rollOff");
    }
    await page.evaluate(() => {
      const g = window.__emberisle;
      const st = structuredClone(g.getState().state);
      const me = st.players[0];
      st.phase = "main";
      st.current = me.id;
      st.playedCard = false;
      st.dice = [3, 4];
      st.log.push("Rolled 3 and 4.", "Pine gains 1 timber.", "Moss gains 1 grain.");
      me.resources = { timber: 4, clay: 4, wool: 4, grain: 4, ore: 4 };
      me.hidden = { knight: 1, road: 1, plenty: 1, monopoly: 1, vp: 1 };
      me.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
      st.seq += 1;
      g.setState({ state: st, banner: "Rolled 3 and 4: 7.", buildMode: "none", pendingSteal: null, error: null });
    });
    await page.getByRole("button", { name: "End turn" }).waitFor();
    await page.locator("form", { hasText: "Plenty" }).first().waitFor();
    // The island canvas is lazy-loaded and can mount after the HUD; the evaluate below reads all three.
    await page.locator("canvas").first().waitFor();
    await page.locator("header > .pointer-events-auto").waitFor();
    await page.getByTestId("turn-banner").waitFor();
    const hud = await page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = (el) => el.getBoundingClientRect();
      const header = r(document.querySelector("header > .pointer-events-auto"));
      const strip = document.querySelector('[data-testid="seat-strip"]');
      const portraitStrip = strip && !strip.closest("header") ? r(strip) : null;
      const stack = r(document.querySelector('[data-testid="turn-banner"]').closest(".pointer-events-auto"));
      const canvas = r(document.querySelector("canvas"));
      const chrome = portraitStrip ? portraitStrip.bottom : header.bottom;
      const gapTop = Math.max(canvas.top, chrome);
      const gapBottom = Math.min(canvas.bottom, stack.top);
      const midY = (gapTop + gapBottom) / 2;
      // Sample across the gap: the island must take the pointer there, not a HUD panel.
      const xs = [0.25, 0.5, 0.75].map((f) => Math.round(innerWidth * f));
      const hits = gapBottom > gapTop ? xs.map((x) => document.elementFromPoint(x, midY)?.tagName ?? null) : [];
      return {
        headerBottom: Math.round(header.bottom),
        stripBottom: portraitStrip ? Math.round(portraitStrip.bottom) : null,
        stackTop: Math.round(stack.top),
        stackBottom: Math.round(stack.bottom),
        uncovered: Math.round(gapBottom - gapTop),
        hits,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    if (viewport.strip) {
      checkStrip(await strip(), "main");
      await page.evaluate(() => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        st.players[0].name = "Ember";
        st.players[1].name = "Emberly";
        st.seq += 1;
        g.setState({ state: st });
      });
      await page.waitForFunction(() => document.querySelector('[data-testid="seat-strip"] [data-testid="seat-name"][aria-hidden]')?.textContent !== "Emb");
      const twins = await strip();
      const shown = twins.cells.map((c) => c.name);
      check(new Set(shown).size === 4 && twins.cells.every((c) => !c.cut), `${tag} strip: "Ember" and "Emberly" read differently`, shown);
      const name = await page.evaluate(() => window.__emberisle.getState().state.players[0].name);
      const path = page.getByRole("button", { name: "Path", exact: true });
      const bannerIs = (t) => page.waitForFunction((t) => document.querySelector('[data-testid="turn-banner"]')?.textContent === t, t, { timeout: 5000 }).then(() => true, () => false);
      await path.tap();
      const armed = `${name}'s turn — Pick a glowing edge · tap Path again to cancel`;
      check(await bannerIs(armed), `${tag} armed Path on touch: banner says what to pick and how to cancel`, await page.getByTestId("turn-banner").textContent());
      await path.tap();
      check(await bannerIs(`${name}'s turn — Build, trade with the bank, or end your turn.`), `${tag} second tap: banner back to the main line`, await page.getByTestId("turn-banner").textContent());
    }
    const floor = hud.stripBottom ?? hud.headerBottom + 8;
    check(hud.stackTop >= floor, `${tag} hud: bottom stack starts below the ${hud.stripBottom ? "seat strip" : "header + 8 px"}`, hud);
    check(hud.uncovered >= BOARD_MIN && hud.hits.length > 0 && hud.hits.every((t) => t === "CANVAS"), `${tag} hud: >= ${BOARD_MIN} px of island uncovered and pointer-reachable`, { uncovered: hud.uncovered, hits: hud.hits });
    check(hud.scrollWidth <= viewport.width, `${tag} hud: no horizontal scroll`, { scrollWidth: hud.scrollWidth });
    await page.screenshot({ path: `test-results/reflow-${tag}.png` });
    // #402: the cue tracks overflow. The scroller is the stack's `overflow-y-auto` element.
    const stackState = () =>
      page.evaluate(() => {
        const sc = document.querySelector('[data-testid="turn-banner"]').closest(".pointer-events-auto");
        const cue = document.querySelector('[data-testid="hud-more-below"]');
        return {
          overflow: sc.scrollHeight - sc.scrollTop - sc.clientHeight > 1,
          cue: !!cue,
          cuePointer: cue ? getComputedStyle(cue).pointerEvents : null,
        };
      });
    const before = await stackState();
    if (viewport.height <= 568) check(before.overflow, `${tag} hud: stack overflows (End turn below the fold)`, before);
    if (viewport.height === 720) check(!before.overflow && !before.cue, `${tag} hud: no overflow, no cue`, before);
    if (before.overflow) {
      await page.waitForSelector('[data-testid="hud-more-below"]', { timeout: 2000 });
      check((await stackState()).cuePointer === "none", `${tag} hud: cue takes no pointer events`, await stackState());
    }
    // The capped stack scrolls, so the last action in it must still be reachable and on top once scrolled to.
    const endTurn = page.getByRole("button", { name: "End turn" });
    await endTurn.scrollIntoViewIfNeeded();
    const reach = await endTurn.evaluate((b) => {
      const r = b.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), onTop: b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
    });
    check(reach.onTop && reach.bottom <= viewport.height, `${tag} hud: End turn reachable by scrolling the stack`, reach);
    if (before.overflow) {
      await page.evaluate(() => {
        const sc = document.querySelector('[data-testid="turn-banner"]').closest(".pointer-events-auto");
        sc.scrollTop = sc.scrollHeight;
      });
      await page.waitForSelector('[data-testid="hud-more-below"]', { state: "detached", timeout: 2000 });
      check(!(await stackState()).cue, `${tag} hud: cue gone once scrolled to the bottom`, await stackState());
    }
    await page.close();
  }
  check(errors.length === 0, "zero console errors", errors);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log("reflow-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
