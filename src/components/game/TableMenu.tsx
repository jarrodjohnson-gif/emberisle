// #442: the table's one top-right control. A 44 px quiet "…" button opens a small sheet holding what the top chrome used
// to spread out: the turn number and watcher count, How to play, Costs, Sound, the table code (online), Copy log (#899, online) and Leave table.
// A watcher's own "Watching" chip stays in the header beside the button (docs/design/spectator.md), not in here.
// Opens with focus on the first row; Escape, a pointerdown outside or focus leaving closes it, and Escape puts the focus
// back on the button. Leaving an online seat asks first (the seat goes to a bot for good), and so does leaving hotseat (#1449:
// the game ends, with nothing saved); Stay, Escape or 5 s cancels.
// #669: Sound opens the Sound panel (SoundSheet.tsx) in the same place, with every level showing; Back and Escape return to the rows.
import { useEffect, useRef, useState } from "react";
import { BookOpen, Box, Bug, Copy, Ellipsis, Eye, Hammer, LogOut, ScrollText, Volume2, VolumeX, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionOverlay, SoundSheet, soundSheet } from "@/components/game/chunks";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { useGame } from "@/lib/game/store";
import { haptics, play, useMuted } from "@/lib/sound";
import { OPEN_SOUND_EVENT, useSoundMix } from "@/lib/sound-settings";
import { LazyBoundary } from "@/lib/lazy";
import { bugReportUrl } from "@/lib/bug-report";

const ROW = "h-11 w-full justify-start px-3 text-body";
const ICON = "size-4 shrink-0 text-muted";

