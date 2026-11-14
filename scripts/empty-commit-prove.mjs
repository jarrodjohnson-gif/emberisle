// #1653: flag an empty commit in a pull request. AGENTS.md forbids pushing one to kick CI, and #1496 carried one
// (a58ca967, "ci: trigger fresh run") that only a review caught.
// Lists the PR's own non-merge commits (git rev-list --no-merges <base>..<head>) and fails on any whose tree equals its
// parent's. Merge commits are left out: merging main into a branch is how a PR catches up, and can change nothing.
// Advisory: CI runs it as the non-required `empty-commits` job, on pull requests only.
// Also proves the check itself on a throwaway repository.
// Run: npm run empty-commit-prove [-- --base <commit> --head <commit>]   (defaults: origin/main and HEAD)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// The non-merge commits in base..head that change nothing, oldest first, as { sha, subject }.
export function emptyCommits(cwd, base, head) {
  const out = git(cwd, "rev-list", "--no-merges", "--reverse", "--format=%H %T %P%x09%s", `${base}..${head}`);
  const empty = [];
  for (const line of out.split("\n")) {
    if (!line || line.startsWith("commit ")) continue;
    const [ids, subject = ""] = line.split("\t");
    const [sha, tree, parent] = ids.split(" ");
    if (!parent) continue; // a root commit has no parent to match
    if (git(cwd, "rev-parse", `${parent}^{tree}`) === tree) empty.push({ sha, subject });
  }
  return empty;
}

// The check on itself: a throwaway repository with a normal branch, a branch holding an empty commit, and a branch
// whose only extra commit is a merge that changes nothing.
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "empty-commit-prove-"));
  try {
    const run = (...args) => git(dir, "-c", "user.name=prove", "-c", "user.email=prove@example.invalid", "-c", "commit.gpgsign=false", ...args);
    const write = (name, text) => writeFileSync(join(dir, name), text);
    run("init", "-q", "-b", "main");
    write("a.txt", "one\n");
    run("add", "-A");
    run("commit", "-q", "-m", "first");

    run("checkout", "-q", "-b", "normal");
    write("b.txt", "two\n");
    run("add", "-A");
    run("commit", "-q", "-m", "add b");
    assert.deepEqual(emptyCommits(dir, "main", "normal"), [], "a branch of real commits passes");
    console.log("ok   a branch of real commits passes");

    run("checkout", "-q", "-b", "kick");
    run("commit", "-q", "--allow-empty", "-m", "ci: trigger fresh run");
    write("c.txt", "three\n");
    run("add", "-A");
    run("commit", "-q", "-m", "add c");
    const found = emptyCommits(dir, "main", "kick");
    assert.equal(found.length, 1, "one empty commit is found among real ones");
    assert.equal(found[0].subject, "ci: trigger fresh run", "the empty commit is named by its subject");
    assert.equal(found[0].sha, run("rev-parse", "kick~1"), "the empty commit is named by its hash");
    console.log("ok   an empty commit among real ones fails, named by hash and subject");

    // A commit that only changes a file's mode still changes the tree.
    run("checkout", "-q", "-b", "mode", "normal");
    run("update-index", "--chmod=+x", "b.txt");
    run("commit", "-q", "-m", "make b executable");
    assert.deepEqual(emptyCommits(dir, "main", "mode"), [], "a mode-only change is not empty");
    console.log("ok   a mode-only change is not empty");

    // Catching up: main moves, the branch merges it. The merge is not judged, and main's commits are not the PR's.
    run("checkout", "-q", "-f", "main");
    run("commit", "-q", "--allow-empty", "-m", "empty on main");
    run("checkout", "-q", "normal");
    run("merge", "-q", "--no-ff", "-m", "merge main", "main");
    assert.deepEqual(emptyCommits(dir, "main", "normal"), [], "a merge of main that changes nothing passes");
    console.log("ok   a merge of main passes, and main's own commits are not judged");

    // A branch with nothing of its own.
    assert.deepEqual(emptyCommits(dir, "main", "main"), [], "no commits, nothing to flag");
    console.log("ok   a branch with no commits of its own passes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

selfTest();
const base = arg("--base", "origin/main");
const head = arg("--head", "HEAD");
const empty = emptyCommits(process.cwd(), base, head);
for (const { sha, subject } of empty) console.log(`FAIL ${sha.slice(0, 8)} changes nothing: "${subject}"`);
if (empty.length) {
  console.log(`empty-commit-prove: ${empty.length} empty commit(s) in ${base}..${head}. AGENTS.md: never push an empty commit to kick CI.`);
  process.exit(1);
}
console.log(`empty-commit-prove: no empty commits in ${base}..${head}`);
