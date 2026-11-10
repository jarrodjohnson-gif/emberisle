# Helper scripts

Run commands from the repository root. Install dependencies first with `npm ci`.
Commands without a header usage line follow the script's entry point.
“CI” includes scheduled repository workflows and direct calls from their proofs.
The issue column lists numbers named in each script's opening comment.

| Script | Command | What it writes or does | CI | Header issues |
|---|---|---|---|---|
| `auto-merge-eligible.mjs` | `node scripts/auto-merge-eligible.mjs` | Writes eligibility to `GITHUB_OUTPUT`; requires workflow environment variables. | Yes: `auto-merge.yml` | #923 |
| `capture-crops.mjs` | `node scripts/capture-crops.mjs` | Captures pile crops under `test-results/issue-1158/` and `docs/proofs/1158/`. | No | None |
| `capture-phone-board.mjs` | `node scripts/capture-phone-board.mjs [before\|after]` | Captures phone boards under `docs/proofs/1158/`; defaults to `after`. | No | None |
| `design-shots.mjs` | `node scripts/design-shots.mjs` | Writes screenshots and `metrics.json` under `SHOTS_OUT`, defaulting to `test-results/design/`; needs the app on port 8080. | No | None |
| `desk-board.mjs` | `node scripts/desk-board.mjs [--dry-run]` | Updates the #916 board and posts bounded #699 notifications; requires the workflow environment. | Yes: `desk-board.yml` | #1180 |
| `desk-gate.mjs` | `node scripts/desk-gate.mjs` | Posts the head's `desk-gate` status from review footers; requires the workflow environment. | Yes: `desk-gate.yml` | None |
| `dock-piles-audit.mjs` | `node scripts/dock-piles-audit.mjs` | Prints visibility measurements across seeds and token modes; writes no files. | No | #1158 |
| `emberisle-up.sh` | `bash scripts/emberisle-up.sh` | Updates main, starts the host and tunnel, and writes state and logs under `~/.emberisle-up/`. | No | None |
| `emote.mjs` | `node scripts/emote.mjs <input image> <name>   ->   src/assets/emotes/<name>.webp` | Crops a reaction image and writes a transparent, square 128px WebP. | No | #120 |
| `flake-rerun.mjs` | `node scripts/flake-rerun.mjs` | Requests one failed-job rerun when every failure matches the allowlist; requires workflow variables. | Yes: `flake-rerun.yml` | None |
| `hex-jelly.mjs` | `node scripts/hex-jelly.mjs [timber]` | Writes studio screenshots under `test-results/`; header options appear below. | No | None |
| `hex-jelly-gif.mjs` | `node scripts/hex-jelly-gif.mjs ore 23` | Writes `test-results/jelly-<kind>-<seed>-roll.gif`; needs Python with Pillow. | No | None |
| `jelly-showcase.mjs` | `node scripts/jelly-showcase.mjs` | Writes screenshots and video under `test-results/jelly/`; start `npm run dev` first. | No | None |
| `level-audio.mjs` | `node scripts/level-audio.mjs [--report out.md] [--listen dir]`; `node scripts/level-audio.mjs --new <name>...` | Overwrites selected `public/audio/` files; optionally writes a report and listening copies. | No | #1073 |
| `make-ambience.mjs` | `node scripts/make-ambience.mjs [--output file.mp3]` | Generates sea ambience; defaults to `public/audio/amb_sea.mp3`. | Yes: `ambience-loop-prove` | #1014, #662 |
| `make-icons.mjs` | `npm run make-icons` | Renders four PNG icons into `public/icons/`. | No | #468 |
| `make-sounds.mjs` | `node scripts/make-sounds.mjs` | Generates and levels table clips in `public/audio/`; needs ffmpeg. | No | #609, #616, #1073 |
| `mobile-shots.mjs` | `node scripts/mobile-shots.mjs` | Writes phone screenshots under `test-results/mobile/` and checks the placement flow. | No | #175 |
| `named-tunnel.mjs` | `node scripts/named-tunnel.mjs --setup HOSTNAME TUNNEL-UUID [PORT] [CREDENTIALS-FILE]`; `node scripts/named-tunnel.mjs --run` | Saves `.emberisle-tunnel/config.yml` and `settings.json`, or starts the saved tunnel. | No | #746 |
| `named-tunnel.test.mjs` | `npm run named-tunnel-test` | Tests tunnel setup using temporary files and stub commands; needs no Cloudflare account. | Yes: `ci.yml` (`npm run named-tunnel-test`) | #746 |
| `next-up.mjs` | `node scripts/next-up.mjs` | Updates the labelled GitHub queue issue body; requires the workflow environment. | Yes: `next-up.yml` | #858 |
| `night.mjs` | `node scripts/night.mjs` | Builds `dist/`, starts the rules host, and prints the join line. | Yes: `night-prove` (`npm run night-prove`) | #87, #321 |
| `orphan-check.mjs` | `npm run orphan-check` | Terminates two proofs and checks for leftover host processes; writes no report. | No, deliberately | #242 |
| `robber-pictures.mjs` | `node --import ./server/register.mjs scripts/robber-pictures.mjs` | Writes blocked-terrain comparisons and crops under `docs/proofs/826/`. | No | #826 |
| `shots.mjs` | `node scripts/shots.mjs` | Writes screen captures under `test-results/shots/` and prints rendering measurements. | No | #125, #310 |
| `stale-pr-sweeper.mjs` | `node scripts/stale-pr-sweeper.mjs` | Records activity and closes stale PRs when `STALE_PR_SWEEPER=on`; otherwise prints `disabled`. | Yes: `stale-pr-sweeper.yml` | None |
| `trade-map.test.mjs` | `npm run trade-map-test` | Checks trade previews and settlement, writing `test-results/trade-map-*.png`. | Yes: `trade-map.yml`, `ci.yml` (`npm run trade-map-test`) | #536 |
| Libraries | Imported or loaded by scripts; no standalone command. | `audio-level-lib.mjs`, `proof-browser.mjs`, `roll-off-oracle.mjs`, `fixtures/`, `hex-jelly.html`, `hex-jelly-lineup.html`, and `jelly-board.html` support scripts and proofs. | Through callers | #1073, #1281, #1286 |

The `emote.mjs` command copies the header's arrow notation; the arrow describes output, not a shell operator.
The `trade-map.test.mjs` command copies its header; choose an installed browser path when running locally.

The `hex-jelly.mjs` header continues its command with these options:

```text
[--seeds 7,11,23] [--t 2.05] [--focus pool,camp] [--q ring=1&az=200]; --lineup for the size ladder (jelly-lineup.png)
```

`level-audio.mjs` has two modes. The first reconstructs historical #1073 inputs and can overwrite later audio changes.
Use `--new` for named, currently unlevelled files. Read its header before replacing audio.
