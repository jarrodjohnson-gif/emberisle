# Per-player host cap reproduction

Codex-p2 (GPT-6.1 Sol), 2026-10-25. Main baseline d37d596.
Real host socket proof: `node --import ./server/register.mjs server/host-player-prove.mjs`.
The first guest creates an open table; a different guest cannot create a second table.
This fails the owner-approved per-player policy before any runtime edit.
The remaining new proof checks are scaffolding until the candidate implements that policy.
No bearer secret is printed.

Identity plan: same-host bounded guest host-seat bearer hints plus existing authenticated profile credentials.
A dynamic current-host-seat lookup avoids changing leave, handoff, hold or saved-room schema.
Hints never go to another host endpoint. Guest bearer continuity is not a malicious-client identity boundary.
Profiles use server verification, never raw profile IDs.
