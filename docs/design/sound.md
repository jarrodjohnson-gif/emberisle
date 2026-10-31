# Sound design: a sound for every game moment (#653)

Earlier sound work: #303, #609, #616, and #635 (branch `hud/lobby-names-chat`, unmerged). This page covers the union of
`main` and #635. Rows marked **#635** exist only on that branch. The design calls for no code change here; the child issues get
filed from the Decisions at the end, which settle section 4.

Short names used below: `store.ts` = `src/lib/game/store.ts`, `sound.ts` = `src/lib/sound.ts`, `rules.ts` = `src/lib/game/rules.ts`,
`renderer` = `src/lib/scene/isle-renderer.ts`. A plain line number is on `main` (at 4559195). A ref of the form `635:N` is a line on
#635, given either where #635 moves the line or where the line exists only there. A clip is a `sound.ts` `FILES` name, and
the file it plays is in `public/audio/`.

## 1. Audit

| Moment | Trigger (file:line) | Clip | Who hears it | Status | Note |
|---|---|---|---|---|---|
| Roll (dice land) | `store.ts:42` (635:43) | `dice_land` → `drop_001.wav` | everyone | has | Plays when the result lands. On #635 it also cuts off `game_start` (`sound.ts` 635:141). |
| Roll starts (shake) | `rules.ts:545` (`roll`) | none | everyone | missing | Bible §7 lists `dice_shake.wav`. Not added: Decision 5 allows only two new cues. |
| Payout, you gain goods | `rules.ts:545` and `src/components/game/GainFloats.tsx:1` | none | the seat that gains | missing | The `chip_gain` name (`sound.ts:20`) is spent on the your-turn chime. Not added (Decision 5). |
| Payout, others gain | `rules.ts:545` | none | others | missing | Not added (Decision 5). |
| Build path | `store.ts:45` (635:46) | `path_place` → `drop_002.wav` | everyone | has | Delayed to the landing (`LAND_MS`, `store.ts:67`). |
| Build outpost | `store.ts:44` (635:45) | `outpost_place` → `drop_003.wav` | everyone | has | Delayed to the landing. |
| Build stronghold | `store.ts:43` (635:44) | `stronghold_place` → `bong_001.wav` | everyone | has | #635 reuses the same file as the soundboard's "Bong" (`sound.ts` 635:43). |
| Buy fortune | `store.ts:46` (635:47) | `card_buy` → `open_001.wav` | everyone; others at 0.6 | has | |
| Play fortune (any kind) | `store.ts:47` (635:48) | `card_play` → `scratch_001.wav` | everyone | has | The same clip for all five kinds. |
| Trade offered | `store.ts:915`, `:1050` (635:1036, :1177) | `trade_offer` → `trade_offer.wav` (synth) | everyone but the asker | has | |
| Trade accepted | `store.ts:900` (635:1021) | `trade_yes` → `confirmation_001.wav` | asker and taker at 1, the rest at 0.5 | has | |
| Trade declined / expired | `store.ts:901` (635:1022) | `trade_no` → `error_002.wav` | the asker only | has | |
| Bank / harbor trade | `rules.ts:741` (`bankTrade`) | none | the trader | missing | Not added (Decision 5). |
| Wayfarer (robber) move | `store.ts:51` (635:54) | `wayfarer_move` → `wayfarer_move.wav` (synth) | everyone | has | |
| Wayfarer lands on you | 635:54, 635:123 | `robbed_fah` → `robbed_fah.mp3` | **#635** any seat with a piece on the new hex, in place of `wayfarer_move` | has | The test is "has a piece there", not "was stolen from". The clip is owner-approved (Decision 6). |
| Steal (a good taken) | `rules.ts:593` (`moveRobber`), `store.ts:660` | none | thief and victim | missing | `robbed_fah` already covers the victim on #635. Nothing more is added (Decision 5). |
| Discard on a 7 | `store.ts:623`, `rules.ts:572` | none | the discarding seat | missing | Not added (Decision 5). |
| Your turn starts | `store.ts:76` (635:153) | `chip_gain` → `click_005.wav` (+ a 30 ms buzz, `sound.ts:129`, 635:191) | you (not in hotseat, not for a watcher) | **wrong** | A generic click that is easy to miss behind a dice and a knock. Decision 5 wants a real your-turn cue. |
| Others' turn starts / end turn | `rules.ts:793` (`endTurn`) | none | everyone | missing | Not added (Decision 5). |
| Turn timer countdown | `src/components/game/TurnCountdown.tsx:13` (it only reads `turnTimer` today; a new hook is needed there), `store.ts:1035` | none | the seat whose turn it is | missing | Decision 5 wants a tick for the last seconds. |
| Chat sent | `store.ts:844` (635:960) | `chat_send` → `chat_send.wav` (synth) | the sender | has | |
| Chat received | `store.ts:1014` (635:1140) | `chat_recv` → `chat_recv.wav` (synth) | other seats; silent while typing | **wrong** | #635 hides a muted seat's lines, but their tick still plays: it does not check `readMutedSeats` the way the soundboard does (635:1139). Per-seat mute applies everywhere (decided). |
| Emote / reaction sent | `src/components/game/Reactions.tsx:149`, `:170`, `:190` (635:135, :156, :176) | `ui_click` | the sender | has | Only the button press makes a sound. |
| Emote received | `store.ts:1016` (`react`) | none | others | missing | Not added (Decision 5). |
| Soundboard tap | 635:1139, the whitelist in `server/chat.mjs` 635:11, the buttons in `src/components/game/Chat.tsx` 635:213 | `robbed_fah`, `sb_wololo`, `sb_win_reaction`, `sb_airhorn`, `sb_quit_touchin`, `sb_only_wood`, `sb_perfect`, `board_bong` (`sound.ts` 635:49) | **#635** every seat, the sender included, unless that listener muted the sender | **wrong** | The clips are owner-approved and stay (Decision 6). They play at 1.0, leveled by type in the files (Decision 3, 2026-10-24). |
| GG on the end screen | `src/components/game/WinScreen.tsx` 635:192 | `sb_win_reaction` via the soundboard | **#635** every seat | **wrong** | Same as the soundboard row: it plays at 1.0, leveled in the file. |
| Player joins / leaves the lobby | `store.ts:1021` (`seats`) | none | everyone at the table | missing | Not added (Decision 5). |
| Rejoin / reconnect | `store.ts:771` (`rejoinTable`), `store.ts:1007` (`reconnecting`), `store.ts:969` (`welcome`) | none | the rejoining seat | missing | Not added (Decision 5). |
| Game start | 635:140 (online), 635:587 (practice) | `game_start` → `game_start.mp3` at 1.0 (leveled to -18 LUFS) | **#635** every seat, once per board | has | Hotseat never plays it (`store.ts:491`, `startHotseat`). The first roll cuts it off. |
| Match point (one point from winning) | 635:150 | `match_point` → `match_point.mp3` at 1.0 (leveled to -18 LUFS) | **#635** everyone | has | Counts public points only, once per player per game. 4.2 s long. |
| Win (you won) | `store.ts:38` (635:39) | `win` → `pluck_001.wav` | main: everyone; #635: the winner (and every seat in hotseat) | **wrong** | One short pluck, while on #635 the losers get a 3.4 s sting. Jarrod picks the replacement; the pluck stays until then (Decision 4). |
| Lose | 635:39 | `game_lose` → `game_lose.mp3` at 1.0 (leveled to -18 LUFS) | **#635** every seat but the winner (not hotseat) | has | A watcher counts as having lost, so they hear it too. |
| End music | 635:145, stopped at 635:89, 635:142 and `sound.ts` 635:95 | `end_music` → `end_music.mp3` at 1.0 (leveled to -18 LUFS), 1.5 s after the sting | **#635** every seat (not hotseat) | has | A 14.6 s mp3, which is stopped at the end screen, at a rematch and at mute. |
| Menu / button tap | `src/components/ui/button.tsx:37` | `ui_click` → `click_001.wav` / `ui_back` → `back_001.wav` | the presser | has | Back also plays from `TableMenu.tsx:74`, `FortuneTray.tsx:73`, `CostCard.tsx:38`, `HowTo.tsx:36` and `escape-disarm.ts:21`. |
| Sound toggled on | `src/components/game/TableMenu.tsx:175`, `src/components/game/EmberisleApp.tsx:309` (635:311) | `ui_click` | the presser | has | |
| Confirm (Ready, Start) | `button.tsx:37` | `ui_click` | the presser | missing | `polish.md:212` lists a separate `ui_confirm`. Not added (Decision 5). |
| Error (illegal move, bad trade) | `store.ts:592`, `:668`, `:868`, `:880`, `:1062` (635:692, :768, :989, :1001, :1189) | `ui_error` → `error_001.wav` | the seat that erred | has | |
| Sea tap | `renderer:1132` (635:1116) | `plop` → `plop.wav` (synth) | the tapper | has | |
| Ambience (wind, sea) | none (a new toggle beside `setMuted`, `sound.ts:58`) | none | everyone who turns it on | missing | Allowed as an option, off by default (Decision 2). |

