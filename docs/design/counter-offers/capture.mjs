// Pictures of the counter-offer prototype (docs/design/counter-offers.md), from the real game with prototype.patch applied.
// Hand-run, not a proof. Practice mode, no host. Each state is set through the store and window.__proto; Counter, the
// sheet's tokens and Send counter are pressed for real. Writes <state>-<WxH>.png and measures.md beside this file.
// Run from the repo root: flock /tmp/emberisle-proof.lock node docs/design/counter-offers/capture.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { chooseBotAction } from "../../../src/lib/game/ai.ts";
import { createGame } from "../../../src/lib/game/board.ts";
import { applyAction } from "../../../src/lib/game/rules.ts";

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, "../../..");
const SIZES = [
  { w: 390, h: 844, touch: true, all: true },
  { w: 440, h: 956, touch: true },
  { w: 844, h: 390, touch: true },
  { w: 1280, h: 720, touch: false },
];
// States 1, 2, 3, 4 and 6 at every size; the rest at 390x844 only.
const EVERY = new Set(["recv-offer", "recv-cannot-pay", "recv-sheet", "recv-sheet-unchanged", "recv-waiting", "ask-counter"]);

// A game past setup: four seats, me (p0) and three still bots. `names` renames them; `hand` is my hand.
function game({ names, current, hand }) {
  let g = createGame({ humans: [{ name: "Me" }], bots: 3, seed: 11 });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = "main";
  g.current = current;
  g.dice = [3, 4];
  // Setup reorders the seats, so the names go by seat id.
  g.players.forEach((p) => {
    p.name = names[Number(p.id.slice(1))];
    p.resources = p.id === "p0" ? { ...hand } : { timber: 2, clay: 2, wool: 2, grain: 2, ore: 2 };
  });
  return g;
}
const RECV = ["Pine", "Tide", "Moss", "Dune"];
const ASK = ["Tide", "Pine", "Moss", "Dune"];
const PAY = { timber: 1, clay: 1, wool: 1, grain: 0, ore: 1 };
const BROKE = { timber: 1, clay: 1, wool: 1, grain: 0, ore: 0 };
const ASKER = { timber: 1, clay: 0, wool: 1, grain: 3, ore: 0 };
// Tide's offer: Tide gives 2 wheat and wants 1 stone (bags from the asker's side).
const OFFER = { tradeId: "proto", from: "p1", fromName: "Tide", give: { grain: 2 }, want: { ore: 1 }, until: null };
const MINE = { ...OFFER, from: "p0" };
const PROTO = { counterAllowed: false, counterUsed: false, myCounter: null, counterNo: null, counters: [], counterSheet: false, optionB: false };
const PINE = { counterId: "c1", by: "p1", name: "Pine", give: { grain: 2 }, want: { clay: 1 } };
const MOSS = { counterId: "c2", by: "p2", name: "Moss", give: { grain: 2 }, want: { wool: 1 } };

