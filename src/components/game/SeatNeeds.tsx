import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ClaySymbol, GrainSymbol, OreSymbol, TimberSymbol, WoolSymbol } from '@/components/game/ResourceSymbols';
import { setPlayerNeeds, useLocalNeeds } from '@/components/game/need-state';
import { useGame } from '@/lib/game/store';
import { RESOURCES, RESOURCE_LABEL } from '@/lib/game/types';

const ICON = { timber: TimberSymbol, clay: ClaySymbol, wool: WoolSymbol, grain: GrainSymbol, ore: OreSymbol };
function useNeeds() {
  const mode = useGame(s => s.mode), seats = useGame(s => s.seats), local = useLocalNeeds();
  return mode === 'online'
    ? Object.fromEntries(seats.filter(s => s.player).map(s => [s.player!, s.needs ?? []]))
    : Object.fromEntries(Object.entries(local).map(([id, need]) => [id, need?.kinds ?? []]));
}
export function NeedPicker({ player }: { player: string }) {
  const [open, setOpen] = useState(false), actual = useNeeds()[player] ?? [];
  const [draft, setDraft] = useState<typeof actual | null>(null);
  const error = useGame(state => state.errorSeq);
  const needs = draft ?? actual;
  // Rapid taps compose locally while host echoes are in flight; only the host controls public chips.
  useEffect(() => {
    if (draft && JSON.stringify(draft) === JSON.stringify(actual)) setDraft(null);
  }, [actual, draft]);
  useEffect(() => setDraft(null), [error]);
  useEffect(() => { const timer = setTimeout(() => setDraft(null), 3000); return () => clearTimeout(timer); }, [draft]);
  const choose = (kinds: typeof actual) => { setDraft(kinds); setPlayerNeeds(player, kinds); };
  return <div className="mb-2">
    <Button variant="secondary" className="h-11" aria-expanded={open} aria-controls="need-picker" onClick={() => setOpen(value => !value)}>Need</Button>
    {open ? <fieldset id="need-picker" className="mt-2 rounded-control border p-2">
      <legend className="text-sm">Show the table up to two goods you need</legend>
      <div className="grid grid-cols-5 gap-1">
        {RESOURCES.map(resource => {
          const Icon = ICON[resource], selected = needs.includes(resource);
          return <Button key={resource} variant={selected ? 'default' : 'secondary'} className="h-auto min-h-11 min-w-11 flex-col px-0.5 py-1 text-xs"
            aria-label={`Need ${RESOURCE_LABEL[resource]}`} aria-pressed={selected} disabled={!selected && needs.length === 2}
            onClick={() => choose(selected ? needs.filter(kind => kind !== resource) : [...needs, resource])}>
            <Icon width={18} height={18} aria-hidden="true" />{RESOURCE_LABEL[resource]}
          </Button>;
        })}
      </div>
      <Button variant="ghost" className="mt-1 h-11" disabled={!needs.length} onClick={() => choose([])}>Clear needs</Button>
    </fieldset> : null}
  </div>;
}

export function SeatNeeds({ scope }: { scope: 'rail' | 'seat' }) {
  const needs = useNeeds(), players = useGame(s => s.state?.players);
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return Object.entries(needs).filter(([, kinds]) => kinds.length).map(([player, kinds]) => {
    const anchor = [...document.querySelectorAll<HTMLElement>('.seat-card')].find(card => card.dataset.testid === `${scope}-${player}`);
    if (!anchor) return null;
    const name = players?.find(p => p.id === player)?.name ?? '';
    return createPortal(<span data-testid="seat-needs" data-player={player} role="status"
      aria-label={`${name} needs ${kinds.map(kind => RESOURCE_LABEL[kind]).join(' and ')}`}
      className="pointer-events-none absolute -bottom-1 right-1 z-10 flex items-center gap-0.5 rounded-chip bg-glass px-1 text-[10px] leading-3"
      style={{ color: 'var(--ink)' }}>
      <span aria-hidden="true">needs</span>{kinds.map(kind => { const Icon = ICON[kind]; return <Icon key={kind} width={12} height={12} aria-hidden="true" />; })}
    </span>, anchor, `${scope}-${player}`);
  });
}
