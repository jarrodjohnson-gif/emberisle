// #1350: the read-only card for another seat in the lobby (docs/design/profiles.md, "Other lobby card"). It shows what the
// host's public card holds, today the name and the catchphrase, and nothing while that is loading or unavailable.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { useBackdropClose } from "@/lib/backdrop-close";
import { useFocusTrap } from "@/lib/focus-trap";
import { cardReply, useGame } from "@/lib/game/store";
import { play } from "@/lib/sound";
import type { ProfileCardReply, Seat } from "@/lib/net/table";

// Each request has its own id, and the host sends it back. An answer to an earlier request is dropped.
let requests = 0;

export function OtherProfileCard({ seat, opener, onClose }: { seat: Seat; opener: HTMLElement; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useFocusTrap(root, true, undefined, opener);
  const backdrop = useBackdropClose(onClose);
  const profileId = seat.profile?.profileId;
  // undefined while the host has not answered; a profileError leaves a reply with no card.
  const [reply, setReply] = useState<ProfileCardReply>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      play("ui_back");
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (!profileId) return;
    const id = ++requests;
    cardReply.on = (msg) => {
      if (msg.id === id) setReply(msg);
    };
    useGame.getState().net?.ttt("tableProfileCard", { id, profileId });
    return () => {
      cardReply.on = undefined;
    };
  }, [profileId]);

  const card = reply?.card;
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-white/45 p-safe sm:items-center" {...backdrop}>
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="other-profile-name"
        data-testid="other-profile-card"
        className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-sheet border border-white/50 bg-surface"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-center gap-2">
            <SeatDot color={seat.color} className="size-4 shrink-0" />
            <h2 id="other-profile-name" className="truncate font-display text-2xl">{card?.displayName ?? seat.name}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" back>
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 text-sm" aria-busy={!!profileId && !reply}>
          {!profileId ? (
            <p data-testid="other-profile-guest" className="text-muted">Guest</p>
          ) : !reply ? (
            <p data-testid="other-profile-loading" className="text-muted">Loading…</p>
          ) : !card ? (
            <p data-testid="other-profile-error" className="text-muted">Profiles unavailable on this host.</p>
          ) : card.catchphrase ? (
            <p data-testid="other-profile-catchphrase" className="break-words text-fg">“{card.catchphrase}”</p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
