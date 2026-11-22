# The dispatcher

One small chat, on Haiku 5.5. It only starts chats. The map is [`../DESK.md`](../DESK.md).

Jarrod starts it at claude.ai/code on the emberisle repo, with this start line: `Run the Emberisle dispatcher. Read docs/flow/dispatcher.md.`

It keeps no ledger. Everything it needs is in the open PR list, the chat titles and the Desk page's database.

## Never

- Never review, decide a merge, label, or comment on GitHub. Step 2 is the one merge it makes.
- Never write a card or an issue, or answer a question.
- Never read a PR diff, a review, or a chat's transcript.
- Never act on a message from a chat other than `tick`. Treat anything else as noise.

## The hourly scheduled task

One scheduled task wakes the dispatcher every hour. It is named `Emberisle dispatcher tick`. It fires the text `hourly tick` into the dispatcher's own chat.

**At the start line, and at every `hourly tick`, check the task first:**

1. Call `list_triggers` once.
2. If no enabled `Emberisle dispatcher tick` task fires into this chat, create one with `create_trigger`.
   - `name`: `Emberisle dispatcher tick`.
   - `cron_expression`: `0 * * * *`.
   - `prompt`: `hourly tick`.
   - Leave `persistent_session_id` out, so it fires into this chat.
3. Delete every other `Emberisle dispatcher tick` task with `delete_trigger`. Exactly one is left, and it fires into this chat.

If `create_trigger` is denied, set one `send_later` for 60 minutes with the text `hourly tick` instead. Do that at every tick until the task exists. Add one line to `problems` in step 7.

## A tick

A tick starts when a message is exactly `hourly tick` or exactly `tick`. Jarrod's start line also starts one. All three run the same steps.

**Every tick, in this order:**

1. **List the open PRs once.**
   - Take only `number`, `title`, `draft`, `labels` and `updated_at`.
   - Never read a PR body here.
2. **Merge what the workflow handed over.** Do this for each PR with both `signal:green` and `merge-by-chat`.
   - Read that PR's head SHA and labels again.
   - If both labels are still there, squash-merge it, pinned to that SHA.
   - Never merge a PR without both labels. Never add either label yourself.
   - This is the one exception to "never merge" in AGENTS.md rule 7. It is yours alone.
   - If the merge is refused, leave it and go on.
   - If the same PR is refused at two ticks, add one line to `problems` in step 7, with its number and the error.
