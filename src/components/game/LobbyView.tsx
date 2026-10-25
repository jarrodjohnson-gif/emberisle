import { useRef, useState } from "react";
import { VictoryTargetSelect } from "@/components/game/VictoryTargetSelect";
import { Button } from "@/components/ui/button";
import { ChatBox, SeatBubbles } from "@/components/game/Chat";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { SeatDot } from "@/components/game/SeatDot";
import { chunk } from "@/lib/lazy";
import { useGame } from "@/lib/game/store";
import type { Seat } from "@/lib/net/table";
import { LazyBoundary } from "@/lib/lazy";
import { cn } from "@/lib/utils";
import "./lobby.css";

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

const rules = chunk(() => import("@/components/game/HowTo"));
const HowTo = rules.pick(m => m.HowTo);

export function LobbyView() {
  const rule = useGame(s => s.tableWayfarerMode);
  const code = useGame(s => s.code);
  const seats = useGame(s => s.seats);
  const seatId = useGame(s => s.seatId);
  const isHost = useGame(s => s.seats.find(x => x.id === s.seatId)?.host ?? s.isHost);
  const error = useGame(s => s.error);
  const setReady = useGame(s => s.setReady);
  const startTable = useGame(s => s.startTable);
  const goTitle = useGame(s => s.goTitle);
  const target = useGame(s => s.tableVictoryTarget);
  const setTarget = useGame(s => s.setVictoryTarget);
  const addBot = useGame(s => s.addBot);
  const removeBot = useGame(s => s.removeBot);
  const howTo = useGame(s => s.howTo);
  const setHowTo = useGame(s => s.setHowTo);
  const ready = seats.find(s => s.id === seatId)?.ready ?? false;
  const canStart = isHost && seats.length >= 3 && seats.length <= 4 && seats.every(s => s.ready);
  const readyCount = seats.filter(s => s.ready).length;
  const missing = 3 - seats.length;
  const status = missing > 0 ? `Need ${missing} more player${missing === 1 ? "" : "s"}` : readyCount === seats.length ? "Everyone is ready" : `${readyCount} of ${seats.length} ready`;
  const { state: copied, copy } = useCopy<"code" | "link">();
  const joinLink = () => {
    const host = new URLSearchParams(location.search).get("host");
    return `${location.origin}${location.pathname}?code=${code}${host ? `&host=${encodeURIComponent(host)}` : ""}`;
  };
  const invite = async () => {
    if (!navigator.share) return copy("link", joinLink());
    try {
      await navigator.share({ title: "Emberisle", text: `Join table ${code}`, url: joinLink() });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) copy("link", joinLink());
    }
  };

  return (
    <>
      <div data-testid="lobby-card" className="lobby-layout absolute z-10">
        <div className="lobby-cover lobby-layout-cover">
          <header className="lobby-header">
            <p data-testid="table-code" className="font-display">{code}</p>
            <div className="lobby-copy-controls">
              <Button variant="outline" onClick={() => copy("code", code)}>{copied?.ok && copied.what === "code" ? "Copied" : "Copy"}</Button>
              <Button variant="outline" onClick={() => copy("link", joinLink())}>{copied?.ok && copied.what === "link" ? "Copied" : "Copy link"}</Button>
              <Button variant="outline" onClick={invite}>Invite</Button>
            </div>
          </header>
          {copied && !copied.ok ? <div className="lobby-copy-fallback"><CopyFallback state={copied} label={copied.what === "link" ? "Join link" : "Table code"} /></div> : <CopyFallback state={copied} label="Table code" />}
          <div className="lobby-rules">
            <Button variant="outline" onPointerEnter={rules.prefetch} onFocus={rules.prefetch} onClick={e => setHowTo(true, e.currentTarget)}>Rules</Button>
            <span className="lobby-rule-status">Wayfarer {rule}</span>
          </div>
          <ul data-testid="lobby-players" className="lobby-players">
            {[0, 1, 2, 3].map(i => {
              const s = seats[i];
              return (
                <li key={i} data-testid={s ? `lobby-seat-${s.id}` : undefined} className="lobby-player">
                  <SeatDot color={s?.color ?? "transparent"} className="size-3 shrink-0 ring-1 ring-inset ring-black/25" />
                  <span data-testid="lobby-name" className="lobby-name">
                    {s?.id === seatId ? <OwnName seat={s} compact={false} /> : <span className="truncate">{s ? s.name : "Empty"}</span>}
                    {s?.host ? <span data-testid="host-tag" className="sr-only"> · host</span> : null}
                  </span>
                  <span className="lobby-player-status">{s ? `${s.host ? "Host · " : ""}${s.bot ? "Bot" : s.away ? "reconnecting…" : s.ready ? "Ready" : "Waiting"}` : ""}</span>
                  {s ? <span className="lobby-bubble"><LazyBoundary failed={null}><SeatBubbles by="seat" id={s.id} at="lobby" /></LazyBoundary></span> : null}
                  {s?.bot && isHost ? <Button variant="outline" data-testid="remove-bot" aria-label={`Remove ${s.name}`} onClick={() => removeBot(s.id)}>Remove</Button> : null}
                  {!s && isHost ? <Button variant="outline" data-testid="add-bot" onClick={addBot}>Add bot</Button> : null}
                </li>
              );
            })}
          </ul>
          <div data-testid="lobby-chat" className="lobby-chat-panel">
            <ChatBox className="flex-1" rows={6} minRows={0} />
          </div>
          <div data-testid="lobby-actions" className="lobby-actions">
            <div className="lobby-summary">
              <p data-testid="lobby-status" aria-live="polite">{error ?? status}</p>
              <VictoryTargetSelect value={target} onChange={isHost ? setTarget : undefined} />
            </div>
            <div className="lobby-action-buttons">
              <Button variant="outline" onClick={() => setReady(!ready)}>{ready ? "Not ready" : "Ready"}</Button>
              {isHost ? <Button variant="sea" disabled={!canStart} onClick={startTable}>Start</Button> : null}
              <Button variant="ghost" onClick={goTitle}>Leave the table</Button>
            </div>
          </div>
        </div>
      </div>
      {howTo ? <LazyBoundary failed={<Button onClick={() => setHowTo(false)}>Close rules</Button>}><HowTo onClose={() => setHowTo(false)} /></LazyBoundary> : null}
    </>
  );
}
