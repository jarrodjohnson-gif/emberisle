// #1180: classification, stale-head suppression, once-per-head delivery, and workflow boundaries.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, reviewOf, routeFor, notifications, wakeLine, mergeLine, watchdog, watchLine, WATCH, MISSING, DAILY_LIMIT, tableFor, updateBody, sweep } from './desk-board.mjs';
const A = 'a'.repeat(40), B = 'b'.repeat(40);
const now = new Date('2026-10-28T03:00:00Z');
const pr = { number: 1, state: 'open', draft: false, head: { sha: A }, changed_files: 1 };
const files = [{ filename: 'src/components/Example.tsx' }];
const green = { name: 'checks', app: { id: 15368 }, head_sha: A, status: 'completed', conclusion: 'success' };
const comment = (body, id = 1) => ({ body, id, created_at: `2026-10-28T0${id}:00:00Z`, author_association: 'OWNER' });
const review = (sha = A, verdict = 'clean') => comment(`<!-- review-desk -->\nReview: ${verdict}. Jarrod must see pictures first.\nReviewer: Sonnet · Builder: Astra · Head: ${sha}`);
const input = { pr, files, checks: [green], comments: [] };
let assertions = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const bucket = changes => classify({ ...input, ...changes }).bucket;
eq(bucket({}), 'Ready for desk');
eq(bucket({ comments: [review(B)] }), 'Ready for desk');
eq(bucket({ comments: [review()] }), 'Ready for Jarrod');
eq(bucket({ checks: [{ ...green, conclusion: 'failure' }] }), 'Red / waiting');
eq(bucket({ comments: [comment('<!-- review-desk -->\nReview: clean.')] }), 'Red / waiting');
eq(bucket({ comments: [review(A, 'not clean')] }), 'Red / waiting');
eq(bucket({ comments: [comment(`<!-- review-desk: clean ${A} -->\nOwner approval pending.`)] }), 'Ready for Jarrod');
eq(bucket({ comments: [comment(`<!-- review-desk -->\nReview: clean.\nHead: ${A}`)] }), 'Ready to merge');
eq(bucket({ comments: [review(), { ...review(A, 'not clean'), id: 2, created_at: '2026-10-28T02:00:00Z' }] }), 'Red / waiting');
eq(bucket({ comments: [{ ...review(), author_association: 'NONE' }] }), 'Ready for desk');
eq(bucket({ comments: [comment('```\n<!-- review-desk -->\nHead: ' + A + '\n```')] }), 'Ready for desk');
eq(reviewOf([comment(`<!-- review-desk: clean ${B} -->\nHead: ${A}`)]).missing, true);
eq(bucket({ checks: [] }), 'Red / waiting');
eq(bucket({ checks: [{ ...green, head_sha: B }] }), 'Red / waiting');
eq(bucket({ checks: [{ ...green, app: { id: 0 } }] }), 'Red / waiting');
eq(bucket({ checks: [green, { ...green, status: 'in_progress', conclusion: null }] }), 'Red / waiting');
eq(bucket({ current: { ...pr, head: { sha: B } } }), 'Red / waiting');
eq(bucket({ current: { ...pr, draft: true } }), 'Red / waiting');
eq(bucket({ current: { ...pr, state: 'closed' } }), 'Red / waiting');
eq(bucket({ files: [] }), 'Red / waiting');
eq(routeFor([{ filename: 'docs/readme.md' }]), 'Haiku');
eq(routeFor(files), 'Sonnet');
for (const filename of ['server/host.mjs', '.github/workflows/ci.yml', 'scripts/tool.mjs', 'src/lib/net/proto.ts', 'src/lib/protocol.ts']) eq(routeFor([{ filename }]), 'Opus');
eq(routeFor([{ filename: 'docs/new.md', previous_filename: 'server/old.mjs' }]), 'Opus');
eq(routeFor([{ filename: 'docs/a.md' }, ...files]), 'Sonnet');
const ready = classify(input);
eq(notifications([ready], [], now), [wakeLine(ready)]);
eq(notifications([ready], [comment(wakeLine(ready))], now), []);
eq(notifications([{ ...ready, sha: B }], [comment(wakeLine(ready))], now), [wakeLine({ ...ready, sha: B })]);
eq(notifications([{ ...ready, bucket: 'Red / waiting' }], [], now), []);
const missing = { ...ready, missing: true, bucket: 'Red / waiting' };
eq(notifications([missing, { ...missing, number: 2 }], [], now), [MISSING]);
eq(notifications([missing], [comment(MISSING)], now), []);
const today = Array.from({ length: DAILY_LIMIT }, (_, i) => ({ ...comment(`review-desk: PR #${i + 100} green on ${B}, unreviewed`), created_at: now.toISOString() }));
eq(notifications([ready, missing], today, now), []);
eq(notifications([ready, missing], today.slice(1), now), [MISSING]);
eq(notifications([ready], today.map(c => ({ ...c, created_at: '2026-10-27T03:00:00Z' })), now), [wakeLine(ready)]);
eq(notifications([ready], [{ ...comment(wakeLine(ready)), author_association: 'NONE' }], now), [wakeLine(ready)]);
const table = tableFor([ready], now);
eq(updateBody('Human notes\n', table), `Human notes\n\n${table}\n`);
eq(updateBody(`before\n${table}\nafter`, 'replacement'), 'before\nreplacement\nafter');
assert.throws(() => updateBody('<!-- desk-board:start -->', table)); assertions++;

