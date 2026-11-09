// Shared win music approved in #1043. Selection stores only an ID; playback owns asset use.
export const PROFILE_SONGS = [
  { id: "isaac-win", label: "Isaac win music", asset: "/audio/isaac_win.mp3" },
] as const;

export function isProfileSongId(value: unknown): value is (typeof PROFILE_SONGS)[number]["id"] {
  return typeof value === "string" && PROFILE_SONGS.some((song) => song.id === value);
}
