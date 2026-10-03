// #332 Debug: the built JS chunks stay inside a gzip size budget. Run after `npm run build`.
// Only dist/assets/*.js counts; sounds and images are not JS.
//
// To raise a budget on purpose: change its number below, in the same pull request that adds the
// weight, and say why in the PR. Each budget is the gzip size on main on 2026-10-03 plus 10%
// (index 105728 bytes, IslandCanvas 166209 bytes).
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIR = "dist/assets";
const BUDGETS = [
  { name: "index", gzipBytes: 116301 },
  { name: "IslandCanvas", gzipBytes: 182830 },
];

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`FAIL no ${DIR}: run npm run build first`);
  process.exit(1);
}

const kB = (n) => (n / 1000).toFixed(2) + " kB";
const fails = [];
for (const { name, gzipBytes } of BUDGETS) {
  // Vite hashes filenames: name-<hash>.js. Match the name, a dash, and the 8-character hash (which may itself hold a dash).
  const match = files.filter((f) => new RegExp(`^${name}-[A-Za-z0-9_-]{8}\\.js$`).test(f));
  if (match.length === 0) {
    fails.push(name);
    console.log(`FAIL ${name}: no chunk named ${name}-*.js in ${DIR}`);
    continue;
  }
  const size = match.reduce((sum, f) => sum + gzipSync(readFileSync(`${DIR}/${f}`)).length, 0);
  const ok = size <= gzipBytes;
  if (!ok) fails.push(name);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${kB(size)} gzip, budget ${kB(gzipBytes)}${ok ? "" : ` (${kB(size - gzipBytes)} over)`}`);
}

const unbudgeted = files.filter((f) => !BUDGETS.some(({ name }) => new RegExp(`^${name}-[A-Za-z0-9_-]{8}\\.js$`).test(f)));
if (unbudgeted.length) {
  fails.push("unbudgeted");
  console.log(`FAIL chunk with no budget: ${unbudgeted.join(", ")}. Add it to BUDGETS.`);
}

if (fails.length) process.exit(1);
console.log("size-prove: all chunks inside budget");
