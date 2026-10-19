// #332 Debug: the built JS chunks stay inside a gzip size budget. Run after `npm run build`.
// Only dist/assets/*.js counts; sounds and images are not JS.
//
// To raise a budget on purpose: change its number below, in the same pull request that adds the
// weight, and say why in the PR. Each budget is the gzip size on main on 2026-10-03 plus 10%
// (index 105728 bytes, IslandCanvas 166209 bytes). #488 split the online-only lobby and chat (online) and the on-demand
// How to play, trade panel and win screen (sheets) out of the index. sheets is its 2026-10-05 size with the #423 fortune
// tray (5.21 kB) plus 10%, then its 2026-10-05 size with the Costs card (5.71 kB, build-ready-prove) plus 10%; online is set at
// 8000 for #500's mute menu and sender-aware unread count (7.27 kB) plus 10%.
// hud/lobby-names-chat raises index to 119900 (the lobby/music sound table, match point, end music and the name commit, +0.45 kB) and online
// to 8300 (lobby rename and bots, the soundboard, the unread preview, +0.08 kB over 8000).
// moments (the turn moment and the gain lines, Jarrod's playtest) is its 2026-10-05 size (2.37 kB) plus 10%.
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIR = "dist/assets";
const BUDGETS = [
  // 2026-10-14 (#598): +600 B for the Water toggle, its store state and the probe; the old ceiling was 300 B away.
  // 2026-10-15: 116.91 kB measured on main after the four HUD merges (#601 #602 #605 #607) landed on the camera; +600 B.
  // 2026-10-15 (#603): 117.50 kB measured with the win reason on top of the sounds (#613) and the victory target (#611); +500 B.
  // 2026-10-15 (#612): 118.15 kB measured on main + wayfarer modes (creation controls, practice progress, mode rules); +600 B.
  // 2026-10-16 (#535): main measures 119.78 kB (budget 119.90). The missing-goods chip (tap state, timer, glass chip) and the quiet
  // screen-reader announcement (store field, refuseQuietly, Announcer) add 0.25 kB: 120.03 kB measured, +250 B headroom over main's.
  // 2026-10-17 (#660): 120.16 kB measured on Linux CI with the dry woody your_turn cue and mid-turn rejoin tracking while preserving chip_gain mapping; +240 B headroom.
  // 2026-10-17 (#661): main measures 120.16 kB (budget 120.40). The turn-timer cues (timed from the deadline, the knock when the
  // window runs out) add 0.27 kB: 120.43 kB measured on Windows, +150 B headroom over it.
  // 2026-10-17 (#540): lazy coaching adds 85 B versus current main (120431 B); 120516 B measured, +234 B headroom.
  // 2026-10-17 (#552): render recovery adds 655 B over the lazy coach; 121171 B measured, +279 B headroom.
  // 2026-10-17 (#536): live trade response icons and taker identity measure 121.00 kB; +250 B headroom.
  // 2026-10-18 (#552 + #536): recovery on current main measures 121713 B; +287 B headroom after merging both features.
  // 2026-10-18 (#667): board touch sounds (terrain-to-clip table, 400 ms gap, armed flag) measure 122.04 kB; +260 B headroom.
  // 2026-10-18 (#814): the background music (start/stop, duck, Music row) measures 122.26 kB; the mp3 is a lazy audio file, not JS; +340 B headroom.
  // 2026-10-19 (#814 + #667): music and board touch sounds together measure 122.49 kB; +310 B headroom.
  { name: "index", gzipBytes: 122800 },
  // 2026-10-14 (#597): +1100 B for the diorama camera, its fit and the token pose on top of the lazy sea (182.92 kB measured).
  // 2026-10-15: 185.01 kB measured on main once the diorama (#604, +1.1 kB) and the natural waves (#614, +1.0 kB) both
  // landed; each fit its own raise alone.
  // 2026-10-15 (#616): 189.76 kB measured with the touch splash (+4.7 kB: splash field, droplets, fish, wobble) on top.
  // 2026-10-15 (#599): +5.6 kB for the sculpted tiles and code-built props (terrain.ts; 188.80 kB measured), less the photo-texture path.
  // 2026-10-15 (#618): 190.76 kB measured with the sculpted terrain on top of the diorama and the waves; +750 B headroom.
  // 2026-10-15 (#618 + #616): 195.39 kB measured with the sculpted terrain and the touch splash both on main; +600 B.
  // 2026-10-16 (owner: "bruno robber is not showing"): the Bruno wayfarer (bruno.ts) replaces the cone piece; he is on the
  // first frame, so he is in this chunk. 196.79 kB measured, +200 B.
  // 2026-10-16 (#638, owner sign-off "A"): the jelly pieces (pieces-jelly.ts) replace the slabs; pieces are on the first
  // frame, so they are in this chunk (the slab builders stay, for ?pieces=slab and the classic look #641). 198.96 kB
  // measured against 196.82 kB on main; +540 B headroom.
  { name: "IslandCanvas", gzipBytes: 199500 },
  // 2026-10-16 (#624): the Hex Jelly scenes on the board (hex-jelly.ts and the batcher jelly-board.ts), loaded after the
  // island's first draw; 50.95 kB measured, +2 kB. The sculpted terrain left IslandCanvas with them (192.87 kB).
  // 2026-10-16 (#631): the jelly shore (harbor-jelly.ts) is its own chunk, so the scenes it shares with the batcher split out
  // as hex-jelly. Measured: jelly-board 7.64 kB, hex-jelly 45.49 kB (together 53.1 kB, the #624 chunk plus the shore's
  // helpers export), harbor-jelly 10.01 kB; each +about 0.5-1 kB.
  { name: "jelly-board", gzipBytes: 8500 },
  // 2026-10-16 (owner sign-off "yes looks good."): the ore's climber (hex-jelly.ts), after the scenes; 46.81 kB measured
  // against 45.30 kB (+1.51 kB); 690 B headroom. The chunk loads after the island's first draw (the owner: load may grow while play stays snappy).
  { name: "hex-jelly", gzipBytes: 47500 },
  { name: "harbor-jelly", gzipBytes: 11000 },
  { name: "online", gzipBytes: 8300 },
  // 2026-10-15 (#603): 6.33 kB measured with the win screen's winning action on top of #611's lobby selector; +170 B.
  // 2026-10-15 (#612): 6.37 kB measured with wayfarer modes on top of #603; the #603 ceiling holds, no raise.
  // 2026-10-17 (#536): the exact trade composer and live hand validation measure 6.85 kB; +250 B headroom.
  { name: "sheets", gzipBytes: 7100 },
  // 2026-10-16 (#643): the "My numbers" strip rides in moments, off the first load (the index measured 120.64 kB with it there,
  // over its 120.15 kB budget); 3.00 kB measured against 2.42 kB on main, +300 B headroom.
  // 2026-10-17 (#540): first-game coaching moves off the critical path into moments; 4244 B measured versus 3017 B on current main; +256 B headroom.
  // 2026-10-18 (#546): opening pip hints ride with the coach in moments (off the index); 4.95 kB measured, +150 B headroom.
  { name: "moments", gzipBytes: 5100 },
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
