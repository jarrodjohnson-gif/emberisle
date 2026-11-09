# Background music level (#1284)

## Current checkpoint, 2026-11-06

Validated code head: `7961ac01aeb59912ca81310c8bf0c69bb2326029`.
This head normally merged main `f29c36fbfe6bf38f0101e64fbfd6b8c69b170344`.
The sound document preserves the title-start lifecycle and approved 0.12/0.036 levels.

Fresh Node 22.23.4 installs, music, mixer, types, build, registration and size guards passed.
The PR body contains the completed commands and their raw output.
That local refresh did not repeat the base-growth comparison.
The older growth log below does not establish growth against this newer base.

Hosted required `checks` passed on this code head.
Opus review [6693044631](https://github.com/jarrodjohnson-gif/emberisle/pull/1289#issuecomment-6693044631) is clean.
It records CI growth: index +3/400 B; IslandCanvas +2/663 B.
Advisory `loosen` flags only the documented approved replacements.
Jarrod must listen and approve before merge; acceptance remains pending.

The historical index ceiling failure below was resolved upstream.
It is retained as an earlier result, alongside the initial installation failure.
The unexplained historical takeover failure remains tracked in #1306.
This checkpoint changes documentation only; it adds no new test result.

## Original validation, retained

Builder: Codex-p (GPT-6.1 Sol; parent Codex-p). Base: 33e10b09.

BG_VOLUME changes from 0.25 to 0.12; BG_DUCK remains 0.3 (ducked level 0.036).
Sting files, per-sting gains, mixer values and track lifecycle stay unchanged.

Node 22.23.4 music-prove and sound-mixer-prove pass, serial under the browser lock.
Music covers all four unchanged default sting gains, exact duck level, lobby/game base level, one advancing element with no pause, and existing saved on/off/mute behavior.
Build/typecheck and registration pass. Size fails index 125450 B against125200 B; the existing main P0 blocker is #1283.
No budget change or all-CI claim. Growth comparison not run.

Exact old/new tables are in equivalents.md. Approved replacements occupy their own commits b04dedb and90516fd.
Loosen reports the two expected music assertion replacements; no detector change or bypass.

music-first.log failed before proof startup because old shared dependencies lacked Ruffle. Clean npm ci fixed the installation; lockfile unchanged.
Jarrod's listening acceptance on main remains required; this PR references the issue without closing it.
Overlap #1282 affects title-start lifecycle; this branch changes only BG_VOLUME and focused background checks.
