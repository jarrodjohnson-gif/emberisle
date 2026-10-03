// #322: the two dice as faces with pips. The whole row is one image to a screen reader, so it hears
// "Rolled 3 and 4, 7" once instead of three bare numbers.

// Cells of a 3x3 grid, row by row from the top left, that hold a pip for each face.
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value }: { value: number }) {
  return (
    <span
      data-testid="die"
      data-value={value}
      className="grid size-9 grid-cols-3 grid-rows-3 place-items-center rounded-[8px] bg-fg p-1 text-bg motion-safe:animate-[die-settle_150ms_ease-out]"
    >
      {PIPS[value].map((cell) => (
        <span
          key={cell}
          data-pip
          className="size-1.5 rounded-full bg-current"
          style={{ gridRow: Math.floor(cell / 3) + 1, gridColumn: (cell % 3) + 1 }}
        />
      ))}
    </span>
  );
}

export function Dice({ values: [a, b] }: { values: [number, number] }) {
  return (
    <div role="img" aria-label={`Rolled ${a} and ${b}, ${a + b}`} className="flex items-center gap-2 text-sm text-zinc-600">
      {/* Keyed by the roll so a new roll remounts the faces and settles again. */}
      <Die key={`a${a}${b}`} value={a} />
      <Die key={`b${a}${b}`} value={b} />
      <span className="tabular-nums">{a + b}</span>
    </div>
  );
}
