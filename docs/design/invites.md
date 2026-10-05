# Design: personal invites and player profiles (#466)

Design pass only, authorized by Jarrod on 2026-10-05. The defaults below are recommendations for review,
not shipped behavior or approval to implement. Follow [FRAMEWORK.md](../FRAMEWORK.md): implementation
and its proofs belong to tracker issues when this feature leaves Backlog.

## Existing behavior and fit

The [README](../../README.md#game-night) describes browser hosting, four-character table codes and
`?code=K7QP` join links; the friend opens the link and presses Join. The README's message contract
separately describes per-seat rejoin secrets, held seats and browser reload recovery. A personal
invite should select a familiar profile before that ordinary join flow. It grants neither a reserved
seat nor access to another player's held seat.

Use [polish.md](polish.md): warm stone surfaces, one primary action, profile colour only where it
conveys identity, 44 px targets and short copy. Profile settings live behind the table menu or Title
settings; they add no permanent board panel.

## Invite codes and claiming

Jarrod prepares a profile and chooses **Copy invite**. The primary share artifact is a link on the
actual public game origin, for example `https://<game>/#invite=<token>`. **Copy code** copies the same
token for someone who already has the page open. Invite lookup uses the page's own host, as in
[same-origin.md](same-origin.md). A new tunnel address needs a newly copied link.

An invite can optionally point at a planned game time and a table code. Store a specific timestamp
and timezone, such as `2026-10-10T19:00-04:00`, then show that timezone beside the countdown. “Saturday
evening” is a note for people, not a clock value. The countdown says when to meet; it does not create
the table, reserve a seat, or promise that the host is online. The ordinary table code continues to
identify the actual table.

| Recommendation | Exact behavior |
|---|---|
| Code | Cryptographically random, at least 128 bits; encode as 26 unambiguous Base32 characters. Accept case and separator differences. The existing four-character code remains the table locator. |
| Lifetime | One claim, expires seven days after creation. Display the expiry in Jarrod's profile settings; host time decides validity. |
| Preview | A valid code shows only that invite's display name, avatar, optional custom greeting and scheduled-time countdown, with **Use this profile** and quiet **Cancel**. Opening or previewing a link does not consume it. No profile directory or other players' details. |
| Claim | Consume atomically on confirmation and issue a new opaque profile credential to that browser. Two simultaneous confirmations yield one success. A repeat on the successful browser opens its saved profile; another browser gets **Invite already used. Ask Jarrod for a new one.** |
| Join | Claiming saves the profile but opens no seat. If a current table was included, show its ordinary Join action next. Full, started or closed tables retain their existing errors and leave the profile usable. |
| Reissue | A fresh code invalidates any pending code for that profile. For a claimed profile, explicitly choose **Move to another device**, invalidating its old profile credential on the new claim. |
| Revoke | **Revoke invite** disables an unclaimed code immediately. **Forget device** revokes a claimed profile credential for future profile use; neither silently ejects an active game seat. |
| Invalid code | Expired or revoked: **This invite is no longer available. Ask Jarrod for a new one.** No profile details. Rate-limit lookup and claim, and exclude tokens from logs. |

A code is a bearer invitation: anyone Jarrod forwards it to can claim it. This is suitable for the
private friend group, not verified identity. Keep invite digests and profile credentials on the host
outside room saves; they must survive a room ending and a host restart. Protect management with a
separate host-only credential or a local administrative tool; a player's game-night Host button
must not grant profile administration. Exact admin transport is an implementation design decision.

The fragment avoids putting the token in ordinary HTTP request paths. Resolve it without analytics,
remove it from the displayed URL after resolution, and never share a profile credential or rejoin
secret in a link. An interrupted claim retains its code only in page memory for retry; a lost success
response must be recoverable through the same claim attempt without issuing a second credential.

## Pre-built profiles

Jarrod can prepare each friend's name, character/avatar, preferred seat colour, one short custom
greeting, optional intro music, optional intro video or link, and optional personal Easter egg before
game night. Use generated initials if no picture is supplied. Sample
profiles use fictitious names; real pictures, nicknames, music and jokes need that friend's agreement.

| Field | Behavior |
|---|---|
| Profile id | Stable opaque id, independent of a room's seat/player id. It never authenticates a seat. |
| Display name | Existing host rules: strip controls, at most 16 characters, disambiguate duplicates at the table. Render as text. |
| Avatar | Approved, resized local asset served from the game origin; no third-party image fetches. A profile asset outlives room avatar cleanup. |
| Preferred colour | Preference only: an occupied colour offers the remaining palette without blocking the join. |
| Greeting | One plain-text line, rendered as text with control characters removed and a 160-character cap. It appears in the invite preview and at the player's arrival, never in place of ordinary join/readiness instructions. |
| Intro media | A small approved local audio/video asset or a user-activated external link. No arbitrary embed or auto-loaded third-party media. The receiving player can turn arrivals off. |
| Easter egg | Approved asset or presentation id from a fixed catalog; it accepts no executable content or arbitrary media URLs. |

The player confirms the profile and may edit their name, picture and colour in its settings. Jarrod
curates the shared intro/joke catalog; turning either off is always available to the player. Only the
display name, avatar and actual seat colour appear publicly. Credentials, invite state and preferences
do not travel in public seat lists, chat or spectator messages.

Remember the claimed profile separately from the existing seat-rejoin record. **Forget this profile**
clears its local credential without clearing a current seat secret. On a shared device, choosing a
different profile cannot claim an occupied seat or overwrite its recovery record. Clearing browser
data requires a new invite; no email, address book, real-name requirement or cross-device tracking.

[MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) is scoped to
origin, may be blocked and is cleared when private browsing ends. Show **Saved on this device** only
after storage succeeds; otherwise keep the profile for this page with **Not saved on this device**.
Changing tunnel origin does not automatically transfer the profile. Recommend a stable game address
before promising recognition across game nights.

## Walk-in intro music

This proposes a brief optional arrival cue for #466. [BUILD_BIBLE.md §7](../BUILD_BIBLE.md#7-sounds)
currently specifies dry, quiet table sounds, CC0 assets and no background music. There is no loop or
continuous soundtrack here. **Hear player intros** defaults off on each receiving device, is saved
locally where possible, and remains subordinate to the existing master speaker mute.

| Limit | Recommendation |
|---|---|
| Duration | Up to **4.0 seconds**, including a 100 ms fade in and 250 ms fade out; longer uploads are rejected for editing rather than silently trimmed. |
| Asset loudness | Normalize approved clips to at most **−18 LUFS integrated**, true peak at most **−3 dBTP**. These are digital mix limits, not a guarantee of physical speaker loudness. |
| Playback gain | Default **0.15**, hard ceiling **0.25** linear gain (at least 12 dB below the normalized asset); master mute stops an active clip immediately. A player cannot raise other devices' gain. |
| Frequency | Once for a profile's first successful lobby arrival per room; no replay on reload, reconnect, colour/name edit, rematch, bot takeover or spectators joining. |
| Priority | One intro at a time. Skip arrivals during another intro or a critical table cue, rather than queueing them. Stop when the game starts, when the page is hidden or when the listener leaves. |

Serve approved clips locally with the same CC0 provenance rule as table sounds. If no suitable clip
has been provided, use silence. No streaming provider embed or microphone permission. An optional
video is a local, muted visual with the same four-second ceiling; its link variant is a plain,
clearly labelled action and loads only after the listener taps it. It never blocks sitting down.

Browsers may block both media and Web Audio until a gesture; see the
[MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay). Enabling
intros should unlock audio in that click/tap handler, but playback can still be refused. At lobby
arrival, the cue is sent once to all seated listeners; each device plays it only when that listener
has enabled arrivals and has not muted the speaker. A visible **Skip intro** action stops it on that
device. A listener joining late skips the missed cue; never play a backlog after the next tap. A quiet
**Preview intro** action plays only for the person pressing it. Missing, failed or blocked media cannot
prevent joining or produce an error toast.

[Media element volume has browser limits](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/volume).
Enforce gain with the audio mixer and prepare quiet assets; if the client cannot enforce the ceiling,
skip the intro on that device. Verify the actual output path on iPhone Safari before release.

## Easter eggs

Keep them opt-in, cosmetic and personal. Suggested catalog: an alternate profile subtitle revealed
by pressing the avatar in profile settings, or a tiny illustration beside that profile's lobby arrival.
Give keyboard users the same named action; avoid secret gestures on controls used to play the game.

Each visual lasts at most 280 ms and follows polish's reduced-motion treatment: a static reveal,
no flashing, screen shake or extra loop. No board obstruction, added sound, hidden information,
changed dice, awards or resource effects. Personal jokes stay in profile settings unless their owner
explicitly enables sharing. **Hide surprises** suppresses them on the receiving device. Ordinary
join, readiness and turn instructions stay literal even when a joke is enabled.

## Review criteria for later implementation

The implementation proof should show one claim winning a race, refusal after expiry/revocation,
restart persistence, and profile administration refused to an ordinary table host. Joining a full
table must preserve a claimed profile, and profile changes must not bypass seat recovery. Exercise
blocked storage and a changed origin without losing an existing seat secret.

Browser checks should cover a phone and desktop: one primary action, keyboard operation and 44 px
targets; muted/locked/unsupported audio stays silent; a clip obeys duration and gain limits and never
replays after reconnect; Easter eggs respect local opt-out and reduced motion. These are acceptance
criteria for future code, not tests run or a build queue stored in this document.
