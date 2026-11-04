// #924: every *-prove.mjs in scripts/ or server/ is named by a package.json script and run by ci.yml (AGENTS.md rule 6).
// ci.yml reaches a proof through `npm run <script>`, `npm test` (which runs server/package.json's test) or `node <file>`.
// Only step `run:` text counts (inline or a `run: |` block), with comments stripped. A step with `if: false` or
// `continue-on-error: true`, or a command line ending in `|| true`, does not count.
// Also proves the check itself on inline fixtures and on the real files with an invented proof added.
// Run: npm run registered-prove
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const PROOF = /[\w./-]*-prove\.mjs/g;
const uncomment = (l) => (/^\s*#/.test(l) ? "" : l.replace(/\s+#.*$/, ""));

// Splits ci.yml into list items (steps), each with its run lines and why it does not count, if it does not.
function steps(ci) {
  const out = [];
  const lines = ci.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^(\s*)- /);
    if (!head) continue;
    const indent = head[1].length;
    let end = i + 1;
    while (end < lines.length) {
      const l = lines[end];
      const m = l.match(/^(\s*)\S/);
      if (m && !/^\s*#/.test(l) && (m[1].length < indent || (m[1].length === indent && /^\s*- /.test(l)))) break;
      end++;
    }
    const body = lines.slice(i, end);
    body[0] = body[0].replace("- ", "  ");
    const key = (k) => body.map(uncomment).map((l) => l.match(new RegExp(`^\\s*${k}:\\s*(.*)$`))?.[1]).find((v) => v !== undefined);
    const run = [];
    body.forEach((l, j) => {
      const m = l.match(/^(\s*)run:\s*(.*)$/);
      if (!m) return;
      if (!/^[|>][-+]?$/.test(m[2].trim())) return void run.push(uncomment(m[2]));
      for (const b of body.slice(j + 1)) {
        if (b.trim() && b.match(/^\s*/)[0].length <= m[1].length) break;
        run.push(uncomment(b));
      }
    });
    const cond = (key("if") ?? "").replace(/^\$\{\{\s*|\s*\}\}$/g, "").trim();
    const muted =
      /^(false|(.*&&\s*)?false(\s*&&.*)?)$/.test(cond) ? "its step has `if: false`" : /^true$/.test(key("continue-on-error") ?? "") ? "its step has `continue-on-error: true`" : "";
    out.push({ run, muted });
  }
  return out;
}

