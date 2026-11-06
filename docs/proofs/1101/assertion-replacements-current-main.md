# #1101 assertion replacement evidence

Snapshot: current working tree compared with `origin/main` (`9bde9861490662ef3e95e90db5cfa2dc7874fd55`), 2026-10-25. Base line numbers below refer to main, not shifted working-tree lines. This is a source audit; it does not assert test success.

Justification keys:
- **Dock**: owner-approved stationary phone dock, #1101 and DECISIONS 2026-10-22/2026-10-24; every phone slot remains present and stationary, empty hand shows zeros, disabled controls explain unavailability, Menu moves into dock.
- **Replacement**: desk Option A on #1101 and AGENTS rule 13: replace superseded assertions at equal or greater strength, preserve desktop behavior, separate proof commit and old/new table.
- **Handoff**: desk release 2026-10-25 explicitly permits main reversion or documented justification for safe-area188–189; all other changed supporting lines are enumerated below.
- **Size**: owner-approved one-PR index/growth exception, implemented as +480 B growth beyond normal400 B, within the owner900 B cap; retain lazy TradeSlot and existing ceilings.

## Replaced assertions and behavioral waits

| Main file:line | Old assertion / wait | Current replacement | Justification / preserved coverage |
|---|---|---|---|
| `scripts/build-ready-prove.mjs:272` | Roll phase requires no `build-path` element | Touch: Path exists with `data-build-state=idle` and `aria-disabled=true`; desktop still absent; phase still Roll | Dock, Replacement: build row always occupies its slot. Later ready-pulse checks remain. |
| `scripts/first-game-coach-prove.mjs:161` | One Shift+Tab from Menu to Skip | Eleven Shift+Tab presses exactly yield ten `dock` entries then `Skip`; existing final Skip-focus assertion retained | Dock, Replacement: fixed goods/build/Fortunes controls intervene. |
| `scripts/first-game-coach-prove.mjs:163` | One Tab from Skip to Menu | Eleven Tab presses exactly yield ten `dock` entries then `Menu`; existing final Menu-focus assertion retained | Dock, Replacement: verify reverse route and reject outside focus. |
| `scripts/fortune-count-prove.mjs:60` | Button count equals `held>0 ? 1 : 0` | Desktop predicate retained; phone exactly one opener, disabled iff held=0, exact x/y/w/h unchanged across snapshots | Dock, Replacement: persistent Fortunes slot and no movement through purchases/restart. |
| `scripts/fortune-count-prove.mjs:61` | For initially empty seats and watcher, opener count0 | Phone count1 and disabled=true; desktop count0; added watcher text/name exactly `Fortunes` and no digits in text/name/description | Dock, Replacement: keep a disabled phone slot without leaking held counts; watcher label remains disabled and discloses no held count. |
| `scripts/fortune-count-prove.mjs:62–63` | Purchase/restart snapshots only call heldMatchesOpener | Each snapshot still calls it, plus watcherPrivate checks | Preserve privacy on every purchase and restart; host private-card assertions unchanged. |
| `scripts/fortune-cue-prove.mjs:129` | Empty-hand opener detaches | Touch: glow detaches, opener disabled=true, label `Fortunes · 0`, exact box equals pre-empty box; desktop detachment unchanged | Dock, Replacement: no cue and disabled stationary opener replace disappearance. |
| `scripts/fortune-tray-prove.mjs:329` | Empty hand: opener count0 | Touch `{n:1, off:"true", inSlot:true}` using exact opener/slot rectangle equality; desktop0 | Dock, Replacement: fixed disabled opener fills the slot. |
| `scripts/fortune-tray-prove.mjs:330` | Focus falls to Trade | Touch focus stays on `Fortunes · 0`; desktop still Trade | Dock, Replacement: persistent opener is restored focus target. |
| `scripts/hand-hidden-prove.mjs:125` | Roll-off resource tile count0 | Touch5; desktop0; added phoneHand verifies actual-seat counts and exact fixed boxes | Dock, Replacement: five zero cards are present from first roll. |
| `scripts/hand-hidden-prove.mjs:126` | Roll-off hand-dock count0 | Touch1; desktop0 | Dock, Replacement: hand mounted from outset. |
| `scripts/hand-hidden-prove.mjs:130` | First setup tile count0 | Touch5; desktop0; phoneHand verifies seat counts and box stability | Dock, Replacement: setup does not remove slot. |
| `scripts/hand-hidden-prove.mjs:149` | Before each setup outpost, tile count0 | Touch5; desktop0; phoneHand on every checked setup step | Dock, Replacement: retains real rules-driven setup sequence and actual resource comparison. |
| `scripts/hand-hidden-prove.mjs:161` | Banner position changes by 0.8×hand height through hand height+10px | Touch exact `full===bare` plus exact hand/dock/status boxes; desktop original range retained | Dock, Replacement: payment changes values without shifting dock. |
| `scripts/hand-hidden-prove.mjs:169–177` | Reduced motion null/≤1ms; normal hand-in220ms, exact easing, opacity/transform-only, midpoint opacity, final-height footprint | Touch probe must return null; opacity exactly1, zero hand-* animations, exact final height; desktop retains every original animation assertion | Dock, Replacement: already-mounted phone hand must not run mount animation; no desktop animation coverage lost. |
| `scripts/hand-hidden-prove.mjs:202` | Never-funded seat: wait for hand-dock absent | Touch phoneHand wait verifies actual current-seat counts, one hand and exact boxes; desktop absence wait retained | Dock, Replacement: current-seat data refreshes within fixed slot. |
| `scripts/hand-hidden-prove.mjs:203` | Never-funded seat tile count0 | Touch5; desktop0 | Dock, Replacement: phone zeros remain, desktop hides hand. |
| `scripts/hand-hidden-prove.mjs:229` | Fresh setup after prior funded game: wait for hand-dock absent | Touch phoneHand wait plus exact box/count assertion; desktop absence wait retained | Dock, Replacement: retains state-reset scenario without sticky earlier values. |
| `scripts/hand-hidden-prove.mjs:230` | Fresh setup tile count0 | Touch5; desktop0 | Dock, Replacement: empty fresh setup retains five zero cards. |
| `scripts/hud-safe-area-prove.mjs:202` | With full hand/every fortune, `m.scrolls` | `!m.scrolls` | Dock, Replacement: fixed dock must never scroll. |
| `scripts/hud-safe-area-prove.mjs:203` | Control inside safe area,44px tall, uncovered, inside scroller | Identical predicate against fixed dock; message updated | Dock, Replacement: preserve safe bounds, size and hit-testing. |
| `scripts/hud-safe-area-prove.mjs:226` | Cue absent OR End absent OR cue bottom≈End-parent top within1px | Cue absent AND End exists AND End parent is exact `[data-slot="turn"]` | Dock, Replacement: no overflow cue and mandatory turn-slot ownership. |
| `scripts/hud-safe-area-prove.mjs:234` | >3 keyboard controls, none covered by pinned row | Same >3 count and zero covered controls, described as dock controls | Replacement: predicate retained. |
| `scripts/hud-safe-area-prove.mjs:235` | Every focus: cue above pinned row | Every focus: no cue, End exists in exact turn slot | Dock, Replacement: uses strengthened cueClear predicate. |
| `scripts/reflow-prove.mjs:219` | height≤568 stack overflows | height≤568 no overflow AND no cue | Dock, Replacement: short-phone dock must fit; remaining target reachability/board checks retained. |
| `scripts/table-menu-prove.mjs:68` | Exactly one button in top64px | Touch0; desktop1 | Dock, Replacement: Menu moves to bottom dock. |
| `scripts/table-menu-prove.mjs:72` | Menu right<32 and top<32 | Touch exact Menu-slot box, bottom<48, portrait right<32 / landscape left<32; desktop original | Dock, Replacement: relocated Menu retains name and≥44px checks. |
| `scripts/visual-direction-prove.mjs:63` | End horizontal box fits `.end-footer`; two dice, exact sum8, dice row in viewport | End full horizontal/vertical box fits turn slot; same two dice/sum8; row in viewport AND status slot | Dock, Replacement: dice and turn control now occupy separate fixed slots; no original count/sum/viewport check removed. |
| `scripts/visual-direction-prove.mjs:109` | Offer nonmodal, inside visible bottom stack | Original assertions retained; phone adds exact status-slot x/y/w/h within0.5px | Dock, Replacement: compact offer fills fixed status slot. |

