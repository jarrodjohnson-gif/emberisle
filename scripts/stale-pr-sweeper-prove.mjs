import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { sweep, activity, decision, githubApi, MAX_CLOSES } from './stale-pr-sweeper.mjs';

const DAY = 86_400_000;
const now = Date.parse('2026-10-20T12:00:00Z');
const sha = 'a'.repeat(40), newer = 'b'.repeat(40);
const repo = 'owner/repo';
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const pr = (number = 1, extra = {}) => ({ number, state: 'open', head: { sha }, labels: [], ...extra });
const marker = (days, extra = {}) => ({ id: 99, user: bot,
  body: `<!-- emberisle:stale-pr-activity ${JSON.stringify({ sha, observedAt: new Date(now - days * DAY).toISOString() })} -->`, ...extra });
let groups = 0;
function ok(name) { groups++; console.log(`ok ${name}`); }
function fake(pulls = [pr()], initial = []) {
  const calls = [], comments = structuredClone(initial);
  let reads = 0;
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    const n = Number(path.match(/\/pulls\/(\d+)$/)?.[1]);
    if (method === 'GET' && path.endsWith('/labels/stale')) {
      if (api.labelError) { const error = new Error('label error'); error.status = api.labelError; throw error; }
      if (api.labelMissing) { const error = new Error('label absent'); error.status = 404; throw error; }
      return { name: 'stale' };
    }
    if (method === 'GET') {
      reads++;
      if (api.onRead) api.onRead(reads, pulls, comments);
      return structuredClone(pulls.find(p => p.number === n));
    }
    if (method === 'POST' && path.endsWith('/comments')) comments.push({ id: comments.length + 100, user: bot, body: body.body });
    if (method === 'PATCH' && path.includes('/issues/comments/')) comments.find(c => c.id === Number(path.split('/').at(-1))).body = body.body;
    if (method === 'POST' && path.endsWith('/labels') && !path.includes('/issues/')) {
      if (api.creationRace) { api.labelMissing = false; const error = new Error('already exists'); error.status = 422; throw error; }
      api.labelMissing = false; return {};
    }
    if (method === 'POST' && path.endsWith('/labels')) pulls.find(p => path.includes(`/issues/${p.number}/`)).labels.push({ name: 'stale' });
    if (method === 'DELETE' && path.endsWith('/labels/stale')) {
      const target = pulls.find(p => path.includes(`/issues/${p.number}/`));
      target.labels = target.labels.filter(label => label.name !== 'stale');
    }
    if (method === 'PATCH' && n) pulls.find(p => p.number === n).state = body.state;
    return {};
  };
  api.list = async path => { calls.push({ method: 'LIST', path }); return structuredClone(path.includes('/comments') ? comments : pulls); };
  return { api, calls, comments, pulls, writes: () => calls.filter(c => !['GET', 'LIST'].includes(c.method)) };
}
async function run(f, more = {}) { await sweep({ api: f.api, enabled: 'on', repo, now, log: () => {}, ...more }); }

