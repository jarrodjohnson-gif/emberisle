import { RESOURCE_ICON, RESOURCE_PAINT } from "@/components/game/Hand";
import { RESOURCE_LABEL, type Resource } from "@/lib/game/types";

// Static setup diagrams (#749). Each is decorative to a screen reader; its figcaption carries the same facts as text.
const figure = "rounded-card border border-black/10 bg-[var(--ground)] p-3 text-[var(--ink)]";
const caption = "mt-2 text-caption text-[var(--muted)]";

function Seat({ n }: { n: number }) {
  return (
    <span className="inline-flex size-7 items-center justify-center rounded-full border border-[var(--control-line)] bg-[var(--paper)] text-caption font-semibold tabular-nums">
      {n}
    </span>
  );
}

function SeatRow({ label, seats }: { label: string; seats: number[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-caption text-[var(--muted)]">{label}</span>
      {seats.map((n, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-[var(--muted)]">{"\u2192"}</span>}
          <Seat n={n} />
        </span>
      ))}
    </div>
  );
}

function OrderDiagram() {
  return (
    <figure className={figure}>
      <div aria-hidden className="space-y-2">
        <SeatRow label="Out" seats={[1, 2, 3, 4]} />
        <SeatRow label="Back" seats={[4, 3, 2, 1]} />
      </div>
      <figcaption className={caption}>
        Example for a four-seat table: seats place 1, 2, 3, 4, then 4, 3, 2, 1, so seat 4 places twice in a row. A three-seat table runs 1, 2, 3, then 3, 2, 1. Seat 1 is the first to place.
      </figcaption>
    </figure>
  );
}

function PlacementDiagram() {
  const ink = "var(--ink)";
  return (
    <figure className={figure}>
      <svg aria-hidden viewBox="0 0 220 64" className="mx-auto h-16 w-full max-w-[260px]">
        <line x1="62" y1="32" x2="158" y2="32" stroke={ink} strokeWidth="7" strokeLinecap="round" />
        <circle cx="158" cy="32" r="4" fill="var(--paper)" stroke={ink} strokeWidth="1.5" />
        <path d="M62 17 L74 26 V42 H50 V26 Z" fill="var(--paper)" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
        <text x="62" y="58" textAnchor="middle" fontSize="11" fill={ink}>Outpost</text>
        <text x="112" y="24" textAnchor="middle" fontSize="11" fill={ink}>Path</text>
      </svg>
      <figcaption className={caption}>
        One placement: an outpost on a corner, then a path that starts at that outpost. The path runs along an edge to the next corner.
      </figcaption>
    </figure>
  );
}

// Three hexes meet at the outpost: wood, wheat and the wastes. Corner P, hex radius R, hex centres 120 degrees apart.
const P = { x: 110, y: 76 };
const R = 36;
function hexAt(cx: number, cy: number) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = ((30 + 60 * k) * Math.PI) / 180;
    return `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}
const EXAMPLE_HEXES: { cx: number; cy: number; resource: Resource | null }[] = [
  { cx: P.x - R * Math.cos(Math.PI / 6), cy: P.y - R / 2, resource: "timber" },
  { cx: P.x + R * Math.cos(Math.PI / 6), cy: P.y - R / 2, resource: "grain" },
  { cx: P.x, cy: P.y + R, resource: null },
];

function GoodsDiagram() {
  return (
    <figure className={figure}>
      <svg aria-hidden viewBox="0 0 220 160" className="mx-auto h-40 w-full max-w-[260px]">
        {EXAMPLE_HEXES.map(({ cx, cy, resource }, i) => {
          const Icon = resource ? RESOURCE_ICON[resource] : null;
          const on = resource ? `var(--${resource}-on)` : "var(--ink)";
          return (
            <g key={i}>
              <polygon points={hexAt(cx, cy)} style={{ fill: resource ? `var(--${resource})` : "var(--waste)" }} stroke="var(--paper)" strokeWidth="2" strokeLinejoin="round" />
              {Icon && <Icon x={cx - 8} y={cy - 17} width={16} height={16} style={{ color: on }} />}
              <text x={cx} y={cy + (Icon ? 10 : 4)} textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: on }}>
                {resource ? RESOURCE_LABEL[resource] : "Wastes"}
              </text>
            </g>
          );
        })}
        <path d={`M${P.x} ${P.y - 11} L${P.x + 9} ${P.y - 4} V${P.y + 7} H${P.x - 9} V${P.y - 4} Z`} fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div aria-hidden className="mt-1 flex items-center justify-center gap-2 text-caption font-semibold">
        {(["timber", "grain"] as const).map((r) => {
          const Icon = RESOURCE_ICON[r];
          return (
            <span key={r} className={`inline-flex h-6 items-center gap-1 rounded-[6px] px-1.5 ring-1 ring-inset ring-black/10 ${RESOURCE_PAINT[r]}`}>
              <Icon className="size-3.5" />
              1
            </span>
          );
        })}
        <span className="text-[var(--muted)]">Wastes: 0</span>
      </div>
      <figcaption className={caption}>
        Example: a second outpost touching a wood hex, a wheat hex and the wastes pays 1 wood and 1 wheat. The wastes pay nothing.
      </figcaption>
    </figure>
  );
}

export function SetupReference() {
  return (
          <section aria-labelledby="howto-setup" className="space-y-3 border-t border-black/10 pt-4">
            <h3 id="howto-setup" className="font-display text-lg text-[var(--ink)]">Setting up</h3>
            <p>Before anyone places, each player rolls one die. The highest roll places first. If players tie for the highest roll, only they roll again. The others follow by their dice, highest first. That order holds for setup and every turn after. In a rematch, the last winner places first and the others roll for the rest.</p>
            <p>Setup goes through the order once, then back through it in reverse.</p>
            <OrderDiagram />
            <p>Each placement is one outpost and one path from it.</p>
            <PlacementDiagram />
            <p>Only your second outpost pays starting goods. Your first pays nothing. The second pays one card for each hex it touches that makes goods. The wastes pay nothing.</p>
            <GoodsDiagram />
          </section>
  );
}