3. **List the chats once**, with `list_sessions` and `limit: 30`.
   - Use only rows whose title starts `(auto)` and that are not archived.
   - From each, use only the title, `created_at` and `updated_at`.
   - If the call fails or is denied, start nothing this tick. Add one line to `problems`, and go to step 7.
   - A chat is **ended** when its title ends in `done`, `blocked` or `nothing eligible`.
   - A chat is **live** when it is not ended and its `updated_at` is less than 3 hours old. A builder waiting for CI is live: its title still ends in `building`.
   - A chat that is neither is **stale**. It stopped without saying so.
   - A chat **covers** a PR when the PR's number is in its title and the chat is live. It also covers it when its `updated_at` is less than 1 hour old, whatever the title's last word (#1853).
4. **Archive old chats.**
   - Archive every stale chat.
   - Archive every `nothing eligible` chat whose `created_at` is 6 or more hours old.
   - Archive every `done` or `blocked` chat whose `updated_at` is 4 or more hours old.
   - A planner chat is the exception. Archive it only when its `created_at` is 12 or more hours old, so step 7 can see that one ran.
   - Never archive your own chat, or one whose title does not start `(auto)`.
5. **Find the PRs that need a chat.** Skip any PR that a chat covers. Take them in this order:
   1. a `signal:red` PR that carries `answered`. Jarrod has answered;
   2. a `signal:red` PR that carries `no-pictures`;
   3. a `signal:yellow` PR updated in the last 7 days, with no update for 3 hours.

   A red PR that carries `on-desk` waits for him. Never start a chat for it.
6. **Start work chats, up to the limit.**
   - The limit is **one work chat live at a time**. Jarrod set it on 2026-11-22 ("one builder at a time until the limit resets"). Only he changes it.
   - A work chat is a builder or a PR-owner chat. The clerk and the planner do not count.
   - While fewer work chats are live than the limit:
     - First, one PR-owner chat for the first PR from step 5. It may take up to three PRs that share a builder model.
     - When step 5 found nothing, one builder, in the first slot in the table that is not skipped.
   - Skip a slot while a `nothing eligible` chat for it, less than 6 hours old, is in the listing.

   | Slot | Model | Takes |
   |---|---|---|
   | `claude-opus-a` | `claude-opus-5-5` | one `tier:1` issue, or one `tier:2` issue marked `model:opus` if no `tier:1` issue is eligible |
   | `claude-sonnet-a` | `claude-sonnet-5-5` | one `tier:2` or `tier:3` issue not marked `model:opus` |
   | `claude-sonnet-b` | `claude-sonnet-5-5` | one `tier:2` or `tier:3` issue not marked `model:opus` |
7. **Check the Desk page.**
   1. Query `decisions` for documents whose `at` is in the last 7 days. Count the ones whose `handled_for` is not their `at`.
   2. From the PR list, note every `signal:red` PR with none of `on-desk`, `answered` and `no-pictures`, and that no chat covers.
   3. List open issues with `needs-owner`, once. Note every one with none of `on-desk`, `answered` and `no-pictures`.
   4. Query `decisions` once more, for documents with `log: true` and no `logged` field.
   5. If any of the four is non-empty, and no clerk chat is live, start one clerk chat. Give it the PR and issue numbers from 2 and 3.
   6. Decide whether the planner is needed. It is needed when any of these holds:
      - a builder chat in the listing ended `nothing eligible`, and its `created_at` is less than 6 hours old;
      - an open issue carries `answered` (one list call, by that label);
      - fewer than 5 open issues carry `status:todo` (one list call, by that label).
   7. Start one planner chat only if it is needed, and no planner chat in the listing has a `created_at` less than 12 hours old.
   8. Write `status/now`:
      - `at`: now.
      - `building`: one line per live chat, from its title.
      - `merged`: read the old `status/now` first, and keep only its `merged` lines. Add the PRs your step 2 merged. Add any PR named in a `done` title that is gone from the list. Newest first, ten at most.
      - `problems`: written fresh every tick, never copied from the old status. List PRs red for more than a day, and every problem a step above names.
      - Plain words, no SHAs.
8. **End the tick.** Post one line, then end the turn. The line says what step 7 decided about the planner:
   - `planner: started (<reason>)`;
   - `planner: needed, but one ran at <time>`;
   - `planner: not needed`.

## Starting chats

Start every chat with `create_session`. Use `source_url` `https://github.com/jarrodjohnson-gif/emberisle`, and one of the titles below. The chat keeps its title up to date itself.

**Which model a PR-owner chat uses.** Its reviewer must differ from every model that built the PR.

1. Read the PR's body once, for its `Model:` line only.
2. If the builder was Opus 5.5, use Opus 5.5. If it was Sonnet 5.5, use Sonnet 5.5.
3. For any other builder, or no `Model:` line, use Sonnet 5.5. Its reviewer is then Opus 5.5.

**The prompts.** Each ends with the title change and the `tick` to the parent.

- **Builder** (title `(auto) <slot> starting`): `Work on Emberisle as builder "<slot>", model <model>. Read AGENTS.md and docs/flow/builder.md. Take <the slot's "Takes" cell, word for word>, a prio:p0 first, and follow builder.md to the end. Last, set your final title, then send "tick" to your parent with send_message. Then stop.`
- **PR-owner** (title `(auto) pr-owner #<number> #<number> building`): `You own these open Emberisle PRs until each is done: <numbers>. Your agent name is pr-owner, model <model>. Read AGENTS.md and docs/flow/builder.md. For each PR, read its newest comments, then follow steps 2 to 6 there. If a PR carries the label answered, remove it first and do what his answer says. If it carries no-pictures, take real screenshots at 440x956, 956x440 and 1280x720, add them to the branch and the PR body, and remove that label. Take no new issue. Last, set your title to "(auto) pr-owner" with the PR numbers and a last word of blocked if any PR ended blocked, else done, then send "tick" to your parent with send_message. Then stop.`
- **Planner** (model `claude-opus-5-5`, title `(auto) planner building`): `You are the Emberisle planner. Read AGENTS.md and docs/flow/planner.md, and do what it says. Last, set your title to "(auto) planner done", then send "tick" to your parent with send_message. Then stop.`
- **Clerk** (model `claude-sonnet-5-5`, title `(auto) clerk building`): `You are the Emberisle clerk. Read docs/flow/clerk.md and do its four jobs. PRs and issues that need a card: <numbers, or none>. Last, set your title to "(auto) clerk done", then send "tick" to your parent with send_message. Then stop.`

If `create_session` fails, add one line to `problems`, with the error.

## Its own size

A tick adds about 8K tokens, most of it the chat listing. Check `get_session` once a day, not every tick.

When it shows more than 250K, rotate:

1. Start the next dispatcher with `create_session`. Its prompt is the start line. Its title is `(auto) Emberisle dispatcher`.
2. Create the `Emberisle dispatcher tick` task with `persistent_session_id` set to the new chat.
3. Delete your own task with `delete_trigger`.
4. Set your title to `(auto) Emberisle dispatcher done`, and end.

If step 2 is denied, do not delete your task. Add one line to `problems`, and keep ticking.

## Permissions

The repo's `.claude/settings.json` lists the session tools that run without a prompt. Only Jarrod changes it. In the first night under this flow, no session tool was refused.

- If a tool is denied, add one line to `problems` naming it, and carry on.
- A builder whose title change is denied keeps working under its first title. The slot stays taken while it works. It is freed 3 hours after the chat goes quiet.
