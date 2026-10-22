// The table lobby: code, seats, chat and Ready/Start. Online-only, so it loads with the chat as one lazy chunk (#488).
import { VictoryTargetSelect } from "@/components/game/VictoryTargetSelect";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatBox, SeatBubbles } from "@/components/game/Chat";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { LobbyWaitBox } from "@/components/game/chunks";
import { SeatDot } from "@/components/game/SeatDot";
import { useGame } from "@/lib/game/store";
import type { Seat } from "@/lib/net/table";
import { LazyBoundary } from "@/lib/lazy";
import { cn } from "@/lib/utils";
import { useViewport } from "@/lib/viewport";

// Your own name is a button; a tap opens an input. Enter or leaving the field saves (the host cleans it and answers with the
// seat list), Escape puts it back. Empty is not sent: the old name stays.
function OwnName({ seat, compact }: { seat: Seat; compact: boolean }) {
  const rename = useGame((s) => s.renameSeat);
  const [draft, setDraft] = useState<string | null>(null);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && draft !== null && draft.trim() && draft.trim() !== seat.name) rename(draft);
    setDraft(null);
  };
  if (draft === null) {
    return (
      <button
        type="button"
        data-testid="rename-seat"
        aria-label={`Your name is ${seat.name}. Change it`}
        onClick={() => {
          done.current = false;
          setDraft(seat.name);
        }}
        className={cn("min-w-0 cursor-pointer truncate text-left text-sm underline decoration-dotted underline-offset-4", compact ? "" : "-my-1 min-h-11 min-w-11")}
      >
        {seat.name}
      </button>
    );
  }
  return (
    <input
      data-testid="rename-input"
      aria-label="Your name"
      autoFocus
      value={draft}
      maxLength={16}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      className={cn("min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-base text-fg", compact ? "h-7" : "-my-1 h-11")}
    />
  );
}

