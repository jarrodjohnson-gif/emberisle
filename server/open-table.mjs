// Open-table list for server/host.mjs (#833).
// Several open tables may be listed at once (#944): who may host is host.mjs's rule, one live table per host player.
// Only { code, name, seated, total, status } is ever published — private table codes are never exposed.

const openRooms = new Set();

/** @returns {boolean} true once the room is listed. */
export function registerOpenTable(room) {
  openRooms.add(room);
  return true;
}

export function unregisterOpenTable(room) {
  openRooms.delete(room);
}

/** Drop the open listing when the game ends or nobody is connected. */
export function maybeReleaseOpenSlot(room) {
  if (!openRooms.has(room)) return;
  if (room.game?.phase === "over" || !room.seats.some((s) => s.ws)) unregisterOpenTable(room);
}

function entry(room) {
  const status = room.game ? (room.game.phase === "over" ? "over" : "playing") : "lobby";
  // Name follows the current host seat so a handoff keeps the label honest.
  const hostSeat = room.seats.find((s) => s.id === room.host) ?? room.seats[0];
  return {
    code: room.code,
    name: `${hostSeat?.name ?? "Host"}'s table`,
    // Count every seat (bots included): sitDown refuses at the room's cap, 4, or 6 for an expanded room (#1611).
    seated: room.seats.length,
    total: room.variant === "expanded" ? 6 : 4,
    status,
  };
}

export function getOpenTables() {
  return [...openRooms].map(entry);
}
