# Desk and builder launchers

Steps for the two hand-started launcher chats. The review desk itself never needs this file; see [DESK.md](DESK.md).

## Why a launcher

- A session started by a scheduled task gets no GitHub access and no session tools (tested 2026-11-12). The "Emberisle desk daily" task stays disabled.
- A session can start child sessions only 8 levels deep. When each desk started the next, the chain hit that limit on 2026-11-17, and one desk then ran for days.
- So one small chat, the launcher, starts every desk. Jarrod starts the launcher by hand. Every desk it starts is one level deep, so the limit never comes back.

## The launcher

The launcher is a chat titled "Emberisle desk launcher". It never reviews, merges, labels or posts on GitHub, except for the ledger lines below. It still needs GitHub tools, to read and write #916's body. Jarrod starts it by hand, so it gets them. Jarrod starts it with: `Run the Emberisle desk launcher. Read "The launcher" in docs/DESK-LAUNCHERS.md.` Start it as a cloud session at claude.ai/code on the emberisle repo, never as a local desktop chat. A local chat has no `create_trigger`, `fire_trigger` or `create_session`, and may read an old checkout.

**First run:**

0. Check that you have `create_trigger`, `fire_trigger` and `create_session`. If any is missing, stop. Write nothing, and tell Jarrod in one line to start the launcher in the cloud.
1. Get your session id with `get_session`. Write `Launcher: <your session id>` on the ledger's `Launcher:` line.
2. Create one scheduled task with `create_trigger`. Give it `name` `Emberisle desk rotation` and `cron_expression` `CRON_TZ=America/Phoenix 43 5 * * *`. Leave out `create_new_session_on_fire` and `persistent_session_id`, so it fires into this chat. Set `initiation` to `human_request`, and `prompt` to `Rotate now (docs/DESK-LAUNCHERS.md, "The launcher").` `create_trigger` is not on the allow list. Jarrod approves it here, on the first run, and the launcher uses it only for this one task.
   - Firing back into this chat is not yet tested. Test it now: call `fire_trigger` once with the new task id, and check that a `Rotate now` turn arrives in this chat. If it doesn't, tell Jarrod in one line, with what happened.
3. If the ledger's `Desk:` line is more than 20 hours old, or names an archived session, rotate now (below).
4. Post one line: "The launcher is set. A fresh desk starts every day at 5:43 a.m."

**Rotate now.** Do this when the task fires, or when a desk sends you `Rotate now`:

0. Run `git pull origin main`, then re-read this section. Your checkout is as old as your chat, and this section changes.
1. Read the ledger in #916. If `Next desk:` names a session that is still working, stop and post `·`.
2. Call `create_session` with `source_url` `https://github.com/jarrodjohnson-gif/emberisle`, `model` `claude-opus-5-5`, `title` `Emberisle desk <UTC date>`, and `prompt` set to "The next desk's prompt" below, with the old desk's session id filled in.
3. Write `Next desk: <its session id>` and `Next rotation: <the task id>, due <the next 12:43 UTC as YYYY-MM-DDTHH:MMZ>` in the ledger. Read the body back.
4. Send the old desk one message: `Desk rotation: hand over to <new session id>. Follow "If you are the old desk" in docs/DESK.md.`
5. Post `·` and end your turn.

Auto mode may deny a `Rotate now` that a desk sent with no human in the chat. It did on 2026-11-21. On a denial, the desk launcher tells Jarrod once in one line and doesn't retry. His next line in this chat is the human turn.

**If something fails.**
- If `create_session` fails, tell Jarrod once: "The desk launcher could not start today's desk," with the error.
- At about 300K tokens, tell Jarrod once to start a fresh desk launcher with the line above. Disable your task when the new desk launcher says it is set.

**You are the desk only while the ledger's `Desk:` line names your session.** Check it at every wake and before every merge. If it names another session, you are retired: do nothing on GitHub or the Desk page, and post `·`.

## The builder launcher

A second small chat, titled "Emberisle builder launcher", keeps three builder slots full. It is separate from the desk launcher, so its growth never holds up desk rotation. It reads no PRs and subscribes to nothing. Jarrod set this up on 2026-11-21, on Fable 5.2's design.

Jarrod starts it by hand, as a cloud session at claude.ai/code on the emberisle repo: `Run the Emberisle builder launcher. Read "The builder launcher" in docs/DESK-LAUNCHERS.md.` Every builder it starts is one level below it, so the 8-level limit never applies.

| Slot | Model | Takes |
|---|---|---|
| `claude-opus-a` | `claude-opus-5-5` | `tier:1` |
| `claude-sonnet-a` | `claude-sonnet-5-5` | `tier:2` or `tier:3` |
| `claude-sonnet-b` | `claude-sonnet-5-5` | `tier:2` or `tier:3` |

