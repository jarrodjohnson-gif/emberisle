# Research: a simple first-impression title screen (issue #148)

- step: 1 Research, node #124
- date: 2026-09-27
- agent: Grok

## What I read

`src/components/game/EmberisleApp.tsx` (`Title`, `Lobby`); `docs/design/menus.md` (Unreal `WBP_Main`);
`docs/research/visual-polish.md` §8; issue #136 and its 2026-09-27 comments;
README "What exists" / Run it; issue #144 running in parallel.

## What is true

### The browser title is already one screen, and that is the right shape

`Title` is a single card: name field, Play versus the isle, Four seats one table, Host a table, Join code + Join, How to play. No extra Host or Join page. Lobby is a second screen after a table exists. That already matches how a four-friend night works: type a name, host or paste a code.

What is wrong is the *impression*, not the number of screens:

- The card is a `max-w-md` (448 px) column pinned to the bottom over a gradient. At 1920 it is a strip in a sea of island.
- Until #141 lands, the island behind it was an empty sand disc. After #141, it is a dealt demo island — that is the cool part. The menu still sits on top of the lower hexes.
- Five same-weight buttons. Host and Join are the game-night path; Practice and Hotseat are for one PC. They read as equals.
- No color swatches on this screen yet (#142 is the Implementation for that, already in a PR).
- How to play is a ghost button. There is no rules sheet in the tree of this component beyond `setHowTo`.

### What "simple but cool" means here

Cool is the island, not a new menu system. Simple is: name, one primary action, join as a field not a page.

A first-impression that fits a private table:

1. **The island is the poster.** Keep the demo seed behind the type. Do not add a video, a carousel, or a second renderer.
2. **One column is fine** if it does not cover the island's middle third (already a rule in `docs/design/menus.md`). Move it to a lower-left or lower-right stack, or a short top wordmark + a compact bottom bar, so the hexes stay visible. That choice is #136's.
3. **Weight the game-night path.** Host a table is the primary button. Join is the code field beside it. Practice vs the isle and Four seats sit as secondary text buttons. How to play stays a text link.
4. **Do not add pages** for Host or Join on the browser client. The Unreal spec (`WBP_Host` / `WBP_Join`) exists because UMG and a picture picker need room. The browser already sends `hello` from this card. Splitting it would add a screen for no new information (name + optional color + code).
5. **No account, no shop, no "choose game mode" carousel.** Those are the patterns #144 is documenting as reasons official ports feel heavy. Emberisle is a four-character code on a friend's PC.

### How this feeds #136, not a new Design issue

#136 is already the Design step: `docs/design/title-lobby.md`, mockups at 1280 and 1920, island behind the menu, readable seat colours, copy-code, Ready vs Start, room for #119. This Research adds three constraints that note must honour:

- Stay on one Title screen.
- Make Host + Join the obvious pair; demote Practice / Hotseat.
- Leave the center of the island clear.

No extra Design or Implementation child. #136 files those when the mockup proves they are separate PRs (likely: Title layout, then Lobby layout).

Coordinate: #141 (island behind the title) should be on main before anyone implements the new layout, otherwise the mockup is dressing an empty disc. #142 (color swatches) can land first; #136 should show where the swatches sit. #144 is worth a skim for "what not to add."

## What I am not sure about

- Whether How to play should be a slide-over on the same screen or stay a toggle. Today it is a store flag with no visible sheet in `Title` itself — that may already be a small bug #136 should notice.
- Exact corner for the card. Lower-left keeps the title wordmark over water; lower-right keeps the approaching boats. Design picks with screenshots, not this note.

## Prove output

(research gate — no command)

## Handoff

```
done: described today's Title; set three constraints for #136; no new children
left: #136 Design title-lobby.md, after #141 is on main and after a skim of #144
broke: nothing
next agent: #136 (S, Backlog). Do not add a Host/Join page to the browser client.
```
