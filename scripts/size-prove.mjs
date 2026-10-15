// #332 Debug: the built JS chunks stay inside a gzip size budget. Run after `npm run build`.
// Only dist/assets/*.js counts; sounds and images are not JS.
//
// To raise a budget on purpose: change its number below, in the same pull request that adds the
// weight, and say why in the PR. Each budget is the gzip size on main on 2026-10-03 plus 10%
// (index 105728 bytes, IslandCanvas 166209 bytes). #488 split the online-only lobby and chat (online) and the on-demand
// How to play, trade panel and win screen (sheets) out of the index. sheets is its 2026-10-05 size with the #423 fortune
// tray (5.21 kB) plus 10%, then its 2026-10-05 size with the Costs card (5.71 kB, build-ready-prove) plus 10%; online is set at
// 8000 for #500's mute menu and sender-aware unread count (7.27 kB) plus 10%.
// moments (the turn moment and the gain lines, Jarrod's playtest) is its 2026-10-05 size (2.37 kB) plus 10%.
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIR = "dist/assets";
const BUDGETS = [
  // 2026-10-14 (#598): +600 B for the Water toggle, its store state and the probe; the old ceiling was 300 B away.
  // 2026-10-15: 116.91 kB measured on main after the four HUD merges (#601 #602 #605 #607) landed on the camera; +600 B.
  { name: "index", gzipBytes: 117500 },
  // 2026-10-14 (#597): +1100 B for the diorama camera, its fit and the token pose on top of the lazy sea (182.92 kB measured).
  // 2026-10-15: 185.01 kB measured on main once the diorama (#604, +1.1 kB) and the natural waves (#614, +1.0 kB) both
  // landed; each fit its own raise alone. +1.5 kB over the measurement for the touch-splash work in flight (#616).
  { name: "IslandCanvas", gzipBytes: 186500 },
  { name: "online", gzipBytes: 8000 },
  // 2026-10-15 (#603): 6.33 kB measured with the win screen's winning action on top of #611's lobby selector; +170 B.
  { name: "sheets", gzipBytes: 6500 },
  { name: "moments", gzipBytes: 2610 },
  // 2026-10-14 (#611): the lobby and win screen share their target selector; rolldown coalesces the shared Minus icon here too.
  // 0.65 kB at introduction, with a 0.75 kB ceiling; replaces the former minus-only chunk.
  { name: "VictoryTargetSelect", gzipBytes: 750 },
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
