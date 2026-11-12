import { useState } from "react";
import { ConnectionStatus } from "@/components/game/ConnectionStatus";
import { chunk, LazyBoundary } from "@/lib/lazy";
import { ChatBox, SeatBubbles } from "@/components/game/Chat";
import type { Seat } from "@/lib/net/table";

const lobby = chunk(() => import("@/components/game/LobbyView"));
const LobbyView = lobby.pick(m => m.LobbyView);
const rules = chunk(() => import("@/components/game/sheets"));
const HowTo = rules.pick(m => m.HowTo);
// #1350: the read-only card for another seat loads when a name is first pressed.
const Card = chunk(() => import("@/components/game/OtherProfileCard")).pick(m => m.OtherProfileCard);
void lobby.prefetch();
export function Lobby() {
  return <LobbyView ConnectionStatus={ConnectionStatus} ChatBox={ChatBox} SeatBubbles={SeatBubbles} HowTo={HowTo} SeatName={SeatName} prefetchRules={rules.prefetch} fitCode={fitLobbyCode} />;
}

// Fits host-issued code text; the view owns observation and cleanup.
function fitLobbyCode(el: HTMLElement, code: string) {
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

// #1350: another player's name is a button that opens their card. A bot or an empty seat stays plain text. The card
// belongs to one seat and one profile: when either changes under it, it is gone.
function SeatName({ seat }: { seat?: Seat }) {
  const [open, setOpen] = useState<{ el: HTMLElement; key: string }>();
  if (!seat || seat.bot) return <span className="truncate">{seat ? seat.name : "Empty"}</span>;
  const key = seat.id + seat.profile?.profileId;
  return (
    <>
      <button type="button" data-testid={`lobby-player-${seat.id}`} onClick={e => setOpen({ el: e.currentTarget, key })}>{seat.name}</button>
      {open?.key === key ? <LazyBoundary failed={null}><Card seat={seat} opener={open.el} onClose={() => setOpen(undefined)} /></LazyBoundary> : null}
    </>
  );
}
