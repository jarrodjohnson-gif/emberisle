# Docs-only desk proof prerequisites (#1226)

Source commit: `8ce98b5`. Builder: Codex-p. Model: GPT-6.1 Sol. Parent: Codex-p.

## Failure and cause

Docs-only PR #1225 failed on [CI41136683468](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/41136683468), attempt1.
[Server job124340859048](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/41136683468/job/124340859048) skipped checkout and Node setup.
The unconditional `Desk gate proof` step then executed `npm run desk-gate-prove`.
It failed with ENOENT for the runner's package.json, exit254.
The raw hosted log is `original-ci-server.log`.

The full-PyYAML baseline also executes the real npm command in an empty temporary runner directory.
It reproduces ENOENT and exit254 before the source fix; see `baseline.log` and `baseline.json`.

## Change

Server checkout and the existing Node22 setup now run on docs and code paths.
The desk proof still runs unconditionally.
It imports only Node built-ins and needs no dependency installation.
All dependency-cache/install conditions and keys remain unchanged.
Every other server command, matrix, trigger and required job name remains unchanged.
No proof is skipped or removed.
No existing assertion, timeout, permission, lockfile or size allowance changes.

The existing registered `ci-install-prove` gains an additive regression section.
All 114 original lines remain an exact prefix.
The desk-gate proof and implementation remain byte-identical.
Fail-closed guards reject checkout paths, command working directories and job-default working directories.
A full parsed-YAML comparison finds only two removed prerequisite conditions.

## Actual validation

- `ci-install-prove`: original cache/install cases pass, including docs zero-install behavior.
- Both docs/code projections execute the real 38-check desk proof through npm.
- Nine controls reject missing/gated prerequisites, skipped proof, unpinned Node, unsupported directories and swallowed failures.
- An injected child assertion failure remains fatal.
- A separate full-PyYAML execution projection passes docs/code paths and rejects the original path.
- `desk-gate-prove`: 38 checks pass.
- `registered-prove`: all161 registered proofs pass.
- `auto-merge-prove`: 72 cases and12 caught mutants pass.
- Committed-head `loosen-prove`: one changed proof, none loosened.
- Whitespace passes.

## Limits and reproduction

The maintained regression parses only relevant literal step scalars, not arbitrary YAML syntax.
The supplemental full-parser source is `yaml-path-check-source.txt`; PyYAML6.0.3 was already available locally.
It adds no production or CI dependency.
Both harnesses project checkout by copying the real package manifest and desk-proof files.
They execute the real npm command and real assertions; they do not invoke hosted Actions locally.
Local Node is24.19.0; workflow setup declares22.
The harness verifies declared setup order; hosted CI must establish actual Node22 behavior.
No hosted docs-only positive is claimed before the fix reaches that workflow path.
No browser proof, workflow dispatch or manual CI retry ran locally.

Run `node scripts/ci-install-prove.mjs`, `node scripts/desk-gate-prove.mjs`,
`node scripts/registered-prove.mjs` and `node scripts/auto-merge-prove.mjs`.
Run `node scripts/loosen-prove.mjs --base 7df73be` after committing source changes.

`SHA256.json` hashes the retained evidence payloads.
