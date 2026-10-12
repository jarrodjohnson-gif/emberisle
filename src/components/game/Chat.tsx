// The table chat dock, the shared chat box, and floating reactions. Design: docs/design/chat.md.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessageSquare, Minus, Smile, VolumeX } from "lucide-react";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { EMOTES } from "@/components/game/emotes";
import { QuickReactions, useMutedSeats } from "@/components/game/Reactions";
import { useGame, type GameLogLine } from "@/lib/game/store";
import type { ChatLine } from "@/lib/net/table";
import { cn } from "@/lib/utils";
import { useViewport } from "@/lib/viewport";

export { ReactionFloats } from "@/components/game/Reactions";

const PRESETS = ["gg", "nice roll", "your turn", "one sec", "ty"];
const INPUT_ID = "chat-input";
// The Open chat button sets this before the dock opens, and the dock focuses the input once it has (the two are separate components).
const focusNext = { current: false };

// Text renders only as React children. The mention is found with split() on the literal "@name", never a regex.
function Mention({ text, name }: { text: string; name: string }) {
  const parts = text.split(`@${name}`);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 ? <mark className="rounded bg-accent/25 px-0.5 text-inherit">{`@${name}`}</mark> : null}
          {part}
        </span>
      ))}
    </>
  );
}

// A watcher has no name at the table (docs/design/spectator.md), so nothing is a mention of it.
function useMyName() {
  return useGame((s) => (s.spectator ? "" : (s.seats.find((x) => x.id === s.seatId)?.name ?? s.name)));
}

function Line({ line, me }: { line: ChatLine; me: string }) {
  return (
    <li className="break-words text-xs leading-snug text-zinc-900">
      <span className="mr-1 inline-block size-2 rounded-full align-baseline" style={{ background: line.color }} />
      <span className="mr-1 font-medium text-zinc-700">
        {line.name}
      </span>
      {me ? <Mention text={line.text} name={me} /> : line.text}
    </li>
  );
}

// A game log line (#305): a muted system row, no speaker.
function LogRow({ line }: { line: GameLogLine }) {
  return (
    <li data-testid="log-row" className="break-words text-xs leading-snug text-zinc-700">
      {line.text}
    </li>
  );
}

const CHIP = "cursor-pointer rounded-full bg-glass px-2 py-0.5 text-xs text-zinc-700 hover:text-zinc-900";

