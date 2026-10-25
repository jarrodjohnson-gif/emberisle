import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
export const MAX_CLOSES = 5;
const PREFIX = '<!-- emberisle:stale-pr-activity ';
const PROTECTED = new Set([699, 920]); // Permanent desk inbox and Astra archive.
export const CLOSE_COMMENT = 'Closed after 10 days without a push to this PR. The branch is preserved. Reopen this PR and push an update when you are ready, or ask on #916 and the desk adds keep-open.';

export function protectedPr(pr) {
  return pr.state !== 'open' || PROTECTED.has(pr.number)
    || pr.labels.some(label => label.name.toLowerCase() === 'keep-open');
}

export function activity(comments) {
  return comments.flatMap(comment => {
    if (comment.user?.login !== 'github-actions[bot]' || comment.user?.type !== 'Bot') return [];
    if (!comment.body.startsWith(PREFIX) || !comment.body.endsWith(' -->')) return [];
    try {
      const data = JSON.parse(comment.body.slice(PREFIX.length, -4));
      if (!/^[a-f0-9]{40}$/.test(data.sha) || !Number.isFinite(Date.parse(data.observedAt))) return [];
      if (data.labeledAt !== undefined && !Number.isFinite(Date.parse(data.labeledAt))) return [];
      return [{ ...data, id: comment.id }];
    } catch { return []; }
  }).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
}

export function decision(pr, marker, now, { reviews = [], reviewComments = [] } = {}) {
  if (protectedPr(pr)) return 'skip';
  if (pr.draft) {
    if (pr.labels?.some(label => label.name === 'stale') || !marker || marker.sha !== pr.head.sha) return 'initialize';
    return 'skip';
  }
  if (!marker || marker.sha !== pr.head.sha) return 'initialize';
  const observedAt = Date.parse(marker.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > now) return 'skip';
  const age = now - observedAt;
  if (age < 0) return 'skip';

  const latestReview = Math.max(
    ...reviews.map(r => Date.parse(r.submitted_at)).filter(t => Number.isFinite(t) && t <= now),
    ...reviewComments.map(c => Date.parse(c.created_at)).filter(t => Number.isFinite(t) && t <= now),
    0
  );
  if (latestReview > observedAt && now - latestReview < 5 * DAY) {
    return 'initialize';
  }

  const hasStale = pr.labels?.some(label => label.name === 'stale');
  if (hasStale) {
    if (!marker.labeledAt) return 'skip';
    const labeledAt = Date.parse(marker.labeledAt);
    if (!Number.isFinite(labeledAt) || labeledAt > now) return 'skip';
    const labelAge = now - labeledAt;
    if (age >= 10 * DAY && labelAge >= 5 * DAY) return 'close';
    return 'skip';
  }
  if (age >= 5 * DAY) return 'label';
  return 'skip';
}

function markerBody(sha, observedAt, labeledAt) {
  const data = { sha, observedAt };
  if (labeledAt) data.labeledAt = labeledAt;
  return `${PREFIX}${JSON.stringify(data)} -->`;
}

