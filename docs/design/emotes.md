# Emoji and emote wrap-up (issue #654)

This note closes out the reaction work from #117, #118 and #119. #467 shipped the quick reactions.
It audits, as of `main` 1cd9a19, the union of `main` and PR #635 (`hud/lobby-names-chat`, 7b955f1). #635 is open and unmerged, so the clip list must be re-checked once it lands.
Anything marked **[#635]** exists only on that branch. Sizes are read from the Tailwind classes; they were not
measured in a browser. Tailwind `size-11` is 44 px, `size-8` is 32 px and `size-12` is 48 px. `text-xs` is 12 px,
`text-sm` is 14 px, `text-2xl` is 24 px and `text-4xl` is 36 px.

## 1. Audit: what ships today

### The three kinds

| Kind | Source of truth | What the host accepts | Kept in history? |
|---|---|---|---|
| **Emoji reactions** | `QUICK_REACTIONS` in `src/components/game/emotes.ts`: 😠 😊 👏 😂 🔥 🐑 | The same six, hard-coded again in `talk()` in `server/host.mjs` (there is a comment saying to keep the two in sync) | No. Each float lasts 2 s |
| **Image emotes** | Every `*.png` / `*.webp` file in `src/assets/emotes/`, read by `import.meta.glob` (client) and `loadEmotes` (host) | Any id found in that folder | No |
| **Soundboard** **[#635]** | `SOUNDBOARD` in `src/lib/sound.ts`, and again in `server/chat.mjs` | 10 ids: `robbed_fah` (Fah), `sb_wololo` (Wololo), `sb_win_reaction` (GG!), `sb_airhorn` (Airhorn), `sb_quit_touchin` (Quit touchin' me), `sb_only_wood` (Only wood?), `sb_perfect` (Perfect), `bong`, `plop`, `pluck` | Yes. It is a chat line, `🔊 Label`, so it counts toward the room's 30 lines |

The `public/` folder holds no emote art. `public/audio/` holds the sounds, and **[#635]** adds the six `.mp3` clips
the soundboard uses (plus the music stings). There is exactly **one image emote**: `src/assets/emotes/ben-10.webp`,
128×128 RGBA, 6.8 KB.

### Where each one appears

| Surface | Emoji | Image emotes | Soundboard | Notes |
|---|---|---|---|---|
| **Quick-react button** (`QuickReactions` in `Reactions.tsx`, top row next to Open chat) | Yes, row 1, keys 1–6 | Yes, row 2 | No | Online, during play, seated players only. It is **not** shown in the lobby. It has a 1 s client cooldown that dims the buttons |
| **Chat emote tray** (Smile button in `ChatBox`, game dock and lobby box) | **No** | Yes | No | It has no client cooldown, so tapping fast draws the host's "Slow down." |
| **Chat soundboard row** **[#635]** (speaker button beside the Smile) | No | No | Yes, all 9 | Buttons rest for 3 s, matching the host's `SOUND_MS` |
| **Player menu** (`PlayerMenu.tsx`, tap a rail card) | **No** | Yes, aimed with `to` | No | This is the only way to send an aimed ("→ Tide") reaction |
| **Win screen** | No | No | **[#635]** one "React" button that plays `sb_win_reaction` (GG!) | On `main` the win screen has no reaction control. The quick-react button is still mounted under the win screen's z-20 backdrop. Whether it can be reached there was not checked |
| **Floats** (`ReactionFloats`) | Yes | Yes | No (shown as a chat chip) | They show over the sender's rail card in the game (`SeatRail`) and over their seat row in the lobby. Repeats coalesce into a ×N badge. Only the newest group per seat is shown. Under reduced motion they fade without rising |

Muting a seat (chat Mute menu) hides that seat's floats and chat lines. **[#635]** It also silences their soundboard taps.
Watchers can't send any of the three.

### Limits (already on the host)

- Chat, reactions and soundboard taps share one token bucket per seat in `server/chat.mjs` `allow`: a burst of 5, refilled at 1 per second.
- **[#635]** Soundboard taps are also limited to one per seat every `SOUND_MS` (3000 ms by default).
- A chat line is at most 200 code points. The host keeps 30 lines and the client keeps 50.
- Reactions are never stored, so a reaction spam leaves nothing behind once it stops.

### Problems found

1. **Missing art.** There is one image emote, so the "Image reactions" row, the chat tray and the player menu each show a single button. #120 ("Add Jarrod's emoji images") is still open.
2. **The one emote may be someone else's character.** `ben-10` is named after a commercial character. Jarrod accepts the risk (Decision 6), and it stays (Decision 2).
3. **Soundboard clips and README's CC0 rule** **[#635]**. README says: "Do not rip sounds from commercial games. Use CC0 only." `sb_wololo` comes from a commercial game, and some other clips have no recorded source. Under Decision 6, owner-approved clips may ship. README's rule and its "CC0 Kenney sounds" row for `public/audio/` should be reworded to say that.
4. **Duplicated pickers.** Image emotes appear in three places: the quick picker, the chat tray and the player menu. Emoji appear in only one of them. The chat tray is a weaker copy of the quick picker, which sits right beside the Open chat button.
5. **The lobby can't send emoji.** The quick-react button hides outside `screen === "play"`, so in the lobby the chat tray, with images only, is all there is.
6. **Aimed reactions are image-only.** The player menu has no emoji row, although the host accepts `to` with any allow-listed emote.
7. **The soundboard duplicates board sounds** **[#635]**. `bong`, `plop` and `pluck` are the board's own cues (`plop` is the sea tap). A soundboard plop sounds like something happened on the board.
8. **"React" on the win screen plays a sound** **[#635]**. Everywhere else, "react" means an emote. The button says React but plays the GG! clip.
9. **Soundboard taps fill the chat log** **[#635]**. Each tap is a stored chat line, so 30 taps push all real chat out of a late joiner's history.
10. **Two hand-kept copies.** The emoji list lives in `emotes.ts` and in `talk()`. The soundboard list lives in `sound.ts` and in `chat.mjs`. `chat-prove` and `sounds-prove` catch a drift, but one shared list would remove the risk.
11. **Small text at 440×956.** The 44 px touch targets are fine everywhere, and the 6-column picker is about 300 px wide, so it fits. These are small, though:
    - the soundboard chips are 12 px text with a 12 px speaker icon **[#635]**, while #635 itself moved chat lines up to 14 px;
    - the ×N count badge and the "→ Tide" target tag use `text-caption`;
    - image emotes are 32 px in pickers next to 24 px emoji glyphs. That is fine, but a 128 px source shown at 32 px needs bold, simple art.

## 2. Final set (follows Jarrod's Decisions, 2026-10-16)

This section follows the Decisions at the end of this note. Where an earlier draft said otherwise, the Decisions win.

**One tray holds every reaction.** The quick-react button is the single place to send emoji, stickers and soundboard
clips. It works in the game and in the lobby. Emoji and stickers stay silent apart from the local click. Soundboard
clips are the only reactions that play a sound for the table (Decision 3).

### Emoji: unchanged (Decision 1)

- Keep today's six (😠 😊 👏 😂 🔥 🐑, keys 1–6) until Jarrod sends his list.
- When the list comes, it replaces `QUICK_REACTIONS`. The host's copy in `talk()` should import the same list rather
  than keep a second copy.
- The audit's gaps (robbed, good trade, long-road steal) are input for Jarrod's pick, not a change to make now.

### Stickers: a drop-a-PNG pipeline (Decision 2)

- **`ben-10` stays.**
- Jarrod supplies the art. Dropping a file into `src/assets/emotes/` adds a sticker. The folder already works this way:
  the client's `import.meta.glob` and the host's `loadEmotes` both read it. The work left is to make the pipeline
  safe and phone-sized.
- **File format:**
  - PNG with transparency is the main format.
  - WebP is accepted as well. The build already handles it: Vite serves `ben-10.webp` as a plain asset URL, and both
    the glob and `loadEmotes` match `.png` and `.webp`.
  - The name must be lowercase `a-z`, `0-9` and `-`, and the file name is the sticker id.
- **Size limits:**
  - 128×128 px source, square. The largest allowed is 256×256.
  - At most **50 KB** per file.
  - At most **24 stickers**, which fills 4 rows of 6 in the tray.
  - These caps belong in a check in `chat-prove`, or a small `sticker-prove`, so a bad drop fails CI rather than
    the page.
  - Vite inlines files under 4 KB into the JS chunk (the default `assetsInlineLimit`). This only matters if
    `size-prove`'s budget gets tight.
- **Display:** 32 px inside the tray, as today. 48 px when floating over a seat. On a 440 px wide phone, 6 per row
  is about 300 px, which fits. Art must stay readable at 32 px.

### Soundboard: no cuts (Decision 6) [#635]

- All 9 clips on #635 stay, because Jarrod approves them and accepts the risk:
  - Fah;
  - Wololo;
  - GG!;
  - Airhorn;
  - Quit touchin' me;
  - Only wood?;
  - Bong;
  - Plop;
  - Pluck.
- The host's limits are unchanged:
  - the chat bucket;
  - `SOUND_MS`, 3 s.
- Change the soundboard chips from 12 px to 14 px (`text-sm`) to match the chat lines, which #635 already moved to 14 px.

### Where things live (Decision 4)

| Surface | Final |
|---|---|
| Quick-react button, top row beside Open chat | **The one tray.** Row 1 holds the emoji (keys 1–6). Next come the stickers, which scroll. Last is the soundboard row, whose buttons rest for 3 s. It shows during play and in the lobby, for seated players only |
| Chat box | Presets and the input. **Remove the Smile emote tray and the separate soundboard toggle** |
| Player menu | It stays as the aimed version (`to`), with the same emoji and stickers. Sounds can't be aimed |
| Win screen | "React" becomes **"GG! 🔊"** (Decision 5). It still plays `sb_win_reaction` |

### Pacing and spam

- Keep the host limits as they are: a burst of 5, refilled at 1 per second and shared with chat, plus `SOUND_MS`.
- In the one tray:
  - Emoji and sticker buttons dim for the 1 s cooldown they have today.
  - Soundboard buttons dim for 3 s.
  - The player menu gets the same 1 s cooldown, which it does not have today.
- Repeats coalesce into a ×N badge, as today.
- Optional host follow-up: keep soundboard lines out of the 30 stored chat lines, so taps don't push real chat out of a late joiner's history.

### Follow-up work (not filed yet; one S implementation issue, after #635 merges)

1. **Merge the trays.** Move the soundboard row into `QuickReactions`, remove the chat's Smile tray and soundboard
   toggle, and mount the button in the lobby.
2. **Player menu.** Add the emoji row and the 1 s cooldown.
3. **Sticker checks.** Add the size, weight and count checks in a prove script. Keep PNG and WebP.
4. **Labels and text size.** Relabel the win button "GG! 🔊", and move the soundboard chips to 14 px.
5. **Shared emoji list.** Have the host import the client's list, ready for Jarrod's pick.

Jarrod's emoji list and his sticker art (#120) are his to supply.

## 3. Questions for Jarrod: answered

Jarrod answered these on 2026-10-16. His answers are in **Decisions** below, and section 2 follows them. The recommendations are kept as asked.

| Q | Answer |
|---|---|
| 1 | No. `ben-10` stays, and Jarrod will send PNG stickers (Decision 2) |
| 2 | No change for now. Jarrod picks the emoji (Decision 1) |
| 3 | Yes, as recommended: emotes stay silent (Decision 3) |
| 4 | One tray for all reactions, the soundboard included, in game and lobby (Decision 4) |
| 5 | No cuts. The owner-approved clips stay (Decision 6) |
| 6 | Yes, "GG! 🔊" (Decision 5) |

The questions as asked:

1. **Image emotes: drop `ben-10` and send about 6 of your own 128×128 WebP (robbed, good trade, road stolen, gg, thinking, wood-for-sheep)?** Recommended: yes, drop it and send your own.
2. **Emoji set: swap 😊 for 🤝 and add 😱 and 😭, for 8 total (keys 1–8)?** Recommended: yes.
3. **Do emotes get sounds?** Recommended: no. The soundboard is the only sound; emotes stay silent.
4. **Where does the tray live: only the one quick-react button by Open chat, also in the lobby, with the chat's emote tray removed?** Recommended: yes.
5. **Soundboard: cut Bong, Plop, Pluck and Wololo, and keep the airhorn and "Quit touchin' me" only if you can name a CC0 or self-made source?** Recommended: yes.
6. **Win screen: relabel "React" as "GG! 🔊"?** Recommended: yes.

## Decisions (Jarrod, 2026-10-16)

These answer section 3 and override any recommendation above that disagrees.

1. **Emoji set:** **Jarrod picks the emoji.** No change until he sends his list.
2. **Image emotes:** Jarrod wants **custom PNG stickers**. Build a simple pipeline: drop a PNG in a folder and it becomes a sticker, sized for phones. He'll supply the art. Keep `ben-10` for now.
3. **Emotes and sound:** emotes stay silent. The soundboard is the only thing that plays sounds.
4. **One place for reactions:** all reactions (emoji, stickers, soundboard) sit in one quick-react tray, in-game and in the lobby. The separate emote tray inside chat goes.
5. **Win screen:** "React" becomes **"GG! 🔊"**.
6. **Licensing:** owner-approved art and clips may ship publicly; Jarrod accepts the risk.
