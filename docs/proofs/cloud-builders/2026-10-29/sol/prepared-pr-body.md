/claim
claimed: GPT-6.1 Sol cloud-builder-1029, 2026-10-28
files: .github/workflows/ci.yml, scripts/ci-install-prove.mjs

Closes #1175.

Model: GPT-6.1 Sol.
Original builder: SOL-6.1-1027-0533kn (GPT-6.1 Sol).
Continuation: GPT-6.1 Sol cloud-builder-1029.

CI repeated clean installs in all 13 dependency-consuming jobs.
A dependencies job now restores or seeds installed root/server dependencies.
Build, server and browser-a wait for the seed, then run in parallel.
Browser-b retains its build dependency.

All installed caches use exact Node version, runner OS/architecture, both manifests and both lockfile hashes.
No prefix restore key can reuse a different dependency identity.
A cache miss runs both clean installs, and failures fail the job.
The size baseline retains its separate npm ci because its lockfile can differ.
Docs-only jobs still skip installs.
Every original proof command, matrix name and required check remains.
The checks gate also requires successful dependency preparation.
Playwright installation and browser proof commands remain unchanged.
ci-install-prove is registered in package.json and the server job.

Review continuation at 3602caf12afa15232bbe0da0469b21019fa276e4:

- Added package.json and server/package.json to all five installed-cache keys.
- The previous keys could restore stale installs after manifest-only dependency changes.
- Negative controls remove either manifest from each producer/consumer key; all ten mutants fail validation.
- Content-hash fixtures demonstrate both manifest-only drifts invalidate the fixed key with unchanged lockfiles.
- Old lock-only keys retain their stale hit in those same fixtures.
- Existing cold/warm/unavailable/docs/failure assertions remain; loosen-prove confirms no weakened checks.

The REST issue-read and claim POST both returned Forbidden in this environment.
This top-of-body claim uses AGENTS.md's fallback.
Publishing, fresh REST ownership verification, exact-head CI and independent Claude re-review remain pending.
No browser proof, workflow dispatch, merge or force-push ran during this continuation.
Usage percentages are unavailable.

Local validation for 3602caf:

- Root and server npm ci passed using frozen lockfiles.
- npm run typecheck passed.
- npm run ci-install-prove passed; full output below.
- npm run registered-prove passed: all 153 proofs registered.
- npm run auto-merge-prove passed: 72 cases, 12 mutants caught.
- npm run label-commands-prove passed: 26 workflow proof groups.
- npm run flake-rerun-prove passed.
- npm run loosen-prove passed against the PR base.
- npm run loosen-prove -- --base c076011ba2287026f634d9ee9283fe90a322e3b8 passed: one changed proof, none loosened.
- YAML parsed; every job, step, command and gate matched the previous head except five cache keys.
- git diff --check passed.

```text
ok negative controls: missing root/server manifest rejected in all five cache keys
ok manifest-only drift: old keys hit; fixed root/server keys miss with unchanged lockfiles
ok cold: 2 npm ci calls across 14 dependency jobs (PR size baseline adds 1)
ok warm: 0 npm ci calls across 14 dependency jobs (PR size baseline adds 1)
ok unavailable: 28 npm ci calls across 14 dependency jobs (PR size baseline adds 1)
ok docs: 0 npm ci calls across 14 dependency jobs (PR size baseline adds 1)
ok failed install exits 31; exact cache identity and all required suites retained
ci-install-prove ok
```

Historical measured CI results for the original change:

Before: [run 40458279082](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/40458279082), head 09fc4ee, successful required checks.
After: [run 40461225186](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/40461225186), head c076011, successful required checks.
These measurements describe the original head, not the pending continuation CI.

| Measurement | Before | After |
| --- | ---: | ---: |
| Successful direct npm ci steps | 26 | 2 |
| Installs including unchanged size baseline | 27 | 3 |
| Jobs | 17 | 18 |
| Timing API UBUNTU total_ms | 0 | 0 |
| Timing API run_duration_ms | 834000 | 715000 |

Every downstream consumer skipped both install steps and ran its proofs successfully in the historical after run.
GitHub reported zero billed milliseconds for both public-repository runs.
Duration differences across separate runs alone do not establish causal speedup.
Summed per-job duration data was unavailable in this restricted continuation; no estimate is reported.
Fixture install counts above measure guard behavior, not observed cache hits or CI savings.
