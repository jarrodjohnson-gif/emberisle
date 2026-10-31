import { useEffect, useLayoutEffect, useState } from 'react';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ClaySymbol, GrainSymbol, OreSymbol, TimberSymbol, WoolSymbol } from '@/components/game/ResourceSymbols';
import { setPlayerNeeds, useLocalNeeds } from '@/components/game/need-state';
import './seat-needs.css';
import { useGame } from '@/lib/game/store';
import { RESOURCES, RESOURCE_LABEL } from '@/lib/game/types';

const ICON = { timber: TimberSymbol, clay: ClaySymbol, wool: WoolSymbol, grain: GrainSymbol, ore: OreSymbol };
export function useNeeds() {
  const mode = useGame(s => s.mode), seats = useGame(s => s.seats), local = useLocalNeeds();
  return mode === 'online'
    ? Object.fromEntries(seats.filter(s => s.player).map(s => [s.player!, s.needs ?? []]))
    : Object.fromEntries(Object.entries(local).map(([id, need]) => [id, need?.kinds ?? []]));
}
const reveal = (el: HTMLElement | null) => el?.scrollIntoView({ block: "nearest" });
const useOpen = create(() => false);
export function NeedRow({ player }: { player: string }) {
  const kinds = useNeeds()[player] ?? [], open = useOpen();
  useEffect(() => () => useOpen.setState(false), []);
  return <div className="trade-need-row">
    <Button variant="secondary" className="need-trigger" aria-expanded={open} aria-controls={open ? "need-picker" : undefined} onClick={() => useOpen.setState(!open)}>
      Need{kinds.length ? <span aria-hidden="true" className="need-dot" /> : null}
    </Button>
    <div data-testid="own-needs" className="need-line">
      {kinds.length ? 'You' : 'You · nothing shared'}{kinds.map(kind => <span key={kind} data-testid="need-chip" className="need-chip">{RESOURCE_LABEL[kind]}</span>)}
    </div>
  </div>;
}
export function NeedFieldset({ player }: { player: string }) {
  return useOpen() ? <Picker player={player} /> : null;
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
  return <fieldset id="need-picker" ref={reveal}>
    <legend>Show the table up to two goods you need</legend>
    <div>
      {RESOURCES.map(resource => {
        const Icon = ICON[resource], selected = needs.includes(resource);
        return <Button key={resource} variant="secondary" className="need-toggle"
          aria-label={`Need ${RESOURCE_LABEL[resource]}`} aria-pressed={selected} disabled={!selected && needs.length === 2}
          onClick={() => choose(selected ? needs.filter(kind => kind !== resource) : [...needs, resource])}>
          <Icon width={18} height={18} aria-hidden="true" />{RESOURCE_LABEL[resource]}
        </Button>;
      })}
      <Button variant="ghost" className="need-clear h-11" disabled={!needs.length} onClick={() => choose([])}>Clear needs</Button>
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
  return <section className="trade-needs-table" aria-labelledby="trade-needs-title">
    <h3 id="trade-needs-title">Needs at the table</h3>
    <div className="trade-peer-needs">
      {players?.filter(p => p.id !== me).map(p => <div key={p.id} className="trade-peer-seat"><span className="trade-peer-name">{p.name}</span><MenuNeeds player={p.id} /></div>)}
      <p className="trade-quiet">No one has shared a need yet.</p>
    </div>
  </section>;
}
