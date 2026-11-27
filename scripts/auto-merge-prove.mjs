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
// A registration file whose patch only adds a line, as the PR files API returns it.
const reg = (filename) => ({ ...file(filename, "modified", 1), patch: "@@ -140,2 +140,3 @@\n   \"a\": \"x\",\n+  \"b\": \"y\",\n   \"c\": \"z\"" });
const checkRun = (name, over = {}) => ({ name, app: ACTIONS, head_sha: SHA, status: "completed", conclusion: "success", ...over });
// The clerk's comment carrying his answer, with one marker or several.
const answer = (kind, ...shas) => `Owner answer (Desk page, 2026-11-22T10:00:00Z): A: merge it\n${shas.map((h) => `<!-- ${kind}: ${h} -->`).join("\n")}`;
// A clean, eligible docs PR; each case changes one thing.
function pr(over = {}) {
  const files = over.files ?? [file("docs/research/waves.md"), file("docs/design/new-mock.png", "added", 0)];
  return {
    pr: { number: 1, state: "open", merged: false, draft: false, mergeable: true, base: { ref: "main" }, head: { sha: SHA }, changed_files: files.length, ...over.pr },
    headAfter: over.headAfter ?? SHA,
    files,
    checkRuns: over.checkRuns ?? [checkRun("checks"), checkRun("loosen")],
    comments: over.comments ?? [{ author_association: "OWNER", body: `Review clean.\n<!-- review-desk: clean ${SHA} -->` }],
    defaultBranch: "main",
  };
}

const EXCLUDED = [
  // Governance files, even inside docs/.
  "AGENTS.md", "CLAUDE.md", "README.md", "docs/DESK.md", "docs/REVIEWING.md", "docs/DECISIONS.md", "docs/LANES.md", "docs/FRAMEWORK.md",
  "docs/design/AGENTS.md", "docs/CLAUDE.md", "docs/framework.md", "Docs/DESK.md", "docs/HELPERS.md", "docs/ORCHESTRATOR.md", "docs/LOOPING.md", "docs/builder-kit/builder-agent.md", "docs/builder-kit/launch.sh", "docs/GEMINI.md", "docs/.mcp.json",
  "docs/OWNER.md", "docs/DECISIONS-archive.md", "docs/flow/builder.md", "docs/flow/dispatcher.md", "docs/Flow/clerk.md", "docs/flow/new/deep.md",
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
  ["a skipped checks run beside a green one", pr({ checkRuns: [checkRun("checks", { conclusion: "skipped" }), checkRun("checks"), checkRun("loosen")] }), true],
  ["only a skipped checks run", pr({ checkRuns: [checkRun("checks", { conclusion: "skipped" }), checkRun("loosen")] }), false],
  ["a skipped checks run beside a red one", pr({ checkRuns: [checkRun("checks", { conclusion: "skipped" }), checkRun("checks", { conclusion: "failure" }), checkRun("loosen")] }), false],
  ["a skipped loosen run beside a green one", pr({ checkRuns: [checkRun("checks"), checkRun("loosen", { conclusion: "skipped" }), checkRun("loosen")] }), true],
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
  // #1860 item 1: GitHub must say the PR merges cleanly. null means it has not worked it out yet.
  ["a conflicted PR", pr({ pr: { mergeable: false } }), false],
  ["mergeable not known yet", pr({ pr: { mergeable: null } }), false],
  ["no mergeable field", pr({ pr: { mergeable: undefined } }), false],
  // #1860 item 2: a docs PR reads only the newest review.
  ["docs: a clean marker, then a newer review with findings", pr({ comments: [
    { author_association: "OWNER", body: `<!-- review-desk -->\nClean.\n<!-- review-desk: clean ${SHA} -->` },
    { author_association: "OWNER", body: "<!-- review-desk -->\nBlocking: docs/research/waves.md:3 says the wrong size." },
  ] }), false],
  ["docs: findings, then a newer clean review", pr({ comments: [
    { author_association: "OWNER", body: "<!-- review-desk -->\nBlocking: docs/research/waves.md:3 says the wrong size." },
    { author_association: "OWNER", body: `<!-- review-desk -->\nClean.\n<!-- review-desk: clean ${SHA} -->` },
  ] }), true],
  ["docs: an outsider's findings after a clean review change nothing", pr({ comments: [
    { author_association: "OWNER", body: `<!-- review-desk -->\nClean.\n<!-- review-desk: clean ${SHA} -->` },
    { author_association: "NONE", body: "<!-- review-desk -->\nBlocking: everything." },
  ] }), true],
  ["docs: a later comment that is not a review changes nothing", pr({ comments: [
    { author_association: "OWNER", body: `<!-- review-desk -->\nClean.\n<!-- review-desk: clean ${SHA} -->` },
    { author_association: "OWNER", body: "Thanks, looks good." },
  ] }), true],
  // #1860 item 3: `loosen` must be green at the head too.
  ["no loosen run", pr({ checkRuns: [checkRun("checks")] }), false],
  ["loosen red", pr({ checkRuns: [checkRun("checks"), checkRun("loosen", { conclusion: "failure" })] }), false],
  ["loosen still running", pr({ checkRuns: [checkRun("checks"), checkRun("loosen", { status: "in_progress", conclusion: null })] }), false],
  ["loosen green on another SHA", pr({ checkRuns: [checkRun("checks"), checkRun("loosen", { head_sha: OTHER })] }), false],
  ["loosen green from another app", pr({ checkRuns: [checkRun("checks"), checkRun("loosen", { app: { id: 1, slug: "fake" } })] }), false],
  ["loosen green, but no checks run", pr({ checkRuns: [checkRun("loosen")] }), false],
];