## Supporting selectors, helpers and measurements

| Main file:line | Old | Current replacement | Reason / scope |
|---|---|---|---|
| `scripts/build-ready-prove.mjs:230` | Build Path nearest `.overflow-y-auto` scrollHeight | Nearest dock scrollHeight, fallback to old scroller | Measure new phone container while keeping desktop measurement and existing height/board-hole bounds. |
| `scripts/first-game-coach-prove.mjs:143` | `header [aria-label="Table menu"]` | `[data-slot="menu"] [aria-label="Table menu"]` | Locate moved Menu; seat and Skip selectors/count remain. |
| `scripts/first-game-coach-prove.mjs:161` | No traversal helper | walk(key) records11 consecutive focus destinations | Supports two new exact keyboard-route assertions. |
| `scripts/fortune-count-prove.mjs:58` | Comment: My fortunes never shown to watcher | Comment: fixed phone slot disabled when empty, watcher has no held count | Explicitly document phone watcher presentation change. |
| `scripts/fortune-count-prove.mjs:61` | No watcherPrivate helper | Checks watcher text/name exactlyFortunes, no numeric count in text/name/description | Added private-data boundary check accompanying persistent slot. |
| `scripts/fortune-cue-prove.mjs:128` | Craft empty hidden hand | Capture opener boundingBox, then same craft | Baseline for stationary-box comparison. |
| `scripts/hand-hidden-prove.mjs:121` | No fixed phone snapshot | phoneBoxes records hand-dock/dock/turn-banner exact x/y/w/h; fixed initial snapshot | Supports stronger stationary geometry checks. |
| `scripts/hand-hidden-prove.mjs:121` | No phoneHand helper | Wait counts equal current actor's resources in fixed resource order; assert one hand and exact boxes | Retains actual state identity and strengthens geometry. |
| `scripts/hand-hidden-prove.mjs:191` | Five zero counts only | Same assertion plus phoneHand | Adds geometry/state equality after spend-to-zero. |
| `scripts/hand-hidden-prove.mjs:268–269` | Console reports0 tiles through setup and220ms rise | Touch console reports5 fixed tiles through roll-off/setup/payment and no mount animation; desktop wording retained | Reporting follows measured phone/desktop contracts. |
| `scripts/hud-safe-area-prove.mjs:188–189` | Walk to ancestor overflowY=auto | Closest dock; throw if absent | **Explicit Handoff extra lines:** positive dock ownership required instead of nonexistent scroller. |
| `scripts/hud-safe-area-prove.mjs:208` | turn-banner.parentElement | dock selector | Start keyboard traversal at correct fixed container. |
| `scripts/hud-safe-area-prove.mjs:216` | turn-banner.parentElement | dock selector | Focus-containment boundary for every Tab. |
| `scripts/hud-safe-area-prove.mjs:220` | Cue rectangle | Cue element | Absence now checked; geometry no longer appropriate. |
| `scripts/hud-safe-area-prove.mjs:221` | End-parent rectangle | End button element | Enables exact parent===turn-slot assertion, not just existence. |
| `scripts/hud-safe-area-prove.mjs:246` | turn-banner.parentElement | dock selector | **Additional supporting selector:** fortune-tray coverage/hit-test still inspects same End-turn slot; existing tray bounds/assertions retained. |
| `scripts/reflow-prove.mjs:161` | column iff stack width<half viewport | When dock exists, column iff width>height; otherwise old predicate | **Additional supporting measurement:** fixed320px column can exceed half a narrow landscape viewport; use actual dock orientation. Board-clearance thresholds/hit tests unchanged. |
| `scripts/table-menu-prove.mjs:69` | First top-row button | Touch trigger measured relative to exact Menu slot, screen edges and orientation; desktop original | Supplies new placement predicate without changing menu behavior checks. |
| `scripts/visual-direction-prove.mjs:62` | `.end-footer` rectangle and last button | exact turn-slot rectangle and button; status-slot rectangle | Containers moved by approved layout. |
| `scripts/visual-direction-prove.mjs:94` | Offer bounds, insideStack, modal | Same fields plus status-slot rectangle equality within0.5px | Additional exact slot evidence. |

## Size exception and additional proof

| Main file:line | Old | New | Owner justification |
|---|---|---|---|
| `scripts/size-prove.mjs:56` | No TradeSlot chunk ceiling | TradeSlot1000B ceiling, measured comment0.80kB | Handoff requires keeping lazyTradeSlot; only new chunk ceiling added. |
| `scripts/size-prove.mjs:59` | index growth400B |400+480B | One-PR480B extra for measured build-stamp variation, within owner900B cap; desk removes after merge. Existing index/chunk ceilings unchanged in current diff. |
| `scripts/stationary-dock-prove.mjs` (new) | No stationary-six-state proof | Two phone viewports × six states; exact dock/slot positions≤0.5px,44px targets,8px separation, portrait bottom-third and≥60% board-height, landscape board-height, no intrusion, zero console errors | New registered proof implements#1101 completion test. Original builder recorded105 failures on main; current actual run evidence belongs in PR. |


## Chat assertions added or replaced against current main

| Main file:line | Old assertion / wait | Current replacement | Owner/desk justification |
|---|---|---|---|
| `scripts/chat-prove.mjs:1263` (insertion) | No touch-input assertion for the reused own/other-turn pages | Enable CDP touch and assert `matchMedia("(pointer: coarse)").matches` before both phone-layout fixtures | #1101 phone dock approval: the same phone input class must exercise both turns at390x844,360x640,844x390, including sideways width844. |
| `scripts/chat-prove.mjs:1298` | Emoji row safe left/right/bottom and top at or below opener bottom | Same safe left/right/bottom plus safe top; portrait/non-dock keeps top≥opener bottom; landscape dock requires complete sheet containment and no overlap with Menu or seat strip | #1101 approved Chat placement at column bottom supersedes the old below-opener assumption; geometric containment and nonoverlap replace it positively. |
| `scripts/chat-prove.mjs:1320` | Zero dock failures; log calls controls top-row buttons | Same `dockFailures.length === 0`; label says fixed phone controls at same3 viewports and both turns | #1101 relocates landscape controls; success criterion unchanged. |
| `scripts/chat-prove.mjs:1494` | Both tabs: `sheet.top >= strip.bottom + 56` | Portrait exact original condition; landscape chat sheet does not overlap full strip+56px bubble-band rectangle, is wholly in viewport, has exactly expected seat VP totals, all totals nonzero and uncovered | #1101 approved landscape left column: horizontal separation is valid; preserve entire56px band and strengthen viewport/seat visibility. |

