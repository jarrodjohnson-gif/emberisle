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
function pr(over = {}) {
  const files = over.files ?? [file("docs/research/waves.md"), file("docs/design/new-mock.png", "added", 0)];
  return {
    pr: { number: 1, state: "open", merged: false, draft: false, base: { ref: "main" }, head: { sha: SHA }, changed_files: files.length, ...over.pr },
    headAfter: over.headAfter ?? SHA,
    files,
    checkRuns: over.checkRuns ?? [{ name: "checks", app: ACTIONS, head_sha: SHA, status: "completed", conclusion: "success" }],
    comments: over.comments ?? [{ author_association: "OWNER", body: `Review clean.\n<!-- review-desk: clean ${SHA} -->` }],
    defaultBranch: "main",
  };
}

const EXCLUDED = [
  // Governance files, even inside docs/.
  "AGENTS.md", "CLAUDE.md", "README.md", "docs/DESK.md", "docs/REVIEWING.md", "docs/DECISIONS.md", "docs/LANES.md", "docs/FRAMEWORK.md",
  "docs/design/AGENTS.md", "docs/CLAUDE.md", "docs/framework.md", "Docs/DESK.md", "docs/HELPERS.md", "docs/ORCHESTRATOR.md", "docs/LOOPING.md", "docs/builder-kit/builder-agent.md", "docs/builder-kit/launch.sh", "docs/GEMINI.md", "docs/.mcp.json",
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
  ["marker with a short SHA", pr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${SHA.slice(0, 7)} -->` }] }), false],
  ["no marker", pr({ comments: [{ author_association: "OWNER", body: "Looks fine." }] }), false],
  ["a stale marker and a fresh one", pr({ comments: [
    { author_association: "OWNER", body: `<!-- review-desk: clean ${OTHER} -->` },
    { author_association: "COLLABORATOR", body: `<!-- review-desk: clean ${SHA} -->` },
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

// Phase 2 (AUTO_MERGE_CODE on): a reviewed code PR. Each case changes one thing.
const footer = (reviewer = "Opus 5.5", builder = "Sonnet 5.5", sha = SHA, clean = true) =>
  `<!-- review-desk -->\n${clean ? `Clean.\n<!-- review-desk: clean ${sha} -->` : "Blocking: src/main.tsx:3"}\nReviewer: ${reviewer} · Builder: ${builder} · Head: ${sha}`;
function codePr(over = {}) {
  const base = pr({ files: [file("src/main.tsx", "modified", 900), file("scripts/new-prove.mjs", "added"), file("package.json"), file(".github/workflows/ci.yml"), file("src/old.ts", "removed")],
    comments: [{ author_association: "OWNER", body: footer() }], ...over });
  return { ...base, code: over.code ?? true };
}
const CODE_EXCLUDED = ["AGENTS.md", "docs/DESK.md", "docs/DECISIONS.md", "src/CLAUDE.md", ".github/workflows/auto-merge.yml", ".github/workflows/CI.yml/x", ".github/workflows/CI.yml", ".github/workflows/Ci.yml", ".github/workflows/ci.yml2", ".github/flaky.json", "GEMINI.md", ".mcp.json", "docs/HELPERS.md",
  ".claude/settings.json", "scripts/auto-merge-eligible.mjs", "scripts/desk-gate.mjs", "scripts/desk-board-prove.mjs", "scripts/pr-signal.mjs", "src/../AGENTS.md"];
CASES.push(
  ["code: a reviewed code PR", codePr(), true],
  ["code: the same PR with the switch off", codePr({ code: false }), false],
  ["code: a docs PR over the docs size limit", codePr({ files: [file("docs/big.md", "modified", 900)] }), true],
  ["code: a small docs PR still merges on the marker alone", { ...pr(), code: true }, true],
  ...CODE_EXCLUDED.map((p) => [`code: excluded alongside code: ${JSON.stringify(p)}`, codePr({ files: [file("src/main.tsx"), file(p)] }), false]),
  ["code: a governance file renamed away", codePr({ files: [{ ...file("src/notes.ts", "renamed"), previous_filename: "AGENTS.md" }] }), false],
  ["code: marker only, no footer", codePr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["code: reviewer is the builder's model", codePr({ comments: [{ author_association: "OWNER", body: footer("sonnet 5.5", "Sonnet 5.5") }] }), false],
  ["code: footer for another head", codePr({ comments: [{ author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", OTHER) }] }), false],
  ["code: a bare marker for the head, and a full review of another head", codePr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }, { author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", OTHER) }] }), false],
  ["code: a bare marker from the owner, and a full review from an outsider", codePr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }, { author_association: "NONE", body: footer() }] }), false],
  ["code: reviewer is the builder's model, spelled another way", codePr({ comments: [{ author_association: "OWNER", body: footer("Claude Opus 5.5", "opus-5.5") }] }), false],
  ["code: a newer review with a broken footer after a clean one", codePr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: `<!-- review-desk -->\nBlocking: src/main.tsx:3\nReviewer: Opus 5.5 Builder: Sonnet 5.5 Head: ${SHA}` }] }), false],
  ["code: reviewer name is empty once normalised", codePr({ comments: [{ author_association: "OWNER", body: footer("Claude", "Sonnet 5.5") }] }), false],
  ["code: builder name is only punctuation", codePr({ comments: [{ author_association: "OWNER", body: footer("Opus 5.5", "?") }] }), false],
  ["code: a clean review that asks for the owner's look, before the label lands", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }] }), false],
  ["code: the same review, with owner-ok", codePr({ pr: { labels: [{ name: "owner-ok" }] }, comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }] }), true],
  ["docs: a clean marker in a review that waits for the owner", pr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk -->\nVisual sign-off pending.\n<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["code: an outsider's comment asking for the owner changes nothing", codePr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "NONE", body: "<!-- review-desk -->\nJarrod must see this first." }] }), true],
  ["code: an older review asked for the owner, the newest review does not", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }, { author_association: "OWNER", body: footer() }] }), true],
  ["code: a bare marker after a review that asked for the owner", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }, { author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["code: a review that says no owner approval is needed", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nNo owner approval needed.\nJarrod's sign-off is on the issue already.") }] }), true],
  ["code: a review that names the label in a code span", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nChecked: `needs-owner` is absent, as it should be.") }] }), true],
  ["code: an ask hidden in an HTML comment", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\n<!-- waiting on Jarrod -->") }] }), true],
  ["code: a review that is waiting on Jarrod", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nThis is waiting on Jarrod for the sound.") }] }), false],
  ["code: a newer review with findings", codePr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", SHA, false) }] }), false],
  ["code: footer from an outsider", codePr({ comments: [{ author_association: "NONE", body: footer() }] }), false],
  ["code: checks failed", codePr({ checkRuns: [{ name: "checks", app: ACTIONS, head_sha: SHA, status: "completed", conclusion: "failure" }] }), false],
  ["code: needs-owner", codePr({ pr: { labels: [{ name: "needs-owner" }] } }), false],
  ["code: needs-owner and owner-ok", codePr({ pr: { labels: [{ name: "needs-owner" }, { name: "owner-ok" }] } }), true],
  ["docs: needs-owner", pr({ pr: { labels: [{ name: "needs-owner" }] } }), false],
);

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
  ["head re-read ignored", "if (headAfter !== sha)", "if (false)"],
  ["checks run SHA not compared", "r.head_sha !== sha || ", ""],
  ["checks app not checked", " && r.app?.id === ACTIONS_APP_ID", ""],
  ["truncated files list allowed", "if (files.length !== pr.changed_files)", "if (false)"],
  ["code switch ignored", "const asCode = code === true && !docsOnly;", "const asCode = !docsOnly;"],
  ["code excludes ignored", "if (why) return no(", "if (false) return no("],
  ["ci.yml exception widened", "!CODE_ALLOW_EXACT.includes(path)", "!CODE_ALLOW_EXACT.includes(lower)"],
  ["footer not required", 'if (!footer) return no("no complete review footer");', "if (!footer) return { merge: true, sha };"],
  ["footer head not compared", "if (footer.head !== sha)", "if (false)"],
  ["findings merge", "if (!footer.clean)", "if (false)"],
  ["model names compared raw", "return { reviewer: model(m[1]), builder: model(m[2]), head,", "return { reviewer: m[1].trim().toLowerCase(), builder: m[2].trim().toLowerCase(), head,"],
  ["an older review stands in for a broken newer one", "if (!m) return null;", "if (!m) continue;"],
  ["empty model names allowed", "if (!footer.reviewer || !footer.builder)", "if (false)"],
  ["a review asking for the owner ignored", "if (ownerAsked(comments) && !labels.includes(\"owner-ok\"))", "if (false)"],
  ["owner-ok not needed after a review asks", "ownerAsked(comments) && !labels.includes(\"owner-ok\")", "ownerAsked(comments) && false"],
  ["an outsider can hold a PR", "find((c) => TRUSTED.includes(c.author_association) && ", "find((c) => "],
  ["any review that ever asked holds the PR", "].reverse().find((c) => TRUSTED.includes(c.author_association) && String(c.body ?? \"\").includes(\"<!-- review-desk -->\"));", "].reverse().filter((c) => TRUSTED.includes(c.author_association) && String(c.body ?? \"\").includes(\"<!-- review-desk -->\")).find((c) => OWNER_ASK.test(c.body));"],
  ["a bare marker counts as the newest review", "String(c.body ?? \"\").includes(\"<!-- review-desk -->\"));\n  if (!newest) return false;", "/<!--\\s*review-desk/.test(String(c.body ?? \"\")));\n  if (!newest) return false;"],
  ["hidden comments read as an ask", 'String(newest.body).replace(/<!--[\\s\\S]*?-->/g, "").replace(', 'String(newest.body).replace('],
  ["lines that decline an ask still hold", "!/\\b(?:no|not|none|without|already)\\b/i.test(line) && ", ""],
  ["the waiting-on wording dropped", "|(?:waiting|pending|needs?)[^\\n.]{0,60}(?:Jarrod|owner)", ""],
  ["same-model review allowed", "if (footer.reviewer === footer.builder)", "if (false)"],
  ["footer author not checked", "!TRUSTED.includes(c.author_association) || ", ""],
  ["needs-owner ignored", 'labels.includes("needs-owner") && !labels.includes("owner-ok")', "false"],
  ["owner-ok not needed", ' && !labels.includes("owner-ok")', " && false"],
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
assert.match(workflow, /if gh pr merge "\$NUM" --repo "\$REPO" --squash --match-head-commit "\$SHA"; then\n.*labels\[\]=auto-merged'\n\s+else\n.*labels\[\]=merge-by-chat'/, "a refused merge is handed to the dispatcher, never retried another way");
assert.equal((workflow.match(/secrets\./g) || []).length, 1, "the only secret is the optional merge token");
assert.equal((workflow.match(/gh pr merge/g) || []).length, 1, "one merge command, pinned to the checked SHA");
assert.ok(workflow.includes("AUTO_MERGE_CODE: ${{ vars.AUTO_MERGE_CODE != 'off' && 'on' || 'off' }}"), "the code phase has its own off switch");
for (const p of CODE_EXCLUDED) assert.ok(real.codeRefusal(p), `${JSON.stringify(p)} is refused in a code PR`);
for (const p of ["src/main.tsx", "package.json", ".github/workflows/ci.yml", "scripts/size-prove.mjs", "docs/x.md"]) assert.equal(real.codeRefusal(p), null, p);
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
