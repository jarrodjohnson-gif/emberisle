# Title proof evidence — #1102

Screen code: `2318a05`. Approved assertion replacements: `c57abf1`.
The latter commit changes exactly the ten authorized lines.
Setup-selector migrations preserve every other assertion.

Node 22.23.4 matches CI. The initial unchanged-main control fails waiting for the new bot button.
The final new proof passes at 390×844, 844×390, and 1280×720.
It checks real Host, Join, Watch, taken-colour peek, bots, pass-device, rules, names, sound, help and focus.
Screenshots use the real renderer.

## Final commands and results

| Command | Exit | Evidence |
|---|---:|---|
| npm run typecheck | 0 | logs/ship-types.log |
| npm run build | 0 | logs/ship-build.log |
| npm run title-layout-prove | 0 | logs/ship-layout.log |
| node scripts/registered-prove.mjs | 0 | logs/ship-registered.log |
| node scripts/loosen-prove.mjs --base origin/main | 1 | Exactly the ten approved lines; logs/ship-loosen.log |
| node scripts/size-prove.mjs --base fresh-main-build | 0 | logs/ship-size.log |
| node scripts/size-delta-prove.mjs | 0 | logs/size-delta.log |
| node scripts/title-prove.mjs | 0 | All six viewports; logs/title-existing.log |
| node scripts/title-chunks-prove.mjs | 0 | Held and failed optional modules; logs/title-chunks.log |
| node --import ./server/register.mjs scripts/wayfarer-setup-prove.mjs | 0 | Complete sticky/fortune/network persistence coverage; logs/wayfarer-complete.log |

All existing chunk ceilings and allowances remain unchanged.
Only the new Title and extracted focus-trap chunks receive new ceiling entries.
The size fixture suite passes with those entries.
Earlier checkpoint logs retain the negative control and obsolete-selector failure for comparison.

## Approved assertion replacements

The desk approved the first seven lines in issue comment 6394178335 and the remaining three in 6394347477.
All ten replacements share commit c57abf1, separate from feature code and setup migrations.
Every flag from loosen-prove appears below. The detector remains unchanged.

| Base file:line | Old | New | Why |
|---|---|---|---|
| scripts/title-prove.mjs:82 | `assert.deepEqual(card.primary, ["Play"], `${tag}: the one primary`);` | `assert.deepEqual(card.primary, ["Play against bots"], `${tag}: the one primary`);` | Approved direct play label. |
| scripts/title-prove.mjs:83 | `assert.deepEqual([...card.filled].sort(), ["Host a table", "Join", "Play"], `${tag}: filled buttons`);` | `assert.deepEqual([...card.filled].sort(), ["Join", "Play against bots", "Watch"], `${tag}: filled buttons`);` | Exact filled-button set for the approved design. |
| scripts/title-prove.mjs:92 | `assert.equal(await watch.count(), 0, `${tag}: Watch before a code`);` | `assert.equal(await watch.isVisible(), true, `${tag}: Watch visible before a code`);` | Watch remains visible before a code. |
| scripts/title-prove.mjs:97 | `assert.equal(await watch.count(), 0, `${tag}: Watch at 3 characters`);` | `assert.equal(await watch.isVisible(), true, `${tag}: Watch visible at 3 characters`);` | Watch remains visible with an incomplete code. |
| scripts/title-chunks-prove.mjs:124 | `check((await settings.locator("summary").textContent()).includes("Online: on"), "settings summary stays eager");` | `check(await page.getByRole("button", { name: "Wayfarer rules", exact: true }).isVisible(), "rules sheet entry stays eager");` | Eager rules entry replaces the disclosure. |
| scripts/title-chunks-prove.mjs:134 | `check((await settings.locator("summary").textContent()).includes("Online: off") &&` | `check(await page.getByRole("combobox", { name: "Host a table online", exact: true }).inputValue() === "off" &&` | Read the sheet selection and retain the same store check. |
| scripts/wayfarer-setup-prove.mjs:37 | `assert.equal(await page.getByLabel('Practice wayfarer',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Online wayfarer',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Hotseat wayfarer',{exact:true}).inputValue(),'on');` | `assert.equal(await page.getByLabel('Play against bots',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Host a table online',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Pass this device',{exact:true}).inputValue(),'on');` | All three renamed choices still default to On. |
| scripts/wayfarer-setup-prove.mjs:62 | `await sticky.getByRole('button',{name:'Play',exact:true}).click();assert.equal(await mode(),'off');` | `await sticky.getByRole('button',{name:'Play against bots',exact:true}).click(); assert.equal(await mode(),'off');` | Only the button selector changes; the Off assertion is unchanged and split onto its own line. |
| scripts/wayfarer-setup-prove.mjs:68 | `for(const label of ['Practice','Hotseat','Online'])assert.equal(await sticky.getByLabel(`${label} wayfarer`,{exact:true}).inputValue(),'on',`${label} resets to the default on the menu`);` | `for(const label of ['Play against bots','Pass this device','Host a table online'])assert.equal(await sticky.getByLabel(label,{exact:true}).inputValue(),'on',`${label} resets to the default on the menu`);` | Only the three labels change; every reset value must still equal On. |
| scripts/wayfarer-setup-prove.mjs:69 | `await sticky.getByRole('button',{name:'Play',exact:true}).click();assert.equal(await mode(),'on');` | `await sticky.getByRole('button',{name:'Play against bots',exact:true}).click(); assert.equal(await mode(),'on');` | Only the button selector changes; the On assertion is unchanged and split onto its own line. |
