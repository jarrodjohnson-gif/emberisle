// #1429: the desktop dock as drawn in docs/design/desktop-dock-1274, for a wide screen with a mouse (useViewport().dock).
// One 672 x 176 box with fixed slots: the hand, the turn line over one 44 px slot (the dice; an offer's Yes and No cover
// both), the seven controls and the meta line. Every slot holds the same rectangle in every phase; Hud.tsx fills them.
import type { ReactNode } from "react";
import "./desktop-dock.css";

export function DesktopDock({ hand, turn, aside, trade, controls, meta }: { hand: ReactNode; turn: ReactNode; aside: ReactNode; trade: ReactNode; controls: ReactNode; meta: ReactNode }) {
  return (
    <section data-hud-stack data-testid="desktop-dock" aria-label="Your dock" className="desk-dock pointer-events-auto">
      <div data-slot="hand" className="desk-hand">{hand}</div>
      <div data-slot="side" className="desk-side">
        {turn}
        <div data-slot="aside" className="desk-aside">{aside}</div>
        {trade}
      </div>
      <div data-slot="controls" className="desk-controls action-utilities">{controls}</div>
      <div data-slot="meta" className="desk-meta">{meta}</div>
    </section>
  );
}
