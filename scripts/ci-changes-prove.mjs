// #1174: the browser legs skip their steps only for docs and non-runtime changes (owner, 2026-11-06).
// 1. Runs the changes job's real shell script from ci.yml under bash, with a stub git that reports a fixed list of
//    changed files, and checks the docs_only and browser outputs for each list. Server-only PRs must run the legs.
// 2. Evaluates every step condition in browser-a-suites and browser-b for each output pair the script can give, and
//    checks which steps run: nothing on a docs-only PR, only checkout, Node and the dependency restore on a
//    non-runtime PR, and every proof on a runtime PR, with checkout first whenever anything runs.
// 3. Mutates the workflow and checks that each change is rejected.
// No network. Run: npm run ci-changes-prove
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const jobsOf = (text) => Object.fromEntries([...text.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].map((m) => [m[1], m[2]]));
const stepsOf = (job) => job.split(/(?=^      - )/m).slice(1).map((raw) => ({ raw, if: raw.match(/^      - if: (.+)$/m)?.[1] }));

// [name, event, merge-base found, changed files, docs_only, browser]
const RUNTIME = [
  ["src/ change", ["src/main.tsx"]],
  ["server-only change (owner, 2026-11-06)", ["server/host.mjs"]],
  ["server package file", ["server/package.json"]],
  ["ci.yml itself", [".github/workflows/ci.yml"]],
  ["README.md (fortune-tray-prove reads it)", ["README.md"]],
  ["AGENTS.md", ["AGENTS.md"]],
  ["CLAUDE.md", ["CLAUDE.md"]],
  ["package.json", ["package.json"]],
  ["package-lock.json", ["package-lock.json"]],
  ["index.html", ["index.html"]],
  ["vite.config.ts", ["vite.config.ts"]],
  ["tsconfig.json", ["tsconfig.json"]],
  ["a browser proof", ["scripts/client-prove.mjs"]],
  ["a script no browser leg runs (safe default)", ["scripts/desk-board.mjs"]],
  ["public/ asset", ["public/audio/amb_sea.mp3"]],
  ["legacy/", ["legacy/terrain-v1/x.ts"]],
  ["unlisted top-level file", [".gitignore"]],
  ["server file after non-runtime files", [".github/flaky.json", "docs/LANES.md", "server/host.mjs"]],
  ["src/ file before a non-runtime file", ["src/a.ts", ".github/flaky.json"]],
  ["docs plus src/", ["docs/x.md", "src/a.ts"]],
  ["markdown in a folder, with a non-doc file", [".github/flaky.json", "public/audio/CREDITS.md"]],
  ["GitHub markdown outside ISSUE_TEMPLATE, with a non-doc file", [".github/flaky.json", ".github/pull_request_template.md"]],
];
const NON_RUNTIME = [
  ["flake list", [".github/flaky.json"]],
  ["another workflow", [".github/workflows/pages.yml"]],
  ["agent definitions with a workflow", [".claude/agents/code-master.md", ".github/workflows/pages.yml"]],
  ["Claude settings and a workflow", [".claude/settings.json", ".github/workflows/soak.yml"]],
  ["flake list with docs", [".github/flaky.json", "docs/LANES.md", "notes.md", "LICENSE"]],
  ["issue template with a workflow", [".github/ISSUE_TEMPLATE/bug.md", ".github/workflows/next-up.yml"]],
];
const DOCS = [
  ["design doc", ["docs/design/x.md"]],
  ["top-level markdown and LICENSE", ["notes.md", "LICENSE"]],
  ["issue template", [".github/ISSUE_TEMPLATE/bug.md"]],
  ["path with a space", ["docs/a b.md"]],
  // The docs fast path is frozen (DECISIONS 2026-10-21): markdown in any folder is still docs-only on its own.
  ["markdown in a folder", ["public/audio/CREDITS.md"]],
];
const CASES = [
  ["push to main", "push", true, ["src/main.tsx"], "false", "true"],
  ["push to main, docs only", "push", true, ["docs/x.md"], "false", "true"],
  ["no merge base", "pull_request", false, ["docs/x.md"], "false", "true"],
  ["empty diff", "pull_request", true, [], "false", "true"],
  ...DOCS.map(([name, files]) => [`docs-only: ${name}`, "pull_request", true, files, "true", "false"]),
  ...NON_RUNTIME.map(([name, files]) => [`non-runtime: ${name}`, "pull_request", true, files, "false", "false"]),
  ...RUNTIME.map(([name, files]) => [`runtime: ${name}`, "pull_request", true, files, "false", "true"]),
];

