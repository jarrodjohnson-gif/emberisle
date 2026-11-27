// #1835: wording/order and exact away-seat matching; production helpers stay untouched.
import assert from "node:assert/strict";
import { offerLine } from "../src/components/game/offer-line.ts";
import { seatAway } from "../src/components/game/seat-away.ts";
import { bagText } from "../src/lib/game/trade.ts";

const give = Object.freeze({ wool: 2 }), want = Object.freeze({ ore: 1 });
// The game's actual labels are Sheep and Stone, not the issue's older wool/ore examples.
assert.equal(bagText(give), "2 sheep");
assert.equal(bagText(want), "1 stone");
console.log("ok labels: bagText uses sheep and stone");
const reverse = Object.freeze({ ore: 5, grain: 4, wool: 3, clay: 2, timber: 1 });
const ordered = "1 wood, 2 brick, 3 sheep, 4 wheat, 5 stone";
const lines = [
  ["named offer", "Ember", give, want, "Ember offers 2 sheep for 1 stone"],
  ["asker's offer", null, give, want, "You offer 2 sheep for 1 stone"],
  ["named gift", "Ember", give, {}, "Ember gives away 2 sheep"],
  ["asker's gift", null, give, {}, "You give away 2 sheep"],
  ["named request", "Ember", {}, want, "Ember asks for 1 stone"],
  ["asker's request", null, {}, want, "You ask for 1 stone"],
  ["resource order on both sides", "Ember", reverse, reverse, `Ember offers ${ordered} for ${ordered}`],
  ["asker's resource order", null, reverse, want, `You offer ${ordered} for 1 stone`],
  ["gift resource order", "Ember", reverse, {}, `Ember gives away ${ordered}`],
  ["request resource order", null, {}, reverse, `You ask for ${ordered}`],
  ["zero quantities absent", "Ember", { ore: 0, wool: 2 }, { timber: 0, ore: 1 }, "Ember offers 2 sheep for 1 stone"],
];
for (const [label, name, gives, wants, expected] of lines) {
  assert.equal(offerLine(name, gives, wants), expected, label);
  console.log(`ok offerLine: ${label}`);
}
const cases = [
  ["exact away name", [{ name: "Ember", away: true }], "Ember", true],
  ["bot suffix", [{ name: "Ember", away: true }], "Ember (bot)", true],
  ["present exact seat", [{ name: "Ember", away: false }], "Ember", false],
  ["present bot seat", [{ name: "Ember", away: false }], "Ember (bot)", false],
  ["missing away flag", [{ name: "Ember" }], "Ember", false],
  ["another away seat", [{ name: "Tide", away: true }, { name: "Ember", away: false }], "Ember", false],
  ["no matching name", [{ name: "Tide", away: true }], "Ember", false],
  ["empty seats", [], "Ember", false],
  ["prefix is not exact", [{ name: "Ember", away: true }], "Emberly", false],
  ["case matters", [{ name: "Ember", away: true }], "ember", false],
  ["suffix spacing matters", [{ name: "Ember", away: true }], "Ember(bot)", false],
  ["no suffix stripping", [{ name: "Ember (bot)", away: true }], "Ember", false],
  ["later matching away seat", [{ name: "Ember", away: false }, { name: "Ember", away: true }], "Ember", true],
];
for (const [label, seats, name, expected] of cases) {
  assert.equal(seatAway(seats, { name }), expected, label);
  console.log(`ok seatAway: ${label}`);
}
console.log(`hud-pure-helpers-prove: ${lines.length + cases.length + 1} cases passed`);
