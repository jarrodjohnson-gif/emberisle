import { useLayoutEffect, useState } from 'react';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { ClaySymbol, GrainSymbol, OreSymbol, TimberSymbol, WoolSymbol } from '@/components/game/ResourceSymbols';
import { publicSeatChanges, type SeatChange } from '@/components/game/seat-public-gains';
import { useGame } from '@/lib/game/store';
import { RESOURCES, RESOURCE_LABEL } from '@/lib/game/types';
import './seat-public-gains.css';

const SYMBOLS = { timber: TimberSymbol, clay: ClaySymbol, wool: WoolSymbol, grain: GrainSymbol, ore: OreSymbol };
// The goods-cue fade is 3 s. The seat cue still clears at 2.5 s, which is what #827 and the proof require.
const HOLD_MS = 2500;

// Shared transient state survives switching between the rail and strip during rotation.
// It contains only public deltas, holds at most one cue per player, and expires each after 2.5 seconds.
const useCues = create<{ changes: SeatChange[] }>(() => ({ changes: [] }));
const timers = new Map<string, ReturnType<typeof setTimeout>>();
useGame.subscribe((next, previous) => {
  if (next.synced !== previous.synced || next.code !== previous.code || next.localId !== previous.localId ||
      next.screen !== 'play' || next.mode !== 'online' || (next.state?.rolls ?? 0) < (previous.state?.rolls ?? 0)) {
    timers.forEach(clearTimeout);
    timers.clear();
    if (useCues.getState().changes.length) useCues.setState({ changes: [] });
    return;
  }
  if (!next.state || !previous.state || next.state === previous.state) return;
  const additions = publicSeatChanges(previous.state, next.state).filter(change => change.player !== next.localId);
  if (!additions.length) return;
  useCues.setState(({ changes }) => ({ changes: [...changes.filter(c => !additions.some(a => a.player === c.player)), ...additions] }));
  for (const change of additions) {
    clearTimeout(timers.get(change.player));
    timers.set(change.player, setTimeout(() => {
      timers.delete(change.player);
      useCues.setState(({ changes }) => ({ changes: changes.filter(row => row.player !== change.player) }));
    }, HOLD_MS));
  }
});

// Portals attach to existing seat boxes without changing card dimensions or the map hole. The group hangs outside the
// box as a tag tucked behind the seat's edge (under a strip seat, right of a rail seat: seat-public-gains.css), so it
// never covers the name or the score.
export function SeatPublicGains({ scope }: { scope: 'rail' | 'seat' }) {
  const changes = useCues(s => s.changes);
  const players = useGame(s => s.state?.players);
  const [mounted, setMounted] = useState(false);
  // A new rail/strip's anchors enter the DOM in this commit, after its initial render.
  useLayoutEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return changes.map(change => {
    const anchor = document.querySelector<HTMLElement>(`.seat-card[data-testid="${scope}-${change.player}"]`);
    if (!anchor) return null;
    const name = players?.find(p => p.id === change.player)?.name ?? '';
    // Gains on the left, losses on the right, at every seat (owner q1530-gain-finalists A).
    const active = RESOURCES.filter(r => change.goods[r]! > 0).concat(RESOURCES.filter(r => change.goods[r]! < 0));
    const label = active.map(r => `${change.goods[r]! > 0 ? '+' : '−'}${Math.abs(change.goods[r]!)} ${RESOURCE_LABEL[r]}`).join(', ');
    return createPortal(
      <span data-testid="seat-public-gains" data-player={change.player} data-scope={scope} role="status" aria-label={`${name}: ${label}`}
        className="seat-public-gains"
        // How far the tag reaches past the seat, so a chat bubble on this seat hangs clear of it (seat-public-gains.css).
        ref={el => { if (el) anchor.style.setProperty('--seat-cue-reach', `${scope === 'rail' ? el.offsetWidth : el.offsetHeight}px`); }}>
        {active.map(resource => {
          const n = change.goods[resource]!, Icon = SYMBOLS[resource];
          return <span key={resource} data-testid="seat-public-pill" data-sign={n > 0 ? '+' : '-'} data-resource={resource}
            className="seat-public-pill" aria-hidden="true">
            <Icon width={17} height={17} /><span>{n > 0 ? '+' : '−'}{Math.abs(n)}</span>
          </span>;
        })}
      </span>, anchor, `${scope}-${change.player}`,
    );
  });
}
