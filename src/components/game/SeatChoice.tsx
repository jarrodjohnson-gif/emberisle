import { useGame } from "@/lib/game/store";

// #1609: the seats Play with bots and Pass and play deal. Five or six take the expanded island with paired turns.
export function SeatChoice() {
  const count = useGame((s) => s.seatCount ?? 4);
  return <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
    Seats<select aria-label="Seats" value={count} onChange={e => useGame.setState({ seatCount: +e.target.value })} className="h-11 min-w-32 rounded-control border bg-surface px-2 text-fg">
      {[4, 5, 6].map(n => <option key={n}>{n}</option>)}
    </select>
  </label>;
}
