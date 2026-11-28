# Title profile bootstrap: how a fresh title load learns the signed-in profile (#1921, for #1352)

Spec only, 2026-11-28, by claude-opus-a (Claude Opus 5.5).
Source lines are on main `b0bf081b68d6ff1faf5f03f2a52933c7bbb448a6`.
This doc changes no `src/` or `server/` file.

It settles six things for #1352, the signed-in profile chip on the title:

1. how a fresh title load learns who is signed in;
2. each chip state, with its trigger, words and source line;
3. host scope;
4. guest play;
5. bundle cost, measured;
6. #1352's files and completion test.

Open questions for Jarrod are in [Open questions](#open-questions-for-jarrod).

## Sources

- `docs/research/title-profile-chip.md`, "Reload gap".
- `docs/design/profiles.md`, host-scoped credentials (lines 122-131) and surfaces (lines 290-304).
- `docs/design/app-review/final/README.md:23`: signed-in players see a chip in place of the name field.
- Desk answer on #1352 ([6940913972](https://github.com/jarrodjohnson-gif/emberisle/issues/1352#issuecomment-6940913972)): no eager profile-client import until its cost is measured.
- Owner answer `q766-profile-sheet`, A ([#766 comment 6699262824](https://github.com/jarrodjohnson-gif/emberisle/issues/766#issuecomment-6699262824)).
  The guest entry is the ghost "Profile" button.
  A remembered profile resumes only when the player presses "Continue with remembered profile".
- `docs/DECISIONS.md:12` (2026-11-28): a Fable 5.2 look check decides look questions.
  Claude Opus 5.5 in the project dispatch thread moves size ceilings and allowances, with a reason in the PR (AGENTS.md rule 13).

## How it works today

| Fact | Source |
|---|---|
| The store starts with no profile client. | `src/lib/game/store.ts:391`, `:665` |
| The Profile sheet owns the only client, one per page, in module scope. | `src/components/game/ProfileSheet.tsx:54-55` |
| The sheet creates it for the page's host on first open. | `src/components/game/ProfileSheet.tsx:74` |
| On mount the sheet gives the store the client and calls `check()`. | `src/components/game/ProfileSheet.tsx:95-97` |
| `check()` connects and sends `profileHello`, never a credential. | `src/lib/net/profiles.ts:268`, `:162-170` |
| The sheet reads the remembered key itself, with no network. | `src/components/game/ProfileSheet.tsx:237-238` |
| "Continue with remembered profile" is the only path to `profileResume`. | `src/components/game/ProfileSheet.tsx:260-264`; `src/lib/net/profiles.ts:271-279` |
| The remembered record holds a credential and expiry, but no name or colour. | `src/lib/net/profiles.ts:202` |
| The ghost "Profile" button sits inside the closed "Your seat" settings. | `src/components/game/EmberisleApp.tsx:429-446` |
| The sheet chunk loads only when Profile is pointed at, focused or pressed. | `src/components/game/chunks.ts:30-32`; `EmberisleApp.tsx:443` |
| Host and Join attach a credential only at the moment of sending. | `src/lib/net/table.ts:489-493`; `src/lib/game/store.ts:1303` |
| A proof asserts that no `profileResume` leaves before the press. | `scripts/profiles-ui-prove.mjs:310` |

So a fresh title load knows nothing about the profile.
The remembered key says only "this device kept a credential for this host".
It is not a verified identity, and it holds no display name.
Only a `profileSession` reply carries the identity (`src/lib/net/profiles.ts:207-218`).

## Bootstrap options

### A. Learn at the press (recommended)

- A fresh load sends nothing and shows today's title.
- The player opens Profile and presses "Continue with remembered profile", or signs in.
- The `profileSession` reply sets the chip. The chip then stays for the life of the page.
- The sheet's client moves its profile into a small store field through a subscription in the sheet's chunk.
  The subscription outlives the sheet, so closing the sheet keeps the chip.

Trade-offs:

- It keeps owner answer `q766-profile-sheet` A and `profiles.md:129` ("Display that host before sending credentials").
- `scripts/profiles-ui-prove.mjs:310` stays as it is.
- It adds no network and no credential traffic on load.
- A reload shows the guest title again until the player presses Continue.
  This is what #1352's "Reload gap" means: under the owner's rule, a fresh load cannot know the identity.

### A+. Learn at the press, with a remembered hint

- Option A, plus one line on a fresh load when this host's remembered key exists.
- Proposed words: "Continue with remembered profile", the same as the sheet's button.
- The hint opens the sheet. The sheet shows the host, and the player presses Continue there.
- The key check is the same read the sheet already makes (`ProfileSheet.tsx:238`). It sends nothing.

Trade-offs:

- It changes what a guest with a remembered credential sees on the title. Item 4 says guest play stays exactly as it is.
- It adds a 44 px row to the title card. In #766 a row button clipped the sound toggle at 1280x500 ([comment 6698951292](https://github.com/jarrodjohnson-gif/emberisle/issues/766#issuecomment-6698951292)).
- The hint can be stale. An expired or revoked credential shows the hint until a resume fails.
  The failed resume removes the key (`src/lib/net/profiles.ts:275-276`, `:226-229`).

### B. Resume on load

- When this host's remembered key exists, the title loads the client and sends `profileResume` on its own.
- The chip shows a loading state, then the profile or the guest title.

Trade-offs:

- It reverses owner answer `q766-profile-sheet` A. Only Jarrod can do that.
- It sends a credential before the player sees the host, against `profiles.md:129`.
- It breaks `scripts/profiles-ui-prove.mjs:310`. That line could only be replaced in its own commit, with Jarrod's approval (AGENTS.md rule 13).
- Each load spends one of 20 auth requests per minute per address (`server/profile-protocol.mjs:30`, `:125`).
- It costs about 230 B in `index` when lazy, or about 3,000 B when eager (see [Bundle cost](#bundle-cost)).

### C. Keep the name on the device

- Save the display name and colour beside the remembered credential.
- A fresh load shows them at once, unverified. A later resume confirms them.

Trade-offs:

- It stores player data on the device, outside the credential record. Player data is Jarrod's call.
- Anyone using the device sees the name before any check. Today nothing shows until the press.
- A rename or sign-out on another device leaves a stale name until the next resume.
- Its bundle cost is close to option A+ (the same key read, plus a JSON parse).

**Recommendation: A.** It needs no owner change, keeps guest play exactly as it is, and keeps the profile client out of `index`.
A+, B and C each need Jarrod: A+ changes the guest title, B reverses his answer, and C stores player data.

## Chip states

The words are proposals. The look of each state is left to a Fable 5.2 look check on #1352's PR (`docs/DECISIONS.md:12`).
"Chip" means the button that replaces the "Your seat" settings while a profile is signed in.

| State | Trigger | Words | Source line it relies on |
|---|---|---|---|
| Signed out, fresh load (guest) | Any fresh load under option A. | No chip. "Your seat" and the ghost "Profile" stay as today. | `EmberisleApp.tsx:429-446`; `store.ts:665` |
| Loading | The player pressed Continue or Sign in in the sheet. | No chip yet. The sheet shows "Checking this host…" while it connects and sets `aria-busy`. | `ProfileSheet.tsx:227`, `:333`; `profiles.ts:141` |
| Loading, option B only | A fresh load with a remembered key. | "Checking your profile…" | `profiles.ts:271-279` (the resume it waits on) |
| Signed in | A `profileSession` reply: create, sign in, resume or recovery. | The colour dot and the display name. Accessible name: "Signed in as {name}. Open Profile." | `profiles.ts:207-218`; `ProfileSheet.tsx:200-201` ("Signed in as") |
| Signed in, temporary PIN | The profile carries `pinMustChange`. | "{name}: Change your PIN" | `profiles.ts:215`, `:299`, `:61`; `ProfileSheet.tsx:118` |
| Offline or host unavailable | The profile socket drops after sign-in. The host cuts sockets that miss a ping. | "{name}: Offline. You can still play as a guest." | `profiles.ts:179-186`, `:299`; `server/host.mjs:132-134`, `:2535-2544`; `ProfileSheet.tsx:60` |
| Host not offering profiles | `profileHello` says unavailable, or the link is not HTTPS. | No chip. The sheet shows "Profiles unavailable on this host." or "Profiles need the HTTPS link. You can still play as a guest." | `profiles.ts:136`, `:167-173`; `ProfileSheet.tsx:58-63`; `profiles.md:304` |
| Host change | The page loads with a different `?host=`. | No chip until the player signs in on that host. The sheet shows "Host: {url}". | `table.ts:270-278`; `profiles.ts:73`; `ProfileSheet.tsx:327` |
| Sign-out | "Sign out" in the sheet. | No chip. "Your seat" comes back. The sheet's "Signed out" text is not shown on the title. | `ProfileSheet.tsx:216`; `profiles.ts:288-296`, `:97` |
| Signed out elsewhere | Any request answers `signedOut` (another device changed the PIN, or the credential expired). | No chip. The sheet shows "Signed out on this device. Sign in again." | `profiles.ts:226-229`, `:244`, `:57` |
| Profile edit | Edit profile saves a new name or colour. | The chip shows the new name and colour. | `profiles.ts:280`, `:214-217` |

### Gap found: a dropped profile socket makes the next seat a guest

- After a drop, the client keeps `profile` but sets `status: "offline"` (`profiles.ts:179-186`).
- `credentialForHost` then returns null (`profiles.ts:299`), so Host and Join send no credential (`table.ts:492`).
- `profiles.ts:40` says to call `check()` before open or join after a drop.
  Nothing outside the sheet calls it: `check()` runs only at `ProfileSheet.tsx:97`.
- So a signed-in player whose phone slept can sit down as a guest, with no word.
- This is on main today, without the chip. It was found by reading the code; no browser run reproduced it.
- Recommendation: the planner files it as its own bug. Host and Join call `check()` first.
  #1352 only shows the Offline state truthfully.

## Host scope

A host change never sends one host's credential to another. Each guard is already on main:

- The remembered key is per normalized host: `emberisle-profile:{host}` (`profiles.ts:68-73`).
- The page's host is read once, from `?host=` or the page origin (`table.ts:270-278`; `ProfileSheet.tsx:74`).
- No title code changes `?host=` in place. `history.replaceState` touches only `code` and `watch` (`EmberisleApp.tsx:123-128`; `src/lib/lazy.ts:170-178`).
  So a host change is always a fresh load, with a fresh client.
- Resume refuses a saved record whose `host` differs (`profiles.ts:275`).
- `credentialForHost` returns the credential only for its own confirmed host (`profiles.ts:297-301`).
- `selectHost` resets the session on a change (`profiles.ts:261-267`). It has no caller on main.

#1352 must keep all of this:

- The chip reads only the store field. It never reads storage or a credential.
- The store field holds the display name and colour only. No credential, login or profile ID goes in it.
- No remembered key for one host is read on a page for another host.

## Guest play

- A guest's title stays exactly as it is under option A.
- The ghost "Profile" button stays inside "Your seat" (`EmberisleApp.tsx:443-445`).
  Owner answer A names it "the settings row". The pictures he approved on PR #1355 show it inside "Your seat", which is what main builds.
- Under option A, no new element shows for a guest, with or without a remembered key.
- Guest Host and Join stay unchanged: with no profile, `credentialForHost` is never asked (`table.ts:492`; `store.ts:1303`).
- Sign-out returns the player to the guest title, with "Your seat" and its Profile button.

## Bundle cost

Built on main `b0bf081b68d6ff1faf5f03f2a52933c7bbb448a6` with `npm run build`, Node v22.23.5.
Sizes are gzip bytes, measured the way `scripts/size-prove.mjs:177-192` measures them.
Each option was built twice from a clean tree. Two builds of one source differ by up to 13 B.

The limits for `index`:

- ceiling 128,250 B (`scripts/size-prove.mjs:43`). The issue's 128,000 B was raised on 2026-11-27 (`:42`).
- growth allowance 400 B (`scripts/size-prove.mjs:158`).
- main's `index` is 128,238 B and 128,243 B, so the ceiling has 7 to 12 B of room.

| Option built | `index` (two builds) | `index` delta | Other chunks | Inside allowance | Inside ceiling |
|---|---|---|---|---|---|
| main (base) | 128,243 / 128,238 | 0 | `ProfileSheet` 5,909 / 5,911 | — | yes |
| A: chip in `index`, from the store field | 128,299 / 128,289 | +46 to +61 | `ProfileSheet` 5,963 / 5,964 | yes | no, 39 to 49 B over |
| A, chip in its own lazy `ProfileChip` chunk | 128,279 / 128,292 | +36 to +54 | `ProfileChip` 474 / 473 (new); `ProfileSheet` 5,961 / 5,965 | yes | no, 29 to 42 B over |
| A+: hint key read inlined in `index` | 128,454 / 128,442 | +199 to +216 | `ProfileSheet` 5,959 / 5,963 | yes | no |
| A+: hint importing `hostUrl` and `profileStorageKey` into `index` | 132,978 / 132,975 | +4,732 to +4,740 | `table` chunk gone (merged into `index`); `ProfileSheet` 3,432 / 3,430 | no | no |
| A+: lazy `ProfileChip` importing `hostUrl` and `profileStorageKey` | 128,321 / 128,332 | +78 to +94 | `ProfileChip` 423 (new); `profiles` 2,924 (new, loaded on every title); `ProfileSheet` 3,464 / 3,465 | yes | no |
| B, lazy: A+ plus a resume through the `ProfileSheet` chunk | 128,467 / 128,470 | +224 to +232 | `ProfileSheet` 6,003 / 6,004, over its 6,000 B ceiling | yes | no |
| B, eager: A+ plus `createProfileClient` imported into `index` | 131,242 / 131,248 | +2,999 to +3,010 | `ProfileSheet` 3,446 / 3,448 | no | no |

What each prototype changed:

- **A, chip in `index`.** `store.ts` gains `profileChip: { displayName; color } | null`, starting null.
  `ProfileSheet.tsx` creates its client through a `boot()`. It subscribes once and copies the display name and colour into `profileChip`.
  `EmberisleApp.tsx` renders a ghost button (dot and name) that opens the sheet, and hides "Your seat" while `profileChip` is set.
- **A, lazy `ProfileChip`.** The same, with the chip button moved into `src/components/game/ProfileChip.tsx`, picked in `chunks.ts` and mounted in a `LazyBoundary`.
- **A+ rows.** Option A plus `useState(() => localStorage.getItem(key) !== null)` and the hint button.
  "Inlined" derives the key in a 4-line helper. The import rows use `hostUrl` from `table.ts` and `profileStorageKey` from `profiles.ts`.
- **B, lazy.** `ProfileSheet.tsx` exports `resumeRemembered()`, which calls `confirmHost` and `resume()`.
  The title calls `profileSheet.load().then((m) => m.resumeRemembered())` when the key exists.
- **B, eager.** The title imports `createProfileClient` and runs the same resume itself.

What the numbers say:

- Every option breaks the `index` ceiling, because main has about 10 B of room.
- Only option A, in either form, stays near 50 B. It keeps the profile client out of `index`.
- Importing `hostUrl` or `profileStorageKey` from their modules into `index` pulls in the whole `table` chunk or the profile client.
- Eager B costs about 3,000 B, more than seven times the allowance.

Size call needed in #1352's PR: the project dispatch thread (Claude Opus 5.5) makes it under `docs/DECISIONS.md:12`.
Recommendation: raise the `index` ceiling by 100 B, to 128,350 B, with #1352's measured bytes.
The other way is a trim of about 50 B elsewhere in `index`.
The 400 B allowance does not move.

## #1352: files

For option A, chip in `index` (the smaller of the two A forms in files and chunks):

| File | Change |
|---|---|
| `src/lib/game/store.ts` | Add `profileChip: { displayName: string; color: string; pinMustChange: boolean; offline: boolean } \| null` beside `profile` (`:391`), null at `:665`. Only the title chip reads it. |
| `src/components/game/ProfileSheet.tsx` | Create the client in one place (`:74`). Subscribe once, in module scope. Copy `displayName`, `color`, `pinMustChange` and `status !== "available"` into `profileChip`. Never copy a credential, login or ID. |
| `src/components/game/EmberisleApp.tsx` | While `profileChip` is set, render the chip in place of "Your seat" (`:429-446`). The chip opens the sheet like the Profile button (`:443`), with prefetch on pointer and focus. |
| `scripts/size-prove.mjs` | Only with the size call above: the `index` ceiling and its dated comment. |
| `scripts/profiles-ui-prove.mjs` | New sections appended. Existing assertions untouched, including `:310`. |
| `scripts/title-prove.mjs` | New sections appended for the chip at its four sizes. |
| `docs/proofs/1352/` | Screenshots for the look check. |

If #1352 takes the lazy `ProfileChip` form, it also adds `src/components/game/ProfileChip.tsx`, a line in `src/components/game/chunks.ts`, a new ceiling in `scripts/size-prove.mjs` and the chunk in `scripts/fixtures/size/*.json`.

No `server/` file and no `src/lib/net/` file changes.
The dropped-socket gap is a separate bug, not #1352.

## #1352: completion test

Extend `profiles-ui-prove` and `title-prove`. Run both against the real local host.
Check every item at 390x844, 844x390, 1280x720 and 1280x500:

1. A fresh load with a remembered profile sends no profile frame before any press. The title looks as a guest's does.
2. Sign in, or press "Continue with remembered profile". Close the sheet. The chip shows the display name and colour dot.
3. The chip is at least 44 px tall and wide. Nothing on the title card is clipped, at all four sizes.
4. The chip opens the Profile sheet. Closing the sheet returns focus to the chip.
5. Edit profile with a new name and colour. The chip shows both after the sheet closes.
6. Sign out. The chip is gone, and "Your seat" with its Profile button is back.
7. Reload after signing in. The guest title shows again, with no chip.
8. Load the page with another `?host=`. No chip shows, and no frame to that host carries the first host's credential.
9. A temporary PIN (local reset) shows "{name}: Change your PIN" on the chip.
10. Stop the profile socket after sign-in. The chip shows "{name}: Offline. You can still play as a guest."
11. A guest's title is unchanged: same controls, same order, same Profile button.
12. Existing assertions and the zero-console-error checks still pass.

Then get the Fable 5.2 look check on the chip states at 440x956 and 956x440, and at the four sizes above.

## Open questions for Jarrod

1. **Bootstrap.** May a fresh title load learn the profile only at the player's press (option A)?
   The other options are a remembered hint (A+), resume on load (B), or a saved name on the device (C).
   Recommendation: A. A+ changes the guest title, B reverses your `q766-profile-sheet` answer, and C stores player data on the device.
2. **Seat name and colour while signed in.** The chip replaces "Your seat", so its name field and colours hide.
   The seat still takes the stored typed name and colour (`store.ts:1303`; `server/host.mjs:1554`).
   Options: (a) the seat takes the profile's display name and favourite colour; (b) the seat keeps the typed name and colour; (c) keep "Your seat" open beside the chip.
   Recommendation: (a). The chip shows one name, so the seat should use it.
