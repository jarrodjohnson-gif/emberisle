// The full game log (docs/design/end-of-game, owner decision 2026-11-12 `q1536-game-log`): a sheet in the tray's style,
// opened from the Table menu. Turns run oldest first, like the online chat, and the sheet opens scrolled to the newest turn at
// the bottom (it stays there as turns come in, unless the reader has scrolled up: #1601). A turn is one seat's name with its roll as the number, and
// under it what happened, in the log's own words. Lines from before the first turn sit under "Setup" ("Earlier" once the
// log is full and has dropped its oldest lines). Focus lands on Close and goes back to the menu button; Escape and a tap on
// the backdrop close it. Its own chunk (chunks.ts), fetched as the menu opens.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { useBackdropClose } from "@/lib/backdrop-close";
import { useFocusTrap } from "@/lib/focus-trap";
import { GAME_LOG_MAX, useGame } from "@/lib/game/store";
import { play } from "@/lib/sound";
import "@/components/game/game-log.css";

type Turn = { name: string; sum?: number; lines: string[] };

// rules.ts writes "<name>'s turn." as a turn starts and "<name> rolled <sum>!" for its roll. When a bot ends a turn, ai.ts
// (logBotAction) puts "Bot passed for <seat>; " in front of that turn line, in practice and for a host's stand-in bot: the
// heading is still the next seat's name. The first turn of a game has no turn line, and a full log may have dropped one,
// so a roll with no open heading of its own starts that seat's turn.
export function turnsOf(lines: { text: string }[]): Turn[] {
  const turns: Turn[] = [{ name: "", lines: [] }];
  for (const { text } of lines) {
    const turn = turns[0]!;
    const start = /^(?:Bot passed for [^;]+; )?(.+)'s turn\.$/.exec(text);
    const roll = /^(.+) rolled (\d+)!$/.exec(text);
    if (start) turns.unshift({ name: start[1]!, lines: [] });
    else if (roll && roll[1] === turn.name && !turn.sum) turn.sum = Number(roll[2]);
    else if (roll) turns.unshift({ name: roll[1]!, sum: Number(roll[2]), lines: [] });
    else {
      // The roll's gain line is "<gains; gains> — <name>'s roll<; a short bank>.": under that seat's own heading the roll
      // need not be named again, and each seat's gain gets its own line.
      const [gains, rest] = turn.name ? text.split(` — ${turn.name}'s roll`) : [text];
      if (rest === undefined) turn.lines.push(text);
      else turn.lines.push(...gains!.split("; ").map((g) => `${g}.`), ...(rest.length > 1 ? [`T${rest.slice(3)}`] : []));
    }
  }
  return turns.filter((t) => t.name || t.lines.length);
}

export function GameLog({ opener, onClose }: { opener: HTMLElement | null; onClose: () => void }) {
  const log = useGame((s) => s.gameLog);
  const players = useGame((s) => s.state?.players);
  // This seat: a watcher has none, and in hotseat it is the seat whose turn it is (the actor, as Hud.tsx has it).
  const mine = useGame((s) => (s.spectator ? undefined : s.state?.players.find((p) => p.id === (s.mode === "hotseat" ? s.state!.current : s.localId))?.name));
  const root = useRef<HTMLDivElement>(null);
  useFocusTrap(root, true, undefined, opener);
  const backdrop = useBackdropClose(onClose);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      play("ui_back");
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  // turnsOf reads newest first; the sheet lists oldest first.
  const turns = turnsOf(log).reverse();
  const list = useRef<HTMLOListElement>(null);
  // As Chat.tsx: a resize (a turned phone, the sheet settling) re-pins the newest turn unless the reader scrolled up, and a
  // scroll at another list height than the last one measured is the resize's, not the reader's.
  const stuck = useRef(true);
  const pinned = useRef(0);
  const toEnd = () => {
    const el = list.current!;
    if (stuck.current) el.scrollTop = el.scrollHeight;
  };
  // Every render: a new turn keeps the list at the newest one.
  useEffect(toEnd);
  useEffect(() => {
    const el = list.current!;
    const observer = new ResizeObserver(() => {
      pinned.current = el.clientHeight;
      toEnd();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return createPortal(
    <div className="build-wash fixed inset-0 z-50 flex items-end justify-center" {...backdrop}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby="game-log-title" data-testid="game-log" className="tray-sheet game-log flex w-full max-w-[520px] flex-col">
        <div className="gl-top">
          <h2 id="game-log-title">Game log</h2>
          <Button variant="ghost" className="-mr-3 size-11 p-0" onClick={onClose} aria-label="Close" back>
            <X className="size-5" />
          </Button>
        </div>
        <ol ref={list} tabIndex={0} aria-label="Turns, oldest first" onScroll={({ currentTarget: el }) => { if (el.clientHeight === pinned.current) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8; }}>
          {turns.map((t, i) => (
            <li key={i} data-testid="gl-turn" className="gl-turn">
              <div className={t.name && t.name === mine ? "text-gain" : undefined}>
                {t.name ? <SeatDot color={players?.find((p) => p.name === t.name)?.color ?? "transparent"} className="size-3" /> : null}
                <b>{t.name || (log.length < GAME_LOG_MAX ? "Setup" : "Earlier")}</b>
                {t.sum ? <span data-testid="gl-roll" aria-label={`rolled ${t.sum}`} className={`gl-roll ${t.sum === 6 || t.sum === 8 ? "text-danger" : ""}`}>{t.sum}</span> : null}
              </div>
              {t.lines.map((line, j) => (
                <p key={j} data-testid="gl-line" className={mine && line.startsWith(`${mine} `) ? "text-fg" : undefined}>{line}</p>
              ))}
            </li>
          ))}
        </ol>
      </div>
    </div>,
    document.body,
  );
}
