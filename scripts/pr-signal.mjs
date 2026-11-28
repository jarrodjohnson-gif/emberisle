#!/usr/bin/env node
// Sets one signal label on every open, ready PR, so the dispatcher (docs/DESK.md) reads a PR's state from one cheap
// list call and never opens a diff, a review or #916. API only: it never checks out or runs a PR's code.
//   signal:green   auto-merge will merge it: scripts/auto-merge-eligible.mjs says yes for this exact head.
//   signal:red     waits for the owner: `needs-owner` without `owner-ok`, the newest review asks for the owner (the same
//                  test auto-merge uses), or it is green and reviewed but only the owner can merge it: it touches a
//                  governance file, or the repo variable AUTO_MERGE is not "on", so nothing merges on its own.
// `owner-ok` counts only with the clerk's marker for the head, as in auto-merge. One PR's API error never stops the
// sweep: the PRs after it are still labelled, and the run fails at the end.
//   signal:yellow  everything else: building, CI running or red, review pending, findings to fix, a bad review footer.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { decide, fileRefusals, ownerAsked, ownerOkHead } from './auto-merge-eligible.mjs';

// Moved here from scripts/desk-board.mjs (#1862) when the desk-board workflow was retired. pr-signal is the one caller.
export const SHA = /^[0-9a-f]{40}$/;
const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
export const trusted = c => TRUSTED.includes(c.author_association);
const reviewHeading = body => /^(?:#+\s*)?re(?:-?re)?view\b/i.test(body.replace(/<!--[\s\S]*?-->/g, '').trim().split('\n')[0].replace(/\*\*/g, ''));
const text = c => String(c.body ?? '').replace(/```[^]*?```|~~~[^]*?~~~/g, '').replace(/^>.*$/gm, '');

export function reviewOf(comments) {
  const latest = comments.filter(trusted).filter(c => {
    const body = text(c);
    return /<!--\s*review-desk(?:\s*-->|:\s*clean\s)/.test(body)
      && (/\bHead:\s*[0-9a-f]{40}(?![0-9a-f])/.test(body)
        || /<!--\s*review-desk:\s*clean\s+[0-9a-f]{40}\s*-->/.test(body) || reviewHeading(body));
  })
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id).at(-1);
  if (!latest) return { sha: null, clean: false, missing: false, visual: false };
  const body = text(latest);
  const marker = [...body.matchAll(/<!--\s*review-desk:\s*clean\s+([0-9a-f]{40})\s*-->/g)].at(-1)?.[1];
  const footer = [...body.matchAll(/\bHead:\s*([0-9a-f]{40})(?![0-9a-f])/g)].at(-1)?.[1];
  const sha = footer ?? marker;
  const conflict = marker && footer && marker !== footer;
  // Legacy prose verdicts are accepted only in the review heading, never arbitrary mentions of "clean".
  const heading = body.replace(/<!--[\s\S]*?-->/g, '').trim().split('\n')[0].replace(/\*\*/g, '');
  // DESK.md's own format: the first line after the marker is exactly "Clean.".
  const clean = !conflict && (marker === sha || /^clean[.!]?$/i.test(heading.trim()) || (/\bre-?review\b|\breview\b/i.test(heading)
    && /(?:\(clean\)(?:\s*[.!](?:\s|$)|\s*$)|:\s*clean(?:\s*[.!](?:\s|$)|\s*$))/i.test(heading) && !/\bnot clean\b/i.test(heading)));
  const visual = /(?:Jarrod|owner)[^\n.]{0,100}(?:must see|sign.off|approval|accept)|(?:waiting|pending|needs?)[^\n.]{0,60}(?:Jarrod|owner)|(?:visual|pictures?|audio)[^\n.]{0,80}(?:first|pending|approval|sign.off)/i.test(body) || /(?:[Jj]arrod|[Oo]wner)[^\n.]{0,100}\bOK\b/.test(body);
  return { sha: conflict ? null : sha ?? null, clean: Boolean(clean), missing: !sha || Boolean(conflict), visual };
}

