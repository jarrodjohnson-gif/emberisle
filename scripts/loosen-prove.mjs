// #924: no pull request loosens a proof (AGENTS.md rule 7, REVIEWING.md item 4). For each *-prove.mjs in scripts/ or server/
// changed between the base and HEAD, fail on a removed or edited check line, a new `.skip`, fewer checks, or a deleted proof.
// A check is assert(...), assert.x(...), expect(...), check(...), fail(...), throw, process.exit(1) or process.exitCode = 1.
// Scope: only the line holding the check token is compared, so a tolerance on a later line of a multi-line call is not seen.
// Also proves the check itself on mutated copies of a real proof.
// Run: npm run loosen-prove [-- --base <commit>]   (default base: git merge-base origin/main HEAD)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CHECK = /\bassert(?:\.\w+)?\s*\(|\bexpect\s*\(|\bcheck\s*\(|\bfail\s*\(|\bthrow\b|process\.exit\(\s*1\s*\)|process\.exitCode\s*=\s*1\b/g;
const SKIP = /\.skip\b/g;
const PROOF = /^(scripts|server)\/[^/]+-prove\.mjs$/;

const count = (text, re) => text.match(re)?.length ?? 0;
const checkLines = (text) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("//") && count(l, CHECK) > 0);

// Returns the reasons `after` is looser than `before` (empty when it is not).
export function loosened(before, after) {
  const reasons = [];
  const left = new Map();
  for (const l of checkLines(after)) left.set(l, (left.get(l) ?? 0) + 1);
  for (const l of checkLines(before)) {
    if (left.get(l)) left.set(l, left.get(l) - 1);
    else reasons.push(`removed or edited check line: ${l}`);
  }
  const [skips0, skips1] = [count(before, SKIP), count(after, SKIP)];
  if (skips1 > skips0) reasons.push(`.skip count rose from ${skips0} to ${skips1}`);
  const [checks0, checks1] = [count(before, CHECK), count(after, CHECK)];
  if (checks1 < checks0) reasons.push(`check count fell from ${checks0} to ${checks1}`);
  return reasons;
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 << 20 });

// The check catches what it should, on mutated copies of a real proof.
const sample = readFileSync(new URL("./dice-prove.mjs", import.meta.url), "utf8");
const lines = sample.split("\n");
const at = lines.findIndex((l) => /^\s*assert\.\w+\(.*\d/.test(l));
const without = (i) => lines.filter((_, j) => j !== i).join("\n");
const swap = (i, l) => lines.map((x, j) => (j === i ? l : x)).join("\n");
assert.deepEqual(loosened(sample, sample), [], "an unchanged proof passes");
assert.deepEqual(loosened(sample, sample.replace(/^/gm, "  ")), [], "re-indenting passes");
assert.deepEqual(loosened(sample, `${sample}\nassert.ok(true, "one more");\n`), [], "an added check passes");
assert.ok(loosened(sample, without(at)).some((r) => r.startsWith("removed or edited check line")), "a removed assert fails");
assert.ok(loosened(sample, without(at)).some((r) => r.startsWith("check count fell")), "a removed assert lowers the count");
assert.ok(loosened(sample, swap(at, lines[at].replace(/\d+/, (n) => String(Number(n) + 1)))).length, "an edited assert (a wider tolerance) fails");
assert.ok(loosened(sample, swap(at, `// ${lines[at].trim()}`)).length, "a commented-out assert fails");
assert.ok(loosened(sample, sample.replace(/\bthrow new Error/, "console.log")).length, "a removed throw fails");
assert.ok(loosened("check(a, 'x');\n", "check(a, 'x');\ntest.skip('later', () => {});\n").some((r) => r.startsWith(".skip")), "a new .skip fails");
assert.ok(loosened("expect(x).toBe(1);\n", "").length, "a removed expect fails");
console.log("ok   mutation: removed, edited, commented-out and skipped checks fail; unchanged, re-indented and added checks pass");

const flag = process.argv.indexOf("--base");
const base = flag > 0 ? process.argv[flag + 1] : git("merge-base", "origin/main", "HEAD").trim();
const changes = git("diff", "--name-status", "-M", base, "HEAD", "--", "scripts", "server")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("\t"));

let failed = 0;
let compared = 0;
for (const [status, from, to = from] of changes) {
  if (!PROOF.test(from) && !PROOF.test(to)) continue;
  if (status === "A") continue;
  compared++;
  const reasons =
    status === "D" || !PROOF.test(to) ? [`deleted or renamed away from *-prove.mjs`] : loosened(git("show", `${base}:${from}`), git("show", `HEAD:${to}`));
  for (const r of reasons) console.log(`FAIL ${from === to ? from : `${from} -> ${to}`}: ${r}`);
  if (reasons.length) failed++;
}
if (failed) {
  console.log(`${failed} proof(s) loosened against ${base.slice(0, 12)}. Restore the checks, or keep them and add new ones (AGENTS.md rule 7).`);
  process.exit(1);
}
console.log(`loosen-prove: ${compared} changed proof(s) against ${base.slice(0, 12)}, none loosened`);
