#!/usr/bin/env node
// Rewrites the body of the one open issue labelled `next-up` ("Next up (auto)"): every eligible
// status:todo issue in priority order, then what is taken. Plain fetch and GITHUB_TOKEN, no dependencies.
// Issue, comment and PR text is data: it is only matched against fixed patterns and escaped into table cells.
//   node scripts/next-up.mjs            write the pinned issue (creates it once if missing)
//   node scripts/next-up.mjs --dry-run  print the body, write nothing
import { pathToFileURL } from 'node:url';

export const TITLE = 'Next up (auto)';
export const LABEL = 'next-up';
export const TAKEN_LABELS = ['status:claimed', 'status:in-progress', 'status:in-review'];
const STATUS_LABELS = ['status:todo', ...TAKEN_LABELS];
const PRIO = ['prio:p0', 'prio:p1', 'prio:p2'];
const MAX_ISSUE_PAGES = 2; // 200 issues
const MAX_COMMENT_PAGES = 5; // 500 comments per issue
const FILES_MAX = 120;

// claimed:/paused: <agent>, <YYYY-MM-DD>, in comment order (docs/LANES.md). The date ends the name,
// so names may contain commas; quoted (`> claimed:`) and placeholder lines never match.
const AGENT_LINE = /^[ \t]*(claimed|paused):[ \t]*(.+?),[ \t]*\d{4}-\d{2}-\d{2}[ \t]*$/gim;
const PR_LINE = /^[ \t]*pr:[ \t]*#(\d+)[ \t]*$/gim;
const text = s => String(s ?? '').replace(/\r\n?/g, '\n');

// Comments: [{ id, createdAt, login, body }]. Returns claims still active: a later paused: line from
// the same agent releases only that agent. `pr: #N` binds PR N to the agents named in that comment,
// or else to the active claims posted from the same account.
export function activeClaims(comments) {
  const active = new Map();
  const ordered = [...comments].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
  for (const c of ordered) {
    const body = text(c.body);
    const named = [];
    for (const [, kind, name] of body.matchAll(AGENT_LINE)) {
      const agent = name.trim();
      const key = agent.toLowerCase();
      named.push(key);
      if (kind.toLowerCase() === 'paused') active.delete(key);
      else if (!active.has(key)) active.set(key, { agent, login: c.login, prs: new Set() });
    }
    for (const [, n] of body.matchAll(PR_LINE)) {
      const keys = named.length ? named : [...active.keys()].filter(k => active.get(k).login === c.login);
      for (const k of keys) active.get(k)?.prs.add(Number(n));
    }
  }
  return [...active.values()];
}

export const claimantsIn = body => [...text(body).matchAll(AGENT_LINE)]
  .filter(m => m[1].toLowerCase() === 'claimed').map(m => m[2].trim());