export function routeFor(files) {
  const paths = files.flatMap(f => [f.filename, f.previous_filename].filter(Boolean));
  if (!paths.length || paths.some(p => /^(server|scripts|\.github)\//i.test(p) || /(^|\/)(proto(?:col)?|wire)([./-]|$)/i.test(p))) return 'Opus';
  return paths.every(p => /\.(md|mdx|rst|txt)$/i.test(p) || (/^docs\//.test(p) && /\.(png|jpe?g|webp|svg|pdf)$/i.test(p))) ? 'Haiku' : 'Sonnet';
}

export function classify({ pr, files, checks, comments, current = pr }) {
  const sha = pr.head?.sha;
  const review = reviewOf(comments);
  const row = { number: pr.number, sha, route: routeFor(files), reviewed: review.sha, missing: review.missing,
    bucket: 'Red / waiting', reason: '', checks: 'waiting' };
  const no = reason => ({ ...row, reason });
  if (!SHA.test(sha ?? '') || current.head?.sha !== sha || current.state !== 'open' || current.draft) return no('head moved or PR not ready');
  if (!files.length || files.length !== pr.changed_files) return no('incomplete diff paths');
  const runs = checks.filter(c => c.name === 'checks' && c.app?.id === 15368);
  if (!runs.length) return no('no checks on head');
  row.checks = runs.every(c => c.head_sha === sha && c.status === 'completed' && c.conclusion === 'success') ? 'green' : 'red / pending';
  if (row.checks !== 'green') return no('checks not green on exact head');
  if (review.missing) return no('review footer missing');
  if (review.sha !== sha) return { ...row, bucket: 'Ready for desk', reason: 'unreviewed head' };
  if (!review.clean) return no('desk findings or unrecognized verdict');
  if (review.visual) return { ...row, bucket: 'Ready for Jarrod', reason: 'visual / audio sign-off pending' };
  return { ...row, bucket: 'Ready to merge', reason: 'clean review at head; checks green' };
}

// gh api provides REST transport locally and in Actions, using the configured credential normally.
export function rest(repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) throw new Error('invalid GITHUB_REPOSITORY');
  return async (path, method = 'GET', body) => {
    if (!path.startsWith('/')) throw new Error('invalid API path');
    const args = ['api', `repos/${repo}${path}`, '-X', method];
    if (body) args.push('--input', '-');
    return JSON.parse(execFileSync('gh', args, { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
  };
}

export const SIGNALS = ['signal:green', 'signal:yellow', 'signal:red'];

// row: desk-board's classify() result. labels: the PR's label names, with an unpinned `owner-ok` left out. merge:
// auto-merge's decide() result. files: the PR's files. asked: ownerAsked() on its comments. Green is never wider than
// auto-merge, so a green PR never sits unmerged, and a PR auto-merge will take is never red while the switch is on.
export function signalFor(row, labels, merge, files, enabled = true, asked = false) {
  if (labels.includes('needs-owner') && !labels.includes('owner-ok')) return 'signal:red';
  const reviewed = row.bucket === 'Ready to merge' || row.bucket === 'Ready for Jarrod';
  // With the kill switch thrown, a PR auto-merge would have taken waits for the owner instead. Never green.
  if (merge.merge === true) return enabled ? 'signal:green' : 'signal:red';
  if (asked && !labels.includes('owner-ok')) return 'signal:red';
  if (reviewed && files.some(f => fileRefusals(f).length)) return 'signal:red';
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
    try {
      const pr = await api(`/pulls/${p.number}`);
      const files = await all(`/pulls/${p.number}/files`);
      const comments = await all(`/issues/${p.number}/comments`);
      const checks = await all(`/commits/${pr.head.sha}/check-runs?check_name=checks&filter=latest`, 'check_runs');
      const loosen = await all(`/commits/${pr.head.sha}/check-runs?check_name=loosen&filter=latest`, 'check_runs');
      // Read the PR again last: a push or a label change during the reads must not leave a stale green.
      const current = await api(`/pulls/${p.number}`);
      const labels = (current.labels ?? []).map(l => l.name);
      const seen = labels.filter(l => l !== 'owner-ok' || ownerOkHead(comments) === current.head?.sha);
      const merge = decide({ pr: current, headAfter: pr.head.sha, files, checkRuns: [...checks, ...loosen], comments, defaultBranch: current.base?.repo?.default_branch, code });
      const want = signalFor(classify({ pr, files, comments, checks, current }), seen, merge, files, enabled, ownerAsked(comments));
      const have = labels.filter(l => SIGNALS.includes(l));
      results.push({ number: p.number, want, had: have });
      if (dryRun) continue;
      for (const old of have) if (old !== want) await api(`/issues/${p.number}/labels/${encodeURIComponent(old)}`, 'DELETE');
      // `merge-by-chat` lets the dispatcher merge what the workflow token could not. It holds only while the PR is green.
      if (want !== 'signal:green' && labels.includes('merge-by-chat')) await api(`/issues/${p.number}/labels/merge-by-chat`, 'DELETE');
      if (!have.includes(want)) await api(`/issues/${p.number}/labels`, 'POST', { labels: [want] });
    } catch (e) {
      results.push({ number: p.number, error: String(e?.message ?? e) });
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  sweep(rest(process.env.GITHUB_REPOSITORY), { dryRun: process.argv.includes('--dry-run'), code: process.env.AUTO_MERGE_CODE !== 'off', enabled: process.env.AUTO_MERGE === 'on' })
    .then(rows => {
      for (const r of rows) {
        if (r.error) console.error(`#${r.number}: error, ${r.error}`);
        else console.log(`#${r.number}: ${r.want}${r.had.includes(r.want) ? '' : ` (was ${r.had.join(', ') || 'none'})`}`);
      }
      if (rows.some(r => r.error)) process.exitCode = 1;
    })
    .catch(e => { console.error(e.message); process.exitCode = 1; });
}
