// Shared win music approved in #1043. Selection stores only an ID; playback owns asset use.
export const PROFILE_SONGS = [
  { id: "isaac-win", label: "Isaac win music", asset: "/audio/isaac_win.mp3" },
] as const;

// The clip the outcome playback (#1045, trade-sound.ts gameEnd) starts for each catalogue ID. Kept apart from the list
// above so the lazy game-end chunk carries no labels or asset paths.
export const SONG_SOUNDS: Record<string, "isaac_win"> = { "isaac-win": "isaac_win" };

export function isProfileSongId(value: unknown): value is (typeof PROFILE_SONGS)[number]["id"] {
  return typeof value === "string" && PROFILE_SONGS.some((song) => song.id === value);
}