## 2. Rules

**Settled** (by the Decisions, earlier decisions, or code already shipped):

- Core table sounds are dry and woody. Meme clips live on the soundboard (and `robbed_fah`) only (Decision 1).
- There is no in-game music loop. The only music is the stings already on #635: `game_start`, `match_point`, `game_lose`,
  `end_music`, and the win sting once Jarrod picks it (Decisions 2 and 4).
- Ambience (sea and wind) is optional, very quiet, and **off by default** (Decision 2).
- The volume tiers:

  | Tier | Volume | Clips |
  |---|---|---|
  | Core table | 1.0, files at -18 (short-clip loudness) | dice, builds, fortunes, wayfarer, trade yes for the two parties, your turn, error |
  | Others' echo | 0.5–0.6 | someone else's fortune bought (0.6), trade yes for bystanders (0.5), both shipped |
  | Music and stings | 1.0, files at -18 LUFS (Decision 3) | `game_start`, `match_point`, `game_lose`, `end_music`, the win sting, the background loop (which still plays under `BG_VOLUME`) |
  | Reactions / soundboard | 1.0, files at -16 LUFS (Decision 3) | every soundboard clip, `robbed_fah`, the end screen's GG |

- The only new cues are a **your-turn** cue for the seat whose turn starts and a **turn-timer countdown** tick for that seat in
  the last seconds (Decision 5). There are no join/leave, emote-received, payout, steal, discard, bank-trade or confirm cues.
