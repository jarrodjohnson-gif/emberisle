import { useLayoutEffect, useState } from 'react';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { ClaySymbol, GrainSymbol, OreSymbol, TimberSymbol, WoolSymbol } from '@/components/game/ResourceSymbols';
import { publicSeatChanges, type SeatChange } from '@/components/game/seat-public-gains';
import { useGame } from '@/lib/game/store';
import { RESOURCES, RESOURCE_LABEL } from '@/lib/game/types';

const SYMBOLS = { timber: TimberSymbol, clay: ClaySymbol, wool: WoolSymbol, grain: GrainSymbol, ore: OreSymbol };
const HOLD_MS = 2500;

// Shared transient state survives switching between the rail and strip during rotation.
// It contains only public deltas, holds at most one cue per player, and expires each after 2.5 seconds.
const useCues = create<{ changes: SeatChange[] }>(() => ({ changes: [] }));
const timers = new Map<string, ReturnType<typeof setTimeout>>();
useGame.subscribe((next, previous) => {
  if (next.synced !== previous.synced || next.code !== previous.code || next.localId !== previous.localId ||
      next.screen !== 'play' || next.mode !== 'online' || (next.state?.rolls ?? 0) < (previous.state?.rolls ?? 0)) {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    if (useCues.getState().changes.length) useCues.setState({ changes: [] });
    return;
  }
  if (!next.state || !previous.state || next.state === previous.state) return;
  const additions = publicSeatChanges(previous.state, next.state).filter(change => change.player !== next.localId);
  if (!additions.length) return;
  useCues.setState(({ changes }) => ({ changes: [...changes.filter(change => !additions.some(addition => addition.player === change.player)), ...additions] }));
  for (const change of additions) {
    clearTimeout(timers.get(change.player));
    timers.set(change.player, setTimeout(() => {
      timers.delete(change.player);
      useCues.setState(({ changes }) => ({ changes: changes.filter(row => row.player !== change.player) }));
    }, HOLD_MS));
  }
});

// Portals attach to existing seat boxes without changing card dimensions or the map hole.
export function SeatPublicGains({ scope }: { scope: 'rail' | 'seat' }) {
  const changes = useCues(s => s.changes);
  const players = useGame(s => s.state?.players);
  const [mounted, setMounted] = useState(false);
  // A new rail/strip's anchors enter the DOM in this commit, after its initial render.
  useLayoutEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return changes.map(change => {
    const anchor = [...document.querySelectorAll<HTMLElement>('.seat-card')]
      .find(card => card.dataset.testid === `${scope}-${change.player}`);
    if (!anchor) return null;
    const name = players?.find(player => player.id === change.player)?.name ?? '';
    const label = RESOURCES.filter(r => change.goods[r]).map(r => `${change.goods[r]! > 0 ? '+' : '−'}${Math.abs(change.goods[r]!)} ${RESOURCE_LABEL[r]}`).join(', ');
    return createPortal(
      <span data-testid="seat-public-gains" data-player={change.player} role="status" aria-label={`${name}: ${label}`}
        className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-center rounded-[inherit] px-1 text-[12px] font-semibold tabular-nums"
        style={{ background: 'var(--table)', color: 'var(--ink)', lineHeight: '14px' }}>
        <span className="block truncate" aria-hidden="true">{name}</span>
        <span className="flex flex-wrap justify-end gap-x-1">
        {RESOURCES.filter(r => change.goods[r]).map(resource => {
          const n = change.goods[resource]!, Icon = SYMBOLS[resource];
          return <span key={resource} className="inline-flex items-center whitespace-nowrap" aria-hidden="true">
            {n > 0 ? '+' : '−'}{Math.abs(n)}<Icon width={12} height={12} />
          </span>;
        })}
        </span>
      </span>, anchor, `${scope}-${change.player}`,
    );
  });
}
