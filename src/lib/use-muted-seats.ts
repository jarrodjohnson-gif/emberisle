// The React side of the per-table mute list (src/lib/muted-seats.ts), shared by the chat chunk and the Sound panel chunk.
import { useEffect, useState } from "react";
import { MUTE_EVENT, MUTE_KEY, mutedByCode, readMutedSeats } from "@/lib/muted-seats";

// Muting is a browser preference, scoped to one table code; no message reaches the host.
export function useMutedSeats(code: string) {
  const [, bump] = useState(0);

  useEffect(() => {
    const syncLocal = () => bump((n) => n + 1);
    const syncStorage = (event: StorageEvent) => {
      if (event.key === null) {
        mutedByCode.clear();
        bump((n) => n + 1);
      } else if (event.key.startsWith(MUTE_KEY)) {
        const changed = event.key.slice(MUTE_KEY.length);
        mutedByCode.delete(changed);
        if (changed === code) bump((n) => n + 1);
      }
    };
    window.addEventListener(MUTE_EVENT, syncLocal);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(MUTE_EVENT, syncLocal);
      window.removeEventListener("storage", syncStorage);
    };
  }, [code]);

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
    bump((n) => n + 1);
    window.dispatchEvent(new Event(MUTE_EVENT));
  };

  return { muted: new Set(readMutedSeats(code)), toggle };
}
