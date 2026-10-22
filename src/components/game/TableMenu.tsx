// #442: the table's one top-right control. A 44 px quiet "…" button opens a small sheet holding what the top chrome used
// to spread out: the turn number and watcher count, How to play, Costs, the sound toggle, the table code (online), Copy log (#899, online) and Leave table.
// A watcher's own "Watching" chip stays in the header beside the button (docs/design/spectator.md), not in here.
// Opens with focus on the first row; Escape, a pointerdown outside or focus leaving closes it, and Escape puts the focus
// back on the button. Leaving an online seat asks first (the seat goes to a bot for good); Stay, Escape or 5 s cancels.
import { useEffect, useRef, useState } from "react";
import { BookOpen, Box, Copy, Ellipsis, Eye, Hammer, LogOut, ScrollText, Volume2, VolumeX, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { useGame } from "@/lib/game/store";
import { play, setMusicOn, setMuted, useMuted, useMusicOn } from "@/lib/sound";

const ROW = "h-11 w-full justify-start px-3 text-body";
const ICON = "size-4 shrink-0 text-muted";

export function TableMenu() {
  const state = useGame((s) => s.state)!;
  const mode = useGame((s) => s.mode);
  const code = useGame((s) => s.code);
  const spectator = useGame((s) => s.spectator);
  const watching = useGame((s) => s.watching);
  const setHowTo = useGame((s) => s.setHowTo);
  const setCosts = useGame((s) => s.setCosts);
  const goTitle = useGame((s) => s.goTitle);
  const water = useGame((s) => s.water?.path ?? "crystal");
  const setWaterChoice = useGame((s) => s.setWaterChoice);
  const view = useGame((s) => s.playView);
  const setViewChoice = useGame((s) => s.setViewChoice);
  const muted = useMuted();
  const music = useMusicOn();
  const { state: copied, copy, reset } = useCopy<"code" | "log">();
  const gameLog = useGame((s) => s.gameLog);
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
    reset();
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
      reset();
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
          className="absolute right-0 top-full z-20 mt-2 flex max-h-[calc(100dvh-5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-64 flex-col overflow-y-auto rounded-sheet bg-surface p-2 shadow-[0_8px_32px_rgb(28_25_21_/_0.18)]"
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (to && !sheet.current?.contains(to) && !trigger.current?.contains(to)) close(false);
          }}
        >
          <p className="flex items-center gap-2 px-3 py-1 text-caption text-muted">
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
              <Button
                variant="ghost"
                className={ROW}
                onClick={() => {
                  setCosts(true, trigger.current);
                  close(false);
                }}
              >
                <Hammer className={ICON} /> Costs
              </Button>
              {/* A toggle, so the menu stays open to show the new state (#303). */}
              <Button variant="ghost" className={ROW} data-testid="sound-toggle" aria-pressed={!muted} silent onClick={() => { setMuted(!muted); if (muted) play("ui_click"); }}>
                {muted ? <VolumeX className={ICON} /> : <Volume2 className={ICON} />}
                Table sounds {muted ? "off" : "on"}
              </Button>
              {/* #814: a stopgap until the Sound menu (#669) takes over the music. */}
              <Button variant="ghost" className={ROW} data-testid="music-toggle" aria-pressed={music} silent onClick={() => setMusicOn(!music)}>
                {music ? <Volume2 className={ICON} /> : <VolumeX className={ICON} />}
                Music {music ? "on" : "off"}
              </Button>
              {/* The sea's look; the choice is remembered and overrides the GPU probe (docs/design/crystal-water.md). */}
              <div role="group" aria-label="Water" data-testid="water-toggle" className="flex h-11 items-center gap-2 px-3 text-body">
                <Waves className={ICON} /> Water
                <span className="ml-auto flex gap-1">
                  {(["crystal", "simple"] as const).map((p) => (
                    <Button key={p} size="sm" variant={water === p ? "default" : "ghost"} aria-pressed={water === p} onClick={() => setWaterChoice(p)}>
                      {p === "crystal" ? "Crystal" : "Simple"}
                    </Button>
                  ))}
                </span>
              </div>
              {/* The camera in play (#597): the tilted diorama or the overhead board; remembered like the water. Unchosen, it shows
                  the renderer's default for the screen's shape. */}
              <div role="group" aria-label="View" data-testid="view-toggle" className="flex h-11 items-center gap-2 px-3 text-body">
                <Box className={ICON} /> View
                <span className="ml-auto flex gap-1">
                  {(["diorama", "overhead"] as const).map((v) => (
                    <Button key={v} size="sm" variant={view === v ? "default" : "ghost"} aria-pressed={view === v} onClick={() => setViewChoice(v)}>
                      {v === "diorama" ? "Diorama" : "Overhead"}
                    </Button>
                  ))}
                </span>
              </div>
              {mode === "online" && code ? (
                <Button variant="ghost" className={ROW} onClick={() => copy("code", code)}>
                  <Copy className={ICON} /> {copied?.ok && copied.what === "code" ? "Copied" : `Copy table code ${code}`}
                </Button>
              ) : null}
              {/* #899: the whole game log on the clipboard (or in a field to copy by hand), moved here from the online chat dock. */}
              {mode === "online" ? (
                <Button variant="ghost" className={ROW} onClick={() => copy("log", gameLog.map((l) => l.text).join("\n"))}>
                  <ScrollText className={ICON} /> {copied?.ok && copied.what === "log" ? "Copied" : "Copy log"}
                </Button>
              ) : null}
              <Button ref={leaveRef} variant="ghost" className={ROW} onClick={confirm ? () => setAsking(true) : goTitle}>
                <LogOut className={ICON} /> Leave table
              </Button>
            </>
          )}
          {/* Outside the question's branch: the field focuses itself when it mounts, and must not take the focus back from
              Leave table each time the question folds into the rows (CI has no clipboard, so the field is the common case). */}
          <CopyFallback state={copied} label={copied?.what === "log" ? "Game log" : "Table code"} className="px-3" />
          {/* #834: which commit this is, so a player can tell whether they are on the latest build. */}
          <p data-testid="build-version" className="px-3 pt-1 text-caption text-muted">
            Build {__BUILD_SHA__} · {new Date(__BUILD_TIME__).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
