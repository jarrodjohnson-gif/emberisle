// PROTOTYPE ONLY (docs/design/counter-offers.md): the counter states, driven from the capture script through window.__proto.
// No host, no protocol. Bags are from the asker's side, as in the design's protocol: `give` leaves the asker.
import { create } from "zustand";
import type { Bag } from "@/lib/net/table";

export type Counter = { counterId: string; by: string; name: string; give: Bag; want: Bag };

type Proto = {
  // The offer carries `counter: true`.
  counterAllowed: boolean;
  // This seat has sent its one counter on this offer.
  counterUsed: boolean;
  // The sender's own counter, out and waiting.
  myCounter: Counter | null;
  // "Tide said no", the outcome line on the sender's tray.
  counterNo: string | null;
  // The asker's waiting counters, oldest first.
  counters: Counter[];
  // The trade sheet opened by Counter.
  counterSheet: boolean;
  // Owner question 1, option B: no Counter button; the offer line opens the sheet.
  optionB: boolean;
};

export const useCounter = create<Proto>(() => ({
  counterAllowed: false,
  counterUsed: false,
  myCounter: null,
  counterNo: null,
  counters: [],
  counterSheet: false,
  optionB: false,
}));

declare global {
  interface Window { __proto?: { set: (p: Partial<Proto>) => void; get: () => Proto } }
}
window.__proto = { set: (p) => useCounter.setState(p), get: useCounter.getState };
