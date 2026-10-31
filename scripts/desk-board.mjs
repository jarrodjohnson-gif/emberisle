#!/usr/bin/env node
// #1180: API-only desk sweep. Never executes a PR's code or makes a merge decision.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const START = '<!-- desk-board:start -->';
const END = '<!-- desk-board:end -->';
export const DAILY_LIMIT = 24; // Strictly fewer than 25 board notifications per UTC day.
export const MISSING = 'To desk: desk-board found review comments without a valid Head: footer or clean marker; please add full head SHAs.';
const trusted = c => TRUSTED.includes(c.author_association);
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
  const clean = !conflict && (marker === sha || (/\bre-?review\b|\breview\b/i.test(heading)
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
  return no('clean review; desk merge decision pending');
}

export const wakeLine = row => `review-desk: PR #${row.number} green on ${row.sha}, unreviewed`;
const botOrTrusted = c => trusted(c) || c.user?.login === 'github-actions[bot]';
export function notifications(rows, inbox, now) {
  const day = now.toISOString().slice(0, 10);
  const history = inbox.filter(botOrTrusted);
  const count = history.filter(c => c.created_at?.startsWith(day) && /^(review-desk: |To desk: desk-board )/.test(c.body)).length;
  let remaining = Math.max(0, DAILY_LIMIT - count);
  const out = [];
  if (rows.some(r => r.missing) && !history.some(c => c.body === MISSING && c.created_at?.startsWith(day)) && remaining) {
    out.push(MISSING); remaining--;
  }
  for (const row of rows) {
    const line = wakeLine(row);
    if (row.bucket === 'Ready for desk' && !history.some(c => c.body.split('\n').includes(line)) && remaining) {
      out.push(line); remaining--;
    }
  }
  return out;
}

export function tableFor(rows, now) {
  const safe = s => String(s ?? 'none').replace(/[|\r\n<>]/g, ' ');
  return `${START}\n## Desk board\nchecked: ${now.toISOString()}\n\n| PR | Head | checks | Reviewed head | State | Route | Reason |\n|---|---|---|---|---|---|---|\n` +
    rows.map(r => `| #${r.number} | ${safe(r.sha)} | ${r.checks} | ${safe(r.reviewed)} | ${r.bucket} | ${r.route} | ${safe(r.reason)} |`).join('\n') + `\n${END}`;
}
export function updateBody(body, table) {
  const start = body.indexOf(START), end = body.indexOf(END);
  if (start === -1 && end === -1) return `${body.trimEnd()}\n\n${table}\n`;
  if (start < 0 || end < start || body.indexOf(START, start + 1) !== -1 || body.indexOf(END, end + 1) !== -1) throw new Error('ambiguous board markers');
  return body.slice(0, start) + table + body.slice(end + END.length);
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
export async function sweep(api, { now = new Date(), dryRun = false, only } = {}) {
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
  const rows = [];
  for (const p of await all('/pulls?state=open')) {
    if (p.draft || (only && p.number !== only)) continue;
    const pr = await api(`/pulls/${p.number}`);
    const files = await all(`/pulls/${p.number}/files`);
    const comments = await all(`/issues/${p.number}/comments`);
    const checks = await all(`/commits/${pr.head.sha}/check-runs?check_name=checks&filter=latest`, 'check_runs');
    const current = await api(`/pulls/${p.number}`);
    rows.push(classify({ pr, files, comments, checks, current }));
  }
  const inbox = await all('/issues/699/comments');
  let messages = notifications(rows, inbox, now);
  if (!dryRun) {
    // Recheck immediately before each wake. A new head or new review suppresses stale notifications.
    for (const message of messages) {
      const row = rows.find(r => wakeLine(r) === message);
      if (row) {
        const pr = await api(`/pulls/${row.number}`);
        const checks = await all(`/commits/${row.sha}/check-runs?check_name=checks&filter=latest`, 'check_runs');
        const comments = await all(`/issues/${row.number}/comments`);
        const files = await all(`/pulls/${row.number}/files`);
        const current = await api(`/pulls/${row.number}`);
        const fresh = classify({ pr: { ...pr, head: { sha: row.sha } }, current, files, checks, comments });
        Object.assign(row, fresh);
        if (fresh.bucket !== 'Ready for desk') continue;
      }
      // Retain old SHA receipts, but refresh only today's comments before each write.
      const day = now.toISOString().slice(0, 10);
      const recent = await all(`/issues/699/comments?since=${day}T00:00:00Z`);
      const latestInbox = [...inbox.filter(c => !c.created_at?.startsWith(day)), ...recent];
      if (notifications(rows, latestInbox, now).includes(message)) await api('/issues/699/comments', 'POST', { body: message });
    }
    // Read latest body after all potentially slow calls; preserve every byte outside our block.
    const board = await api('/issues/916');
    await api('/issues/916', 'PATCH', { body: updateBody(board.body ?? '', tableFor(rows, now)) });
  }
  return { rows, table: tableFor(rows, now), messages };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = process.env.PR_NUMBER ? Number(process.env.PR_NUMBER) : undefined;
  if (only && !process.argv.includes('--dry-run')) throw new Error('PR_NUMBER is only supported with --dry-run; never replace the full board with a partial sweep');
  sweep(rest(process.env.GITHUB_REPOSITORY), { dryRun: process.argv.includes('--dry-run'), only })
    .then(result => console.log(result.table)).catch(e => { console.error(e.message); process.exitCode = 1; });
}
