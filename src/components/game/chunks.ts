// #488: the lazily loaded UI chunks and their mount-site components. The lobby, the chat dock and the reactions only
// render online, so they stay out of the first-load index as one chunk: a pointer or focus on Host, Join or Watch, a
// join or watch link and a saved seat's rejoin fetch it, and the lobby renders from it, so the dock is already in memory
// when the table renders. The sheets (How to play, the trade panel, the win screen) open on demand and load as another
// chunk, fetched on idle by the title and the table; the fortune tray (#423) rides with them. The turn and gain moments
// are a third, asked for when the table first renders them, long before the first good arrives.
import { useEffect } from "react";
import { chunk } from "@/lib/lazy";
import { useGame } from "@/lib/game/store";

export const online = chunk(() => import("@/components/game/online"));
export const Lobby = online.pick((m) => m.Lobby);
export const ChatControls = online.pick((m) => m.ChatControls);
export const ChatDock = online.pick((m) => m.ChatDock);
export const ReactionFloats = online.pick((m) => m.ReactionFloats);

export const sheets = chunk(() => import("@/components/game/sheets"));
export const FortuneTray = sheets.pick((m) => m.FortuneTray);
export const HowTo = sheets.pick((m) => m.HowTo);
export const TradePanel = sheets.pick((m) => m.TradePanel);
export const WinScreen = sheets.pick((m) => m.WinScreen);

export const moments = chunk(() => import("@/components/game/moments"));
export const TurnMoment = moments.pick((m) => m.TurnMoment);
export const GainFloats = moments.pick((m) => m.GainFloats);

// A sibling of the lazy dock or panel inside its Suspense boundary: its effect runs on the commit that lands them, which is
// a commit later than the chatOpen or tradeOpen flip when the chunk was still loading, so the island measures the hole again.
export function ChromeLanded() {
  useEffect(() => useGame.getState().chromeLanded(), []);
  return null;
}
