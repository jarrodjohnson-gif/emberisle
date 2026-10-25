// Open-table list for server/host.mjs (#833).
// Multiple players may host; host.mjs enforces one live host seat per authenticated profile or guest bearer.
// Only { code, name, seated, status } is ever published — private table codes are never exposed.

const openRooms = new Set();

/** Register only rooms explicitly marked open by the host. */
export function registerOpenTable(room) {
  openRooms.add(room);
  return true;
}

export function unregisterOpenTable(room) {
  openRooms.delete(room);
}

/** Drop the open listing when the game ends or nobody is connected (slot stays free for a new open host). */
export function maybeReleaseOpenSlot(room) {
  if (!openRooms.has(room)) return;
  if (room.game?.phase === "over" || !room.seats.some((s) => s.ws)) unregisterOpenTable(room);
}

export function getOpenTables() {
  return [...openRooms].map((openRoom) => {
  const status = openRoom.game
    ? openRoom.game.phase === "over"
      ? "over"
      : "playing"
    : "lobby";
  // Name follows the current host seat so a handoff keeps the label honest.
  const hostSeat = openRoom.seats.find((s) => s.id === openRoom.host) ?? openRoom.seats[0];
  // Count every seat (bots included): sitDown refuses when length >= 4.
  const seated = openRoom.seats.length;
  return {
      code: openRoom.code,
      name: `${hostSeat?.name ?? "Host"}'s table`,
      seated,
      total: 4,
      status,
    };
  });
}