## Additional Chat supporting measurements and fixture restoration

| Main file:line | Old | Current replacement | Reason / retained checks |
|---|---|---|---|
| `scripts/chat-prove.mjs:1263` (insertion) | CDP session only | Read `wasTouch`; `Emulation.setTouchEmulationEnabled({enabled:true,maxTouchPoints:1})` | Own/other turns both use actual phone pointer mode; viewport/inset,44px controls,status/board-target exclusion,turn-stability checks remain. |
| `scripts/chat-prove.mjs:1296` | Emoji row rectangle only | Same rectangle plus dock presence, full chat-sheet rectangle and seat-strip rectangle | Supplies exact new landscape containment and no-overlap predicates; portrait placement retained. |
| `scripts/chat-prove.mjs:1314` (insertion) | Reset safe-area insets only | Same safe-area reset plus restore touch emulation to `wasTouch` | Prevent phone fixture from changing subsequent desktop input behavior; original viewport restoration remains. |
| `scripts/chat-prove.mjs:1493` | Read sheet top and strip bottom | Retain both; also sheet full rectangle, strip+56px band, overlap predicate, viewport containment,expected/actual visible seat-total counts,hit tests | Supports landscape equivalent of below-strip geometry while retaining portrait bound. Transparent `chat-backdrop` ignored as in existing overlay proof; other occluders remain failures. |

## Coverage retained outside the replacements

Trade-map and rotate-overlays are unchanged versus this main. Full Chat-open offer details/receipt,scrolling,8px separation,44px hit targets,seat visibility,privacy and failure assertions remain. Chat still checks the same safe-area emulation,own/other turns,unread behavior,newest line,whole-line count,font sizes and unchanged island hole. Hand-hidden retains actual rules-driven setup,spend-to-zero,current-seat switch,fresh setup,forced island remeasure,gain-flash pointer transparency and console-error checks. The existing desktop visibility/animation/placement branches remain.

## Legal-point readiness added during final validation

| Base file:line | Old | New | Why |
|---|---|---|---|
| `scripts/hud-safe-area-prove.mjs:294–297` | Read the first legal corner projection once, then tap its coordinates | Wait within the unchanged STEP_MS for that legal corner to have finite projected coordinates, then tap it | A final run observed a transient null projection. This adds a positive readiness requirement; every existing five-tap limit, safe-area, geometry and failure assertion remains. |

## Exact current-main proof diff

```diff
diff --git a/scripts/build-ready-prove.mjs b/scripts/build-ready-prove.mjs
index 7c79e5c9..91eb9898 100644
--- a/scripts/build-ready-prove.mjs
+++ b/scripts/build-ready-prove.mjs
@@ -227,7 +227,7 @@ try {
         // The build row has not grown: the stack's content is no taller than on main, and the island's hole no smaller.
         if (h.name === "outpost goods, no spot") {
           const fit = await page.evaluate(() => ({
-            stack: document.querySelector('[data-testid="build-path"]').closest(".overflow-y-auto").scrollHeight,
+            stack: ((el) => el.closest('[data-testid="dock"]')?.scrollHeight ?? el.closest(".overflow-y-auto").scrollHeight)(document.querySelector('[data-testid="build-path"]')),
             holeBottom: window.__isle.insets().bottom,
           }));
           const allow = MAIN_STACK[v.tag] + (v.touch ? 0 : DESKTOP_GROW) + 2;
@@ -269,7 +269,7 @@ try {
       await page.waitForFunction(() => !document.querySelector('[data-testid="build-path"]').classList.contains("build-ready"));
       // A roll: the row is not up in the roll phase and the goods come with main; that makes the Path newly payable too.
       await craft({ hand: NONE, pathsLeft: 5, deckLeft: 5, phase: "roll" });
-      await page.waitForFunction(() => !document.querySelector('[data-testid="build-path"]') && window.__emberisle.getState().state.phase === "roll");
+      await page.waitForFunction((touch) => { const p = document.querySelector('[data-testid="build-path"]'); return (touch ? p?.dataset.buildState === "idle" && p.getAttribute("aria-disabled") === "true" : !p) && window.__emberisle.getState().state.phase === "roll"; }, !!v.touch);
       await page.waitForTimeout(300);
       await craft({ hand: { ...NONE, timber: 1, clay: 1 }, pathsLeft: 5, deckLeft: 5, phase: "main" });
       await page.waitForFunction(() => document.querySelector('[data-testid="build-path"]').classList.contains("build-ready"));
diff --git a/scripts/chat-prove.mjs b/scripts/chat-prove.mjs
index 73d8a858..a3dc0b69 100644
--- a/scripts/chat-prove.mjs
+++ b/scripts/chat-prove.mjs
@@ -1260,6 +1260,9 @@ try {
     const roll = t.page.getByRole("button", { name: "Roll", exact: true });
     const turn = ownTurn ? "own Roll turn" : "another seat's turn";
     const cdp = await t.page.context().newCDPSession(t.page);
+    const wasTouch = await t.page.evaluate(() => matchMedia("(pointer: coarse)").matches);
+    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
+    check(await t.page.evaluate(() => matchMedia("(pointer: coarse)").matches), "chat dock: both turn fixtures use phone touch input");
     for (const size of DOCK_SIZES) {
       const tag = `${size.width}x${size.height}, ${turn}`;
       await t.page.setViewportSize({ width: size.width, height: size.height });
@@ -1293,9 +1296,11 @@ try {
       await t.page.getByTestId("emoji-row").waitFor();
       const row = await t.page.getByTestId("emoji-row").evaluate((el) => {
         const r = el.getBoundingClientRect();
-        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
+        const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
+        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, dock: !!document.querySelector('[data-testid="dock"]'), sheet: box(document.querySelector('[data-testid="chat-sheet"]')), strip: box(document.querySelector('[data-testid="seat-strip"]')) };
       });
-      if (row.left < safe.left || row.right > safe.right || row.top < m.chat.bottom || row.bottom > safe.bottom) bad(`the panel's emoji row is not inside the safe area, below the button ${JSON.stringify(row)}`);
+      const placed = row.dock && size.width > size.height ? !!row.strip && row.left >= row.sheet.left && row.right <= row.sheet.right && row.top >= row.sheet.top && row.bottom <= row.sheet.bottom && !hit(row, m.menu) && !hit(row, row.strip) : row.top >= m.chat.bottom;
+      if (row.left < safe.left || row.right > safe.right || row.top < safe.top || !placed || row.bottom > safe.bottom) bad(`the panel's emoji row is not safely placed inside its sheet, clear of the dock menu and seats ${JSON.stringify(row)}`);
       await t.page.getByRole("button", { name: "Minimize chat" }).click();
       await t.page.getByRole("button", { name: /^Open chat/ }).waitFor();
       if (checkBanner && size.width === 390) {
@@ -1311,13 +1316,14 @@ try {
       }
     }
     await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 0, bottom: 0, left: 0 } });
