// #924: flag a pull request that loosens a proof (AGENTS.md rule 7). For each *-prove.mjs in scripts/ or server/ changed
// between the base and HEAD, fail on a removed or edited check line, a new `.skip`, fewer checks, an added
// process.exit(0) or process.exitCode = 0, or a deleted proof.
// A check is assert(...), assert.x(...), expect(...), check(...), fail(...), throw, process.exit(1) or process.exitCode = 1.
// Comments (/* */ blocks and whole // lines) are removed first, so a commented-out check counts as removed.
// Advisory: CI runs it as the non-required `loosen` job. It does not replace a human review of REVIEWING.md item 4.
// Scope: only the line holding the check token is compared, so a tolerance on a later line of a multi-line call is not seen.
// #947 retirement: a proof whose feature was removed on purpose may be deleted only when docs/retired-proofs.json on the
// base already lists that exact path, so the owner lists it in an earlier PR. A rename away from *-prove.mjs still fails,
// listed or not, and a listed proof that is edited rather than deleted is compared like any other.
// Guard proofs cannot be retired, and a retired path cannot be reused by an added or renamed proof. Each entry copies
// an exact dated decision row naming its file in backticks; that row must already exist in docs/DECISIONS.md on the base.
// The list is owner-only: any change to it fails unless the PR's author and the account that started the run are both
// the repo owner, read from GitHub's event payload as label-commands.yml does for its owner-only labels. The one
// exception is creating it with no entries where the base has none: an empty list lets no proof go. CI runs the base's
// copy of this file and reads the list from the base, so a PR can change neither the rule nor the list that judges it.
// Outside Actions there is no payload, so a local run fails any owner-only change to the list.
// Also proves the check itself on inline fixtures.
// Run: npm run loosen-prove [-- --base <commit>]   (default base: git merge-base origin/main HEAD)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CHECK = /\bassert(?:\.\w+)?\s*\(|\bexpect\s*\(|\bcheck\s*\(|\bfail\s*\(|\bthrow\b|process\.exit\(\s*1\s*\)|process\.exitCode\s*=\s*1\b/g;
const PASS_EXIT = /process\.exit\(\s*0?\s*\)|process\.exitCode\s*=\s*0\b/g;
const SKIP = /\.skip\b/g;
const PROOF = /^(scripts|server)\/[^/]+-prove\.mjs$/;
const RETIRED = "docs/retired-proofs.json";
const DECISIONS = "docs/DECISIONS.md";
const GUARDS = new Set(["scripts/loosen-prove.mjs", "scripts/registered-prove.mjs"]);

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

// The proofs the base's retirement list lets a PR delete, as path -> entry. A missing list is empty; a malformed one throws.
export function retiredProofs(text) {
  const listed = new Map();
  if (text == null) return listed;
  const list = JSON.parse(text);
  if (!Array.isArray(list?.entries)) throw new Error('no "entries" array');
  list.entries.forEach((e, i) => {
    const bad = !PROOF.test(e?.file ?? "") ? "file" : !/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? "") ? "date"
      : !Number.isInteger(e.issue) || e.issue < 1 ? "issue" : typeof e.reason !== "string" || !e.reason.trim() ? "reason" : null;
    if (bad) throw new Error(`entry ${i} has no valid ${bad}`);
    if (GUARDS.has(e.file)) throw new Error(`entry ${i} cannot retire a proof guard`);
    if (typeof e.decision !== "string" || !/^\| \d{4}-\d{2}-\d{2} \|.+\|$/.test(e.decision)
      || !e.decision.includes(`\`${e.file}\``)) throw new Error(`entry ${i} has no valid decision row naming its file`);
    listed.set(e.file, e);
  });
  return listed;
}

function decisionRows(retired, decisions) {
  const rows = new Set((decisions ?? "").split("\n"));
  for (const e of retired.values()) {
    if (!rows.has(e.decision)) throw new Error(`decision row for ${e.file} is missing from ${DECISIONS} on the base`);
  }
}

// Both authorization documents come from the same base ref. HEAD cannot authorize its own deletion.
export function readRetirements(base, show) {
  const retired = retiredProofs(show(base, RETIRED));
  decisionRows(retired, show(base, DECISIONS));
  return retired;
}

