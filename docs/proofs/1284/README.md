# Background music level (#1284)

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
