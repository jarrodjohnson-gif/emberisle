// #984: run soak.yml's actual shell blocks against a stub npm, including the real final failure gate.
// Two early failures write >40 log lines and overwrite the same evidence files; later successes overwrite them again.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const WORKFLOW = new URL("../.github/workflows/soak.yml", import.meta.url);
const yaml = readFileSync(WORKFLOW, "utf8");
const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
// #1032/#1124: the owner paused automatic runs; retain the manual entry point.
// Read the workflow's block-style on: mapping, excluding comments and nested input keys.
function assertManualOnly(text) {
  const lines = text.split("\n").map((line) => line.replace(/#.*$/, ""));
  const starts = lines.flatMap((line, i) => /^on:\s*$/.test(line) ? [i] : []);
  assert.equal(starts.length, 1, "soak has exactly one block-style on: mapping");
  const events = [];
  for (let i = starts[0] + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) break;
    if (!/^  \S/.test(line)) continue;
    const event = line.match(/^  (?:([a-z_]+)|"([a-z_]+)"|'([a-z_]+)'):(?:\s|$)/);
    assert.ok(event, "soak trigger keys use direct event names");
    events.push(event[1] ?? event[2] ?? event[3]);
  }
  assert.deepEqual(events, ["workflow_dispatch"], "soak stays manual-only until a new owner decision");
}
const manual = "# schedule: documentation only\non:\n  workflow_dispatch:\n    inputs:\n      schedule:\n        description: Optional manual input\npermissions:\n  contents: read\n";
assertManualOnly(manual);
for (const [name, fixture] of [
  ["restored schedule", manual.replace("  workflow_dispatch:", "  schedule:\n    - cron: '17 9 * * *'\n  workflow_dispatch:")],
  ["quoted schedule", manual.replace("  workflow_dispatch:", "  'schedule':\n    - cron: '17 9 * * *'\n  workflow_dispatch:")],
  ["automatic push", manual.replace("  workflow_dispatch:", "  push:\n  workflow_dispatch:")],
  ["missing manual entry point", "on:\n  schedule:\n    - cron: '17 9 * * *'\n"],
  ["duplicate on: mapping", `${manual}on:\n  schedule:\n    - cron: '17 9 * * *'\n`],
]) {
  assert.throws(() => assertManualOnly(fixture), `trigger guard rejects ${name}`);
  console.log(`ok trigger guard rejects ${name}`);
}
assertManualOnly(yaml);
console.log("ok manual-only soak: workflow_dispatch retained; automatic triggers absent");
// Named steps in this workflow use run: |. Stop at the next YAML key at the run key's indentation.
function shellBlocks(text) {
  const lines = text.split("\n"), blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)run: \|\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() && line.match(/^\s*/)[0].length <= indent) break;
      body.push(line.slice(indent + 2));
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}
const blocks = shellBlocks(yaml);
const runners = blocks.filter((s) => s.includes('for run in 1 2 3 4 5; do'));
const gates = blocks.filter((s) => s.includes('if [ -s soak-results/counts.txt ]; then'));
assert.equal(runners.length, 2, "both browser runner blocks are exercised");
assert.equal(gates.length, 2, "both jobs retain their final failure gates");
assert.equal(gates[0], gates[1], "browser failure gates agree");
for (const runner of runners) {
  for (const match of runner.matchAll(/PROOFS=\(([^)]*)\)/g)) for (const name of match[1].trim().split(/\s+/)) assert.ok(scripts[name], `soak command ${name} exists`);
}
const dir = mkdtempSync(path.join(tmpdir(), "emberisle-soak-evidence-"));
const stub = `#!/bin/bash
set -euo pipefail
[ "$1" = run ]
proof="$2"
count_file="calls/$proof"
mkdir -p calls test-results/'nested space'
count=0
if [ -f "$count_file" ]; then read -r count < "$count_file"; fi
count=$((count + 1))
printf '%s\\n' "$count" > "$count_file"
printf '%s attempt %s\\n' "$proof" "$count" > test-results/shared.txt
printf '%s attempt %s spaced\\n' "$proof" "$count" > 'test-results/nested space/with space.txt'
# A copied screenshot may preserve an old mtime; its ctime still identifies this attempt.
touch -t 200001010000 test-results/shared.txt 'test-results/nested space/with space.txt'
if [ "$proof" = "$FAIL_PROOF" ] && [ "$count" -le 2 ]; then
  printf 'EARLY_FAILURE_MARKER %s attempt %s\\n' "$proof" "$count"
  for n in {1..100}; do printf 'trailing detail %s\\n' "$n"; done
  exit 7
fi
printf 'passed %s attempt %s\\n' "$proof" "$count"
`;
try {
  const bin = path.join(dir, "bin"); mkdirSync(bin);
  writeFileSync(path.join(bin, "npm"), stub); chmodSync(path.join(bin, "npm"), 0o755);
  const scenarios = [
    ["browser-a", runners[0], "client-prove"],
    ["flows-a", runners[1], "hand-cards-prove"],
    ["flows-b", runners[1], "pan-prove"],
    ["presentation", runners[1], "visual-direction-prove"],
  ];
  for (const [suite, runner, target] of scenarios) {
    const cwd = path.join(dir, suite); mkdirSync(path.join(cwd, "test-results"), { recursive: true });
    writeFileSync(path.join(cwd, "test-results/stale.txt"), "not from this attempt");
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, SUITE: suite, FAIL_PROOF: target };
    const result = spawnSync("bash", ["-c", runner], { cwd, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, `${suite}: runner finishes all attempts: ${result.stderr}`);
    const read = (file) => readFileSync(path.join(cwd, file), "utf8");
    assert.deepEqual(read("soak-results/counts.txt").trim().split("\n"), [target, target], `${suite}: only the two real failures count`);
    for (const proof of readdirSync(path.join(cwd, "calls"))) assert.equal(Number(read(`calls/${proof}`)), 5, `${suite}/${proof}: all five attempts ran`);
    const summary = read("soak-results/failures.txt");
    assert.equal((summary.match(/FAILED:/g) ?? []).length, 2, `${suite}: summary keeps two identities`);
    assert.ok(summary.split("\n").length < 100, `${suite}: existing concise tails remain bounded`);
    assert.ok(!summary.includes("EARLY_FAILURE_MARKER"), `${suite}: fixture really puts the failure outside the old 40-line tail`);
    for (const run of [1, 2]) {
      const base = `soak-results/failed/${suite}/run-${run}/${target}`;
      assert.ok(existsSync(path.join(cwd, base, "output.log")), `${suite}/${run}: full failed-attempt log survives`);
      const full = read(`${base}/output.log`);
      assert.match(full, new RegExp(`EARLY_FAILURE_MARKER ${target} attempt ${run}`), `${suite}/${run}: early failure retained`);
      assert.match(full, /trailing detail 100/, `${suite}/${run}: complete log retained`);
      assert.equal(read(`${base}/evidence/test-results/shared.txt`), `${target} attempt ${run}\n`, `${suite}/${run}: evidence survives later overwrites`);
      assert.equal(read(`${base}/evidence/test-results/nested space/with space.txt`), `${target} attempt ${run} spaced\n`, `${suite}/${run}: spaced paths preserved`);
      assert.equal(existsSync(path.join(cwd, base, "evidence/test-results/stale.txt")), false, `${suite}/${run}: unrelated old evidence excluded`);
    }
    for (const run of [3, 4, 5]) assert.equal(existsSync(path.join(cwd, `soak-results/failed/${suite}/run-${run}/${target}`)), false, `${suite}/${run}: successful logs and evidence are not retained`);
    const retained = spawnSync("find", ["soak-results/failed", "-type", "f", "-print0"], { cwd, encoding: "utf8" });
    assert.equal(retained.status, 0);
    const expected = [1, 2].flatMap((run) => ["output.log", "evidence/test-results/shared.txt", "evidence/test-results/nested space/with space.txt"].map((file) => `soak-results/failed/${suite}/run-${run}/${target}/${file}`));
    assert.deepEqual(retained.stdout.split("\0").filter(Boolean).sort(), expected.sort(), `${suite}: only the failed attempts retain any output`);
    const gate = spawnSync("bash", ["-c", gates[0]], { cwd, env, encoding: "utf8" });
    assert.equal(gate.status, 1, `${suite}: real final gate still fails the job`);
    assert.match(gate.stdout, /Soak detected failing proofs/);
    console.log(`ok ${suite}: five runs, two complete failure logs, distinct snapshots, bounded summary and failure gate`);
  }
  // All-success control: the same runner retains no attempt output and the same final gate passes.
  const cwd = path.join(dir, "all-pass"); mkdirSync(cwd);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAIL_PROOF: "none" };
  const passed = spawnSync("bash", ["-c", runners[0]], { cwd, env, encoding: "utf8", timeout: 30_000 });
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(readFileSync(path.join(cwd, "soak-results/counts.txt"), "utf8"), "");
  assert.equal(spawnSync("bash", ["-c", gates[0]], { cwd, env }).status, 0, "all-success job remains successful");
  const logs = spawnSync("find", ["soak-results/failed", "-type", "f"], { cwd, encoding: "utf8" });
  assert.equal(logs.status, 0);
  assert.equal(logs.stdout, "", "successful attempts retain no logs or evidence");
  console.log("ok all-success control: no retained attempt output; final gate passes");
  console.log("soak-evidence-prove ok");
} finally { rmSync(dir, { recursive: true, force: true }); }
