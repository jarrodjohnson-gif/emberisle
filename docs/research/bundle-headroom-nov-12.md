# Bundle Headroom and Ceiling Audit (Nov 12 Merge Wave)

- date: 2026-11-12
- agent: finish-keyfit
- lane: docs (tier 3)
- targets: `scripts/size-prove.mjs`, all 45 production bundle chunks

## Overview

This audit records bundle sizes and headroom across all 45 production chunks following the latest merges.
Recent merges integrated `BuildList` (#1542), `SeatPublicGains` (#867), and `OtherProfileCard` (#1350).
All 45 chunks remain safely within their desk-approved gzip ceilings.

## Key Changes in Chunk Composition

1. **BuildList Chunk Created (PR #1542):**
   - Measured size: 1.44 kB gzip (1,439 B).
   - Ceiling: 1.60 kB gzip (1,600 B).
   - Headroom: 161 B (10.0% slack).
2. **Index Chunk Shrinkage:**
   - Extracting the build sheet reduced `index` by 536 B.
   - Measured `index`: 126.37 kB gzip against its 127.00 kB ceiling.
   - Headroom: 630 B remaining.
3. **SeatPublicGains (PR #867):**
   - Measured size: 1.68 kB gzip.
   - Ceiling: 1.80 kB gzip.
   - Headroom: 120 B remaining.
4. **OtherProfileCard (PR #1350):**
   - Measured size: 1.08 kB gzip.
   - Ceiling: 1.55 kB gzip.
   - Headroom: 470 B remaining.

## High-Risk Tight Chunks

The following chunks hold under 100 B of headroom and require strict caution during future edits:
- **`table`:** 2.20 kB measured at a 2.20 kB ceiling (0 B headroom).
- **`LobbyView`:** 2.48 kB measured at a 2.50 kB ceiling (20 B headroom).
- **`eye-off`:** 0.29 kB measured at a 0.31 kB ceiling (20 B headroom).
- **`ProfileSheet`:** 5.94 kB measured at a 6.00 kB ceiling (60 B headroom).
- **`WinList`:** 1.30 kB measured at a 1.36 kB ceiling (60 B headroom).

## Proof Verification

- `npm run size-prove` passed with all 45 chunks inside ceilings.
- `npm run ci-install-prove` passed with zero dependency warnings.

## Recommendation

Future table UI changes must either trim existing code or request a raised ceiling from the desk.
No builder may exceed the 2,200 B `table` ceiling without owner approval.
