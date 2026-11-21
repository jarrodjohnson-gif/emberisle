#!/usr/bin/env node
// Decides whether a pull request may auto-merge (#923). Run by .github/workflows/auto-merge.yml.
// Phase 1 is docs only. Phase 2 (owner decision 2026-11-21, docs/DESK.md) also merges a code PR, unless the repo
// variable AUTO_MERGE_CODE is "off": it needs a complete clean review footer at the head from a different model than the
// builder, and it never touches a governance file. A `needs-owner` label blocks either phase until `owner-ok` is added.
// It reads the API only. It never checks out or runs the PR's code: the workflow checks out the default branch's copy
// of this one file. Eligibility comes from the PR files API, the head SHA's `checks` run and the desk's clean marker,
// never from labels or authors. Every rule fails closed: an excluded path wins over the allow list, and any API error
// or missing field means no merge.
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MAX_CHANGED_LINES = 400;
const ALLOW = ["docs/", ".github/ISSUE_TEMPLATE/"];
// Governance docs: agents and the desk act on these, so they keep the desk's own merge.
const EXCLUDE_EXACT = ["README.md", "docs/LOOPING.md", "docs/builder-kit/builder-agent.md", "docs/builder-kit/launch.sh", "docs/DESK.md", "docs/REVIEWING.md", "docs/DECISIONS.md", "docs/LANES.md", "docs/FRAMEWORK.md", "docs/HELPERS.md", "docs/ORCHESTRATOR.md"];
const EXCLUDE_PREFIX = [".github/", "scripts/", "server/", "src/"];
// Matched on the file name in any folder: agents read a nested AGENTS.md or CLAUDE.md, and GitHub reads docs/CODEOWNERS.
const EXCLUDE_NAME = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".mcp.json", "CODEOWNERS", ".gitignore"];
const EXCLUDE_SUFFIX = [".mjs", ".ts"];
// Only added and modified files qualify: no removed, renamed, copied or mode-changed ("changed") files.
const STATUSES = ["added", "modified"];
// The desk's own write-access accounts. Anyone can comment on a public PR, so other authors' markers are ignored.
const TRUSTED = ["OWNER", "MEMBER", "COLLABORATOR"];
// GitHub Actions' app id, the integration the ruleset requires for `checks`.
const ACTIONS_APP_ID = 15368;
const SHA = /^[0-9a-f]{40}$/;
const MARKER = /<!--\s*review-desk:\s*clean\s+([0-9a-f]{40})\s*-->/g;
const FOOTER = /Reviewer:\s*([^·\r\n]+?)\s*·\s*Builder:\s*([^·\r\n]+?)\s*·\s*Head:\s*([0-9a-f]{40})(?=\s|$)/i;
// Phase 2: the flow's own machinery keeps the owner's merge. ci.yml is allowed, because every new proof is registered there.
const CODE_EXCLUDE_PREFIX = [".github/", ".claude/"];
const CODE_ALLOW_EXACT = [".github/workflows/ci.yml"];
const CODE_EXCLUDE_SCRIPT = /^scripts\/(auto-merge|desk-gate|desk-board|pr-signal)[^/]*$/;

// Why a path can't auto-merge in a code PR, or null if it can.
export function codeRefusal(path) {
  if (typeof path !== "string" || !path) return "no path";
  if (path.startsWith("/") || path.includes("\\") || /[\u0000-\u001f]/.test(path) || path.split("/").some((s) => s === "" || s === "." || s === ".."))
    return "unsafe path";
  const lower = path.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  if (EXCLUDE_EXACT.some((p) => p.toLowerCase() === lower)) return "governance file";
  if (EXCLUDE_NAME.some((n) => n.toLowerCase() === name)) return "governance file name";
  if (CODE_EXCLUDE_SCRIPT.test(lower)) return "merge machinery";
  if (CODE_EXCLUDE_PREFIX.some((p) => lower.startsWith(p)) && !CODE_ALLOW_EXACT.includes(path)) return "governance folder";
  return null;
}

