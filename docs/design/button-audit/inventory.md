# Button inventory — local source snapshot

Inventory only, not a visual specification or approval to change runtime. Scope: imports of `@/components/ui/button` under `src`; native buttons and unrelated controls are outside this inventory. Default below means omitted `variant` or `size`. Source links are repository-relative and identify the caller, not a claim about computed browser appearance.

## Primitive and interaction

[`button.tsx`](../../../src/components/ui/button.tsx#L5) defines `default` and `primary` identically (`bg-fg text-bg`); `secondary` uses `bg-bg`, border and foreground; `sea` and `accent` use their ink backgrounds with white text; `outline` and `ghost` are transparent. Hover differs by variant. Default and `sm` are both `h-11 min-w-11`, with different padding; `lg` is `h-12`, and `icon` is `size-11 p-0`. All have rounded-control, focus-visible sea-ink outline, active scale and native disabled classes. `className` is passed last to `cn`, so caller classes and external CSS must be examined alongside variant classes. There is no destructive variant.

The native `disabled` classes include pointer-events-none and muted foreground/background/border. The press sound checks both native disabled and `aria-disabled="true"`; `aria-disabled` alone does not disable a button or block its click in this primitive. Pointer down and non-repeating Enter/Space invoke sound, unless `silent`; `back` selects the back sound. Caller key/pointer handlers run first. Source: [`button.tsx`](../../../src/components/ui/button.tsx#L23). Actual keyboard focus visibility, CSS precedence and contrast require browser checks.

## Callers

Each row lists explicit sizes/variants; unmentioned values are defaults. Overrides are caller classes or stylesheet hooks, not a statement of final computed style.

| Caller | Variant / size / important overrides |
|---|---|
| [Title and reload](../../../src/components/game/EmberisleApp.tsx#L234) | AI and Watch switch primary/secondary with `watchLink`, lg; Host and Join secondary lg; Host `mr-11 min-w-0 flex-1 rounded-none border-0 px-3`; AI `w-full`. Hotseat and How to play ghost `px-3`; sound ghost/icon and `silent`; Reload primary/lg `mt-3 w-full`. |
| [Open tables and mode toggle](../../../src/components/game/OpenTables.tsx#L71) | Join secondary/sm, Watch ghost/sm, both `h-11 min-w-0 px-3`; mode toggle ghost with absolute positioning, `w-11 rounded-none border-l ... px-0`, `aria-pressed`. |
| [Lobby](../../../src/components/game/LobbyView.tsx#L115) | Copy, Copy link, Invite, How to play, add/remove bot, Ready use outline; Start sea; Leave ghost; fallback Close outline. Remove bot has accessible label. |
| [HUD](../../../src/components/game/Hud.tsx#L236) | Fortunes sm toggles primary/secondary with pressed/open state and custom dimensions; End turn sm toggles primary/secondary and phone height; [build tiles](../../../src/components/game/Hud.tsx#L434) sm toggle primary/secondary, custom 52px height, flex direction and `build-tile`/state classes; Roll lg `flex-1`. |
| [Fortune tray](../../../src/components/game/FortuneTray.tsx#L37) | Resource chips secondary with `CHIP`, `RESOURCE_PAINT[r]` and selected outline; Close ghost with `size-11 p-0` and `back`; [play](../../../src/components/game/FortuneTray.tsx#L162) toggles primary/secondary with aria-disabled classes. |
| [Trade panel](../../../src/components/game/TradePanel.tsx#L112) | Close ghost/icon with `back`; Ask default `h-11 w-full`, disabled by `!asking`; Bank secondary `trade-bank-action h-11 w-full`, native disabled and description. |
| [Trade toast](../../../src/components/game/TradeToast.tsx#L168) | Dismiss, No, Cancel secondary with `trade-no h-11 min-w-16 flex-1`; Yes default with `trade-yes` and same sizing. [`styles.css`](../../../src/styles.css#L245) supplies explicit trade fill/text and a `trade-yes[aria-disabled]` rule. |
| [Trade button](../../../src/components/game/TradeButton.tsx#L8), [take from bar](../../../src/components/game/TakeFromBar.tsx#L50) | Secondary/sm; take-from adds phone `h-11`. |
| [Placement list](../../../src/components/game/PlaceList.tsx#L152) | Secondary/sm; `h-auto min-h-8 justify-start py-1 text-left` overrides the usual height/alignment. |
| [Seat needs](../../../src/components/game/SeatNeeds.tsx#L40) | Secondary, `need-toggle`, pressed and native disabled states. [CSS](../../../src/components/game/seat-needs.css#L8) supplies pill shape, background and selected styling. |
| [Victory target](../../../src/components/game/VictoryTargetSelect.tsx#L10) | Secondary, `size-11 p-0 tabular-nums`, radio semantics and checked border/font/underline classes. |
| [Table menu](../../../src/components/game/TableMenu.tsx#L105) | Trigger ghost/icon, `size-11 bg-glass backdrop-blur-md`; Stay secondary with `back`, Leave default; menu actions ghost with shared `ROW` (`h-11 w-full justify-start px-3 text-body`); sound/music silent; Water and View choices sm, selected default versus ghost. Leave table opens confirmation when applicable. |
| [Win screen](../../../src/components/game/WinScreen.tsx#L79) | Show and Menu chip secondary/sm; Again chip default/sm; all whitespace-nowrap. [Full actions](../../../src/components/game/WinScreen.tsx#L191): React and Look secondary, Again default, Menu secondary/default based on `canAgain`; all `min-w-fit flex-1 whitespace-nowrap`; React can be native disabled. |
| [Win failure](../../../src/components/game/WinFailed.tsx#L18) | Secondary/sm `mt-2 flex`, described by winner message. |
| [Discard](../../../src/components/game/DiscardBar.tsx#L48) | Default/sm submit, native disabled until ready, phone `h-11 min-w-11`. |
| [How-to close](../../../src/components/game/HowTo.tsx#L57), [cost close](../../../src/components/game/CostCard.tsx#L58) | Ghost; How-to icon size and conditional `size-11`; Costs default size with `size-11 p-0`. Both `back` and accessible Close label. |
| [Haptics](../../../src/lib/haptics.tsx#L61) | Ghost with `h-11 w-full justify-start px-3 text-body`, pressed state and `silent`; click supplies its own sound. |

## Preservation and coordination

Decision 4C retains contextual fills pending the audit; do not infer a universal primary fill from the name `primary`. The resource-painted Fortune chips, glass menu trigger, trade CSS, need-picker CSS, selected default/ghost controls, sea lobby Start and dynamic title/HUD variants are concrete examples requiring preservation and review. The accepted lobby HIG scale is a named exception ([proposal](../../design/issue-1274/proposal.md#L15)). No destructive styling exists in the primitive: Leave confirmation, remove bot and decline/cancel trade are useful behavioral examples, not evidence that they share a destructive visual treatment.

Coordinate with active title PR #1216: title button variants, widths and the Host split control overlap; preserve its title/Play flow and proof work. Coordinate lobby #1220: outline/sea callers and the accepted lobby HIG exception overlap. Coordinate #1276: menu/chat control consistency and the table-menu trigger/actions overlap. The [build order](../../design/issue-1274/build-order.md#L31) identifies these dependencies and says runtime waits for an accepted spec; refresh live ownership before any later work. This inventory does not reserve files.

## Later browser examples needed

Capture computed fill, contrast and focus-visible in context at supported viewport sizes, including title AI/Watch and split Host; lobby Start/outline; HUD selected/unselected build and focused `aria-disabled` shortage; Fortune resource paints, selected outline and unavailable play; native disabled Ask/Bank/Discard; trade Yes/No; glass menu trigger and selected menu toggles; Leave confirmation and remove bot. Check focus return for close/back controls, keyboard activation and refused actions, including build tile's deliberate hint/disarm behavior ([HUD](../../../src/components/game/Hud.tsx#L451)) and Fortune chip's guarded click ([FortuneTray](../../../src/components/game/FortuneTray.tsx#L47)). Inspect stylesheet precedence and any clipping/overflow before making visual conclusions. No browser execution was performed for this inventory.