// All requests are fixed GitHub repository endpoints. No branch deletion endpoint exists here.
export async function sweep({ api, enabled, repo, now = Date.now(), event = null, dryRun = false, log = console.log }) {
  if (enabled !== 'on') { log('stale-pr-sweeper: disabled'); return; }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Invalid repository');
  const base = `/repos/${repo}`;
  const getPr = number => api('GET', `${base}/pulls/${number}`);
  const comments = number => api.list(`${base}/issues/${number}/comments`);
  const getReviews = number => (api.list ? api.list(`${base}/pulls/${number}/reviews`) : api('GET', `${base}/pulls/${number}/reviews`));
  const getReviewComments = number => (api.list ? api.list(`${base}/pulls/${number}/comments`) : api('GET', `${base}/pulls/${number}/comments`));
  const writeMarker = async (number, sha, observedAt, old, labeledAt) => {
    if (dryRun) { log(`#${number}: would record activity (${observedAt})`); return; }
    const body = { body: markerBody(sha, observedAt, labeledAt) };
    if (old) await api('PATCH', `${base}/issues/comments/${old.id}`, body);
    else await api('POST', `${base}/issues/${number}/comments`, body);
  };
  const removeStale = async pr => {
    if (!pr.labels.some(label => label.name === 'stale')) return;
    if (dryRun) log(`#${pr.number}: would remove stale`);
    else await api('DELETE', `${base}/issues/${pr.number}/labels/stale`);
  };
  const cleanupStale = async (number, sha, observedAt) => {
    const fresh = await getPr(number);
    if (protectedPr(fresh) || fresh.head.sha !== sha) return;
    const marker = activity(await comments(number));
    if (!dryRun && (marker?.observedAt !== observedAt || marker?.sha !== sha)) return;
    await removeStale(fresh);
  };
  if (event) {
    if (!['opened', 'synchronize', 'reopened'].includes(event.action)) throw new Error('Unsupported event');
    const incoming = event.pull_request;
    const pr = await getPr(incoming.number);
    if (protectedPr(pr) || pr.head.sha !== incoming.head.sha) return;
    const timestamp = Date.parse(incoming.updated_at);
    if (!Number.isFinite(timestamp) || timestamp > now) throw new Error('Invalid push timestamp');
    const old = activity(await comments(pr.number));
    if (old && Date.parse(old.observedAt) > timestamp) return;
    if (old && Date.parse(old.observedAt) === timestamp && now - timestamp >= 5 * DAY) return;
    // Re-read immediately before writing: a queued event must never reset a newer head.
    const fresh = await getPr(pr.number);
    if (protectedPr(fresh) || fresh.head.sha !== incoming.head.sha) return;
    if (!old || Date.parse(old.observedAt) !== timestamp) {
      await writeMarker(pr.number, fresh.head.sha, new Date(timestamp).toISOString(), old);
    }
    await cleanupStale(pr.number, incoming.head.sha, new Date(timestamp).toISOString());
    log(`#${pr.number}: recorded ${event.action} activity`);
    return;
  }

  let closes = 0;
  for (const listed of await api.list(`${base}/pulls?state=open`)) {
    let pr = await getPr(listed.number);
    if (protectedPr(pr)) continue;
    let old = activity(await comments(pr.number));
    let reviews = [], reviewComments = [];
    let action = decision(pr, old, now);
    if (action === 'label' || action === 'close' || pr.labels?.some(l => l.name === 'stale')) {
      reviews = await getReviews(pr.number);
      reviewComments = await getReviewComments(pr.number);
      action = decision(pr, old, now, { reviews, reviewComments });
    }
    if (action === 'skip') continue;
    if (action === 'close' && closes >= MAX_CLOSES) {
      log(`#${pr.number}: deferred close; run cap ${MAX_CLOSES} reached`);
      continue;
    }
    // Every mutation is preceded by a fresh head, label and activity read.
    const fresh = await getPr(pr.number);
    const current = activity(await comments(pr.number));
    let freshReviews = reviews, freshReviewComments = reviewComments;
    if (reviews.length || reviewComments.length) {
      freshReviews = await getReviews(pr.number);
      freshReviewComments = await getReviewComments(pr.number);
    }
    if (fresh.head.sha !== pr.head.sha || decision(fresh, current, now, { reviews: freshReviews, reviewComments: freshReviewComments }) !== action) continue;
    pr = fresh; old = current;
    if (action === 'initialize') {
      const latestReview = Math.max(
        ...freshReviews.map(r => Date.parse(r.submitted_at)).filter(Number.isFinite),
        ...freshReviewComments.map(c => Date.parse(c.created_at)).filter(Number.isFinite),
        0
      );
      const initTime = latestReview > Date.parse(old?.observedAt || 0) && now - latestReview < 5 * DAY
        ? new Date(latestReview).toISOString()
        : new Date(now).toISOString();
      await writeMarker(pr.number, pr.head.sha, initTime, old);
      await cleanupStale(pr.number, pr.head.sha, initTime);
      log(`#${pr.number}: ${dryRun ? 'would start' : 'started'} observation grace period`);
    } else if (dryRun) {
      log(`#${pr.number}: would ${action}`);
      if (action === 'close') closes++;
    } else if (action === 'label') {
      try { await api('GET', `${base}/labels/stale`); }
      catch (error) {
        if (error.status !== 404) throw error;
        try {
          await api('POST', `${base}/labels`, { name: 'stale', color: 'ededed', description: 'No PR push observed for five days.' });
        } catch (creationError) {
          if (creationError.status !== 422) throw creationError;
          await api('GET', `${base}/labels/stale`); // Another writer may have created it.
        }
      }
      const beforeLabel = await getPr(pr.number);
      const beforeMarker = activity(await comments(pr.number));
      if (beforeLabel.head.sha !== pr.head.sha || decision(beforeLabel, beforeMarker, now) !== 'label') continue;
      await api('POST', `${base}/issues/${pr.number}/labels`, { labels: ['stale'] });
      await writeMarker(pr.number, pr.head.sha, beforeMarker.observedAt, beforeMarker, new Date(now).toISOString());
      const afterPr = await getPr(pr.number);
      const afterMarker = activity(await comments(pr.number));
      if (afterPr.head.sha !== pr.head.sha || afterPr.state !== 'open' || !afterMarker
        || afterMarker.sha !== pr.head.sha || Date.parse(afterMarker.observedAt) !== Date.parse(beforeMarker.observedAt)) {
        await removeStale(afterPr);
        continue;
      }
      log(`#${pr.number}: labelled stale`);
    } else {
      const closeBody = `${CLOSE_COMMENT}\n\n<!-- emberisle:stale-pr-close ${pr.head.sha} -->`;
      const existing = await comments(pr.number);
      if (!existing.some(c => c.user?.login === 'github-actions[bot]' && c.user?.type === 'Bot' && c.body === closeBody)) {
        await api('POST', `${base}/issues/${pr.number}/comments`, { body: closeBody });
      }
      const beforeClose = await getPr(pr.number);
      const beforeMarker = activity(await comments(pr.number));
      if (beforeClose.head.sha !== pr.head.sha || decision(beforeClose, beforeMarker, now) !== 'close') continue;
      await api('PATCH', `${base}/pulls/${pr.number}`, { state: 'closed' });
      closes++;
      log(`#${pr.number}: closed; branch preserved`);
    }
  }
}

export function githubApi(token, fetcher = fetch) {
  const request = async (method, path, body) => {
    const response = await fetcher(`https://api.github.com${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const error = new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  };
  request.list = async path => {
    const result = [];
    for (let page = 1; ; page++) {
      const batch = await request('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Invalid list response');
      result.push(...batch);
      if (batch.length < 100) return result;
    }
  };
  return request;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Do not even construct a network client until the owner enables the workflow.
  if (process.env.STALE_PR_SWEEPER !== 'on') console.log('stale-pr-sweeper: disabled');
  else {
    if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required');
    const { readFile } = await import('node:fs/promises');
    const event = process.env.GITHUB_EVENT_NAME === 'pull_request_target'
      ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')) : null;
    await sweep({ api: githubApi(process.env.GITHUB_TOKEN), enabled: process.env.STALE_PR_SWEEPER,
      repo: process.env.GITHUB_REPOSITORY, event, dryRun: process.env.STALE_PR_DRY_RUN === 'true' });
  }
}