// A review that asks for the owner's look or listen. The same wording scripts/desk-board.mjs reads.
const OWNER_ASK = /(?:Jarrod|owner)[^\n.]{0,100}(?:must see|sign.off|approval|accept)|(?:waiting|pending|needs?)[^\n.]{0,60}(?:Jarrod|owner)|(?:visual|pictures?|audio)[^\n.]{0,80}(?:first|pending|approval|sign.off)/i;
// True when the newest review from a trusted account asks for the owner. The reviewer may add `needs-owner` a moment
// after it posts, so the merge must not win that race.
export function ownerAsked(comments) {
  const newest = [...(comments ?? [])].reverse().find((c) => TRUSTED.includes(c.author_association) && /<!--\s*review-desk/.test(String(c.body ?? "")));
  return Boolean(newest) && OWNER_ASK.test(String(newest.body).replace(/<!--[\s\S]*?-->/g, ""));
}

// "Claude Opus 5.5", "opus-5.5" and "Opus  5.5" are one model.
const model = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^claude/, "");

// The footer of the newest review comment from a trusted account, or null. Only the newest review counts: if its
// footer is missing or malformed, an older clean review never stands in for it.
export function reviewFooter(comments) {
  for (const c of [...(comments ?? [])].reverse()) {
    const body = String(c.body ?? "");
    if (!TRUSTED.includes(c.author_association) || !body.includes("<!-- review-desk -->")) continue;
    const m = body.match(FOOTER);
    if (!m) return null;
    const head = m[3].toLowerCase();
    return { reviewer: model(m[1]), builder: model(m[2]), head,
      clean: [...body.matchAll(MARKER)].some((k) => k[1] === head) };
  }
  return null;
}

// Why a path can't auto-merge, or null if it can. Excludes are checked first, case-insensitively.
export function pathRefusal(path) {
  if (typeof path !== "string" || !path) return "no path";
  if (path.startsWith("/") || path.includes("\\") || /[\u0000-\u001f]/.test(path) || path.split("/").some((s) => s === "" || s === "." || s === ".."))
    return "unsafe path";
  const lower = path.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  if (EXCLUDE_EXACT.some((p) => lower === p.toLowerCase())) return "excluded governance file";
  if (EXCLUDE_PREFIX.some((p) => lower.startsWith(p.toLowerCase()))) return "excluded folder";
  if (EXCLUDE_NAME.some((n) => name === n.toLowerCase())) return "excluded file name";
  if (/^package.*\.json$/.test(name)) return "excluded package file";
  if (EXCLUDE_SUFFIX.some((s) => lower.endsWith(s))) return "excluded code file";
  if (!ALLOW.some((p) => path.startsWith(p))) return "outside docs/";
  return null;
}

