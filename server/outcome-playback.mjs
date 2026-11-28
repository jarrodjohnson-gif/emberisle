// The public playback projection of a finished game (#1045; docs/design/profiles.md, "Curated media and playback"). Owner
// answer 2026-11-28 (B): the winner's chosen shared song plays for everyone present, and the wire shape is
// `outcome: { gameId, song }` on the final state frame. `song` is a shared catalogue ID or null, never a login, profile id,
// media key or URL. It is read once, when the game first settles, from the frozen roster's binding for the rules engine's
// winner, never from a live seat, name or score. It lives on the room in memory only: a host restart drops it, so a finished
// game that is loaded again shows its result without asking anyone to play a song.
import { isProfileSongId } from "../src/lib/profile-songs.ts";

export function readPlayback(roster, winner, profiles) {
  const id = roster.players.find((p) => p.pid === winner)?.profileId;
  const p = typeof id === "string" && !profiles.tombstoned(id) ? profiles.profile(id) : null;
  return { gameId: roster.gameId, song: isProfileSongId(p?.winSongId) ? p.winSongId : null };
}

// What a terminal state frame carries, or undefined (left out of the frame): only for the room's current finished game.
export function playbackOf(room) {
  const p = room.playback;
  return room.game?.phase === "over" && p && p.gameId === room.roster?.gameId ? { gameId: p.gameId, song: p.song } : undefined;
}
