// The clip the outcome playback (#1045, trade-sound.ts gameEnd) starts for each catalogue ID. Kept apart from the catalogue in
// profile-songs.ts so the main bundle and the lazy game-end chunk carry no labels or asset paths.
export const SONG_SOUNDS: Record<string, "isaac_win"> = { "isaac-win": "isaac_win" };
