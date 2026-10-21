#!/usr/bin/env node
// Fixture proof for scripts/auto-merge-eligible.mjs (#923), the workflow that runs it, and ci.yml's docs_only list. No network.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as real from "./auto-merge-eligible.mjs";

const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const ACTIONS = { id: 15368, slug: "github-actions" };

const file = (filename, status = "modified", lines = 10) => ({ filename, status, additions: lines, deletions: 0 });
// A clean, eligible docs PR; each case changes one thing.
const T0 = "2026-10-21T18:00:00Z";
function pr(over = {}) {
  const files = over.files ?? [file("docs/research/waves.md"), file("docs/design/new-mock.png", "added", 0)];
  return {
    pr: { number: 1, state: "open", merged: false, draft: false, base: { ref: "main" }, head: { sha: SHA }, changed_files: files.length, ...over.pr },
    headAfter: over.headAfter ?? SHA,
    files,
    checkRuns: over.checkRuns ?? [{ name: "checks", app: ACTIONS, head_sha: SHA, status: "completed", conclusion: "success" }],
    comments: (over.comments ?? [{ author_association: "OWNER", body: `Review clean.\n<!-- review-desk: clean ${SHA} -->` }]).map((c) => ({ created_at: T0, updated_at: T0, ...c })),
    defaultBranch: "main",
  };
}

const EXCLUDED = [
  // Governance files, even inside docs/.
  "AGENTS.md", "CLAUDE.md", "README.md", "docs/DESK.md", "docs/REVIEWING.md", "docs/DECISIONS.md", "docs/LANES.md", "docs/FRAMEWORK.md",
  "docs/design/AGENTS.md", "docs/CLAUDE.md", "docs/framework.md", "Docs/DESK.md",
  // Hard excludes. .github/** beats the .github/ISSUE_TEMPLATE/** allow entry: the exclude list wins.
  ".github/workflows/ci.yml", ".github/workflows/auto-merge.yml", ".github/ISSUE_TEMPLATE/bug.md", ".github/flaky.json",
  "package.json", "package-lock.json", "server/package.json", "server/package-lock.json", "docs/package.json",
  "scripts/auto-merge-eligible.mjs", "server/index.ts", "src/main.tsx", "CODEOWNERS", "docs/CODEOWNERS", ".gitignore", "docs/.gitignore",
  "docs/tool.mjs", "docs/types.ts",
  // Not under docs/ at all.
  "index.html", "vite.config.ts", "LICENSE", "public/audio/x.ogg", "docs", "notes.md",
  // Unsafe paths.
  "docs/../src/main.tsx", "docs//x.md", "docs/./x.md", "/docs/x.md", "docs\\x.md", "docs/x\n.md",
];