// Stateful API fixture: observe actual writes on repeat sweeps and a changed head.
function fixture({ moved = false, failedPost = false, many = false, reviewComments = [], startBody = 'Desk notes must survive.' } = {}) {
  let head = A, body = startBody, readCount = 0;
  const inbox = [], writes = [], pageReads = [], inboxReads = [];
  const api = async (path, method = 'GET', payload) => {
    const url = new URL('https://example.test' + path), page = Number(url.searchParams.get('page') ?? 1), p = url.pathname;
    if (method !== 'GET') {
      writes.push({ p, method, payload });
      if (method === 'POST') {
        if (failedPost) throw new Error('post failed');
        inbox.push({ ...comment(payload.body), created_at: now.toISOString() });
      } else body = payload.body;
      return {};
    }
    if (p === '/pulls') return page === 1 ? [pr] : [];
    if (p === '/pulls/1') {
      readCount++;
      return { ...pr, head: { sha: moved && readCount >= 3 ? B : head } };
    }
    if (p === '/pulls/1/files') return files;
    if (p === '/issues/1/comments') {
      pageReads.push(page);
      return many && page === 1 ? Array.from({ length: 100 }, (_, i) => comment(`ordinary ${i}`)) : reviewComments;
    }
    if (p.startsWith('/commits/')) return { check_runs: [{ ...green, head_sha: head }] };
    if (p === '/issues/699/comments') {
      inboxReads.push(url.searchParams.get('since'));
      return inbox.slice((page - 1) * 100, page * 100);
    }
    if (p === '/issues/916') return { body };
    throw new Error('unexpected API: ' + path);
  };
  return { api, writes, inbox, pageReads, inboxReads, changeHead: () => { head = B; }, body: () => body };
}
const f = fixture({ many: true });
await sweep(f.api, { now });
eq(f.inbox.length, 1);
eq(f.body().startsWith('Desk notes must survive.'), true);
eq(f.pageReads.includes(2), true);
await sweep(f.api, { now });
eq(f.inbox.length, 1); // Green -> green never wakes twice.
f.changeHead();
await sweep(f.api, { now });
eq(f.inbox.length, 2); // A new green SHA transitions back to ready exactly once.
await sweep(f.api, { now });
eq(f.inbox.length, 2);
const moved = fixture({ moved: true });
await sweep(moved.api, { now });
eq(moved.inbox.length, 0);
eq(moved.body().includes('head moved or PR not ready'), true);
const dry = fixture();
await sweep(dry.api, { now, dryRun: true });
eq(dry.writes, []);
const failed = fixture({ failedPost: true });
await assert.rejects(sweep(failed.api, { now }), /post failed/); assertions++;
eq(failed.writes.some(w => w.method === 'PATCH'), false); // Failed delivery stays retryable.
// Regression controls for the desk's 2026-10-28 review.
const note = comment('<!-- review-desk -->\nTo Gemini: keep working; no review verdict here.', 2);
eq(bucket({ comments: [review(B), note] }), 'Ready for desk');
eq(bucket({ comments: [note] }), 'Ready for desk');
eq(bucket({ comments: [review(), note] }), 'Ready for Jarrod');
eq(reviewOf([note]).missing, false);
eq(reviewOf([comment('<!-- review-desk -->\n**Review of PR #1 (clean).**')]).missing, true);
eq(notifications([missing], [{ ...comment(MISSING), created_at: '2026-10-27T03:00:00Z' }], now), [MISSING]);
eq(notifications([missing], [{ ...comment(MISSING), created_at: now.toISOString() }], now), []);
eq(reviewOf([comment(`<!-- review-desk -->\nReview: clean.\nOwner token details are recorded.\nHead: ${A}`)]).visual, false);
eq(reviewOf([comment(`<!-- review-desk -->\nReview: clean.\nOwner look details are recorded.\nHead: ${A}`)]).visual, false);
eq(reviewOf([comment(`<!-- review-desk -->\nReview: clean.\nOwner OK required.\nHead: ${A}`)]).visual, true);
const noteSweep = fixture({ reviewComments: [review(B), note] });
await sweep(noteSweep.api, { now });
eq(noteSweep.inbox.map(c => c.body), [wakeLine(ready)]);
await sweep(noteSweep.api, { now });
eq(noteSweep.inbox.length, 1);
eq(noteSweep.body().includes('Ready for desk'), true);
for (const condition of ['except one should-fix', 'pending fixes', 'if the bug is fixed', 'after the follow-up']) {
  eq(bucket({ comments: [comment(`<!-- review-desk -->\nReview of head ${A}: clean ${condition}.\nOwner pictures pending.\nHead: ${A}`)] }), 'Red / waiting');
}
eq(f.inboxReads.includes('2026-10-28T00:00:00Z'), true);
const relayToday = today.map(c => ({ ...c, body: 'review-desk: comment on #854 by builder: https://example.test/comment' }));
eq(notifications([ready, missing], relayToday, now), []);
// #1584: DESK.md's "Clean." verdict, and a ready-to-merge wake once per head.
const deskReview = (verdict, extra = 'Docs only.', sha = A) => comment(`<!-- review-desk -->\n\n${verdict}\n\n${extra}\n\nReviewer: Sonnet 5.5 · Builder: Opus 5.5 · Head: ${sha}`);
eq(reviewOf([deskReview('Clean.')]).clean, true);
eq(reviewOf([deskReview('Not clean.')]).clean, false);
eq(reviewOf([deskReview('Clean, except the proof.')]).clean, false);
eq(bucket({ comments: [deskReview('Clean.')] }), 'Ready to merge');
eq(bucket({ comments: [deskReview('Not clean.')] }), 'Red / waiting');
eq(bucket({ comments: [deskReview('Clean.', 'Jarrod must see pictures first.')] }), 'Ready for Jarrod');
eq(bucket({ comments: [deskReview('Clean.', 'Docs only.', B)] }), 'Ready for desk');
eq(bucket({ comments: [deskReview('Clean.')], checks: [{ ...green, status: 'in_progress', conclusion: null }] }), 'Red / waiting');
const mergeable = classify({ ...input, comments: [deskReview('Clean.')] });
eq(notifications([mergeable], [], now), [mergeLine(mergeable)]);
eq(notifications([mergeable], [comment(mergeLine(mergeable))], now), []);
eq(notifications([classify({ ...input, comments: [deskReview('Clean.', 'Jarrod must see pictures first.')] })], [], now), []);
const mergeSweep = fixture({ reviewComments: [deskReview('Clean.')] });
await sweep(mergeSweep.api, { now });
eq(mergeSweep.inbox.map(c => c.body), [mergeLine(mergeable)]);
await sweep(mergeSweep.api, { now });
eq(mergeSweep.inbox.length, 1);
eq(mergeSweep.body().includes('Ready to merge'), true);
// Watchdog: a stale desk, a missing rotation or an overdue one raises one alert per UTC day.
const ledger = lines => `notes\n<!-- desk-ledger:start -->\n## Desk ledger\n${lines.join('\n')}\n<!-- desk-ledger:end -->\n`;
eq(watchdog('no ledger here', now), null);
eq(watchdog(ledger(['Desk: s1 (Opus 5.5), since 2026-10-27 00:00 UTC', 'Next rotation: t1, due 2026-10-28T12:43Z']), now), 'the desk has run for more than 26 hours');
eq(watchdog(ledger(['Desk: s1 (Opus 5.5), since 2026-10-28 01:00 UTC']), now), 'no next rotation is set');
eq(watchdog(ledger(['Desk: s1 (Opus 5.5), since 2026-10-28 01:00 UTC', 'Next rotation: none']), now), 'no next rotation is set');
eq(watchdog(ledger(['Desk: s1 (Opus 5.5), since 2026-10-28 01:00 UTC', 'Next rotation: t1, due 2026-10-28T12:43Z']), now), null);
eq(watchdog(ledger(['Desk: s1 (Opus 5.5), since 2026-10-28 01:00 UTC', 'Next rotation: t1, due 2026-10-28T01:30Z']), now), 'the next rotation is overdue');
eq(watchdog(ledger(['Desk: s1 (Opus 5.5), since 2026-10-28 01:00 UTC', 'Next rotation: t1, due 2026-10-28T02:30Z']), now), null);
// The live ledger's spaced form: "due YYYY-MM-DD HH:MM UTC".
eq(watchdog(ledger(['Desk: s1 (Opus 5.5), since 2026-10-28 01:00 UTC', 'Next rotation: trig_1, due 2026-10-28 12:43 UTC']), now), null);
eq(watchdog(ledger(['Desk: s1 (Opus 5.5), since 2026-10-28 01:00 UTC', 'Next rotation: trig_1, due 2026-10-28 01:30 UTC']), now), 'the next rotation is overdue');
eq(notifications([], [], now, 'no next rotation is set'), [watchLine('no next rotation is set')]);
eq(notifications([], [comment(watchLine('no next rotation is set'))].map(c => ({ ...c, created_at: now.toISOString() })), now, 'the next rotation is overdue'), []);
eq(notifications([], [comment(watchLine('x'))].map(c => ({ ...c, created_at: '2026-10-27T03:00:00Z' })), now, 'x'), [watchLine('x')]);
eq(watchLine('x').startsWith(WATCH), true);
const staleBody = ledger(['Desk: s1 (Sonnet 5.5), since 2026-10-20 02:20 UTC']);
const watchSweep = fixture({ startBody: staleBody });
await sweep(watchSweep.api, { now });
eq(watchSweep.inbox.map(c => c.body).includes(watchLine('the desk has run for more than 26 hours')), true);
eq(watchSweep.body().includes('watchdog: ALERT: the desk has run for more than 26 hours'), true);
eq(watchSweep.body().startsWith('notes\n<!-- desk-ledger:start -->'), true);
const alerts = () => watchSweep.inbox.filter(c => c.body.startsWith(WATCH)).length;
await sweep(watchSweep.api, { now });
eq(alerts(), 1);
eq(fixture().body().includes('watchdog'), false);
const workflow = readFileSync('.github/workflows/desk-board.yml', 'utf8');
for (const required of ['workflows: [CI]', 'types: [completed]', 'types: [ready_for_review]', "cron: '17 0,8,16 * * *'", 'group: desk-board', 'cancel-in-progress: true', 'ref: ${{ github.event.repository.default_branch }}', 'persist-credentials: false', 'sparse-checkout: scripts/desk-board.mjs', 'sparse-checkout-cone-mode: false', 'issues: write']) {
  eq(workflow.includes(required), true);
}
// #1215: /issues/699/comments targets the inbox PR, so its token needs PR write.
eq(/^  pull-requests: write$/m.test(workflow), true);
eq(/pull_request:\s|secrets\.|npm (?:ci|install)|download-artifact/.test(workflow), false);
console.log(`desk-board-prove: ${assertions} assertions passed; classification, routes, pagination, head races, deduplication, daily cap, body preservation, workflow trust`);
