// #820: an open trade offer raises the hand cards it changes. What this seat gives rises with a red edge and "−N";
// what it gets rises with a green edge and "+N". Both clear when the offer closes or this seat answers it. Under
// reduced motion the edge and label stay and nothing lifts.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8820;
const STEP_MS = 15_000;
const RESOURCES = ["timber", "clay", "wool", "grain", "ore"];
const RED = "rgb(138, 34, 25)"; // --loss #8a2219
const GREEN = "rgb(16, 86, 42)"; // --gain #10562a

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  for (const reduced of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
    // Hold a good of each kind so the hand is on the table, then open and close offers straight on the store.
    await page.evaluate(() => {
      const s = window.__emberisle.getState();
      window.__emberisle.setState({
        state: { ...s.state, players: s.state.players.map((p) => (p.id === s.localId ? { ...p, resources: { timber: 1, clay: 1, wool: 1, grain: 2, ore: 1 } } : p)) },
      });
    });
    const setOffer = (o, answered = false) =>
      page.evaluate(([o, answered]) => {
        const s = window.__emberisle.getState();
        const from = o?.mine ? s.localId : s.state.players.find((p) => p.id !== s.localId).id;
        window.__emberisle.setState({
          offer: o && { tradeId: "t820", from, fromName: "Bot", give: o.give, want: o.want, until: Date.now() + 20000 },
          declined: answered ? [s.localId] : [],
        });
      }, [o, answered]);
    const read = () =>
      page.evaluate(() =>
        Object.fromEntries(["timber", "clay", "wool", "grain", "ore"].map((r) => {
          const slot = document.querySelector(`[data-testid="offer-slot-${r}"]`);
          const label = slot.querySelector('[data-testid="offer-delta"]');
          const card = slot.querySelector(`[data-testid="resource-${r}"]`);
          const t = getComputedStyle(slot).transform;
          return [r, { offer: slot.dataset.offer ?? null, label: label?.textContent ?? null, color: label && getComputedStyle(label).color,
            edge: getComputedStyle(card).boxShadow, lift: t === "none" ? 0 : new DOMMatrixReadOnly(t).m42 }];
        })),
      );
    const lifted = reduced ? 0 : -3;
    // The lift is a transition, so poll until every slot has settled where it should be.
    const settled = async (want) => {
      const lifts = RESOURCES.map((r) => (want[r] ? lifted : 0));
      await page.waitForFunction(
        (lifts) => ["timber", "clay", "wool", "grain", "ore"].every((r, i) => {
          const t = getComputedStyle(document.querySelector(`[data-testid="offer-slot-${r}"]`)).transform;
          return (t === "none" ? 0 : new DOMMatrixReadOnly(t).m42) === lifts[i];
        }),
        lifts, { timeout: STEP_MS },
      );
      return read();
    };
    const check = (got, want, tag) => {
      for (const r of RESOURCES) {
        const w = want[r];
        const g = got[r];
        assert.equal(g.offer, w?.[0] ?? null, `${tag}: ${r} offer`);
        assert.equal(g.label, w?.[1] ?? null, `${tag}: ${r} label`);
        assert.equal(g.lift, w ? lifted : 0, `${tag}: ${r} lift`);
        if (w) {
          assert.equal(g.color, w[0] === "give" ? RED : GREEN, `${tag}: ${r} label colour`);
          assert.ok(g.edge.includes(w[0] === "give" ? RED : GREEN), `${tag}: ${r} edge ${g.edge}`);
        } else assert.ok(!g.edge.includes(RED) && !g.edge.includes(GREEN), `${tag}: ${r} has no edge`);
      }
    };
    const tag = reduced ? "reduced" : "motion";

    // Another seat offers 1 clay for 1 timber: this seat gives timber and gets clay.
    await setOffer({ give: { clay: 1 }, want: { timber: 1 } });
    check(await settled({ timber: 1, clay: 1 }), { timber: ["give", "−1"], clay: ["get", "+1"] }, `${tag} received`);
    // This seat answers: it clears at once.
    await setOffer({ give: { clay: 1 }, want: { timber: 1 } }, true);
    check(await settled({}), {}, `${tag} answered`);
    // This seat's own offer reads from its own side: it gives `give` and gets `want`.
    await setOffer({ mine: true, give: { grain: 2 }, want: { ore: 1 } });
    check(await settled({ grain: 1, ore: 1 }), { grain: ["give", "−2"], ore: ["get", "+1"] }, `${tag} own`);
    // The offer ends.
    await setOffer(null);
    check(await settled({}), {}, `${tag} closed`);
    console.log(`${tag}: received, answered, own and closed offers raise and clear the right cards`);
    await ctx.close();
  }
  if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
  console.log("hand offer prove ok");
} catch (e) {
  console.log("FAIL", e.stack ?? e.message);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  process.exit(code);
}
