import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { VictoryTargetSelect } from "@/components/game/VictoryTargetSelect";
import { Button } from "@/components/ui/button";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { SeatDot } from "@/components/game/SeatDot";
import { useGame } from "@/lib/game/store";
import type { Seat } from "@/lib/net/table";
import { chunk, LazyBoundary } from "@/lib/lazy";
import { cn } from "@/lib/utils";
import "./lobby.css";

// #1262: this chunk stays out of the index. It loads when Play games is opened; Ruffle mounts only after Play.
const Play = chunk(() => import("@/components/game/LobbyWaitBox")).pick((m) => m.LobbyPlay);

// Your own name is a button; a tap opens an input. Enter or leaving the field saves (the host cleans it and answers with the
// seat list), Escape puts it back. Empty is not sent: the old name stays.
function OwnName({ seat }: { seat: Seat }) {
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
    />
  );
}

export function LobbyView({ ConnectionStatus, ChatBox, SeatBubbles, HowTo, prefetchRules, fitCode }: { ConnectionStatus: typeof import("./ConnectionStatus").ConnectionStatus; ChatBox: typeof import("./Chat").ChatBox; SeatBubbles: typeof import("./Chat").SeatBubbles; HowTo: typeof import("./HowTo").HowTo; prefetchRules: () => Promise<boolean>; fitCode: (el: HTMLElement, code: string) => void }) {
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
  const [games, setGames] = useState(false);
  // #1263: a table-mate's tic-tac-toe invite is a badge on the tab, never a popup.
  const invited = useGame(s => s.ttt?.game?.status === "invited" && s.ttt.game.o === s.seatId);
  const [open, setOpen] = useState(false);
  const ready = seats.find(s => s.id === seatId)?.ready ?? false;
  const canStart = isHost && seats.length >= 3 && seats.length <= 4 && seats.every(s => s.ready);
  const readyCount = seats.filter(s => s.ready).length;
  const missing = 3 - seats.length;
  const status = missing > 0 ? `Need ${missing} more player${missing === 1 ? "" : "s"}` : readyCount === seats.length ? "Everyone is ready" : `${readyCount} of ${seats.length} ready`;
  const { state: copied, copy } = useCopy<"link">();
  const codeElement = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    // The host issues four-character codes. Preserve longer display fixtures unchanged.
    const el = codeElement.current;
    if (!el) return;
    el.style.fontSize = "";
    if (code.length !== 4) return;
    const observer = new ResizeObserver(() => {
      fitCode(el, code);
    });
    observer.observe(el.parentElement!);
    return () => observer.disconnect();
  }, [code, copied, fitCode]);
  const joinLink = () => {
    const host = new URLSearchParams(location.search).get("host");
    return `${location.origin}${location.pathname}?code=${code}${host ? `&host=${encodeURIComponent(host)}` : ""}`;
  };
  const pick = (play: boolean) => {
    setGames(play);
    if (!play) setOpen(false);
  };
  // #1430: Table and Play games are tabs. Left and Right switch between them; only the picked tab is in the Tab order.
  const tabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    pick(!games);
    (e.currentTarget.children[+!games] as HTMLElement).focus();
  };

  return (
    <>
      <div data-testid="lobby-card" className={cn("lobby-layout", open && "lg")}>
        <div className="lobby-cover lobby-layout-cover">
          <div className="lobby-header">
            {/* #1430: the code is the copy button. A tap copies the join link, and the code fades to a small "Copied" in place. */}
            <button type="button" className="lobby-code" data-copied={copied?.ok || undefined} aria-label={`Table code ${[...code].join(" ")}. Copy link`} onClick={() => copy("link", joinLink())}>
              <span ref={codeElement} data-testid="table-code" className="font-display">{code}</span>
              <span>Copied</span>
            </button>
          </div>
          {copied && !copied.ok ? <div className="lobby-copy-fallback"><CopyFallback state={copied} label="Join link" /></div> : <CopyFallback state={copied} label="Join link" />}
          <div className="lobby-rules">
            <div className="lm" role="tablist" aria-label="Lobby" onKeyDown={tabKey}>
              <button type="button" role="tab" aria-selected={!games} tabIndex={games ? -1 : 0} onClick={() => pick(false)}>Table</button>
              <button type="button" role="tab" aria-selected={games} tabIndex={games ? 0 : -1} aria-label={invited ? "Play games, 1 invite" : undefined} onClick={() => pick(true)}><span>Play games</span>{invited ? <b className="lb" aria-hidden="true">1</b> : null}</button>
            </div>
            <Button variant="outline" onPointerEnter={prefetchRules} onFocus={prefetchRules} onClick={e => setHowTo(true, e.currentTarget)}>Rules</Button>
            <div className="lobby-rule-status">
              <span data-testid="lobby-caption" className="max-w-full truncate">Wayfarer {rule}</span>
              <ConnectionStatus />
            </div>
          </div>
          {games ? <LazyBoundary failed={<button type="button" onClick={() => setGames(false)}>Close</button>}><Play onGame={setOpen} /></LazyBoundary> : (
          <>
          <ul data-testid="lobby-players" className="lobby-players">
            {[0, 1, 2, 3].map(i => {
              const s = seats[i];
              return (
                <li key={i} data-testid={s ? `lobby-seat-${s.id}` : undefined} className="lobby-player">
                  <SeatDot color={s?.color ?? "transparent"} className="dot" />
                  <span data-testid="lobby-name" className="lobby-name">
                    {s?.id === seatId ? <OwnName seat={s} /> : <span className="truncate">{s ? s.name : "Empty"}</span>}
                    {s?.host ? <span data-testid="host-tag" className="sr-only"> · host</span> : null}
                  </span>
                  <span className="lobby-player-status">{s ? `${s.host ? "Host · " : ""}${s.bot ? "Bot" : s.away ? "reconnecting…" : s.ready ? "Ready" : "Waiting"}` : ""}</span>
                  {s ? <span className="lobby-bubble"><LazyBoundary failed={null}><SeatBubbles by="seat" id={s.id} at="lobby" /></LazyBoundary></span> : null}
                  {s?.bot && isHost ? <Button variant="outline" data-testid="remove-bot" aria-label={`Remove ${s.name}`} onClick={() => removeBot(s.id)}><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg></Button> : null}
                  {!s && isHost ? <Button variant="outline" data-testid="add-bot" onClick={addBot}>Add bot</Button> : null}
                </li>
              );
            })}
          </ul>
          <div data-testid="lobby-chat" className="lobby-chat-panel">
            <ChatBox className="flex-1" rows={6} minRows={0} />
          </div>
          </>
          )}
          <div data-testid="lobby-actions" className="lobby-actions">
            <div className="lobby-summary">
              <p data-testid="lobby-status" aria-live="polite">{error ?? status}</p>
              <VictoryTargetSelect value={target} onChange={isHost ? setTarget : undefined} />
            </div>
            <div className="lobby-action-buttons">
              <Button variant="outline" onClick={() => setReady(!ready)}>{ready ? "Cancel ready" : "Ready"}</Button>
              {canStart ? <Button variant="sea" onClick={() => { setGames(false); setOpen(false); startTable(); }}>Start</Button> : null}
              <Button variant="ghost" onClick={goTitle}>Leave the table</Button>
            </div>
          </div>
        </div>
      </div>
      {howTo ? <LazyBoundary failed={<Button onClick={() => setHowTo(false)}>Close rules</Button>}><HowTo onClose={() => setHowTo(false)} /></LazyBoundary> : null}
    </>
  );
}
