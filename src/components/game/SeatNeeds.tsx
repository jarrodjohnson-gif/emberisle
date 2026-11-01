import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { setPlayerNeeds, useLocalNeeds } from '@/components/game/need-state';
import './seat-needs.css';
import { useGame } from '@/lib/game/store';
import { RESOURCES, RESOURCE_LABEL } from '@/lib/game/types';

export function useNeeds() {
  const mode = useGame(s => s.mode), seats = useGame(s => s.seats), local = useLocalNeeds();
  return mode === 'online'
    ? Object.fromEntries(seats.filter(s => s.player).map(s => [s.player!, s.needs ?? []]))
    : Object.fromEntries(Object.entries(local).map(([id, need]) => [id, need?.kinds ?? []]));
}
export function NeedRow({ player }: { player: string }) {
  return <section className="trade-half trade-need" aria-labelledby="trade-need-title">
    <h3 id="trade-need-title">You need</h3>
    <p className="need-hint">Tap up to two. Not part of the offer; other players see it.</p>
    <Picker player={player} />
  </section>;
}
function Picker({ player }: { player: string }) {
  const actual = useNeeds()[player] ?? [];
  const [draft, setDraft] = useState<typeof actual | null>(null);
  const error = useGame(state => state.needError);
  const needs = draft ?? actual;
  // Rapid taps compose locally while host echoes are in flight; only the host controls public chips.
  useEffect(() => {
    if (draft && JSON.stringify(draft) === JSON.stringify(actual)) setDraft(null);
  }, [actual, draft]);
  useEffect(() => setDraft(null), [error]);
  useEffect(() => { const timer = setTimeout(() => setDraft(null), 3000); return () => clearTimeout(timer); }, [draft]);
  const choose = (kinds: typeof actual) => { setDraft(kinds); setPlayerNeeds(player, kinds); };
  return <fieldset id="need-picker">
    <legend className="sr-only">Up to two goods you need</legend>
    <div>
      {RESOURCES.map(resource => {
        const selected = needs.includes(resource);
        return <Button key={resource} variant="secondary" className="need-toggle"
          aria-label={`Need ${RESOURCE_LABEL[resource]}`} aria-pressed={selected} disabled={!selected && needs.length === 2}
          onClick={() => choose(selected ? needs.filter(kind => kind !== resource) : [...needs, resource])}>
          {RESOURCE_LABEL[resource]}
        </Button>;
      })}
    </div>
  </fieldset>;
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

export function NeedsAtTable({ me }: { me: string }) {
  const players = useGame(s => s.state?.players);
  return <div className="trade-peer-needs">
    {players?.filter(p => p.id !== me).map(p => <div key={p.id} className="trade-peer-seat"><span className="trade-peer-name">{p.name}</span><MenuNeeds player={p.id} /></div>)}
  </div>;
}
