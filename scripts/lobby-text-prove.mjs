// #1235: actual lobby text follows the root size at 100/125/150%, without clipping or horizontal overflow.
// Five issue viewports; real host/guest/bot/empty seat and chat. Intentional card scrolling must keep controls reachable.
// Run: npm run lobby-text-prove. The capture utility retains the full observations and screenshots on failure.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const out = resolve(process.env.LOBBY_TEXT_OUT || "test-results/lobby-text-prove");
execFileSync(process.execPath, ["scripts/lobby-text-capture.mjs", "--run", "lobby-text-prove", "--out", out], { stdio: "inherit" });
const result = JSON.parse(readFileSync(`${out}/measurements.json`, "utf8"));
assert.equal(result.records.length, 15, "all five viewports and three text sizes must be recorded");
assert.equal(result.errors.length, 0, "no console or page errors");
const failures = [];
const check = (ok, message) => { if (!ok) { failures.push(message); console.error(`FAIL ${message}`); } };
for (const row of result.records) {
  const base = result.records.find(x => x.width === row.width && x.height === row.height && x.scale === 1);
  check(row.controlOverlaps.length === 0, `${row.tag}: controls do not overlap: ${JSON.stringify(row.controlOverlaps)}`);
  check(row.codeFits, `${row.tag}: real four-character room code fits`);
  check(row.documentOverflow === 0 && row.documentOverflowY === 0, `${row.tag}: page has no overflow`);
  check(row.cardOverflow.x <= 1, `${row.tag}: card has no horizontal overflow`);
  check(row.peopleOverflow.x <= 1 && row.peopleOverflow.y <= 1, `${row.tag}: seat text fits its grid`);
  check(row.unreachableControls.length === 0, `${row.tag}: controls reachable: ${row.unreachableControls.join(" | ")}`);
  check(row.clippedText.length === 0, `${row.tag}: text not clipped: ${row.clippedText.join(" | ")}`);
  check(row.text.length > 0 && row.text.length === base.text.length, `${row.tag}: all visible text roles retained`);
  for (const [role, font] of Object.entries(row.fonts)) {
    check(Math.abs(font - base.fonts[role] * row.scale) <= 0.25, `${row.tag}: ${role} font ${font}, expected ${base.fonts[role] * row.scale}`);
  }
  for (let i = 0; i < Math.min(row.text.length, base.text.length); i++) {
    check(row.text[i].text === base.text[i].text, `${row.tag}: text role ${i} retains its content`);
    check(Math.abs(row.text[i].font - base.text[i].font * row.scale) <= 0.25,
      `${row.tag}: ${JSON.stringify(row.text[i].text)} font ${row.text[i].font}, expected ${base.text[i].font * row.scale}`);
  }
}
assert.equal(failures.length, 0, `${failures.length} lobby text scaling/fit failures; evidence: ${out}`);
console.log(`lobby-text-prove: PASS (${result.records.length} real-host viewport/text-size cases)`);
