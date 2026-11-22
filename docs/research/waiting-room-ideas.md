# Waiting-room ideas: current work and open questions

Issue [#690](https://github.com/jarrodjohnson-gif/emberisle/issues/690) collects ideas for making the wait before a game more useful. It asks for small games, an optional image feed, lobby controls, and resilient reconnects. This note maps those ideas to existing work; it does not approve a new screen or game.

## Mini-games

The owner mentioned tic-tac-toe, Asteroids-like games, checkers, Wordle-like games, MiniClip and Cartoon Network Flash games. The proposed games must not interrupt the table: the lobby remains available and mini-games end when the real game starts.

| Candidate | What is already recorded | What remains to establish |
|---|---|---|
| Sandwich Stacker | The [Ruffle spike #928](https://github.com/jarrodjohnson-gif/emberisle/issues/928) and [lobby prototype #937](https://github.com/jarrodjohnson-gif/emberisle/issues/937) cover a supplied solo Flash game. The prototype is in [PR #970](https://github.com/jarrodjohnson-gif/emberisle/pull/970). | The accepted shelf puts it in a Play games tab. PR #970 is open. Public use requires replacing Disney characters; phone and audio acceptance remain. |
| Tic-tac-toe | The [mini-games shelf design #929](https://github.com/jarrodjohnson-gif/emberisle/issues/929) proposes a native two-player game. The [shelf pictures](../design/mini-games-shelf/README.md) show the accepted design. | The design was accepted and merged in [PR #1253](https://github.com/jarrodjohnson-gif/emberisle/pull/1253). Tic-tac-toe is not built; its host protocol work is tier 1. |
| Trivia | #929 lists native trivia as a possible later game. | Owner: who writes and maintains the trivia questions? |
| Checkers and a Wordle-like word game | Both were suggested on #690. | No specific game, rules, content, or implementation is approved there. A word game needs a word list and a checkers game needs a way for two players to participate. |
| Other Flash/browser games | #690 names examples and asks what is available. The #928 spike covers only the supplied Sandwich Stacker file. | Identify an actual game and permission to use and distribute it; test its controls, loading, and shutdown before treating it as a candidate. The spike is not evidence that other files work. |

#929 describes both a solo Flash prototype and native tic-tac-toe. Checkers and a word game remain suggestions. The accepted [shelf design](../design/mini-games-shelf/README.md) is not yet built.

## Other requests

- **Interactive island:** #690 asks to “Allow players to interact directly with the island” while waiting. It does not specify the interactions or their effect on the table. This needs a separate design before implementation.
- **Image feed:** #690 suggests lightweight images or memes in place of video. No feed or source is specified; the content source, permission to use it, and moderation need decisions.
- **Lobby controls:** the [README](../../README.md) and lobby code cover renaming, host-managed bots and Start. The lobby shows the Wayfarer rule; whether all requested game settings are accessible remains unchecked.
- **Reconnect and takeover:** the README documents seat rejoin and a host `GRACE_MS` default of 90 seconds for a dropped seat. #690 asks for takeover after 60 seconds away on a player's turn and one-click reclaim. The existing disconnected-seat behavior is not proof that this exact AFK request is met; define the intended trigger and reclaim experience separately.

The [design laws](../design/app-review/laws/design-laws.md#adding-something-new) say mini-games are optional while waiting. The real table's readiness and start flow must not depend on a waiting-room activity.
