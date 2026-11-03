# Waiting-room ideas: current work and open questions

Issue [#690](https://github.com/jarrodjohnson-gif/emberisle/issues/690) collects ideas for making the wait before a game more useful. It asks for small games, an optional image feed, lobby controls, and resilient reconnects. This note maps those ideas to existing work; it does not approve a new screen or game.

## Games while waiting

The owner mentioned tic-tac-toe, Asteroids-like games, checkers, Wordle-like games, MiniClip and Cartoon Network Flash games. The proposed games must not interrupt the table: the lobby remains available and a waiting game ends when the real game starts.

| Candidate | What is already recorded | What remains to establish |
|---|---|---|
| Sandwich Stacker | The [Ruffle spike #928](https://github.com/jarrodjohnson-gif/emberisle/issues/928) and [lobby prototype #937](https://github.com/jarrodjohnson-gif/emberisle/issues/937) cover a supplied solo Flash game. The prototype is in [PR #970](https://github.com/jarrodjohnson-gif/emberisle/pull/970). | The shelf's placement needs its own decision. The spike notes Disney characters would need replacing for a public game. Phone and audio acceptance are still needed. |
| Tic-tac-toe | The [mini-games shelf design #929](https://github.com/jarrodjohnson-gif/emberisle/issues/929) proposes a native two-player game. The [shelf pictures](../design/mini-games-shelf/README.md) show a draft. | The design needs acceptance; synchronized multiplayer requires its own scoped implementation and host protocol work. |
| Trivia | #929 lists native trivia as a possible later game. | Decide the source and maintenance of questions before specifying a build. |
| Checkers and a Wordle-like word game | Both were suggested on #690. | No specific game, rules, content, or implementation is approved there. A word game needs a word list and a checkers game needs a way for two players to participate. |
| Other Flash/browser games | #690 names examples and asks what is available. The #928 spike covers only the supplied Sandwich Stacker file. | Identify an actual game and permission to use and distribute it; test its controls, loading, and shutdown before treating it as a candidate. The spike is not evidence that other files work. |

A useful first comparison is the existing Sandwich Stacker prototype against native tic-tac-toe: they exercise the two paths already described in #929. Checkers and a word game are candidates for later scoping, not commitments. The [shelf design](../design/mini-games-shelf/README.md) is a proposal for owner review, not evidence that the shelf is live.

## Other requests

- **Interactive island:** #690 asks whether people can interact with the island while waiting. It does not specify the interactions or their effect on the table. This needs a separate design before implementation.
- **Image feed:** #690 suggests lightweight images or memes in place of video. No feed or source is specified; the content source, permission to use it, and moderation need decisions.
- **Lobby controls:** the repository's [README](../../README.md) describes lobby names, host-managed bots, readiness and start checks. Compare the current UI with the requested settings access before calling the whole control panel complete; #690 does not specify a layout.
- **Reconnect and takeover:** the README documents seat rejoin and a host `GRACE_MS` default of 90 seconds for a dropped seat. #690 asks for takeover after 60 seconds away on a player's turn and one-click reclaim. The existing disconnected-seat behavior is not proof that this exact AFK request is met; define the intended trigger and reclaim experience separately.

The mini-games and reconnect ideas should remain optional. The real table's readiness and start flow must not depend on a waiting-room activity.