- Who hears what:
  - Everyone hears what changes the board: dice, builds, the wayfarer, fortunes (softer when the fortune is not yours), trade
    offers and outcomes as in the audit, and the stings.
  - Only you hear what is about you: the your-turn cue, the countdown tick, your errors, your own button presses, your sea
    taps, the chat you send, and `robbed_fah` when the wayfarer lands on your piece.
  - The other seats hear a chat line someone else sent (`chat_recv`), and everyone hears a soundboard tap.
  - Win and lose are personal: the winner hears the win, and everyone else hears the loss.
- These overlap rules are shipped and stay: the 150 ms burst drop and the 150 ms pacing between clips, a queue capped at 8
  that drops rather than plays late, and mute checked when a clip is asked for and again when it starts (`sound.ts:80`, `:102`).
- **Long clips never stack** (decided earlier). A long clip is any clip of a second or more, which today means every mp3.
- **Mute and per-seat mute apply everywhere** (decided earlier). The master mute (`setMuted`, `sound.ts:58`) silences
  everything, queued and delayed clips included. Per-seat mute silences whatever that seat sends.
- Sources are **CC0 or owner-approved** (Decision 6). The README's "CC0 only" line becomes "CC0 or owner-approved". Each file
  records where it came from, whether that is a pack, our synth, or "Jarrod".

