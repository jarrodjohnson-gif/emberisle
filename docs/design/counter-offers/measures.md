# Counter-offer prototype: measures

Read from the DOM by `capture.mjs`, at device scale 2, in CSS px. Buttons are the visible buttons of the tray's action row, or of the counter sheet's footer for the two sheet states. The top line is the tray's `.trade-line` (the outcome line for `recv-refused`), or the sheet's sentence. Lines are the distinct line boxes of its text.

## 390x844

| State | Top line | Font | Lines | Quiet status | Buttons (w x h) | Notes |
|---|---|---|---|---|---|---|
| `recv-offer` | Tide: give 1 stone, get 2 wheat | 15 px / 20 px, weight 500 | 1 |  | No 104.7x48; Counter 104.7x48; Yes 104.7x48 (primary) | tray 358x204 at top 628 |
| `recv-cannot-pay` | Tide is looking for 1 stone | 15 px / 20 px, weight 500 | 1 |  | Dismiss 161x48; Counter 161x48 | tray 358x204 at top 628 |
| `recv-sheet-unchanged` | To Tide Give 1 stone · Get 2 wheat | 16 px / 24 px, weight 600 | 1 |  | Send counter 358x48 (off) | reason: Change something first. (13 px); sheet 390x408 at top 436 |
| `recv-sheet` | To Tide Give 1 brick · Get 2 wheat | 16 px / 24 px, weight 600 | 1 |  | Send counter 358x48 (primary) | sheet 390x386 at top 458 |
| `recv-waiting` | You counter: give 1 brick, get 2 wheat | 15 px / 20 px, weight 500 | 1 | Waiting for Tide | Take back 330x48 | tray 358x216 at top 616 |
| `recv-refused` | Tide said no | 13 px / 20 px, weight 400 | 2 |  | none | tray 358x154 at top 678 |
| `recv-after` | Tide: give 1 stone, get 2 wheat | 15 px / 20 px, weight 500 | 1 |  | No 161x48; Yes 161x48 (primary) | tray 358x204 at top 628 |
| `ask-counter` | Pine counters: give 2 wheat, get 1 brick | 15 px / 20 px, weight 500 | 1 |  | No 161x48; Yes 161x48 (primary) | tray 358x204 at top 628 |
| `ask-two` | Pine counters: give 2 wheat, get 1 brick | 15 px / 20 px, weight 500 | 1 | 1 of 2 | No 161x48; Yes 161x48 (primary) | tray 358x216 at top 616 |
| `ask-waiting` | You offer 2 wheat for 1 stone | 15 px / 20 px, weight 500 | 1 |  | Cancel 330x48 | tray 358x204 at top 628 |
| `recv-optionB` | Tide: give 1 stone, get 2 wheat | 15 px / 20 px, weight 500 | 1 |  | No 161x48; Yes 161x48 (primary) | tappable line 330x44; tray 358x216 at top 616 |
| `today-outcome` | Tide takes it. | 13 px / 20 px, weight 400 | 2 |  | none | tray 358x154 at top 678 |

## 440x956

| State | Top line | Font | Lines | Quiet status | Buttons (w x h) | Notes |
|---|---|---|---|---|---|---|
| `recv-offer` | Tide: give 1 stone, get 2 wheat | 15 px / 20 px, weight 500 | 1 |  | No 121.3x48; Counter 121.3x48; Yes 121.3x48 (primary) | tray 408x204 at top 740 |
| `recv-cannot-pay` | Tide is looking for 1 stone | 15 px / 20 px, weight 500 | 1 |  | Dismiss 186x48; Counter 186x48 | tray 408x204 at top 740 |
| `recv-sheet-unchanged` | To Tide Give 1 stone · Get 2 wheat | 16 px / 24 px, weight 600 | 1 |  | Send counter 408x48 (off) | reason: Change something first. (13 px); sheet 440x408 at top 548 |
| `recv-sheet` | To Tide Give 1 brick · Get 2 wheat | 16 px / 24 px, weight 600 | 1 |  | Send counter 408x48 (primary) | sheet 440x386 at top 570 |
| `recv-waiting` | You counter: give 1 brick, get 2 wheat | 15 px / 20 px, weight 500 | 1 | Waiting for Tide | Take back 380x48 | tray 408x204 at top 740 |
| `ask-counter` | Pine counters: give 2 wheat, get 1 brick | 15 px / 20 px, weight 500 | 1 |  | No 186x48; Yes 186x48 (primary) | tray 408x204 at top 740 |

## 844x390

| State | Top line | Font | Lines | Quiet status | Buttons (w x h) | Notes |
|---|---|---|---|---|---|---|
| `recv-offer` | Tide: give 1 stone, get 2 wheat | 15 px / 20 px, weight 500 | 1 |  | No 74.7x48; Counter 74.7x48; Yes 74.7x48 (primary) | tray 260x168 at top 210 |
| `recv-cannot-pay` | Tide is looking for 1 stone | 15 px / 20 px, weight 500 | 1 |  | Dismiss 116x48; Counter 116x48 | tray 260x168 at top 210 |
| `recv-sheet-unchanged` | To Tide Give 1 stone · Get 2 wheat | 16 px / 24 px, weight 600 | 1 |  | Send counter 488x48 (off) | reason: Change something first. (13 px); sheet 520x374 at top 16 |
| `recv-sheet` | To Tide Give 1 brick · Get 2 wheat | 16 px / 24 px, weight 600 | 1 |  | Send counter 488x48 (primary) | sheet 520x352 at top 38 |
| `recv-waiting` | You counter: give 1 brick, get 2 wheat | 15 px / 20 px, weight 500 | 2 | Waiting for Tide | Take back 240x48 | tray 260x200 at top 178 |
| `ask-counter` | Pine counters: give 2 wheat, get 1 brick | 15 px / 20 px, weight 500 | 2 |  | No 116x48; Yes 116x48 (primary) | tray 260x176 at top 202 |

## 1280x720

| State | Top line | Font | Lines | Quiet status | Buttons (w x h) | Notes |
|---|---|---|---|---|---|---|
| `recv-offer` | Tide: give 1 stone, get 2 wheat | 15 px / 20 px, weight 500 | 1 |  | No 103.3x48; Counter 103.3x48; Yes 103.3x48 (primary) | tray 720x140 at top 568 |
| `recv-cannot-pay` | Tide is looking for 1 stone | 15 px / 20 px, weight 500 | 1 |  | Dismiss 159x48; Counter 159x48 | tray 720x140 at top 568 |
| `recv-sheet-unchanged` | To Tide Give 1 stone · Get 2 wheat | 16 px / 24 px, weight 600 | 1 |  | Send counter 488x48 (off) | reason: Change something first. (13 px); sheet 520x408 at top 296 |
| `recv-sheet` | To Tide Give 1 brick · Get 2 wheat | 16 px / 24 px, weight 600 | 1 |  | Send counter 488x48 (primary) | sheet 520x386 at top 318 |
| `recv-waiting` | You counter: give 1 brick, get 2 wheat | 15 px / 20 px, weight 500 | 1 | Waiting for Tide | Take back 326x48 | tray 720x140 at top 568 |
| `ask-counter` | Pine counters: give 2 wheat, get 1 brick | 15 px / 20 px, weight 500 | 1 |  | No 159x48; Yes 159x48 (primary) | tray 720x140 at top 568 |

Page errors: none.
