#!/usr/bin/env node
// Runs scripts/next-up.mjs against GraphQL/REST fixtures through a fake fetch. No network or dependencies.
//   node scripts/next-up-prove.mjs           check
//   node scripts/next-up-prove.mjs --update  rewrite expected-body.md after a deliberate change
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { activeClaims, cell, run, TITLE, LABEL } from './next-up.mjs';

const dir = new URL('./fixtures/next-up/', import.meta.url);
const json = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const issues = json('issues.json');
const moreComments = json('more-comments.json');
const pulls = json('pulls.json');
const states = json('states.json');
const repository = 'jarrodjohnson-gif/emberisle';
const now = new Date('2026-10-19T12:34:56Z');

function fakeGitHub({ pinned = [], labelExists = true, dropLabel = false } = {}) {
  const calls = [];
  const reply = (status, data) => ({ ok: status < 300, status, json: async () => data });
  const fetchImpl = async (url, init) => {
    const path = url.replace('https://api.github.com', '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    assert.equal(init.headers.authorization, 'Bearer test-token');
    calls.push([init.method, path, body]);
    if (path === '/graphql') {
      const { query, variables } = body;
      if (query.includes('issues(first: 100')) {
        assert.deepEqual(variables.labels, ['status:todo', 'status:claimed', 'status:in-progress', 'status:in-review']);
        // Two pages, to prove the issue cursor is followed.
        const first = !variables.after;
        const nodes = first ? issues.slice(0, 8) : issues.slice(8);
        return reply(200, { data: { repository: { issues: {
          pageInfo: { hasNextPage: first, endCursor: first ? 'ISSUES_2' : null }, nodes } } } });
      }
      if (query.includes('node(id: $id)')) {
        const page = moreComments[`${variables.id}:${variables.after}`];
        assert.ok(page, `unexpected comment page ${variables.id}:${variables.after}`);
        return reply(200, { data: { node: { comments: page } } });
      }
      if (query.includes('pullRequests(first: 100')) return reply(200, { data: { repository: { pullRequests: { nodes: pulls } } } });
      if (query.includes('issueOrPullRequest')) {
        const repo = {};
        const errors = [];
        for (const [, n] of query.matchAll(/r(\d+): issueOrPullRequest\(number: \1\)/g)) {
          if (states[n]) repo[`r${n}`] = { state: states[n] };
          else { repo[`r${n}`] = null; errors.push({ type: 'NOT_FOUND', message: `no #${n}` }); }
        }
        return reply(200, { data: { repository: repo }, errors });
      }
      throw new Error(`unexpected query ${query}`);
    }
    if (init.method === 'GET' && path === `/repos/${repository}/issues?labels=${LABEL}&state=open&per_page=10`) return reply(200, pinned);
    if (init.method === 'GET' && path === `/repos/${repository}/labels/${LABEL}`) {
      return labelExists ? reply(200, { name: LABEL }) : reply(404, { message: 'Not Found' });
    }
    if (init.method === 'POST' && path === `/repos/${repository}/labels`) return reply(201, { name: LABEL });
    if (init.method === 'POST' && path === `/repos/${repository}/issues`) {
      return reply(201, { number: 900, labels: dropLabel ? [] : body.labels.map(name => ({ name })) });
    }
    if (init.method === 'PATCH' && /^\/repos\/[^/]+\/[^/]+\/issues\/\d+$/.test(path)) return reply(200, {});
    throw new Error(`unexpected ${init.method} ${path}`);
  };
  return { calls, fetchImpl, writes: () => calls.filter(([m, p]) => m !== 'GET' && p !== '/graphql') };
}

const quiet = () => {};
const go = (gh, extra = {}) => run({ fetchImpl: gh.fetchImpl, token: 'test-token', repository, now, log: quiet, ...extra });

// Dry run: reads only, writes nothing.
const dry = fakeGitHub();
const { body } = await go(dry, { dryRun: true });
assert.deepEqual(dry.writes(), []);
assert.ok(dry.calls.every(([m, p]) => p === '/graphql' && m === 'POST'), 'dry run makes only GraphQL reads');
const expectedUrl = new URL('expected-body.md', dir);
if (process.argv.includes('--update')) writeFileSync(expectedUrl, body);
assert.equal(body, readFileSync(expectedUrl, 'utf8'), 'body matches fixtures/next-up/expected-body.md');

const lines = body.split('\n');
const section = name => {
  const start = lines.findIndex(l => l.startsWith(`## ${name}`));
  const rows = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) if (/^\| #?\d|^\| (p\d|-) /.test(lines[i])) rows.push(lines[i]);
  return rows;
};
const num = row => Number(row.match(/#(\d+)/)[1]);
const eligible = section('Eligible').map(num);
const taken = new Map(section('Taken').map(r => [num(r), r]));
assert.ok(body.startsWith('Updated 2026-10-19 12:34 UTC'), 'timestamp first');

// Priority, then milestone (by its number, none last), then issue number.
assert.deepEqual(eligible, [101, 112, 103, 107, 108, 115, 109, 110, 111]);
assert.equal(eligible[0], 101, 'top line is the highest-priority free issue');

// A claimed issue, with the claim on the second comment page and a comma in the agent name.
assert.match(taken.get(102), /\| claim \| alpha, with comma \| - \|$/);
// A claim released by the same agent's later (historical, no /paused) pause, compared case-insensitively.
assert.ok(eligible.includes(103) && !taken.has(103));
// A loser's pause, posted from another account, releases only the loser.
assert.match(taken.get(106), /\| claim \| gamma-agent \| - \|$/);
// An open draft PR mentioning the issue; its body claim names the claimant.
assert.match(taken.get(104), /\| open PR \| helper-x \| #201 \|$/);
// #1160, #1010, &#108; and other/repo#109 are not mentions of 116, 101, 108 or 109.
for (const n of [101, 108, 109, 116]) assert.ok(!taken.get(n)?.includes('#203'), `#${n} not matched by PR #203`);
// An open dependency drops the issue; a closed one (linked form) does not.
assert.ok(!eligible.includes(105) && !taken.has(105));
assert.ok(eligible.includes(107));
// Taken by status label alone.
assert.match(taken.get(113), /\| status:in-progress \| - \| - \|$/);
// No lane label: not ready, listed nowhere.
assert.ok(!body.includes('#114'));
// A claim whose bound PR merged is released; one whose PR is still open is not.
assert.ok(eligible.includes(115));
assert.match(taken.get(116), /\| claim \| zeta-agent \| - \|$/);
// Quoted and placeholder claim lines are not claims.
assert.deepEqual(activeClaims([
  { id: 1, createdAt: '2026-10-18T10:00:00Z', login: 'a', body: '> claimed: q, 2026-10-18' },
  { id: 2, createdAt: '2026-10-18T10:01:00Z', login: 'a', body: 'claimed: <agent name>, <YYYY-MM-DD>' },
]), []);

// A pipe in a title or files cell cannot add a column, and HTML in a title cannot hide the table.
const pipeRow = lines.find(l => l.includes('#108'));
assert.equal(pipeRow.split(/(?<!\\)\|/).length - 2, 7, 'still seven cells');
assert.ok(pipeRow.includes('Fix a \\| b &lt;!-- hidden --> pipe'));
assert.ok(pipeRow.includes('`src/a\\|b.ts`'));
assert.equal(cell('a\\|b'), 'a\\\\\\|b');
assert.equal(cell(' line\none '), 'line one');

// Existing pinned issue: exactly one write, its body.
const existing = fakeGitHub({ pinned: [{ number: 905 }, { number: 777, pull_request: {} }, { number: 903 }] });
await go(existing);
assert.deepEqual(existing.writes(), [['PATCH', `/repos/${repository}/issues/903`, { body }]]);

// No pinned issue and no label: create the label, then the issue once, with the label.
const fresh = fakeGitHub({ labelExists: false });
const result = await go(fresh);
assert.equal(result.created, true);
assert.deepEqual(fresh.writes(), [
  ['POST', `/repos/${repository}/labels`, { name: LABEL, color: 'ededed', description: 'The issue the next-up workflow rewrites' }],
  ['POST', `/repos/${repository}/issues`, { title: TITLE, body, labels: [LABEL] }],
]);

// If the label didn't stick, fail loudly rather than create a duplicate every run.
await assert.rejects(go(fakeGitHub({ dropLabel: true })), /without the next-up label/);

// The workflow keeps its least-privilege shape.
const workflow = readFileSync(new URL('../.github/workflows/next-up.yml', import.meta.url), 'utf8');
assert.match(workflow, /permissions:\n  contents: read\n  issues: write\n  pull-requests: read\n\n/);
assert.match(workflow, /concurrency:\n  group: next-up\n/);
assert.match(workflow, /cron: '\*\/15 \* \* \* \*'/);
assert.ok(!workflow.includes('github.event.pull_request.head'), 'never checks out PR code');

console.log(`next-up-prove: ok (${eligible.length} eligible, ${taken.size} taken)`);