// The log, the preset chips, the emote tray, and the input. `onEscape` is the dock's minimize.
// `game` (the in-game dock, not the Lobby) lists the game log in with the chat, behind a Chat/All filter, with Copy log.
export function ChatBox({ rows, game, onEscape, className }: { rows: number; game?: boolean; onEscape?: () => void; className?: string }) {
  const chat = useGame((s) => s.chat);
  const gameLog = useGame((s) => s.gameLog);
  const code = useGame((s) => s.code);
  const filter = useGame((s) => s.logFilter);
  const setFilter = useGame((s) => s.setLogFilter);
  const draft = useGame((s) => s.chatDraft);
  const setDraft = useGame((s) => s.setChatDraft);
  const sendChat = useGame((s) => s.sendChat);
  const sendReact = useGame((s) => s.sendReact);
  const spectator = useGame((s) => s.spectator);
  const { muted } = useMutedSeats(code);
  const me = useMyName();
  const [tray, setTray] = useState(false);
  const { state: copied, copy } = useCopy<"log">();
  const log = useRef<HTMLUListElement>(null);
  const stuck = useRef(true);
  const withLog = game && filter === "all";
  const visibleChat = chat.filter((line) => !muted.has(line.seat));

  useEffect(() => {
    const el = log.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [chat, gameLog, withLog]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    sendChat(text);
    setDraft("");
  };

  const copyLog = () => copy("log", gameLog.map((l) => l.text).join("\n"));

  // Chat and game lines in the order this browser saw them (both `at` stamps are its own clock, store.ts). The sort is
  // stable, so each kind keeps its own order when stamps tie.
  const lines: { at: number; node: ReactNode }[] = visibleChat.map((line) => ({ at: line.at, node: <Line key={`c${line.id}`} line={line} me={me} /> }));
  if (withLog) {
    for (const [i, line] of gameLog.entries()) lines.push({ at: line.at, node: <LogRow key={`g${i}`} line={line} /> });
    lines.sort((x, y) => x.at - y.at);
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      {game ? (
        <div className="flex shrink-0 items-center gap-1">
          <div role="group" aria-label="Show" className="flex gap-1">
            {(["chat", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(CHIP, filter === f && "font-semibold underline underline-offset-2")}
              >
                {f === "chat" ? "Chat" : "All"}
              </button>
            ))}
          </div>
          <button type="button" onClick={copyLog} className={cn(CHIP, "ml-auto")}>
            {copied?.ok ? "Copied" : "Copy log"}
          </button>
        </div>
      ) : null}
      {game ? (
        <CopyFallback
          state={copied}
          label="Game log"
          className="shrink-0 text-zinc-700 [&_textarea]:rounded-control [&_textarea]:border-0 [&_textarea]:bg-glass"
        />
      ) : null}
      <ul
        ref={log}
        data-testid="chat-log"
        role="log"
        aria-label="Chat"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        }}
        className="flex min-h-0 flex-col gap-1 overflow-y-auto"
        style={{ height: rows * 18, flex: "1 1 auto" }}
      >
        {lines.map((l) => l.node)}
      </ul>
      {spectator ? (
        // Read-only (docs/design/spectator.md): the log and the filter stay; the chips, tray and input are this one line.
        <p data-testid="chat-readonly" className="shrink-0 text-xs text-zinc-700">
          Watching — chat is read-only
        </p>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => sendChat(p)}
                className={CHIP}
              >
                {p}
              </button>
            ))}
          </div>
          {tray ? (
            <div className="grid grid-cols-6 gap-1" data-testid="emote-tray">
              {Object.entries(EMOTES).map(([id, url]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={`React ${id}`}
                  onClick={() => {
                    sendReact(id);
                    setTray(false);
                  }}
                  className="cursor-pointer rounded-control bg-glass p-0.5"
                >
                  <img src={url} alt="" className="size-8 object-contain" />
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="Emotes"
              aria-expanded={tray}
              onClick={() => setTray(!tray)}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control bg-glass text-zinc-700 hover:text-zinc-900"
            >
              <Smile className="size-4" />
            </button>
            <input
              id={INPUT_ID}
              value={draft}
              maxLength={200}
              placeholder="Say something…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") send();
                if (e.key === "Escape") {
                  e.currentTarget.blur();
                  onEscape?.();
                }
              }}
              className="h-8 min-w-0 flex-1 rounded-control bg-glass px-2 text-sm text-zinc-900 placeholder:text-zinc-700"
            />
            <button
              type="button"
              onClick={send}
              className="h-8 cursor-pointer rounded-control bg-fg px-3 text-sm font-medium text-bg hover:bg-fg/90"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MuteMenu({ above = false }: { above?: boolean }) {
  const seats = useGame((s) => s.seats);
  const seatId = useGame((s) => s.seatId);
  const code = useGame((s) => s.code);
  const mode = useGame((s) => s.mode);
  const { muted, toggle } = useMutedSeats(code);
  const [open, setOpen] = useState(false);
  const targets = mode === "online" ? seats.filter((seat) => seat.id !== seatId && seat.name) : [];

  if (!targets.length) return null;

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="chat-mute-toggle"
        aria-label="Mute players"
        aria-expanded={open}
        aria-controls="chat-mute-panel"
        title="Mute players"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-control bg-glass px-2 text-xs text-zinc-700 hover:text-zinc-900"
      >
        <VolumeX className="size-4" />
        <span>Mute</span>
      </button>
      {open ? (
        <div
          id="chat-mute-panel"
          data-testid="chat-mute-panel"
          role="group"
          aria-label="Mute players"
          className={cn(
            "absolute right-0 z-40 flex max-h-[min(50vh,220px)] min-w-40 flex-col gap-1 overflow-y-auto rounded-chip bg-glass p-2 backdrop-blur-md",
            above ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {targets.map((seat) => {
            const isMuted = muted.has(seat.id);
            return (
              <button
                key={seat.id}
                type="button"
                data-testid={`chat-mute-seat-${seat.id}`}
                aria-label={`${isMuted ? "Unmute" : "Mute"} player ${seat.name}`}
                aria-pressed={isMuted}
                onClick={() => toggle(seat.id)}
                className="h-11 shrink-0 cursor-pointer rounded-control bg-glass px-3 text-left text-sm text-zinc-700 hover:text-zinc-900"
              >
                {isMuted ? `Unmute ${seat.name}` : `Mute ${seat.name}`}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Preview({ className }: { className?: string }) {
  const chat = useGame((s) => s.chat);
  const code = useGame((s) => s.code);
  const { muted } = useMutedSeats(code);
  const seen = useRef<Map<number, number>>(new Map(chat.map((l) => [l.id, 0])));
  const [, tick] = useState(0);

  for (const l of chat) if (!seen.current.has(l.id)) seen.current.set(l.id, Date.now());

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, []);

  const now = Date.now();
  const live = chat.filter((l) => {
    if (muted.has(l.seat)) return false;
    const at = seen.current.get(l.id) ?? 0;
    return at > 0 && now - at < 7000;
  }).slice(-3);

  return (
    <ul className={cn("pointer-events-none flex w-72 flex-col items-end gap-1", className)} data-testid="chat-preview">
      {live.map((l) => (
        <li
          key={l.id}
          className="max-w-full break-words rounded-chip bg-glass px-2 py-0.5 text-xs text-zinc-900 backdrop-blur-md transition-opacity duration-1000"
          style={{ opacity: now - (seen.current.get(l.id) ?? 0) < 6000 ? 1 : 0 }}
        >
          <span className="mr-1 inline-block size-2 rounded-full" style={{ background: l.color }} />
          <span className="mr-1 font-medium text-zinc-700">
            {l.name}
          </span>
          {l.text}
        </li>
      ))}
    </ul>
  );
}

// The store's unread count, less the lines from seats this browser has muted (they are hidden in the chat too).
function useUnmutedUnread() {
  const unreadTotal = useGame((s) => s.unread);
  const open = useGame((s) => s.chatOpen);
  const chat = useGame((s) => s.chat);
  const seatId = useGame((s) => s.seatId);
  const code = useGame((s) => s.code);
  const { muted } = useMutedSeats(code);
  const [unreadBySeat, setUnreadBySeat] = useState<Map<string, number>>(() => new Map());
  const previousChat = useRef(chat);
  const unreadBySeatRef = useRef(new Map<string, number>());
  useEffect(() => {
    if (open || unreadTotal === 0) {
      unreadBySeatRef.current.clear();
    } else {
      const previousIds = new Set(previousChat.current.map((line) => line.id));
      for (const line of chat) {
        if (!previousIds.has(line.id) && line.seat !== seatId) {
          unreadBySeatRef.current.set(line.seat, (unreadBySeatRef.current.get(line.seat) ?? 0) + 1);
        }
      }
    }
    previousChat.current = chat;
    setUnreadBySeat(new Map(unreadBySeatRef.current));
  }, [chat, open, seatId, unreadTotal]);
  return [...unreadBySeat].reduce((count, [seat, messages]) => count + (muted.has(seat) ? 0 : messages), 0);
}

// The two table buttons, in the top row beside the Table menu (Hud's header). They sit in that row's flow, so they keep the same
// 44 px place on every phone and turn, and the seat strip beside them in a sideways phone gives way to them.
export function ChatControls() {
  const mode = useGame((s) => s.mode);
  const open = useGame((s) => s.chatOpen);
  const unread = useUnmutedUnread();
  const setOpen = useGame((s) => s.setChatOpen);
  if (mode !== "online") return null;
  const openButton = (
    <button
      type="button"
      aria-label={unread ? `Open chat, ${unread} unread` : "Open chat"}
      onClick={() => {
        focusNext.current = true;
        setOpen(true);
      }}
      className="pointer-events-auto relative flex size-11 cursor-pointer items-center justify-center rounded-control bg-glass text-zinc-700 backdrop-blur-md hover:text-zinc-900"
    >
      <MessageSquare className="size-5" />
      {unread > 0 ? (
        <span
          data-testid="chat-unread"
          className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-medium text-white"
        >
          {unread}
        </span>
      ) : null}
    </button>
  );

  return (
    <>
      {open ? null : openButton}
      <QuickReactions />
    </>
  );
}

export function ChatDock() {
  const mode = useGame((s) => s.mode);
  const open = useGame((s) => s.chatOpen);
  const setOpen = useGame((s) => s.setChatOpen);
  const { phone, portrait } = useViewport();

  // A remembered open dock must not cover the hand bar when Play starts on a phone. The stored value stays for desktop.
  useEffect(() => {
    if (phone) useGame.setState({ chatOpen: false });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || useGame.getState().mode !== "online") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a, [role=button], [role=radio], input, select, textarea")) return;
      e.preventDefault();
      focusNext.current = true;
      useGame.getState().setChatOpen(true);
      document.getElementById(INPUT_ID)?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open && focusNext.current) {
      focusNext.current = false;
      document.getElementById(INPUT_ID)?.focus();
    }
  }, [open]);

  if (mode !== "online") return null;

  const minimize = (
    <button
      type="button"
      aria-label="Minimize chat"
      onClick={() => setOpen(false)}
      className="flex size-6 cursor-pointer items-center justify-center rounded-control bg-glass text-zinc-700 hover:text-zinc-900"
    >
      <Minus className="size-4" />
    </button>
  );
  // On a phone the open dock is a bottom sheet. The backdrop catches the tap that closes it, so that tap never reaches the board.
  if (phone && open) {
    return (
      <>
        <div data-testid="chat-backdrop" className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
        <section
          aria-label="Table chat"
          data-testid="chat-sheet"
          className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 rounded-t-chip bg-glass px-safe pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md"
          style={{ height: "min(48vh, 320px)" }}
        >
          <div data-testid="chat-sheet-header" className="flex shrink-0 items-center justify-between">
            <h2 className="text-sm font-medium">Table chat</h2>
            <div className="flex items-center gap-1">
              <MuteMenu above={phone} />
              {minimize}
            </div>
          </div>
          <ChatBox className="flex-1" rows={4} game onEscape={() => setOpen(false)} />
        </section>
      </>
    );
  }

  // Closed, the controls live in the top row (ChatControls); only the newest lines show here. Phone portrait puts them under the
  // seat strip, so they cover neither the strip nor the top row. Open, the panel sits at the top right (desktop) or above the hand
  // bar (sideways phone). Pointer events pass through the lines to the board.
  if (!open) {
    return (
      <Preview
        className={cn("absolute right-safe z-20", phone && portrait ? "top-[calc(env(safe-area-inset-top)+7.25rem)]" : "top-16")}
      />
    );
  }

  return (
    <div className={cn("absolute right-safe z-20", phone ? "bottom-[184px]" : "top-16")}>
      <section
        aria-label="Table chat"
        className="flex w-72 flex-col gap-2 rounded-chip bg-glass p-3 backdrop-blur-md"
        style={{ maxHeight: "min(360px, 50vh)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Table chat</h2>
          <div className="flex items-center gap-1">
            <MuteMenu />
            {minimize}
          </div>
        </div>
        <ChatBox rows={6} game onEscape={() => setOpen(false)} />
      </section>
    </div>
  );
}
