# Sound design: a sound for every game moment (#653)

Earlier sound work: #303, #609, #616, and #635 (branch `hud/lobby-names-chat`, about to merge). This page covers the union of
`main` and #635. Rows marked **#635** exist only on that branch. The design calls for no code change here; the child issues get
filed once Jarrod answers section 4.

Short names used below: `store.ts` = `src/lib/game/store.ts`, `sound.ts` = `src/lib/sound.ts`, `rules.ts` = `src/lib/game/rules.ts`,
`renderer` = `src/lib/scene/isle-renderer.ts`. A line number is on `main`. Where #635 moves a line, its number on #635 follows
as `635:N`. A clip is a `sound.ts` `FILES` name, and the file it plays is in `public/audio/`.

## 1. Audit

| Moment | Trigger (file:line) | Clip | Who hears it | Status | Note |
|---|---|---|---|---|---|
| Roll (dice land) | `store.ts:42` (635:43) | `dice_land` → `drop_001.wav` | everyone | has | Plays when the result lands, and also cuts off `game_start` (`sound.ts:141`, #635). The bible's `dice_shake` (the roll starting) is missing. |
| Roll starts (shake) | `rules.ts:532` (`roll`) | none | everyone | missing | Bible §7 lists `dice_shake.wav` at about 700 ms. |
| Payout, you gain goods | `rules.ts:532` and `src/components/game/GainFloats.tsx:1` | none | the seat that gains | missing | The `chip_gain` name is spent on the your-turn chime (`sound.ts:20`). Bible: "if three hexes pay at once, play `chip_gain` once". |
| Payout, others gain | `rules.ts:532` | none | others | missing | Proposal: stay silent (see rules: only your own goods tick). |
| Build path | `store.ts:45` (635:46) | `path_place` → `drop_002.wav` | everyone | has | Delayed to the landing (`LAND_MS`, `store.ts:67`). |
| Build outpost | `store.ts:44` (635:45) | `outpost_place` → `drop_003.wav` | everyone | has | Delayed to the landing. |
| Build stronghold | `store.ts:43` (635:44) | `stronghold_place` → `bong_001.wav` | everyone | has | #635 reuses the same file as the soundboard's "Bong" (`sound.ts:43`), so a meme tap sounds like a build. |
| Buy fortune | `store.ts:46` (635:47) | `card_buy` → `open_001.wav` | everyone; others at 0.6 | has | |
| Play fortune (any kind) | `store.ts:47` (635:48) | `card_play` → `scratch_001.wav` | everyone | has | The same clip for all five kinds. A distinct clip for each kind is optional; see the missing list. |
| Trade offered | `store.ts:915`, `:1050` (635:1036, :1177) | `trade_offer` → `trade_offer.wav` (synth) | everyone but the asker | has | |
| Trade accepted | `store.ts:900` (635:1021) | `trade_yes` → `confirmation_001.wav` | asker and taker at 1, the rest at 0.5 | has | |
| Trade declined / expired | `store.ts:901` (635:1022) | `trade_no` → `error_002.wav` | the asker only | has | |
| Bank / harbor trade | `rules.ts:728` (`bankTrade`) | none | the trader | missing | No diff in `soundsFor` (`store.ts:36`) sees a goods swap. |
| Wayfarer (robber) move | `store.ts:51` (635:54) | `wayfarer_move` → `wayfarer_move.wav` (synth) | everyone | has | |
| Wayfarer lands on you | 635:54, 635:123 | `robbed_fah` → `robbed_fah.mp3` | **#635** any seat with a piece on the new hex, in place of `wayfarer_move` | has | The test is "has a piece there", not "was stolen from". The clip has no recorded source or licence. |
| Steal (a good taken) | `rules.ts:580` (`moveRobber`), `store.ts:660` | none | thief and victim | missing | The move and the steal arrive in the same state. Proposal: a soft "pickpocket" tick for the thief and the victim only. |
| Discard on a 7 | `store.ts:623`, `rules.ts:559` | none | the discarding seat | missing | |
| Your turn starts | `store.ts:76` (635:153) | `chip_gain` → `click_005.wav` (+ a 30 ms buzz, `sound.ts:191`) | you (not in hotseat, not for a watcher) | has | A generic click: easy to miss at the 150 ms pace behind a dice and a knock. |
| Others' turn starts / end turn | `rules.ts:780` (`endTurn`) | none | everyone | missing | Proposal: none; the dice already mark the next turn. |
| Turn timer warning | `src/components/game/TurnCountdown.tsx:14`, `store.ts:1035` | none | the seat whose turn it is | missing | |
| Chat sent | `store.ts:844` (635:960) | `chat_send` → `chat_send.wav` (synth) | the sender | has | |
| Chat received | `store.ts:1014` (635:1140) | `chat_recv` → `chat_recv.wav` (synth) | other seats; silent while typing | **wrong** | #635 hides a muted seat's lines, but their tick still plays: it does not check `readMutedSeats` the way the soundboard does (635:1139). |
| Emote / reaction sent | `src/components/game/Reactions.tsx:149`, `:170`, `:190` (635:135, :156, :176) | `ui_click` | the sender | has | Only the button press makes a sound. |
| Emote received | `store.ts:1016` (`react`) | none | others | missing | The `ui_react` clip was deferred for want of a CC0 file (`docs/design/chat.md:160`). |
| Soundboard tap | 635:1139, the whitelist in `server/chat.mjs:11`, buttons at `src/components/game/Chat.tsx:213` | `robbed_fah`, `sb_wololo`, `sb_win_reaction`, `sb_airhorn`, `sb_quit_touchin`, `sb_only_wood`, `board_bong`, `board_plop`, `board_pluck` (`sound.ts:49`) | **#635** every seat, the sender included, unless that listener muted the sender | has | Five of these are 1–3.6 s mp3s at volume 1, louder and longer than every core clip. None has a recorded source; "Wololo" is the Age of Empires line, which the bible (§7) and the README ("Do not rip sounds from commercial games") forbid. |
| GG on the end screen | `src/components/game/WinScreen.tsx:192` (#635) | `sb_win_reaction` via the soundboard | **#635** every seat | has | The same clip, with the same issues as the soundboard row. |
| Player joins / leaves the lobby | `store.ts:1021` (`seats`) | none | everyone at the table | missing | |
| Rejoin / reconnect | `store.ts:771` (`rejoinTable`), `store.ts:1007` (`reconnecting`), `store.ts:969` (`welcome`) | none | the rejoining seat (others: the join row) | missing | Proposal: silent on your side; a "back" tick for the others. |
| Game start | 635:140 (online), 635:587 (practice) | `game_start` → `game_start.mp3` at 0.5 | **#635** every seat, once per board | has | Hotseat never plays it (`store.ts:491`, `startHotseat`). The first roll cuts it off. |
| Match point (one point from winning) | 635:150 | `match_point` → `match_point.mp3` at 0.5 | **#635** everyone | has | Counts public points only, once per player per game. 4.2 s long, so it can sit under a dice roll and a knock. |
| Win (you won) | `store.ts:38` (635:39) | `win` → `pluck_001.wav` | main: everyone; #635: the winner (and every seat in hotseat) | **wrong** | One short pluck, while on #635 the losers get a 3.4 s music sting. The bible asks for "1.5 s, one chord". |
| Lose | 635:39 | `game_lose` → `game_lose.mp3` at 0.5 | **#635** every seat but the winner (not hotseat) | has | A watcher counts as having lost, so they hear it too. |
| End music | 635:145, stopped at 635:89, 635:142 and `sound.ts:95` | `end_music` → `end_music.mp3` at 0.5, 1.5 s after the sting | **#635** every seat (not hotseat) | has | A 14.6 s mp3, which `stop()` cuts at the end screen, at a rematch and at mute. |
| Menu / button tap | `src/components/ui/button.tsx:37` | `ui_click` → `click_001.wav` / `ui_back` → `back_001.wav` | the presser | has | Back also plays from `TableMenu.tsx:74`, `FortuneTray.tsx:73`, `CostCard.tsx:38`, `HowTo.tsx:36` and `escape-disarm.ts:21`. |
| Sound toggled on | `src/components/game/TableMenu.tsx:175`, `src/components/game/EmberisleApp.tsx:309` (635:311) | `ui_click` | the presser | has | |
| Confirm (Ready, Start) | `button.tsx:37` | `ui_click` | the presser | missing | `polish.md:212` and bible §7 list a separate `ui_confirm`; it does not exist yet. |
| Error (illegal move, bad trade) | `store.ts:592`, `:668`, `:868`, `:880`, `:1062` (635:692, :768, :989, :1001, :1189) | `ui_error` → `error_001.wav` | the seat that erred | has | |
| Sea tap | `renderer:1132` (635:1116) | `plop` → `plop.wav` (synth) | the tapper | has | |
| Ambience (wind, sea) | none | none | everyone | missing | The bible lists `amb_wind` and `amb_sea` as very quiet loops; there is no code for them. |

## 2. Rules

**Volume tiers** (a linear `play(name, volume)` volume; the source files are all peak-normalised to about 29000/32767):

| Tier | Volume | Clips |
|---|---|---|
| Core table | 1.0 | dice, builds, fortunes, wayfarer, trade yes for the two parties, your turn, win, error |
| Others' echo | 0.5–0.6 | someone else's fortune bought (0.6), trade yes for bystanders (0.5) |
| UI | 0.5 (bible: −6 dB under pieces) | click, back, confirm, chat ticks. Today they play at 1.0, which breaks the bible's mix. |
| Music and stings | 0.5 (`MUSIC_VOLUME`, `sound.ts:63`) | `game_start`, `match_point`, `game_lose`, `end_music` |
| Meme / soundboard | Jarrod picks (Q3); the recommendation is 0.4 | every `sb_*` and `robbed_fah`. Today they play at 1.0. |
| Ambience | 0.12 (bible: −18 dB), never ducks the dice | `amb_wind` / `amb_sea`, if Q2 says yes |

**Who hears what.**

- Everyone hears what changes the board: dice, builds, the wayfarer, fortunes (softer when it is not yours), and the game's
  shape (start, match point, end music).
- Only you hear what is about you: your turn, your payout, your discard, your errors, your own button presses, your sea taps,
  and what you sent (`chat_send`). The two parties of a steal each hear it; bystanders hear only the wayfarer.
- The others hear what someone sent them: `chat_recv`, `trade_offer`, a received emote, and join and leave.
- Win and lose are personal: the winner hears the win, everyone else hears the loss. In hotseat everyone at the screen hears
  the win.
- A watcher hears the table as a seat does, without the your-turn or payout cues, and hears the loss at the end.

**Overlaps.**

- These are decided and kept: the 150 ms burst drop and the 150 ms pacing between clips, a queue capped at 8 that drops rather
  than plays late, and mute checked both when a clip is asked for and when it starts (`sound.ts:116`).
- **Long clips never stack** (decided). A clip of a second or more (every mp3) is "long". Only one long clip plays at a time
  on a page: a new long clip either replaces the one playing or is dropped. The order is end music < soundboard < match point <
  win/lose sting, with game start lowest. Today two different mp3s overlap, for example `match_point` under a soundboard
  airhorn. A long clip never ducks or delays the core table tier.
- At most 3 short clips sound at once. The pacing already holds this, since the core clips are under 350 ms.
- Several payouts from one roll are one tick (bible §7).

**Mute.** The master mute (`setMuted`, `sound.ts:93`) silences everything, including queued and delayed clips. Per-seat mute
(`src/lib/muted-seats.ts`, #635) silences everything that seat *sends*: soundboard taps (done), chat ticks (row "Chat
received" above: wrong), emotes, and a future walk-in intro. It never silences board sounds that seat causes, such as their
dice or builds.

**Sources.** Use CC0 or our own synth only (bible §7, README). Each file records its source in this page's missing list or in
a credits line beside `public/audio/`. A clip whose source is unknown is replaced, not shipped.

## 3. Missing list

Each candidate is a pack or a search to try, not a download. "Synth" means a new voice in `scripts/make-sounds.mjs` (sine and
seeded noise, so the same bytes every run and nothing to licence).

| Sound | One line | Candidates |
|---|---|---|
| `dice_shake` | A 600–700 ms rattle of wooden dice in a cup, as the roll starts | Kenney Casino Audio (CC0, `dice-shake-*`); Freesound, filter "Creative Commons 0", search "dice cup shake"; synth: 12 short bandpassed noise clicks with random 30–60 ms gaps |
| `chip_gain` (real payout tick) | A light woody or coin tick when your goods arrive, once per roll | Kenney RPG Audio (CC0, `handleCoins`); Kenney Interface Sounds (CC0, `tick_00x`); synth: a 2 kHz sine blip of 40 ms over a dark noise tap |
| `your_turn` (move the chime off `chip_gain`) | A soft two-note rising chime of about 300 ms that stands out from the knocks | Kenney Interface Sounds (CC0, `confirmation_002`); Kenney Music Jingles (CC0, a short one); synth: a sine fifth (660 then 990 Hz) with a slow decay |
| `bank_trade` | The shuffle of goods into the bank: a paper or cloth slide and a soft tick | Kenney RPG Audio (CC0, `cloth*`); OpenGameArt CC0 "inventory sounds"; synth: a short low-passed noise sweep, then a 1 kHz tick |
| `steal` | A quick pickpocket swish for the thief and the victim | Kenney RPG Audio (CC0, `cloth`/`bookFlip`); Freesound CC0 "swoosh short"; synth: a noise burst with a rising filter of 120 ms |
| `discard` | Goods dropped on the table: two dull taps | Kenney Impact Sounds (CC0, `impactWood_light_*`); Kenney RPG Audio (CC0, `dropLeather`); synth: two dark noise taps 80 ms apart |
| `timer_warn` | A ticking clock or a muted wood block at 10 s left, quiet, for the current seat only | Kenney Interface Sounds (CC0, `tick_*`); Freesound CC0 "clock tick wood"; synth: a 1.2 kHz sine tick, 30 ms, one a second |
| `ui_react` (emote received) | A tiny bubble pop, lighter than `chat_recv` | Kenney Interface Sounds (CC0, `pluck_002`/`drop_00x`); Kenney UI Audio (CC0, `click*`); synth: `chat_recv`'s pop pitched a fifth up and 80 ms long |
| `seat_join` / `seat_leave` | Lobby only: a soft up tick when someone sits and a down tick when they leave (also played for a rejoin) | Kenney Interface Sounds (CC0, `maximize_00x`/`minimize_00x`); Kenney UI Audio (CC0, `switch*`); synth: a sine glide 400→700 Hz for join and 700→400 Hz for leave, 120 ms |
| `ui_confirm` | Ready, Start, Accept: a slightly fuller click than `ui_click` | Kenney Interface Sounds (CC0, `confirmation_00x`, already the source of `trade_yes`); Kenney UI Audio (CC0); synth: two stacked sine clicks 40 ms apart |
| `win` (replacement) | A 1.5 s single bright chord, not a song (bible), the winner's match for `game_lose` | Kenney Music Jingles (CC0, a short major jingle); OpenGameArt CC0 "victory fanfare short"; synth: a decaying sine major triad with a light shimmer |
| `card_*` per fortune (optional) | Small variants of the paper sound for knight, road building, plenty, monopoly and point | Kenney Casino Audio (CC0, `card-slide-*`, `card-place-*`); Kenney RPG Audio (CC0, `bookFlip*`); synth: not a good fit for paper, so take the packs |
| `amb_sea` / `amb_wind` (if Q2) | Very quiet looping surf and wind under the island, at 0.12 | Freesound CC0 "ocean waves loop"; OpenGameArt CC0 "ambient sea loop"; synth: low-passed brown noise with a slow 0.1 Hz swell, 20 s, seamless |
| Replacements for the unsourced #635 mp3s (if Q4) | Sound-alikes for the soundboard, `robbed_fah` and the music stings, from a known licence | Kenney Voiceover Pack / Kenney Fighter Voiceover (CC0) for the shout lines; Freesound CC0 "air horn"; Kenney Music Jingles (CC0) for `game_start` / `match_point` / `game_lose` / `end_music` |

## 4. Questions for Jarrod

Each question gives my recommendation first.

1. **Overall vibe?** Recommended: *dry, woody board game for every core sound, with the memes kept on the soundboard*. The
   other choice is playful and cartoony throughout.
2. **Music beyond start and end?** Recommended: *no music loop; add an optional very quiet sea-and-wind ambience, off by
   default*. The other choices are an in-game music loop, or nothing more.
3. **How loud are the meme clips against the core sounds?** Recommended: *0.4, below the music's 0.5*. The other choices are
   0.5 (the same as the music) or 1.0 (as on #635 today).
4. **Replace soundboard and music clips with no known source (Wololo is from Age of Empires)?** Recommended: *yes, use CC0
   sound-alikes, or drop the clip*. The other choice is to keep them for friends-only tables.
5. **Should the winner get a real win sting to match the losers' `game_lose`?** Recommended: *yes, a 1.5 s chord*. The other
   choice is to keep the pluck.
6. **Which of the new cues are wanted: timer warning, join/leave, emote received, payout tick?** Recommended: *all four, each
   quiet and only for the seats it concerns*. The other choice is to pick some of them.

## Decisions (Jarrod, 2026-10-16)

These answer section 4 and override any recommendation above that disagrees.

1. **Vibe:** core sounds are dry and woody, like a board game. Meme clips live on the soundboard only.
2. **Music:** no in-game loop. An optional, very quiet sea-and-wind ambience is allowed, **off by default**.
3. **Meme volume:** soundboard and meme clips play at **0.4**, below music.
4. **Win sound:** the winner gets a real win sting. **Jarrod will pick the song or clip**; until then the current sound stays.
5. **New cues:** only two: a **"your turn"** cue for the seat whose turn starts, and a **turn-timer countdown** tick for the last seconds of your turn. No join/leave, emote-received or payout cues.
6. **Licensing:** Jarrod keeps the soundboard and meme clips (Wololo, the Charlie Kirk song, the airhorn, etc.) public and accepts the risk, since this is a free game for friends. The README's "CC0 only" line becomes "CC0 or owner-approved".