function changesScript(text) {
  const job = jobsOf(text).changes;
  assert.ok(job, "ci.yml has the changes job");
  assert.match(job, /^      docs_only: \$\{\{ steps\.check\.outputs\.docs_only \}\}$/m, "changes exposes docs_only");
  assert.match(job, /^      browser: \$\{\{ steps\.check\.outputs\.browser \}\}$/m, "changes exposes browser");
  const lines = job.split("\n");
  const at = lines.findIndex((l) => l === "        run: |");
  assert.ok(at > 0 && lines.slice(0, at).some((l) => l === "      - id: check"), "the check step has a run block");
  const body = [];
  for (const l of lines.slice(at + 1)) {
    if (l.trim() && !l.startsWith("          ")) break;
    body.push(l.slice(10));
  }
  return body.join("\n");
}

function runChanges(script, dir, event, hasBase, files) {
  const out = path.join(dir, "output");
  writeFileSync(out, "");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      EVENT_NAME: event,
      BASE_REF: "main",
      GITHUB_OUTPUT: out,
      FAKE_BASE: hasBase ? "0123456789abcdef" : "",
      FAKE_FILES: files.join("\n"),
    },
  });
  assert.equal(result.status, 0, `the changes script exits 0\n${result.stdout}${result.stderr}`);
  const got = Object.fromEntries(readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => l.split("=")));
  return got;
}

// Which steps run in one leg for one output pair. always() steps (artifact upload) are reported separately.
function legRun(steps, suite, docs, browser) {
  return steps.filter((step) => {
    const expression = (step.if ?? "true")
      .replace(/^\$\{\{\s*|\s*\}\}$/g, "")
      .replaceAll("needs.changes.outputs.docs_only", JSON.stringify(docs))
      .replaceAll("needs.changes.outputs.browser", JSON.stringify(browser))
      .replaceAll("steps.dependencies.outputs.cache-hit", JSON.stringify("true"))
      .replaceAll("matrix.suite", JSON.stringify(suite))
      .replaceAll("always()", "true");
    return vm.runInNewContext(expression);
  });
}

const SETUP = [/uses: actions\/checkout@v4/, /uses: actions\/setup-node@v4/, /id: dependencies/, /run: npm ci( --prefix server)?$/m];
const isSetup = (step) => SETUP.some((re) => re.test(step.raw));
const isAlways = (step) => step.if === "always()";
const proofOf = (step) => step.raw.match(/^        run: (npm run [\w-]+)$/m)?.[1];