// pr: the PR from the API. headAfter: its head SHA read again after everything else, so a push mid-check is caught.
// files: every page of the PR files API. checkRuns: the head SHA's check runs named `checks`. comments: its issue comments.
// code: false when the repo variable AUTO_MERGE_CODE is "off"; the workflow passes "on" otherwise.
export function decide({ pr, headAfter, files, checkRuns, comments, defaultBranch, code = false }) {
  const no = (reason) => ({ merge: false, reason });
  const sha = pr?.head?.sha;
  if (!SHA.test(sha ?? "")) return no("no head SHA");
  if (headAfter !== sha) return no(`head moved from ${sha} to ${headAfter} during the check`);
  if (pr.state !== "open" || pr.merged || pr.draft) return no("PR is not open and ready");
  if (!defaultBranch || pr.base?.ref !== defaultBranch) return no(`base is not ${defaultBranch}`);
  if (!Array.isArray(files) || !files.length) return no("no changed files");
  if (files.length !== pr.changed_files) return no(`files API listed ${files.length} of ${pr.changed_files} files`);

  const labels = (pr.labels ?? []).map((l) => l?.name);
  if (labels.includes("needs-owner") && !labels.includes("owner-ok")) return no("`needs-owner` without `owner-ok`: waits for the owner");
  if (ownerAsked(comments) && !labels.includes("owner-ok")) return no("the newest review asks for the owner, and `owner-ok` is not on the PR");

  const docsOnly = files.every((f) => STATUSES.includes(f.status) && !pathRefusal(f.filename))
    && files.reduce((n, f) => n + f.additions + f.deletions, 0) < MAX_CHANGED_LINES;
  const asCode = code === true && !docsOnly;
  if (asCode) {
    for (const f of files) {
      for (const path of [f.filename, f.previous_filename].filter((p) => p !== undefined)) {
        const why = codeRefusal(path);
        if (why) return no(`${JSON.stringify(path)}: ${why}`);
      }
    }
    const footer = reviewFooter(comments);
    if (!footer) return no("no complete review footer");
    if (footer.head !== sha) return no(`the newest review is for ${footer.head}, not ${sha}`);
    if (!footer.clean) return no("the newest review is not clean");
    if (!footer.reviewer || !footer.builder) return no("the review footer does not name both models");
    if (footer.reviewer === footer.builder) return no("reviewer and builder are the same model");
  }

  let lines = 0;
  for (const f of asCode ? [] : files) {
    if (!STATUSES.includes(f.status)) return no(`${JSON.stringify(f.filename)} is ${f.status}`);
    const refusal = pathRefusal(f.filename);
    if (refusal) return no(`${JSON.stringify(f.filename)}: ${refusal}`);
    if (!Number.isInteger(f.additions) || !Number.isInteger(f.deletions)) return no(`${JSON.stringify(f.filename)} has no line counts`);
    lines += f.additions + f.deletions;
  }
  if (lines >= MAX_CHANGED_LINES) return no(`${lines} changed lines, the limit is under ${MAX_CHANGED_LINES}`);

  const runs = (checkRuns ?? []).filter((r) => r.name === "checks" && r.app?.id === ACTIONS_APP_ID);
  if (!runs.length) return no("no `checks` run on the head SHA");
  if (runs.some((r) => r.head_sha !== sha || r.status !== "completed" || r.conclusion !== "success"))
    return no("`checks` is not green on the head SHA");

  const marked = (comments ?? [])
    .filter((c) => TRUSTED.includes(c.author_association))
    .some((c) => [...String(c.body ?? "").matchAll(MARKER)].some((m) => m[1] === sha));
  if (!marked) return no(`no desk clean marker for ${sha}`);

  if (asCode) return { merge: true, reason: `${files.length} files, checks green, different-model review clean at ${sha}`, sha };
  return { merge: true, reason: `${files.length} docs files, ${lines} lines, checks green, desk clean at ${sha}`, sha };
}

async function main() {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT, PR_NUMBER, RUN_HEAD_SHA, DEFAULT_BRANCH, AUTO_MERGE_CODE } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !GITHUB_OUTPUT || !DEFAULT_BRANCH) throw new Error("needs GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT, DEFAULT_BRANCH");
  // Nothing printed below can act as a workflow command, whatever the PR named its files.
  console.log(`::stop-commands::${randomUUID()}`);
  const api = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;
  const headers = { authorization: `Bearer ${GITHUB_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  const get = async (path) => {
    const res = await fetch(`${api}${path}`, { headers });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const all = async (path) => {
    const out = [];
    for (let page = 1; ; page++) {
      const data = await get(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      out.push(...data);
      if (data.length < 100) return out;
    }
  };

  // CI's workflow_run names no PR for a fork, so find the open PR whose head is the run's commit.
  let number = PR_NUMBER;
  if (!number && SHA.test(RUN_HEAD_SHA ?? "")) {
    const open = (await all("/pulls?state=open")).filter((p) => p.head.sha === RUN_HEAD_SHA);
    if (open.length !== 1) return console.log(`${open.length} open PRs have head ${RUN_HEAD_SHA}: no merge`);
    number = String(open[0].number);
  }
  if (!/^[1-9][0-9]*$/.test(number ?? "")) return console.log("no PR to check: no merge");

  const pr = await get(`/pulls/${number}`);
  const files = await all(`/pulls/${number}/files`);
  const sha = SHA.test(pr.head?.sha ?? "") ? pr.head.sha : null;
  const checkRuns = sha ? (await get(`/commits/${sha}/check-runs?check_name=checks&filter=latest&per_page=100`)).check_runs : [];
  const comments = await all(`/issues/${number}/comments`);
  const headAfter = (await get(`/pulls/${number}`)).head?.sha;

  const decision = decide({ pr, headAfter, files, checkRuns, comments, defaultBranch: DEFAULT_BRANCH, code: AUTO_MERGE_CODE === "on" });
  console.log(`PR #${number}: ${decision.merge ? "merge" : "no merge"}, ${decision.reason}`);
  if (decision.merge) appendFileSync(GITHUB_OUTPUT, `merge=true\nnumber=${number}\nsha=${decision.sha}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
