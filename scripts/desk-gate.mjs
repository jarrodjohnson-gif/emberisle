import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Only a complete desk footer counts. A later complete footer supersedes an older one.
export function deskGate(pr, comments) {
  const footer = [...comments].reverse().map(({ body = '', author_association }) => {
    if (!['OWNER', 'MEMBER', 'COLLABORATOR'].includes(author_association)) return null;
    if (!body.includes('<!-- review-desk -->')) return null;
    const match = body.match(/Reviewer:\s*([^·\r\n]+?)\s*·\s*Builder:\s*([^·\r\n]+?)\s*·\s*Head:\s*([0-9a-f]{40})(?=\s|$)/i);
    if (!match || !match[1].trim() || !match[2].trim()) return null;
    const head = match[3].toLowerCase();
    const cleanHeading = /^\s*(?:#{1,6}\s*)?clean[.!]?\s*$/im.test(body);
    const cleanMarker = [...body.matchAll(/<!--\s*review-desk:\s*clean\s+([0-9a-f]{40})\s*-->/gi)]
      .some((marker) => marker[1].toLowerCase() === head);
    return { reviewer: match[1].trim(), builder: match[2].trim(), head, clean: cleanHeading || cleanMarker };
  }).find(Boolean);
  if (pr.draft) return { state: 'failure', description: 'Draft PR cannot pass the desk gate' };
  if (!footer) return { state: 'failure', description: 'No complete desk review footer' };
  if (!footer.clean) return { state: 'failure', description: 'Desk review is not clean' };
  if (footer.head !== pr.head.sha.toLowerCase()) return { state: 'failure', description: 'Desk review is for a different head' };
  if (footer.reviewer.toLowerCase() === footer.builder.toLowerCase()) return { state: 'failure', description: 'Reviewer and builder must differ' };
  return { state: 'success', description: 'Different-model desk review matches this head' };
}

export async function run({ event, eventName, repository, token, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
  const number = eventName === 'issue_comment' ? (event.issue.pull_request && event.issue.number) : event.pull_request?.number;
  if (!number) return;
  const base = `${apiUrl}/repos/${repository}`;
  async function request(path, options = {}) {
    const response = await fetchImpl(`${base}${path}`, {
      ...options,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...options.headers },
    });
    if (!response.ok) throw new Error(`GitHub API ${path}: ${response.status} ${await response.text()}`);
    return response.json();
  }
  const pr = await request(`/pulls/${number}`);
  if (pr.state !== 'open') return;
  const comments = [];
  for (let page = 1; ; page++) {
    const items = await request(`/issues/${number}/comments?per_page=100&page=${page}`);
    comments.push(...items);
    if (items.length < 100) break;
  }
  const result = deskGate(pr, comments);
  await request(`/statuses/${pr.head.sha}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...result, context: 'desk-gate' }),
  });
  console.log(`desk-gate: PR #${number} head ${pr.head.sha}: ${result.state} — ${result.description}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  await run({ event, eventName: process.env.GITHUB_EVENT_NAME, repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, apiUrl: process.env.GITHUB_API_URL });
}
