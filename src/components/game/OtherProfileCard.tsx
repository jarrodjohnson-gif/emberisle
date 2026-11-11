import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { useBackdropClose } from "@/lib/backdrop-close";
import { useFocusTrap } from "@/lib/focus-trap";
import { useGame } from "@/lib/game/store";
import { play } from "@/lib/sound";
import type { Seat } from "@/lib/net/table";

export interface PublicProfileCardData {
  profileId?: string;
  displayName?: string;
  catchphrase?: string;
  games?: number;
  wins?: number;
  losses?: number;
  winRate?: number | null;
  streak?: number;
}

export function OtherProfileCard({
  seat,
  opener,
  onClose,
}: {
  seat: Seat;
  opener: HTMLElement | null;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useFocusTrap(root, true, undefined, opener);
  const backdrop = useBackdropClose(onClose);

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

  const profileId = seat.profile?.profileId;
  const card = useGame((s) => (profileId ? s.profileCards[profileId] : null));
  const requestProfileCard = useGame((s) => s.requestProfileCard);
  const seats = useGame((s) => s.seats);

  useEffect(() => {
    const match = seats.find((s) => s.id === seat.id);
    if (!match || match.profile?.profileId !== seat.profile?.profileId) onClose();
  }, [seats, seat, onClose]);

  useEffect(() => {
    if (profileId) requestProfileCard(profileId);
  }, [profileId, requestProfileCard]);

  const isGuest = !profileId || seat.bot;
  const isLoading = Boolean(profileId && (!card || card === "loading"));
  const isError = Boolean(profileId && card === "error");
  const data = (typeof card === "object" && card !== null ? card : null) as PublicProfileCardData | null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-end justify-center bg-white/45 p-safe sm:items-center"
      {...backdrop}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="other-profile-name"
        data-testid="other-profile-card"
        className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-sheet border border-white/50 bg-surface"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-1 pt-5">
          <div className="flex min-w-0 items-center gap-2">
            <SeatDot color={seat.color} className="size-4 shrink-0" />
            <h2 id="other-profile-name" data-testid="other-profile-title" className="truncate font-display text-2xl">
              {data?.displayName || seat.name}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" back>
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5 pt-3">
          {isGuest ? (
            <p data-testid="other-profile-guest" className="text-sm text-muted">
              Guest
            </p>
          ) : isLoading ? (
            <p data-testid="other-profile-loading" className="text-sm text-muted">
              Loading profile…
            </p>
          ) : isError ? (
            <p data-testid="other-profile-error" className="text-sm text-muted">
              Profiles unavailable on this host.
            </p>
          ) : data ? (
            <>
              {data.catchphrase ? (
                <p data-testid="other-profile-catchphrase" className="break-words text-sm text-fg">
                  “{data.catchphrase}”
                </p>
              ) : null}
              {typeof data.games === "number" ? (
                data.games === 0 ? (
                  <p data-testid="other-profile-empty" className="text-sm text-muted">
                    No finished games yet.
                  </p>
                ) : (
                  <div data-testid="other-profile-stats" className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted">Games: </span>
                      <span>{data.games}</span>
                    </div>
                    <div>
                      <span className="text-muted">Wins: </span>
                      <span>{data.wins}</span>
                    </div>
                    <div>
                      <span className="text-muted">Losses: </span>
                      <span>{data.losses ?? (typeof data.games === "number" && typeof data.wins === "number" ? Math.max(0, data.games - data.wins) : 0)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Win rate: </span>
                      <span>{data.winRate !== null ? `${data.winRate}%` : "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted">Streak: </span>
                      <span>{data.streak ?? 0}</span>
                    </div>
                  </div>
                )
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
