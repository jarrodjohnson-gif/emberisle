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
export const SeatBubbles = online.pick((m) => m.SeatBubbles);
export const ConnectionOverlay = online.pick((m) => m.Health);

// #833: title-only list and mode controls share a lazy load; private Host/Join remain available in the index.
const openTables = chunk(() => import("@/components/game/OpenTables"));
export const OpenTables = openTables.pick((m) => m.OpenTables);
export const OpenModeToggle = openTables.pick((m) => m.OpenModeToggle);
export const SetupReference = chunk(() => import("@/components/game/SetupReference")).pick(m => m.SetupReference);
export const WayfarerOptions = chunk(() => import("@/components/game/WayfarerOptions")).pick(m => m.WayfarerOptions);
// #766: the title's profile sheet and its profile client load only when Profile is pointed at, focused or pressed.
export const profileSheet = chunk(() => import("@/components/game/ProfileSheet"));
export const ProfileSheet = profileSheet.pick((m) => m.ProfileSheet);
// #766 slice 2: its Edit profile and Change PIN forms load when the sheet opens one of them.
export const profileForms = chunk(() => import("@/components/game/ProfileForms"));
export const ProfileForms = profileForms.pick((m) => m.ProfileForms);

export const sheets = chunk(() => import("@/components/game/sheets"));
export const CostCard = sheets.pick((m) => m.CostCard);
export const FortuneTray = sheets.pick((m) => m.FortuneTray);
export const HowTo = sheets.pick((m) => m.HowTo);
export const TradePanel = sheets.pick((m) => m.TradePanel);
export const WinScreen = sheets.pick((m) => m.WinScreen);

// The island behind every screen (#543 preloads it). #1281: one load through the chunk loader, shared by the canvas and the
// loading screen, so a failed download is retried under a fresh URL by Try again instead of leaving the screen stuck.
export const island = chunk(() => import("@/components/scene/IslandCanvas"));

// #1281: the startup loading screen, preloaded by the built page beside the index (vite.config.ts).
export const LoadingScreen = chunk(() => import("@/components/game/LoadingScreen")).pick((m) => m.LoadingScreen);

export const moments = chunk(() => import("@/components/game/moments"));
export const TurnMoment = moments.pick((m) => m.TurnMoment);
export const MyNumbers = moments.pick((m) => m.MyNumbers);
export const FirstGameCoach = moments.pick((m) => m.FirstGameCoach);
export const SetupPipHints = moments.pick((m) => m.SetupPipHints);

// #1285: trade toast and loss bars (discard, steal) moved out of initial index chunk.
export const tradeToast = chunk(() => import("@/components/game/TradeToast"));
export const TradeToast = tradeToast.pick((m) => m.TradeToast);

export const losses = chunk(() => import("@/components/game/losses"));
export const DiscardBar = losses.pick((m) => m.DiscardBar);
export const TakeFromBar = losses.pick((m) => m.TakeFromBar);

// A sibling of the lazy dock or panel inside its Suspense boundary: its effect runs on the commit that lands them, which is
// a commit later than the chatOpen or tradeOpen flip when the chunk was still loading, so the island measures the hole again.
export function ChromeLanded() {
  useEffect(() => useGame.getState().chromeLanded(), []);
  return null;
}
