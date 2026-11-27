import { useGame } from "@/lib/game/store";

// #1609: the seats Play with bots and Pass and play deal. Five or six take the expanded island with paired turns.
export function SeatChoice() {
  const count = useGame((s) => (s.seatCount === 5 || s.seatCount === 6 ? s.seatCount : 4));
  return <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
    Seats<select aria-label="Seats" value={count} onChange={(e) => {
      const n = Number(e.target.value);
      useGame.setState({ seatCount: n === 5 || n === 6 ? n : 4 });
    }} className="h-11 min-w-32 rounded-control border bg-surface px-2 text-fg">
      {[4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  </label>;
}

// #1156: how an online table opened here lays its number tokens. Fixed when the table opens, like the wayfarer.
export function NumberChoice() {
  const value = useGame((s) => s.numberTokensChoice);
  return <>
    <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
      Online numbers<select aria-label="Online number tokens" aria-describedby="number-tokens-help" value={value} onChange={(e) => useGame.getState().setNumberTokensChoice(e.target.value === "random" ? "random" : "official")} className="h-11 min-w-32 rounded-control border bg-surface px-2 text-fg">
        <option value="official">Official spiral</option><option value="random">Random</option>
      </select>
    </label>
    <p id="number-tokens-help" className="py-2 text-xs text-muted">Official spiral lays the numbers in the printed order. Random shuffles them, and no 6 or 8 touch.</p>
  </>;
}
