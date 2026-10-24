// #868 Debug: size-prove's growth check, on fixture sizes (no build). Run: node scripts/size-delta-prove.mjs
// Covers a pull request inside its allowance, over it, a new chunk, a removed chunk, the ceiling alone, and a chunk with no ceiling.
import { spawnSync } from "node:child_process";

const fx = (f) => `scripts/fixtures/size/${f}`;
const run = (args) => {
  const r = spawnSync(process.execPath, ["scripts/size-prove.mjs", ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
};

let failed = 0;
const check = (label, args, code, ...mustContain) => {
  const { code: got, out } = run(args);
  const missing = mustContain.filter((s) => !out.includes(s));
  const ok = got === code && missing.length === 0;
  if (!ok) {
    failed++;
    console.log(`FAIL ${label}: exit ${got} (want ${code})${missing.length ? `, output lacks ${JSON.stringify(missing)}` : ""}\n${out}`);
  } else console.log(`ok   ${label}`);
};

check("+300 B on index passes", ["--sizes", fx("pass.json"), "--base-sizes", fx("base.json")], 0, "ok   index growth: base 122000 B, PR 122300 B, +300 B, allowance 400 B");
check("a second +300 B on top of it passes", ["--sizes", fx("pass.json"), "--base-sizes", fx("pass.json")], 0, "+0 B");
check(
  "+600 B on index fails and names chunk, base, PR, allowance",
  ["--sizes", fx("fail.json"), "--base-sizes", fx("base.json")],
  1,
  "FAIL index growth: base 122000 B, PR 122600 B, +600 B, allowance 400 B (200 B over)",
);
check("a new chunk is held to its ceiling only", ["--sizes", fx("new-chunk.json"), "--base-sizes", fx("base-old.json")], 0, "new  VictoryTargetSelect", "not in the base");
check("a removed chunk passes and is reported", ["--sizes", fx("base.json"), "--base-sizes", fx("base-with-legacy.json")], 0, "gone legacy");
check("a chunk gone from the PR that still has a ceiling fails", ["--sizes", fx("base-old.json"), "--base-sizes", fx("base.json")], 1, "FAIL VictoryTargetSelect: no chunk named");
check("without a base only the ceilings run and the delta command is printed", ["--sizes", fx("pass.json")], 0, "no base given", "--base <dir");
check("over the absolute ceiling fails even inside the allowance", ["--sizes", fx("over-ceiling.json"), "--base-sizes", fx("over-ceiling.json")], 1, "FAIL index: 125.30 kB gzip, ceiling 125.20 kB");

check("the new phone chunk keeps its own fixed ceiling", ["--sizes", fx("over-haptics.json")], 1, "FAIL haptics:");

if (failed) process.exit(1);
console.log("size-delta-prove: all cases behave");
