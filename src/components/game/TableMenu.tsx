// #442: the table's one top-right control. A 44 px quiet "…" button opens a small sheet holding what the top chrome used
// to spread out: the turn number and watcher count, How to play, the sound toggle, the table code (online) and Leave table.
// A watcher's own "Watching" chip stays in the header beside the button (docs/design/spectator.md), not in here.
// Opens with focus on the first row; Escape, a pointerdown outside or focus leaving closes it, and Escape puts the focus
// back on the button. Leaving an online seat asks first (the seat goes to a bot for good); Stay, Escape or 5 s cancels.
import { useEffect, useRef, useState } from "react";
import { BookOpen, Copy, Ellipsis, Eye, LogOut, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { useGame } from "@/lib/game/store";
import { play, setMuted, useMuted } from "@/lib/sound";

const ROW = "h-11 w-full justify-start px-3 text-body";
const ICON = "size-4 shrink-0 text-muted";

export function TableMenu() {
  const state = useGame((s) => s.state)!;
  const mode = useGame((s) => s.mode);
  const code = useGame((s) => s.code);
  const spectator = useGame((s) => s.spectator);
  const watching = useGame((s) => s.watching);
  const setHowTo = useGame((s) => s.setHowTo);
  const goTitle = useGame((s) => s.goTitle);
  const muted = useMuted();
  const { state: copied, copy } = useCopy<"code">();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const confirm = mode === "online" && !spectator && state.phase !== "over";

  // Set by Stay, Escape and the timer: the Leave row is back on the next render, and takes the focus then.
  const refocusLeave = useRef(false);

  const close = (refocus: boolean) => {
    setOpen(false);
    setAsking(false);
    if (refocus) trigger.current?.focus();
  };
  const stay = () => {
    refocusLeave.current = true;
    setAsking(false);
  };

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("button")?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (sheet.current?.contains(t) || trigger.current?.contains(t)) return;
      setOpen(false);
      setAsking(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Capture phase, so this Escape closes only the menu (or only the question) and nothing behind it hears the key
  // (see Hud's useEscapeDisarm for the order).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      play("ui_back");
      if (asking) stay();
      else close(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, asking]);

  useEffect(() => {
    if (!asking) {
      if (refocusLeave.current) leaveRef.current?.focus();
      refocusLeave.current = false;
      return;
    }
    stayRef.current?.focus();
    const timer = setTimeout(stay, 5000);
    return () => clearTimeout(timer);
  }, [asking]);

  useEffect(() => {
    if (!confirm && asking) stay();
  }, [confirm, asking]);

  return (
    <div className="relative">
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="size-11 bg-glass backdrop-blur-md"
        aria-label="Table menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="table-menu"
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <Ellipsis className="size-5" />
      </Button>
      {open ? (
        <div
          ref={sheet}
          id="table-menu"
          role="dialog"
          aria-label="Table menu"
          data-testid="table-menu"
          className="absolute right-0 top-full z-20 mt-2 flex w-64 flex-col gap-1 rounded-sheet bg-surface p-3 shadow-[0_8px_32px_rgb(28_25_21_/_0.18)]"
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (to && !sheet.current?.contains(to) && !trigger.current?.contains(to)) close(false);
          }}
        >
          <p className="flex items-center gap-2 px-3 py-2 text-caption text-muted">
            <span>Turn {Math.max(1, state.turn)}</span>
            {watching > 0 ? (
              <span data-testid="watching-count" aria-label={`${watching} watching`} className="ml-auto flex items-center gap-1 tabular-nums">
                <Eye className="size-3.5" aria-hidden="true" />
                {watching}
              </span>
            ) : null}
          </p>
          {asking ? (
            <div
              role="alertdialog"
              aria-label="Leave the table?"
              aria-describedby="leave-confirm-msg"
              data-testid="leave-confirm"
              className="flex flex-col gap-2 px-3 py-2 text-body"
            >
              <p id="leave-confirm-msg">Leave the table? Your seat goes to the bot.</p>
              <div className="flex justify-end gap-2">
                <Button ref={stayRef} back variant="secondary" className="h-11" onClick={stay}>
                  Stay
                </Button>
                <Button className="h-11" onClick={goTitle}>
                  Leave
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                className={ROW}
                onClick={() => {
                  setHowTo(true, trigger.current);
                  close(false);
                }}
              >
                <BookOpen className={ICON} /> How to play
              </Button>
              {/* A toggle, so the menu stays open to show the new state (#303). */}
              <Button variant="ghost" className={ROW} data-testid="sound-toggle" aria-pressed={!muted} silent onClick={() => { setMuted(!muted); if (muted) play("ui_click"); }}>
                {muted ? <VolumeX className={ICON} /> : <Volume2 className={ICON} />}
                Table sounds {muted ? "off" : "on"}
              </Button>
              {mode === "online" && code ? (
                <Button variant="ghost" className={ROW} onClick={() => copy("code", code)}>
                  <Copy className={ICON} /> {copied?.ok ? "Copied" : `Copy table code ${code}`}
                </Button>
              ) : null}
              <Button ref={leaveRef} variant="ghost" className={ROW} onClick={confirm ? () => setAsking(true) : goTitle}>
                <LogOut className={ICON} /> Leave table
              </Button>
            </>
          )}
          {/* Outside the question's branch: the field focuses itself when it mounts, and must not take the focus back from
              Leave table each time the question folds into the rows (CI has no clipboard, so the field is the common case). */}
          <CopyFallback state={copied} label="Table code" className="px-3" />
        </div>
      ) : null}
    </div>
  );
}
