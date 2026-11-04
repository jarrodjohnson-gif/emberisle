// #858: generate the queue from GitHub data. Only the labelled queue body's PATCH mutates GitHub.
import { pathToFileURL } from 'node:url';

const names = (issue) => (issue.labels ?? []).map((label) => typeof label === 'string' ? label : label.name);
const section = (body, heading) => {
  const lines = String(body ?? '').split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^#{1,6}\\s+${heading}\\s*:?\\s*$`, 'i').test(line));
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^#{1,6}\s/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
};
export function dependencies(body) {
  const text = [section(body, 'Depends on'), ...String(body ?? '').split(/\r?\n/).filter(line => /^\s*(?:\*\*)?Depends on\s*:/i.test(line))].join('\n');
  return [...new Set([...text.matchAll(/#(\d+)\b/g)].map(match => Number(match[1])))];
}
export function activeClaims(comments) {
  const active = new Map();
  for (const comment of comments) {
    for (const line of String(comment.body ?? '').split(/\r?\n/)) {
      const match = /^\s*(claimed|paused):\s*(.+?),\s*\d{4}-\d{2}-\d{2}\b/i.exec(line);
      if (!match) continue;
      const agent = match[2].trim();
      if (match[1].toLowerCase() === 'paused') active.delete(agent);
      else if (!active.has(agent)) active.set(agent, agent);
    }
  }
  return [...active.values()];
}
const priority = (issue) => ['prio:p0', 'prio:p1', 'prio:p2'].findIndex(label => names(issue).includes(label));
const rank = (issue) => priority(issue) < 0 ? 3 : priority(issue);
export function buildQueue(issues, prs, comments, dependencyStates) {
  const ready = [], taken = [], blocked = [];
  for (const issue of issues) {
    if (issue.pull_request || issue.state !== 'open' || !names(issue).some(label => label.startsWith('lane:'))) continue;
    const claims = activeClaims(comments[issue.number] ?? []);
    const linked = prs.filter(pr => pr.state === 'open' && new RegExp(`#${issue.number}(?!\\d)`).test(`${pr.title}\n${pr.body ?? ''}`));
    if (claims.length || linked.length) {
      taken.push({ issue, claims, prs: linked });
      continue;
    }
    if (!names(issue).includes('status:todo')) continue;
    const waiting = dependencies(issue.body).filter(number => dependencyStates[number] !== 'closed');
    if (waiting.length) blocked.push({ issue, waiting });
    else ready.push(issue);
  }
  const sort = (a, b) => rank(a) - rank(b) ||
    (a.milestone?.number ?? Number.MAX_SAFE_INTEGER) - (b.milestone?.number ?? Number.MAX_SAFE_INTEGER) || a.number - b.number;
  ready.sort(sort);
  taken.sort((a,b) => sort(a.issue,b.issue));
  blocked.sort((a,b) => sort(a.issue,b.issue));
  return { ready, taken, blocked };
}
export function cell(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r?\n/g, ' ').replace(/([\\|`*_[\]])/g, '\\$1');
}
export function renderQueue(queue, updated = new Date().toISOString()) {
  const label = (issue, prefix) => cell(names(issue).filter(name => name.startsWith(prefix)).join(', ') || '—');
  const issueLink = issue => `#${issue.number} ${cell(issue.title)}`;
  const lines = [`Updated ${cell(updated)}`, '', '# Next up (auto)', '',
    'Generated from GitHub. Do not edit this body by hand.', '',
    '| Priority | Issue | Tier | Lane | Model | Helpers | Files |', '|---|---|---|---|---|---|---|'];
  for (const issue of queue.ready) lines.push(`| ${label(issue,'prio:')} | ${issueLink(issue)} | ${label(issue,'tier:')} | ${label(issue,'lane:')} | ${label(issue,'model:')} | ${names(issue).includes('helper-ok') ? 'helper-ok' : '—'} | ${cell(section(issue.body,'Files') || '—')} |`);
  if (!queue.ready.length) lines.push('| — | No eligible issues | — | — | — | — | — |');
  lines.push('', '## Taken', '', '| Issue | Claimant | PR |', '|---|---|---|');
  for (const row of queue.taken) lines.push(`| ${issueLink(row.issue)} | ${cell(row.claims.join(', ') || '—')} | ${row.prs.map(pr => `#${pr.number}`).join(', ') || '—'} |`);
  if (!queue.taken.length) lines.push('| — | None | — |');
  lines.push('', '## Waiting on dependencies', '', '| Issue | Open or unknown dependencies |', '|---|---|');
  for (const row of queue.blocked) lines.push(`| ${issueLink(row.issue)} | ${row.waiting.map(n => `#${n}`).join(', ')} |`);
  return lines.join('\n') + '\n';
}

export async function updateQueue({ repo, token, fetchImpl = fetch, now = new Date().toISOString() }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  const base = `https://api.github.com/repos/${repo}`;
  async function api(path, method = 'GET', body) {
    const response = await fetchImpl(`${base}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.json();
  }
  async function list(path, cap) {
    const rows = [];
    for (let page = 1; ; page++) {
      const batch = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Expected a GitHub list');
      rows.push(...batch);
      if (rows.length > cap) throw new Error(`Safety limit exceeded for ${path}; queue left unchanged`);
      if (batch.length < 100) return rows;
      // A full final page is ambiguous. Refuse rather than publish an incomplete queue.
      if (rows.length === cap) throw new Error(`Safety limit reached for ${path}; queue left unchanged`);
    }
  }
  const targets = (await list('/issues?state=open&labels=next-up', 200)).filter(issue => !issue.pull_request);
  if (targets.length !== 1 || targets[0].title !== 'Next up (auto)')
    throw new Error('Provision exactly one open issue titled "Next up (auto)" with label next-up, then pin it. No issue was changed.');
  const target = targets[0];
  // Query lanes separately: /issues also contains PRs and unrelated historical work.
  // De-duplicate multi-lane issues and enforce the 200-issue bound before any write.
  const lanes = (await list('/labels', 500)).filter(label => label.name.startsWith('lane:'));
  const byNumber = new Map();
  for (const lane of lanes) {
    for (const issue of await list(`/issues?state=open&labels=${encodeURIComponent(lane.name)}`, 200)) {
      if (issue.pull_request) continue;
      byNumber.set(issue.number, issue);
      if (byNumber.size > 200) throw new Error('Lane issue safety limit exceeded; queue left unchanged');
    }
  }
  const issues = [...byNumber.values()];
  const prs = await list('/pulls?state=open', 100);
  const comments = {}, states = Object.fromEntries(issues.map(issue => [issue.number, issue.state]));
  for (const issue of issues) {
    if (issue.pull_request || !names(issue).some(label => label.startsWith('lane:'))) continue;
    comments[issue.number] = issue.comments ? await list(`/issues/${issue.number}/comments`, 1000) : [];
    if (!names(issue).includes('status:todo')) continue;
    for (const number of dependencies(issue.body)) {
      if (Object.hasOwn(states, number)) continue;
      if (Object.keys(states).length >= 400) throw new Error('Dependency safety limit exceeded; queue left unchanged');
      states[number] = (await api(`/issues/${number}`)).state;
    }
  }
  const queue = buildQueue(issues.filter(issue => issue.number !== target.number), prs, comments, states);
  const body = renderQueue(queue, now);
  if (Buffer.byteLength(body) > 65000) throw new Error('Queue body exceeds safety limit');
  await api(`/issues/${target.number}`, 'PATCH', { body });
  return { number: target.number, ready: queue.ready.length, taken: queue.taken.length, blocked: queue.blocked.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateQueue({ repo: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN })
    .then(result => console.log(`next-up: updated #${result.number}; ${result.ready} eligible, ${result.taken} taken, ${result.blocked} blocked`))
    .catch(error => { console.error(`next-up: ${error.message}`); process.exitCode = 1; });
}