+    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: wasTouch, maxTouchPoints: 1 });
   };
   const ownTab = await tabForTurn(true);
   const otherTab = await tabForTurn(false);
   const originalViewports = new Map([ownTab, otherTab].map((t) => [t, t.page.viewportSize()]));
   await phoneLayout(ownTab, true, true);
   await phoneLayout(otherTab, false);
-  check(dockFailures.length === 0, `chat dock: top-row buttons at 390x844, 360x640 and 844x390, own and another seat's turn${dockFailures.length ? `\n${dockFailures.join("\n")}` : ""}`);
+  check(dockFailures.length === 0, `chat dock: fixed phone controls at 390x844, 360x640 and 844x390, own and another seat's turn${dockFailures.length ? `\n${dockFailures.join("\n")}` : ""}`);
   for (const [t, viewport] of originalViewports) {
     if (viewport) await t.page.setViewportSize(viewport);
   }
@@ -1490,8 +1496,15 @@ try {
     // #899: at every size and on both tabs the sheet starts below the seat strip and the 56 px bubble band under it (16 px gap, 40 px bubble).
     for (const tab of ["Sounds & stickers", "Chat"]) {
       await showTab(phone, tab);
-      const g = await phone.page.evaluate(() => ({ sheet: document.querySelector('[data-testid="chat-sheet"]').getBoundingClientRect().top, strip: document.querySelector('[data-testid="seat-strip"]').getBoundingClientRect().bottom }));
-      check(g.sheet >= g.strip + 56, `phone game ${w}x${h} ${tab} tab: the sheet (top ${Math.round(g.sheet)}) leaves the seat strip (bottom ${Math.round(g.strip)}) and its bubble band clear`);
+      const g = await phone.page.evaluate(() => {
+        const sheet = document.querySelector('[data-testid="chat-sheet"]').getBoundingClientRect();
+        const strip = document.querySelector('[data-testid="seat-strip"]').getBoundingClientRect();
+        const band = { left: strip.left, right: strip.right, top: strip.top, bottom: strip.bottom + 56 };
+        const overlap = sheet.left < band.right && band.left < sheet.right && sheet.top < band.bottom && band.top < sheet.bottom;
+        const points = [...document.querySelectorAll('[data-testid="seat-vp"]')].filter((el) => el.getClientRects().length);
+        return { sheet: sheet.top, strip: strip.bottom, clear: !overlap, inside: sheet.left >= 0 && sheet.top >= 0 && sheet.right <= innerWidth && sheet.bottom <= innerHeight, seats: points.length, expected: window.__emberisle.getState().state.players.length, uncovered: points.every((el) => { const b = el.getBoundingClientRect(); const hit = document.elementsFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2).find((e) => e.getAttribute("data-testid") !== "chat-backdrop"); return b.width > 0 && b.height > 0 && !!hit && el.contains(hit); }) };
+      });
+      check(w > h ? g.clear && g.inside && g.seats === g.expected && g.uncovered : g.sheet >= g.strip + 56, `phone game ${w}x${h} ${tab} tab: the sheet leaves the seat strip and its bubble band clear ${JSON.stringify(g)}`);
     }
     check((await phone.page.getByRole("button", { name: "Minimize chat" }).textContent()).trim() === "Close", `phone game ${v.size}: the sheet has a labelled Close`);
   }
