// Only public production and public trade narration enter this projection. Never compare hidden hands.
import { RESOURCES, RESOURCE_LABEL, type GameState, type Resource } from '@/lib/game/types';

type PublicState = Pick<GameState, 'log' | 'seq' | 'rolls' | 'lastProduction'> & {
  players: { id: string; name: string }[];
};
export type SeatChange = { player: string; goods: Partial<Record<Resource, number>> };

function bag(text: string): Partial<Record<Resource, number>> | null {
  const result: Partial<Record<Resource, number>> = {};
  for (const part of text.split(', ')) {
    const match = /^(\d+) (wood|brick|sheep|wheat|stone)$/.exec(part);
    if (!match) return null;
    const resource = RESOURCES.find(r => RESOURCE_LABEL[r].toLowerCase() === match[2])!;
    const n = Number(match[1]);
    if (!Number.isSafeInteger(n) || n <= 0 || result[resource] !== undefined) return null;
    result[resource] = n;
  }
  return result;
}

function trade(line: string, players: PublicState['players']): SeatChange[] {
  // Match complete names and complete bags. Ambiguous duplicate display names produce no attribution.
  const matches: SeatChange[][] = [];
  for (const from of players) {
    const prefix = `${from.name} traded `;
    if (!line.startsWith(prefix) || !line.endsWith('.')) continue;
    const rest = line.slice(prefix.length, -1);
    const destinations = [
      { text: 'the bank', player: null }, { text: 'a dock', player: null },
      ...players.filter(p => p.id !== from.id).map(player => ({ text: player.name, player })),
    ];
    for (const destination of destinations) {
      const separator = ` to ${destination.text} for `;
      const index = rest.indexOf(separator);
      if (index < 0) continue;
      const give = bag(rest.slice(0, index)), want = bag(rest.slice(index + separator.length));
      if (!give || !want) continue;
      const goods = Object.fromEntries(RESOURCES.map(r => [r, (want[r] ?? 0) - (give[r] ?? 0)]));
      matches.push([
        { player: from.id, goods },
        ...(destination.player ? [{ player: destination.player.id, goods: Object.fromEntries(RESOURCES.map(r => [r, -goods[r]])) }] : []),
      ]);
    }
  }
  return matches.length === 1 ? matches[0] : [];
}

function newLines(previous: PublicState, next: PublicState): string[] {
  if (next.seq <= previous.seq) return [];
  const a = previous.log, b = next.log;
  // Logs are bounded. Find their suffix/prefix overlap instead of relying on increasing array length.
  for (let overlap = Math.min(a.length, b.length); overlap > 0; overlap--) {
    if (a.slice(-overlap).every((line, index) => line === b[index])) {
      return b.slice(overlap);
    }
  }
  // A reset or disconnected history cannot establish which old lines are new.
  return a.length === 0 ? b : [];
}

export function publicSeatChanges(previous: PublicState, next: PublicState): SeatChange[] {
  const changes = new Map<string, Partial<Record<Resource, number>>>();
  const add = (player: string, resource: Resource, n: number) => {
    if (!next.players.some(p => p.id === player) || !Number.isSafeInteger(n)) return;
    const goods = changes.get(player) ?? {};
    goods[resource] = (goods[resource] ?? 0) + n;
    changes.set(player, goods);
  };
  if ((next.rolls ?? 0) > (previous.rolls ?? 0)) {
    for (const gain of next.lastProduction ?? []) {
      if (RESOURCES.includes(gain.res) && gain.n > 0) add(gain.player, gain.res, gain.n);
    }
  }
  for (const line of newLines(previous, next)) {
    for (const change of trade(line, next.players)) {
      for (const resource of RESOURCES) add(change.player, resource, change.goods[resource] ?? 0);
    }
  }
  return [...changes].map(([player, goods]) => ({ player, goods }))
    .filter(change => RESOURCES.some(r => change.goods[r]));
}
