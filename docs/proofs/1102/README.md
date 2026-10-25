# Title proof evidence — #1102

Screen code: `2318a05`. Approved assertion replacements: `be27060`.
The latter commit changes exactly the seven authorized lines.
Setup-selector migrations preserve every other assertion.

Node 22.23.4 matches CI. The initial unchanged-main control fails waiting for the new bot button.
The final new proof passes at 390×844, 844×390, and 1280×720.
It checks real Host, Join, Watch, taken-colour peek, bots, pass-device, rules, names, sound, help and focus.
Screenshots use the real renderer.

## Commands and results

| Command | Exit | Evidence |
|---|---:|---|
| npm run typecheck | 0 | logs/types.log |
| npm run build | 0 | logs/build.log |
| npm run title-layout-prove | 0 | logs/title-layout.log |
| node scripts/registered-prove.mjs | 0 | logs/registered.log |
| node scripts/loosen-prove.mjs --base origin/main | 1 | Exactly the seven approved lines; logs/loosen.log |
| node scripts/size-prove.mjs --base fresh-main-build | 0 | logs/size.log |
| node scripts/size-delta-prove.mjs | 0 | logs/size-delta.log |
| node scripts/title-prove.mjs | 0 | All six viewports; logs/title-existing.log |
| node scripts/title-chunks-prove.mjs | 0 | Held and failed optional modules; logs/title-chunks.log |
| node --import ./server/register.mjs scripts/wayfarer-setup-prove.mjs | 1 | Six creation cases pass; sticky section waits for legacy Play; logs/wayfarer-existing.log |

All existing chunk ceilings and allowances remain unchanged.
Only the new Title and extracted focus-trap chunks receive new ceiling entries.
The size fixture suite passes with those entries.

## Approved assertion replacements

The desk approved these exact replacements in issue comment 6394178335.
Every flag from loosen-prove appears below.

| Base file:line | Old assertion | New assertion | Reason |
|---|---|---|---|
| scripts/title-prove.mjs:82 | `assert.deepEqual(card.primary, ["Play"], `${tag}: the one primary`);` | `assert.deepEqual(card.primary, ["Play against bots"], `${tag}: the one primary`);` | Use the approved direct play label. |
| scripts/title-prove.mjs:83 | `assert.deepEqual([...card.filled].sort(), ["Host a table", "Join", "Play"], `${tag}: filled buttons`);` | `assert.deepEqual([...card.filled].sort(), ["Join", "Play against bots", "Watch"], `${tag}: filled buttons`);` | Check the new filled-button set. |
| scripts/title-prove.mjs:92 | `assert.equal(await watch.count(), 0, `${tag}: Watch before a code`);` | `assert.equal(await watch.isVisible(), true, `${tag}: Watch visible before a code`);` | Watch stays visible before a code. |
| scripts/title-prove.mjs:97 | `assert.equal(await watch.count(), 0, `${tag}: Watch at 3 characters`);` | `assert.equal(await watch.isVisible(), true, `${tag}: Watch visible at 3 characters`);` | Watch stays visible with an incomplete code. |
| scripts/title-chunks-prove.mjs:124 | `check((await settings.locator("summary").textContent()).includes("Online: on"), "settings summary stays eager");` | `check(await page.getByRole("button", { name: "Wayfarer rules", exact: true }).isVisible(), "rules sheet entry stays eager");` | The rules sheet replaces the disclosure. |
| scripts/title-chunks-prove.mjs:134 | `check((await settings.locator("summary").textContent()).includes("Online: off") &&` | `check(await page.getByRole("combobox", { name: "Host a table online", exact: true }).inputValue() === "off" &&` | Check the sheet selection and the same store value. |
| scripts/wayfarer-setup-prove.mjs:37 | `assert.equal(await page.getByLabel('Practice wayfarer',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Online wayfarer',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Hotseat wayfarer',{exact:true}).inputValue(),'on');` | `assert.equal(await page.getByLabel('Play against bots',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Host a table online',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Pass this device',{exact:true}).inputValue(),'on');` | Check all three defaults through the new labels. |
