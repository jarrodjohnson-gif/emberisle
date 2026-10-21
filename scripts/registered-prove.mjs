// #924: every *-prove.mjs in scripts/ or server/ is named by a package.json script and run by ci.yml (AGENTS.md rule 6).
// ci.yml reaches a proof through `npm run <script>`, `npm test` (which runs server/package.json's test) or `node <file>`,
// on any line that is not a comment.
// Also proves the check itself: a proof with its ci.yml line removed, or a new unnamed proof, must fail.
// Run: npm run registered-prove
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const PROOF = /[\w./-]*-prove\.mjs/g;

// Returns { notInPackage, notInCi }: proof paths (from the repo root) missing from either place.
export function unregistered({ proofs, rootScripts, serverScripts, ci }) {
  const named = new Set();
  const fromScript = (cmd, dir) => (cmd.match(PROOF) ?? []).map((f) => dir + f.replace(/^\.\//, ""));
  for (const cmd of Object.values(rootScripts)) for (const f of fromScript(cmd, "")) named.add(f);
  for (const cmd of Object.values(serverScripts)) for (const f of fromScript(cmd, "server/")) named.add(f);

  const ran = new Set();
  const seen = new Set();
  const follow = (scripts, name, dir) => {
    const key = dir + name;
    const cmd = scripts[name];
    if (cmd === undefined || seen.has(key)) return;
    seen.add(key);
    for (const f of fromScript(cmd, dir)) ran.add(f);
    for (const m of cmd.matchAll(/npm (?:--prefix (\S+) )?(?:run (\S+)|(test))/g)) {
      const into = m[1] === "server" ? [serverScripts, "server/"] : [scripts, dir];
      follow(into[0], m[2] ?? m[3], into[1]);
    }
  };
  for (const line of ci.split("\n")) {
    if (/^\s*#/.test(line)) continue;
    for (const m of line.matchAll(/npm (?:run (\S+)|(test))/g)) follow(rootScripts, m[1] ?? m[2], "");
    for (const m of line.matchAll(/\bnode\s+(?:--import\s+\S+\s+)?(\S+-prove\.mjs)/g)) ran.add(m[1].replace(/^\.\//, ""));
  }
  return { notInPackage: proofs.filter((p) => !named.has(p)), notInCi: proofs.filter((p) => !ran.has(p)) };
}

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const list = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url)).filter((f) => f.endsWith("-prove.mjs")).map((f) => `${dir}/${f}`);
const repo = {
  proofs: [...list("scripts"), ...list("server")].sort(),
  rootScripts: JSON.parse(read("package.json")).scripts,
  serverScripts: JSON.parse(read("server/package.json")).scripts,
  ci: read(".github/workflows/ci.yml"),
};

const { notInPackage, notInCi } = unregistered(repo);

// The check catches what it should, on mutated copies of the real files: each mutation adds exactly its proof.
const added = (got, base) => got.filter((p) => !base.includes(p));
const dropCi = unregistered({ ...repo, ci: repo.ci.replace(/^.*npm run (tabs-prove|tabs-prove-4|served-prove)\n/gm, "") });
assert.deepEqual(added(dropCi.notInCi, notInCi), ["scripts/tabs-prove.mjs"], "a proof whose ci.yml lines are removed fails");
const newProof = unregistered({ ...repo, proofs: [...repo.proofs, "scripts/zz-new-prove.mjs"] });
assert.deepEqual(added(newProof.notInPackage, notInPackage), ["scripts/zz-new-prove.mjs"], "a new proof no package.json names fails");
assert.deepEqual(added(newProof.notInCi, notInCi), ["scripts/zz-new-prove.mjs"], "a new proof ci.yml never runs fails");
const { test, ...noTest } = repo.serverScripts;
assert.ok(added(unregistered({ ...repo, serverScripts: noTest }).notInCi, notInCi).includes("server/rules-prove.mjs"), "server proofs count only through npm test");
console.log("ok   mutation: a removed ci.yml line, a new unnamed proof and a dropped server test chain all fail");

for (const p of notInPackage) console.log(`FAIL ${p}: no script in package.json or server/package.json runs it`);
for (const p of notInCi) console.log(`FAIL ${p}: .github/workflows/ci.yml never runs it`);
if (notInPackage.length || notInCi.length) {
  console.log("Register each proof in package.json and .github/workflows/ci.yml, next to its neighbours (AGENTS.md rule 6).");
  process.exit(1);
}
console.log(`registered-prove: all ${repo.proofs.length} proofs are in package.json and ci.yml`);
