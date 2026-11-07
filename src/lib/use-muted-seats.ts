// The React side of the per-table mute list (src/lib/muted-seats.ts), shared by the chat chunk and the Sound panel chunk.
import { useEffect, useState } from "react";
import { MUTE_EVENT, MUTE_KEY, mutedByCode, readMutedSeats } from "@/lib/muted-seats";

// Muting is a browser preference, scoped to one table code; no message reaches the host.
export function useMutedSeats(code: string) {
  const [seats, setSeats] = useState<string[]>(() => readMutedSeats(code));

  useEffect(() => {
    const syncLocal = () => setSeats(readMutedSeats(code));
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== `${MUTE_KEY}${code}`) return;
      mutedByCode.delete(code);
      setSeats(readMutedSeats(code));
    };
    window.addEventListener(MUTE_EVENT, syncLocal);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(MUTE_EVENT, syncLocal);
      window.removeEventListener("storage", syncStorage);
    };
  }, [code]);

  useEffect(() => setSeats(readMutedSeats(code)), [code]);

  const toggle = (seat: string) => {
    if (!code || !seat) return;
    const next = new Set(readMutedSeats(code));
    if (next.has(seat)) next.delete(seat);
    else next.add(seat);
    const value = [...next];
    mutedByCode.set(code, value);
    try {
      localStorage.setItem(`${MUTE_KEY}${code}`, JSON.stringify(value));
    } catch {
      // The in-memory preference still applies and syncs to this tab's chat and reaction views.
    }
    setSeats(value);
    window.dispatchEvent(new Event(MUTE_EVENT));
  };

  return { muted: new Set(seats), toggle };
}
