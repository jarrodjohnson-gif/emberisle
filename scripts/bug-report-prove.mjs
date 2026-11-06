// #912: Node proof for bugReportUrl: exact encoding, only version/seed/seq/viewport, under 2,000 characters.
import assert from "node:assert/strict";
import { bugReportUrl } from "../src/lib/bug-report.ts";

const url = bugReportUrl({ version: "abc1234", seed: 987654321, seq: 42, width: 390, height: 844 });
assert.equal(
  url,
  "https://github.com/jarrodjohnson-gif/emberisle/issues/new?title=Bug%3A%20&body=Build%3A%20abc1234%0ASeed%3A%20987654321%0ASeq%3A%2042%0AViewport%3A%20390x844%0A%0A%23%23%20What%20happened%0A%0A",
);
const u = new URL(url);
assert.equal(u.origin + u.pathname, "https://github.com/jarrodjohnson-gif/emberisle/issues/new");
assert.deepEqual([...u.searchParams.keys()], ["title", "body"]);
assert.equal(
  u.searchParams.get("body"),
  "Build: abc1234\nSeed: 987654321\nSeq: 42\nViewport: 390x844\n\n## What happened\n\n",
);

// Hostile or huge input: still one short link, and a newline in a field cannot add a line.
const long = bugReportUrl({ version: "x".repeat(5000), seed: "9".repeat(5000), seq: "1".repeat(5000), width: 1e6, height: 1e6 });
assert.ok(long.length < 2000, `long link is ${long.length} characters`);
const injected = new URL(bugReportUrl({ version: "a\nSeed: 1", seed: 1, seq: 1, width: 1, height: 1 })).searchParams.get("body");
assert.equal(injected.split("\n").filter((l) => l.startsWith("Seed:")).length, 1, "a newline in a field cannot add a line");
assert.ok(!/[ &#]/.test(url.split("?")[1].replace(/&body=/, "")), "query is fully encoded");
console.log(`bug-report-prove: ok (${url.length} chars, long case ${long.length})`);
