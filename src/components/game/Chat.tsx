// The table chat dock, the shared chat box, and floating reactions. Design: docs/design/chat.md.
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Minus, Smile } from "lucide-react";
import { EMOTES } from "@/components/game/emotes";
import { useGame } from "@/lib/game/store";
import type { ChatLine } from "@/lib/net/table";
import { cn } from "@/lib/utils";

const PRESETS = ["gg", "nice roll", "your turn", "one sec", "ty"];
const INPUT_ID = "chat-input";

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

function useMyName() {
  return useGame((s) => s.seats.find((x) => x.id === s.seatId)?.name ?? s.name);
}

function Line({ line, me }: { line: ChatLine; me: string }) {
  return (
    <li className="break-words text-xs leading-snug text-zinc-900">
      <span className="mr-1 inline-block size-2 rounded-full align-baseline" style={{ background: line.color }} />
      <span className="mr-1 font-medium" style={{ color: line.color }}>
        {line.name}
      </span>
      <Mention text={line.text} name={me} />
    </li>
  );
}

// The log, the preset chips, the emote tray, and the input. `onEscape` is the dock's minimize.
export function ChatBox({ rows, onEscape }: { rows: number; onEscape?: () => void }) {
  const chat = useGame((s) => s.chat);
  const draft = useGame((s) => s.chatDraft);
  const setDraft = useGame((s) => s.setChatDraft);
  const sendChat = useGame((s) => s.sendChat);
  const sendReact = useGame((s) => s.sendReact);
  const me = useMyName();
  const [tray, setTray] = useState(false);
  const log = useRef<HTMLUListElement>(null);
  const stuck = useRef(true);

  useEffect(() => {
    const el = log.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    sendChat(text);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <ul
        ref={log}
        data-testid="chat-log"
        onScroll={(e) => {
          const el = e.currentTarget;
          stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        }}
        className="flex min-h-0 flex-col gap-1 overflow-y-auto"
        style={{ height: rows * 18, flex: "1 1 auto" }}
      >
        {chat.map((line) => (
          <Line key={line.id} line={line} me={me} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => sendChat(p)}
            className="cursor-pointer rounded-full border border-white/60 bg-white/60 px-2 py-0.5 text-xs text-zinc-900 hover:bg-white/90"
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
              className="cursor-pointer rounded-[8px] p-0.5 hover:bg-white/70"
            >
              <img src={url} alt="" className="size-8 object-contain" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-1">
        <button
          type="button"
          aria-label="Emotes"
          aria-expanded={tray}
          onClick={() => setTray(!tray)}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-white/60 bg-white/60 hover:bg-white/90"
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
          className="h-8 min-w-0 flex-1 rounded-[8px] border border-white/60 bg-white/70 px-2 text-sm text-zinc-900"
        />
        <button
          type="button"
          onClick={send}
          className="h-8 cursor-pointer rounded-[8px] bg-fg px-3 text-sm font-medium text-bg hover:bg-fg/90"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function Preview() {
  const chat = useGame((s) => s.chat);
  const seen = useRef<Map<number, number>>(new Map(chat.map((l) => [l.id, 0])));
  const [, tick] = useState(0);

  for (const l of chat) if (!seen.current.has(l.id)) seen.current.set(l.id, Date.now());

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, []);

  const now = Date.now();
  const live = chat.filter((l) => {
    const at = seen.current.get(l.id) ?? 0;
    return at > 0 && now - at < 7000;
  }).slice(-3);

  return (
    <ul className="pointer-events-none mt-1 flex w-72 flex-col items-end gap-1" data-testid="chat-preview">
      {live.map((l) => (
        <li
          key={l.id}
          className="max-w-full break-words rounded-[8px] bg-white/55 px-2 py-0.5 text-xs text-zinc-900 backdrop-blur-md transition-opacity duration-1000"
          style={{ opacity: now - (seen.current.get(l.id) ?? 0) < 6000 ? 1 : 0 }}
        >
          <span className="mr-1 inline-block size-2 rounded-full" style={{ background: l.color }} />
          <span className="mr-1 font-medium" style={{ color: l.color }}>
            {l.name}
          </span>
          {l.text}
        </li>
      ))}
    </ul>
  );
}

export function ChatDock() {
  const mode = useGame((s) => s.mode);
  const open = useGame((s) => s.chatOpen);
  const unread = useGame((s) => s.unread);
  const setOpen = useGame((s) => s.setChatOpen);
  const focusNext = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || useGame.getState().mode !== "online") return;
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
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

  return (
    <div className="absolute right-3 top-16 z-20 flex flex-col items-end">
      {open ? (
        <section
          aria-label="Table chat"
          className="flex w-72 flex-col gap-2 rounded-[16px] border border-white/50 bg-white/45 p-3 backdrop-blur-md"
          style={{ maxHeight: "min(360px, 50vh)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Table chat</h2>
            <button
              type="button"
              aria-label="Minimize chat"
              onClick={() => setOpen(false)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-[8px] hover:bg-white/60"
            >
              <Minus className="size-4" />
            </button>
          </div>
          <ChatBox rows={6} onEscape={() => setOpen(false)} />
        </section>
      ) : (
        <>
          <button
            type="button"
            aria-label="Open chat"
            onClick={() => {
              focusNext.current = true;
              setOpen(true);
            }}
            className={cn(
              "relative flex size-11 cursor-pointer items-center justify-center rounded-[16px] border border-white/50 bg-white/45 backdrop-blur-md hover:bg-white/70",
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
          <Preview />
        </>
      )}
    </div>
  );
}

// Floats over its parent (which must be `relative`): the live reactions from `anchor`, a player id or a seat id.
export function ReactionFloats({ by, id }: { by: "player" | "seat"; id: string }) {
  const reactions = useGame((s) => s.reactions);
  const seats = useGame((s) => s.seats);
  const players = useGame((s) => s.state?.players);
  return (
    <>
      {reactions
        .filter((r) => (by === "player" ? r.player : r.seat) === id)
        .map((r) => {
          const url = EMOTES[r.emote];
          if (!url) return null;
          const to = r.to
            ? (seats.find((s) => s.id === r.to) ?? players?.find((p) => p.id === r.to))
            : undefined;
          return (
            <div
              key={`${r.at}-${r.seat}-${r.emote}`}
              data-testid="reaction"
              data-emote={r.emote}
              className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
            >
              <div className="flex flex-col items-center" style={{ animation: "emote-float 2s linear forwards" }}>
                <img src={url} alt="" className="size-12 object-contain" />
                {to ? (
                  <span className="rounded bg-white/70 px-1 text-[10px] font-medium" style={{ color: to.color }}>
                    → {to.name}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
    </>
  );
}
