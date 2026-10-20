# Decisions

These are owner decisions. They beat anything older in an issue or design doc.
Read this before you design or build.
The review desk adds a line whenever Jarrod decides something.

| Date | Decision | Where |
|---|---|---|
| 2026-10-20 | Timer vote (#832): +60 s, and the cap rises too. Connected humans other than the timed player vote, and the requester counts as yes. One request per turn. | [#832](https://github.com/jarrodjohnson-gif/emberisle/issues/832) |
| 2026-10-20 | Astra starts the HUD design pass (#903) now, on seats, build bar and menus. The hand and chat wait for #773 and #899. | [#903](https://github.com/jarrodjohnson-gif/emberisle/issues/903) |
| 2026-10-20 | Big design work needs Opus 5.5 or stronger. Any model may do small, defined design, like an icon swap. | Jarrod, in chat; [`docs/LANES.md`](LANES.md) |
| 2026-10-20 | Seat tallies use the lucide Route and Swords icons, not emoji. | [PR #859](https://github.com/jarrodjohnson-gif/emberisle/pull/859) |
| 2026-10-20 | Chat is one button with two tabs: Chat with 6 emoji, then Sounds & stickers. Reactions and closed-chat messages bubble at the seat ([`design/chat-c`](design/chat-c/README.md)). | Vote page |
| 2026-10-20 | Goods cards use V1 Column ([`design/goods-cards-v1`](design/goods-cards-v1/README.md)). | [#773](https://github.com/jarrodjohnson-gif/emberisle/issues/773) |
| 2026-10-20 | Win table on portrait phones uses short column names (Out, Str, Path, Army, Hid). | [PR #878](https://github.com/jarrodjohnson-gif/emberisle/pull/878) |
| 2026-10-20 | Pale-seat legal markers use the teal glow (mock 2). | [PR #879](https://github.com/jarrodjohnson-gif/emberisle/pull/879) |
| 2026-10-20 | Emote badge returns in game only, not in the lobby. It waits for the chat audit, which may place emotes elsewhere. | [PR #847](https://github.com/jarrodjohnson-gif/emberisle/pull/847) |
| 2026-10-20 | Goods cards: rebuild #773 from a new mock. Gemini's #888 and the first mock both looked generic. Numbers must be centred. | [PR #888](https://github.com/jarrodjohnson-gif/emberisle/pull/888) |
| 2026-10-19 | Dock goods piles at 2.5x, as merged in #874. Approved from screenshots. | [PR #874](https://github.com/jarrodjohnson-gif/emberisle/pull/874) |
| 2026-10-19 | Owned dock rates: no text labels on the board, because they take too much screen. Use a small marker on the building instead. | [PR #881](https://github.com/jarrodjohnson-gif/emberisle/pull/881) |
| 2026-10-19 | Emote badge pinned to the seat (#847) rejected: in the lobby it covers the name. Emotes stay as they were. | [PR #847](https://github.com/jarrodjohnson-gif/emberisle/pull/847) |
| 2026-10-19 | Pale-seat legal markers: thin dark edge by default. A coloured glow is still being compared. | [PR #879](https://github.com/jarrodjohnson-gif/emberisle/pull/879) |
| 2026-10-19 | Robber hex: stronger grey. | [PR #838](https://github.com/jarrodjohnson-gif/emberisle/pull/838) |
| 2026-10-19 | Leave in the lobby frees the seat at once. A dropped connection still holds it for 90 s. No kick button. | [PR #812](https://github.com/jarrodjohnson-gif/emberisle/pull/812) |
| 2026-10-19 | Trade sounds: 3+ wood offered plays the 3-wood clip for anyone. Daking's own clip plays only when he offers 1-2 wood. All players saying No plays the corn clip. | [PR #812](https://github.com/jarrodjohnson-gif/emberisle/pull/812) |
| 2026-10-19 | Isaac (any "Lucke Diggler", "pickle" or "Isaac" name): the undertaker's bell plays when he joins, and his own win music plays when he wins. | [PR #812](https://github.com/jarrodjohnson-gif/emberisle/pull/812) |
| 2026-10-19 | CI: old runs cancel when a new commit lands. Drafts skip CI. browser-a runs as three parallel parts. | [PR #872](https://github.com/jarrodjohnson-gif/emberisle/pull/872), [PR #880](https://github.com/jarrodjohnson-gif/emberisle/pull/880) |
| 2026-10-19 | Docks show their good with a bigger goods pile on the pier (wood pile, rocks…), not a big sign. | [#846](https://github.com/jarrodjohnson-gif/emberisle/issues/846) |
| 2026-10-19 | Trade dialog: option A, Table and Bank tabs. | [#831](https://github.com/jarrodjohnson-gif/emberisle/issues/831#issuecomment-6257817880) |
| 2026-10-19 | Fog of war: option A, neighbour veil. Stays `prio:p2`. | [#842](https://github.com/jarrodjohnson-gif/emberisle/issues/842#issuecomment-6257818228) |
| 2026-10-19 | Expansions: option 1, Beacon docks and New fortunes. Lobby toggles, off by default. Stays `prio:p2`. | [#843](https://github.com/jarrodjohnson-gif/emberisle/issues/843#issuecomment-6257818532) |
| 2026-10-19 | Size budgets check each PR's growth against main, not one shared total. | [#868](https://github.com/jarrodjohnson-gif/emberisle/issues/868) |
| 2026-10-19 | Gemini takes defined work: UI audits, minor design fixes, small coding, docs. It never builds a new look. Split such an issue. | Jarrod, in chat; [`docs/LANES.md`](LANES.md) |
| 2026-10-19 | People get first dibs on table trades. Bots wait 8 s before a Yes. Bots keep their normal game speed. Counter-offers come later. | [#850](https://github.com/jarrodjohnson-gif/emberisle/issues/850) |
| 2026-10-19 | Open tables: anyone with the link can join, alongside code tables. | [#833](https://github.com/jarrodjohnson-gif/emberisle/issues/833) |
| 2026-10-19 | Josh (joshspicy2) has Write access. Main takes changes only through PRs with green CI; no force pushes, no deletion. | Repo settings |
| 2026-10-18 | The Fah clip plays at half volume. "Sheep for wood" and "stone for wood" play when an offer gives wool or ore for timber. Everyone hears them, the asker too. They are not on the soundboard. | [PR #812](https://github.com/jarrodjohnson-gif/emberisle/pull/812) |
| 2026-10-19 | Dock badges are p0. | [#846](https://github.com/jarrodjohnson-gif/emberisle/issues/846) |
| 2026-10-18 | Turn timer extension is a majority vote of the other seated players. A tie counts as no. | [#832](https://github.com/jarrodjohnson-gif/emberisle/issues/832#issuecomment-6256761801) |
| 2026-10-18 | The sheep baa plays only when a player touches a sheep (pasture) hex. | [#778](https://github.com/jarrodjohnson-gif/emberisle/issues/778#issuecomment-6256558694) |
| 2026-10-18 | Public deck count: option A. | [PR #802](https://github.com/jarrodjohnson-gif/emberisle/pull/802#issuecomment-6255544827) |
| 2026-10-18 | Goods cards are pale at rest and fill with full colour on gain. | [#772](https://github.com/jarrodjohnson-gif/emberisle/issues/772#issuecomment-6254199733) |
| 2026-10-18 | Cloud storage for profiles and pictures is approved, pending a final OK after #795. | [#779](https://github.com/jarrodjohnson-gif/emberisle/issues/779#issuecomment-6254179699) |
| 2026-10-18 | Background music is "The Old Tower Inn" (CC0). | [#778](https://github.com/jarrodjohnson-gif/emberisle/issues/778#issuecomment-6253592449) |
| 2026-10-17 | Bot action moments stay client-only: option A. | [#608](https://github.com/jarrodjohnson-gif/emberisle/issues/608#issuecomment-6237598643) |
| Not dated | Profiles are p0. | [#763](https://github.com/jarrodjohnson-gif/emberisle/issues/763), [#764](https://github.com/jarrodjohnson-gif/emberisle/issues/764), [#766](https://github.com/jarrodjohnson-gif/emberisle/issues/766) |
| Not dated | The Fable security review happens only at launch. | Jarrod, in chat |
| Not dated | Agents may spawn cheaper or stronger sub-agents. Stop starting work at 5% or less of the 5-hour or weekly limit. | [`docs/LANES.md`](LANES.md) |