// The lines under a `## Name` heading (to the next heading), or after a `Name:` / `**Name:**` label
// (to the next blank line).
export function section(body, names) {
  const lines = text(body).split('\n');
  const alt = names.join('|');
  const heading = new RegExp(`^ {0,3}#{1,6}[ \\t]*(?:${alt})[ \\t]*:?[ \\t#]*$`, 'i');
  const label = new RegExp(`^[ \\t]*(?:[-*][ \\t]+)?(?:\\*\\*|__)?(?:${alt})(?::(?:\\*\\*|__)?|(?:\\*\\*|__):)[ \\t]*(.*)$`, 'i');
  for (let i = 0; i < lines.length; i++) {
    if (heading.test(lines[i])) {
      const out = [];
      for (let j = i + 1; j < lines.length && !/^ {0,3}#{1,6}\s/.test(lines[j]); j++) out.push(lines[j]);
      return out.join('\n');
    }
    const m = lines[i].match(label);
    if (m) {
      const out = [m[1]];
      for (let j = i + 1; j < lines.length && lines[j].trim(); j++) out.push(lines[j]);
      return out.join('\n');
    }
  }
  return '';
}

export function dependsOn(issue, owner, repo) {
  const s = section(issue.body, ['depends on']);
  const nums = [...s.matchAll(/(?:^|[^\w&/])#(\d+)(?!\d)/g)].map(m => Number(m[1]));
  const url = new RegExp(`github\\.com/${owner}/${repo}/issues/(\\d+)(?!\\d)`, 'gi');
  nums.push(...[...s.matchAll(url)].map(m => Number(m[1])));
  return [...new Set(nums)].filter(n => n !== issue.number);
}

export function mentions(pr, number, owner, repo) {
  const t = `${text(pr.title)}\n${text(pr.body)}`;
  return new RegExp(`(?:^|[^\\w&/])#${number}(?!\\d)`).test(t)
    || new RegExp(`(?:github\\.com/${owner}/${repo}/issues/|\\b${owner}/${repo}#)${number}(?!\\d)`, 'i').test(t);
}

// Numbers whose open/closed state the plan needs but the open lists may not contain.
export function neededRefs(issues, owner, repo) {
  const refs = new Set();
  for (const issue of issues) {
    for (const n of dependsOn(issue, owner, repo)) refs.add(n);
    for (const claim of activeClaims(issue.comments)) for (const n of claim.prs) refs.add(n);
  }
  return refs;
}

const has = (issue, name) => issue.labels.includes(name);
const prioRank = issue => { const i = PRIO.findIndex(p => has(issue, p)); return i < 0 ? PRIO.length : i; };
const milestoneRank = issue => {
  const m = issue.milestone?.match(/^\s*(\d+)/);
  return m ? Number(m[1]) : issue.milestone ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER;
};
export const compareIssues = (a, b) => prioRank(a) - prioRank(b) || milestoneRank(a) - milestoneRank(b)
  || (a.milestone || '').localeCompare(b.milestone || '') || a.number - b.number;

// issues: open issues carrying a status label, with all comments. prs: open PRs (drafts included).
// states: Map number -> 'OPEN' | 'CLOSED' | 'MERGED' for other referenced numbers; missing counts as closed.
export function plan({ issues, prs, states, owner, repo }) {
  const openIssues = new Set(issues.map(i => i.number));
  const openPrs = new Set(prs.map(p => p.number));
  const isOpen = n => openIssues.has(n) || openPrs.has(n) || states.get(n) === 'OPEN';
  const eligible = [];
  const taken = [];
  for (const issue of issues) {
    if (!issue.labels.some(l => l.startsWith('lane:'))) continue;
    const claims = activeClaims(issue.comments)
      .filter(c => !c.prs.size || [...c.prs].some(isOpen));
    const prList = prs.filter(p => mentions(p, issue.number, owner, repo));
    const labels = issue.labels.filter(l => TAKEN_LABELS.includes(l));
    if (claims.length || prList.length || labels.length) {
      const why = [...(claims.length ? ['claim'] : []), ...(prList.length ? ['open PR'] : []), ...labels];
      const claimants = [...new Set([...claims.map(c => c.agent), ...prList.flatMap(p => claimantsIn(p.body))])];
      taken.push({ issue, why, claimants, prs: prList.map(p => p.number) });
    } else if (has(issue, 'status:todo') && !dependsOn(issue, owner, repo).some(isOpen)) {
      eligible.push(issue);
    }
  }
  eligible.sort(compareIssues);
  taken.sort((a, b) => compareIssues(a.issue, b.issue));
  return { eligible, taken };
}

// Table cells: one line, `|` escaped so a title can't add columns, `<` escaped so it can't open HTML.
export const cell = s => text(s).replace(/\s+/g, ' ').trim()
  .replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/</g, '&lt;') || '-';
const prefixed = (issue, p) => issue.labels.filter(l => l.startsWith(p)).map(l => l.slice(p.length)).join(', ');
const files = issue => {
  const s = section(issue.body, ['files', 'expected files', 'planned files']).replace(/^\s*[-*]\s+/gm, '');
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > FILES_MAX ? `${one.slice(0, FILES_MAX - 3)}...` : one;
};

export function render({ eligible, taken }, now) {
  const stamp = `${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const out = [
    `Updated ${stamp} by \`.github/workflows/next-up.yml\`. Every run rewrites this body, so hand edits are lost.`,
    '',
    'Take the top line your tier allows. Helpers: only `helper-ok` lines. Then claim it as `docs/LANES.md` says:',
    're-read the issue, post `/claim`, and re-read again.',
    '',
    `## Eligible (${eligible.length})`,
    '',
  ];
  if (eligible.length) {
    out.push('| Priority | Issue | Tier | Lane | Model | Helper | Files |', '|---|---|---|---|---|---|---|');
    for (const i of eligible) {
      out.push(`| ${cell(prefixed(i, 'prio:'))} | #${i.number} ${cell(i.title)} | ${cell(prefixed(i, 'tier:'))} | `
        + `${cell(prefixed(i, 'lane:'))} | ${cell(prefixed(i, 'model:'))} | ${has(i, 'helper-ok') ? 'helper-ok' : '-'} | ${cell(files(i))} |`);
    }
  } else out.push('Nothing eligible right now.');
  out.push('', `## Taken (${taken.length})`, '');
  if (taken.length) {
    out.push('| Issue | Why | Claimant | PR |', '|---|---|---|---|');
    for (const t of taken) {
      out.push(`| #${t.issue.number} ${cell(t.issue.title)} | ${cell(t.why.join(', '))} | `
        + `${cell(t.claimants.join(', '))} | ${t.prs.length ? t.prs.map(n => `#${n}`).join(', ') : '-'} |`);
    }
  } else out.push('Nothing taken.');
  return `${out.join('\n')}\n`;
}

function client(fetchImpl, token) {
  const request = async (method, path, body) => {
    const res = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'emberisle-next-up',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json();
    if (!res.ok) throw Object.assign(new Error(`${method} ${path}: ${res.status} ${data?.message ?? ''}`), { status: res.status });
    return data;
  };
  const graphql = async (query, variables, { allowNotFound = false } = {}) => {
    const { data, errors } = await request('POST', '/graphql', { query, variables });
    const fatal = (errors || []).filter(e => !(allowNotFound && e.type === 'NOT_FOUND'));
    if (fatal.length) throw new Error(`GraphQL: ${fatal.map(e => e.message).join('; ')}`);
    return data;
  };
  return { request, graphql };
}

const COMMENTS = 'pageInfo { hasNextPage endCursor } nodes { databaseId createdAt body author { login } }';
const ISSUES = `query($owner: String!, $name: String!, $labels: [String!], $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $after, states: OPEN, labels: $labels, orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes { id number title body milestone { title } labels(first: 50) { nodes { name } } comments(first: 100) { ${COMMENTS} } }
    }
  }
}`;
const MORE_COMMENTS = `query($id: ID!, $after: String) { node(id: $id) { ... on Issue { comments(first: 100, after: $after) { ${COMMENTS} } } } }`;
const PRS = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, states: OPEN, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { number title body author { login } } }
  }
}`;

const comment = c => ({ id: c.databaseId, createdAt: c.createdAt, login: c.author?.login ?? '', body: c.body });

export async function load({ graphql, owner, repo }) {
  const issues = [];
  let after = null;
  for (let page = 0; page < MAX_ISSUE_PAGES; page++) {
    const conn = (await graphql(ISSUES, { owner, name: repo, labels: STATUS_LABELS, after })).repository.issues;
    for (const n of conn.nodes) {
      const comments = n.comments.nodes.map(comment);
      let more = n.comments.pageInfo;
      for (let p = 1; more.hasNextPage && p < MAX_COMMENT_PAGES; p++) {
        const next = (await graphql(MORE_COMMENTS, { id: n.id, after: more.endCursor })).node.comments;
        comments.push(...next.nodes.map(comment));
        more = next.pageInfo;
      }
      issues.push({ number: n.number, title: n.title, body: n.body, milestone: n.milestone?.title ?? null,
        labels: n.labels.nodes.map(l => l.name), comments });
    }
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  const prs = (await graphql(PRS, { owner, name: repo })).repository.pullRequests.nodes
    .map(p => ({ number: p.number, title: p.title, body: p.body, login: p.author?.login ?? '' }));
  const known = new Set([...issues.map(i => i.number), ...prs.map(p => p.number)]);
  const refs = [...neededRefs(issues, owner, repo)].filter(n => !known.has(n));
  const states = new Map();
  for (let i = 0; i < refs.length; i += 50) {
    const chunk = refs.slice(i, i + 50);
    const fields = chunk.map(n => `r${n}: issueOrPullRequest(number: ${n}) { ... on Issue { state } ... on PullRequest { state } }`);
    const data = await graphql(`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields.join(' ')} } }`,
      { owner, name: repo }, { allowNotFound: true });
    for (const n of chunk) if (data.repository[`r${n}`]) states.set(n, data.repository[`r${n}`].state);
  }
  return { issues, prs, states };
}

export async function run({ fetchImpl = fetch, token, repository, dryRun = false, now = new Date(), log = console.log }) {
  const [owner, repo] = repository.split('/');
  const { request, graphql } = client(fetchImpl, token);
  const body = render(plan({ ...(await load({ graphql, owner, repo })), owner, repo }), now);
  if (dryRun) { log(body); return { body }; }
  const pinned = (await request('GET', `/repos/${owner}/${repo}/issues?labels=${LABEL}&state=open&per_page=10`))
    .filter(i => !i.pull_request).sort((a, b) => a.number - b.number)[0];
  if (pinned) {
    await request('PATCH', `/repos/${owner}/${repo}/issues/${pinned.number}`, { body });
    log(`updated #${pinned.number}`);
    return { body, number: pinned.number };
  }
  try { await request('GET', `/repos/${owner}/${repo}/labels/${LABEL}`); }
  catch (error) {
    if (error.status !== 404) throw error;
    await request('POST', `/repos/${owner}/${repo}/labels`, { name: LABEL, color: 'ededed', description: 'The issue the next-up workflow rewrites' });
  }
  const created = await request('POST', `/repos/${owner}/${repo}/issues`, { title: TITLE, body, labels: [LABEL] });
  // Without the label the next run would not find it and would create another.
  if (!created.labels.some(l => l.name === LABEL)) throw new Error(`created #${created.number} without the ${LABEL} label`);
  log(`created #${created.number}`);
  return { body, number: created.number, created: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) { console.error('next-up: GITHUB_TOKEN is not set'); process.exit(1); }
  await run({ token, repository: process.env.GITHUB_REPOSITORY || 'jarrodjohnson-gif/emberisle',
    dryRun: process.argv.includes('--dry-run') });
}
