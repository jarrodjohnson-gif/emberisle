# Running Emberisle builders on AWS Bedrock models (draft)

For Jarrod's Bedrock credits. Models: Kimi K3, GLM 5.3, Grok 4.7. Draft.

## Who does what

| Role | Model | Tier it may take (`docs/LANES.md`) |
|---|---|---|
| Builder (provisional) | Kimi K3, GLM 5.3 | `tier:2`, one issue at a time until two clean merges. K3 is slow, so give it defined work. |
| Builder | Grok 4.7 | `tier:2` and `tier:3`. One issue at a time. |
| Cross-review | K3 reviews GLM, GLM reviews K3, either reviews Grok | review only |

Not on Bedrock, stays on Claude: the desk (Sonnet) and every `tier:1` review of server, protocol, CI or
security work (Opus). A reviewer is never the builder's own model (`docs/DESK.md`).

## One-time AWS setup (on your own computer, not a cloud session)

`aws login` opens a browser, so this must run locally.

1. Install the AWS CLI v2 and `uv`.
2. `aws configure set region us-east-2 --profile <profile>`
3. `aws login --region us-east-2 --profile <profile>` (browser sign-in)
4. `aws sts get-caller-identity --profile <profile>` should print your account.
5. In the Bedrock console (us-east-2) open Model catalog and confirm access to Kimi K3, `zai.glm-5.3`
   and `xai.grok-4.7`. Models marked "Cross-region inference" may need an
   inference-profile ID (for example a `us.` prefix). Copy the exact ID from the console.
6. Optional, for AWS tooling: `aws configure agent-toolkit --yes --region us-east-1 --profile <profile>`.
   The toolkit only exists in us-east-1. Do not append its rules to this repo's `CLAUDE.md`.

## Agent harness

Claude Code only drives Claude models on Bedrock. Use a harness that supports Bedrock, such as OpenCode.
Check its current docs for the exact config keys:

- provider: Amazon Bedrock, region `us-east-2`, profile `<profile>`
- model: the exact ID from step 5

## Start a builder

In the harness, with the repo cloned (a fork is fine):

    Work on Emberisle. Read AGENTS.md and the Agent hub, issue #854, first. You are a builder. Your model
    is Grok 4.7. Take the top eligible tier:2 or tier:3 line in docs/LANES.md. /claim before coding.
    At most 2 open PRs. Never merge, never push to main, never loosen a test.

For a long unattended run: `/loop Read AGENTS.md and follow it.` (or the harness equivalent).

## Labels

The desk adds `model:kimi-k3`, `model:glm-5.3` or `model:grok-4.7` to issues meant for that model. Take only issues that name your model or have no `model:` label. Abilities and limits: `docs/LANES.md`, "Model labels and abilities".

## Spend control

- One small issue per PR. Keep prompt caching on.
- Let CI run the 20-minute browser proofs. The agent runs only the proof for its own change, one at a time.
- Watch the Bedrock cost dashboard daily for the first week.

## Repo rules

The tier rows are in `docs/LANES.md` and the decision is in `docs/DECISIONS.md`. Bedrock agents never merge. Reviewers follow `docs/REVIEWING.md` (a different model from the builder).
