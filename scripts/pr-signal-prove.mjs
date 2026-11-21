#!/usr/bin/env node
// Fixture proof for scripts/pr-signal.mjs and its workflow. No network.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as real from './pr-signal.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40);
const green = { name: 'checks', app: { id: 15368 }, head_sha: A, status: 'completed', conclusion: 'success' };
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
  ['needs-owner and owner-ok', { labels: ['needs-owner', 'owner-ok'] }, 'signal:green'],
  ['owner-ok never makes an unreviewed PR green', { labels: ['needs-owner', 'owner-ok'], comments: [] }, 'signal:yellow'],
  ['the review asks for the owner to see pictures', { comments: [review(A, true, 'Jarrod must see the pictures first.')] }, 'signal:red'],
  ['the same, after owner-ok', { comments: [review(A, true, 'Jarrod must see the pictures first.')], labels: ['owner-ok'] }, 'signal:green'],
  ['the head moved during the sweep', { moved: true }, 'signal:yellow'],
  ['a clean marker with no reviewer footer', { comments: [{ id: 1, created_at: '2026-11-21T01:00:00Z', author_association: 'OWNER', body: `<!-- review-desk -->\nClean.\n<!-- review-desk: clean ${A} -->` }] }, 'signal:yellow'],
  ['reviewer and builder are the same model', { comments: [{ ...review(), body: review().body.replace('Builder: Sonnet 5.5', 'Builder: Claude Opus 5.5') }] }, 'signal:yellow'],
  ['reviewed and green, but it touches AGENTS.md', { files: [{ filename: 'src/a.ts', status: 'modified', additions: 1, deletions: 0 }, { filename: 'AGENTS.md', status: 'modified', additions: 1, deletions: 0 }] }, 'signal:red'],
  ['it touches AGENTS.md and is not reviewed yet', { comments: [], files: [{ filename: 'AGENTS.md', status: 'modified', additions: 1, deletions: 0 }] }, 'signal:yellow'],
  ['a new workflow file named CI.yml', { files: [{ filename: '.github/workflows/CI.yml', status: 'added', additions: 9, deletions: 0 }] }, 'signal:red'],
  ['a stale green label is replaced', { comments: [], labels: ['signal:green', 'tier:2'] }, 'signal:yellow'],
  ['two stale labels are both removed', { labels: ['signal:yellow', 'signal:red'] }, 'signal:green'],
  ['the right label is left alone', { labels: ['signal:green'] }, 'signal:green'],
];

function fixture({ comments = [review()], checks = [green], labels = [], moved = false, draft = false, files = [{ filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1 }] } = {}) {
  let reads = 0;
  const now = new Set(labels), writes = [];
  const pr = { number: 7, state: 'open', merged: false, draft, head: { sha: A }, changed_files: files.length, base: { ref: 'main', repo: { default_branch: 'main' } } };
  const api = async (path, method = 'GET', payload) => {
    const url = new URL('https://example.test' + path), p = url.pathname;
    if (method === 'DELETE' && p.startsWith('/issues/7/labels/')) { writes.push(method); now.delete(decodeURIComponent(p.slice(17))); return {}; }
    if (method === 'POST' && p === '/issues/7/labels') { writes.push(method); payload.labels.forEach(l => now.add(l)); return {}; }
    if (method !== 'GET') throw new Error(`unexpected write: ${method} ${path}`);
    if (p === '/pulls') return [pr];
    if (p === '/pulls/7') return { ...pr, head: { sha: moved && ++reads >= 2 ? B : A }, labels: [...now].map(name => ({ name })) };
    if (p === '/pulls/7/files') return files;
    if (p === '/issues/7/comments') return comments;
    if (p.startsWith('/commits/')) return { check_runs: checks };
    throw new Error('unexpected API: ' + path);
  };
  return { api, writes, signals: () => [...now].filter(l => l.startsWith('signal:')), all: () => [...now] };
}

async function run(mod) {
  const out = [];
  for (const [label, over, want] of CASES) {
    const f = fixture(over);
    await mod.sweep(f.api);
    out.push({ label, want, got: f.signals(), f });
  }
  return out;
}

for (const { label, want, got, f } of await run(real)) {
  assert.deepEqual(got, [want], label);
  console.log(`ok   ${label}: ${want}`);
  // A second sweep changes nothing.
  const before = f.writes.length;
  await real.sweep(f.api);
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
console.log('ok   other labels kept, drafts skipped, dry run writes nothing');

// Mutation check: break one rule at a time in a copy of the script. The cases above must catch every break.
const source = readFileSync(new URL('./pr-signal.mjs', import.meta.url), 'utf8');
const MUTANTS = [
  ['needs-owner ignored', "if (labels.includes('needs-owner') && !labels.includes('owner-ok')) return 'signal:red';", ''],
  ['owner-ok does not clear needs-owner', "labels.includes('needs-owner') && !labels.includes('owner-ok')", "labels.includes('needs-owner')"],
  ['the review\'s owner request ignored', "if (row.bucket === 'Ready for Jarrod' && !labels.includes('owner-ok')) return 'signal:red';", ''],
  ['everything is green', "return 'signal:yellow';", "return 'signal:green';"],
  ['green wider than auto-merge', "if (merge.merge === true) return 'signal:green';", "if (merge.merge === true || reviewed) return 'signal:green';"],
  ['governance PRs never surface to the owner', "if (reviewed && files.some(", "if (false && files.some("],
  ['stale labels kept', 'if (old !== want) await api(', 'if (false) await api('],
  ['label never added', 'if (!have.includes(want)) await api(', 'if (false) await api('],
  ['label added every sweep', 'if (!have.includes(want)) await api(', 'await api('],
  ['labels read before the other reads', 'const labels = (current.labels ?? [])', 'const labels = (p.labels ?? [])'],
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
      await mod.sweep(f.api);
      if (got.length !== 1 || got[0] !== want || f.writes.length !== before) caught++;
    }
    assert.ok(caught, `mutant "${name}" survived every case`);
    console.log(`ok   mutant caught: ${name} (${caught} cases)`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// The workflow never runs PR code and reads only the default branch's scripts.
const workflow = readFileSync(new URL('../.github/workflows/pr-signal.yml', import.meta.url), 'utf8');
for (const required of ['workflows: [CI]', 'group: pr-signal', 'ref: ${{ github.event.repository.default_branch }}', 'persist-credentials: false',
  'scripts/pr-signal.mjs\n            scripts/desk-board.mjs\n            scripts/auto-merge-eligible.mjs\n          sparse-checkout-cone-mode: false', "AUTO_MERGE_CODE: ${{ vars.AUTO_MERGE_CODE != 'off' && 'on' || 'off' }}", "contains(github.event.comment.body, '<!-- review-desk')"]) {
  assert.ok(workflow.includes(required), `workflow has ${required}`);
}
assert.match(workflow, /^ {2}pull_request_target:$/m);
assert.equal((workflow.match(/uses: actions\/checkout/g) || []).length, 1, 'one checkout');
assert.equal(/pull_request:\s|secrets\.|npm (?:ci|install)|download-artifact|head_(branch|repository|ref)|pull_request\.head|refs\/pull/.test(workflow), false, 'no PR code, secrets or installs');
assert.equal(/contents: write/.test(workflow), false, 'no write to the repo contents');

console.log(`pr-signal-prove: ok (${CASES.length} cases, ${MUTANTS.length} mutants caught)`);
