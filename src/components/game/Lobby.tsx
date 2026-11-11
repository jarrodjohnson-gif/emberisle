import { useState } from "react";
import { ConnectionStatus } from "@/components/game/ConnectionStatus";
import { chunk } from "@/lib/lazy";
import { ChatBox, SeatBubbles } from "@/components/game/Chat";
import type { Seat } from "@/lib/net/table";

const lobby = chunk(() => import("@/components/game/LobbyView"));
const LobbyView = lobby.pick(m => m.LobbyView);
const rules = chunk(() => import("@/components/game/sheets"));
const HowTo = rules.pick(m => m.HowTo);
const Card = chunk(() => import("@/components/game/OtherProfileCard")).pick(m => m.OtherProfileCard);
void lobby.prefetch();

const joinLink = (c: string) => `${location.origin}${location.pathname}?code=${c}` + (location.search.match(/[?&]host=[^&#]+/)?.[0]?.replace("?", "&") || "");

export function Lobby() {
  const [c, setC] = useState<{ seat: Seat; opener: HTMLElement }>();
  return (
    <>
      <LobbyView
        ConnectionStatus={ConnectionStatus}
        ChatBox={ChatBox}
        SeatBubbles={SeatBubbles}
        HowTo={HowTo}
        onProfile={(seat, opener) => setC({ seat, opener })}
        prefetchRules={rules.prefetch}
        fitCode={fitLobbyCode}
        getJoinLink={joinLink}
      />
      {c && <Card {...c} onClose={() => setC(undefined)} />}
    </>
  );
}

// Fits host-issued code text; the view owns observation and cleanup.
function fitLobbyCode(el: HTMLElement, code: string) {
  if (el.textContent !== code) return;
  el.style.fontSize = "";
  const s = getComputedStyle(el), r = document.createRange();
  r.selectNodeContents(el);
  const w = r.getBoundingClientRect().width, a = el.getBoundingClientRect().width;
  if (w <= a) return;
  const t = (parseFloat(s.letterSpacing) || 0) * 4;
  el.style.fontSize = `${parseFloat(s.fontSize) * (a - t) / (w - t)}px`;
}