// Returns { notInPackage, notInCi }; notInCi entries are { proof, why }.
export function unregistered({ proofs, rootScripts, serverScripts, ci }) {
  const named = new Set();
  const fromScript = (cmd, dir) => (cmd.match(PROOF) ?? []).map((f) => dir + f.replace(/^\.\//, ""));
  for (const cmd of Object.values(rootScripts)) for (const f of fromScript(cmd, "")) named.add(f);
  for (const cmd of Object.values(serverScripts)) for (const f of fromScript(cmd, "server/")) named.add(f);

  const reach = (line) => {
    const got = new Set();
    const seen = new Set();
    const follow = (scripts, name, dir) => {
      const cmd = scripts[name];
      if (cmd === undefined || seen.has(dir + name)) return;
      seen.add(dir + name);
      for (const f of fromScript(cmd, dir)) got.add(f);
      for (const m of cmd.matchAll(/npm (?:--prefix (\S+) )?(?:run (\S+)|(test))/g)) {
        const [s, d] = m[1] === "server" ? [serverScripts, "server/"] : [scripts, dir];
        follow(s, m[2] ?? m[3], d);
      }
    };
    for (const m of line.matchAll(/npm (?:run (\S+)|(test))/g)) follow(rootScripts, m[1] ?? m[2], "");
    for (const m of line.matchAll(/\bnode\s+(?:--import\s+\S+\s+)?(\S+-prove\.mjs)/g)) got.add(m[1].replace(/^\.\//, ""));
    return got;
  };
  const ran = new Set();
  const muted = new Map();
  for (const step of steps(ci)) {
    for (const line of step.run) {
      const why = step.muted || (/\|\|\s*true\s*$/.test(line) ? "its command ends in `|| true`" : "");
      for (const f of reach(line)) if (why) muted.set(f, why);
      else ran.add(f);
    }
  }
  return {
    notInPackage: proofs.filter((p) => !named.has(p)),
    notInCi: proofs.filter((p) => !ran.has(p)).map((proof) => ({ proof, why: muted.get(proof) ?? "no step's run: text reaches it" })),
  };
}

// Self-test on inline fixtures: each case lists the proofs that must be reported, with the reason.
const fixture = {
  proofs: ["scripts/a-prove.mjs", "scripts/b-prove.mjs", "server/c-prove.mjs"],
  rootScripts: { "a-prove": "node scripts/a-prove.mjs", "b-prove": "node scripts/b-prove.mjs", test: "npm --prefix server test" },
  serverScripts: { test: "node --import ./register.mjs c-prove.mjs" },
};
const ciOk = `jobs:
  server:
    steps:
      - uses: actions/checkout@v4
      - if: needs.changes.outputs.docs_only != 'true'
        run: npm run a-prove
      - run: |
          set -euo pipefail
          npm test
      - run: npm run b-prove # kept
`;
const cases = [
  ["the fixture as written passes", ciOk, []],
  ["a removed step fails", ciOk.replace(/^.*run: npm run a-prove\n/m, "").replace(/^.*docs_only.*\n/m, ""), [["scripts/a-prove.mjs", "no step"]]],
  ["a command only in a # comment line fails", ciOk.replace("run: npm run b-prove # kept", "run: echo skip\n      # npm run b-prove"), [["scripts/b-prove.mjs", "no step"]]],
  ["a command only in a trailing # comment fails", ciOk.replace("run: npm run b-prove # kept", "run: echo skip # npm run b-prove"), [["scripts/b-prove.mjs", "no step"]]],
  ["a command outside any run: fails", ciOk.replace("run: npm run b-prove # kept", "name: npm run b-prove"), [["scripts/b-prove.mjs", "no step"]]],
  ["`if: false` fails", ciOk.replace("if: needs.changes.outputs.docs_only != 'true'", "if: false"), [["scripts/a-prove.mjs", "if: false"]]],
  ["`if: ${{ x && false }}` fails", ciOk.replace("if: needs.changes.outputs.docs_only != 'true'", "if: ${{ needs.changes.outputs.docs_only != 'true' && false }}"), [["scripts/a-prove.mjs", "if: false"]]],
  ["`continue-on-error: true` fails", ciOk.replace("      - run: npm run b-prove", "      - continue-on-error: true\n        run: npm run b-prove"), [["scripts/b-prove.mjs", "continue-on-error"]]],
  ["`|| true` in a run: | block fails, through npm test", ciOk.replace("          npm test", "          npm test || true"), [["server/c-prove.mjs", "|| true"]]],
  ["a dropped server test chain fails", ciOk.replace("          npm test\n", "          echo none\n"), [["server/c-prove.mjs", "no step"]]],
];
for (const [label, ci, want] of cases) {
  const got = unregistered({ ...fixture, ci }).notInCi;
  assert.deepEqual(got.map((g) => g.proof), want.map((w) => w[0]), label);
  want.forEach(([, why], k) => assert.ok(got[k].why.includes(why), `${label}: reason "${got[k].why}" names ${why}`));
  console.log(`ok   self-test: ${label}`);
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

const invented = `scripts/zz-${randomBytes(6).toString("hex")}-prove.mjs`;
const withNew = unregistered({ ...repo, proofs: [...repo.proofs, invented] });
assert.deepEqual(withNew.notInPackage.filter((p) => !notInPackage.includes(p)), [invented], "a new proof no package.json names fails");
assert.deepEqual(withNew.notInCi.map((g) => g.proof).filter((p) => !notInCi.some((g) => g.proof === p)), [invented], "a new proof ci.yml never runs fails");
console.log("ok   self-test: a new proof added to the real repo fails in both places");

for (const p of notInPackage) console.log(`FAIL ${p}: no script in package.json or server/package.json runs it`);
for (const { proof, why } of notInCi) console.log(`FAIL ${proof}: .github/workflows/ci.yml does not run it (${why})`);
if (notInPackage.length || notInCi.length) {
  console.log("Register each proof in package.json and .github/workflows/ci.yml, next to its neighbours (AGENTS.md rule 6).");
  process.exit(1);
}
console.log(`registered-prove: all ${repo.proofs.length} proofs are in package.json and ci.yml`);
