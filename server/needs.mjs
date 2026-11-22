import { advanceNeed, restoredNeed, validNeeds } from '../src/lib/game/needs.ts';
export { restoredNeed, validNeeds };

export function advanceRoomNeeds(room, before, after, traded = false) {
  let changed = false;
  for (const seat of room.seats) {
    const next = advanceNeed(seat.needs, seat.pid, before, after, traded);
    if (next === seat.needs) continue;
    seat.needs = next;
    changed = true;
  }
  return changed;
}