// Everything measures.md reports: the visible buttons of the action row (or the sheet's footer), the top line's size and lines.
const measure = (page, sheet) =>
  page.evaluate((sheet) => {
    const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).display !== "none" && !el.closest(".sr-only"); };
    // Distinct line boxes of the text alone (not the seat dot or an icon).
    const lines = (el) => {
      const tops = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0.5 && !tops.some((t) => Math.abs(t - r.top) < 6)) tops.push(r.top);
      }
      return tops.length;
    };
    const px = (n) => Math.round(n * 10) / 10;
    const top = sheet ? document.querySelector('[data-testid="trade-player-preview"]') : document.querySelector("[data-hud-stack] .trade-line, [data-hud-stack] [data-testid='trade-outcome']");
    const row = sheet ? document.querySelector(".trade-composer-footer") : document.querySelector("[data-hud-stack] .trade-answers");
    const stack = document.querySelector("[data-hud-stack]").getBoundingClientRect();
    const reason = document.querySelector('[data-testid="trade-counter-why"]');
    const wait = document.querySelector("[data-hud-stack] .trade-wait");
    const cs = top && getComputedStyle(top);
    return {
      text: top?.textContent.trim().replace(/\s+/g, " ") ?? null,
      font: cs ? `${parseFloat(cs.fontSize)} px / ${parseFloat(cs.lineHeight)} px, weight ${cs.fontWeight}` : null,
      lines: top ? lines(top) : 0,
      lineBox: top ? `${px(top.getBoundingClientRect().width)}x${px(top.getBoundingClientRect().height)}` : null,
      wait: wait && seen(wait) ? wait.textContent.trim() : null,
      reason: reason ? `${reason.textContent.trim()} (${parseFloat(getComputedStyle(reason).fontSize)} px)` : null,
      buttons: [...(row?.querySelectorAll("button") ?? [])].filter(seen).map((b) => {
        const r = b.getBoundingClientRect();
        const c = getComputedStyle(b);
        return { text: b.textContent.trim(), w: px(r.width), h: px(r.height), primary: c.backgroundColor === "rgb(31, 61, 59)", off: b.disabled, overflow: b.scrollWidth > b.clientWidth + 0.5 };
      }),
      rowOverflow: row ? row.scrollWidth > row.clientWidth + 0.5 : false,
      give: [...document.querySelectorAll(sheet ? ".trade-sentence .trade-give-text" : "[data-hud-stack] .trade-line .trade-give-text")].map((e) => `${e.textContent.trim()} ${getComputedStyle(e).color}`),
      get: [...document.querySelectorAll(sheet ? ".trade-sentence .trade-get-text" : "[data-hud-stack] .trade-line .trade-get-text")].map((e) => `${e.textContent.trim()} ${getComputedStyle(e).color}`),
      stack: `${px(stack.width)}x${px(stack.height)} at top ${px(stack.top)}`,
      chevron: !!document.querySelector(".trade-chevron"),
      sheet: (() => {
        const s = sheet && document.querySelector('[data-testid="trade-panel"]');
        if (!s) return null;
        const r = s.getBoundingClientRect();
        const sc = s.querySelector(".trade-composer-scroll");
        return `${px(r.width)}x${px(r.height)} at top ${px(r.top)}${sc.scrollHeight > sc.clientHeight + 0.5 ? `, goods scroll ${sc.scrollHeight - sc.clientHeight} px` : ""}`;
      })(),
      tap: (() => { const t = document.querySelector(".trade-line[data-tap]"); if (!t) return null; const r = t.getBoundingClientRect(); return `${px(r.width)}x${px(r.height)}`; })(),
    };
  }, sheet);

