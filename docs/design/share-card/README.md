# Design: Share-Your-Game Card (#1454)

- date: 2026-11-13
- status: design stage only
- lane: hud (tier 1)
- issue: [#1454](https://github.com/jarrodjohnson-gif/emberisle/issues/1454)
- dependencies: #1450, #1452, DECISIONS 2026-10-27

## 1. Overview
The owner approved building the top three fun features from #1450 on 2026-11-08.
This issue represents item three: the share-your-game card.
It allows players to export and share a visual summary of their finished game.
Players can share cards directly to Instagram, Threads, and messaging apps.
The card combines the final board render, standings, and island awards from #1452.

## 2. Results Screen UI and Button Placement
A Share button appears on the results screen when the game finishes.
It integrates into existing results surfaces without adding permanent chrome.

### Button Locations
1. **Primary Results Sheet:**
   The button sits in the `.win-actions` button row in `WinScreen.tsx`.
   It sits between `React` and `Hide scores`.
   It uses `variant="secondary"` with a 44 px minimum touch height.
   The label displays "Share".

2. **Hidden Results Chip:**
   When scores are hidden, the chip includes a compact "Share" action.
   It sits alongside `Show scores`, `Play again`, and `Menu`.
   Keyboard navigation reaches both buttons using Tab.

### User Interaction Flow
1. The player finishes a game and reaches the victory screen.
2. The player taps the Share button.
3. The app dynamically imports the lazy card generator chunk.
4. The generator composes the final board snapshot, standings, and awards.
5. Supported devices open the native operating system share sheet.
6. Other browsers trigger a direct PNG image download.

## 3. Native Share and Fallback Strategy
Sharing uses modern browser APIs with graceful degradation.

### Web Share API Level 2
- The app checks `navigator.canShare({ files: [imageFile] })`.
- On iOS Safari and Android Chrome, `navigator.share()` opens the native share sheet.
- Users can post directly to Instagram Stories, Threads, Messages, or AirDrop.
- The payload includes the image file, game title, and public join link.

### Download Fallback
- Desktop browsers and unsupported clients receive a fallback download.
- The generator creates an object URL from the image blob.
- An anchor tag triggers a download with filename `emberisle-game-<code/date>.png`.
- Tapping Share on desktop immediately saves the graphic to disk.

## 4. Card Formats and Dimensions
The card renders at high resolution for modern social networks.
Two standard aspect ratios are defined:

### Format A: Portrait Feed (1080 × 1350 px, 4:5 Ratio)
- Tailored for Instagram and Threads feed posts.
- **Top Bar (160 px):** Emberisle header, room code, date, and turn count.
- **Board Snapshot (650 px):** Centered perspective capture of the final 3D island.
- **Standings Box (380 px):** Four player rows with colors, scores, and winner highlight.
- **Awards Line (80 px):** Earned island award badges from #1452.
- **Footer (80 px):** Clean watermark and public web link.

### Format B: Vertical Story (1080 × 1920 px, 9:16 Ratio)
- Tailored for Instagram Stories, TikTok, and phone wallpapers.
- **Top Header (280 px):** Large title, room date, and game outcome badge.
- **Island Centerpiece (840 px):** Immersive, detailed view of the finished board.
- **Standings Table (520 px):** Full scoreboard with player breakdown and badges.
- **Awards Section (160 px):** Standout award titles for each participant.
- **Bottom Callout (120 px):** Emberisle domain and invitation link.

## 5. Privacy and Security Invariants
Sharing must protect player privacy and host secrets:
- **No Seat Secrets:**
  Cards and links never carry seat secrets, reconnect tokens, or auth cookies.
- **Public URL Only:**
  The card includes the public game join link or table code only.
- **Post-Game Reveal Only:**
  The Share button generates cards strictly after `phase === "over"`.
- **No Mid-Game Leaks:**
  Cards never reveal active hands, unplayed fortunes, or private player notes.

## 6. Performance and Chunk Budget
Generating share cards must not penalize core game performance:
- **Zero Impact on IslandCanvas:**
  The card generator must not increase `IslandCanvas` bundle size.
- **Lazy Loading on Tap:**
  Code loads strictly when the user taps Share via `import("@/components/game/ShareCard")`.
- **Canvas Rendering:**
  The card renders via an offscreen canvas using WebGL `toBlob()`.
- **Estimated Size:**
  The generator chunk is estimated at 1.2 kB to 1.5 kB gzip.
- **Desk Ceiling:**
  The desk will establish an explicit chunk ceiling upon implementation.

## 7. Implementation Plan
Implementation will proceed across four bounded steps:
1. **Mock and Review:**
   Verify card layout and button spacing with the project owner.
2. **Lazy Chunk Creation:**
   Create `src/components/game/ShareCard.tsx` and image composition logic.
3. **WinScreen Integration:**
   Add Share button to `WinScreen.tsx` with lazy loading on click.
4. **Automated Verification:**
   Add `scripts/share-card-prove.mjs` verifying share invocations, fallbacks, and security invariants.
