# Host, join, and lobby screens (issue #37)

Source: build bible 3. There is no network in #38. These screens only move between each other.

## Look

| Token | Value |
|---|---|
| Button fill | stone `#efeae0` |
| Text | `#1c1915` |
| Corner radius | 8 px |
| Hover | fill lightened 6%, plays `ui_hover` once on enter |
| Press | scale 0.97 for 80 ms, plays `ui_click` |
| Title font | serif caps, "EMBERISLE" |
| Error line | `#b5522a` text under the field, 2 s, plays `ui_error` |

The island orbits behind every screen. No panel covers the center third.

## Widgets (UMG)

| Widget | Contents | Esc goes to |
|---|---|---|
| `WBP_Main` | Title, `Btn_Host` "Host a table", `Btn_Join` "Join with a code", `Btn_Practice` "Practice vs the isle", `Btn_Gear` (icon) | nothing. Esc here does not quit. It opens a small "Quit Emberisle?" with Yes and No. |
| `WBP_Host` | `Txt_Name` (default "Ember", 16 letters max), `Row_Colors` (4 swatches), `Img_Avatar` (96 px circle) + `Btn_Picture` "Use a picture", `Seg_Seats` 3 / 4, `Btn_Open` "Open table" | `WBP_Main` |
| `WBP_Join` | `Code_0..Code_3` (four boxes, auto-advance, paste fills all four, uppercase, only the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), name, colors, picture, `Btn_Sit` "Sit down" | `WBP_Main` |
| `WBP_Lobby` | Code in 96 pt + `Btn_Copy`, `Row_Seats` (4 seat cards), `Txt_Log` (one line), `Chk_Ready`, `Btn_Start` (host only, hidden until everyone is ready and 3 or 4 are seated) | `WBP_Main`, after "Leave the table?" Yes and No |
| `WBP_Gear` | `Txt_Server` URL field, `Btn_Save` | the screen that opened it |

Seat card: 64 px circle picture (or the color with the first letter), name, 6 px color bar, a Ready check. An empty seat says "Empty".

Colors: `#c45c3e` Ember, `#2a8f8a` Tide, `#e4c9a0` Dune, `#3d6b4f` Pine. A taken color is 35% opacity and not clickable.

## Esc

- Esc always plays `ui_back` and pops one screen off a stack: `Main → Host → Lobby` or `Main → Join → Lobby`.
- Esc on `WBP_Main` asks before it quits. One Esc never closes the app.
- Esc in a text box first clears focus. A second Esc goes back.

## Flow with no network (#38)

- Host → Open table goes to a Lobby with the code `TEST`.
- Join → Sit down goes to the same Lobby.
- Practice goes to the island with three bots (after milestone 7).
