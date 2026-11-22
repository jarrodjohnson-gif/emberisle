import { RESOURCES, type GameState, type Resource } from './types';

export type NeedSelection = { kinds: Resource[]; turnsLeft: number };
export function validNeeds(kinds: unknown): kinds is Resource[] {
  return Array.isArray(kinds) && kinds.length <= 2 && new Set(kinds).size === kinds.length &&
    kinds.every(kind => (RESOURCES as readonly unknown[]).includes(kind));
}
export function restoredNeed(value: unknown): NeedSelection | undefined {
  const need = value as NeedSelection | undefined;
  return need && validNeeds(need.kinds) && need.kinds.length > 0 && [1, 2].includes(need.turnsLeft)
    ? { kinds: [...need.kinds], turnsLeft: need.turnsLeft } : undefined;
}
export function advanceNeed(need: NeedSelection | undefined, player: string, before: GameState, after: GameState, traded: boolean): NeedSelection | undefined {
  if (!need) return undefined;
  const was = before.players.find(p => p.id === player), now = after.players.find(p => p.id === player);
  if (!was || !now || after.phase === 'over') return undefined;
  if (traded && need.kinds.some(kind => now.resources[kind] > was.resources[kind])) return undefined;
  // `turn` counts whole table rounds. Count this player's completed turns instead.
  const ended = before.phase === 'main' && before.current === player && after.current !== player;
  if (!ended) return need;
  return need.turnsLeft > 1 ? { kinds: need.kinds, turnsLeft: need.turnsLeft - 1 } : undefined;
}
