# Title proof evidence — #1102

Initial screen code: `2318a05`. Approved assertion replacements: `c57abf1`.
The latter commit changes exactly the ten authorized lines.
Setup-selector migrations preserve every other assertion.

Node 22.23.4 matches CI. The initial unchanged-main control fails waiting for the new bot button.
The final new proof passes at 390×844, 844×390, and 1280×720.
It checks real Host, Join, Watch, taken-colour peek, bots, pass-device, rules, names, sound, help and focus.
Screenshots use the real renderer.

## Initial ready-PR commands and results

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
| scripts/title-prove.mjs:92 | `assert.equal(await watch.count(), 0, `${tag}: Watch before a code`);` | Visible **and disabled** at zero characters; enabled at four. | Watch remains visible and disabled before a code; enabled only at four characters. |
| scripts/title-prove.mjs:97 | `assert.equal(await watch.count(), 0, `${tag}: Watch at 3 characters`);` | Visible **and disabled** at three characters; enabled at four. | Watch remains visible and disabled with an incomplete code. |
| scripts/title-chunks-prove.mjs:124 | `check((await settings.locator("summary").textContent()).includes("Online: on"), "settings summary stays eager");` | `check(await page.getByRole("button", { name: "Wayfarer rules", exact: true }).isVisible(), "rules sheet entry stays eager");` | Eager rules entry replaces the disclosure. |
| scripts/title-chunks-prove.mjs:134 | `check((await settings.locator("summary").textContent()).includes("Online: off") &&` | `check(await page.getByRole("combobox", { name: "Host a table online", exact: true }).inputValue() === "off" &&` | Read the sheet selection and retain the same store check. |
| scripts/wayfarer-setup-prove.mjs:37 | `assert.equal(await page.getByLabel('Practice wayfarer',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Online wayfarer',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Hotseat wayfarer',{exact:true}).inputValue(),'on');` | `assert.equal(await page.getByLabel('Play against bots',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Host a table online',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Pass this device',{exact:true}).inputValue(),'on');` | All three renamed choices still default to On. |
| scripts/wayfarer-setup-prove.mjs:62 | `await sticky.getByRole('button',{name:'Play',exact:true}).click();assert.equal(await mode(),'off');` | `await sticky.getByRole('button',{name:'Play against bots',exact:true}).click(); assert.equal(await mode(),'off');` | Only the button selector changes; the Off assertion is unchanged and split onto its own line. |
| scripts/wayfarer-setup-prove.mjs:68 | `for(const label of ['Practice','Hotseat','Online'])assert.equal(await sticky.getByLabel(`${label} wayfarer`,{exact:true}).inputValue(),'on',`${label} resets to the default on the menu`);` | `for(const label of ['Play against bots','Pass this device','Host a table online'])assert.equal(await sticky.getByLabel(label,{exact:true}).inputValue(),'on',`${label} resets to the default on the menu`);` | Only the three labels change; every reset value must still equal On. |
| scripts/wayfarer-setup-prove.mjs:69 | `await sticky.getByRole('button',{name:'Play',exact:true}).click();assert.equal(await mode(),'on');` | `await sticky.getByRole('button',{name:'Play against bots',exact:true}).click(); assert.equal(await mode(),'on');` | Only the button selector changes; the On assertion is unchanged and split onto its own line. |

## Desk review follow-up

See [review-assertions.md](review-assertions.md) for every additional old/new probe and assertion row, including restored computed-color measurement and disabled/enabled Watch states. The 55% phone height cap is unchanged; portrait padding gives a 464px card. Final refreshed-main results are recorded separately below after verification.

## First review verification, 2026-10-25

Fresh head/base clones with offline `npm ci`, Node 22.23.4; base `b90290abf4a3cd8c63bddf1e7f939e75b71c2418`. The serial final sequence tested `5e92df66`; the later connection-health-only selector/synchronization fix has its own full proof. Runtime files are identical. Raw output and source hashes: [logs/ci-review](logs/ci-review/).

| Command / proof | Exit |
|---|---:|
| typecheck, build, registered-prove (146 registrations), size-delta-prove | 0 each |
| title-layout-prove, title-prove, title-chunks-prove | 0 each |
| wayfarer-setup-prove, chat-prove, reflow-prove, contrast-prove | 0 each |
| polish-tokens-prove, chunk-fail-prove, watch-ui-prove, pages-prove | 0 each |
| connection-health-prove (after selector/synchronization fix) | 0 |
| size-prove against freshly built main | 0 |
| loosen-prove against main | 1: exactly 14 approved-equivalent lines in six proofs |

Index: 122671 B gzip versus main 124283 B (−1612 B); ceiling 125200 B, original allowance 400 B. All other chunks pass their unchanged ceilings/allowances. Only Title/focus-trap have new chunk entries. The original 55% portrait height assertion remains; actual card height is 464px. Screenshots at 390x844, 844x390 and 1280x720 were captured by the fresh-clone proof and inspected.

Preserved unsuccessful attempts: a sandboxed Node 26 Watch launch exited 13 before host startup; Node 22 focused and final Watch runs pass. Connection-health first failed at unchanged `clock.pauseAt` with “Cannot fast-forward to the past”; the next run reached its unchanged exact failed-URL assertion before the lazy Title's parent import settled. The final run waits with the existing 5-second helper for both reports, then passes the unchanged exact set and all recovery checks. No clock/transport timings or assertions were changed. An initial `size-prove --fixtures` invocation read stale build output because that option does not select fixtures; the correct size-delta proof and both fresh builds/size comparison pass. Personal/temp checkout prefixes are redacted in logs; results remain intact.

## Second review fixes and final verification

B1 reproduced before runtime edits: with three open-table entries plus an error, the 844x390 wordmark starts at y=−207. One real host supplies the list payload; two extra entries are injected into that response because the host correctly limits one open table per IP. The control and fixture-limit attempt are preserved in [logs/overflow-review](logs/overflow-review/).

Separate commits: c331fce2 strengthens the proofs; 667402a6 caps the card to the viewport, restores title/Wayfarer prefetch and lets the store truncate Unicode names; 4817b02e recognizes the intentionally aborted chunk’s exact retry URL in the probe. No behavioral assertion, timing threshold, ceiling or allowance is removed or raised.

The ordinary accepted card remains unscrolled at all three sizes. Optional content can scroll when it exceeds the viewport. Listed/error cases now keep the wordmark at y=25 (844x390) and y=57 (1280x720), Play remains visible and uncovered, and the last list entry is reachable. Listed screenshots show that final scrolled position. The existing registered title proof now also checks identity/lock/helper/heading visibility, desktop 40px/384px placement, space beside the landscape card, 44px/8px sheet controls and 16 emoji code points. Both prefetch tests and held/failed module checks pass.

Final local results: typecheck, build, registration, size, size fixtures, title-layout, title-chunks (focused retry), title, chunk-fail, connection-health and full Wayfarer setup/persistence all pass. Raw output, original failures, exit statuses and source hashes are committed in logs/overflow-review. Index 122691 B gzip against the immutable built base b90290ab (124283 B): −1592 B; ceiling 125200 B, allowance 400 B unchanged.

The shared origin/main tracking ref advanced to 9bde9861 during this run. The first loosen output consequently reports 25 flags, including later tests absent from this older branch. The immutable merge-base comparison (b90290ab) reports exactly the same 14 approved equivalents. Both raw outputs are retained; GitHub confirmed the PR remains MERGEABLE. New-head CI checks the merged current-main tree. Earlier head 411c70e6 completed every required CI job successfully; its advisory loosen result was accepted by the desk.
