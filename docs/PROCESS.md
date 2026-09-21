# Process

## Repo

- GitHub: `jarrodjohnson-gif/emberisle` (public)
- This sandbox is the live preview. Commits go to GitHub via the connected
  account. Do not treat chat as the source of truth — issues and these docs are.

## North star

If a visual change does not move us toward `public/refs/hex-north-star.jpg`,
it is the wrong change.

## Issues

GitHub Issues are the backlog. Labels:

- `look` — island / lighting / animation
- `rules` — engine correctness
- `play` — HUD, trades, tables
- `bug` — broken behavior

## Loop

1. Pick the top open issue
2. Change the smallest surface that proves it (one hex type, one HUD piece)
3. Hard-refresh the preview and screenshot
4. Close or comment with what is still wrong

## Rules we already encoded

See `src/lib/game/rules.ts` + the notes in chat: snake setup, second-settle
goods, 7 / discard / robber, distance, finite bank, knight-before-roll,
hidden VP, longest path with forks and enemy splits.
