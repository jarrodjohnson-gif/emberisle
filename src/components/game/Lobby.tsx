// The table lobby: code, seats, chat and Ready/Start. Online-only, so it loads with the chat as one lazy chunk (#488).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatBox, ReactionFloats } from "@/components/game/Chat";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";
import { useViewport } from "@/lib/viewport";

export function Lobby() {
  const code = useGame((s) => s.code);
  const seats = useGame((s) => s.seats);
  // The welcome flag goes stale when the host leaves; the live seat list is the truth (#249).
  const isHost = useGame((s) => s.seats.find((x) => x.id === s.seatId)?.host ?? s.isHost);
  const error = useGame((s) => s.error);
  const setReady = useGame((s) => s.setReady);
  const startTable = useGame((s) => s.startTable);
  const goTitle = useGame((s) => s.goTitle);
  const [ready, setReadyLocal] = useState(false);
  const { state: copied, copy } = useCopy<"code" | "link">();
  // #304: the join link. `?host=` is kept so a Vite dev page's link still dials the same host (src/lib/net/table.ts hostUrl).
  const copyLink = () => {
    const host = new URLSearchParams(location.search).get("host");
    copy("link", `${location.origin}${location.pathname}?code=${code}${host ? `&host=${encodeURIComponent(host)}` : ""}`);
  };
  const canStart = isHost && seats.length >= 3 && seats.length <= 4 && seats.every((s) => s.ready);
  // #418: what is still needed before Start appears, read off the seat list (docs/BUILD_BIBLE.md §3.3: 3 or 4 play).
  const missing = 3 - seats.length;
  const readyCount = seats.filter((s) => s.ready).length;
  const status =
    missing > 0
      ? `Need ${missing} more player${missing === 1 ? "" : "s"}`
      : readyCount < seats.length
        ? `${readyCount} of ${seats.length} ready`
        : "Everyone is ready";
  const { phone, portrait } = useViewport();
  const sheet = phone && portrait;
  const landscape = phone && !portrait;

  return (
    <div
      data-testid="lobby-card"
      className={cn(
        "absolute z-10 flex flex-col",
        sheet
          ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[55vh]"
          : landscape
            ? "top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] w-[min(44rem,calc(100%-1.5rem))]"
            : "bottom-5 left-5 top-5 w-full max-w-sm sm:bottom-6 sm:left-10 sm:top-6",
      )}
    >
      {/* #449: held sideways the card is two columns, as the title's is (#433): seats and chat on the left, the code, status,
          Ready/Start and Leave stacked on the right, so none of them needs a scroll. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md sm:p-6",
          landscape && "grid grid-cols-2 grid-rows-[auto_1fr] gap-x-5 p-4 sm:p-4",
        )}
      >
        <div className={cn(landscape && "col-start-2 row-start-1")}>
        <p className="text-xs uppercase tracking-[0.22em] text-sea-ink">Table code</p>
        <div className="mt-1 flex items-center gap-3">
          <p data-testid="table-code" className={cn("font-display tracking-[0.2em]", landscape ? "text-5xl" : "text-6xl")}>
            {code}
          </p>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="outline" onClick={() => copy("code", code)}>
              {copied?.ok && copied.what === "code" ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="outline" onClick={copyLink}>
              {copied?.ok && copied.what === "link" ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
        <CopyFallback state={copied} label={copied?.what === "link" ? "Join link" : "Table code"} className="mt-2" />
        </div>
        <div className={cn(landscape ? "col-start-1 row-span-2 row-start-1 flex min-h-0 flex-col" : "contents")}>
        <ul className={cn("flex flex-col gap-2", landscape ? "shrink-0" : "mt-5")}>
          {[0, 1, 2, 3].map((i) => {
            const s = seats[i];
            return (
              <li key={i} className={cn("relative flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3", landscape ? "py-1" : "py-2")}>
                <span className="size-3 rounded-full ring-1 ring-inset ring-black/25" style={{ background: s?.color ?? "transparent" }} />
                <span className="flex-1 text-sm">
                  {s ? s.name : "Empty"}
                  {s?.host ? <span data-testid="host-tag" className="text-xs text-muted"> · host</span> : null}
                </span>
                {s ? <span className="text-xs text-muted">{s.away ? "reconnecting…" : s.ready ? "Ready" : "Waiting"}</span> : null}
                {s ? <ReactionFloats by="seat" id={s.id} /> : null}
              </li>
            );
          })}
        </ul>
        {/* #417: the chat log is the one flexible piece (down to about 2 rows), so at 1280x720 Start and Leave stay inside the card. */}
        <div className={cn("mt-2 flex flex-col rounded-[12px] border border-border bg-surface p-2", landscape ? "min-h-0 flex-1" : "min-h-32")}>
          <ChatBox rows={6} />
        </div>
        </div>
        {/* #389: on a phone Ready/Start stay pinned to the bottom of the card; a fade above them says the rest scrolls. */}
        <div
          data-testid="lobby-actions"
          className={cn(
            "mt-3 flex flex-col gap-2",
            landscape && "col-start-2 row-start-2 justify-end",
            sheet &&
              "sticky -bottom-5 z-10 -mx-5 -mb-5 bg-surface px-5 pb-5 pt-2 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-gradient-to-t before:from-surface before:to-transparent",
          )}
        >
          {/* #418: one line on what is still needed, in the slot the "sat down" echo had (the seat rows already say who is here). */}
          <p data-testid="lobby-status" aria-live="polite" className="min-h-5 text-center text-xs text-muted">
            {error ?? status}
          </p>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              setReadyLocal(!ready);
              setReady(!ready);
            }}
          >
            {ready ? "Not ready" : "Ready"}
          </Button>
          {canStart ? (
            <Button size="lg" variant="sea" onClick={startTable}>
              Start
            </Button>
          ) : null}
          <Button variant="ghost" onClick={goTitle}>
            Leave the table
          </Button>
        </div>
      </div>
    </div>
  );
}
