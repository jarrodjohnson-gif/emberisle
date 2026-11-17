# Haiku pre-screen row research for desk board

- status: research
- issue: #1190
- date: 2026-11-13
- author: builder-size
- revision: Codex-p (GPT-6.1 Sol), 2026-11-17

This note is research, not an implementation or authorization to make API calls.
The proposed size thresholds, area allowlist and table layout require approval before implementation.
The owner setup and implementation completion tests remain in [#1190](https://github.com/jarrodjohnson-gif/emberisle/issues/1190).

## Background and Purpose

The review desk board sweeps open pull requests via `scripts/desk-board.mjs`.
The current [routeFor(files)](../../scripts/desk-board.mjs#L39) applies deterministic path patterns.
That path rule routes `server/`, `scripts/`, and `.github/` to Opus.
It routes markdown and doc images to Haiku.
All other files route to Sonnet.
Issue #1190 introduces a lightweight Haiku pre-screen call for green pull requests.
It evaluates diff statistics and file lists to classify pull requests before review.

## Proposed JSON Schema and Enums

The model output must strictly parse as valid JSON.
Every field must pass strict allowlist validation.
Drop the whole model-produced row on any validation failure and retain the deterministic path route.

```json
{
  "size": "S",
  "areas": ["hud", "lobby"],
  "review_route": "sonnet",
  "visual_change": "yes"
}
```

### 1. Size Field

The 50/300-line thresholds below are research proposals, not approved classification rules.

- Type: String enum.
- Values: `"S"`, `"M"`, `"L"`.
- `"S"`: Under 50 lines changed, single component or isolated doc edit.
- `"M"`: 50 to 300 lines changed, standard feature slice or test file.
- `"L"`: Over 300 lines changed, cross-cutting subsystem modification.

### 2. Areas Field
- Type: Array of string enums.
- Proposed maximum length: 3 areas; approval remains required.
- Proposed allowlist values; approval remains required:
  - `"hud"`: Player tray, dice, resource cards, and action buttons.
  - `"scene"`: 3D island, board mesh, camera, water, and lighting.
  - `"net"`: WebSocket protocol, room coordination, and reconnection.
  - `"sound"`: Audio clips, music mixer, and soundboard effects.
  - `"rules"`: Game state machine, turn phases, and dice rolls.
  - `"profile"`: Player identity, PIN recovery, stats, and records.
  - `"lobby"`: Table creation, join links, seat options, and wait shelf.
  - `"docs"`: Markdown specifications, research notes, and manuals.
  - `"ci"`: GitHub Actions workflows, proof registration, and build tooling.
  - `"deps"`: Dependency package updates and runtime libraries.
- Never accept free-text area values outside the approved allowlist.

### 3. Review Route Field
- Type: String enum.
- Values: `"haiku"`, `"sonnet"`, `"opus"`, using the spellings in #1190.
- The deterministic path rule from #1180 remains the absolute floor.
- The model may raise the route from Haiku to Sonnet or Opus.
- The model may raise the route from Sonnet to Opus.
- The model may never lower the route below the path floor.

### 4. Visual Change Field
- Type: String enum.
- Values: `"yes"`, `"no"`.
- `"yes"`: The change modifies CSS, layout markup, 3D assets, or shaders.
- `"no"`: The change modifies pure logic, backend state, tests, or documentation.
- A value of `"yes"` alerts reviewers that visual proofs or screenshots are required.

## Desk Board Markdown Table Integration

The desk board table in issue #916 currently displays seven columns:
`| PR | Head | checks | Reviewed head | State | Route | Reason |`

The proposed integration updates the table layout:
`| PR | Head | checks | Pre-screen | State | Route | Reason | Tokens |`

- **Pre-screen column**: Combines size, areas, and visual indicator into a compact string.
  - Example: `S · hud, lobby · vis:yes`
  - Example: `M · net · vis:no`
- **Route column**: Displays the effective route after applying floor enforcement.
- **Tokens column**: Tracks cumulative input and output tokens consumed.

## Security and Safety Constraints

1. **Untrusted Input**:
   - Treat model responses as completely untrusted data.
   - Parse responses with strict JSON schema validators.
   - Reject any response containing unlisted properties or invalid enums.
   - Drop the whole model-produced row and retain the path route whenever validation fails.

2. **No Prompt Injection Exposure**:
   - Encode PR titles and filenames as isolated JSON data under the fixed system prompt.
   - Never concatenate PR text directly into executable shell strings.
   - Never write model output directly into git commit messages or review comments.

3. **Workflow Isolation**:
   - The pre-screen call must never run on `pull_request` or `pull_request_target` events.
   - It runs only on scheduled or manually dispatched board maintenance workflows.
   - Never check out PR code in the pre-screen runner.
   - Read metadata solely through authenticated GitHub REST API calls.

4. **Rate Limits and Cost Control**:
   - Maximum 10 API calls per workflow execution.
   - The existing [DAILY_LIMIT](../../scripts/desk-board.mjs#L10) caps board notifications, not model calls.
   - This note chooses no daily model-call cap. Resolve that value on #1190 before implementation.
   - Cache results by head commit SHA to prevent redundant invocations.
   - The owner supplies the API secret and console spend cap described in #1190; this PR changes neither.

## Verification Plan and Test Fixtures

A future registered proof must cover these six scenarios before #1190 can satisfy its completion test:

1. **Valid Payload**:
   - Input: Valid JSON matching all enum constraints.
   - Assertion: Successfully updates row fields and applies valid routing.

2. **Lowered Route Attempt**:
   - Input: Path rule demands Opus; model returns Haiku.
   - Assertion: Floor rule overrides model; route remains Opus.

3. **Invalid Enum**:
   - Input: Unknown area value or invalid size value.
   - Assertion: Reject the whole model-produced row and retain the path route.

4. **Malformed JSON**:
   - Input: Non-JSON text or syntax error.
   - Assertion: Reject the whole model-produced row on the parse error and retain the path route.

5. **Prompt Injection Payload**:
   - Input: JSON with an injected, unlisted free-text field.
   - Assertion: Reject the whole model-produced row, not just the unexpected text; retain the path route.

6. **Missing Required Field**:
   - Input: JSON omitting a required field, such as `visual_change`.
   - Assertion: Reject the whole model-produced row and retain the path route.

No API call, secret, workflow, script, notification limit or spend setting changes in this research PR.
