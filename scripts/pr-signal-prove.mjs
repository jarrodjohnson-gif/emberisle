#!/usr/bin/env node
// Fixture proof for scripts/pr-signal.mjs and its workflow. No network.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as real from './pr-signal.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40);
const green = { name: 'checks', app: { id: 15368 }, head_sha: A, status: 'completed', conclusion: 'success' };
const loosen = { ...green, name: 'loosen' };
// The clerk's comment carrying his answer: owner-ok counts only with its marker for the head.
const okFor = (sha = A) => ({ id: 2, created_at: '2026-11-21T02:00:00Z', author_association: 'OWNER', body: `Owner answer (Desk page, 2026-11-21T02:00:00Z): A: ship it\n<!-- owner-ok: ${sha} -->` });
const review = (sha = A, clean = true, extra = '') => ({ id: 1, created_at: '2026-11-21T01:00:00Z', author_association: 'OWNER',
  body: `<!-- review-desk -->\n${clean ? `Clean.\n<!-- review-desk: clean ${sha} -->` : 'Blocking: src/a.ts:3'}\n${extra}\nReviewer: Opus 5.5 · Builder: Sonnet 5.5 · Head: ${sha}` });

// One open PR; each case changes one thing. `want` is the label it must end with.
const CASES = [
  ['green checks, clean review at the head', {}, 'signal:green'],
  ['no review yet', { comments: [] }, 'signal:yellow'],
  ['review of an older head', { comments: [review(B)] }, 'signal:yellow'],
  ['review with findings', { comments: [review(A, false)] }, 'signal:yellow'],
  ['checks red', { checks: [{ ...green, conclusion: 'failure' }] }, 'signal:yellow'],
  ['checks still running', { checks: [{ ...green, status: 'in_progress', conclusion: null }] }, 'signal:yellow'],
  ['no checks', { checks: [] }, 'signal:yellow'],
  ['needs-owner on a clean, green PR', { labels: ['needs-owner'] }, 'signal:red'],
  ['needs-owner on a PR still building', { labels: ['needs-owner'], comments: [] }, 'signal:red'],
  ['needs-owner and owner-ok', { labels: ['needs-owner', 'owner-ok'], comments: [review(), okFor()] }, 'signal:green'],
  ['owner-ok never makes an unreviewed PR green', { labels: ['needs-owner', 'owner-ok'], comments: [okFor()] }, 'signal:yellow'],
  ['the review asks for the owner to see pictures', { comments: [review(A, true, 'Jarrod must see the pictures first.')] }, 'signal:red'],
  ['the same, after owner-ok', { comments: [review(A, true, 'Jarrod must see the pictures first.'), okFor()], labels: ['owner-ok'] }, 'signal:green'],
  // #1860 item 13: a PR auto-merge will take is green, whatever desk-board's wider wording test says.
  ['a clean review that says no owner approval is needed', { comments: [review(A, true, 'No owner approval needed.')] }, 'signal:green'],
  ['a clean review that says the owner already approved', { comments: [review(A, true, 'Jarrod approved this look already.')] }, 'signal:green'],
  ['the code switch is off and the review says no owner approval is needed: not his to answer', { code: false, comments: [review(A, true, 'No owner approval needed.')] }, 'signal:yellow'],
  ['a clean review with an ask, and findings to fix as well', { comments: [review(A, false, 'Jarrod must see the pictures first.')] }, 'signal:red'],
  // #1860 item 6: owner-ok counts only with the clerk's marker for the head.
  ['needs-owner and owner-ok with no marker', { labels: ['needs-owner', 'owner-ok'] }, 'signal:red'],
  ['needs-owner and owner-ok for an older head', { labels: ['needs-owner', 'owner-ok'], comments: [okFor(B), review()] }, 'signal:red'],
  ['an ask with owner-ok for an older head', { comments: [okFor(B), review(A, true, 'Jarrod must see the pictures first.')], labels: ['owner-ok'] }, 'signal:red'],
  // #1860 items 1, 3 and 4 reach the signal through decide().
  ['a conflicted PR', { mergeable: false }, 'signal:yellow'],
  ['loosen red', { checks: [green, { ...loosen, conclusion: 'failure' }] }, 'signal:yellow'],
  ['no loosen run', { checks: [green] }, 'signal:yellow'],
  ['reviewed and green, but it removes a line from ci.yml', { files: [{ filename: '.github/workflows/ci.yml', status: 'modified', additions: 0, deletions: 1, patch: '@@ -1,2 +1,1 @@\n a\n-b' }] }, 'signal:red'],
  ['reviewed and green, and it only adds a line to ci.yml', { files: [{ filename: '.github/workflows/ci.yml', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n a\n+b' }] }, 'signal:green'],
  ['the head moved during the sweep', { moved: true }, 'signal:yellow'],
  ['a reviewed code PR with the code switch off: auto-merge will not take it', { code: false }, 'signal:yellow'],
  ['the kill switch is thrown: a PR auto-merge would take waits for the owner', { enabled: false }, 'signal:red'],
  ['the kill switch is thrown and merge-by-chat is on the PR: the label comes off', { enabled: false, labels: ['merge-by-chat', 'signal:green'] }, 'signal:red'],
  ['the kill switch is thrown on a PR still building', { enabled: false, comments: [] }, 'signal:yellow'],
  ['a clean marker with no reviewer footer', { comments: [{ id: 1, created_at: '2026-11-21T01:00:00Z', author_association: 'OWNER', body: `<!-- review-desk -->\nClean.\n<!-- review-desk: clean ${A} -->` }] }, 'signal:yellow'],
  ['reviewer and builder are the same model', { comments: [{ ...review(), body: review().body.replace('Builder: Sonnet 5.5', 'Builder: Claude Opus 5.5') }] }, 'signal:yellow'],
  ['reviewed and green, but it touches AGENTS.md', { files: [{ filename: 'src/a.ts', status: 'modified', additions: 1, deletions: 0 }, { filename: 'AGENTS.md', status: 'modified', additions: 1, deletions: 0 }] }, 'signal:red'],
  ['it touches AGENTS.md and is not reviewed yet', { comments: [], files: [{ filename: 'AGENTS.md', status: 'modified', additions: 1, deletions: 0 }] }, 'signal:yellow'],
  ['a new workflow file named CI.yml', { files: [{ filename: '.github/workflows/CI.yml', status: 'added', additions: 9, deletions: 0 }] }, 'signal:red'],
  ['a stale green label is replaced', { comments: [], labels: ['signal:green', 'tier:2'] }, 'signal:yellow'],
  ['two stale labels are both removed', { labels: ['signal:yellow', 'signal:red'] }, 'signal:green'],
  ['the right label is left alone', { labels: ['signal:green'] }, 'signal:green'],
];

function fixture({ comments = [review()], checks = [green, loosen], labels = [], moved = false, draft = false, mergeable = true, files = [{ filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1 }] } = {}) {
  let reads = 0;
  const now = new Set(labels), writes = [];
  const pr = { number: 7, state: 'open', merged: false, draft, mergeable, head: { sha: A }, changed_files: files.length, base: { ref: 'main', repo: { default_branch: 'main' } } };
  const api = async (path, method = 'GET', payload) => {
    const url = new URL('https://example.test' + path), p = url.pathname;
    if (method === 'DELETE' && p.startsWith('/issues/7/labels/')) { writes.push(method); now.delete(decodeURIComponent(p.slice(17))); return {}; }
    if (method === 'POST' && p === '/issues/7/labels') { writes.push(method); payload.labels.forEach(l => now.add(l)); return {}; }
    if (method !== 'GET') throw new Error(`unexpected write: ${method} ${path}`);
    if (p === '/pulls') return [pr];
    if (p === '/pulls/7') return { ...pr, head: { sha: moved && ++reads >= 2 ? B : A }, labels: [...now].map(name => ({ name })) };
    if (p === '/pulls/7/files') return files;
    if (p === '/issues/7/comments') return comments;
    if (p.startsWith('/commits/')) return { check_runs: checks.filter(r => r.name === url.searchParams.get('check_name')) };
    throw new Error('unexpected API: ' + path);
  };
  return { api, writes, signals: () => [...now].filter(l => l.startsWith('signal:')), all: () => [...now] };
}

const optsOf = (over) => Object.fromEntries(['code', 'enabled'].filter((k) => over[k] !== undefined).map((k) => [k, over[k]]));

async function run(mod) {
  const out = [];
  for (const [label, over, want] of CASES) {
    const f = fixture(over);
    await mod.sweep(f.api, optsOf(over));
    f.opts = optsOf(over);
    out.push({ label, want, got: f.signals(), f });
  }
  return out;
}

for (const { label, want, got, f } of await run(real)) {
  assert.deepEqual(got, [want], label);
  console.log(`ok   ${label}: ${want}`);
  // A second sweep changes nothing.
  const before = f.writes.length;
  await real.sweep(f.api, f.opts);
  assert.equal(f.writes.length, before, `${label}: a repeat sweep writes nothing`);
}

// Other labels survive, a draft is skipped, and a dry run writes nothing.
const kept = fixture({ comments: [], labels: ['signal:green', 'tier:2', 'needs-owner'] });
await real.sweep(kept.api);
assert.deepEqual(kept.all().sort(), ['needs-owner', 'signal:red', 'tier:2']);
const draft = fixture({ draft: true });
await real.sweep(draft.api);
assert.equal(draft.writes.length, 0, 'a draft gets no label');
const dry = fixture();
assert.deepEqual(await real.sweep(dry.api, { dryRun: true }), [{ number: 7, want: 'signal:green', had: [] }]);
assert.equal(dry.writes.length, 0, 'a dry run writes nothing');
// `merge-by-chat` survives only while the PR is green: a push or a findings review takes it away.
const chatGreen = fixture({ labels: ['merge-by-chat', 'signal:green'] });
await real.sweep(chatGreen.api);
assert.deepEqual(chatGreen.all().sort(), ['merge-by-chat', 'signal:green']);
const chatStale = fixture({ comments: [], labels: ['merge-by-chat', 'signal:green'] });
await real.sweep(chatStale.api);
assert.deepEqual(chatStale.all().sort(), ['signal:yellow'], 'merge-by-chat goes when the PR is no longer green');
const chatKilled = fixture({ labels: ['merge-by-chat', 'signal:green'] });
await real.sweep(chatKilled.api, { enabled: false });
assert.deepEqual(chatKilled.all().sort(), ['signal:red'], 'the kill switch takes merge-by-chat off a green PR');
const chatDry = fixture({ comments: [], labels: ['merge-by-chat'] });
await real.sweep(chatDry.api, { dryRun: true });
assert.equal(chatDry.writes.length, 0);
assert.ok(readFileSync(new URL('./pr-signal.mjs', import.meta.url), 'utf8').includes("enabled: process.env.AUTO_MERGE === 'on'"), 'the kill switch is read exactly as auto-merge.yml reads it');
console.log('ok   other labels kept, drafts skipped, dry run writes nothing');

// #1860 item 14: one PR's API error never stops the sweep. PR 8 fails on its files; PR 9 after it is still labelled.
async function errorSweep(mod) {
  const labelled = new Map();
  const base = { state: 'open', merged: false, draft: false, mergeable: true, head: { sha: A }, changed_files: 1, base: { ref: 'main', repo: { default_branch: 'main' } } };
  const api = async (path, method = 'GET', payload) => {
    const url = new URL('https://example.test' + path), p = url.pathname;
    const n = Number(p.split('/')[2]);
    if (method === 'POST' && p.endsWith('/labels')) { labelled.set(n, payload.labels); return {}; }
    if (method !== 'GET') throw new Error(`unexpected write: ${method} ${path}`);
    if (p === '/pulls') return [{ ...base, number: 8 }, { ...base, number: 9 }];
    if (p === '/pulls/8/files') throw new Error('GET /pulls/8/files: 502');
    if (/^\/pulls\/\d+$/.test(p)) return { ...base, number: n, labels: [] };
    if (/^\/pulls\/\d+\/files$/.test(p)) return [{ filename: 'src/a.ts', status: 'modified', additions: 1, deletions: 0 }];
    if (/^\/issues\/\d+\/comments$/.test(p)) return [review()];
    if (p.startsWith('/commits/')) return { check_runs: [green, loosen].filter(r => r.name === url.searchParams.get('check_name')) };
    throw new Error('unexpected API: ' + path);
  };
  try {
    const rows = await mod.sweep(api);
    return rows.length === 2 && /502/.test(rows[0].error ?? '') && rows[1].want === 'signal:green' && String(labelled.get(9)) === 'signal:green' && !labelled.has(8);
  } catch {
    return false;
  }
}
assert.equal(await errorSweep(real), true, 'an API error on one PR leaves the next PR labelled');
const main = readFileSync(new URL('./pr-signal.mjs', import.meta.url), 'utf8');
assert.ok(main.includes("if (rows.some(r => r.error)) process.exitCode = 1;"), 'a sweep with an error still fails the run');
console.log('ok   an API error on one PR does not stop the sweep');

// Mutation check: break one rule at a time in a copy of the script. The cases above must catch every break.
const source = readFileSync(new URL('./pr-signal.mjs', import.meta.url), 'utf8');
const MUTANTS = [
  ['needs-owner ignored', "if (labels.includes('needs-owner') && !labels.includes('owner-ok')) return 'signal:red';", ''],
  ['owner-ok does not clear needs-owner', "labels.includes('needs-owner') && !labels.includes('owner-ok')", "labels.includes('needs-owner')"],
  ['the review\'s owner request ignored', "if (asked && !labels.includes('owner-ok')) return 'signal:red';", ''],
  ['everything is green', "return 'signal:yellow';", "return 'signal:green';"],
  ['code switch ignored', 'defaultBranch: current.base?.repo?.default_branch, code });', 'defaultBranch: current.base?.repo?.default_branch, code: true });'],
  ['kill switch ignored', "return enabled ? 'signal:green' : 'signal:red';", "return 'signal:green';"],
  ['green wider than auto-merge', "if (merge.merge === true) return enabled", "if (merge.merge === true || reviewed) return enabled"],
  ['governance PRs never surface to the owner', "if (reviewed && files.some(", "if (false && files.some("],
  ['stale labels kept', 'if (old !== want) await api(', 'if (false) await api('],
  ['label never added', 'if (!have.includes(want)) await api(', 'if (false) await api('],
  ['label added every sweep', 'if (!have.includes(want)) await api(', 'await api('],
  ['labels read before the other reads', 'const labels = (current.labels ?? [])', 'const labels = (p.labels ?? [])'],
  // #1860.
  ['13: an owner ask in the desk-board wording beats a merge', "if (merge.merge === true) return enabled", "if (row.bucket === 'Ready for Jarrod' && !labels.includes('owner-ok')) return 'signal:red';\n  if (merge.merge === true) return enabled"],
  ['13: desk-board wording in place of ownerAsked', "if (asked && !labels.includes('owner-ok'))", "if ((asked || row.bucket === 'Ready for Jarrod') && !labels.includes('owner-ok'))"],
  ['13: ownerAsked not passed', 'files, enabled, ownerAsked(comments));', 'files, enabled);'],
  ['6: owner-ok not pinned to the head', "labels.filter(l => l !== 'owner-ok' || ownerOkHead(comments) === current.head?.sha)", 'labels'],
  ['3: loosen not read', 'checkRuns: [...checks, ...loosen]', 'checkRuns: checks'],
  ['4: registration lines not checked', 'files.some(f => fileRefusals(f).length)', 'files.some(f => fileRefusals({ ...f, filename: "src/x.ts" }).length)'],
  ['14: one error stops the sweep', 'results.push({ number: p.number, error: String(e?.message ?? e) });', 'throw e;'],
];
const dir = mkdtempSync(new URL('./.pr-signal-mutants-', import.meta.url).pathname);
try {
  for (const [name, from, to] of MUTANTS) {
    assert.ok(typeof from === 'string' ? source.includes(from) : from.test(source), `mutant "${name}" applies to the script`);
    const path = join(dir, `${name.replace(/\W+/g, '-')}.mjs`);
    writeFileSync(path, source.replace(from, to).replace("'./desk-board.mjs'", "'../desk-board.mjs'").replace("'./auto-merge-eligible.mjs'", "'../auto-merge-eligible.mjs'"));
    const mod = await import(pathToFileURL(path).href);
    let caught = 0;
    for (const { want, got, f } of await run(mod)) {
      const before = f.writes.length;
      await mod.sweep(f.api, f.opts);
      if (got.length !== 1 || got[0] !== want || f.writes.length !== before) caught++;
    }
    if (!(await errorSweep(mod))) caught++;
    assert.ok(caught, `mutant "${name}" survived every case`);
    console.log(`ok   mutant caught: ${name} (${caught} cases)`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// The workflow never runs PR code and reads only the default branch's scripts.
const workflow = readFileSync(new URL('../.github/workflows/pr-signal.yml', import.meta.url), 'utf8');
for (const required of ['workflows: [CI]', 'group: pr-signal', 'ref: ${{ github.event.repository.default_branch }}', 'persist-credentials: false',
  'scripts/pr-signal.mjs\n            scripts/desk-board.mjs\n            scripts/auto-merge-eligible.mjs\n          sparse-checkout-cone-mode: false', "AUTO_MERGE_CODE: ${{ vars.AUTO_MERGE_CODE != 'off' && 'on' || 'off' }}", 'AUTO_MERGE: ${{ vars.AUTO_MERGE }}', "contains(github.event.comment.body, '<!-- review-desk')"]) {
  assert.ok(workflow.includes(required), `workflow has ${required}`);
}
assert.match(workflow, /^ {2}pull_request_target:$/m);
assert.equal((workflow.match(/uses: actions\/checkout/g) || []).length, 1, 'one checkout');
assert.equal(/pull_request:\s|secrets\.|npm (?:ci|install)|download-artifact|head_(branch|repository|ref)|pull_request\.head|refs\/pull/.test(workflow), false, 'no PR code, secrets or installs');
assert.equal(/contents: write/.test(workflow), false, 'no write to the repo contents');

console.log(`pr-signal-prove: ok (${CASES.length} cases, ${MUTANTS.length} mutants caught)`);
