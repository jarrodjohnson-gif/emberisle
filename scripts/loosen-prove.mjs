// #924: flag a pull request that loosens a proof (AGENTS.md rule 7). For each *-prove.mjs in scripts/ or server/ changed
// between the base and HEAD, fail on a removed or edited check line, a new `.skip`, fewer checks, an added
// process.exit(0) or process.exitCode = 0, or a deleted proof.
// A check is assert(...), assert.x(...), expect(...), check(...), fail(...), throw, process.exit(1) or process.exitCode = 1.
// Comments (/* */ blocks and whole // lines) are removed first, so a commented-out check counts as removed.
// Advisory: CI runs it as the non-required `loosen` job. It does not replace a human review of REVIEWING.md item 4.
// Scope: only the line holding the check token is compared, so a tolerance on a later line of a multi-line call is not seen.
// Also proves the check itself on inline fixtures.
// Run: npm run loosen-prove [-- --base <commit>]   (default base: git merge-base origin/main HEAD)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const CHECK = /\bassert(?:\.\w+)?\s*\(|\bexpect\s*\(|\bcheck\s*\(|\bfail\s*\(|\bthrow\b|process\.exit\(\s*1\s*\)|process\.exitCode\s*=\s*1\b/g;
const PASS_EXIT = /process\.exit\(\s*0?\s*\)|process\.exitCode\s*=\s*0\b/g;
const SKIP = /\.skip\b/g;
const PROOF = /^(scripts|server)\/[^/]+-prove\.mjs$/;

const count = (text, re) => text.match(re)?.length ?? 0;
const code = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("//"));

// Returns the reasons `after` is looser than `before` (empty when it is not).
export function loosened(before, after) {
  const [b, a] = [code(before), code(after)];
  const [bText, aText] = [b.join("\n"), a.join("\n")];
  const reasons = [];
  const left = new Map();
  for (const l of a) if (count(l, CHECK)) left.set(l, (left.get(l) ?? 0) + 1);
  for (const l of b) {
    if (!count(l, CHECK)) continue;
    if (left.get(l)) left.set(l, left.get(l) - 1);
    else reasons.push(`removed or edited check line: ${l}`);
  }
  for (const [what, re, rose] of [
    [".skip count", SKIP, true],
    ["check count", CHECK, false],
    ["process.exit(0) / process.exitCode = 0 count", PASS_EXIT, true],
  ]) {
    const [n0, n1] = [count(bText, re), count(aText, re)];
    if (rose ? n1 > n0 : n1 < n0) reasons.push(`${what} ${rose ? "rose" : "fell"} from ${n0} to ${n1}`);
  }
  return reasons;
}

// Self-test on inline fixtures: [label, before, after, a reason that must appear, or null when it must pass].
const proof = `import assert from "node:assert/strict";
const check = (ok, what) => { if (!ok) fail(what); };
function fail(what) { console.log("FAIL", what); process.exitCode = 1; }
assert.ok(width <= 320, "fits in 320 px");
check(score === 10, "score is 10");
if (!ready) throw new Error("not ready");
expect(rows).toHaveLength(3);
/* a block comment: assert.ok(old) */
console.log("ok");
`;
const cases = [
  ["an unchanged proof passes", proof, proof, null],
  ["re-indenting passes", proof, proof.replace(/^/gm, "  "), null],
  ["an added check passes", proof, `${proof}assert.equal(a, 1);\n`, null],
  ["editing only the block comment passes", proof, proof.replace("assert.ok(old)", "old notes"), null],
  ["a removed assert fails", proof, proof.replace(/^assert\.ok\(width.*\n/m, ""), "removed or edited check line: assert.ok(width"],
  ["a removed assert lowers the count", proof, proof.replace(/^assert\.ok\(width.*\n/m, ""), "check count fell"],
  ["a wider tolerance fails", proof, proof.replace("width <= 320", "width <= 400"), "removed or edited check line: assert.ok(width <= 320"],
  ["a //-commented assert fails", proof, proof.replace("assert.ok(width", "// assert.ok(width"), "removed or edited check line: assert.ok(width"],
  ["a /* */-commented assert fails", proof, proof.replace(/^(assert\.ok\(width.*)$/m, "/* $1 */"), "removed or edited check line: assert.ok(width"],
  ["a check wrapped in a multi-line /* */ fails", proof, proof.replace(/^(check\(score.*)$/m, "/*\n$1\n*/"), "removed or edited check line: check(score"],
  ["a removed throw fails", proof, proof.replace('throw new Error("not ready")', 'console.log("not ready")'), "removed or edited check line: if (!ready)"],
  ["a removed expect fails", proof, proof.replace(/^expect.*\n/m, ""), "removed or edited check line: expect(rows)"],
  ["a fail() that no longer sets exitCode 1 fails", proof, proof.replace("process.exitCode = 1", "process.exitCode = 0"), "process.exit(0) / process.exitCode = 0 count rose from 0 to 1"],
  ["an added process.exit(0) fails", proof, proof.replace('console.log("ok");', 'process.exit(0);\nconsole.log("ok");'), "process.exit(0) / process.exitCode = 0 count rose from 0 to 1"],
  ["an added process.exit() fails", proof, proof.replace('console.log("ok");', "process.exit();"), "process.exit(0) / process.exitCode = 0 count rose"],
  ["a new .skip fails", proof, `${proof}test.skip("later", () => {});\n`, ".skip count rose from 0 to 1"],
];
for (const [label, before, after, want] of cases) {
  const got = loosened(before, after);
  if (want === null) assert.deepEqual(got, [], label);
  else assert.ok(got.some((r) => r.startsWith(want)), `${label}: got ${JSON.stringify(got)}`);
  console.log(`ok   self-test: ${label}`);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 << 20 });
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
    status === "D" || !PROOF.test(to) ? ["deleted or renamed away from *-prove.mjs"] : loosened(git("show", `${base}:${from}`), git("show", `HEAD:${to}`));
  for (const r of reasons) console.log(`FAIL ${from === to ? from : `${from} -> ${to}`}: ${r}`);
  if (reasons.length) failed++;
}
if (failed) {
  console.log(`${failed} proof(s) loosened against ${base.slice(0, 12)}. Restore the checks, or keep them and add new ones (AGENTS.md rule 7).`);
  process.exit(1);
}
console.log(`loosen-prove: ${compared} changed proof(s) against ${base.slice(0, 12)}, none loosened`);