diff --git a/scripts/first-game-coach-prove.mjs b/scripts/first-game-coach-prove.mjs
index 7ae7db9c..7afd61c3 100644
--- a/scripts/first-game-coach-prove.mjs
+++ b/scripts/first-game-coach-prove.mjs
@@ -140,7 +140,7 @@ try {
   for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
     await page.setViewportSize(viewport);
     await page.waitForTimeout(500);
-    const headerControls = await page.evaluate(() => [...document.querySelectorAll('header [data-menu-trigger], header [aria-label="Table menu"], [data-coach-skip-slot] button')].map((el) => {
+    const headerControls = await page.evaluate(() => [...document.querySelectorAll('header [data-menu-trigger], [data-slot="menu"] [aria-label="Table menu"], [data-coach-skip-slot] button')].map((el) => {
       const r = el.getBoundingClientRect(); return { name: el.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height };
     }));
     assert.equal(headerControls.length, 6, "four seats, Skip and menu stay available");
@@ -158,9 +158,10 @@ try {
   }
   // Start from the adjacent menu control, independent of focus left by the roll-off or viewport change.
   await page.getByRole("button", { name: "Table menu", exact: true }).focus();
-  await page.keyboard.press("Shift+Tab");
+  const walk = async (key) => { const seen = []; for (let i = 0; i < 11; i++) { await page.keyboard.press(key); seen.push(await page.evaluate(() => { const a = document.activeElement; return a.closest("[data-coach-skip-slot]") ? "Skip" : a.getAttribute("aria-label") === "Table menu" ? "Menu" : a.closest('[data-testid="dock"]') ? "dock" : `outside: ${a.tagName} ${a.getAttribute("aria-label") ?? a.textContent.trim().slice(0, 24)}`; })); } return seen; };
+  assert.deepEqual(await walk("Shift+Tab"), [...Array(10).fill("dock"), "Skip"], "keyboard Shift+Tab reaches Skip from the menu through the dock's ten controls (five goods, four builds, Fortunes) and nothing else");
   assert.ok(await page.getByRole("button", { name: "Skip tips" }).evaluate((el) => el === document.activeElement), "keyboard Shift+Tab reaches Skip from the menu");
-  await page.keyboard.press("Tab");
+  assert.deepEqual(await walk("Tab"), [...Array(10).fill("dock"), "Menu"], "keyboard Tab continues from Skip through the dock to the menu");
   assert.ok(await page.getByRole("button", { name: "Table menu", exact: true }).evaluate((el) => el === document.activeElement), "keyboard Tab continues from Skip to the menu");
   mkdirSync("test-results", { recursive: true });
   await page.screenshot({ path: "test-results/first-game-coach-setup-390.png" });
diff --git a/scripts/fortune-count-prove.mjs b/scripts/fortune-count-prove.mjs
index f47d9f48..da918cac 100644
--- a/scripts/fortune-count-prove.mjs
+++ b/scripts/fortune-count-prove.mjs
@@ -55,12 +55,14 @@ try{
    // #776: the public chip beside the log line shows the count on every seat and the watcher, with any hand and on or off turn.
    const chip=n=>page.waitForFunction(n=>document.querySelector('[data-testid="deck-count"]')?.textContent===`Deck ${n}`,n);
    await load(history[0][i],i);const opener=page.getByTestId('fortunes-button');await chip(25);
-   // My fortunes shows exactly when this seat holds a fortune (never to the watcher); buyers keep what they drew, so it is compared with the hand.
+    // The phone's fixed Fortunes slot is disabled when empty; watchers keep the slot without any held count.
    const heldMatchesOpener=async()=>{const held=await page.evaluate(()=>{const g=window.__emberisle.getState();if(g.spectator)return 0;const me=g.state.players.find(p=>p.id===g.localId);return Object.values(me.hidden).reduce((n,c)=>n+c,0);});
-    await page.waitForFunction(h=>document.querySelectorAll('[data-testid="fortunes-button"]').length===(h>0?1:0),held);};
-   if(i!==1){assert.equal(await opener.count(),0);
-    for(let bought=1;bought<=25;bought++){await load(history[bought][i],i);await chip(25-bought);await heldMatchesOpener();}
-    await load(restarted[i],i);await chip(0);await heldMatchesOpener();
+    await page.waitForFunction(h=>{const b=document.querySelectorAll('[data-testid="fortunes-button"]');if(!(matchMedia('(pointer: coarse)').matches||innerWidth<768))return b.length===(h>0?1:0);if(b.length!==1||(b[0].getAttribute('aria-disabled')==='true')!==(h===0))return false;const r=b[0].getBoundingClientRect(),k=[r.x,r.y,r.width,r.height].join();return(window.__fortunesBox??=k)===k;},held);};
+    if(i!==1){const phone=await page.evaluate(()=>matchMedia('(pointer: coarse)').matches||innerWidth<768);assert.equal(await opener.count(),phone?1:0);if(phone)assert.equal(await opener.getAttribute('aria-disabled'),'true');
+     const watcherPrivate=async()=>{if(i===4&&phone){assert.equal(await opener.textContent(),'Fortunes');assert.equal(await opener.getAttribute('aria-label'),'Fortunes');assert.doesNotMatch(`${await opener.textContent()} ${await opener.getAttribute('aria-label')} ${await opener.getAttribute('aria-description')}`,/\d/);}};
+     await watcherPrivate();
+     for(let bought=1;bought<=25;bought++){await load(history[bought][i],i);await chip(25-bought);await heldMatchesOpener();await watcherPrivate();}
+     await load(restarted[i],i);await chip(0);await heldMatchesOpener();await watcherPrivate();
     continue;}
    await opener.waitFor();assert.equal(await opener.getAttribute('data-deck-left'),'25');
    const b=await opener.boundingBox();assert.ok(b.width>=44&&b.height>=44&&b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=height);
diff --git a/scripts/fortune-cue-prove.mjs b/scripts/fortune-cue-prove.mjs
index 0cbde099..3ab74bc2 100644
--- a/scripts/fortune-cue-prove.mjs
+++ b/scripts/fortune-cue-prove.mjs
@@ -125,8 +125,8 @@ try {
         assert.equal(next.starts.length, 1, `${tag}: and it glows`);
       }
       // An empty hand has no button, so no cue.
-      await craft({ hidden: {} });
-      await button.waitFor({ state: "detached", timeout: STEP_MS });
+      const held = await button.boundingBox(); await craft({ hidden: {} });
+      if (v.touch) { await glow.waitFor({ state: "detached", timeout: STEP_MS }); assert.equal(await button.getAttribute("aria-disabled"), "true", `${tag}: an empty hand greys the dock's Fortunes button`); assert.equal(await label(), "Fortunes · 0", `${tag}: and it reads Fortunes · 0`); assert.deepEqual(await button.boundingBox(), held, `${tag}: in the same box`); } else await button.waitFor({ state: "detached", timeout: STEP_MS });
       console.log(`ok ${tag}`);
       await ctx.close();
     }
diff --git a/scripts/fortune-tray-prove.mjs b/scripts/fortune-tray-prove.mjs
index 7233231c..20060279 100644
--- a/scripts/fortune-tray-prove.mjs
+++ b/scripts/fortune-tray-prove.mjs
@@ -326,8 +326,8 @@ try {
     await page.getByTestId("plenty-chip-wool").click();
     await page.getByTestId("fortune-play-plenty").click();
     await closed();
-    assert.equal(await button.count(), 0, `${v.tag}: no My fortunes button with no held fortunes`);
-    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Trade", `${v.tag}: focus falls to Trade`);
+    assert.deepEqual(v.touch ? await button.evaluate((el) => { const box = (e) => { const r = e?.getBoundingClientRect(); return r && [r.x, r.y, r.width, r.height].join(); }; return { n: document.querySelectorAll('[data-testid="fortunes-button"]').length, off: el.getAttribute("aria-disabled"), inSlot: box(el) === box(el.closest('[data-slot="fortunes"]')) }; }) : await button.count(), v.touch ? { n: 1, off: "true", inSlot: true } : 0, `${v.tag}: no held fortunes: no button (desktop); the dock's button greyed, filling its slot (phone)`);
+    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), v.touch ? "Fortunes · 0" : "Trade", `${v.tag}: focus falls to Trade (desktop), stays on the greyed Fortunes (phone)`);
     await craft({ plenty: 1 }, {}, { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 });
     await open();
 
diff --git a/scripts/hand-hidden-prove.mjs b/scripts/hand-hidden-prove.mjs
index b89a2bc8..d6ab3903 100644
--- a/scripts/hand-hidden-prove.mjs
+++ b/scripts/hand-hidden-prove.mjs
@@ -1,4 +1,4 @@
-// #439: the hand bar is not on the table until the seat has held a good this game (or the phase is roll/main). At 1280x720 and
+// #439: the desktop hand bar waits until the seat has goods (or roll/main); #1101 keeps the phone hand fixed from roll-off. At 1280x720 and
 // 390x844 (touch), with and without prefers-reduced-motion, on a hotseat table played through the real roll-off and setup:
 //  - roll-off and every setup step before the second outpost pays: 0 hand tiles, no hand-dock, and the HUD sits lower, so the
 //    hole the HUD leaves (`__isle.liveInsets().bottom`) is bigger by about the hand's height, and the island, fitted to a declared hole (#625), does not move;
@@ -119,19 +119,35 @@ async function run(v, reduced) {
   await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
   await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
   await page.getByTestId("turn-banner").waitFor({ timeout: STEP_MS });
+  const phoneBoxes = () => page.evaluate(() => Object.fromEntries(["hand-dock", "dock", "turn-banner"].map((id) => {
+    const el = document.querySelector(`[data-testid="${id}"]`);
+    const r = el.getBoundingClientRect();
+    return [id, [r.x, r.y, r.width, r.height]];
+  })));
+  const fixed = v.touch ? await phoneBoxes() : null;
+  const phoneHand = async () => {
+    await page.waitForFunction(() => {
+      const g = window.__emberisle.getState(), me = g.state.players.find((p) => p.id === g.state.current);
+      return [...document.querySelectorAll('[data-testid="hand-count"]')].map((e) => e.textContent).join() === ["timber", "clay", "wool", "grain", "ore"].map((k) => String(me.resources[k])).join();
+    }, null, { timeout: STEP_MS });
+    assert.equal(await page.getByTestId("hand-dock").count(), 1, `${tag}: one persistent phone hand`);
+    assert.deepEqual(await phoneBoxes(), fixed, `${tag}: hand, dock and status boxes stay fixed`);
+  };
 
-  // Roll-off: nothing held, nothing shown.
+  // Roll-off: nothing held; the phone keeps its five zero cards, while desktop keeps its hidden hand.
   assert.equal((await game(page)).phase, "rollOff", `${tag}: starts in the roll-off`);
-  assert.equal(await tiles(page), 0, `${tag}: roll-off hand tiles`);
-  assert.equal(await page.getByTestId("hand-dock").count(), 0, `${tag}: roll-off dock`);
+  assert.equal(await tiles(page), v.touch ? 5 : 0, `${tag}: roll-off hand tiles`);
+  assert.equal(await page.getByTestId("hand-dock").count(), v.touch ? 1 : 0, `${tag}: roll-off dock`);
+  if (v.touch) await phoneHand();
   for (let i = 0; i < 40 && (await game(page)).phase === "rollOff"; i++) await act(page, { type: "roll" });
   assert.equal((await game(page)).phase, "setupSettle", `${tag}: roll-off done`);
   await page.waitForTimeout(300);
-  assert.equal(await tiles(page), 0, `${tag}: first setupSettle hand tiles`);
+  assert.equal(await tiles(page), v.touch ? 5 : 0, `${tag}: first setupSettle hand tiles`);
+  if (v.touch) await phoneHand();
   const bare = await bannerBottom(page);
   const isleBare = await island(page);
 
-  // Setup, played through: the hand stays away until a second outpost pays.
+  // Setup, played through: the desktop hand arrives when paid; the phone's existing cards update in place.
   const dockUp = () => !!document.querySelector('[data-testid="hand-dock"]') && !document.querySelector('[data-testid="hand-dock"]').dataset.rising;
   let shown = null;
   for (let guard = 0; guard < 24; guard++) {
@@ -146,7 +162,8 @@ async function run(v, reduced) {
     const spots = rules.legalSettle(st, me, true);
     const paying = (id) => st.vertices.find((x) => x.id === id).hexes.some((h) => st.hexes.find((x) => x.id === h).terrain !== "waste");
     const vertexId = (second && spots.find(paying)) || spots[0];
-    assert.equal(await tiles(page), 0, `${tag}: setup step ${st.setupIndex} hand tiles before the outpost`);
+    assert.equal(await tiles(page), v.touch ? 5 : 0, `${tag}: setup step ${st.setupIndex} hand tiles before the outpost`);
+    if (v.touch) await phoneHand();
     if (second) {
       const mid = await probe(page, () => act(page, { type: "setupSettle", vertexId }), dockUp);
       shown = { mid, me, held: (await game(page)).players.find((p) => p.id === me) };
@@ -158,7 +175,8 @@ async function run(v, reduced) {
   assert.equal(await tiles(page), 5, `${tag}: hand tiles once the second outpost paid`);
   const full = await bannerBottom(page);
   const dockH = await page.getByTestId("hand-dock").evaluate((e) => e.getBoundingClientRect().height);
-  assert.ok(bare - full >= dockH * 0.8 && bare - full <= dockH + 10, `${tag}: the hole shrinks by about the hand (${dockH}): ${bare} -> ${full}`);
+  if (v.touch) { assert.equal(full, bare, `${tag}: the dock never shifts when goods arrive`); await phoneHand(); }
+  else assert.ok(bare - full >= dockH * 0.8 && bare - full <= dockH + 10, `${tag}: the hole shrinks by about the hand (${dockH}): ${bare} -> ${full}`);
   const isleFull = await island(page);
   // #625: the hand overlays the board and the map is fitted to a declared hole, so the hand arriving moves nothing.
   assert.ok(isleBare.bottom === isleFull.bottom && Math.abs(isleBare.min - isleFull.min) <= 1 && Math.abs(isleBare.max - isleFull.max) <= 1, `${tag}: the hole and the island stay put when the hand arrives (${JSON.stringify(isleBare)} -> ${JSON.stringify(isleFull)})`);
@@ -166,7 +184,10 @@ async function run(v, reduced) {
   await page.screenshot({ path: `test-results/hand-hidden-${v.tag}-${reduced ? "rm" : "motion"}-shown.png` });
 
   const m = shown.mid;
-  if (reduced) assert.ok(m === null || m.duration <= 1, `${tag}: reduced motion makes it instant (${JSON.stringify(m)})`);
+  if (v.touch) {
+    assert.equal(m, null, `${tag}: persistent phone hand has no mount animation`);
+    assert.deepEqual(await page.getByTestId("hand-dock").evaluate((el) => ({ opacity: getComputedStyle(el).opacity, animations: el.getAnimations().filter((a) => a.animationName?.startsWith("hand-")).length, height: el.getBoundingClientRect().height })), { opacity: "1", animations: 0, height: dockH }, `${tag}: phone hand stays opaque at its full height`);
+  } else if (reduced) assert.ok(m === null || m.duration <= 1, `${tag}: reduced motion makes it instant (${JSON.stringify(m)})`);
   else {
     assert.ok(m, `${tag}: the hand rises in with an animation`);
     assert.equal(m.name, "hand-in", `${tag}: animation name`);
@@ -189,6 +210,7 @@ async function run(v, reduced) {
   await page.waitForTimeout(400);
   assert.equal(await tiles(page), 5, `${tag}: the hand stays once held, even at 0 goods`);
   assert.equal(await page.locator('[data-testid="hand-count"]').allTextContents().then((t) => t.join("")), "00000", `${tag}: all five cards read 0`);
+  if (v.touch) await phoneHand();
 
   // A hotseat seat that has held nothing takes the turn: its hand is not shown, and the island is fitted to that.
   await page.evaluate(() => {
@@ -199,8 +221,9 @@ async function run(v, reduced) {
     st.seq += 1;
     g.setState({ state: st });
   });
-  await page.waitForFunction(() => !document.querySelector('[data-testid="hand-dock"]'), null, { timeout: STEP_MS });
-  assert.equal(await tiles(page), 0, `${tag}: a seat that never held a good has no hand`);
+  if (v.touch) await phoneHand();
+  else await page.waitForFunction(() => !document.querySelector('[data-testid="hand-dock"]'), null, { timeout: STEP_MS });
+  assert.equal(await tiles(page), v.touch ? 5 : 0, `${tag}: a seat that never held a good keeps only the phone's fixed hand`);
   const isleGone = await island(page);
   assert.ok(isleGone.bottom === isleFull.bottom && Math.abs(isleGone.min - isleFull.min) <= 1 && Math.abs(isleGone.max - isleFull.max) <= 1, `${tag}: the hole and the island stay put when the hand leaves (${JSON.stringify(isleGone)} vs ${JSON.stringify(isleFull)})`);
   await stillFitted(page, tag, "hand left");
@@ -226,8 +249,9 @@ async function run(v, reduced) {
     st.seq += 1;
     g.setState({ state: st });
   });
-  await page.waitForFunction(() => !document.querySelector('[data-testid="hand-dock"]'), null, { timeout: STEP_MS });
-  assert.equal(await tiles(page), 0, `${tag}: a seat that held goods earlier has no hand in a fresh setup with none`);
+  if (v.touch) await phoneHand();
+  else await page.waitForFunction(() => !document.querySelector('[data-testid="hand-dock"]'), null, { timeout: STEP_MS });
+  assert.equal(await tiles(page), v.touch ? 5 : 0, `${tag}: fresh setup preserves only the phone's fixed zero hand`);
 
   // #481 item 7: a +N flash on a tile (pointer-events: none overlays) does not change what the island is fitted to.
   await page.evaluate(() => {
@@ -265,8 +289,8 @@ async function run(v, reduced) {
   assert.equal(dotted, calm.bottom, `${tag}: a pointer-transparent child in each tile leaves the hand measured as the hand (${dotted} vs ${calm.bottom})`);
   await page.evaluate(() => document.querySelectorAll('[data-testid="probe-dot"]').forEach((d) => d.remove()));
   assert.deepEqual(errors, [], `${tag}: console errors`);
-  console.log(`${tag} ${v.width}x${v.height}: 0 tiles through roll-off and setup, 5 once the second outpost paid (held ${JSON.stringify(shown.held.resources)}), banner bottom ${bare} -> ${full}, hole bottom inset ${isleFull.bottom} -> ${isleBare.bottom} without the hand; ` +
-    `${reduced ? "1 ms step" : `220 ms rise, midpoint opacity ${m.opacity.toFixed(2)}, height ${m.h.toFixed(0)}/${dockH}, props ${m.props}`}; island unmoved by a forced re-measure on arrival and on leaving; stays at 0 goods; 0 console errors`);
+  console.log(`${tag} ${v.width}x${v.height}: ${v.touch ? "5 fixed tiles through roll-off, setup and payment" : "0 tiles through roll-off and setup, 5 once the second outpost paid"} (held ${JSON.stringify(shown.held.resources)}), banner bottom ${bare} -> ${full}, hole bottom inset ${isleFull.bottom} -> ${isleBare.bottom}; ` +
+    `${v.touch ? "fixed phone hand, exact boxes and counts, no mount animation" : reduced ? "1 ms step" : `220 ms rise, midpoint opacity ${m.opacity.toFixed(2)}, height ${m.h.toFixed(0)}/${dockH}, props ${m.props}`}; island unmoved by a forced re-measure on arrival and on leaving; stays at 0 goods; 0 console errors`);
   await ctx.close();
 }
 
diff --git a/scripts/hud-safe-area-prove.mjs b/scripts/hud-safe-area-prove.mjs
index 5beb040d..0b85e20b 100644
--- a/scripts/hud-safe-area-prove.mjs
+++ b/scripts/hud-safe-area-prove.mjs
@@ -185,8 +185,8 @@ async function pinned(p, moment, name, mustScroll) {
   const btn = page.getByRole("button", { name, exact: true });
   await btn.waitFor({ timeout: STEP_MS });
   const m = await btn.evaluate((el, insets) => {
-    let sc = el.parentElement;
-    while (sc && getComputedStyle(sc).overflowY !== "auto") sc = sc.parentElement;
+    const sc = el.closest('[data-testid="dock"]');
+    if (!sc) throw new Error(`no dock around ${el.textContent.trim()}`);
     sc.scrollTop = 0;
     const b = el.getBoundingClientRect();
     const top = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
@@ -199,13 +199,13 @@ async function pinned(p, moment, name, mustScroll) {
       tall: b.height >= 44,
     };
   }, insets);
-  if (mustScroll) check(`${tag} ${moment}: the column scrolls (full hand, every fortune)`, m.scrolls);
-  check(`${tag} ${moment}: ${name} is inside the safe area, 44 px tall, uncovered, scrolled to the top`, m.inside && m.topmost && m.inScroller && m.tall, m.box);
+  if (mustScroll) check(`${tag} ${moment}: the dock does not scroll (full hand, every fortune)`, !m.scrolls);
+  check(`${tag} ${moment}: ${name} is inside the safe area, 44 px tall, uncovered, inside the dock`, m.inside && m.topmost && m.inScroller && m.tall, m.box);
   if (!mustScroll) return;
   // Keyboard: Tab through the column from its top; every focused control stays uncovered (the pinned row does not hide it),
   // and the "more below" cue does not sit under that row.
   await page.evaluate(() => {
-    const sc = document.querySelector('[data-testid="turn-banner"]').parentElement;
+    const sc = document.querySelector('[data-testid="dock"]');
     sc.scrollTop = 0;
     sc.querySelector("button").focus();
   });
@@ -213,17 +213,17 @@ async function pinned(p, moment, name, mustScroll) {
   for (let i = 0; i < 30; i++) {
     const f = await page.evaluate(() => {
       const el = document.activeElement;
-      const sc = document.querySelector('[data-testid="turn-banner"]').parentElement;
+      const sc = document.querySelector('[data-testid="dock"]');
       if (!sc.contains(el)) return null;
       const b = el.getBoundingClientRect();
       const top = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
-      const cue = document.querySelector('[data-testid="hud-more-below"]')?.getBoundingClientRect();
-      const end = [...sc.querySelectorAll("button")].find((x) => x.textContent.trim() === "End turn")?.parentElement.getBoundingClientRect();
+      const cue = document.querySelector('[data-testid="hud-more-below"]');
+      const end = [...sc.querySelectorAll("button")].find((x) => x.textContent.trim() === "End turn");
       return {
         name: (el.getAttribute("aria-label") || el.textContent.trim()).slice(0, 24),
         y: [Math.round(b.top), Math.round(b.bottom)],
         uncovered: el.contains(top),
-        cueClear: !cue || !end || Math.abs(cue.bottom - end.top) <= 1,
+        cueClear: !cue && !!end && end.parentElement === sc.querySelector('[data-slot="turn"]'),
       };
     });
     if (!f) break;
@@ -231,8 +231,8 @@ async function pinned(p, moment, name, mustScroll) {
     await page.keyboard.press("Tab");
   }
   const bad = seen.filter((f) => !f.uncovered);
-  check(`${tag} ${moment}: Tab through ${seen.length} column controls, none hidden behind the pinned row`, seen.length > 3 && bad.length === 0, bad.length ? bad : undefined);
-  check(`${tag} ${moment}: the "more below" cue sits above the pinned row`, seen.every((f) => f.cueClear));
+  check(`${tag} ${moment}: Tab through ${seen.length} dock controls, none hidden`, seen.length > 3 && bad.length === 0, bad.length ? bad : undefined);
+  check(`${tag} ${moment}: no "more below" cue, and End turn in its slot, at every focus`, seen.every((f) => f.cueClear));
   // The fortune tray (#423) rises from the column's bottom edge over the pinned row: it covers the bar cleanly, inside the viewport.
   await page.getByRole("button", { name: /^(Play fortune|Fortunes)/ }).click();
   const tray = await page.getByRole("dialog").first().waitFor({ timeout: STEP_MS }).then(() =>
@@ -243,7 +243,7 @@ async function pinned(p, moment, name, mustScroll) {
   ).then(() =>
     page.evaluate((insets) => {
       const t = document.querySelector("#fortune-title").closest('[role="dialog"]').getBoundingClientRect();
-      const sc = document.querySelector('[data-testid="turn-banner"]').parentElement;
+      const sc = document.querySelector('[data-testid="dock"]');
       const end = [...sc.querySelectorAll("button")].find((x) => x.textContent.trim() === "End turn");
       const b = end.parentElement.getBoundingClientRect();
       const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
diff --git a/scripts/reflow-prove.mjs b/scripts/reflow-prove.mjs
index afa76039..be53b530 100644
--- a/scripts/reflow-prove.mjs
+++ b/scripts/reflow-prove.mjs
@@ -158,7 +158,7 @@ try {
       const canvas = r(document.querySelector("canvas"));
       const chrome = portraitStrip ? portraitStrip.bottom : header.bottom;
       // #422: on a sideways phone the stack is a left column, and the island's room is beside it, not above it.
-      const column = stack.width < innerWidth / 2;
+      const column = document.querySelector('[data-testid="dock"]') ? innerWidth > innerHeight : stack.width < innerWidth / 2;
       const gapTop = Math.max(canvas.top, chrome);
       const gapBottom = column ? canvas.bottom : Math.min(canvas.bottom, stack.top);
       const gapLeft = column ? stack.right : canvas.left;
@@ -216,7 +216,7 @@ try {
         };
       });
     const before = await stackState();
-    if (viewport.height <= 568) check(before.overflow, `${tag} hud: stack overflows (End turn below the fold)`, before);
+    if (viewport.height <= 568) check(!before.overflow && !before.cue, `${tag} hud: the dock never overflows and shows no cue (End turn in its fixed slot)`, before);
     if (viewport.height === 720) check(!before.overflow && !before.cue, `${tag} hud: no overflow, no cue`, before);
     if (before.overflow) {
       await page.waitForSelector('[data-testid="hud-more-below"]', { timeout: 2000 });
diff --git a/scripts/size-prove.mjs b/scripts/size-prove.mjs
index ddd65037..af6bc7e3 100644
--- a/scripts/size-prove.mjs
+++ b/scripts/size-prove.mjs
@@ -53,10 +53,13 @@ const CEILINGS = [
   { name: "WayfarerOptions", gzipBytes: 500 },
   // #832: the online-only timer ballot loads separately (2026-10-20; measured 1.20 kB).
   { name: "TurnExtensionVote", gzipBytes: 1400 },
+  // #1101: the phone dock's offer slot (Yes and No) loads separately, prefetched on idle; new chunk only (measured 0.80 kB).
+  { name: "TradeSlot", gzipBytes: 1000 },
 ];
 
 // Growth allowance against the base, in gzip bytes. index is fixed at 400 B; the others take 0.33% of the base size, at least 200 B.
-const ALLOWANCE = { index: 400 };
+// #1101: one-PR growth extra of 480 B beyond 400 B covers measured build-stamp variation (owner cap 900 B, desk approval 2026-10-25); the desk removes it after merge.
+const ALLOWANCE = { index: 400 + 480 };
 const ALLOWANCE_RATE = 0.0033;
 const ALLOWANCE_MIN = 200;
 const allowanceFor = (name, baseBytes) => ALLOWANCE[name] ?? Math.max(ALLOWANCE_MIN, Math.round(baseBytes * ALLOWANCE_RATE));
diff --git a/scripts/table-menu-prove.mjs b/scripts/table-menu-prove.mjs
index c4446dc9..7d176067 100644
--- a/scripts/table-menu-prove.mjs
+++ b/scripts/table-menu-prove.mjs
@@ -65,11 +65,11 @@ try {
       return { wordmark: wordmark.map((el) => el.textContent.trim()), buttons };
     });
     assert.deepEqual(top.wordmark, [], `${v.tag}: nothing on the table says Emberisle`);
-    assert.equal(top.buttons.length, 1, `${v.tag}: one button in the top 64 px: ${JSON.stringify(top.buttons)}`);
-    const [b] = top.buttons;
+    assert.equal(top.buttons.length, v.touch ? 0 : 1, `${v.tag}: ${v.touch ? "no button" : "one button"} in the top 64 px: ${JSON.stringify(top.buttons)}`);
+    const [b] = v.touch ? [await trigger.evaluate((el) => { const r = el.getBoundingClientRect(), s = el.closest('[data-slot="menu"]')?.getBoundingClientRect(); return { name: el.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(innerWidth - r.right), left: Math.round(r.left), bottom: Math.round(innerHeight - r.bottom), portrait: innerHeight > innerWidth, inSlot: !!s && [r.x, r.y, r.width, r.height].join() === [s.x, s.y, s.width, s.height].join() }; })] : top.buttons;
     assert.equal(b.name, "Table menu", `${v.tag}: the one button is the menu`);
     assert.ok(b.w >= 44 && b.h >= 44, `${v.tag}: the menu button is ${b.w}x${b.h}, under 44 px`);
-    assert.ok(b.right < 32 && b.top < 32, `${v.tag}: the menu button sits top-right (${JSON.stringify(b)})`);
+    assert.ok(v.touch ? b.inSlot && b.bottom < 48 && (b.portrait ? b.right < 32 : b.left < 32) : b.right < 32 && b.top < 32, `${v.tag}: the menu button sits ${v.touch ? "in the dock's Menu slot, bottom-right upright and bottom-left sideways" : "top-right"} (${JSON.stringify(b)})`);
 
     // Open: the rows, the turn line, and the focus on the first row. Haptics appears only where the API and pointer guards allow it (#542).
     await trigger.click();
diff --git a/scripts/visual-direction-prove.mjs b/scripts/visual-direction-prove.mjs
index 278c0d98..5d1fded1 100644
--- a/scripts/visual-direction-prove.mjs
+++ b/scripts/visual-direction-prove.mjs
@@ -59,8 +59,9 @@ try {
       if (phase === "main" && width === 844) {
         const dice = await page.evaluate(() => {
           const row = document.querySelector('[data-testid="dice-row"]'), r = row?.getBoundingClientRect();
-          const foot = document.querySelector('.end-footer')?.getBoundingClientRect(), end = [...document.querySelectorAll('.end-footer button')].at(-1)?.getBoundingClientRect();
-          return { clipped: !foot || !end || end.right > foot.right + 0.5 || end.left < foot.left, dice: [...document.querySelectorAll('[data-testid="die"]')].filter(d => d.checkVisibility()).length, sum: row?.lastElementChild?.textContent, inside: !!r && r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
+          const foot = document.querySelector('[data-slot="turn"]')?.getBoundingClientRect(), end = document.querySelector('[data-slot="turn"] button')?.getBoundingClientRect();
+          const status = document.querySelector('[data-slot="status"]')?.getBoundingClientRect();
+          return { clipped: !foot || !end || end.right > foot.right + 0.5 || end.left < foot.left || end.top < foot.top || end.bottom > foot.bottom + 0.5, dice: [...document.querySelectorAll('[data-testid="die"]')].filter(d => d.checkVisibility()).length, sum: row?.lastElementChild?.textContent, inside: !!r && r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!status && r.left >= status.left && r.right <= status.right && r.top >= status.top && r.bottom <= status.bottom };
         });
         assert.deepEqual(dice, { clipped: false, dice: 2, sum: "8", inside: true }, `${width}: two dice and the sum show in your own main phase`);
       }
@@ -91,7 +92,8 @@ try {
         const offer = document.querySelector('[data-testid="trade-toast"]');
         const stack = document.querySelector('[data-hud-stack]').getBoundingClientRect();
         const b = offer?.getBoundingClientRect();
-        return { scale, hole, out, covered, clippedCosts, offer: b ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right, insideStack: b.top >= stack.top && b.bottom <= stack.bottom + 0.5, modal: offer.getAttribute('aria-modal') } : null };
+        const slot = document.querySelector('[data-slot="status"]')?.getBoundingClientRect();
+        return { scale, hole, out, covered, clippedCosts, offer: b ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right, inSlot: !!slot && ["x", "y", "width", "height"].every(k => Math.abs(b[k] - slot[k]) <= 0.5), insideStack: b.top >= stack.top && b.bottom <= stack.bottom + 0.5, modal: offer.getAttribute('aria-modal') } : null };
       }, holeFor);
       if (phase === "main") { mainFit = fitNow; mainHole = geometry.hole; }
       else assert.equal(fitNow, mainFit, `${width}: the offer opening leaves the fit where it was`);
@@ -107,6 +109,7 @@ try {
       if (geometry.offer) {
         assert.equal(geometry.offer.modal, null);
         assert.ok(geometry.offer.insideStack && geometry.offer.bottom <= height - 12 + 0.5, `${width}: offer in visible bottom stack`);
+        if (phone) assert.equal(geometry.offer.inSlot, true, `${width}: the offer fills the exact fixed status slot`);
       }
       metrics.push({ width, height, reduced, phase, ...geometry });
     }
```
