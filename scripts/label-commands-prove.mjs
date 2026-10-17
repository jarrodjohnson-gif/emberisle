#!/usr/bin/env node
// Executes the deployed inline script with paginated API fixtures. No network or dependencies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/label-commands.yml', import.meta.url), 'utf8');
const source = workflow.split('          script: |\n')[1].split('\n')
  .map(line => line.startsWith('            ') ? line.slice(12) : line).join('\n');
assert.ok(source.includes('const ALLOWED_USERS'));
assert.equal(workflow.includes('actions/checkout'), false);
assert.equal(source.includes('${{'), false, 'untrusted data never becomes an expression');
const owner = 'jarrodjohnson-gif';
const helper = 'joshspicy2';
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const minute = n => `2026-10-16T12:${String(n).padStart(2, '0')}:00Z`;
const comment = (id, body, login = owner, at = minute(id)) =>
  ({ id, body, user: { login, type: 'User' }, created_at: at });
const claim = (id, name, login = owner, at) =>
  comment(id, `/claim\nclaimed: ${name}, 2026-10-16`, login, at);
const pause = (id, name, slash = true) =>
  comment(id, `${slash ? '/paused\n' : ''}paused: ${name}, 2026-10-16`);
const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

function fixture(comments, options = {}) {
  const state = {
    comments: structuredClone(comments), labels: [...(options.labels || ['status:todo'])],
    reactions: structuredClone(options.reactions || []), timeline: options.timeline || [],
    prs: options.prs || {}, calls: [], warnings: [], reactionId: 1000,
  };
  const page = (data, args) => {
    assert.equal(args.per_page, 100);
    // Tiny pages force pagination in every scenario, including bot replies and reactions.
    return { data: data.slice(((args.page || 1) - 1) * 2, (args.page || 1) * 2) };
  };
  const rest = {
    issues: {
      listComments: async args => page(state.comments, args),
      get: async () => ({ data: { number: 694, labels: state.labels.map(name => ({ name })) } }),
      listEventsForTimeline: async args => page(args.issue_number === 694 ? state.timeline : (state.prs[args.issue_number]?.timeline || []), args),
      getLabel: async ({ name }) => {
        const canonical = ['status:todo', 'status:claimed', 'status:in-review', 'status:done',
          'status:canceled', 'mark:changed', 'lane:core'].find(l => l.toLowerCase() === name.toLowerCase());
        if (!canonical) throw notFound();
        return { data: { name: canonical } };
      },
      removeLabel: async ({ name }) => { state.labels = state.labels.filter(l => l !== name); },
      addLabels: async ({ labels }) => { state.labels = [...new Set([...state.labels, ...labels])]; },
      createComment: async ({ body }) => {
        state.comments.push({ id: 5000 + state.comments.length, body, user: bot, created_at: minute(59) });
      },
    },
    pulls: { get: async ({ pull_number }) => {
      state.calls.push(['pr', pull_number]);
      if (!state.prs[pull_number]) throw notFound();
      return { data: state.prs[pull_number] };
    } },
    reactions: {
      listForIssueComment: async args => page(state.reactions.filter(r => r.comment_id === args.comment_id), args),
      createForIssueComment: async ({ comment_id, content }) => {
        // GitHub makes a user's same reaction idempotent.
        if (!state.reactions.some(r => r.comment_id === comment_id && r.content === content && r.user.login === bot.login)) {
          state.reactions.push({ id: state.reactionId++, comment_id, content, user: bot });
        }
      },
      deleteForIssueComment: async ({ reaction_id }) => {
        state.reactions = state.reactions.filter(r => r.id !== reaction_id);
      },
    },
  };
  const github = { rest, paginate: async (route, args) => {
    const all = [];
    for (let n = 1; ; n++) {
      const result = await route({ ...args, page: n });
      all.push(...result.data);
      if (result.data.length < 2) return all;
    }
  } };
  state.run = async id => {
    const trigger = state.comments.find(c => c.id === id);
    assert.ok(trigger);
    const context = { repo: { owner, repo: 'emberisle' }, payload: {
      issue: { number: 694, labels: [{ name: 'status:stale-event' }] }, comment: trigger,
    } };
    const core = { notice() {}, warning(message) { state.warnings.push(message); } };
    const execute = vm.runInNewContext(`(async (github, context, core) => {\n${source}\n})`, {}, { timeout: 1000 });
    await execute(github, context, core);
  };
  state.has = (id, content) => state.reactions.some(r => r.comment_id === id && r.content === content && r.user.login === bot.login);
  state.replies = id => state.comments.filter(c => c.user.login === bot.login && c.body.includes(`<!-- claim-refusal:${id} -->`));
  return state;
}
function winner(state, accepted, denied = []) {
  assert.ok(state.has(accepted, '+1'), `claim ${accepted} approved`);
  for (const id of denied) {
    assert.ok(state.has(id, '-1'), `claim ${id} refused`);
    assert.equal(state.has(id, '+1'), false, `claim ${id} has no bot approval`);
  }
}
let checks = 0;
async function prove(name, run) {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}
await prove('ordered, reversed and cancelled runs choose the earliest claim', async () => {
  for (const order of [[1, 2], [2, 1], [2]]) {
    const s = fixture([claim(1, 'A (GPT-6, claims)'), claim(2, 'B')]);
    for (const id of order) await s.run(id);
    winner(s, 1, [2]);
    assert.deepEqual(s.labels, ['status:claimed']);
    assert.equal(s.replies(2).length, 1);
    assert.ok(s.replies(2)[0].body.startsWith(`Already claimed by A (GPT-6, claims) at ${minute(1)}. Pick another issue.`));
    await s.run(2);
    assert.equal(s.replies(2).length, 1);
  }
});
await prove('timestamp then comment id determines order, independent of API order', async () => {
  const s = fixture([claim(3, 'C', owner, minute(1)), claim(2, 'B', owner, minute(1)), claim(1, 'A', owner, minute(2))]);
  await s.run(1);
  winner(s, 2, [1, 3]);
});
await prove('own pause, historical pause and losing-agent pause', async () => {
  for (const slash of [true, false]) {
    const s = fixture([claim(1, 'A'), claim(2, 'B'), pause(3, 'B'), pause(4, 'A', slash), claim(5, 'C')]);
    await s.run(5);
    winner(s, 1, [2]);
    winner(s, 5);
  }
  const s = fixture([claim(1, 'A'), pause(2, 'B'), claim(3, 'C')]);
  await s.run(3);
  winner(s, 1, [3]);
});
await prove('released claims remain historically accepted and reruns do not resurrect status', async () => {
  const s = fixture([claim(1, 'A'), pause(2, 'A'), claim(3, 'B'), comment(4, '/in-review\npr: #700')]);
  await s.run(1);
  winner(s, 1);
  winner(s, 3);
  assert.equal(s.replies(1).length, 0);
  assert.deepEqual(s.labels, ['status:in-review']);
  s.comments.push(comment(5, '/changed'));
  await s.run(5);
  assert.deepEqual(s.labels.sort(), ['mark:changed', 'status:in-review']);
});
await prove('issue close and reopen release reservations at their actual time', async () => {
  const s = fixture([claim(1, 'A'), claim(3, 'B'), claim(5, 'C')], { timeline: [
    { id: 22, event: 'closed', created_at: minute(2) },
    { id: 44, event: 'reopened', created_at: minute(4) },
  ] });
  await s.run(5);
  winner(s, 1, [3]);
  winner(s, 5);
});
await prove('linked claimant PR closure releases chronologically; previous losers stay losers', async () => {
  const s = fixture([claim(1, 'A'), comment(2, '/in-review\npr: #700'), claim(3, 'B'), claim(5, 'C')], {
    prs: { 700: { number: 700, body: 'Refs #694', user: { login: owner }, closed_at: minute(4) } },
  });
  await s.run(5);
  winner(s, 1, [3]);
  winner(s, 5);
  assert.equal(s.calls.filter(c => c[0] === 'pr').length, 1, 'PR lookup cached per run');
});
await prove('unrelated PRs and forged PR ownership cannot release the claimant', async () => {
  for (const pr of [
    { body: 'Refs #6940', user: { login: owner } },
    { body: 'Refs #694', user: { login: helper } },
  ]) {
    const s = fixture([claim(1, 'A'), comment(2, '/in-review\npr: #700'), claim(5, 'C')], {
      prs: { 700: { number: 700, closed_at: minute(4), ...pr } },
    });
    await s.run(5);
    winner(s, 1, [5]);
  }
  const s = fixture([claim(1, 'A'), claim(2, 'B'), comment(3, '/in-review\nclaimed: B, 2026-10-16\npr: #700'), claim(5, 'C')], {
    prs: { 700: { number: 700, body: 'Refs #694', user: { login: owner }, closed_at: minute(4) } },
  });
  await s.run(5);
  winner(s, 1, [2, 5]);
});
await prove('reopened PRs keep historical releases and cross-account PRs cannot bind', async () => {
  const s = fixture([claim(1, 'A'), comment(2, '/in-review\npr: #700'), claim(5, 'B')], {
    prs: { 700: { number: 700, body: 'Refs #694', user: { login: owner }, closed_at: null,
      timeline: [{ id: 44, event: 'closed', created_at: minute(4) },
        { id: 66, event: 'reopened', created_at: minute(6) }] } },
  });
  await s.run(5);
  winner(s, 5);
  const cross = fixture([claim(1, 'A'), comment(2, '/in-review\npr: #700', helper), claim(5, 'B')], {
    prs: { 700: { number: 700, body: 'Refs #694', user: { login: helper }, closed_at: minute(4) } },
  });
  await cross.run(5);
  winner(cross, 1, [5]);
});
await prove('standalone status commands and rejected helper claims retain reaction semantics', async () => {
  const s = fixture([comment(1, '/paused')]);
  await s.run(1);
  assert.deepEqual(s.labels, ['status:paused']);
  const signed = fixture([claim(1, 'A', helper)], { labels: ['status:done'] });
  await signed.run(1);
  assert.deepEqual(signed.labels, ['status:done']);
  assert.ok(signed.has(1, '-1'));
  assert.equal(signed.has(1, '+1'), false);
  const combined = fixture([comment(1, '/done\n/todo', helper)]);
  await combined.run(1);
  assert.ok(combined.has(1, '+1'));
});
await prove('unauthorized claims, pauses and commands never affect replay', async () => {
  const s = fixture([claim(1, 'Untrusted', 'mallory'), claim(2, 'A'),
    comment(3, '/paused\npaused: A, 2026-10-16', 'mallory'), claim(4, 'B')]);
  await s.run(1);
  assert.ok(s.has(1, '-1'));
  assert.equal(s.reactions.length, 1);
  await s.run(4);
  winner(s, 2, [4]);
  assert.equal(s.has(1, '+1'), false);
});
await prove('forged reactions and refusal markers cannot become authority', async () => {
  const s = fixture([claim(1, 'A'), claim(2, 'B'),
    comment(3, '<!-- claim-refusal:2 -->'), comment(4, '<!-- claim-refusal:2 -->', 'github-actions[bot]')], {
    reactions: [
      { id: 10, comment_id: 1, content: '-1', user: bot },
      { id: 11, comment_id: 2, content: '+1', user: bot },
      { id: 12, comment_id: 2, content: '+1', user: { login: owner, type: 'User' } },
    ],
  });
  await s.run(2);
  winner(s, 1, [2]);
  assert.equal(s.has(1, '-1'), false);
  assert.equal(s.replies(2).filter(c => c.user.type === 'Bot').length, 1);
});
await prove('owner-only signoffs retain original refusal and external-label protection', async () => {
  for (const command of ['/done', '/canceled']) {
    const s = fixture([comment(1, command, helper)]);
    await s.run(1);
    assert.ok(s.has(1, '-1'));
    assert.deepEqual(s.labels, ['status:todo']);
  }
  for (const command of ['/in-progress', '/changed']) {
    const s = fixture([comment(1, command, helper)], { labels: ['status:done'] });
    await s.run(1);
    assert.ok(s.labels.includes('status:done'));
    if (command === '/in-progress') assert.ok(s.has(1, '-1'));
  }
  const s = fixture([comment(1, '/done'), comment(2, '/in-progress', helper)]);
  await s.run(1);
  await s.run(2);
  assert.deepEqual(s.labels, ['status:done']);
  assert.ok(s.has(2, '-1'));
});
await prove('owner labels, marks, unknown commands and malformed claims preserve boundaries', async () => {
  const s = fixture([comment(1, '/label LANE:CORE\n/changed'), comment(2, '/unchanged')]);
  await s.run(1);
  assert.ok(s.labels.includes('lane:core'));
  await s.run(2);
  assert.equal(s.labels.includes('mark:changed'), false);
  s.comments.push(comment(3, '/label status:done', helper));
  await s.run(3);
  assert.ok(s.has(3, '-1'));
  s.comments.push(comment(4, '/unknown'));
  await s.run(4);
  assert.equal(s.has(4, '+1'), false);
  s.comments.push(comment(5, '/claim'));
  await s.run(5);
  assert.ok(s.has(5, '-1'));
});
await prove('losing claims cannot smuggle status changes through other commands', async () => {
  const s = fixture([claim(1, 'A'),
    comment(2, '/claim\nclaimed: B, 2026-10-16\n/label status:paused\n/changed'),
    comment(3, '/in-review\nclaimed: B, 2026-10-16')]);
  await s.run(2);
  winner(s, 1, [2]);
  assert.deepEqual(s.labels.sort(), ['mark:changed', 'status:claimed']);
  await s.run(3);
  assert.ok(s.labels.includes('status:claimed'));
});
await prove('comment bodies containing executable text remain inert data', async () => {
  const name = 'A $(touch /tmp/pwn) `throw Error()` ${{ secrets.X }}';
  const s = fixture([claim(1, name), claim(2, 'B')]);
  await s.run(2);
  winner(s, 1, [2]);
  assert.ok(s.replies(2)[0].body.includes(name));
});
console.log(`PASS ${checks} workflow proof groups`);
