// Local selections stay out of the saved rules state. Online selections come only from the host's public seat projection.
import { create } from 'zustand';
import { useGame } from '@/lib/game/store';
import { advanceNeed, validNeeds, type NeedSelection } from '@/lib/game/needs';
import type { Resource } from '@/lib/game/types';

export const useLocalNeeds = create<Record<string, NeedSelection | undefined>>(() => ({}));
useGame.subscribe((next, previous) => {
  const a = previous.state, b = next.state;
  if (next.mode === 'online' || !a || !b || next.screen !== 'play' || next.mode !== previous.mode || b.seq < a.seq) {
    if (Object.keys(useLocalNeeds.getState()).length) useLocalNeeds.setState({}, true);
    return;
  }
  if (a === b) return;
  // Only local full-hand games use this path. The canonical public log identifies trade settlement, not rolls or thefts.
  const last = b.log.at(-1) ?? '';
  const traded = b.seq > a.seq && /^.+ traded .+ to .+ for \d+ (wood|brick|sheep|wheat|stone)(, \d+ (wood|brick|sheep|wheat|stone))*\.$/.test(last);
  const needs = Object.fromEntries(Object.entries(useLocalNeeds.getState()).flatMap(([player, need]) => {
    const updated = advanceNeed(need, player, a, b, traded);
    return updated ? [[player, updated]] : [];
  }));
  useLocalNeeds.setState(needs, true);
});

export function setPlayerNeeds(player: string, kinds: Resource[]) {
  const game = useGame.getState();
  if (!validNeeds(kinds) || game.spectator || !game.state || game.state.phase === 'over') return;
  const actor = game.mode === 'hotseat' ? game.state.current : game.localId;
  if (actor !== player) return;
  if (game.mode === 'online') return game.net?.need(kinds);
  useLocalNeeds.setState({ [player]: kinds.length ? { kinds: [...kinds], turnsLeft: 2 } : undefined });
}
