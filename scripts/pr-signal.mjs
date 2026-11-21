#!/usr/bin/env node
// Sets one signal label on every open, ready PR, so the dispatcher (docs/DESK.md) reads a PR's state from one cheap
// list call and never opens a diff, a review or #916. API only: it never checks out or runs a PR's code.
//   signal:green   checks green and a clean review at the exact head. Auto-merge takes it from here.
//   signal:red     waits for the owner: `needs-owner` without `owner-ok`, or the review asks for the owner's look.
//   signal:yellow  everything else: building, CI running or red, review pending, findings to fix.
import { pathToFileURL } from 'node:url';
import { classify, rest } from './desk-board.mjs';

export const SIGNALS = ['signal:green', 'signal:yellow', 'signal:red'];

// row: desk-board's classify() result. labels: the PR's label names.
export function signalFor(row, labels) {
  if (labels.includes('needs-owner') && !labels.includes('owner-ok')) return 'signal:red';
  if (row.bucket === 'Ready for Jarrod' && !labels.includes('owner-ok')) return 'signal:red';
  if (row.bucket === 'Ready to merge' || row.bucket === 'Ready for Jarrod') return 'signal:green';
  return 'signal:yellow';
}

export async function sweep(api, { dryRun = false } = {}) {
  const all = async (path, key) => {
    const out = [];
    for (let page = 1; ; page++) {
      const data = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const items = key ? data[key] : data;
      if (!Array.isArray(items)) throw new Error(`invalid list: ${path}`);
      out.push(...items);
      if (items.length < 100) return out;
    }
  };
  const results = [];
  for (const p of await all('/pulls?state=open')) {
    if (p.draft) continue;
    const pr = await api(`/pulls/${p.number}`);
    const files = await all(`/pulls/${p.number}/files`);
    const comments = await all(`/issues/${p.number}/comments`);
    const checks = await all(`/commits/${pr.head.sha}/check-runs?check_name=checks&filter=latest`, 'check_runs');
    // Read the PR again last: a push or a label change during the reads must not leave a stale green.
    const current = await api(`/pulls/${p.number}`);
    const labels = (current.labels ?? []).map(l => l.name);
    const want = signalFor(classify({ pr, files, comments, checks, current }), labels);
    const have = labels.filter(l => SIGNALS.includes(l));
    results.push({ number: p.number, want, had: have });
    if (dryRun) continue;
    for (const old of have) if (old !== want) await api(`/issues/${p.number}/labels/${encodeURIComponent(old)}`, 'DELETE');
    if (!have.includes(want)) await api(`/issues/${p.number}/labels`, 'POST', { labels: [want] });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sweep(rest(process.env.GITHUB_REPOSITORY), { dryRun: process.argv.includes('--dry-run') })
    .then(rows => rows.forEach(r => console.log(`#${r.number}: ${r.want}${r.had.includes(r.want) ? '' : ` (was ${r.had.join(', ') || 'none'})`}`)))
    .catch(e => { console.error(e.message); process.exitCode = 1; });
}
