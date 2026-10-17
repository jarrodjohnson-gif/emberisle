# Design: player profiles, records and personal music (#678)

Design only. Reviewed source: `1bfb425`, 2026-10-17. Proposed defaults need review before implementation.
The final owner comments on [#678](https://github.com/jarrodjohnson-gif/emberisle/issues/678) supersede its original questions.

## Owner decisions and scope

Friends create profiles themselves, from the title or lobby. They edit text fields in the game.
Use a login name and four-digit PIN, with a remembered device credential.
Jarrod supplies icons, intro sounds, win music and optional lose sounds through the orchestrator.
Commit converted media against the friend's login. There is no player upload endpoint or seed import.
Jarrod can reset a PIN or delete a profile through a local host command.
Stickers remain shared and curated under #663.

Reuse the profile identity from [invites.md](invites.md) and [#466](https://github.com/jarrodjohnson-gif/emberisle/issues/466).
Keep one stable profile, separate from table codes, room seats and seat-rejoin secrets.
The newer direction replaces pre-built profiles and invite-based authentication for this feature.
Invites, scheduled games, videos and Easter eggs remain in #466's Backlog scope.
Future invitations may select an existing profile; they must not create a second identity system.

Jarrod delegated counting and statistics choices, and rejected editing past results, on 2026-10-17.
The [recorded decisions](https://github.com/jarrodjohnson-gif/emberisle/issues/678#issuecomment-6236996969) settle those policies below.
Technical defaults remain subject to design review before implementation.

## Source constraints

| Current source | Consequence |
|---|---|
| `server/host.mjs:172`, `seatsOf` | Add public fields through explicit projections. |
| `server/host.mjs:206`, `save`, `snapshot`, `flush` | Room writes coalesce for 250 ms. They do not guarantee durable result recording. |
| `server/host.mjs:297`, `load`; `:1368`, `dropRoom` | Room expiry and deletion must never remove profile history or pending results. |
| `server/host.mjs:396`, `viewFor`, `watchView`, `closedView` | Finished games reveal game fields. Keep profile credentials outside game and player state. |
| `server/host.mjs:547`, `pushState` | Centralize terminal detection across human, timer, bot, takeover and rejoin paths. |
| `server/host.mjs:860`, `startGame`; `:933`, `rematch` | Freeze participants for each game. Rematches reorder seats and replace the previous game. |
| `src/lib/net/table.ts:92`, `Me`; `:178`, `hostUrl`; `:246`, reconnect | Separate persistent profile authentication from the existing seat recovery protocol. |
| `src/components/game/EmberisleApp.tsx:187`, `seat-settings`; `Lobby.tsx:15`, `OwnName` | Keep guest play and existing name/colour controls usable. |
| `src/components/game/WinScreen.tsx:50`, score rows | Profile wins supplement the existing authoritative game score. |
| `src/lib/game/store.ts:39`, win handling; `:143`, delayed end music | Personal music needs explicit scheduling. A fixed 1.5-second delay would overlap a 15-second clip. |
| `src/lib/sound.ts:6`, `FILES`; `:182`, `stop` | Use a curated registry and cancel queued playback. Category mixing does not ship yet. |

## Identity and editing

Assign a host-generated UUID, `profileId`, at creation. Display-name and login changes preserve that UUID and every result.
Never identify a profile by its display name, avatar, seat colour, table code or four-digit PIN alone.
An unauthenticated matching name remains a guest. There is no name-based account recovery.

| Field | Contract |
|---|---|
| Display name | Required plain text; strip controls, trim, and cap at the existing 16-character limit. Table names remain disambiguated. |
| Login name | Required ASCII slug, 3–24 characters: `^[a-z0-9]+(-[a-z0-9]+)*$`. Trim and lowercase before uniqueness checks. |
| PIN | Exactly four ASCII digits, preserved as a string. Confirm it during creation and changes. Never store plaintext. |
| Favourite colour | One existing seat palette value. Store a distinct backup from the same palette. |
| Catchphrase | Optional plain text, at most 80 characters after stripping controls. Render as text, never HTML. |
| Media binding | Host-controlled registry key. A player cannot edit paths, asset IDs or URLs. |

Create profile requires display name, login, PIN and favourite colour. Backup colour and catchphrase are optional.
Reject login collisions atomically; two simultaneous creations cannot claim the same login.
Require the current PIN for login or PIN changes. Ordinary text and colour edits require the remembered credential.
Reserve previous login names until Jarrod releases them locally. Never transfer history or curated media to a new claimant.
PIN changes revoke all remembered credentials, then issue a replacement to the changing device.

Colour remains a preference. Choose favourite, then backup, then the ordinary palette when both are taken.
Show that substitution before Join. Never recolour an occupied seat or change readiness silently.
Profile edits update the stored profile immediately. Apply seat display and colour changes only through existing lobby actions.
During play, use the starting name and colour until the next lobby or rematch.

One profile may occupy only one seat in a game. A second device can recover that seat only with its seat secret.
Reject attaching the same profile to a second seat. Offer guest play or leaving the other seat explicitly.
Freeze each seat's profile binding at game start. Logging out or switching the selected profile cannot rewrite that game's attribution.

### Authentication boundaries

This is lightweight identity for a friend group. Four digits provide only 10,000 possibilities.
A slow hash limits guessing cost; it cannot make a stolen PIN database resistant to determined offline enumeration.
It must never authorize host administration or any operation outside profile editing.

Use asynchronous Node `scrypt`, with a random 16-byte salt and a 32-byte derived key.
Propose `N=131072`, `r=8`, `p=1`, `maxmem=192*1024*1024`. Store algorithm, parameters, salt and verifier together.
Compare equal-length verifiers with `timingSafeEqual`. Upgrade parameters after a successful login when needed.
Run at most one derivation concurrently, with a bounded queue of eight requests. Refuse overflow before hashing.
These parameters follow [OWASP's scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
Node documents salt length, asynchronous work and memory limits in [its crypto reference](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).

Apply limits before hashing: five failures per normalized login per 15 minutes, then a 15-minute cooldown.
Also cap authentication requests at 20 per source address per minute, and creations at three per address per hour.
Persist login failure windows across restart. Bound unknown-login buckets and use a dummy verifier for unknown names.
Use the same login error: “Couldn't sign in. Check your login and PIN, or try again later.”
Creation may say “Choose another login”; login names are identifiers, not secrets.
These limits are proposed local defaults, informed by [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling).
Trust forwarding headers only from an explicitly configured reverse proxy.

Issue a random 32-byte opaque device credential. Store its SHA-256 digest, profile ID, creation time and expiry on the host.
Propose a 90-day absolute expiry and at most five remembered devices per profile.
Offer “Remember me on this device”; otherwise keep the credential in page memory only.
Do not rotate on every reconnect, which could invalidate another tab. Revoke on logout, PIN reset or profile deletion.

Store remembered credentials separately from `emberisle-seat`, scoped to the normalized selected WebSocket host endpoint.
The page origin alone is insufficient because `?host=` can select another host.
Display that host before sending credentials. Never copy a credential automatically when the endpoint changes.
Send PINs and device credentials only inside encrypted connection messages, never URLs, logs, chat or broadcast frames.
Allow plaintext transport only for explicit loopback development. Existing remote guest play can remain available without profile login.
Restrict browser origins at the profile connection boundary; authorize configured development origins explicitly.
Blocked storage means “Not remembered on this device.” It never blocks joining or destroys a saved seat.

## Protocol and seat recovery

Advertise an optional `profilesV1` capability with the host handshake. Missing capability hides profile controls and preserves guest play.
Use a bounded profile connection to the selected rules host, independent of seat recovery.
The title can use it without hosting, joining, watching or consuming a seat.
Apply existing message-size limits and separate authentication/query limits. Close it when the profile surface no longer needs it.

| Proposed request | Authorization and response |
|---|---|
| `profileCreate` / `profileLogin` | Bounded fields above. Return a private `profileSession` with the profile projection and device credential. |
| `profileResume` | Validate the device credential; return the owner's projection without issuing another credential. |
| `profileEdit` / `profileChangePin` | Require that profile's valid credential; login and PIN changes also require the current PIN. |
| `profileGet` / `profileHistory` | Derive the owner from a valid credential. Ignore caller-supplied profile IDs; return only that owner's details and history. |
| `profileWins` | Require a valid profile credential. Return bounded group aggregates, never another player's detailed history. |
| `tableProfileCard` | Authorize through the current seat/watcher socket and its current room roster. Return only a visible participant's public card. |
| `profileLogout` | Revoke only the supplied device credential. A valid seat-rejoin secret remains usable. |

Return dedicated `profileError` messages with request IDs. Do not reuse game `error` frames during a rejoin.
Reject edits containing another profile ID; derive ownership from the validated credential.
Only a successful initial host/join may optionally attach the authenticated profile to a seat.
The host verifies its credential again at attachment. A failed attachment leaves the player at the existing join screen.
Guest host/join messages remain valid. Old clients do not gain profiles merely by choosing a matching name.
Automatic rejoin sends the existing room code and seat secret only. Restore the host's saved profile binding without reauthentication.
An expired profile session cannot strand an active seat. A profile credential cannot recover or replace a held seat.
Watchers cannot attach a profile to a seat, create an arrival cue, or earn a result.

Public seats expose only an optional opaque profile ID, display name, curated icon and approved media keys.
Public profile cards expose display name, icon, catchphrase, games, wins, losses, win rate and current streak.
Keep login names out of directory responses.
`tableProfileCard` cannot select an arbitrary room or profile. Reject requests after the socket leaves that table.
The host resolves the selected profile through that room's roster, including its frozen game participants after a seat expires.
Private fields include PIN verifiers, device digests, failure counters, colour preferences and administrative state.
Construct explicit allowlists for every projection. Never spread stored profile records into game, seat or watcher payloads.

## Host storage and completed results

Use a private profile directory beside the room directory, configured through `PROFILES_DIR`.
Add its default path and temporary files to `.gitignore` during implementation. Never put live profile data in `dist/`.
The Node host is the only writer. Reject a second process using the same profile directory.
The same deployment owns rooms and profiles; do not add a cloud database or third-party identity service.

| Durable record | Required fields |
|---|---|
| Profile store, `schemaVersion: 1` | UUID-keyed profiles; canonical login index; reserved previous logins; deletion tombstones; PIN verifiers; devices; rate limits; media bindings. |
| Profile record | Display/login names; colours; catchphrase; timestamps; `mediaKey`; games played, wins, losses, current win streak, last played. |
| Completed result | UUID `gameId`; result schema; rules version; start/end UTC times; duration; victory target; winner; frozen participant rows. |
| Participant row | Game player ID; optional profile UUID; starting display name and colour; human/bot classification; final points; outcome. |
| Result index | Unique `gameId` receipts and each profile's ordered result references, committed with aggregate statistics. |

Derive `winRate` as `100 × wins / gamesPlayed`; do not persist a separately editable percentage.
Return `null` for zero games. Otherwise display one decimal place and a percent sign, alongside games played.
Keep per-game history on the host. Return 20 rows per page and cap all response sizes.
History stores final scores only; it contains no hands, deck order, seed, RNG or seat secrets.
`lastPlayed` means the latest counted completion time. Duration is end time minus persisted start time, including host downtime.
Sort streaks by host completion time, then `gameId` for equal timestamps. Recompute affected streaks if an older result arrives late.
Never infer the winner from client animation, audio, chat or points claimed by a client.
Use the rules engine's terminal winner and final `totalVP` values.

### Exactly-once recording

Create a fresh random UUID for every started game and rematch. A table code, board seed or `gameSig` is not unique enough.
Persist the UUID, start time and frozen player-to-profile roster in host-private room metadata before the first game publication.
Freeze each starting seat's human/bot classification, the counting-policy version and the game's eligibility at the same boundary.
Guests count as humans for eligibility. Later disconnection, bot takeover or profile deletion never changes that eligibility.
Keep that roster after seats disconnect or expire. Never reconstruct it from current seat order or renamed players.
Do not add credentials to `GameState` or `PlayerState`.

Use one centralized terminal hook, reached before publishing every terminal state.
It covers human play, timers, bot continuation, takeover, rejoin and startup reconciliation.

1. Look up the frozen outcome, pending journal and receipt by `gameId` before constructing anything new.
2. Freeze the first terminal outcome, including completion time, final points, winner, original roster and assistance flags.
3. Durably save the final room snapshot with that frozen outcome. Wait for earlier room writes; never permit stale writes afterward.
4. Durably write an independent pending outcome under its `gameId` before publishing the final state.
5. Serialize profile-store writes across all rooms. Insert the unique receipt and update every participant's aggregates atomically.
6. Publish refreshed statistics only after that transaction commits. Then remove the pending outcome through the durable writer.

Retries reuse the frozen completion time and outcome. Never rebuild them from the rejoining seat's name, kind or current clock.
Retain a receipt fingerprint separately from mutable display rows. Hash the canonical terminal outcome once, before any identity redaction.
Compare receipt fingerprints for duplicates. A different fingerprint for the same ID stops recording and reports corruption locally.
Trusted deletion redactions preserve that fingerprint; they do not represent a newly completed game.

Use temporary-file writes, file sync, atomic rename and directory sync for durable files.
Never acknowledge a durable commit merely because an in-memory map changed or `save(room)` was called.
Crash after step three repairs the pending journal from the durable terminal room, before normal room loading or expiry.
Crash after step four replays the pending outcome. Crash after step five finds the existing receipt and changes nothing.
Room cleanup and rematches may proceed once the independent pending outcome is durable.
Startup reconciles terminal snapshots, pending outcomes and receipts before room expiry or gameplay resumes.
A restored room with a pending/committed result must be terminal; fence any inconsistent nonterminal snapshot from play.
Never resume a recorded `gameId`, even if its room snapshot is stale. Report the inconsistency locally for repair.
Room deletion never deletes the pending-outcome directory.
Serialize room transitions while persistence awaits, so another action cannot replace the finished game.

If either durable room or pending-outcome write fails, withhold terminal publication and rematch; retain the finished game for retry.
Show “Couldn't save the result. Retrying…” and report the error locally. Do not pretend the win was recorded.
If only aggregate recording fails, the durable outcome permits normal win presentation with “Saving record…” instead of an invented count.
Keep retrying with bounded backoff. Preserve pending outcomes across shutdown and restart.
Fail closed on unknown store versions or unreadable profile stores. Never replace them with an empty leaderboard.
Guests can still play; profile login and counting remain unavailable until the host repairs storage.

### Which results count

Count completed online games that started with at least two human seats. Guest humans count toward that threshold.
Exclude practice, hotseat, one-human online bot games and unfinished games from profile history and aggregate statistics.
Freeze authenticated human participants at game start. Guests and originally bot seats receive no profile result.
Reconnects and temporary bot assistance retain the original profile attribution; leaving does not erase a completed loss.
An originally human seat still counts if the bot finishes for it. Mark assistance in history, without awarding a bot a profile.
Reject duplicate profile bindings within a game. A guest cannot attach a profile retrospectively to claim a win.
Abandoned rooms and unfinished games count nothing. Record all starting authenticated participants when an eligible game finishes.
When a bot or guest wins, profiled participants record a loss. Never award that winner a fabricated profile win.
Derive games played as wins plus losses, and reset the current streak on each counted loss.
Track games, wins, losses, derived win rate, current streak and last played, plus the specified final-score history.
Exclude career path/army totals. Existing in-game awards and final points keep their current meaning.

Legacy rooms lack a reliable game UUID and roster. Keep them playable but label their results “Not tracked.”
Enable counting for their next rematch after persisting the new metadata.
Add optional versioned profile metadata without bumping `ROOM_SHAPE` solely to invalidate old games.

## Profile and Wins surfaces

Follow [polish.md](polish.md) and [jelly-ocean.md](jelly-ocean.md). Profile colours convey identity, not body-text contrast.
Use one primary action per surface, 44 px targets, visible labels, keyboard focus and safe-area padding.

| Surface | Behavior |
|---|---|
| Title | Quiet Profile and Wins actions beside existing settings. Keep Play primary and preserve typed join/watch codes. |
| Signed out | Profile offers Sign in and Create profile. Keep “Continue as guest” visible; do not add a mandatory welcome flow. |
| Create/edit profile | One form for the fields above, with a PIN subflow. PIN is masked with an accessible show control. |
| Lobby own card | Open the persistent profile editor. Distinguish it from the existing per-table name edit. Return focus to the invoking control. |
| Other lobby card | Read-only profile card: icon, name, catchphrase, games, wins, losses, win rate and current streak. Guest cards say “Guest.” |
| Wins | Show games, wins, losses, win rate and current streak. Sort by wins descending, games ascending, then UUID. Equal wins share rank. |
| Profile history | Completed games, date, seats, winner, final points and duration. Show current names in cards and starting names in history. |
| Win screen | Add “N profile wins” beside the profile identity. Keep points in the existing score column. Guest/bot rows say “Not tracked.” |

An excluded game leaves lifetime totals unchanged and says “This game isn't tracked.” Never imply it earned a profile win.
The profile sheet overlays the existing title or lobby; it adds no permanent board chrome.
At 440×956, 956×440 and 1280×720, keep Save and Close reachable when the keyboard opens.
Scroll the form within its sheet. Opening it must not change the measured board hole or readiness state.
Handle Escape, focus trapping and focus return like the existing dialogs. Announce form errors beside their fields.
An unsupported or offline host leaves guest controls usable and shows “Profiles unavailable on this host.”
For an empty record, say “No finished games yet.” Display no fake zeros while records are loading or unavailable.

The authenticated leaderboard is group-visible, not a public unauthenticated profile directory.
An unauthenticated guest or watcher may inspect only the public card of a profile already visible at their table.
Publish no login list, credentials, device list or private history. The authenticated owner may browse their own full history.
Leaderboard responses include aggregates only; other players' detailed history requires a separate future product decision.

## Curated media and playback

Use the handover process in [sound.md](sound.md#handing-over-clips), including provenance and converted-file size limits.
Jarrod supplies media with the friend's current login name. The orchestrator adds only approved local assets.
Propose `src/assets/profiles/manifest.ts`, keyed by a canonical media slug, with explicit icon and audio imports.
Use `public/audio/intro_<profile>.mp3`, `win_<profile>.mp3` and `lose_<profile>.mp3`; `<profile>` is that curated slug.
Use a local icon such as `public/profiles/<profile>.webp`. Never derive an unchecked filesystem path from a login.
The manifest is public; login slugs used as media keys must not be described as private identifiers.

Bind a matching manifest entry to the authenticated profile on creation or the next successful login.
Store the bound key privately. Login renames preserve that binding and reserve the previous login against reuse.
When Jarrod adds media under a renamed login, a local admin command updates the existing profile's binding.
Neither name similarity nor a client-supplied asset key can rebind another person's media.
Missing icons use initials. Missing or invalid media uses the fallback below, without blocking any game action.

The newer #678 scope permits intro/lose clips up to five seconds and win clips up to 15 seconds.
This replaces the older four-second arrival proposal in invites.md. Retain its quiet normalization and gain ceilings for arrivals.
No uploads, seed imports, arbitrary URLs, streaming embeds or runtime media conversion belong in this feature.

| Event | Playback contract |
|---|---|
| First successful lobby arrival | Play that profile's intro once per room to seated listeners who enabled intros. Rejoin, edits and rematch never replay it. |
| Completed game with custom winner clip | Play the winner's `win_<profile>` for every present listener, including watchers, through Music and ambience. |
| Winner without custom media | Preserve today's default `win` for the winner and `game_lose` for others, once per completed game. |
| Optional personal lose clip | Play locally only when no custom winner clip takes priority. Never stack it over the shared winner clip. |
| End music | Schedule after the selected outcome clip finishes. Replace the existing fixed 1.5-second schedule. |

Use the same `gameId` to deduplicate outcome playback. A newly loaded finished game displays results without replaying music.
Send arrival events only to present listeners, never as a replayable chat entry or backlog.
Unlock audio through the existing gesture path. Missing, blocked or failed playback stays silent and never delays gameplay.
If a custom clip fails before playback, use the existing default once.
Do not retry after navigation or a late fetch.
Reduced motion does not force audio on or off. Every listener keeps local mute, volume and Skip controls.

The #669 mixer must provide `master × music-and-ambience × clip gain`, including immediate category mute.
Do not ship personal long clips by bypassing that mixer. Prepare quiet assets before playback.
Keep arrivals at their existing proposed 0.15 gain, capped at 0.25; propose 0.5 clip gain for personal outcome music.
Never overlap intro, custom win, personal lose or end music. Critical gameplay cues may interrupt arrivals.
Arbitrate all long clips through one channel, including existing `game_start`, `match_point` and soundboard clips.
Priority is outcome music, game-start music, match-point cue, soundboard, arrival, then end music.
Outcome music preempts every lower priority clip. Game start cancels arrivals; gameplay priority cues interrupt lower priority clips.
Drop blocked arrivals and soundboard requests rather than queueing them. Never resume a preempted clip after a critical cue.
Only end music may wait for its selected outcome clip, and it remains cancellable.
Per-seat soundboard mute blocks that sender's clips. Intro opt-out remains separate; master and category mutes apply to every relevant clip.
Short dice/build cues retain their game-sound channel and may coexist with music at the receiver's chosen mix.
Skip, mute, hide, Leave and rematch cancel active, queued and delayed long clips.
Skip applies to the outcome sequence and suppresses its queued end music. It cannot advance or alter the game.
Late audio completion must not start music in another table. Scope cancellation to room and game identity.
Verify the actual iPhone audio path, not only an audio stub, before release.

## Host administration and privacy

Propose a local command requiring filesystem access to the profile directory; do not add a remotely served admin page.
The in-game Host role cannot administer profiles. Player PINs and device credentials grant no admin capability.
Do not provide historical result edits or statistic resets. Totals and win rate remain derived from authoritative counted results.
PIN reset generates a temporary PIN shown only in the local terminal, revokes devices, and requires change at next login.
Never log PIN input or include it in command-line arguments, committed fixtures or issue comments.
Profile deletion requires Jarrod's explicit confirmation and a preview of affected records and assets.
Serialize deletion with result recording. First persist a deletion tombstone and revoke credentials before accepting further profile operations.
Anonymize stored and pending participant rows as “Deleted player”, without changing other players' results.
Remove profile IDs, names, catchphrases and media bindings from those display rows. Keep immutable receipt fingerprints for deduplication only.
Startup finishes interrupted redaction before serving profiles. Pending replay and stale room rosters must consult tombstones before attributing results.
Retain internal deletion UUID tombstones solely to prevent resurrection; never include them in public projections.
Keep each `gameId` receipt so an anonymized result cannot be counted again.
Reserved former logins prevent automatic media reassignment. Releasing one requires an explicit local media-unbind step.
Deleting a profile never deletes curated repository assets automatically or cancels an active game.
Suppress later result attribution to a deleted profile; do not recreate it from a stale roster.

Keep records and credential digests on the selected host. Back up private stores with restricted permissions.
Public committed media remains downloadable, even after a profile is deleted; removing it is a separate explicit repository change.
Changing hosts or clearing browser storage requires login again. No synchronization, email recovery or cross-host merging is promised.
Do not expose profiles through static serving or the game's final-state reveal.

## Proposed implementation boundaries

This is a scope map for later tracker issues, not authorization to start them. Do not file children yet.

| Lane | Proposed child scope | Dependency boundary |
|---|---|---|
| `lane:net` | Host profile store, hashing, device sessions, text CRUD and local admin command; focused protocol proof. | Additive capability; preserve guests and seat recovery. |
| `lane:net` | Durable game UUID/roster, terminal outcome journal, atomic result receipt and aggregate transaction; crash/restart proof. | Host store above; enforce the settled counting policy. |
| `lane:hud` + `lane:net` | Title/lobby profile form, cards and remembered-host flow; keyboard, blocked-storage and two-device proof. | Authenticated API; coordinate current #553 and #562 file reservations. |
| `lane:hud` | Wins list, own history and final win counter; phone/desktop and stale-response proof. | Durable results and approved visibility rules. |
| `lane:net` + `lane:hud` | Curated manifest, bindings, arrival/outcome scheduling and cancellation; audio proof. | #669 mixer, host profiles and authoritative game IDs. |

Split any M-sized implementation through research before building. Do not reserve another builder's files through this design issue.

## Acceptance contract for those implementations

| Case | Required observation |
|---|---|
| Creation race | One canonical login and profile UUID survive; no duplicate profile or plaintext PIN reaches disk. |
| Edit and rename | UUID, history and media binding persist; old login cannot authenticate or claim another profile. |
| Guessing and reset | Limits survive restart; bounded hash work; generic login errors; PIN reset revokes all remembered credentials. |
| Shared device and host change | Logout revokes only its profile session; saved seat survives; credentials never cross selected host endpoints. |
| Rejoin | Valid seat secret restores its original profile binding even after profile-session expiry. A profile token alone cannot recover it. |
| Private projections | Credentials and login fields appear in no game state, spectator state, log, leaderboard or other-profile response. |
| Terminal paths | Human win, timer win, bot continuation, takeover and rejoin all produce the same unique authoritative receipt. |
| Crash boundaries | Before final-state durability, no fabricated result. After it, journal repair and replay yield one result with correct totals. |
| Room lifecycle | Immediate rematch, seat expiry, room deletion and expired-room cleanup preserve attribution and pending outcomes. |
| Concurrent rooms | Two games finishing together preserve both receipts, correct wins/losses and ordered streaks. |
| Modes and bots | One-human bot games are excluded. One authenticated human plus one guest human is eligible; only the authenticated profile earns statistics. |
| Assistance and exclusions | Temporary bot assistance retains attribution. Practice, hotseat and unfinished games never affect history, wins or win rate. |
| Statistics | Two wins from three counted games show 66.7%. Zero games show no percentage. Excluded games leave totals unchanged. |
| Legacy and corruption | Legacy rooms stay playable without fabricated history; unknown schemas and corrupt stores cannot silently reset records. |
| UI | Phone portrait/landscape and desktop preserve guest entry, typed codes, readiness, board hole, focus and 44 px controls. |
| Media | Custom winner clip plays once; win preempts soundboard and game start cancels intro; fallback/end music never overlap. |
| Cancellation | Muting Music and ambience stops it immediately; Skip, hide, Leave and rematch prevent every queued restart. |
| Administration | No historical-edit or statistic-reset action exists. PIN reset works; deletion anonymizes identity without changing other players' results. |
| Deletion | Profile details disappear, other results remain correct, old receipts cannot restore the profile or reassign its media. |

Extend existing `finish-prove`, `persist-prove`, `save-prove`, `rejoin-prove`, `proto-prove` and `takeover-prove` coverage where applicable.
Run `sounds-prove`, `hud-safe-area-prove`, typecheck and build for the corresponding runtime changes.
These are future completion tests. This design does not claim those features or proofs exist today.

## Resolved product decisions, 2026-10-17

1. **Counting:** completed online games starting with at least two humans, including guests. Only starting authenticated profiles receive records.
   Original bots receive no profile. Temporary bot assistance preserves human attribution; solo bot games, practice and hotseat are excluded.
2. **Statistics:** games, wins, losses, win rate, current streak and last played, plus per-game final-score history.
   Derive win rate from counted results. Keep sample size visible and show no percentage before the first counted game.
3. **Administration:** no editing past results and no raw statistic resets. Keep PIN reset and privacy-preserving profile deletion.

These decisions supersede the earlier Question: comments on #678.
Login plus PIN, self-service text editing, curated media, no uploads and no seed import remain settled.
