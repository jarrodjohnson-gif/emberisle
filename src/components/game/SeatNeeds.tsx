import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocalNeeds } from '@/components/game/need-state';
import './seat-needs.css';
import { useGame } from '@/lib/game/store';
import { RESOURCE_LABEL, type Resource } from '@/lib/game/types';

function useNeeds() {
  const mode = useGame(s => s.mode), seats = useGame(s => s.seats), local = useLocalNeeds();
  return mode === 'online'
    ? Object.fromEntries(seats.filter(s => s.player).map(s => [s.player!, s.needs ?? []]))
    : Object.fromEntries(Object.entries(local).map(([id, need]) => [id, need?.kinds ?? []]));
}
export function SeatNeeds({ scope }: { scope: 'rail' | 'seat' }) {
  const needs = useNeeds(), players = useGame(s => s.state?.players);
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return Object.entries(needs).filter(([, kinds]) => kinds.length).map(([player, kinds]) => {
    const anchor = [...document.querySelectorAll<HTMLElement>('.seat-card')].find(card => card.dataset.testid === `${scope}-${player}`);
    if (!anchor) return null;
    const name = players?.find(p => p.id === player)?.name;
    return createPortal(<span data-testid="seat-needs" data-player={player} role="img"
      aria-label={`${name} needs ${kinds.map(kind => RESOURCE_LABEL[kind]).join(' and ')}`}
      className="need-dot" />, anchor, `${scope}-${player}`);
  });
}

export function MenuNeeds({ player }: { player: string }) {
  const kinds = useNeeds()[player] ?? [];
  if (!kinds.length) return null;
  return <div data-testid="menu-needs" className="need-line mx-1 mb-2">
    Needs{kinds.map(kind => <span key={kind} data-testid="need-chip" className="need-chip">{RESOURCE_LABEL[kind]}</span>)}
  </div>;
}

// #1537: on a Get token, one seat-colour dot for each other seat that needs that good.
export function NeedDots({ kind, me }: { kind: Resource; me: string }) {
  const needs = useNeeds(), players = useGame(s => s.state?.players);
  return <span className="trade-need-dots">
    {players?.filter(p => p.id !== me && needs[p.id]?.includes(kind)).map(p => <span key={p.id} data-testid="trade-need-dot" className="trade-need-dot" style={{ background: p.color }}>
      <span className="sr-only">{p.name} needs {RESOURCE_LABEL[kind].toLowerCase()}</span>
    </span>)}
  </span>;
}
