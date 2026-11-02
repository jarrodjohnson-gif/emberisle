import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Evaluate the actual folded job conditions, not a separate copy of the routing rule.
const workflow = readFileSync(new URL("../.github/workflows/review-desk-inbox.yml", import.meta.url), "utf8");
function condition(job) {
  const section = workflow.match(new RegExp(`^  ${job}:\\n([\\s\\S]*?)(?=^  [a-z]+:|$(?![\\s\\S]))`, "m"));
  assert.ok(section, `missing ${job} job`);
  const block = section[1].match(/^    if: >-\n((?:      .*\n)+)/m);
  assert.ok(block, `missing folded ${job} condition`);
  return block[1].trim().replace(/\n\s*/g, " ");
}
const startsWith = (s, prefix) => String(s).toLowerCase().startsWith(String(prefix).toLowerCase());
const contains = (s, part) => String(s).toLowerCase().includes(String(part).toLowerCase());
function route(expr, github) {
  // Fail closed if the workflow starts using expression features this small evaluator does not implement.
  const remaining = expr.replace(/'(?:[^']*)'/g, "").replace(/github(?:\.[a-z_]+)+/gi, "").replace(/\b(?:startsWith|contains|true|false)\b/g, "").replace(/[\s!&|=(),0-9]/g, "");
  assert.equal(remaining, "", `unsupported expression syntax: ${remaining}`);
  return Boolean(vm.runInNewContext(expr, { github, startsWith, contains }, { timeout: 1000 }));
}
const notify = condition("notify"), relay = condition("relay");
const pr = (number, draft, event_name = "pull_request_target") => ({ event_name, event: { pull_request: { number, draft } } });
const comment = (body, number = 854, event_name = "issue_comment") => ({ event_name, event: { issue: { number }, comment: { body } } });
const cases = [
  [notify, pr(123, false), true, "ready PR"], [notify, pr(123, true), false, "draft PR"],
  [notify, pr(699, false), false, "inbox PR"], [notify, pr(123, false, "issue_comment"), false, "wrong PR event"],
  [relay, comment("Question: choose?"), true, "question"], [relay, comment("to DESK: ready"), true, "case-insensitive address"],
  [relay, comment("To desk: ready", 699), false, "inbox comment"], [relay, comment("status: ready"), false, "status"],
  [relay, comment("prefix To desk: ready"), false, "embedded address"],
  [relay, comment("To desk: ready <!-- review-desk -->"), false, "desk marker"],
  [relay, comment("Desk: To desk: ready"), false, "desk post"],
  [relay, comment("To desk: ready", 854, "pull_request_target"), false, "wrong comment event"],
];
for (const [expr, event, expected, label] of cases) assert.equal(route(expr, event), expected, label);
const inverted = notify.replace("!github.event.pull_request.draft", "github.event.pull_request.draft");
assert.notEqual(inverted, notify, "negative control must mutate condition");
assert.notEqual(route(inverted, pr(123, false)), true, "inverted draft condition is detected");
console.log(`review-desk-inbox-prove: ${cases.length} routing fixtures and inverted-condition control passed`);
