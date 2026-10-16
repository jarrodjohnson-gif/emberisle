// Which seats this browser has muted at a table: a local preference kept in localStorage per table code (no message reaches the host).
export const MUTE_KEY = "emberisle-chat-muted-";
export const mutedByCode = new Map<string, string[]>();

export function readMutedSeats(code: string) {
  if (!code) return [];
  if (mutedByCode.has(code)) return mutedByCode.get(code)!;
  try {
    const value = JSON.parse(localStorage.getItem(`${MUTE_KEY}${code}`) ?? "[]");
    const seats = Array.isArray(value) ? value.filter((seat): seat is string => typeof seat === "string") : [];
    mutedByCode.set(code, seats);
    return seats;
  } catch {
    return [];
  }
}