const vite = await createServer({ root: ROOT, configFile: path.join(ROOT, "vite.config.ts"), server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const PORT = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const results = [];
const errors = [];
try {
  for (const v of SIZES.filter((s) => !process.env.ONLY || process.env.ONLY === `${s.w}x${s.h}`)) {
    const tag = `${v.w}x${v.h}`;
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: v.touch, isMobile: v.touch, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
    await page.evaluate(() => import("/src/components/game/counter-proto.ts"));
    const press = (loc) => (v.touch ? loc.tap() : loc.click());
    const settle = async () => {
      await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'));
      await page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r)); });
      await page.waitForTimeout(400);
    };
    const load = async (g, offer, proto, extra = {}) => {
      await page.evaluate(([g, offer, proto, extra]) => {
        const e = window.__emberisle;
        if (e.getState().screen !== "play") e.getState().startAi();
        window.__proto.set(proto);
        e.setState({ runBots: () => {}, state: g, localId: "p0", buildMode: "none", pendingPlace: null, pendingSteal: null, error: null, banner: null, toast: null, offer, declined: [], tradeOutcome: null, tradeTaker: null, tradeOpen: false, ...extra });
      }, [g, offer, { ...PROTO, ...proto }, extra]);
      await page.getByTestId("trade-toast").or(page.getByTestId("trade-outcome")).first().waitFor();
      // The first load glides the island to its fit; let it land.
      await page.waitForFunction(() => !window.__isle.glide && !window.__isle.refitDue);
      await settle();
    };
    const proto = async (p) => { await page.evaluate((p) => window.__proto.set(p), p); await settle(); };
    const shot = async (state, sheet = false) => {
      if (!v.all && !EVERY.has(state)) return;
      const m = await measure(page, sheet);
      results.push({ state, tag, ...m });
      await page.screenshot({ path: path.join(OUT, `${state}-${tag}.png`) });
      console.log(state, tag, JSON.stringify(m));
    };

    // The seat that got Tide's offer.
    await load(game({ names: RECV, current: "p1", hand: PAY }), OFFER, { counterAllowed: true });
    await page.waitForTimeout(1500);
    await shot("recv-offer");
    await press(page.getByTestId("trade-counter"));
    await page.getByTestId("trade-panel").waitFor();
    await page.getByTestId("trade-give-clay").waitFor();
    await settle();
    await shot("recv-sheet-unchanged", true);
    await press(page.getByTestId("trade-minus-give-ore"));
    await press(page.getByTestId("trade-give-clay").locator(".trade-add"));
    await settle();
    await shot("recv-sheet", true);
    await press(page.getByRole("button", { name: "Send counter" }));
    await page.getByTestId("trade-my-counter").waitFor();
    await settle();
    await shot("recv-waiting");
    await proto({ myCounter: null, counterNo: "Tide said no" });
    await shot("recv-refused");
    await proto({ counterNo: null });
    await shot("recv-after");
    await proto({ counterUsed: false, optionB: true });
    await shot("recv-optionB");

    await load(game({ names: RECV, current: "p1", hand: BROKE }), OFFER, { counterAllowed: true });
    await shot("recv-cannot-pay");
    // For comparison: today's outcome line, in the same place "Tide said no" takes.
    await load(game({ names: RECV, current: "p1", hand: PAY }), null, {}, { tradeOutcome: "Tide takes it.", tradeTaker: "p1" });
    await shot("today-outcome");

    // The asker.
    await load(game({ names: ASK, current: "p0", hand: ASKER }), MINE, { counters: [PINE] });
    await shot("ask-counter");
    await proto({ counters: [PINE, MOSS] });
    await shot("ask-two");
    await proto({ counters: [] });
    await shot("ask-waiting");
    await ctx.close();
  }
} finally {
  await browser.close();
  await vite.close();
}

const ORDER = ["recv-offer", "recv-cannot-pay", "recv-sheet-unchanged", "recv-sheet", "recv-waiting", "recv-refused", "recv-after", "ask-counter", "ask-two", "ask-waiting", "recv-optionB", "today-outcome"];
const md = [
  "# Counter-offer prototype: measures",
  "",
  "Read from the DOM by `capture.mjs`, at device scale 2, in CSS px. Buttons are the visible buttons of the tray's action row, or of the counter sheet's footer for the two sheet states. The top line is the tray's `.trade-line` (the outcome line for `recv-refused`), or the sheet's sentence. Lines are the distinct line boxes of its text.",
  "",
];
for (const tag of ["390x844", "440x956", "844x390", "1280x720"]) {
  const rows = results.filter((r) => r.tag === tag).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
  if (!rows.length) continue;
  md.push(`## ${tag}`, "", "| State | Top line | Font | Lines | Quiet status | Buttons (w x h) | Notes |", "|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const buttons = r.buttons.map((b) => `${b.text} ${b.w}x${b.h}${b.primary ? " (primary)" : ""}${b.off ? " (off)" : ""}${b.overflow ? " (text overflows)" : ""}`).join("; ") || "none";
    const notes = [r.reason && `reason: ${r.reason}`, r.sheet && `sheet ${r.sheet}`, r.rowOverflow && "row overflows", r.tap && `tappable line ${r.tap}`, !r.sheet && `tray ${r.stack}`].filter(Boolean).join("; ");
    md.push(`| \`${r.state}\` | ${r.text} | ${r.font} | ${r.lines} | ${r.wait ?? ""} | ${buttons} | ${notes} |`);
  }
  md.push("");
}
md.push(`Page errors: ${errors.length ? errors.join("; ") : "none"}.`, "");
writeFileSync(path.join(OUT, "measures.md"), md.join("\n"));
console.log(errors.length ? `ERRORS\n${errors.join("\n")}` : "no page errors");
