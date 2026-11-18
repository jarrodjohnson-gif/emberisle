// Only public production and public trade narration enter this projection. Never compare hidden hands.
import { RESOURCES, RESOURCE_LABEL, type GameState, type Resource } from '@/lib/game/types';

type PublicState = Pick<GameState, 'log' | 'seq' | 'rolls' | 'lastProduction'> & {
  players: { id: string; name: string }[];
};
export type SeatChange = { player: string; goods: Partial<Record<Resource, number>> };

function bag(text: string): Partial<Record<Resource, number>> | null {
  const result: Partial<Record<Resource, number>> = {};
  for (const part of text.split(', ')) {
    const match = /^(\d+) ([a-z]+)$/.exec(part);
    const resource = match && RESOURCES.find(r => RESOURCE_LABEL[r].toLowerCase() === match[2]);
    const n = match ? Number(match[1]) : 0;
    if (!resource || !Number.isSafeInteger(n) || n <= 0 || result[resource] !== undefined) return null;
    result[resource] = n;
  }
  return result;
}

type TradeMatch = { from: string; to: string | null; give: Partial<Record<Resource, number>>; want: Partial<Record<Resource, number>> };

function trade(line: string, players: PublicState['players']): TradeMatch | null {
  // Match complete names and complete bags. Ambiguous duplicate display names produce no attribution.
  const matches: TradeMatch[] = [];
  for (const from of players) {
    const prefix = `${from.name} traded `;
    if (!line.startsWith(prefix) || !line.endsWith('.')) continue;
    const rest = line.slice(prefix.length, -1);
    const tryTo = (text: string, to: string | null) => {
      const separator = ` to ${text} for `;
      const index = rest.indexOf(separator);
      if (index < 0) return;
      const give = bag(rest.slice(0, index)), want = bag(rest.slice(index + separator.length));
      if (give && want) matches.push({ from: from.id, to, give, want });
    };
    tryTo('the bank', null);
    tryTo('a dock', null);
    for (const p of players) if (p.id !== from.id) tryTo(p.name, p.id);
  }
  return matches.length === 1 ? matches[0] : null;
}

function newLines(previous: PublicState, next: PublicState): string[] {
  if (next.seq <= previous.seq) return [];
  const a = previous.log, b = next.log;
  // Logs are bounded. Find their suffix/prefix overlap instead of relying on increasing array length.
  for (let overlap = Math.min(a.length, b.length); overlap > 0; overlap--) {
    if (a.slice(-overlap).every((line, index) => line === b[index])) return b.slice(overlap);
  }
  // A reset or disconnected history cannot establish which old lines are new.
  return a.length === 0 ? b : [];
}

export function publicSeatChanges(previous: PublicState, next: PublicState): SeatChange[] {
  const changes = new Map<string, Partial<Record<Resource, number>>>();
  const add = (player: string, resource: Resource, n: number) => {
    if (!n || !next.players.some(p => p.id === player) || !Number.isSafeInteger(n)) return;
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
    const match = trade(line, next.players);
    if (!match) continue;
    for (const r of RESOURCES) {
      const d = (match.want[r] ?? 0) - (match.give[r] ?? 0);
      add(match.from, r, d);
      if (match.to) add(match.to, r, -d);
    }
  }
  return [...changes].map(([player, goods]) => ({ player, goods }))
    .filter(change => RESOURCES.some(r => change.goods[r]));
}