export function TableMenu() {
  const state = useGame((s) => s.state)!;
  const mode = useGame((s) => s.mode);
  const serverSha = useGame((s) => s.serverSha);
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
  const master = useSoundMix().master;
  const { state: copied, copy, reset } = useCopy<"code" | "log">();
  const gameLog = useGame((s) => s.gameLog);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sound, setSound] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const confirm = (mode === "online" || mode === "hotseat") && !spectator && state.phase !== "over";

  // Set by Stay, Escape and the timer: the Leave row is back on the next render, and takes the focus then.
  const refocusLeave = useRef(false);

  const close = (refocus: boolean) => {
    reset();
    setOpen(false);
    setAsking(false);
    if (refocus) trigger.current?.focus();
  };
  const back = () => setSound(false);
  const stay = () => {
    refocusLeave.current = true;
    setAsking(false);
  };

  // The chunk is fetched as the menu opens, so Sound shows at once when it is pressed.
  useEffect(() => {
    if (!open) {
      setSound(false);
      return;
    }
    void soundSheet.prefetch();
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
      else if (sound) back();
      else close(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, asking, sound]);

  // The Mute players list in the chat (Chat.tsx) points here.
  useEffect(() => {
    const show = () => {
      setSound(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_SOUND_EVENT, show);
    return () => window.removeEventListener(OPEN_SOUND_EVENT, show);
  }, []);

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
      {mode === "online" ? <LazyBoundary failed={null}><ConnectionOverlay /></LazyBoundary> : null}
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="sea-icon size-11"
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
          aria-label={sound ? "Sound" : "Table menu"}
          data-testid="table-menu"
          className={`absolute right-0 top-full z-20 mt-2 flex max-h-[calc(100dvh-5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col ${sound ? "ss" : "w-64 overflow-y-auto rounded-sheet bg-surface p-2 shadow-[0_8px_32px_rgb(28_25_21_/_0.18)]"}`}
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (to && !sheet.current?.contains(to) && !trigger.current?.contains(to)) close(false);
          }}
        >
          {sound ? (
            <LazyBoundary failed={<p className="p-2">Sound did not load.</p>}>
              <SoundSheet onBack={back} onClose={() => close(true)} />
            </LazyBoundary>
          ) : null}
          <p hidden={sound} className="flex items-center gap-2 px-3 py-1 text-caption text-muted">
            <span>Turn {Math.max(1, state.turn)}</span>
            {watching > 0 ? (
              <span data-testid="watching-count" aria-label={`${watching} watching`} className="ml-auto flex items-center gap-1 tabular-nums">
                <Eye className="size-3.5" aria-hidden="true" />
                {watching}
              </span>
            ) : null}
          </p>
          {sound ? null : asking ? (
            <div
              role="alertdialog"
              aria-label="Leave the table?"
              aria-describedby="leave-confirm-msg"
              data-testid="leave-confirm"
              className="flex flex-col gap-2 px-3 py-2 text-body"
            >
              <p id="leave-confirm-msg">{mode === "hotseat" ? "Leave the table? The game ends." : "Leave the table? Your seat goes to the bot."}</p>
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
              {/* #669: one row for every sound setting; the levels live in the Sound panel. */}
              <Button variant="ghost" className={ROW} data-testid="sound-entry" onClick={() => setSound(true)}>
                {muted ? <VolumeX className={ICON} /> : <Volume2 className={ICON} />}
                Sound
                <span className="ml-auto flex items-center gap-1 text-caption text-muted">
                  {muted ? "Off" : `${Math.round(master * 100)}%`}
                  <span aria-hidden="true" className="text-body">›</span>
                </span>
              </Button>
              {haptics.row}
              {/* Owner q1503-menu-gap D: Water and View are one grid. A label column as wide as the wider label, then two equal
                  choice columns, so Crystal sits over Diorama and Simple over Overhead with the same edges. Each row is a subgrid
                  with the px-3 inset of the other rows and py-1 (8 px between the rows' boxes). The inset lives on the wrapper,
                  and each row cancels it with -mx-3 and puts it back as padding: a subgrid's own padding would otherwise be
                  added to the edge columns and make the second choice column narrower than the first. */}
              <div className="grid grid-cols-[max-content_minmax(0,1fr)_minmax(0,1fr)] gap-x-1 px-3">
              {/* The sea's look; the choice is remembered and overrides the GPU probe (docs/design/crystal-water.md).
                  The label sits under the icon, same as View, so the choices share the row (#1501). */}
              <div role="group" aria-label="Water" data-testid="water-toggle" className="-mx-3 grid grid-cols-subgrid col-span-3 items-center px-3 py-1 text-body">
                <span className="flex flex-col items-center leading-none">
                  <Waves className={ICON} />
                  Water
                </span>
                <span className="contents">
                  {(["crystal", "simple"] as const).map((p) => (
                    <Button key={p} size="sm" variant={water === p ? "default" : "ghost"} aria-pressed={water === p} className="min-w-11 px-1.5" onClick={() => setWaterChoice(p)}>
                      {p === "crystal" ? "Crystal" : "Simple"}
                    </Button>
                  ))}
                </span>
              </div>
              {/* The camera in play (#597): the tilted diorama or the overhead board; remembered like the water. Unchosen, it shows
                  the renderer's default for the screen's shape. #1501: the label sits under the icon so the two choices share
                  the row and stay inside the panel at phone width. The row keeps the px-3 inset of every other row. Text stays
                  15 px; each choice stays at least 44 px. Owner q1503-menu-fit D: py-1 on both rows leaves an 8 px gap
                  between the Water and View choice boxes, so a selected box never touches the one below it. */}
              <div role="group" aria-label="View" data-testid="view-toggle" className="-mx-3 grid grid-cols-subgrid col-span-3 items-center px-3 py-1 text-body">
                <span className="flex flex-col items-center leading-none">
                  <Box className={ICON} />
                  View
                </span>
                <span className="contents">
                  {(["diorama", "overhead"] as const).map((v) => (
                    <Button key={v} size="sm" variant={view === v ? "default" : "ghost"} aria-pressed={view === v} className="min-w-11 px-1.5" onClick={() => setViewChoice(v)}>
                      {v === "diorama" ? "Diorama" : "Overhead"}
                    </Button>
                  ))}
                </span>
              </div>
              </div>
              {mode === "online" && code ? (
                <Button variant="ghost" className={ROW} onClick={() => copy("code", code)}>
                  <Copy className={ICON} /> {copied?.ok && copied.what === "code" ? "Copied" : `Copy code ${code}`}
                </Button>
              ) : null}
              {/* #899: the whole game log on the clipboard (or in a field to copy by hand), moved here from the online chat dock. */}
              {mode === "online" ? (
                <Button variant="ghost" className={ROW} onClick={() => copy("log", gameLog.map((l) => l.text).join("\n"))}>
                  <ScrollText className={ICON} /> {copied?.ok && copied.what === "log" ? "Copied" : "Copy log"}
                </Button>
              ) : null}
              {/* #912: opens a prefilled GitHub issue in a new tab; nothing is sent from the app. */}
              <Button
                variant="ghost"
                className={ROW}
                data-testid="report-bug"
                aria-label="Report a bug, opens GitHub in a new tab"
                onClick={() => window.open(bugReportUrl({ version: __BUILD_SHA__, seed: state.seed, seq: state.seq, width: window.innerWidth, height: window.innerHeight }), "_blank", "noopener")}
              >
                <Bug className={ICON} /> Report a bug
              </Button>
              <Button ref={leaveRef} variant="ghost" className={ROW} onClick={confirm ? () => setAsking(true) : goTitle}>
                <LogOut className={ICON} /> Leave table
              </Button>
            </>
          )}
          {/* Outside the question's branch: the field focuses itself when it mounts, and must not take the focus back from
              Leave table each time the question folds into the rows (CI has no clipboard, so the field is the common case). */}
          {sound ? null : <CopyFallback state={copied} label={copied?.what === "log" ? "Game log" : "Table code"} className="px-3" />}
          {/* #834/#913: one version line, including the connected host and an unambiguous build time. */}
          <p data-testid="build-version" hidden={sound} className="break-words px-3 pt-1 text-caption text-muted">
            client {__BUILD_SHA__}{mode === "online" ? ` · server ${serverSha ?? "unknown"}${serverSha && serverSha !== "dev" && __BUILD_SHA__ !== "dev" && serverSha !== __BUILD_SHA__ ? " · different builds" : ""}` : ""} · <time dateTime={__BUILD_TIME__}>{new Date(__BUILD_TIME__).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time>
          </p>
        </div>
      ) : null}
    </div>
  );
}
