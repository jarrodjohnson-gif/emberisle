# First minute, slice 1: replaced check lines

The title is now a front page and a Play page ([design](../../design/first-minute/README.md)).
No check was deleted, skipped or loosened. Each line below still checks the same thing, with the new words.
`npm run loosen-prove` lists these 14 lines, because it flags any edited check line.

| File:line | Old | New | Why |
|---|---|---|---|
| `scripts/title-prove.mjs:81` | `assert.deepEqual(card.primary, ["Play"], …)` | `assert.deepEqual(card.primary, ["Play with bots"], …)` | The proof opens on the Play page. Its one primary is Play with bots. `first-minute-prove` checks the front page's primary, Play. |
| `scripts/title-prove.mjs:82` | `…filled…, ["Host a table", "Join", "Play"]` | `…filled…, ["Host a table", "Join", "Pass and play", "Play with bots"]` | Pass and play is now a soft-filled button, not a quiet text button. The list is still exact. |
| `scripts/title-chunks-prove.mjs:123` | `summary…includes("Online: on")`, "settings summary stays eager" | `summary…includes("Game options")`, same message | The owner asked for the "Practice · Online · Hotseat" status line to go. The summary is still eager, with its new words. |
| `scripts/title-chunks-prove.mjs:133` | `summary…includes("Online: off") && store.online === "off"` | `combobox "Online wayfarer" value === "off" && store.online === "off"` | Same reason. The choice is now read from the control that shows it. The store half is unchanged. |
| `scripts/reflow-prove.mjs:61,63` | one `<p>` reads "3 bots, no network": "Play's subtitle renders" | one `<p>` reads "Code for private tables": "the code helper renders" | The "3 bots, no network" line is removed. The proof still needs one 12 px line on the card. |
| `scripts/join-link-prove.mjs:131` | `button "Four seats, one table"` count is 1 | `button "Pass and play"` count is 1 | The button was renamed. |
| `scripts/join-link-prove.mjs:138` | `button "Play"` count is 1 (watch link) | `button "Play with bots"` count is 1 | A watch link opens the Play page. The bot game button there is Play with bots. |
| `scripts/chunk-fail-prove.mjs:204` | `button "Play"` count is 0 on a join link | `button "Play with bots"` count is 0 | Same button, new name. |
| `scripts/chunk-fail-prove.mjs:283` | `button "Play"` count is 0 after the reload | `button "Play with bots"` count is 0 | Same button, new name. |
| `scripts/profiles-ui-prove.mjs:205` | `["Play", "Host a table", "Join"]` are enabled | `["Play with bots", "Host a table", "Join"]` are enabled | Same button, new name. |
| `scripts/profiles-ui-prove.mjs:351` | `button "Play"` is enabled | `button "Play with bots"` is enabled | Same button, new name. |
| `scripts/profiles-ui-prove.mjs:368` | `button "Play"` is enabled | `button "Play with bots"` is enabled | Same button, new name. |
| `scripts/wayfarer-setup-prove.mjs:87` | click `'Play'`, then `assert.equal(await mode(),'off')` | click `'Play with bots'`, then the same assert | The click and the assert share a line. Only the click's button name changed. |
| `scripts/wayfarer-setup-prove.mjs:94` | click `'Play'`, then `assert.equal(await mode(),'on')` | click `'Play with bots'`, then the same assert | Same. |

Lines that are not checks also changed. They are presses and waits, with the button's new name:

- `name: "Play", exact: true` became `name: "Play with bots", exact: true` in 39 proof files.
- "Four seats, one table" became "Pass and play" in 31 proof files.
- `scripts/chrome-prove.mjs:72` and `scripts/contrast-prove.mjs:64` read the 12 px caption from "Code for private tables". They read it from "3 bots, no network" before.
- `scripts/chrome-prove.mjs:55` reads the white surface from the tray itself at every size. On desktop it read an inner panel that no longer exists.
- `scripts/loading-screen-prove.mjs:213` presses Play, then Play with bots. It is the one proof that walks the real path from the loading screen.

## After the owner's answers (card A on #1151)

A first visit's Start now opens the Play page, so the press of Play after Start no longer exists on a first visit.

| File:line | Old | New | Why |
|---|---|---|---|
| `scripts/loading-screen-prove.mjs:214` | `await page.getByRole("button", { name: "Play", exact: true }).click();` | `check(… data-page === "play", "a first visit's Start opens the Play page")` | Card A: Start lands on the Play page for a new visitor. The line now proves that. The next line still presses Play with bots and line 217 still proves the game starts. A later visit's front page is a new check in the same proof. |
| `scripts/loading-screen-prove.mjs:212-213` | `wordmark = …locator("h1").evaluate(fontSize)`; `check(wordmark === "56px", "the title wordmark is 56 px")` | `wordmark = …locator("h1").count()`; `check(wordmark === 0, "a first visit lands past the wordmark, on the Play page …")` | A first visit's Start lands on the Play page, which has no wordmark. The 56 px check moves, unchanged, to the later visit's front page in the same proof (new lines 368-369). |
