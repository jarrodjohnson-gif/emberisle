#!/usr/bin/env node
// Re-runs a failed CI run's failed jobs once, only when every failure is a known flake from .github/flaky.json.
// Run by .github/workflows/flake-rerun.yml. It talks to the API only: it never checks out or runs the PR's code.
// Job names, step names and logs come from the PR's run, so they are data: matched by regex, never echoed raw as commands.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// `checks` and `browser-a` fail whenever a job they need fails, so they never have a flake of their own.
const AGGREGATE_JOBS = ["checks", "browser-a"];
const FAILED = ["failure", "cancelled", "timed_out"];

export function loadFlakes(text) {
  return JSON.parse(text).flakes.map((f) => ({ ...f, regex: new RegExp(f.pattern) }));
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The flake a failed step is, or null. The step must be that proof's `npm run` and the log must hold its signature.
function flakeFor(step, log, flakes) {
  return flakes.find((f) => new RegExp(`(^|\\s)npm run ${escape(f.id)}$`).test(step.name) && f.regex.test(log)) || null;
}

// jobs: the run attempt's jobs from the API. logs: job id -> log text, for the failed jobs.
export function decide({ runAttempt, jobs, logs, flakes }) {
  if (runAttempt !== 1) return { rerun: false, reason: `run attempt ${runAttempt}, only attempt 1 is re-run`, jobs: [] };
  const failed = jobs.filter((j) => FAILED.includes(j.conclusion) && !AGGREGATE_JOBS.includes(j.name));
  if (!failed.length) return { rerun: false, reason: "no failed jobs to match", jobs: [] };
  const results = failed.map((job) => {
    const steps = (job.steps || []).filter((s) => FAILED.includes(s.conclusion));
    const log = logs[job.id] ?? "";
    const matched = steps.map((s) => flakeFor(s, log, flakes));
    const ok = job.conclusion === "failure" && steps.length > 0 && matched.every(Boolean);
    return { name: job.name, flakes: ok ? matched.map((f) => f.id) : null };
  });
  const misses = results.filter((r) => !r.flakes);
  return misses.length
    ? { rerun: false, reason: `${misses.length} of ${results.length} failed jobs are not a known flake`, jobs: results }
    : { rerun: true, reason: `all ${results.length} failed jobs are known flakes`, jobs: results };
}

async function main() {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, RUN_ID, RUN_ATTEMPT } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !RUN_ID || !RUN_ATTEMPT) throw new Error("needs GITHUB_TOKEN, GITHUB_REPOSITORY, RUN_ID, RUN_ATTEMPT");
  // Nothing printed below can act as a workflow command, whatever the PR named its jobs.
  console.log(`::stop-commands::${randomUUID()}`);
  const api = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;
  const headers = { authorization: `Bearer ${GITHUB_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  const call = async (path, init = {}) => {
    const res = await fetch(`${api}${path}`, { ...init, headers, redirect: "manual" });
    if (res.status >= 400) throw new Error(`${init.method || "GET"} ${path}: ${res.status} ${await res.text()}`);
    return res;
  };

  const runAttempt = Number(RUN_ATTEMPT);
  const flakes = loadFlakes(readFileSync(new URL("../.github/flaky.json", import.meta.url), "utf8"));
  let jobs = [];
  if (runAttempt === 1) {
    for (let page = 1; ; page++) {
      const data = await (await call(`/actions/runs/${RUN_ID}/attempts/${runAttempt}/jobs?per_page=100&page=${page}`)).json();
      jobs.push(...data.jobs);
      if (jobs.length >= data.total_count || !data.jobs.length) break;
    }
  }
  const logs = {};
  for (const job of jobs.filter((j) => FAILED.includes(j.conclusion) && !AGGREGATE_JOBS.includes(j.name))) {
    // The API answers with a redirect to a signed URL; follow it without sending the token there.
    const res = await call(`/actions/jobs/${job.id}/logs`);
    const location = res.headers.get("location");
    if (!location) throw new Error(`job ${job.id} logs: no redirect (${res.status})`);
    const log = await fetch(location);
    if (!log.ok) throw new Error(`job ${job.id} logs: ${log.status}`);
    logs[job.id] = await log.text();
  }

  const decision = decide({ runAttempt, jobs, logs, flakes });
  for (const j of decision.jobs) console.log(`${JSON.stringify(j.name)}: ${j.flakes ? `known flake ${j.flakes.join(", ")}` : "not a known flake"}`);
  console.log(`run ${RUN_ID} attempt ${runAttempt}: ${decision.rerun ? "re-running failed jobs" : "no re-run"}, ${decision.reason}`);
  if (decision.rerun) await call(`/actions/runs/${RUN_ID}/rerun-failed-jobs`, { method: "POST" });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
