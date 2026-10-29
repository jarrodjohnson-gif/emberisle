import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const inspectWorkflow = (workflow) => {
  const jobs = Object.fromEntries([...workflow.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].map(m => [m[1], m[2]]));

  const key = "installed-v1-${{ runner.os }}-${{ runner.arch }}-${{ steps.node.outputs.node-version }}-${{ hashFiles('package.json', 'package-lock.json', 'server/package.json', 'server/package-lock.json') }}";
  const installs = new Map();
  for (const name of names) {
    const job = jobs[name];
    assert.ok(job, `${name}: job exists`);
    const steps = job.split(/(?=^      - )/m).slice(1);
    const cache = steps.filter(s => s.includes("id: dependencies"));
    assert.equal(cache.length, 1, `${name}: one installed-dependency cache`);
    assert.match(cache[0], /uses: actions\/cache@v4/);
    assert.match(cache[0], /path: \|\n            node_modules\n            server\/node_modules/);
    assert.ok(cache[0].includes(`key: ${key}`), `${name}: exact platform, Node and both lockfiles key`);
    assert.ok(!cache[0].includes("restore-keys"), `${name}: no stale lockfile fallback`);
    assert.match(job, /uses: actions\/setup-node@v4\n        id: node/);
    const commands = steps.filter(s => /^        run: npm ci(?: --prefix server)?$/m.test(s));
    assert.equal(commands.length, 2, `${name}: both clean installs remain available`);
    installs.set(name, commands.map(step => {
      const condition = step.match(/- if: (.+)/)?.[1];
      assert.equal(condition, "needs.changes.outputs.docs_only != 'true' && steps.dependencies.outputs.cache-hit != 'true'", `${name}: install only after a cache miss`);
      return { condition, command: step.match(/run: (.+)/)[1] };
    }));
    assert.ok(job.indexOf("id: dependencies") < job.indexOf("run: npm ci"), `${name}: restore precedes install`);
    if (name !== "dependencies") assert.match(job, name === "browser-b" ? /needs: \[changes, build\]/ : /needs: \[changes, dependencies\]/, `${name}: seed publishes the cold cache first`);
  }
  assert.match(jobs.build, /cd "\$RUNNER_TEMP\/base"\n          npm ci\n          npm run build/, "size baseline retains its own lockfile install");
  assert.match(jobs.checks, /needs: \[changes, dependencies, build, server, browser-a, browser-b\]/, "required gate retains every suite");
  assert.match(jobs["browser-a-suites"], /suite: \[a1, a2, a3\]/);
  assert.match(jobs["browser-b"], /suite: \[flows-a, flows-b, presentation, presentation-2, flows-c, presentation-3, scene-life, scene-water\]/);

  return { installs, jobs };
};
const names = ["dependencies", "build", "server", "browser-a-suites", "browser-b"];
const { installs, jobs } = inspectWorkflow(workflow);
// A missing manifest in any producer or consumer must fail the proof.
for (const name of names) {
  for (const manifest of ["package.json", "server/package.json"]) {
    const broken = workflow.replace(jobs[name], jobs[name].replace(`'${manifest}', `, ""));
    assert.notEqual(broken, workflow, `${name}: ${manifest} negative control changes the key`);
    assert.throws(() => inspectWorkflow(broken), /exact platform, Node and both lockfiles key/, `${name}: missing ${manifest} is rejected`);
  }
}
console.log("ok negative controls: missing root/server manifest rejected in all five cache keys");
// Model hashFiles with fixed lockfiles and a manifest-only dependency change.
// The old key hits the previous install; the fixed key forces the npm ci fallback.
const cacheStep = jobs.dependencies.split(/(?=^      - )/m).find(s => s.includes("id: dependencies"));
const hashArguments = cacheStep.match(/hashFiles\(([^)]+)\)/)[1];
const inputs = [...hashArguments.matchAll(/'([^']+)'/g)].map(m => m[1]);
const fixture = {
  "package.json": JSON.stringify({ dependencies: { fixture: "1.0.0" } }),
  "server/package.json": JSON.stringify({ dependencies: { fixture: "1.0.0" } }),
  "package-lock.json": "fixed root lockfile",
  "server/package-lock.json": "fixed server lockfile",
};
const digest = (paths, files) => {
  const hash = createHash("sha256");
  for (const file of [...paths].sort()) hash.update(createHash("sha256").update(files[file]).digest());
  return hash.digest("hex");
};
for (const manifest of ["package.json", "server/package.json"]) {
  const drift = { ...fixture, [manifest]: JSON.stringify({ dependencies: { fixture: "2.0.0" } }) };
  const lockfiles = ["package-lock.json", "server/package-lock.json"];
  assert.equal(digest(lockfiles, fixture), digest(lockfiles, drift), `${manifest}: old lock-only key incorrectly hits`);
  assert.notEqual(digest(inputs, fixture), digest(inputs, drift), `${manifest}: manifest drift forces a clean install`);
}
console.log("ok manifest-only drift: old keys hit; fixed root/server keys miss with unchanged lockfiles");

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-ci-install-"));
try {
  const npm = path.join(dir, "npm");
  writeFileSync(npm, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$INSTALL_LOG"\nexit "${INSTALL_EXIT:-0}"\n');
  chmodSync(npm, 0o755);
  const execute = (name, docs, hit, log, failure = 0) => {
    let calls = 0;
    for (const { condition, command } of installs.get(name)) {
      const expression = condition.replaceAll("needs.changes.outputs.docs_only", JSON.stringify(docs)).replaceAll("steps.dependencies.outputs.cache-hit", JSON.stringify(hit));
      if (!vm.runInNewContext(expression)) continue;
      const result = spawnSync("sh", ["-c", command], { cwd: dir, env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, INSTALL_LOG: log, INSTALL_EXIT: String(failure) }, encoding: "utf8" });
      assert.equal(result.status, failure, `${name}: install failures are not swallowed`);
      calls++;
      if (result.status) break;
    }
    return calls;
  };
  const weights = { dependencies: 1, build: 1, server: 1, "browser-a-suites": 3, "browser-b": 8 };
  for (const [scenario, docs, seedHit, consumerHit, expected] of [
    ["cold", "false", "false", "true", 2],
    ["warm", "false", "true", "true", 0],
    ["unavailable", "false", "", "", 28],
    ["docs", "true", "", "", 0],
  ]) {
    const log = path.join(dir, scenario);
    let calls = 0;
    for (const name of names) for (let i = 0; i < weights[name]; i++) calls += execute(name, docs, name === "dependencies" ? seedHit : consumerHit, log);
    assert.equal(calls, expected, `${scenario}: exact clean-install count`);
    if (calls) assert.equal(readFileSync(log, "utf8").trim().split("\n").length, calls);
    console.log(`ok ${scenario}: ${calls} npm ci calls across 14 dependency jobs (PR size baseline adds 1)`);
  }
  assert.equal(execute("build", "false", "false", path.join(dir, "failure"), 31), 1, "a failed first install stops the job");
  console.log("ok failed install exits 31; exact cache identity and all required suites retained");
  console.log("ci-install-prove ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
