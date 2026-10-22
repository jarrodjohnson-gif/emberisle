# Mini games hub: draft mock

A clickable draft of the lobby "Play games" tab and the "While you wait" shelf. It is an input for Astra's whole-app review ([#903](https://github.com/jarrodjohnson-gif/emberisle/issues/903)) and the mini-games spec issue ([#929](https://github.com/jarrodjohnson-gif/emberisle/issues/929)). It is not the spec, and nothing should be built from it until Jarrod approves a direction.

Open `mock.html` in a browser. It is one self-contained file with a Phone 390x844 and Desktop 1280x720 toggle.

## Screens

- A: the closed "Play games" tab in the lobby.
- B: the shelf. Sandwich Stacker (solo), tic-tac-toe (with a table-mate), and a locked Trivia tile.
- C: Sandwich Stacker at the exact 580:320 stage. Muted by default, a Close button, held Left and Right buttons on phones.
- D: tic-tac-toe.
- E: the host presses Start, the game closes itself, and the table never waits.

## Recommendations for the five #929 questions

1. One shelf, one game open at a time.
2. A tab in the lobby card on phone and desktop. A side panel would cover the island, and a third chat tab breaks Chat C's two-tab rule.
3. Tic-tac-toe first. Trivia stays a locked tile until someone writes the questions.
4. Opens only on tap. Closed and muted by default.
5. No scores or leaderboards.

## Open choices for Jarrod

Tab and heading names; whether seats and chat hide while the tab is open; named-seat invite or "anyone"; Left and Right buttons on desktop; whether Ready also closes a box; whether to show the locked Trivia tile; what spectators get.

## Limits

Built from the lobby's real sizes and tokens, but not checked on screen. The app has one light theme, so the mock does too. The lobby is only a minimal frame.