// Phase 2 (AUTO_MERGE_CODE on): a reviewed code PR. Each case changes one thing.
const footer = (reviewer = "Opus 5.5", builder = "Sonnet 5.5", sha = SHA, clean = true) =>
  `<!-- review-desk -->\n${clean ? `Clean.\n<!-- review-desk: clean ${sha} -->` : "Blocking: src/main.tsx:3"}\nReviewer: ${reviewer} · Builder: ${builder} · Head: ${sha}`;
function codePr(over = {}) {
  const base = pr({ files: [file("src/main.tsx", "modified", 900), file("scripts/new-prove.mjs", "added"), reg("package.json"), reg(".github/workflows/ci.yml"), file("src/old.ts", "removed")],
    comments: [{ author_association: "OWNER", body: footer() }], ...over });
  return { ...base, code: over.code ?? true };
}
// A reviewed rule-file PR with the owner's yes for this head: the label and the clerk's marker comment.
const ownerPr = (over = {}) => codePr({ files: [file("docs/DESK.md")], comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-merge", SHA) }], ...over, pr: { labels: [{ name: "owner-merge" }], ...over.pr } });
// A ci.yml or package.json change that is not only added lines. Each needs `owner-merge`.
const REG_CHANGES = [
  ["ci.yml with a removed line", { ...reg(".github/workflows/ci.yml"), deletions: 1, patch: "@@ -410,3 +410,2 @@\n       - run: npm run a-prove\n-      - run: npm run b-prove\n       - run: npm run c-prove" }],
  ["ci.yml with a changed line", { ...reg(".github/workflows/ci.yml"), additions: 1, deletions: 1, patch: "@@ -410,1 +410,1 @@\n-      - run: npm run b-prove\n+      - run: npm run b-prove || true" }],
  ["package.json with a changed script", { ...reg("package.json"), additions: 1, deletions: 1, patch: "@@ -143,1 +143,1 @@\n-    \"auto-merge-prove\": \"node scripts/auto-merge-prove.mjs\",\n+    \"auto-merge-prove\": \"true\"," }],
  ["ci.yml whose patch removes a line under a zero deletion count", { ...reg(".github/workflows/ci.yml"), patch: "@@ -410,2 +410,2 @@\n-      - run: npm run b-prove\n+      - run: npm run c-prove" }],
  ["ci.yml with no patch from the API", { ...reg(".github/workflows/ci.yml"), patch: undefined }],
  ["ci.yml with a deletion count and no removed line in the patch", { ...reg(".github/workflows/ci.yml"), deletions: 1 }],
  ["package.json renamed away", { ...reg("tools/package.json"), status: "renamed", previous_filename: "package.json" }],
];
const CODE_EXCLUDED = ["AGENTS.md", "docs/DESK.md", "docs/DECISIONS.md", "docs/OWNER.md", "docs/DECISIONS-archive.md", "docs/flow/builder.md", "docs/FLOW/merging.md", "src/CLAUDE.md", ".github/workflows/auto-merge.yml", ".github/workflows/CI.yml/x", ".github/workflows/CI.yml", ".github/workflows/Ci.yml", ".github/workflows/ci.yml2", ".github/flaky.json", "GEMINI.md", ".mcp.json", "docs/HELPERS.md",
  ".claude/settings.json", "scripts/auto-merge-eligible.mjs", "scripts/desk-gate.mjs", "scripts/desk-board-prove.mjs", "scripts/pr-signal.mjs", "src/../AGENTS.md",
  // #1860 item 4: the proof guards and the size ceilings.
  "scripts/loosen-prove.mjs", "scripts/registered-prove.mjs", "scripts/size-prove.mjs", "scripts/Size-Prove.mjs"];
CASES.push(
  ["code: a reviewed code PR", codePr(), true],
  ["code: the same PR with the switch off", codePr({ code: false }), false],
  ["code: a docs PR over the docs size limit", codePr({ files: [file("docs/big.md", "modified", 900)] }), true],
  ["code: a small docs PR still merges on the marker alone", { ...pr(), code: true }, true],
  ...CODE_EXCLUDED.map((p) => [`code: excluded alongside code: ${JSON.stringify(p)}`, codePr({ files: [file("src/main.tsx"), file(p)] }), false]),
  ...CODE_EXCLUDED.filter((p) => !p.includes("..")).map((p) => [`code: owner-merge lifts the governance refusal: ${JSON.stringify(p)}`, ownerPr({ files: [file("src/main.tsx"), file(p)] }), true]),
  ["code: owner-merge never lifts an unsafe path", ownerPr({ files: [file("src/main.tsx"), file("src/../AGENTS.md")] }), false],
  ["code: owner-merge label with no marker comment", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }] }), false],
  ["code: owner-merge marker for another head", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-merge", OTHER) }] }), false],
  ["code: an older yes for this head, then a newer yes for another head", ownerPr({ comments: [{ author_association: "OWNER", body: answer("owner-merge", SHA) }, { author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-merge", OTHER) }] }), false],
  ["code: owner-merge marker from an outsider", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "NONE", body: answer("owner-merge", SHA) }] }), false],
  ["code: owner-merge marker without the label", ownerPr({ pr: { labels: [] } }), false],
  ["code: owner-merge on a rule PR with no review", ownerPr({ comments: [{ author_association: "OWNER", body: answer("owner-merge", SHA) }] }), false],
  ["code: owner-merge on a rule PR reviewed at another head", ownerPr({ comments: [{ author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", OTHER) }, { author_association: "OWNER", body: answer("owner-merge", SHA) }] }), false],
  ["code: owner-merge with the code switch off", ownerPr({ code: false }), false],
  ["code: owner-ok does not lift the governance refusal", ownerPr({ pr: { labels: [{ name: "owner-ok" }] }, comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-ok", SHA) }] }), false],
  // #1860 item 5: the marker counts only in the clerk's `Owner answer (Desk page` comment.
  ["code: a review that quotes the owner-merge marker for the head, with the label on", ownerPr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", `Clean.\nThe clerk writes \`<!-- owner-merge: ${SHA} -->\` when he says yes.`) }] }), false],
  ["code: a bare owner-merge marker for the head, with the label on", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: `<!-- owner-merge: ${SHA} -->` }] }), false],
  ["code: the marker in a comment that only mentions an owner answer", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: `Owner answer pending.\n<!-- owner-merge: ${SHA} -->` }] }), false],
  ["code: the marker in a comment that starts later with the owner answer", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: `Note. ${answer("owner-merge", SHA)}` }] }), false],
  ["code: two markers in one comment, the last for the head", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-merge", OTHER, SHA) }] }), true],
  ["code: two markers in one comment, the last for another head", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-merge", SHA, OTHER) }] }), false],
  ["code: an upper-case owner-merge marker for the head", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-merge", SHA.toUpperCase()) }] }), true],
  ["code: a newer owner answer without a marker leaves the older yes standing", ownerPr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-merge", SHA) }, { author_association: "OWNER", body: "Owner answer (Desk page, 2026-11-22T11:00:00Z): D: something else" }] }), true],
  // #1860 item 4: ci.yml and package.json take added lines only, unless the owner says yes.
  ...REG_CHANGES.map(([label, f]) => [`code: ${label}`, codePr({ files: [file("src/main.tsx"), f] }), false]),
  ...REG_CHANGES.filter(([label]) => !label.includes("renamed")).map(([label, f]) => [`code: owner-merge lifts ${label}`, ownerPr({ files: [file("src/main.tsx"), f] }), true]),
  ["code: ci.yml and package.json with added lines only", codePr({ files: [file("src/main.tsx"), reg(".github/workflows/ci.yml"), reg("package.json")] }), true],
  ["code: a package.json in another folder may change lines", codePr({ files: [file("src/main.tsx"), { ...reg("server/package.json"), deletions: 1, patch: "@@ -1,1 +1,1 @@\n-a\n+b" }] }), true],
  ["code: a governance file renamed away", codePr({ files: [{ ...file("src/notes.ts", "renamed"), previous_filename: "AGENTS.md" }] }), false],
  ["code: marker only, no footer", codePr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["code: reviewer is the builder's model", codePr({ comments: [{ author_association: "OWNER", body: footer("sonnet 5.5", "Sonnet 5.5") }] }), false],
  ["code: footer for another head", codePr({ comments: [{ author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", OTHER) }] }), false],
  ["code: a bare marker for the head, and a full review of another head", codePr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }, { author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", OTHER) }] }), false],
  ["code: a full review of another head, then a bare marker for the head", codePr({ comments: [{ author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", OTHER) }, { author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["code: a review with findings at the head, then a bare marker for the head", codePr({ comments: [{ author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", SHA, false) }, { author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["code: a complete clean review, then a newer clean one with a broken footer", codePr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: `<!-- review-desk -->\nClean.\n<!-- review-desk: clean ${SHA} -->\nReviewer: Opus 5.5 Builder: Sonnet 5.5 Head: ${SHA}` }] }), false],
  ["code: a bare marker from the owner, and a full review from an outsider", codePr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }, { author_association: "NONE", body: footer() }] }), false],
  ["code: reviewer is the builder's model, spelled another way", codePr({ comments: [{ author_association: "OWNER", body: footer("Claude Opus 5.5", "opus-5.5") }] }), false],
  ["code: a newer review with a broken footer after a clean one", codePr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: `<!-- review-desk -->\nBlocking: src/main.tsx:3\nReviewer: Opus 5.5 Builder: Sonnet 5.5 Head: ${SHA}` }] }), false],
  ["code: reviewer name is empty once normalised", codePr({ comments: [{ author_association: "OWNER", body: footer("Claude", "Sonnet 5.5") }] }), false],
  ["code: builder name is only punctuation", codePr({ comments: [{ author_association: "OWNER", body: footer("Opus 5.5", "?") }] }), false],
  ["code: a clean review that asks for the owner's look, before the label lands", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }] }), false],
  ["code: the same review, with owner-ok", codePr({ pr: { labels: [{ name: "owner-ok" }] }, comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }, { author_association: "OWNER", body: answer("owner-ok", SHA) }] }), true],
  // #1860 item 6: `owner-ok` counts only with the clerk's marker for this head.
  ["code: the same review, with owner-ok and no marker", codePr({ pr: { labels: [{ name: "owner-ok" }] }, comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }] }), false],
  ["code: the same review, with owner-ok for an older head", codePr({ pr: { labels: [{ name: "owner-ok" }] }, comments: [{ author_association: "OWNER", body: answer("owner-ok", OTHER) }, { author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }] }), false],
  ["code: owner-ok with an owner-merge marker only", codePr({ pr: { labels: [{ name: "owner-ok" }, { name: "needs-owner" }] }, comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-merge", SHA) }] }), false],
  ["docs: a clean marker in a review that waits for the owner", pr({ comments: [{ author_association: "OWNER", body: `<!-- review-desk -->\nVisual sign-off pending.\n<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["code: an outsider's comment asking for the owner changes nothing", codePr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "NONE", body: "<!-- review-desk -->\nJarrod must see this first." }] }), true],
  ["code: an older review asked for the owner, the newest review does not", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }, { author_association: "OWNER", body: footer() }] }), true],
  ["code: a bare marker after a review that asked for the owner", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nJarrod must see the pictures first.") }, { author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }] }), false],
  ["code: a review that says no owner approval is needed", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nNo owner approval needed.\nJarrod's sign-off is on the issue already.") }] }), true],
  ["code: a review that names the label in a code span", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nChecked: `needs-owner` is absent, as it should be.") }] }), true],
  ["code: an ask hidden in an HTML comment", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\n<!-- waiting on Jarrod -->") }] }), true],
  ...["Not merged yet: waiting on Jarrod.", "Waiting on Jarrod for the look, not the code.", "Needs Jarrod's sign-off on the new sound, which is not in the issue.", "Visual approval pending from Jarrod (no code findings)."]
    .map((line) => [`code: an ask on a line with a no or not: ${line}`, codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", `Clean.\n${line}`) }] }), false]),
  ["code: a review that is waiting on Jarrod", codePr({ comments: [{ author_association: "OWNER", body: footer().replace("Clean.", "Clean.\nThis is waiting on Jarrod for the sound.") }] }), false],
  ["code: a newer review with findings", codePr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", SHA, false) }] }), false],
  ["code: footer from an outsider", codePr({ comments: [{ author_association: "NONE", body: footer() }] }), false],
  ["code: checks failed", codePr({ checkRuns: [{ name: "checks", app: ACTIONS, head_sha: SHA, status: "completed", conclusion: "failure" }] }), false],
  ["code: needs-owner", codePr({ pr: { labels: [{ name: "needs-owner" }] } }), false],
  ["code: needs-owner and owner-ok", codePr({ pr: { labels: [{ name: "needs-owner" }, { name: "owner-ok" }] }, comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: answer("owner-ok", SHA) }] }), true],
  ["code: needs-owner and owner-ok, marker from an outsider", codePr({ pr: { labels: [{ name: "needs-owner" }, { name: "owner-ok" }] }, comments: [{ author_association: "OWNER", body: footer() }, { author_association: "NONE", body: answer("owner-ok", SHA) }] }), false],
  ["code: needs-owner and owner-ok, marker quoted in a review", codePr({ pr: { labels: [{ name: "needs-owner" }, { name: "owner-ok" }] }, comments: [{ author_association: "OWNER", body: footer().replace("Clean.", `Clean.\n<!-- owner-ok: ${SHA} -->`) }] }), false],
  ["code: a conflicted PR", codePr({ pr: { mergeable: false } }), false],
  ["code: loosen red", codePr({ checkRuns: [checkRun("checks"), checkRun("loosen", { conclusion: "failure" })] }), false],
  ["code: owner-merge does not lift a red loosen", ownerPr({ checkRuns: [checkRun("checks"), checkRun("loosen", { conclusion: "failure" })] }), false],
  ["code: a clean review, then a newer review with findings", codePr({ comments: [{ author_association: "OWNER", body: footer() }, { author_association: "OWNER", body: footer("Opus 5.5", "Sonnet 5.5", SHA, false) }] }), false],
  ["docs: needs-owner", pr({ pr: { labels: [{ name: "needs-owner" }] } }), false],
  ["docs: needs-owner and owner-ok for this head", pr({ pr: { labels: [{ name: "needs-owner" }, { name: "owner-ok" }] }, comments: [{ author_association: "OWNER", body: `<!-- review-desk: clean ${SHA} -->` }, { author_association: "OWNER", body: answer("owner-ok", SHA) }] }), true],
  ["docs: needs-owner and owner-ok with no marker", pr({ pr: { labels: [{ name: "needs-owner" }, { name: "owner-ok" }] } }), false],
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
  ["a skipped run blocks the PR", ' && r.conclusion !== "skipped");', ");"],
  ["a skipped run alone counts as green", 'r.app?.id === ACTIONS_APP_ID && r.conclusion !== "skipped");\n    if (!runs.length)', 'r.app?.id === ACTIONS_APP_ID && r.conclusion !== "skipped");\n    if (false)'],
  ["owner-merge ignored", "if (why && !(ownerMerge && LIFTABLE.test(why))) return no(", "if (why) return no("],
  ["owner-merge lifts unsafe paths too", "!(ownerMerge && LIFTABLE.test(why))", "!ownerMerge"],
  ["owner-merge marker head not compared", "ownerMergeHead(comments) === sha", "ownerMergeHead(comments) !== null"],
  ["owner-merge marker not needed", 'labels.includes("owner-merge") && ownerMergeHead(comments) === sha', 'labels.includes("owner-merge")'],
  ["owner-merge label not needed", 'labels.includes("owner-merge") && ownerMergeHead(comments) === sha', "ownerMergeHead(comments) === sha"],
  ["owner-merge marker from anyone", "if (!TRUSTED.includes(c.author_association)) continue;\n    const found", "const found"],
  ["an older yes stands in for the newest", "(comments ?? []).toReversed()", "(comments ?? [])"],
  ["owner-ok lifts the governance refusal", 'labels.includes("owner-merge")', 'labels.includes("owner-ok")'],
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
  ["code excludes ignored", "if (why && !(ownerMerge && LIFTABLE.test(why))) return no(", "if (false) return no("],
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
  ["lines that decline an ask still hold", "!DECLINES.test(line) && ", ""],
  ["any no or not on a line drops the ask", "const DECLINES = /\\b(?:no|not)\\b[^\\n.]{0,40}\\b(?:needed|required|necessary)\\b|\\balready\\b/i;", "const DECLINES = /\\b(?:no|not|none|without|already)\\b/i;"],
  ["the waiting-on wording dropped", "|(?:waiting|pending|needs?)[^\\n.]{0,60}(?:Jarrod|owner)", ""],
  ["same-model review allowed", "if (footer.reviewer === footer.builder)", "if (false)"],
  ["footer author not checked", "!TRUSTED.includes(c.author_association) || ", ""],
  ["needs-owner ignored", 'labels.includes("needs-owner") && !labels.includes("owner-ok")', "false"],
  ["owner-ok not needed", ' && !labels.includes("owner-ok")', " && false"],
  // #1860, one or more for each item.
  ["1: a conflicted PR merges", "if (pr.mergeable !== true)", "if (pr.mergeable === false)"],
  ["2: an older docs review stands in for the newest", ".findLast((c) => REVIEW.test(", ".find((c) => REVIEW.test("],
  ["2: a findings review is not read as a review", "const REVIEW = /<!--\\s*review-desk(?:\\s*-->|:\\s*clean\\b)/;", "const REVIEW = /<!--\\s*review-desk:\\s*clean\\b/;"],
  ["2: any clean marker for the head counts, as before", "const marked = [...String(latest?.body ?? \"\").matchAll(MARKER)]", "const marked = (comments ?? []).filter((c) => TRUSTED.includes(c.author_association)).flatMap((c) => [...String(c.body ?? \"\").matchAll(MARKER)])"],
  ["3: loosen not required", 'const REQUIRED_RUNS = ["checks", "loosen"];', 'const REQUIRED_RUNS = ["checks"];'],
  ["4: the proof guards and size ceilings merge without the owner", "|loosen-prove\\.mjs|registered-prove\\.mjs|size-prove\\.mjs)$/;", ")$/;"],
  ["4: size-prove merges without the owner", "|size-prove\\.mjs)$/;", ")$/;"],
  ["4: removed lines in ci.yml pass", ' && !/^-/m.test(f.patch)', ""],
  ["4: a missing patch passes", 'typeof f.patch === "string" && ', ""],
  ["4: a deletion count passes", "f.deletions === 0 && ", ""],
  ["4: a renamed registration file passes", 'f?.status === "modified" && ', ""],
  ["4: registration files not checked", "if (paths.some((p) => ADD_ONLY.includes(p)) && !addsOnly)", "if (false)"],
  ["4: owner-merge cannot lift a registration change", "|merge machinery|removed or changed lines in a registration file)$/;", "|merge machinery)$/;"],
  ["5: a marker counts in any trusted comment", 'String(c.body ?? "").startsWith(OWNER_ANSWER) ? ', "true ? "],
  ["5: the first of two markers counts", "return found[found.length - 1][1].toLowerCase();", "return found[0][1].toLowerCase();"],
  ["5: upper-case hex not read", "const OWNER_MERGE = /<!-- owner-merge: ([0-9a-f]{40}) -->/gi;", "const OWNER_MERGE = /<!-- owner-merge: ([0-9a-f]{40}) -->/g;"],
  ["6: owner-ok not pinned to a head", '.filter((n) => n !== "owner-ok" || okPinned)', ""],
  ["6: owner-ok pinned to any head", "const okPinned = ownerOkHead(comments) === sha;", "const okPinned = ownerOkHead(comments) !== null;"],
  ["6: owner-ok read from the owner-merge marker", "export const ownerOkHead = (comments) => ownerHead(comments, OWNER_OK);", "export const ownerOkHead = (comments) => ownerHead(comments, OWNER_MERGE);"],
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
assert.match(workflow, /if out=\$\(gh pr merge "\$NUM" --repo "\$REPO" --squash --match-head-commit "\$SHA" 2>&1\); then\n.*labels\[\]=auto-merged'\n[\s\S]*?\n\s+exit 0\n\s+fi\n[\s\S]*?grep -qE 'refusing to allow a GitHub App to create or update workflow\|without \.workflows\. permission'[\s\S]*?labels\[\]=merge-by-chat'/, "a merge refused for the workflow-permission reason is handed to the dispatcher, never retried another way");
assert.equal((workflow.match(/secrets\./g) || []).length, 1, "the only secret is the optional merge token");
assert.equal((workflow.match(/gh pr merge/g) || []).length, 1, "one merge command, pinned to the checked SHA");
assert.ok(workflow.includes("AUTO_MERGE_CODE: ${{ vars.AUTO_MERGE_CODE != 'off' && 'on' || 'off' }}"), "the code phase has its own off switch");
for (const p of CODE_EXCLUDED) assert.ok(real.codeRefusal(p), `${JSON.stringify(p)} is refused in a code PR`);
for (const p of ["src/main.tsx", "package.json", ".github/workflows/ci.yml", "scripts/size-delta-prove.mjs", "docs/x.md"]) assert.equal(real.codeRefusal(p), null, p);
const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
assert.match(ci, /^name: CI$/m, "auto-merge listens for the workflow named CI");
assert.match(ci, /^ {2}checks:$/m, "the required job is still called checks");
assert.match(ci, /^on:\n(?: .*\n)*? {2}workflow_dispatch:\n/m, "auto-merge can start CI on main after a workflow-token merge");

// #1860 items 8 to 12 and the reset job: rules on the workflow's text. Each mutant breaks one, and the rules must catch it.
function workflowRules(text) {
  const reset = text.match(/^ {2}reset:\n[\s\S]*?(?=^ {2}merge:\n)/m)?.[0] ?? "";
  const merge = text.match(/^ {2}merge:\n[\s\S]*$/m)?.[0] ?? "";
  assert.ok(reset && merge, "the reset and merge jobs");
  assert.match(text, /^ {4}types: \[synchronize, /m, "a push to the PR starts the workflow");
  assert.match(reset, /^ {4}if: github\.event_name == 'pull_request_target' && github\.event\.action == 'synchronize'$/m, "reset runs on every push");
  // 8: nothing can cancel reset, and merge runs only after a reset that finished or was not needed.
  assert.equal(/^concurrency:/m.test(text), false, "no workflow-level concurrency group");
  assert.equal(/concurrency:/.test(reset), false, "reset has no concurrency group");
  assert.match(merge, /^ {4}concurrency:\n {6}group: auto-merge-/m, "merge has its own concurrency group");
  assert.match(merge, /^ {4}needs: reset$/m);
  assert.ok(merge.includes("!cancelled() && (needs.reset.result == 'success' || needs.reset.result == 'skipped') && vars.AUTO_MERGE == 'on'"), "merge waits for a finished or skipped reset");
  // 9: reset drops all four head-bound labels, with its own narrow token.
  assert.match(reset, /for label in owner-merge merge-by-chat owner-ok signal:green; do/);
  assert.match(text, /^permissions: \{\}$/m, "no permissions at the workflow level");
  assert.match(reset, /^ {4}permissions:\n {6}issues: write\n {4}steps:/m, "reset may only change labels");
  assert.match(merge, /^ {4}permissions:\n {6}contents: write\n {6}pull-requests: write\n {6}issues: write\n {6}checks: read\n(?: {6}#.*\n)* {6}actions: write\n {4}runs-on:/m);
  // 10: merge-by-chat only for the workflow-permission refusal, at the head that was checked, with a marker.
  const at = (needle) => merge.indexOf(needle);
  const steps = ["grep -qE 'refusing to allow a GitHub App to create or update workflow|without .workflows. permission'", 'head=$(GH_TOKEN="$LABEL_TOKEN" gh api "repos/$REPO/pulls/$NUM" --jq .head.sha)', 'if [ "$head" != "$SHA" ]; then', "<!-- merge-by-chat: %s -->", "labels[]=merge-by-chat'"];
  for (const needle of steps) assert.ok(at(needle) > 0, `merge step has ${needle}`);
  for (let i = 1; i < steps.length; i++) assert.ok(at(steps[i - 1]) < at(steps[i]), `${steps[i - 1]} comes before ${steps[i]}`);
  assert.equal(merge.split("labels[]=merge-by-chat'").length, 2, "one place adds merge-by-chat");
  assert.match(merge, /if ! grep -qE [^\n]*<<<"\$out"; then\n[^\n]*\n\s+exit 0\n/, "any other refusal stops before the hand-over");
  assert.match(merge, /if \[ "\$head" != "\$SHA" \]; then\n[^\n]*\n\s+exit 0\n/, "a moved head stops before the hand-over");
  // The branch-policy wording is handed over only for a PR whose own file list has a workflow file. The block runs
  // before the refusal check, in this order, and the words it leaves in $out are ones that check accepts.
  const policy = merge.match(/\n +if grep -q 'base branch policy prohibits the merge' <<<"\$out"; then\n +files=\$\(GH_TOKEN="\$LABEL_TOKEN" gh api --paginate "repos\/\$REPO\/pulls\/\$NUM\/files" --jq '\.\[\]\.filename'\)\n +if grep -q '\^\\\.github\/workflows\/' <<<"\$files"; then\n +out='([^'\n]*)'\n +fi\n +fi\n +if ! grep -qE '([^'\n]*)' <<<"\$out"; then\n/);
  assert.ok(policy, "the branch-policy block sits right before the refusal check: wording, then the PR's files, then a workflow file");
  assert.match(policy[1], new RegExp(policy[2]), "the words the block leaves pass the refusal check");
  assert.match(merge, /printf '%s\\n' "\$out" \| sed 's\/::\/: :\/g'/, "GitHub's words never start a workflow command");
  // 11: any CI conclusion re-checks the PR.
  assert.equal(/workflow_run\.conclusion/.test(text), false, "no filter on the CI conclusion");
  assert.match(merge, /\(github\.event_name == 'workflow_run' &&\n\s+github\.event\.workflow_run\.event == 'pull_request' && github\.event\.workflow_run\.path == '\.github\/workflows\/ci\.yml'\)/);
  // 12: a workflow-token merge starts CI on the default branch.
  assert.match(merge, /if \[ "\$GH_TOKEN" = "\$LABEL_TOKEN" \]; then\n\s+GH_TOKEN="\$LABEL_TOKEN" gh workflow run ci\.yml --repo "\$REPO" --ref "\$DEFAULT_BRANCH"\n/);
  assert.match(merge, /DEFAULT_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}/);
}
workflowRules(workflow);
const WORKFLOW_MUTANTS = [
  ["reset no longer runs on a push", "types: [synchronize, ready_for_review", "types: [ready_for_review"],
  ["reset job's condition dropped", "    if: github.event_name == 'pull_request_target' && github.event.action == 'synchronize'\n", ""],
  ["8: workflow-level concurrency again", "permissions: {}\n", "permissions: {}\nconcurrency:\n  group: auto-merge\n"],
  ["8: merge has no concurrency group", "    concurrency:\n      group: auto-merge-", "    x-concurrency:\n      group: auto-merge-"],
  ["8: merge runs after a timed-out reset", "(needs.reset.result == 'success' || needs.reset.result == 'skipped')", "needs.reset.result != 'failure'"],
  ["9: reset leaves owner-ok on", " owner-ok signal:green; do", " signal:green; do"],
  ["9: reset leaves signal:green on", " owner-ok signal:green; do", " owner-ok; do"],
  ["9: reset gets the workflow's wide token", "    permissions:\n      issues: write\n    steps:", "    steps:"],
  ["9: the workflow grants write to every job", "permissions: {}\n", "permissions:\n  contents: write\n"],
  ["10: every refusal is handed over", "if ! grep -qE", "if false && grep -qE"],
  ["10: a branch-policy refusal is handed over with no workflow file", `            if grep -q '^\\.github/workflows/' <<<"$files"; then\n`, "            if true; then\n"],
  ["10: the branch-policy wording is never handed over", "if grep -q 'base branch policy prohibits the merge'", "if false && grep -q 'base branch policy prohibits the merge'"],
  ["10: the branch-policy block does nothing", "              out='without `workflows` permission: GitHub worded it as a branch-policy refusal'\n", "              :\n"],
  ["10: the block's words fail the refusal check", "out='without `workflows` permission: GitHub", "out='no workflows right: GitHub"],
  ["10: the file list is read after it is used", `            files=$(GH_TOKEN="$LABEL_TOKEN" gh api --paginate "repos/$REPO/pulls/$NUM/files" --jq '.[].filename')\n            if grep -q '^\\.github/workflows/' <<<"$files"; then\n`, `            if grep -q '^\\.github/workflows/' <<<"$files"; then\n            files=$(GH_TOKEN="$LABEL_TOKEN" gh api --paginate "repos/$REPO/pulls/$NUM/files" --jq '.[].filename')\n`],
  ["10: a moved head is handed over", 'if [ "$head" != "$SHA" ]; then', 'if false; then'],
  ["10: no marker comment", "<!-- merge-by-chat: %s -->", "merge by chat"],
  ["10: GitHub's words printed raw", "printf '%s\\n' \"$out\" | sed 's/::/: :/g'", "printf '%s\\n' \"$out\""],
  ["11: only a green CI re-checks", "(github.event_name == 'workflow_run' &&\n", "(github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' &&\n"],
  ["12: no CI run on main after the merge", '              GH_TOKEN="$LABEL_TOKEN" gh workflow run ci.yml --repo "$REPO" --ref "$DEFAULT_BRANCH"\n', ""],
];
for (const [name, from, to] of WORKFLOW_MUTANTS) {
  assert.ok(workflow.includes(from), `workflow mutant "${name}" applies`);
  assert.throws(() => workflowRules(workflow.replace(from, to)), `workflow mutant "${name}" caught`);
  console.log(`ok   workflow mutant caught: ${name}`);
}

// ci.yml's docs_only: run its own case statement. Agent instructions are not docs, so CI runs in full for them.
const caseBlock = ci.match(/^( *)case "\$file" in\n[\s\S]*?^\1esac$/m);
assert.ok(caseBlock, "ci.yml has the docs_only case statement");
const docsOnly = (f) =>
  execFileSync("bash", ["-c", `file="$1"; DOCS_ONLY=true; for _ in 1; do\n${caseBlock[0]}\ndone; echo "$DOCS_ONLY"`, "_", f], { encoding: "utf8" }).trim() === "true";
for (const f of ["AGENTS.md", "CLAUDE.md", "README.md", "src/main.tsx", "package.json"]) assert.equal(docsOnly(f), false, `${f} runs full CI`);
for (const f of ["docs/x.md", "LICENSE", ".github/ISSUE_TEMPLATE/bug.md", "notes.md"]) assert.equal(docsOnly(f), true, `${f} is docs-only in CI`);
console.log("ok   ci.yml docs_only: AGENTS.md, CLAUDE.md and README.md run full CI");

console.log(`auto-merge-prove: ok (${CASES.length} cases, ${MUTANTS.length} mutants caught, ${WORKFLOW_MUTANTS.length} workflow mutants caught)`);
