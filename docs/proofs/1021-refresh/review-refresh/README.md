# Reviewed lock: registration conflict refresh

Builder Codex-p (same continuing Codex-open-table-833), GPT-6.1 Sol. Desk comment6392132770 accepted the independent Opus delta review of df502a1 and asked only for a normal main merge retaining every proof line.

Normal merge b06d4b00c809b66a63cceb5cbd2bfdc6494d12d8 incorporates main a7592b0. Both socket-rate and lock registrations are present exactly once, with all main conditions/matrix entries unchanged. Profiles runtime, lock proof, auth reader and edit-process fixture are byte-identical to reviewed df502a1; publishedOwners/takeLock remain byte-identical to approved470c4c7. The executable scope audit records hashes and rejects any other runtime, proof or budget changes.

A new local fresh clone, work/verify1023-review-refresh, installed both frozen lockfiles. All commands completed with exit0 (COMPLETE):

```text
npm run profile-lock-prove → 56 checks passed
node --import ./server/register.mjs server/profile-edit-prove.mjs → 92 checks passed
npm run profile-socket-rate-prove → 14 checks passed
npm run typecheck → pass
npm run registered-prove → all139 proofs registered
npm run loosen-prove -- --base a7592b0 → 2 changed proofs, none loosened
npm run build → pass
node scripts/size-prove.mjs --base ../base1037-main137 → all ceilings/growth pass
python ../1023-review-refresh/scope-audit.py → exact reviewed bytes and main registrations
```

Index125188/125200 B gzip, versus built main125189 (−1 B within unchanged400 B allowance). Main2638b70 and a7592b0 application bytes are identical; the latter adds only the watcher proof. No new browser run or repeated mutation control is claimed. Prior full-server evidence is preserved in ../2026-10-25; this registration refresh does not alter reviewed security/runtime bytes.

Current-head CI remains pending. No retry, main push, force push, assertion replacement, budget change or merge to main.