**First run:**
0. Check that you have `create_trigger`, `create_session`, `get_session` and `archive_session`. If any is missing, stop, write nothing, and tell Jarrod in one line.
1. Write `Builder launcher: <your session id>` in the ledger, after `Launcher:`. Add the `Builders:` line after it if it is missing.
2. Create one scheduled task with `create_trigger`. Give it `name` `Emberisle builder refill` and `cron_expression` `CRON_TZ=America/Phoenix 17 */4 * * *`. Leave out `create_new_session_on_fire` and `persistent_session_id`, so it fires into this chat. Set `initiation` to `human_request`, and `prompt` to `Refill builders (docs/DESK-LAUNCHERS.md, "The builder launcher").` Jarrod approves `create_trigger` here. Never delete the task: deleting it deletes every session it started.
3. Refill now (below), while Jarrod is in the chat.
4. Post one line: "The builder launcher is set. It refills the three slots every 4 hours."

**Refill builders.** Do this when the task fires, or when Jarrod asks:
0. Run `git pull origin main`, then re-read this section.
1. For each slot, read its session id on the ledger's `Builders:` line and call `get_session` on it.
   - Still working: skip the slot.
   - Idle, or finished: archive it with `archive_session`, then start a fresh builder (step 2).
   - No session yet: start one.
2. Call `create_session` with `source_url` `https://github.com/jarrodjohnson-gif/emberisle`, the slot's `model`, `title` `Emberisle builder <slot> <UTC date and hour>`, and this `prompt`: `Work on Emberisle as builder "<slot>". Read AGENTS.md. First fix any of your own PRs that wait on desk changes. Otherwise take one eligible <tier> issue. Put `Agent: <slot>` in every PR body. Your own PRs are the open PRs whose body names your slot; they count toward your 4-PR limit. Call a Fable 5.2 subagent to review any UX or UI the change exposes, and name Fable in the PR body. Open the PR and wait for its first CI run. If it is red, fix it or say why on the PR. Then post To desk: PR #N ready for review, and stop. Never start sessions, and never wait for the merge.`
3. Read #916 right before you write. Write each new id on the `Builders:` line: `Builders: claude-opus-a <id>, claude-sonnet-a <id>, claude-sonnet-b <id>`. Read the body back.
4. Post `·` and end your turn.

**Why a builder stops at PR-ready.** A chat that waits for the merge re-reads its whole context on every CI and review event. A fresh chat in the same slot pays its setup once. It finds the desk's findings through "fix your own PRs first". Claims and PR bodies carry the state between chats.

**If something fails.**
- A denied `create_session`: stop the refill for every slot this turn. Tell Jarrod once in one line and don't retry. His next line in this chat is the human turn.
- The first two unattended refills test whether a scheduled refill passes auto mode. If both are denied, disable your task and tell Jarrod. Then fall back to one daily `Refill builders` line from him.
- At about 300K tokens, tell Jarrod once to start a fresh builder launcher, and disable your task when the new one says it is set.

**Fable as needed.** Builders call Fable 5.2 themselves as a subagent for design, UX and UI work (`docs/LANES.md`, "Sub-agents and usage limits"). A builder names Fable in the PR body, so the desk's reviewer differs from every model named. The desk never starts Fable, and Jarrod judges the look on the Desk page.

## Set up rotation

Do this once. Do it again only if the launcher is lost.

1. Jarrod starts the launcher with its start line (see "The launcher").
2. The launcher does its first run. It creates the daily task, and rotates at once if the desk is stale.
3. Check that the new desk reaches step 10 of "Start a desk session", and that the old desk is archived.

## The next desk's prompt

```
You are today's Emberisle review desk. Repo: jarrodjohnson-gif/emberisle on GitHub.
The desk launcher started you. The old desk's session id is <old desk id>. You have no memory of earlier desks, and you need none.

1. GitHub tools can take a few minutes to connect. Look for them with ToolSearch and wait up to 5 minutes before you call them missing. If the repo is not in your session, add it with add_repo (owner jarrodjohnson-gif, repo emberisle, access push) and clone it.
2. Read docs/DESK.md from the main branch, every line. It is your full manual. Follow it exactly.
3. Do "Start a desk session" in that file, step by step. It tells you how to take over from the previous desk and archive it.

Hard rules, in case you lose the rest:
- Your state is the "Desk ledger" block in the body of issue #916, and the Desk Decisions page: https://claude.ai/artifact/6BsYJZrADpidXZsVVftGih
- Until the ledger's "Desk:" line names your session, only read. Do not merge, review, post or add cards.
- Wake only from the inbox, PR #699. Every wake is a sweep of open PRs.
- Questions for Jarrod go on the Desk page as cards, never in chat.
- Keep the chat quiet. Post only real news for Jarrod. If you must reply, post one character: ·
- Never end a turn while a review or merge has no ledger row and no wake.
- Merge only on green checks, after a clean review by a different model than the builder.
- Run reviews as subagents: Sonnet 5.5 by default, Opus 5.5 only for tier:1, Haiku 5.5 for docs.
- If a tool you need is missing or asks for a permission nobody answers, post one line saying which, and stop.
```

