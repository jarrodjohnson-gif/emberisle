# Table sounds (#303, #609)

Every sound at the table is one `play(name, volume)` in `src/lib/sound.ts`. Nothing plays before the first pointer or key
gesture (browsers refuse autoplay; this is the unlocked `Audio` path iOS Safari needs), and a muted browser plays nothing.

## Events

Events come from one place: `hear()` in `src/lib/game/store.ts` diffs the previous and next `GameState`, for practice,
hotseat and the host's `state` pushes alike. So a bot's path knocks like yours, and your own action plays once: online it
arrives only as the host's next state, and offline only `dispatch` hears it. The trade and chat lines have no state to diff,
so their message handlers play them (`tradeOffer`, `tradeClosed`, `chat`, `sendChat`).

| Event | Clip | Who hears it |
|---|---|---|
| Path placed | `path_place` | everyone |
| Outpost placed | `outpost_place` | everyone |
| Stronghold raised | `stronghold_place` | everyone |
| Wayfarer moved (roll of 7 or a wayfarer card) | `wayfarer_move` (new) | everyone |
| Fortune bought | `card_buy` | everyone; others at 0.6 volume |
| Fortune played | `card_play` | everyone |
| Trade offered | `trade_offer` (new) | everyone but the asker |
| Trade accepted | `trade_yes` | asker and taker in full, the rest at 0.5 |
| Trade declined by all / expired | `trade_no` | the asker only |
| Chat sent | `chat_send` (new) | the sender |
| Chat received | `chat_recv` (new) | other seats; silent while the chat input has focus |
| Dice rolled, your turn, win | `dice_land`, `chip_gain`, `win` | as before |
| A tap on open water (not a drag's stir), #616 | `plop` (new) | the tapper only (the renderer plays it) |

Pieces knock when they land (`LAND_MS`, #438), not when picked. A new game does not play `wayfarer_move` (the diff only
counts the same game's seed).

## The burst rule

- A clip asked for again within 150 ms of its last request is dropped: a burst is one sound. The UI clips (`ui_click`, `ui_back`,
  `ui_error`) are exempt, since each answers a person's own press; they are still paced.
- Distinct clips start at least 150 ms apart, in the order asked (a queue paced by a timer from each actual start). A bot round of five
  actions is five spaced sounds. Pacing with bots is shared with #608.
- More than 8 waiting is dropped rather than played late. Mute is checked when a clip is asked for and again when it starts,
  so muting silences what is queued.

## The new clips

`node scripts/make-sounds.mjs` writes them to `public/audio/`. They are synthesised from sine tones and low-passed noise with a
fixed noise seed (the same bytes every run), so there is no sample and no licence to carry: they are ours, CC0 like the rest of the folder.
Mono, 16-bit, 22.05 kHz, peak-normalised to 29000, which is where the Kenney clips sit.

| File | Sound | Length | Bytes |
|---|---|---|---|
| `wayfarer_move.wav` | low thud, then a short rustle | 340 ms | 15038 |
| `trade_offer.wav` | light double tap | 260 ms | 11510 |
| `chat_send.wav` | tiny soft pop | 140 ms | 6218 |
| `chat_recv.wav` | the same pop, higher | 140 ms | 6218 |
| `plop.wav` | a soft water plop: a bloop rising 260 to 620 Hz over a short dark splash (#616) | 150 ms | 6660 |

Total 45644 bytes. `server/cue.mjs` maps the same names for the host.

## Proof

`npm run sounds-prove` stubs `play` and records clip, volume and time: the burst rule, mute (including queued clips), each
practice event and a bot round in order and spaced, and online chat (sent, received, silent while the input is focused,
silent when muted). `npm run trade-prove` asserts `trade_offer`, `trade_yes` volumes and `trade_no` across three tabs.