for (const enabled of [undefined, '', 'off', 'ON']) {
  const f = fake(); await run(f, { enabled }); assert.equal(f.calls.length, 0);
}
ok('disabled mode makes zero API calls');
const cli = spawnSync(process.execPath, ['scripts/stale-pr-sweeper.mjs'], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
assert.equal(cli.status, 0); assert.match(cli.stdout, /disabled/);
ok('CLI also defaults disabled without token or repository');
for (const p of [pr(699), pr(920), pr(2, { labels: [{ name: 'keep-open' }] }), pr(3, { labels: [{ name: 'KEEP-OPEN' }] }), pr(4, { state: 'closed' })]) {
  const f = fake([p], [marker(100)]); await run(f); assert.equal(f.writes().length, 0);
}
ok('inbox, archive, keep-open and closed PRs stay untouched');
for (const days of [0, 4.999999, 5, 9.999999, 10, 100]) {
  const f = fake([pr(1, { labels: days >= 10 ? [{ name: 'stale' }] : [] })], [marker(days)]); await run(f);
  const writes = f.writes();
  assert.equal(writes.some(c => c.path.endsWith('/labels')), days >= 5 && days < 10);
  assert.equal(writes.some(c => c.body?.state === 'closed'), days >= 10);
  if (days >= 10) { assert.match(writes[0].body.body, /Reopen this PR and push/); assert.match(writes[0].body.body, /branch is preserved/); }
}
ok('exact 5-day label and 10-day close boundaries; close includes reopening instructions');
for (const initial of [[], [marker(50, { user: { login: 'attacker', type: 'User' } })], [marker(50, { user: { login: 'github-actions[bot]', type: 'User' } })], [{ id: 1, user: bot, body: '<!-- emberisle:stale-pr-activity invalid -->' }]]) {
  const f = fake([pr()], initial); await run(f); assert.equal(f.writes().length, 1);
  assert.equal(f.writes()[0].method, 'POST'); assert.equal(activity(f.comments).observedAt, new Date(now).toISOString());
}
ok('missing, forged and malformed markers receive a conservative observation grace');
const absentLabel = fake([pr()], [marker(6)]); absentLabel.api.labelMissing = true;
await run(absentLabel);
assert(absentLabel.writes().some(c => c.path.endsWith('/labels') && c.body?.name === 'stale'));
assert(absentLabel.writes().some(c => c.body?.labels?.includes('stale')));
const dryMissing = fake([pr()], [marker(6)]); dryMissing.api.labelMissing = true;
await run(dryMissing, { dryRun: true }); assert.equal(dryMissing.writes().length, 0);
const labelRace = fake([pr()], [marker(6)]); labelRace.api.labelMissing = true; labelRace.api.creationRace = true;
await run(labelRace); assert(labelRace.pulls[0].labels.some(l => l.name === 'stale'));
for (const status of [403, 500]) {
  const fail = fake([pr()], [marker(6)]); fail.api.labelError = status;
  await assert.rejects(() => run(fail), /label error/); assert.equal(fail.writes().length, 0);
}
ok('missing label creation is gated, handles creation races, and fails closed on 403/5xx');
const changed = fake([pr(1, { head: { sha: newer } })], [marker(50)]); await run(changed);
assert.equal(changed.writes().length, 1); assert.equal(activity(changed.comments).sha, newer);
assert.equal(activity(changed.comments).observedAt, new Date(now).toISOString());
ok('unobserved head changes restart grace instead of closing');
const recentComment = fake([pr(1, { labels: [{ name: 'stale' }], updated_at: new Date(now).toISOString() })], [marker(10), { id: 6, user: { login: 'human' }, body: 'active discussion', created_at: new Date(now).toISOString() }]);
await run(recentComment); assert.equal(recentComment.pulls[0].state, 'closed');
ok('comments and PR updated_at never reset push age');
const already = fake([pr(1, { labels: [{ name: 'stale' }] })], [marker(6)]); await run(already); assert.equal(already.writes().length, 0);
ok('stale labels are idempotent');
for (const action of ['opened', 'synchronize', 'reopened']) {
  const f = fake([pr(1, { labels: [{ name: 'stale' }] })], [marker(10)]);
  await run(f, { event: { action, pull_request: { number: 1, head: { sha }, updated_at: new Date(now).toISOString() } } });
  assert.equal(activity(f.comments).observedAt, new Date(now).toISOString());
  assert(!f.pulls[0].labels.some(label => label.name === 'stale'));
  assert(f.writes().some(call => call.method === 'DELETE' && call.path.endsWith('/labels/stale')));
  await run(f); assert.equal(f.pulls[0].state, 'open');
}
ok('push events refresh activity, even when pushing an old or identical commit SHA');
for (const extra of [{ head: { sha: newer }, updated_at: new Date(now).toISOString() }, { head: { sha }, updated_at: new Date(now - 11 * DAY).toISOString() }]) {
  const f = fake([pr()], [marker(2)]);
  await run(f, { event: { action: 'synchronize', pull_request: { number: 1, ...extra } } });
  assert.equal(f.writes().length, 0);
}
ok('delayed events cannot overwrite newer heads or timestamps');
for (const alteration of ['head', 'keep', 'closed', 'marker']) {
  const f = fake([pr()], [marker(10)]);
  f.api.onRead = (n, pulls, comments) => {
    if (n !== 2) return;
    if (alteration === 'head') pulls[0].head.sha = newer;
    if (alteration === 'keep') pulls[0].labels.push({ name: 'keep-open' });
    if (alteration === 'closed') pulls[0].state = 'closed';
    if (alteration === 'marker') comments[0] = marker(0);
  };
  await run(f); assert.equal(f.writes().length, 0);
}
ok('fresh head, keep-open, state and push-marker checks protect every mutation');
const closingRace = fake([pr(1, { labels: [{ name: 'stale' }] })], [marker(10)]);
closingRace.api.onRead = (n, pulls) => { if (n === 3) pulls[0].labels.push({ name: 'keep-open' }); };
await run(closingRace); assert.equal(closingRace.pulls[0].state, 'open');
assert.equal(closingRace.writes().length, 1);
ok('rechecks eligibility between explanatory comment and close');
const repeat = fake([pr(1, { labels: [{ name: 'stale' }] })], [marker(10)]); await run(repeat);
repeat.pulls[0].state = 'open'; await run(repeat);
assert.equal(repeat.comments.filter(c => c.body.includes('stale-pr-close')).length, 1);
ok('retry does not duplicate the same head close explanation');
assert.equal(decision(pr(), { sha, observedAt: new Date(now + DAY).toISOString() }, now), 'skip');
ok('future clock values fail closed');
for (const days of [0, 6, 11]) {
  const f = fake([pr(1, { labels: days === 11 ? [{ name: 'stale' }] : [] })], days ? [marker(days)] : []), logs = [];
  await run(f, { dryRun: true, log: line => logs.push(line) });
  assert.equal(f.writes().length, 0);
  assert(logs.some(line => line.includes(days === 6 ? 'would label' : days === 11 ? 'would close' : 'would record')));
}
const dryEvent = fake([pr(1, { labels: [{ name: 'stale' }] })], [marker(10)]);
await run(dryEvent, { dryRun: true, event: { action: 'synchronize', pull_request: { number: 1, head: { sha }, updated_at: new Date(now).toISOString() } } });
assert.equal(dryEvent.writes().length, 0);
ok('dry-run logs fixture label/close/initialization decisions and never mutates, including events');
for (const dryRun of [false, true]) {
  const many = fake(Array.from({ length: 7 }, (_, i) => pr(i + 1, { labels: [{ name: 'stale' }] })), [marker(11)]), logs = [];
  await run(many, { dryRun, log: line => logs.push(line) });
  assert.equal(many.pulls.filter(p => p.state === 'closed').length, dryRun ? 0 : MAX_CLOSES);
  assert.equal(logs.filter(line => line.includes('deferred close; run cap 5 reached')).length, 2);
  assert.equal(logs.filter(line => line.includes(dryRun ? 'would close' : 'closed; branch')).length, 5);
  assert(!many.writes().some(c => /\/(issues|pulls)\/[67](?:\/|$)/.test(c.path)));
}
ok('A2: live and dry-run sweeps cap closes at five and defer without commenting on the remainder');
const unwarned = fake([pr()], [marker(30)]); await run(unwarned);
assert.equal(unwarned.pulls[0].state, 'open');
assert(unwarned.pulls[0].labels.some(label => label.name === 'stale'));
assert(!unwarned.writes().some(c => c.path.endsWith('/comments') || c.body?.state === 'closed'));
await run(unwarned); assert.equal(unwarned.pulls[0].state, 'closed');
ok('A3: even a thirty-day-old PR receives a stale warning before a later sweep can close it');
const reopened = fake([pr(1, { labels: [{ name: 'stale' }] })], [marker(30)]);
const reopenEvent = { action: 'reopened', pull_request: { number: 1, head: { sha }, updated_at: new Date(now).toISOString() } };
await run(reopened, { event: reopenEvent }); await run(reopened);
assert.equal(reopened.pulls[0].state, 'open');
assert(!reopened.pulls[0].labels.some(label => label.name === 'stale'));
await run(reopened, { now: now + 5 * DAY });
assert(reopened.pulls[0].labels.some(label => label.name === 'stale'));
assert.equal(reopened.pulls[0].state, 'open');
ok('A1/A4: same-SHA reopen removes stale and starts a new full warning cycle');
const retryCleanup = fake([pr(1, { labels: [{ name: 'stale' }] })], [marker(0)]);
await run(retryCleanup, { event: reopenEvent });
assert(!retryCleanup.pulls[0].labels.some(label => label.name === 'stale'));
const lateDuplicate = fake([pr(1, { labels: [{ name: 'stale' }] })], [marker(6)]);
await run(lateDuplicate, { event: { ...reopenEvent, pull_request: { ...reopenEvent.pull_request, updated_at: new Date(now - 6 * DAY).toISOString() } } });
assert.equal(lateDuplicate.writes().length, 0);
ok('A4: a recent event retry completes label cleanup without erasing a later cycle warning');
const urls = [];
const api = githubApi('fake-token', async (url, opts) => {
  urls.push({ url, opts });
  return { ok: true, json: async () => url.endsWith('page=1') ? Array.from({ length: 100 }, (_, number) => ({ number })) : [{ number: 100 }] };
});
assert.equal((await api.list('/repos/owner/repo/pulls?state=open')).length, 101);
assert.match(urls[0].url, /state=open&per_page=100&page=1$/); assert.equal(urls.length, 2);
const broken = githubApi('fake-token', async () => ({ ok: false, status: 403 }));
await assert.rejects(() => broken('GET', '/repos/owner/repo/pulls'), /HTTP 403/);
ok('REST adapter paginates and fails closed on API errors, entirely offline');
for (const f of [changed, recentComment, already, closingRace, repeat]) {
  assert(!f.calls.some(c => c.method === 'DELETE' || c.path.includes('/git/refs')));
}
const workflow = await readFile('.github/workflows/stale-pr-sweeper.yml', 'utf8');
assert.match(workflow, /if: vars\.STALE_PR_SWEEPER == 'on'/);
assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
assert.match(workflow, /persist-credentials: false/);
assert(!workflow.includes('contents: write')); assert(!workflow.includes('github.event.pull_request.head'));
assert.match(workflow, /types: \[opened, synchronize, reopened\]/);
assert(workflow.includes("group: stale-pr-sweeper-${{ github.event.pull_request.number || 'sweep' }}"));
ok('A1: each PR event has a separate concurrency group from other PRs and the scheduled sweep');
const probe = workflow.match(/node --input-type=module <<'JS'\n([\s\S]*?)\n          JS/)[1].replace(/^          /gm, '');
for (const scenario of ['success', 'existing', 'wrong-sha', 'wrong-branch', 'wrong-repo', 'failure']) {
  const fixture = `
    import assert from 'node:assert/strict';
    const scenario = ${JSON.stringify(scenario)};
    const labels = new Set(scenario === 'existing' ? ['original', 'stale'] : ['original']);
    const definitions = new Set(); const mutations = [];
    process.env.GITHUB_REPOSITORY = 'owner/repo'; process.env.TARGET_PR = '23';
    process.env.GITHUB_REF_NAME = 'codex/fixture'; process.env.GITHUB_SHA = '${sha}';
    globalThis.fetch = async (url, options) => {
      const path = new URL(url).pathname; const method = options.method;
      assert(path.startsWith('/repos/owner/repo/'));
      const body = options.body ? JSON.parse(options.body) : {};
      if (method !== 'GET') mutations.push({ method, path, body });
      if (method === 'GET' && path.endsWith('/pulls/23')) return { ok: true, json: async () => ({
        state: 'open', labels: [...labels].map(name => ({ name })), head: {
          sha: scenario === 'wrong-sha' ? '${newer}' : '${sha}',
          ref: scenario === 'wrong-branch' ? 'main' : 'codex/fixture',
          repo: { full_name: scenario === 'wrong-repo' ? 'other/repo' : 'owner/repo' },
        } }) };
      if (path.includes('/labels/') && method === 'GET') return { ok: definitions.has(path.split('/').at(-1)), status: 404, json: async () => ({}) };
      if (path.endsWith('/repos/owner/repo/labels') && method === 'POST') definitions.add(body.name);
      else if (method === 'POST' && path.endsWith('/issues/23/labels')) {
        if (scenario === 'failure' && body.labels[0] === 'keep-open') return { ok: false, status: 403 };
        body.labels.forEach(name => labels.add(name));
      } else if (method === 'DELETE' && path.includes('/issues/23/labels/')) labels.delete(path.split('/').at(-1));
      else if (method !== 'GET') throw new Error('Unexpected mutation: ' + method + path);
      return { ok: true, status: method === 'DELETE' ? 204 : 200, json: async () => ({}) };
    };
    let caught = null;
    try { ${probe} } catch (error) { caught = error; }
    if (scenario.startsWith('wrong-')) { assert(caught); assert.equal(mutations.length, 0); }
    else {
      assert.equal(Boolean(caught), scenario === 'failure');
      assert.deepEqual([...labels].sort(), scenario === 'existing' ? ['original', 'stale'] : ['original']);
      assert(!mutations.some(m => m.path.includes('/pulls/') || m.path.includes('/git/refs')));
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', fixture], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${scenario}: ${result.stderr}`);
}
ok('B1: actual inline permission probe validates target identity, applies/restores labels, and cleans up after failure');
const empty = githubApi('fake-token', async () => ({ ok: true, status: 204, json: () => { throw new Error('204 must not parse JSON'); } }));
assert.equal(await empty('DELETE', '/repos/owner/repo/issues/1/labels/stale'), null);
ok('DELETE label responses support HTTP 204 without attempting JSON parsing');
ok('workflow stays owner-gated, default-branch-only, with no branch deletion permissions');
console.log(`stale-pr-sweeper-prove: PASS ${groups} groups (offline)`);