export function Lobby() {
  const rule = useGame((s) => s.tableWayfarerMode);
  const code = useGame((s) => s.code);
  const seats = useGame((s) => s.seats);
  // The welcome flag goes stale when the host leaves; the live seat list is the truth (#249).
  const isHost = useGame((s) => s.seats.find((x) => x.id === s.seatId)?.host ?? s.isHost);
  const error = useGame((s) => s.error);
  const setReady = useGame((s) => s.setReady);
  const startTable = useGame((s) => s.startTable);
  const goTitle = useGame((s) => s.goTitle);
  const seatId = useGame((s) => s.seatId);
  const ready = seats.find((s) => s.id === seatId)?.ready ?? false;
  const target = useGame((s) => s.tableVictoryTarget);
  const setTarget = useGame((s) => s.setVictoryTarget);
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
  const addBot = useGame((s) => s.addBot);
  const removeBot = useGame((s) => s.removeBot);
  const { phone, portrait } = useViewport();
  const sheet = phone && portrait;
  const landscape = phone && !portrait;
  // #895: a fine pointer at 1280x720 must fit the code, four seats, the chat (tabs, a log line, the emoji, the input) and
  // Ready/Start/Leave in 672 px. As the Chat C lobby mock does, its secondary controls are 32 px there; touch keeps 44 px.
  const desk = !phone;
  const small = desk ? "h-8" : undefined;

  return (
    <div
      data-testid="lobby-card"
      className={cn(
        "absolute z-10 flex flex-col",
        sheet
          ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[calc(100dvh-max(0.75rem,env(safe-area-inset-top))-max(0.75rem,env(safe-area-inset-bottom))-0.75rem)]"
          : landscape
            ? "top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] w-[min(44rem,calc(100%-1.5rem))]"
            : "bottom-5 left-5 top-5 w-full max-w-sm sm:bottom-6 sm:left-10 sm:top-6",
      )}
    >
      {/* #449: held sideways the card is two columns, as the title's is (#433): seats and chat on the left, the code, status,
          Ready/Start and Leave stacked on the right, so none of them needs a scroll. */}
      <div
        className={cn(
          "lobby-cover flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[20px] border border-white/50 bg-surface p-5 backdrop-blur-md sm:p-6",
          landscape && "grid grid-cols-[minmax(0,3fr)_minmax(max-content,2fr)] grid-rows-[auto_1fr] gap-x-5 px-4 py-3 sm:px-4 sm:py-3",
        )}
      >
        <div className={cn(landscape && "col-start-2 row-start-1")}>
        <p className="text-caption font-semibold text-sea-ink">Table code · Wayfarer <span className="capitalize">{rule}</span></p>
        <div className="mt-1 flex items-center gap-3">
          <p
            data-testid="table-code"
            className={cn(
              "font-display",
              landscape
                ? "text-4xl tracking-[0.15em]"
                : "text-4xl tracking-[0.15em] sm:text-6xl sm:tracking-[0.2em]",
            )}
          >
            {code}
          </p>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="outline" className={small} onClick={() => copy("code", code)}>
              {copied?.ok && copied.what === "code" ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="outline" className={small} onClick={copyLink}>
              {copied?.ok && copied.what === "link" ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
        <CopyFallback state={copied} label={copied?.what === "link" ? "Join link" : "Table code"} className="mt-2" />
        </div>
        <div className={cn(landscape ? "col-start-1 row-span-2 row-start-1 flex min-h-0 flex-col" : "contents")}>
        {/* #899: held sideways the seats are a 2x2 grid in the wider left column, so the chat under them has the height for the
            Sounds & stickers tab (nine 44 px chips and the presets). */}
        <ul className={cn(landscape ? "grid grid-cols-2" : "flex flex-col", sheet ? "gap-1.5" : "gap-2", landscape ? "shrink-0 gap-1.5" : sheet ? "mt-3" : "mt-4 shrink-0")}>
          {[0, 1, 2, 3].map((i) => {
            const s = seats[i];
            return (
              <li key={i} data-testid={s ? `lobby-seat-${s.id}` : undefined} className={cn("relative flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3", sheet ? "min-h-11 py-0" : landscape ? "min-w-0 gap-2 py-1" : "min-h-10 py-0")}>
                <SeatDot color={s?.color ?? "transparent"} className="size-3 shrink-0 ring-1 ring-inset ring-black/25" />
                <span data-testid="lobby-name" className="flex min-w-0 items-center overflow-hidden text-sm">
                  {s && s.id === seatId ? <OwnName seat={s} compact={desk} /> : <span className="truncate">{s ? s.name : "Empty"}</span>}
                  {s?.host ? <span data-testid="host-tag" className="shrink-0 whitespace-pre text-xs text-muted"> · host</span> : null}
                </span>
                {/* #899: the seat's bubble hangs mid-row, in the room between the name and the status, so it never covers the name. */}
                <span className="flex min-w-0 flex-1 justify-center">{s ? <LazyBoundary failed={null}><SeatBubbles by="seat" id={s.id} at="lobby" /></LazyBoundary> : null}</span>
                {s ? <span className="shrink-0 text-xs text-muted">{s.bot ? "Bot" : s.away ? "reconnecting…" : s.ready ? "Ready" : "Waiting"}</span> : null}
                {s?.bot && isHost ? (
                  <Button size="sm" variant="outline" className={small} data-testid="remove-bot" aria-label={`Remove ${s.name}`} onClick={() => removeBot(s.id)}>
                    Remove
                  </Button>
                ) : null}
                {!s && isHost ? (
                  <Button size="sm" variant="outline" className={small} data-testid="add-bot" onClick={addBot}>
                    Add bot
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {/* #417, #895: the chat sits below the seats and its log is the one flexible piece (down to one line), so at 1280x720 the
            tabs, the emoji, the input and Send stay above the Ready footer, and Start and Leave stay inside the card. */}
        <div data-testid="lobby-chat" className={cn("mt-2 flex flex-col rounded-[12px] border border-border bg-surface p-2", landscape ? "min-h-0 flex-1" : sheet ? "min-h-[16.5rem] shrink-0" : "min-h-0 flex-1")}>
          <ChatBox className="flex-1" rows={6} minRows={sheet ? 4 : landscape ? 0 : 1} dense={desk} />
        </div>
        <LazyBoundary failed={null}><LobbyWaitBox /></LazyBoundary>
        </div>
        {/* #389: on a phone Ready/Start stay pinned to the bottom of the card; a fade above them says the rest scrolls. */}
        <div
          data-testid="lobby-actions"
          className={cn(
            "mt-3 flex shrink-0 flex-col gap-2 sticky bottom-0 z-10 bg-surface",
            landscape && "col-start-2 row-start-2 mt-1 justify-end gap-1",
            sheet &&
              "sticky -bottom-5 z-10 -mx-5 -mb-5 bg-surface px-5 pb-5 pt-2 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-gradient-to-t before:from-surface before:to-transparent",
          )}
        >
          {/* #418: one line on what is still needed, in the slot the "sat down" echo had (the seat rows already say who is here). */}
          <div className="flex items-center gap-2">
            <p data-testid="lobby-status" aria-live="polite" className="min-h-5 min-w-0 flex-1 text-center text-xs text-muted">
              {error ?? status}
            </p>
            <VictoryTargetSelect value={target} onChange={isHost ? setTarget : undefined} />
          </div>
          {/* #895: on a desktop, Start joins Ready's row, so the host's chat input stays above the footer when Start appears. */}
          <div className={cn("flex gap-2", desk ? "[&>*]:flex-1" : "flex-col", landscape && "gap-1")}>
            <Button
              size={landscape ? "default" : "lg"}
              variant="outline"
              onClick={() => {
                setReady(!ready);
              }}
            >
              {ready ? "Not ready" : "Ready"}
            </Button>
            {canStart ? (
              <Button size={landscape ? "default" : "lg"} variant="sea" onClick={startTable}>
                Start
              </Button>
            ) : null}
          </div>
          <Button variant="ghost" className={small} onClick={goTitle}>
            Leave the table
          </Button>
        </div>
      </div>
    </div>
  );
}
