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

export function getOpenTables() {
  if (!openRoom) return [];
  const status = openRoom.game
    ? openRoom.game.phase === "over"
      ? "over"
      : "playing"
    : "lobby";
  return [
    {
      code: openRoom.code,
      name: `${openRoom.seats[0]?.name ?? "Host"}'s table`,
      seated: openRoom.seats.filter((s) => !s.bot).length,
      total: 4,
      status,
    },
  ];
}
