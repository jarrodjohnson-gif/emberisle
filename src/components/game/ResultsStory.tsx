// #1452 and #1453: the results screen's island award and dice strip, one lazy chunk (chunks.ts) that the win screen
// fetches as the table starts. Both read only the finished game (docs/design/results-awards-dice/README.md).
import { chance, diceLine, islandAwards } from "@/lib/game/story";
import { useGame } from "@/lib/game/store";

// One player's title. In the touch list's opened row it is a chip (styles.css draws its award icon) with the fact beside it; under a name in the desktop
// table (`line`) it is one muted line. A winner with no title left gets nothing.
export function Award({ id, line }: { id: string; line?: boolean }) {
  const a = islandAwards(useGame((s) => s.state)!)[id];
  if (!a) return null;
  return line ? (
    <span data-testid="win-award" className="win-award-line">
      {a.title} · {a.fact}
    </span>
  ) : (
    <p data-testid="win-award" className="win-award">
      <span className="win-award-chip">{a.title}</span>
      {a.fact}
    </p>
  );
}

const W = 330;
const H = 44;
const BAR = 22;
const x = (i: number) => i * (BAR + (W - 11 * BAR) / 10);

// How often each sum came up, with a dashed line for the odds and one sentence. No count kept or no rolls: no strip.
export function DiceStrip() {
  const sums = useGame((s) => s.state?.rollSums);
  const d = diceLine(sums);
  if (!sums || !d) return null;
  const odds = sums.map((_, i) => d.total * chance(i + 2));
  const top = Math.max(...sums, ...odds);
  return (
    <figure data-testid="win-dice" className="win-dice">
      <figcaption>
        <span>Dice this game</span>
        <span>{d.total} roll{d.total === 1 ? "" : "s"}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label="How often each sum from 2 to 12 came up, beside the odds">
        {sums.map((k, i) => {
          const h = Math.max(1, (k / top) * H);
          return <rect key={i} className={d.sum === i + 2 ? "hot" : undefined} x={x(i)} y={H - h} width={BAR} height={h} rx="3" />;
        })}
        <polyline points={odds.map((e, i) => `${x(i) + BAR / 2},${H - (e / top) * H}`).join(" ")} />
        {sums.map((_, i) => (
          <text key={i} x={x(i) + BAR / 2} y={H + 12}>
            {i + 2}
          </text>
        ))}
      </svg>
      <p data-testid="win-dice-line">{d.line}</p>
    </figure>
  );
}
