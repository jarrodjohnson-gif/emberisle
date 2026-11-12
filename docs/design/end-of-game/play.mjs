// End of game and game log design: play one whole practice game (Ember and three bots) with the real rules and the real
// bot brain. The dice are the real dice, so each run is a different game; capture.mjs saves the one it pictured in game.json.
import { createGame } from "../../../src/lib/game/board.ts";
import { applyAction } from "../../../src/lib/game/rules.ts";
import { chooseBotAction } from "../../../src/lib/game/ai.ts";

// Returns the finished game and the game as it stood `back` log lines of play before the end (a mid-game table).
export function play(seed) {
  let s = createGame({ humans: [{ name: "Ember" }], bots: 3, seed });
  let mid = null;
  for (let step = 0; s.phase !== "over"; step++) {
    if (step > 20000) throw new Error("game did not end");
    const pid = s.phase === "discard" ? Object.keys(s.discardNeeded)[0] : s.current;
    const r = applyAction(s, pid, chooseBotAction(s, pid));
    if (r.error) throw new Error(`${pid}: ${r.error}`);
    s = r.state;
    if (!mid && s.turn >= 30 && s.phase === "main" && s.current === "p0") mid = structuredClone(s);
  }
  return { over: s, mid };
}
