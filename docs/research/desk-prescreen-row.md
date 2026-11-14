# Haiku pre-screen row research for desk board

- status: research
- issue: #1190
- date: 2026-11-13
- author: builder-size

## Background and Purpose

The review desk board sweeps open pull requests via `scripts/desk-board.mjs`.
Currently, routing uses deterministic path patterns in `routeFor(files)`.
That path rule routes `server/`, `scripts/`, and `.github/` to Opus.
It routes markdown and doc images to Haiku.
All other files route to Sonnet.
Issue #1190 introduces a lightweight Haiku pre-screen call for green pull requests.
It evaluates diff statistics and file lists to classify pull requests before review.

## Proposed JSON Schema and Enums

The model output must strictly parse as valid JSON.
Every field must pass strict allowlist validation.
Any validation failure causes immediate fallback to the path rule.

```json
{
  "size": "S",
  "areas": ["hud", "lobby"],
  "review_route": "Sonnet",
  "visual_change": "yes"
}
```

### 1. Size Field
- Type: String enum.
- Values: `"S"`, `"M"`, `"L"`.
- `"S"`: Under 50 lines changed, single component or isolated doc edit.
- `"M"`: 50 to 300 lines changed, standard feature slice or test file.
- `"L"`: Over 300 lines changed, cross-cutting subsystem modification.

### 2. Areas Field
- Type: Array of string enums.
- Maximum length: 3 tags.
- Allowlist values:
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
- No free-text tags are permitted.

### 3. Review Route Field
- Type: String enum.
- Values: `"Haiku"`, `"Sonnet"`, `"Opus"`.
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

- **Pre-screen column**: Combines size, tags, and visual indicator into a compact string.
  - Example: `S · hud, lobby · vis:yes`
  - Example: `M · net · vis:no`
- **Route column**: Displays the effective route after applying floor enforcement.
- **Tokens column**: Tracks cumulative input and output tokens consumed.

## Security and Safety Constraints

1. **Untrusted Input**:
   - Model responses are treated as completely untrusted data.
   - Parse responses with strict JSON schema validators.
   - Reject any response containing unlisted properties or invalid enums.
   - Fall back silently to the path rule whenever validation fails.

2. **No Prompt Injection Exposure**:
   - PR author titles and filenames are formatted strictly as isolated JSON data.
   - Never concatenate PR text directly into executable shell strings.
   - Never write model output directly into git commit messages or review comments.

3. **Workflow Isolation**:
   - The pre-screen call must never run on `pull_request` or `pull_request_target` events.
   - It runs only on scheduled or manually dispatched board maintenance workflows.
   - PR code is never checked out in the pre-screen runner.
   - Metadata is queried solely through authenticated GitHub REST API calls.

4. **Rate Limits and Cost Control**:
   - Maximum 10 API calls per workflow execution.
   - Daily limit capped at 24 calls to match `DAILY_LIMIT`.
   - Results are cached by head commit SHA to prevent redundant invocations.
   - Target API spend remains between $5 and $10 monthly.

## Verification Plan and Test Fixtures

A dedicated proof script `scripts/desk-prescreen-prove.mjs` will test five scenarios:

1. **Valid Payload**:
   - Input: Valid JSON matching all enum constraints.
   - Assertion: Successfully updates row fields and applies valid routing.

2. **Lowered Route Attempt**:
   - Input: Path rule demands Opus; model returns Haiku.
   - Assertion: Floor rule overrides model; route remains Opus.

3. **Invalid Enum**:
   - Input: Unknown area tag or invalid size value.
   - Assertion: Parser rejects payload; falls back to path rule.

4. **Malformed JSON**:
   - Input: Non-JSON text or syntax error.
   - Assertion: Catches syntax error cleanly; logs warning; maintains path rule.

5. **Prompt Injection Payload**:
   - Input: Injection attempt attempting to escape delimiters.
   - Assertion: Treated as literal data; validation drops unexpected text.