**Proposed** (needs Jarrod's OK, and nothing here is decided):

- The UI clicks drop to 0.5, the bible's "−6 dB under pieces". Today they play at 1.0.
- Ambience, when turned on, plays at 0.12 (the bible's −18 dB) and never ducks the dice.
- When a second long clip is asked for, the higher one wins and the other is dropped or cut. The order, from lowest to
  highest, would be game start < end music < soundboard < match point < win/lose sting. Today two different mp3s overlap.
- At most 3 short clips sound at once. The pacing already comes close to this.
- Per-seat mute would cover soundboard taps (done on #635), chat ticks (the "wrong" row above) and any future clip a seat
  sends. It would not cover board sounds that seat causes, such as their dice or builds.

## 3. Missing list

Only what the Decisions keep is listed here. Each candidate is a source to try, not a download. "Synth" means a new voice in
`scripts/make-sounds.mjs` (sine and seeded noise, so the same bytes every run and nothing to licence). Where a funny or personal
clip fits, Jarrod's own clip comes first.

| Sound (slot) | One line | Candidates |
|---|---|---|
| `your_turn` (`turn_`), Decision 5 | A cue that stands out from the knocks when your turn starts, about 300–1000 ms, replacing the `chip_gain` click | **Jarrod's own clip**; Kenney Interface Sounds (CC0, `confirmation_002`); synth: a sine fifth (660 then 990 Hz) with a slow decay |
| `timer_tick` (`timer_`), Decision 5 | A quiet tick, one a second, for the last seconds of your turn (proposed: the last 10 s) | Kenney Interface Sounds (CC0, `tick_*`); Freesound, filtered to "Creative Commons 0", search "clock tick wood"; synth: a 1.2 kHz sine tick, 30 ms. **Jarrod's own clip** works too, as one last-second sting. |
| `win` (`win_`), Decision 4 | The winner's sting, the match for `game_lose`; Jarrod picks it | **Jarrod's own clip** (his pick, per Decision 4); Kenney Music Jingles (CC0, a short major jingle); synth: a decaying sine major triad of 1.5 s |
| `amb_sea` / `amb_wind` (`amb_`), Decision 2 | A very quiet sea and wind loop, off by default, behind a toggle | Freesound CC0 "ocean waves loop"; OpenGameArt CC0 "ambient sea loop"; synth: low-passed brown noise with a slow 0.1 Hz swell, 20 s, seamless |
| New soundboard clips (`sb_`), Decision 6 | More meme taps for the chat soundboard | **Jarrod's own clips**; Freesound CC0 (search by name); Kenney Voiceover Pack (CC0) |
| Optional swaps for shipped slots (`robbed_`, `match_`, `start_`, `lose_`, `end_`) | A personal clip in place of a #635 clip, if Jarrod wants one | **Jarrod's own clip**; Kenney Music Jingles (CC0) for the stings; keep the current clip |

### Handing over clips

Jarrod uploads the mp3 in his chat with the orchestrator, or zips it and attaches it to #653, or pastes a link. He
names it `<slot>_<short-name>.mp3`, e.g. `sb_mynewclip.mp3` for the soundboard or `win_<name>.mp3` for the win
sting. A Builder commits it to `public/audio/` with the source recorded as "Jarrod" and wires it. Keep each clip
to about 15 s and 300 kB at most.

| Slot prefix | Where it plays | Today's clip |
|---|---|---|
| `sb_` | a soundboard button, heard by every seat at 1.0 (file leveled to -16 LUFS) | `sb_wololo`, `sb_win_reaction`, `sb_airhorn`, `sb_quit_touchin`, `sb_only_wood`, `sb_perfect` (#635) |
| `robbed_` | the seat the wayfarer lands on | `robbed_fah` (#635) |
| `match_` | someone is one point from winning | `match_point` (#635) |
| `win_` | the winner | `pluck_001.wav` (to be replaced, Decision 4) |
| `lose_` | every seat but the winner | `game_lose` (#635) |
| `start_` | a new game starts | `game_start` (#635) |
| `end_` | the end screen's music | `end_music` (#635) |
| `turn_` | your turn starts | `click_005.wav` (to be replaced, Decision 5) |
| `timer_` | the last seconds of your turn | none yet (Decision 5) |
| `amb_` | the optional ambience loop | none yet (Decision 2) |

Any builder can then wire a new soundboard clip with a one-line whitelist and label change: one entry in `SOUNDBOARD` in
`server/chat.mjs`, plus its `FILES` and `SOUNDBOARD` entries in `src/lib/sound.ts`. Any other slot is a one-line `FILES` change
in `sound.ts`. The clip's source is recorded as "Jarrod" (Decision 6).

## 4. Questions for Jarrod (answered)

All six are answered by the Decisions below. Each question keeps the recommendation I made before he answered.

1. **Overall vibe?** Recommended: *dry, woody board game for every core sound, with the memes kept on the soundboard*.
   **Answered (Decision 1):** as recommended.
2. **Music beyond start and end?** Recommended: *no music loop; add an optional very quiet sea-and-wind ambience, off by
   default*. **Answered (Decision 2):** as recommended.
3. **How loud are the meme clips against the core sounds?** Recommended: *0.4, below the music's 0.5*. **Answered
   (Decision 3):** 0.4, then replaced on 2026-10-24: no blanket volume, the files are leveled by type (see Decision 3).
4. **Replace soundboard and music clips with no known source (Wololo is from Age of Empires)?** Recommended: *yes, use CC0
   sound-alikes, or drop the clip*. **Answered (Decision 6):** no. They are kept as owner-approved, and the rule becomes "CC0 or
   owner-approved".
5. **Should the winner get a real win sting to match the losers' `game_lose`?** Recommended: *yes, a 1.5 s chord*. **Answered
   (Decision 4):** yes. Jarrod picks the clip, and the current sound stays until then.
6. **Which of the new cues are wanted: timer warning, join/leave, emote received, payout tick?** Recommended: *all four*.
   **Answered (Decision 5):** only a your-turn cue and a turn-timer countdown tick.

## Decisions (Jarrod, 2026-10-16)

These answer section 4 and override any recommendation above that disagrees.

1. **Vibe:** core sounds are dry and woody, like a board game. Meme clips live on the soundboard only.
2. **Music:** no in-game loop. An optional, very quiet sea-and-wind ambience is allowed, **off by default**.
3. **Sound levels (replaced 2026-10-24, #1073):** every sound is leveled by type, with no blanket gain. The first answer was "soundboard and meme clips play at 0.4, below music"; Jarrod withdrew it: "Everything should play at the same volume. I'm not enforcing lowering everything by 60%. I want things all leveled equally, so all types sound the same: all sound effects the same volume, all game music the same volume, all reactions the same volume." The fix is in the files (`scripts/level-audio.mjs`), then one volume per type, 1.0, with the player's mixer on top. `MEME_VOLUME`, `MUSIC_VOLUME` and `TOUCH_VOLUME` are gone; `BG_VOLUME` and `BG_DUCK` stay, since they are real behaviour (a bed under the stings). Targets, which Jarrod can adjust after listening: reactions and soundboard clips (and `robbed_fah`) **-16 LUFS**, music and stings **-18 LUFS**, table effects **-18** by short-clip loudness (K-weighted, active part only, on the LUFS scale). True peak at or below -1 dBTP everywhere. The pasture tap `sb_plump_sheep.mp3` is a table effect (it plays as a hex tap), so it sits with the effects. `bong_001`, `plop` and `pluck_001` remain table-effect files. Only Bong keeps a soundboard chip (#1131). `npm run audio-level-prove` fails if any file is more than 1 LU from its type's target or peaks above -1 dBTP. Originals: `docs/research/audio-originals-note.md`. This also supersedes the earlier "Fah plays at half volume" rule (DECISIONS, 2026-10-18): `robbed_fah` is leveled with the other reactions and plays at 1.0.
4. **Win sound:** the winner gets a real win sting. **Jarrod will pick the song or clip**; until then the current sound stays.
5. **New cues:** only two: a **"your turn"** cue for the seat whose turn starts, and a **turn-timer countdown** tick for the last seconds of your turn. No join/leave, emote-received or payout cues.
6. **Licensing:** Jarrod keeps the soundboard and meme clips (Wololo, the Charlie Kirk song, the airhorn, etc.) public and accepts the risk, since this is a free game for friends. The README's "CC0 only" line becomes "CC0 or owner-approved".

## Owner clips carried to main (#1107)

`public/audio/three_wood.mp3`: Jarrod's clip for a table offer that gives 3 or more timber. Every seat hears it, including the asker. It takes precedence over all other trade clips.

`public/audio/daking_wood.mp3`: Jarrod's clip when a player named "daking" offers 1 or 2 timber. Every seat hears it. A 3-or-more-timber offer uses `three_wood` first.

`public/audio/sheep_for_wood.mp3`: Jarrod's clip when a table offer gives wool for timber. Every seat hears it, including the asker.

`public/audio/stone_for_wood.mp3`: Jarrod's clip when a table offer gives ore for timber. Every seat hears it, including the asker.

`public/audio/corn_no.mp3`: Jarrod's clip when every other seat explicitly declines a table offer. It plays for the whole table; a timeout or a declined Yes keeps the normal No cue.

`public/audio/lucke_diggler.mp3`: Jarrod's undertaker's bell. It plays when a seat joins or is renamed in the lobby to a name matching Lucke/Lucky/Luckie Diggler, Pickle, or Isaac (spaces, punctuation and case ignored). A rejoin does not ring it.

`public/audio/isaac_win.mp3`: Isaac's win music. At 1.0 it replaces the win and loss stings for the whole table, keeps `end_music` off and stops when the end screen is left. The MP3 is unchanged from the source branch; its level check uses the -16 LUFS group to preserve the owner's mastering.

`public/audio/tap_pasture.mp3`: "Sheep Baa", CC0 from [OpenGameArt](https://opengameart.org/content/sheep-baa). It plays on a plain tap of a Pasture hex, instead of the soundboard's `sb_plump_sheep` file.

`public/audio/sb_nice_sheep.mp3`: Jarrod's soundboard clip, "Nice sheep".

`public/audio/sb_sheep_please.mp3`: Jarrod's soundboard clip, "Sheep please".

`public/audio/sb_grain_please.mp3`: Jarrod's soundboard clip, "Grain please".

`public/audio/sb_brick_please.mp3`: Jarrod's soundboard clip, "Brick please".

`sb_plump_sheep.mp3` remains the existing soundboard clip and keeps its already-levelled effect file unchanged.

## Game music (#814)

`public/audio/old_tower_inn_loop.mp3`: "Medieval: The Old Tower Inn" (loop version) by RandomMind, CC0, from <https://opengameart.org/content/medieval-the-old-tower-inn>. Converted to 128 kbps MP3. Jarrod chose it on 2026-10-18. This supersedes decision 2 above ("no in-game loop").

- It loops at volume 0.25 from the lobby through play (practice, hotseat, online and watchers), and starts only after the first press or key. The file is fetched on that first start, not before, and is not in any JS chunk.
- Mute (the Table menu's "Table sounds" and the title's sound button) stops it; unmuting resumes it. A "Music on/off" row in the Table menu, on by default and kept in `localStorage`, is a stopgap until the Sound menu (#669).
- It ducks to 30% of its volume (0.075) while `game_start`, `match_point`, `game_lose` or `end_music` is playing, and returns to 0.25 when the last of them ends or is cut off.
- It stops at the win screen (where `end_music` plays), when a new game leaves it, and on the title; a rematch brings it back.
