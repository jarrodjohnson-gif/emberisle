import { ConnectionStatus } from "@/components/game/ConnectionStatus";
import { chunk } from "@/lib/lazy";
import { ChatBox, SeatBubbles } from "@/components/game/Chat";

const lobby = chunk(() => import("@/components/game/LobbyView"));
const LobbyView = lobby.pick(m => m.LobbyView);
const rules = chunk(() => import("@/components/game/sheets"));
const HowTo = rules.pick(m => m.HowTo);
void lobby.prefetch();
export function Lobby() {
  return <LobbyView ConnectionStatus={ConnectionStatus} ChatBox={ChatBox} SeatBubbles={SeatBubbles} HowTo={HowTo} prefetchRules={rules.prefetch} />;
}
