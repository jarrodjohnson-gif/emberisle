import assert from 'node:assert/strict';
import { deskGate, run } from './desk-gate.mjs';

const head = 'a'.repeat(40), old = 'b'.repeat(40);
const pr = { number: 42, state: 'open', draft: false, head: { sha: head } };
const review = (sha = head, reviewer = 'Sonnet 5.5', builder = 'GPT-6.1 Terra') => ({ author_association: 'OWNER', body: `<!-- review-desk -->\nClean.\nReviewer: ${reviewer} · Builder: ${builder} · Head: ${sha}` });
assert.equal(deskGate(pr, [review()]).state, 'success');
assert.equal(deskGate(pr, [review(old)]).state, 'failure');
assert.equal(deskGate(pr, [review(head, 'Terra', 'terra')]).state, 'failure');
assert.equal(deskGate(pr, [{ body: '<!-- review-desk -->\nClean' }]).state, 'failure');
assert.equal(deskGate({ ...pr, draft: true }, [review()]).state, 'failure');
assert.equal(deskGate(pr, [review(), review(old)]).state, 'failure');
assert.equal(deskGate(pr, [review(), { body: 'ordinary comment' }]).state, 'success');
assert.equal(deskGate(pr, [{ body: `Reviewer: Sonnet · Builder: Terra · Head: ${head}` }]).state, 'failure');
assert.equal(deskGate(pr, [review(head + 'a')]).state, 'failure');
assert.equal(deskGate(pr, [review(head, '   ', 'Terra')]).state, 'failure');
assert.equal(deskGate(pr, [review(), { ...review(), body: review().body.replace('Clean.', 'Review (not clean).') }]).state, 'failure');
assert.equal(deskGate(pr, [{ ...review(), author_association: 'NONE' }]).state, 'failure');
assert.equal(deskGate(pr, [review(), { ...review(old), author_association: 'NONE' }]).state, 'success');
assert.equal(deskGate(pr, [{ ...review(), body: review().body.replace('Clean.', `<!-- review-desk: clean ${head} -->`) }]).state, 'success');
assert.equal(deskGate(pr, [{ ...review(), body: review().body.replace('Clean.', `<!-- review-desk: clean ${old} -->`) }]).state, 'failure');
for (const author_association of ['MEMBER', 'COLLABORATOR']) assert.equal(deskGate(pr, [{ ...review(), author_association }]).state, 'success');
for (const heading of ['**Clean.**', '# Clean', '**Review of PR #1192 (clean).**', `**Review of head ${head}: clean.**`, 'Review of PR #1192: clean.']) {
  assert.equal(deskGate(pr, [{ ...review(), body: review().body.replace('Clean.', heading) }]).state, 'success', heading);
}
for (const heading of ['Review of PR #1192 (not clean).', `Review of head ${head}: not clean.`, 'Clean except for one issue.', 'Review of PR #1192: clean except pending CI.', 'Pending clean review']) {
  assert.equal(deskGate(pr, [{ ...review(), body: review().body.replace('Clean.', heading) }]).state, 'failure', heading);
}
// Real desk heading shapes: the verdict begins the first line after the marker.
for (const heading of ['**Review of PR #1202 (clean).** The regression is real: the reviewer replaced the `Mention` renderer with `dangerouslySetInnerHTML` and `chat-text-prove` failed (timeout), then passed when restored.', '**Re-review of PR #1179 (not clean: CI is red on this head).** The earlier should-fix is fixed: every cache key now hashes `package.json`, `package-lock.json`, `server/package.json` and `server/package-lock.json`.']) {
  const result = deskGate(pr, [{ ...review(), body: review().body.replace('Clean.', heading) }]);
  assert.equal(result.state, heading.includes('(clean)') ? 'success' : 'failure', heading);
}
assert.equal(deskGate(pr, [{ ...review(), body: review().body.replace('Clean.', 'Pending review.\n**Review of PR #1202 (clean).** Later text') }]).state, 'failure');
for (const author_association of [undefined, 'FIRST_TIME_CONTRIBUTOR']) assert.equal(deskGate(pr, [{ ...review(), author_association }]).state, 'failure');

const requests = [];
const fetchImpl = async (url, options) => {
  requests.push({ url, options });
  let value;
  if (url.endsWith('/pulls/42')) value = pr;
  else if (url.endsWith('comments?per_page=100&page=1')) value = Array.from({ length: 100 }, () => ({ body: 'ordinary' }));
  else if (url.endsWith('comments?per_page=100&page=2')) value = [review()];
  else if (url.endsWith(`/statuses/${head}`)) value = {};
  else throw new Error(`unexpected URL ${url}`);
  return { ok: true, json: async () => value };
};
await run({ event: { issue: { number: 42, pull_request: {} } }, eventName: 'issue_comment', repository: 'o/r', token: 'fixture', fetchImpl });
assert.equal(requests.length, 4);
assert.equal(requests[3].options.method, 'POST');
assert.deepEqual(JSON.parse(requests[3].options.body), { state: 'success', description: 'Different-model desk review matches this head', context: 'desk-gate' });
assert.ok(requests[3].url.endsWith(`/statuses/${head}`));
requests.length = 0;
await run({ event: { issue: { number: 42 } }, eventName: 'issue_comment', repository: 'o/r', token: 'fixture', fetchImpl });
assert.equal(requests.length, 0);
await run({ event: { pull_request: { number: 42 } }, eventName: 'pull_request_target', repository: 'o/r', token: 'fixture', fetchImpl });
assert.equal(requests.length, 4);
console.log('desk-gate-prove: 38 checks passed (decision, trust, verdict, pagination, events and head status)');
