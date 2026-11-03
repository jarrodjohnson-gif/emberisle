// Open-table list for server/host.mjs (#833).
// At most one open table per host process: the first host to set visibility:"open" claims the slot.
// Only { code, name, seated, status } is ever published — private table codes are never exposed.

let openRoom = null;

/** @returns {boolean} false when another open table already holds the single slot. */
export function registerOpenTable(room) {
  if (openRoom && openRoom !== room) return false;
  openRoom = room;
  return true;
}

export function unregisterOpenTable(room) {
  if (openRoom === room) openRoom = null;
}

/** Drop the open listing when the game ends or nobody is connected (slot stays free for a new open host). */
export function maybeReleaseOpenSlot(room) {
  if (openRoom !== room) return;
  if (room.game?.phase === "over" || !room.seats.some((s) => s.ws)) unregisterOpenTable(room);
}

export function getOpenTables() {
  if (!openRoom) return [];
  const status = openRoom.game
    ? openRoom.game.phase === "over"
      ? "over"
      : "playing"
    : "lobby";
  // Name follows the current host seat so a handoff keeps the label honest.
  const hostSeat = openRoom.seats.find((s) => s.id === openRoom.host) ?? openRoom.seats[0];
  // Count every seat (bots included): sitDown refuses when length >= 4.
  const seated = openRoom.seats.length;
  return [
    {
      code: openRoom.code,
      name: `${hostSeat?.name ?? "Host"}'s table`,
      seated,
      total: 4,
      status,
    },
  ];
}