// The reasons one `git diff --name-status` row loosens a proof (empty when it does not). retired: retiredProofs of the
// base's list. show(side, path) returns the file's text at "base" or at "head".
export function changeReasons([status, from, to = from], retired, show) {
  if (status === "D") return retired.has(from) ? [] : [`deleted, and ${RETIRED} on the base does not list it`];
  if ((status === "A" || (status.startsWith("R") && from !== to)) && retired.has(to)) return ["added proof reuses a retired path"];
  if (status === "A") return [];
  if (!PROOF.test(to)) return ["renamed away from *-prove.mjs (a retired proof is deleted, not renamed)"];
  return loosened(show("base", from), show("head", to));
}

// True only when the PR's author and the account that started this run are both the repo owner.
// event: GitHub's pull_request payload (GITHUB_EVENT_PATH), read as data; null outside Actions.
export function byOwner(event) {
  const owner = event?.repository?.owner?.login;
  return typeof owner === "string" && owner !== "" && event?.pull_request?.user?.login === owner && event?.sender?.login === owner;
}

// The reasons a change to the retirement list fails (empty when it passes). status: its `git diff --no-renames` status.
// headText: the list at HEAD (null when deleted). owner: byOwner of the run. Only the owner may change the list, except
// that anyone may create it with no entries where the base has none, because an empty list lets no proof go.
export function listReasons(status, headText, owner, who = "", decisions = "") {
  const reasons = [];
  let head = null;
  if (status !== "D") {
    try {
      head = retiredProofs(headText);
      decisionRows(head, decisions);
    } catch (e) {
      reasons.push(`not a valid list: ${e.message}`);
    }
  }
  if (!owner && !(status === "A" && head?.size === 0))
    reasons.push(`owner-only file${who && `, changed ${who}`}; only the repo owner may change it (anyone may create it empty where the base has none)`);
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

// #947 self-test: [label, diff row, the base's list, HEAD's text (the base's is `proof`), a reason that must appear or null].
const gone = "scripts/gone-prove.mjs";
const decision = `| 2026-10-21 | Retire \`${gone}\` because its feature was removed. | Jarrod, #923 |`;
const listed = retiredProofs(JSON.stringify({ entries: [{ file: gone, date: "2026-10-21", issue: 923, reason: "feature removed", decision }] }));
const unlisted = retiredProofs(`{ "about": "seed", "entries": [] }`);
const retireCases = [
  ["an unlisted deletion fails", ["D", gone], unlisted, null, `deleted, and ${RETIRED} on the base does not list it`],
  ["a listed deletion passes", ["D", gone], listed, null, null],
  ["a deletion listed only under another path fails", ["D", "server/gone-prove.mjs"], listed, null, "deleted, and"],
  ["a listed proof with a weakened assert fails", ["M", gone], listed, proof.replace("width <= 320", "width <= 400"), "removed or edited check line: assert.ok(width <= 320"],
  ["a listed proof with a removed check fails", ["M", gone], listed, proof.replace(/^check\(score.*\n/m, ""), "check count fell"],
  ["a listed proof renamed away fails", ["R100", gone, "scripts/gone.mjs"], listed, proof, "renamed away from *-prove.mjs"],
  ["an unlisted proof renamed away fails", ["R100", gone, "scripts/gone.mjs"], unlisted, proof, "renamed away from *-prove.mjs"],
  ["an added proof cannot reuse a retired path", ["A", gone], listed, proof, "added proof reuses a retired path"],
  ["a rename cannot reuse a retired path", ["R100", "scripts/other-prove.mjs", gone], listed, proof, "added proof reuses a retired path"],
  ["an unlisted new proof passes", ["A", gone], unlisted, proof, null],
];
for (const [label, row, retired, head, want] of retireCases) {
  const got = changeReasons(row, retired, (side) => (side === "base" ? proof : head));
  if (want === null) assert.deepEqual(got, [], label);
  else assert.ok(got.some((r) => r.startsWith(want)), `${label}: got ${JSON.stringify(got)}`);
  console.log(`ok   self-test: ${label}`);
}
const entry = (over) => JSON.stringify({ entries: [{ file: gone, date: "2026-10-21", issue: 923, reason: "feature removed", decision, ...over }] });
for (const [label, text, want] of [
  ["a missing list allows no deletion", null, 0],
  ["the empty seed list allows no deletion", `{ "about": "seed", "entries": [] }`, 0],
  ["a full entry is listed", entry({}), 1],
  ["an entry naming a file that is not a proof fails", entry({ file: "src/main.tsx" }), /entry 0 has no valid file/],
  ["an entry with no date fails", entry({ date: undefined }), /entry 0 has no valid date/],
  ["an entry with no issue fails", entry({ issue: "#923" }), /entry 0 has no valid issue/],
  ["an entry with an empty reason fails", entry({ reason: " " }), /entry 0 has no valid reason/],
  ["a list with no entries array fails", `{ "files": ["${gone}"] }`, /no "entries" array/],
  ["a list that is not JSON fails", `entries: ["${gone}"]`, /JSON/],
  ["loosen-prove cannot be retired", entry({ file: "scripts/loosen-prove.mjs" }), /cannot retire a proof guard/],
  ["registered-prove cannot be retired", entry({ file: "scripts/registered-prove.mjs" }), /cannot retire a proof guard/],
  ["an entry must cite a decision row", entry({ decision: undefined }), /no valid decision row/],
  ["the decision row must name the exact proof", entry({ decision: decision.replace(gone, "scripts/other-prove.mjs") }), /no valid decision row/],
  ["prose cannot stand in for a decision row", entry({ decision: `Retire \`${gone}\`` }), /no valid decision row/],
]) {
  if (typeof want === "number") assert.equal(retiredProofs(text).size, want, label);
  else assert.throws(() => retiredProofs(text), want, label);
  console.log(`ok   self-test: ${label}`);
}
const payloadOf = (author, sender, owner = "jarrodjohnson-gif") =>
  ({ repository: { owner: { login: owner } }, pull_request: { user: { login: author } }, sender: { login: sender } });
for (const [label, payload, want] of [
  ["the owner may change the list", payloadOf("jarrodjohnson-gif", "jarrodjohnson-gif"), true],
  ["a collaborator may not change the list", payloadOf("joshspicy2", "joshspicy2"), false],
  ["a collaborator's push to the owner's PR may not change the list", payloadOf("jarrodjohnson-gif", "joshspicy2"), false],
  ["the owner's run on a collaborator's PR may not change the list", payloadOf("joshspicy2", "jarrodjohnson-gif"), false],
  ["a local run with no payload may not change the list", null, false],
  ["a payload with no owner may not change the list", { pull_request: { user: {} }, sender: {} }, false],
]) {
  assert.equal(byOwner(payload), want, label);
  console.log(`ok   self-test: ${label}`);
}
// [label, diff status, the list at HEAD, byOwner, a reason that must appear or null].
const seed = `{ "about": "seed", "entries": [] }`;
for (const [label, status, headText, owner, want] of [
  ["a non-owner creating the empty seed where the base has none passes", "A", seed, false, null],
  ["a non-owner creating a seed with one entry fails", "A", entry({}), false, "owner-only file"],
  ["a non-owner creating a malformed seed fails", "A", `{ "about": "seed" }`, false, "not a valid list"],
  ["a non-owner adding an entry to the list fails", "M", entry({}), false, "owner-only file"],
  ["a non-owner emptying the list fails", "M", seed, false, "owner-only file"],
  ["a non-owner deleting the list fails", "D", null, false, "owner-only file"],
  ["the owner adding an entry passes", "M", entry({}), true, null],
  ["the owner creating a seed with one entry passes", "A", entry({}), true, null],
  ["the owner breaking the list fails", "M", entry({ issue: 0 }), true, "not a valid list: entry 0 has no valid issue"],
]) {
  const got = listReasons(status, headText, owner, "", decision);
  if (want === null) assert.deepEqual(got, [], label);
  else assert.ok(got.some((r) => r.startsWith(want)), `${label}: got ${JSON.stringify(got)}`);
  console.log(`ok   self-test: ${label}`);
}

const fixtureShow = (baseList, baseDecisions, headList = entry({}), headDecisions = decision) => (ref, path) =>
  ref === "fixture-base" ? (path === RETIRED ? baseList : baseDecisions) : (path === RETIRED ? headList : headDecisions);
assert.equal(readRetirements("fixture-base", fixtureShow(seed, decision)).size, 0, "HEAD-only listing cannot authorize retirement");
assert.equal(readRetirements("fixture-base", fixtureShow(null, decision)).size, 0, "missing base list ignores a HEAD list");
assert.equal(readRetirements("fixture-base", fixtureShow(entry({}), decision, seed, "")).size, 1, "valid base authorization survives a different HEAD");
assert.throws(() => readRetirements("fixture-base", fixtureShow(entry({}), "")), /decision row.*missing/, "HEAD-only decision cannot authorize retirement");
assert.throws(() => readRetirements("fixture-base", fixtureShow(entry({}), decision.replace(gone, "scripts/other-prove.mjs"))), /decision row.*missing/, "another file's row is not authorization");
assert.throws(() => readRetirements("fixture-base", fixtureShow(entry({}), null)), /decision row.*missing/, "missing decisions fail closed");
assert.ok(listReasons("M", entry({}), true).some((r) => r.includes("decision row") && r.includes("missing")), "even the owner needs an existing base decision");
console.log("ok   self-test: retirement list and exact decision rows come from the base only; HEAD grants no permission");

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 << 20 });
const flag = process.argv.indexOf("--base");
const base = flag > 0 ? process.argv[flag + 1] : git("merge-base", "origin/main", "HEAD").trim();
const changes = git("diff", "--name-status", "-M", base, "HEAD", "--", "scripts", "server")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("\t"));

