# Friendly Wayfarer: unpicked idea

- Status: unapproved backlog note; no implementation authority.
- Parent: [#1450](https://github.com/jarrodjohnson-gif/emberisle/issues/1450), ranked item 6.
- Scope: tier 3 documentation correction only.

Jarrod selected awards, dice story and share card on 2026-11-08.
Friendly Wayfarer was not among those picks.
Keeping this PR open does not approve the feature.
Owner Hub comment 6928706929 supersedes the earlier request to close stale PRs.
Desk comment 6946410569 permits documentation corrections, without runtime changes or new thresholds.

## Existing contract and source facts

The accepted [Wayfarer modes contract](wayfarer-modes.md) defines On and Off.
It remains authoritative; this note does not extend it.
Off prevents movement, blocking and theft.
Sevens still require discards, and played Wayfarer fortunes still count toward the army.
The existing contract also governs table creation, persistence and immutable settings.

At main `1b47ff2a96c1ba040cc0423a2b18b9bbf78495e4`:

- `src/components/game/WayfarerOptions.tsx:11-13` offers only On and Off.
- `src/lib/game/rules.ts:159` normalizes the stored mode to Off or On.
- `src/lib/game/ai.ts:39` defines `bestVictim`.
- `src/lib/game/ai.ts:53` defines `bestRobberHex`.

Those internal source identifiers retain their existing names.
Player-facing notes use Wayfarer, path, outpost and stronghold.

## Withdrawn requirements

The earlier draft prescribed a third mode and a two-visible-point protection threshold.
Neither is approved; this correction withdraws them as implementation requirements.
Its placement, theft, fallback, privacy and proof prescriptions are also withdrawn.
No new mode, threshold, code touch, protocol or proof change follows from this note.

Any future proposal needs an owner choice and its own scoped issue.
That proposal must reconcile the accepted contract before implementation.
