import { useGame } from "@/lib/game/store";

// #1156, owner answer B: the lobby header shows how the table lays its number tokens. The host flips it with a sliding
// switch (design: Fable 5.2, on PR #1866); every other seat and a watcher read the same two lines with no track.
export function NumbersSwitch() {
  const random = useGame(s => s.tableNumberTokens === "random");
  const isHost = useGame(s => s.seats.find(x => x.id === s.seatId)?.host ?? s.isHost);
  const text = <span className="lobby-numbers-text"><span>Numbers</span><b>{random ? "Random" : "Official spiral"}</b></span>;
  return isHost
    ? <button type="button" role="switch" aria-checked={random} aria-label="Random numbers" data-testid="lobby-numbers" className="lobby-numbers" onClick={() => useGame.getState().net?.ttt("setNumberTokens", { value: random ? "official" : "random" })}>{text}<span className="lobby-switch" aria-hidden="true" /></button>
    : <div data-testid="lobby-numbers" className="lobby-numbers" aria-live="polite">{text}</div>;
}
