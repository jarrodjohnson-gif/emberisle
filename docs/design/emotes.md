# Emoji and emote wrap-up (issue #654)

This note closes out the reaction work from #117, #118 and #119. #467 shipped the quick reactions.
It audits the union of `main` (1cd9a19) and PR #635 (`hud/lobby-names-chat`, 7b955f1, about to merge).
Anything marked **[#635]** exists only on that branch. Sizes are read from the Tailwind classes; they were not
measured in a browser. Tailwind `size-11` is 44 px, `size-8` is 32 px and `size-12` is 48 px. `text-xs` is 12 px,
`text-sm` is 14 px, `text-2xl` is 24 px and `text-4xl` is 36 px.

## 1. Audit: what ships today

### The three kinds

| Kind | Source of truth | What the host accepts | Kept in history? |
|---|---|---|---|
| **Emoji reactions** | `QUICK_REACTIONS` in `src/components/game/emotes.ts`: 😠 😊 👏 😂 🔥 🐑 | The same six, hard-coded again in `talk()` in `server/host.mjs` (there is a comment saying to keep the two in sync) | No. Each float lasts 2 s |
| **Image emotes** | Every `*.png` / `*.webp` file in `src/assets/emotes/`, read by `import.meta.glob` (client) and `loadEmotes` (host) | Any id found in that folder | No |
| **Soundboard** **[#635]** | `SOUNDBOARD` in `src/lib/sound.ts`, and again in `server/chat.mjs` | 9 ids: `robbed_fah` (Fah), `sb_wololo` (Wololo), `sb_win_reaction` (GG!), `sb_airhorn` (Airhorn), `sb_quit_touchin` (Quit touchin' me), `sb_only_wood` (Only wood?), `bong`, `plop`, `pluck` | Yes. It is a chat line, `🔊 Label`, so it counts toward the room's 30 lines |

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
2. **The one emote is someone else's character.** `ben-10` is named after Cartoon Network's Ben 10. This is the same risk README's "Do not" list guards against for sounds.
3. **Soundboard clips break the README rule** **[#635]**. README says: "Do not rip sounds from commercial games. Use CC0 only." `sb_wololo` is Age of Empires' Wololo. The airhorn and "Quit touchin' me" are meme clips with no recorded source. The README table says `public/audio/` holds "CC0 Kenney sounds", which is no longer true.
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

## 2. Proposed final set

**One picker and one sound channel.** The quick-react button is the only emote picker for unaimed reactions. The
player menu is the aimed version of the same set. The soundboard is the only thing that makes a sound. Emotes stay
silent except for the local click.

### Emoji (8, keys 1–8, a 4×2 grid, about 210 px wide)

| Keep | Add | Cut |
|---|---|---|
| 😂 laugh, 👏 clap / nice, 🔥 hot streak, 😠 angry, 🐑 sheep (the table joke) | 😱 robbed / long-road steal, 🤝 good trade, 😭 bad roll | 😊 happy (👏 covers it) |

The one list should live in a shared module that `talk()` imports, instead of a second copy.

### Image emotes (Jarrod's art)

- Cut `ben-10`.
- Add up to 6 of Jarrod's own, as 128×128 transparent WebP in `src/assets/emotes/`, `kebab-case` names. Suggested
  themes, one for each missing moment: `robbed`, `good-trade`, `road-stolen`, `gg`, `thinking`, `wood-for-sheep`.
  Nothing else needs code: the folder is read by both the client and the host.

### Soundboard [#635]

- Keep: Fah, GG!, Only wood?, and any clip whose source is CC0 or Jarrod's own recording.
- Cut: `bong`, `plop`, `pluck` (board cues), and `sb_wololo` (commercial game). Cut the airhorn and "Quit touchin' me"
  unless their source can be written down as CC0 or self-made.
- Record each clip's source in `docs/design/sound.md`, and fix README's "CC0 Kenney sounds" row.

### Where things live

| Surface | Final |
|---|---|
| Top row, beside Open chat | Quick-react button, during play **and in the lobby** |
| Chat box | Presets, input, soundboard toggle. **Remove the Smile emote tray** |
| Player menu | The same emoji + image set, aimed with `to` |
| Win screen | Keep the button, but label it "GG! 🔊" so it reads as a sound |

### Pacing and spam

The host limits are enough as they are: the shared 5-burst/1-per-second bucket, plus `SOUND_MS` 3 s for sounds.
The client changes are:

- every picker dims for the 1 s cooldown, including the player menu, which today has none;
- coalescing (×N) stays;
- soundboard lines should not count toward the 30 stored lines, or should be dropped from the history sent in `welcome`. That host choice belongs to the implementation issue.

### Follow-up work (not filed yet; one S implementation issue)

1. Shared emoji list.
2. Eight emoji.
3. Quick-react button in the lobby.
4. Remove the chat emote tray.
5. Emoji row in the player menu.
6. Cooldown in the player menu.
7. Soundboard cuts and label.
8. 14 px soundboard chips.
9. Keep soundboard lines out of the history.

Art drop (#120) is Jarrod's.

## 3. Questions for Jarrod

Each has a recommended answer first.

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