const CASES = [
  ["docs and a new image", pr(), true],
  ["an issue template alone: .github/** wins", pr({ files: [file(".github/ISSUE_TEMPLATE/idea.md")] }), false],
  ...EXCLUDED.map((p) => [`excluded alongside a doc: ${JSON.stringify(p)}`, pr({ files: [file("docs/research/waves.md"), file(p)] }), false]),
  ["a removed doc", pr({ files: [file("docs/old.md", "removed")] }), false],
  ["a renamed doc", pr({ files: [{ ...file("docs/new.md", "renamed"), previous_filename: "docs/old.md" }] }), false],
  ["a doc renamed in from src/", pr({ files: [{ ...file("docs/x.ts.md", "renamed"), previous_filename: "src/x.ts" }] }), false],
  ["a copied doc", pr({ files: [file("docs/copy.md", "copied")] }), false],
  ["a mode change", pr({ files: [file("docs/run.md", "changed")] }), false],
  ["399 changed lines", pr({ files: [file("docs/a.md", "modified", 200), { ...file("docs/b.md"), additions: 100, deletions: 99 }] }), true],
  ["400 changed lines", pr({ files: [file("docs/a.md", "modified", 200), { ...file("docs/b.md"), additions: 100, deletions: 100 }] }), false],
  ["a file with no line counts", pr({ files: [{ filename: "docs/a.md", status: "modified" }] }), false],
  ["the files API listed fewer files than the PR has", pr({ pr: { changed_files: 3 } }), false],
  ["no changed files", pr({ files: [], pr: { changed_files: 0 } }), false],
  ["marker for another SHA (spoofed or stale)", pr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${OTHER} -->` }] }), false],
  ["marker with the head SHA from an outsider", pr({ comments: [{ author_association: "NONE", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["marker with the head SHA from a past contributor", pr({ comments: [{ author_association: "CONTRIBUTOR", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["marker with the head SHA from a collaborator", pr({ comments: [{ author_association: "COLLABORATOR", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["marker with the head SHA from a member", pr({ comments: [{ author_association: "MEMBER", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["marker comment edited after posting", pr({ comments: [{ author_association: "OWNER", updated_at: "2026-10-21T18:05:00Z", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["marker comment with no timestamps", pr({ comments: [{ author_association: "OWNER", created_at: undefined, updated_at: undefined, body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["marker with a short SHA", pr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${SHA.slice(0, 7)} -->` }] }), false],
  ["no marker", pr({ comments: [{ author_association: "OWNER", body: "Looks fine." }] }), false],
  ["a stale marker and a fresh one", pr({ comments: [
    { author_association: "OWNER", body: `<!-- review-desk: clean ${OTHER} -->` },
    { author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` },
  ] }), true],
  ["head moved during the check", pr({ headAfter: OTHER }), false],
  ["no head SHA", pr({ pr: { head: {} }, headAfter: undefined }), false],
  ["checks failed", pr({ checkRuns: [{ name: "checks", app: ACTIONS, head_sha: SHA, status: "completed", conclusion: "failure" }] }), false],
  ["checks still running", pr({ checkRuns: [{ name: "checks", app: ACTIONS, head_sha: SHA, status: "in_progress", conclusion: null }] }), false],
  ["no checks run", pr({ checkRuns: [] }), false],
  ["checks green from another app only", pr({ checkRuns: [{ name: "checks", app: { id: 1, slug: "fake" }, head_sha: SHA, status: "completed", conclusion: "success" }] }), false],
  ["checks green on another SHA", pr({ checkRuns: [{ name: "checks", app: ACTIONS, head_sha: OTHER, status: "completed", conclusion: "success" }] }), false],
  ["one checks run green, one red", pr({ checkRuns: [
    { name: "checks", app: ACTIONS, head_sha: SHA, status: "completed", conclusion: "success" },
    { name: "checks", app: ACTIONS, head_sha: SHA, status: "completed", conclusion: "failure" },
  ] }), false],
  ["a draft", pr({ pr: { draft: true } }), false],
  ["a closed PR", pr({ pr: { state: "closed" } }), false],
  ["a merged PR", pr({ pr: { merged: true } }), false],
  ["base is not the default branch", pr({ pr: { base: { ref: "release" } } }), false],
];

function run(mod) {
  return CASES.map(([label, input, want]) => ({ label, want, got: mod.decide(input) }));
}

for (const { label, want, got } of run(real)) {
  assert.equal(got.merge, want, `${label}: ${got.reason}`);
  console.log(`ok   ${label}: ${got.merge ? "merge" : "no merge"}, ${got.reason}`);
}
assert.equal(real.MAX_CHANGED_LINES, 400);
for (const p of EXCLUDED) assert.ok(real.pathRefusal(p), `${JSON.stringify(p)} is refused`);
for (const p of ["docs/x.md", "docs/design/chat-c/README.md", "docs/design/a.html", "docs/research/b.json"]) assert.equal(real.pathRefusal(p), null, p);

// Mutation check: break one rule at a time in a copy of the script. The cases above must catch every break.
const source = readFileSync(new URL("./auto-merge-eligible.mjs", import.meta.url), "utf8");
const MUTANTS = [
  ["excludes ignored", "if (refusal) return no(", "if (false) return no("],
  ["allow list not enforced",'if (!ALLOW.some((p) => path.startsWith(p))) return "outside docs/";', 'if (ALLOW.some((p) => path.startsWith(p))) return null;'],
  ["governance names matched case-sensitively", "lower === p.toLowerCase()", "path === p"],
  ["names matched only at the root", "name === n.toLowerCase()", "lower === n.toLowerCase()"],
  ["renames and deletes allowed", 'const STATUSES = ["added", "modified"];', 'const STATUSES = ["added", "modified", "removed", "renamed"];'],
  ["size limit off by one", "if (lines >= MAX_CHANGED_LINES)", "if (lines > MAX_CHANGED_LINES)"],
  ["marker SHA not compared", "m[1] === sha", "SHA.test(m[1])"],
  ["marker author not checked", ".filter((c) => TRUSTED.includes(c.author_association))", ""],
  ["edited marker accepted", ".filter((c) => c.created_at && c.updated_at === c.created_at)", ""],
  ["head re-read ignored", "if (headAfter !== sha)", "if (false)"],
  ["checks run SHA not compared", "r.head_sha !== sha || ", ""],
  ["checks app not checked", " && r.app?.id === ACTIONS_APP_ID", ""],
  ["truncated files list allowed", "if (files.length !== pr.changed_files)", "if (false)"],
];
const dir = mkdtempSync(join(tmpdir(), "auto-merge-mutants-"));
try {
  for (const [name, from, to] of MUTANTS) {
    assert.ok(source.includes(from), `mutant "${name}" applies to the script`);
    const path = join(dir, `${name.replace(/\W+/g, "-")}.mjs`);
    writeFileSync(path, source.replace(from, to));
    const caught = run(await import(pathToFileURL(path).href)).filter(({ want, got }) => got.merge !== want);
    assert.ok(caught.length, `mutant "${name}" survived every case`);
    console.log(`ok   mutant caught: ${name} (${caught.length} cases, e.g. ${caught[0].label})`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// The workflow never runs PR code, sits behind the kill switch, and pins the merge to the checked SHA.
const workflow = readFileSync(new URL("../.github/workflows/auto-merge.yml", import.meta.url), "utf8");
assert.match(workflow, /^ {2}pull_request_target:$/m);
assert.match(workflow, /workflows: \[CI\]/);
assert.match(workflow, /vars\.AUTO_MERGE == 'on' &&/, "kill switch gates the job");
assert.equal((workflow.match(/uses: actions\/checkout/g) || []).length, 1, "one checkout");
assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /sparse-checkout: \|\n\s+scripts\/auto-merge-eligible\.mjs\n\s+sparse-checkout-cone-mode: false/);
assert.equal(/head_(branch|repository|ref)|pull_request\.head|refs\/pull|merge_commit_sha/.test(workflow), false, "no PR head ref anywhere");
assert.equal(/\$\{\{[^}]*(comment\.body|pull_request\.title|pull_request\.body|head\.label)[^}]*\}\}/.test(workflow.replace(/contains\(github\.event\.comment\.body, '[^']*'\)/g, "")), false, "no PR text in an expression");
assert.match(workflow, /gh pr merge "\$NUM" --repo "\$REPO" --squash --match-head-commit "\$SHA"/);
assert.match(workflow, /if: steps\.decide\.outputs\.merge == 'true'/);
const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
assert.match(ci, /^name: CI$/m, "auto-merge listens for the workflow named CI");
assert.match(ci, /^ {2}checks:$/m, "the required job is still called checks");

// ci.yml's docs_only: run its own case statement. Agent instructions are not docs, so CI runs in full for them.
const caseBlock = ci.match(/^( *)case "\$file" in\n[\s\S]*?^\1esac$/m);
assert.ok(caseBlock, "ci.yml has the docs_only case statement");
const docsOnly = (f) =>
  execFileSync("bash", ["-c", `file="$1"; DOCS_ONLY=true; for _ in 1; do\n${caseBlock[0]}\ndone; echo "$DOCS_ONLY"`, "_", f], { encoding: "utf8" }).trim() === "true";
for (const f of ["AGENTS.md", "CLAUDE.md", "README.md", "src/main.tsx", "package.json"]) assert.equal(docsOnly(f), false, `${f} runs full CI`);
for (const f of ["docs/x.md", "LICENSE", ".github/ISSUE_TEMPLATE/bug.md", "notes.md"]) assert.equal(docsOnly(f), true, `${f} is docs-only in CI`);
console.log("ok   ci.yml docs_only: AGENTS.md, CLAUDE.md and README.md run full CI");

console.log(`auto-merge-prove: ok (${CASES.length} cases, ${MUTANTS.length} mutants caught)`);
