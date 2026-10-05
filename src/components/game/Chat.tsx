// The table chat dock, the shared chat box, and floating reactions. Design: docs/design/chat.md.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
const HUD_STACK = ".pointer-events-none.absolute.bottom-0.inset-x-0.z-10 > .relative > .overflow-y-auto";
const STATUS_BANNER_SLOT = 144;

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
  const seats = useGame((s) => s.seats);
  const seatId = useGame((s) => s.seatId);
  const code = useGame((s) => s.code);
  const mode = useGame((s) => s.mode);
  const filter = useGame((s) => s.logFilter);
  const setFilter = useGame((s) => s.setLogFilter);
  const draft = useGame((s) => s.chatDraft);
  const setDraft = useGame((s) => s.setChatDraft);
  const sendChat = useGame((s) => s.sendChat);
  const sendReact = useGame((s) => s.sendReact);
  const spectator = useGame((s) => s.spectator);
  const { muted, toggle: toggleMute } = useMutedSeats(code);
  const [muteOpen, setMuteOpen] = useState(false);
  const me = useMyName();
  const [tray, setTray] = useState(false);
  const { state: copied, copy } = useCopy<"log">();
  const log = useRef<HTMLUListElement>(null);
  const stuck = useRef(true);
  const withLog = game && filter === "all";
  const muteTargets = mode === "online" ? seats.filter((seat) => seat.id !== seatId && seat.name) : [];
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
          {muteTargets.length ? (
            <div className="relative">
              <button
                type="button"
                data-testid="chat-mute-toggle"
                aria-label="Mute players"
                aria-expanded={muteOpen}
                aria-controls="chat-mute-panel"
                onClick={() => setMuteOpen((open) => !open)}
                className="flex h-11 cursor-pointer items-center gap-1 rounded-control bg-glass px-2 text-xs text-zinc-700 hover:text-zinc-900"
              >
                <VolumeX className="size-4" />
                <span>Mute</span>
              </button>
              {muteOpen ? (
                <div
                  id="chat-mute-panel"
                  data-testid="chat-mute-panel"
                  role="group"
                  aria-label="Mute players"
                  className="absolute left-0 top-full z-40 mt-2 flex min-w-40 flex-col gap-1 rounded-chip bg-glass p-2 backdrop-blur-md"
                >
                  {muteTargets.map((seat) => {
                    const isMuted = muted.has(seat.id);
                    return (
                      <button
                        key={seat.id}
                        type="button"
                        data-testid={`chat-mute-seat-${seat.id}`}
                        aria-label={`${isMuted ? "Unmute" : "Mute"} player ${seat.name}`}
                        aria-pressed={isMuted}
                        onClick={() => toggleMute(seat.id)}
                        className="h-11 cursor-pointer rounded-control bg-glass px-3 text-left text-sm text-zinc-700 hover:text-zinc-900"
                      >
                        {isMuted ? `Unmute ${seat.name}` : `Mute ${seat.name}`}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
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

function Preview({ above }: { above?: boolean }) {
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
    <ul className={cn("pointer-events-none flex w-72 flex-col items-end gap-1", above ? "mb-1" : "mt-1")} data-testid="chat-preview">
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

function useHudStackTop(enabled: boolean) {
  const [top, setTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setTop(null);
      return;
    }

    let stack: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    const update = () => {
      const anchor = document.querySelector<HTMLElement>('[data-testid="turn-banner"], [data-testid="landscape-hint"]');
      const next = anchor?.parentElement ?? document.querySelector<HTMLElement>(HUD_STACK) ?? stack;
      if (next !== stack) {
        if (stack) observer?.unobserve(stack);
        stack = next;
        if (stack) observer?.observe(stack);
      }
      if (!stack) return;
      const nextTop = stack.getBoundingClientRect().top;
      setTop((previous) => previous !== null && Math.abs(previous - nextTop) < 0.1 ? previous : nextTop);
    };
    observer = new ResizeObserver(update);

    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [enabled]);

  return top;
}

export function ChatDock() {
  const mode = useGame((s) => s.mode);
  const open = useGame((s) => s.chatOpen);
  const unread = useGame((s) => s.unread);
  const setOpen = useGame((s) => s.setChatOpen);
  const { phone, portrait } = useViewport();
  const focusNext = useRef(false);
  const stackTop = useHudStackTop(phone && portrait && !open);
  const controlsTop = stackTop === null ? null : stackTop - STATUS_BANNER_SLOT;

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
        <QuickReactions />
        <div data-testid="chat-backdrop" className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
        <section
          aria-label="Table chat"
          data-testid="chat-sheet"
          className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 rounded-t-chip bg-glass px-safe pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md"
          style={{ height: "min(48vh, 320px)" }}
        >
          <div data-testid="chat-sheet-header" className="flex shrink-0 items-center justify-between">
            <h2 className="text-sm font-medium">Table chat</h2>
            {minimize}
          </div>
          <ChatBox className="flex-1" rows={4} game onEscape={() => setOpen(false)} />
        </section>
      </>
    );
  }

  return (
    <>
      <QuickReactions stackTop={phone && portrait && !open ? controlsTop : null} />
      <div
        className={cn(
          "absolute right-safe z-20 flex items-end",
          phone ? cn("flex-col-reverse", !portrait && "bottom-[184px]") : "top-16 flex-col",
        )}
        style={phone && portrait ? { bottom: controlsTop === null ? "84px" : `calc(100dvh - ${controlsTop}px + 12px)` } : undefined}
      >
        {open ? (
          <section
            aria-label="Table chat"
            className="flex w-72 flex-col gap-2 rounded-chip bg-glass p-3 backdrop-blur-md"
            style={{ maxHeight: "min(360px, 50vh)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Table chat</h2>
              {minimize}
            </div>
            <ChatBox rows={6} game onEscape={() => setOpen(false)} />
          </section>
        ) : (
          <>
            <button
              type="button"
              aria-label={unread ? `Open chat, ${unread} unread` : "Open chat"}
              onClick={() => {
                focusNext.current = true;
                setOpen(true);
              }}
              className={cn(
                "relative flex size-11 cursor-pointer items-center justify-center rounded-control bg-glass text-zinc-700 backdrop-blur-md hover:text-zinc-900",
              )}
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
            <Preview above={phone} />
          </>
        )}
      </div>
    </>
  );
}