function inspect(text, log = () => {}) {
  const script = changesScript(text);
  const dir = mkdtempSync(path.join(tmpdir(), "emberisle-ci-changes-"));
  const pairs = new Set();
  try {
    const git = path.join(dir, "git");
    writeFileSync(git, '#!/bin/sh\ncase "$1" in\n  merge-base) [ -n "$FAKE_BASE" ] || exit 1; echo "$FAKE_BASE";;\n  diff) printf "%s" "$FAKE_FILES";;\n  *) exit 2;;\nesac\n');
    chmodSync(git, 0o755);
    for (const [name, event, hasBase, files, docs, browser] of CASES) {
      const got = runChanges(script, dir, event, hasBase, files);
      assert.deepEqual(got, { docs_only: docs, browser }, `${name}: ${files.join(", ") || "(none)"}`);
      assert.ok(!(got.docs_only === "true" && got.browser !== "false"), `${name}: a docs-only PR never runs the browser legs`);
      pairs.add(`${got.docs_only},${got.browser}`);
      log(`ok   ${name}: docs_only=${got.docs_only} browser=${got.browser}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual([...pairs].sort(), ["false,false", "false,true", "true,false"], "the script gives exactly three output pairs");

  const jobs = jobsOf(text);
  for (const [name, suites] of [["browser-a-suites", ["a1", "a2", "a3"]], ["browser-b", ["flows-a", "flows-b", "presentation", "presentation-2", "flows-c", "presentation-3", "scene-life", "scene-water"]]]) {
    const job = jobs[name];
    assert.ok(job, `${name}: job exists`);
    assert.match(job, new RegExp(`suite: \\[${suites.join(", ")}\\]`), `${name}: matrix legs unchanged`);
    const steps = stepsOf(job);
    for (const step of steps) {
      if (isSetup(step)) assert.match(step.if ?? "", /^needs\.changes\.outputs\.docs_only != 'true'( && steps\.dependencies\.outputs\.cache-hit != 'true')?$/, `${name}: setup keeps the docs-only gate: ${step.raw.trim().split("\n")[0]}`);
      else if (!isAlways(step)) assert.match(step.if ?? "", /^needs\.changes\.outputs\.browser != 'false'( && matrix\.suite == '[\w-]+')?$/, `${name}: step is gated on the browser output: ${step.raw.trim().split("\n").slice(0, 2).join(" ")}`);
    }
    const proofs = steps.map(proofOf).filter(Boolean);
    assert.ok(proofs.length > 0, `${name}: has proof steps`);
    const ran = new Set();
    for (const suite of suites) {
      const docsRun = legRun(steps, suite, "true", "false");
      assert.deepEqual(docsRun.filter((s) => !isAlways(s)), [], `${name} (${suite}): a docs-only PR runs no step`);
      const quiet = legRun(steps, suite, "false", "false").filter((s) => !isAlways(s));
      assert.deepEqual(quiet.map((s) => SETUP.findIndex((re) => re.test(s.raw))), [0, 1, 2], `${name} (${suite}): a non-runtime PR runs only checkout, Node and the dependency restore`);
      const full = legRun(steps, suite, "false", "true").filter((s) => !isAlways(s));
      assert.match(full[0].raw, /uses: actions\/checkout@v4/, `${name} (${suite}): checkout runs first on a runtime PR`);
      assert.ok(full.some((s) => /npx playwright install/.test(s.raw)), `${name} (${suite}): Chromium is installed on a runtime PR`);
      for (const s of full) if (proofOf(s)) ran.add(proofOf(s));
    }
    assert.deepEqual([...ran].sort(), [...new Set(proofs)].sort(), `${name}: every proof step runs in some leg on a runtime PR`);
    log(`ok   ${name}: ${suites.length} legs; docs-only runs nothing, non-runtime runs setup only, runtime runs all ${proofs.length} proof steps`);
  }

  // The required checks still always report: browser-a always runs and needs its suites, and checks still requires
  // browser-a and browser-b success on pull requests.
  assert.match(jobs["browser-a"], /needs: browser-a-suites\n    if: always\(\) && github\.event_name == 'pull_request'/, "browser-a always reports");
  assert.match(jobs.checks, /needs: \[changes, dependencies, build, server, browser-a, browser-b\]/, "checks needs every suite");
  assert.match(jobs.checks, /if: always\(\)/, "checks always reports");
  for (const leg of ["browser-a", "browser-b"]) assert.ok(jobs.checks.includes(`test '\${{ needs.${leg}.result }}' = success`), `checks requires ${leg} success on a pull request`);
  log("ok   browser-a and checks still always report and require both browser jobs");
}

inspect(workflow, console.log);

const changesJob = jobsOf(workflow).changes;
const browserB = jobsOf(workflow)["browser-b"];
const MUTATIONS = [
  ["server/ counted as non-runtime", (s) => s.replace("|.claude/*|LICENSE)", "|.claude/*|server/*|LICENSE)"), /server-only change/],
  ["src/ markdown counted as non-runtime", (s) => s.replace("|.claude/*|LICENSE)", "|.claude/*|*.md|LICENSE)"), /markdown in a folder/],
  ["ci.yml counted as non-runtime", (s) => s.replace("README.md|AGENTS.md|CLAUDE.md|.github/workflows/ci.yml)", "README.md|AGENTS.md|CLAUDE.md)"), /ci\.yml itself/],
  ["README.md counted as non-runtime", (s) => s.replace("README.md|AGENTS.md|CLAUDE.md|.github/workflows/ci.yml)", "AGENTS.md|CLAUDE.md|.github/workflows/ci.yml)"), /README\.md/],
  ["unlisted files skip the legs", (s) => s.replace("                */*) BROWSER=true; break;;\n", "                */*) ;;\n"), /runtime: /],
  ["browser output not exposed", (s) => s.replace("      browser: ${{ steps.check.outputs.browser }}\n", ""), /changes exposes browser/],
  ["push run skips the legs", (s) => s.replace(changesJob, changesJob.replace('            echo "browser=true" >> "$GITHUB_OUTPUT"\n', "")), /push to main/],
  ["docs-only PR runs the legs", (s) => s.replace('          if [ "$DOCS_ONLY" != true ]; then\n', '          if true; then\n'), /docs-only/],
  ["a proof step loses its browser gate", (s) => s.replace(browserB, browserB.replace("- if: needs.changes.outputs.browser != 'false' && matrix.suite == 'flows-a'\n", "- if: needs.changes.outputs.docs_only != 'true' && matrix.suite == 'flows-a'\n")), /gated on the browser output/],
  ["a proof step runs only on non-runtime PRs", (s) => s.replace(browserB, browserB.replace("- if: needs.changes.outputs.browser != 'false' && matrix.suite == 'flows-a'\n", "- if: needs.changes.outputs.browser == 'false' && matrix.suite == 'flows-a'\n")), /gated on the browser output/],
  ["Chromium install gated on docs only", (s) => s.replace(browserB, browserB.replace("      - if: needs.changes.outputs.browser != 'false'\n        run: npx playwright install", "      - if: needs.changes.outputs.docs_only != 'true'\n        run: npx playwright install")), /gated on the browser output/],
  ["checkout gated on the browser output", (s) => s.replace(browserB, browserB.replace("      - if: needs.changes.outputs.docs_only != 'true'\n        uses: actions/checkout@v4", "      - if: needs.changes.outputs.browser != 'false'\n        uses: actions/checkout@v4")), /setup keeps the docs-only gate/],
  ["a proof step in no leg", (s) => s.replace(browserB, browserB.replace("matrix.suite == 'flows-a'\n        run: npm run hand-cards-prove", "matrix.suite == 'flows-z'\n        run: npm run hand-cards-prove")), /every proof step runs/],
  ["browser-a no longer always reports", (s) => s.replace("needs: browser-a-suites\n    if: always() && ", "needs: browser-a-suites\n    if: "), /browser-a always reports/],
];
for (const [name, change, failure] of MUTATIONS) {
  const broken = change(workflow);
  assert.notEqual(broken, workflow, `${name}: the mutation changes the workflow`);
  assert.throws(() => inspect(broken), failure, `${name}: rejected`);
  console.log(`ok   negative control: ${name}`);
}
console.log(`ci-changes-prove: ${CASES.length} file lists, 11 browser legs, ${MUTATIONS.length} negative controls`);