// The retirement list is read from the base only. Missing (an older base) means empty; malformed means empty, so no deletion passes.
let retired = new Map();
const showOrMissing = (ref, path) => {
  try { return execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return null; }
};
try {
  retired = readRetirements(base, showOrMissing);
} catch (e) {
  console.log(`note: ${RETIRED} on the base is not a valid list (${e.message}), so no proof may be deleted`);
}

let failed = 0;
let compared = 0;
let retiredNow = 0;
for (const [status, from, to = from] of changes) {
  if (!PROOF.test(from) && !PROOF.test(to)) continue;
  if (status !== "A") compared++;
  const reasons = changeReasons([status, from, to], retired, (side, path) => git("show", `${side === "base" ? base : "HEAD"}:${path}`));
  if (status === "D" && !reasons.length) {
    const e = retired.get(from);
    console.log(`retired ${from}: listed in ${RETIRED} on the base (#${e.issue}, ${e.date}): ${JSON.stringify(e.reason)}`);
    retiredNow++;
  }
  for (const r of reasons) console.log(`FAIL ${from === to ? from : `${from} -> ${to}`}: ${r}`);
  if (reasons.length) failed++;
}

// Any change to the list itself is owner-only (but for creating it empty), and the changed list must still parse.
let payload = null;
try {
  payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
} catch {}
const who = `in a PR by ${payload?.pull_request?.user?.login ?? "(no event payload)"} in a run started by ${payload?.sender?.login ?? "(no event payload)"}`;
for (const [status] of git("diff", "--name-status", "--no-renames", base, "HEAD", "--", RETIRED).split("\n").filter(Boolean).map((l) => l.split("\t"))) {
  const reasons = listReasons(status, status === "D" ? null : git("show", `HEAD:${RETIRED}`), byOwner(payload), who, showOrMissing(base, DECISIONS));
  if (!reasons.length) console.log(`${RETIRED}: ${status === "A" && !byOwner(payload) ? "created with no entries, which lets no proof go" : "changed by the repo owner"}`);
  for (const r of reasons) console.log(`FAIL ${RETIRED}: ${r}`);
  if (reasons.length) failed++;
}
if (failed) {
  console.log(`${failed} proof(s) loosened, or owner-only file(s) changed, against ${base.slice(0, 12)}. Restore the checks, or keep them and add new ones (AGENTS.md rule 7).`);
  console.log(`To retire a proof whose feature is gone, the owner first lists it in ${RETIRED} on main; a later PR then deletes it.`);
  process.exit(1);
}
console.log(`loosen-prove: ${compared} changed proof(s) against ${base.slice(0, 12)}, none loosened${retiredNow ? `, ${retiredNow} retired by ${RETIRED}` : ""}`);
