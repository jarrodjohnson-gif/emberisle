import { ConnectionStatus } from "@/components/game/ConnectionStatus";
import { chunk } from "@/lib/lazy";
import { ChatBox, SeatBubbles } from "@/components/game/Chat";

const lobby = chunk(() => import("@/components/game/LobbyView"));
const LobbyView = lobby.pick(m => m.LobbyView);
const rules = chunk(() => import("@/components/game/sheets"));
const HowTo = rules.pick(m => m.HowTo);
void lobby.prefetch();
export function Lobby() {
  return <LobbyView ConnectionStatus={ConnectionStatus} ChatBox={ChatBox} SeatBubbles={SeatBubbles} HowTo={HowTo} prefetchRules={rules.prefetch} fitCode={fitLobbyCode} />;
}

// Fits host-issued code text; the view owns observation and cleanup.
export function fitLobbyCode(el: HTMLParagraphElement, code: string) {
  if (el.textContent !== code) return;
  el.style.fontSize = "";
  const style = getComputedStyle(el);
  const range = document.createRange();
  range.selectNodeContents(el);
  const width = range.getBoundingClientRect().width, available = el.getBoundingClientRect().width;
  if (width <= available) return;
  const tracking = (parseFloat(style.letterSpacing) || 0) * 4;
  el.style.fontSize = `${parseFloat(style.fontSize) * (available - tracking) / (width - tracking)}px`;
}
