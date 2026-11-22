#!/usr/bin/env node
// Sets one signal label on every open, ready PR, so the dispatcher (docs/DESK.md) reads a PR's state from one cheap
// list call and never opens a diff, a review or #916. API only: it never checks out or runs a PR's code.
//   signal:green   auto-merge will merge it: scripts/auto-merge-eligible.mjs says yes for this exact head.
//   signal:red     waits for the owner: `needs-owner` without `owner-ok`, the review asks for the owner's look, or it is
//                  green and reviewed but only the owner can merge it: it touches a governance file, or the repo
//                  variable AUTO_MERGE is not "on", so nothing merges on its own.
//   signal:yellow  everything else: building, CI running or red, review pending, findings to fix, a bad review footer.
import { pathToFileURL } from 'node:url';
import { classify, rest } from './desk-board.mjs';
import { decide, codeRefusal } from './auto-merge-eligible.mjs';

export const SIGNALS = ['signal:green', 'signal:yellow', 'signal:red'];

// row: desk-board's classify() result. labels: the PR's label names. merge: auto-merge's decide() result.
// files: the PR's files. Green is never wider than auto-merge, so a green PR never sits unmerged.
export function signalFor(row, labels, merge, files, enabled = true) {
  if (labels.includes('needs-owner') && !labels.includes('owner-ok')) return 'signal:red';
  if (row.bucket === 'Ready for Jarrod' && !labels.includes('owner-ok')) return 'signal:red';
  const reviewed = row.bucket === 'Ready to merge' || row.bucket === 'Ready for Jarrod';
  // With the kill switch thrown, a PR auto-merge would have taken waits for the owner instead. Never green.
  if (merge.merge === true) return enabled ? 'signal:green' : 'signal:red';
  if (reviewed && files.some(f => [f.filename, f.previous_filename].some(p => p !== undefined && codeRefusal(p)))) return 'signal:red';
  return 'signal:yellow';
}

export async function sweep(api, { dryRun = false, code = true, enabled = true } = {}) {
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
    const merge = decide({ pr: current, headAfter: pr.head.sha, files, checkRuns: checks, comments, defaultBranch: current.base?.repo?.default_branch, code });
    const want = signalFor(classify({ pr, files, comments, checks, current }), labels, merge, files, enabled);
    const have = labels.filter(l => SIGNALS.includes(l));
    results.push({ number: p.number, want, had: have });
    if (dryRun) continue;
    for (const old of have) if (old !== want) await api(`/issues/${p.number}/labels/${encodeURIComponent(old)}`, 'DELETE');
    // `merge-by-chat` lets the dispatcher merge what the workflow token could not. It holds only while the PR is green.
    if (want !== 'signal:green' && labels.includes('merge-by-chat')) await api(`/issues/${p.number}/labels/merge-by-chat`, 'DELETE');
    if (!have.includes(want)) await api(`/issues/${p.number}/labels`, 'POST', { labels: [want] });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sweep(rest(process.env.GITHUB_REPOSITORY), { dryRun: process.argv.includes('--dry-run'), code: process.env.AUTO_MERGE_CODE !== 'off', enabled: process.env.AUTO_MERGE === 'on' })
    .then(rows => rows.forEach(r => console.log(`#${r.number}: ${r.want}${r.had.includes(r.want) ? '' : ` (was ${r.had.join(', ') || 'none'})`}`)))
    .catch(e => { console.error(e.message); process.exitCode = 1; });
}
