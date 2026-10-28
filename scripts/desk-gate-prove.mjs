import assert from 'node:assert/strict';
import { deskGate, run } from './desk-gate.mjs';

const head = 'a'.repeat(40), old = 'b'.repeat(40);
const pr = { number: 42, state: 'open', draft: false, head: { sha: head } };
const review = (sha = head, reviewer = 'Sonnet 5.5', builder = 'GPT-6.1 Terra') => ({ body: `<!-- review-desk -->\nClean.\nReviewer: ${reviewer} · Builder: ${builder} · Head: ${sha}` });
assert.equal(deskGate(pr, [review()]).state, 'success');
assert.equal(deskGate(pr, [review(old)]).state, 'failure');
assert.equal(deskGate(pr, [review(head, 'Terra', 'terra')]).state, 'failure');
assert.equal(deskGate(pr, [{ body: '<!-- review-desk -->\nClean' }]).state, 'failure');
assert.equal(deskGate({ ...pr, draft: true }, [review()]).state, 'failure');
assert.equal(deskGate(pr, [review(), review(old)]).state, 'failure');
assert.equal(deskGate(pr, [review(), { body: 'ordinary comment' }]).state, 'success');
assert.equal(deskGate(pr, [{ body: `Reviewer: Sonnet · Builder: Terra · Head: ${head}` }]).state, 'failure');
assert.equal(deskGate(pr, [review(head + 'a')]).state, 'failure');

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
console.log('desk-gate-prove: 15 checks passed (decision, pagination, events and head status)');
