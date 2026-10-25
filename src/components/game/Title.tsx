import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { OpenModeToggle, HowTo, online, OpenTables, sheets, WayfarerOptions } from "@/components/game/chunks";
import { SeatDot } from "@/components/game/SeatDot";
import { useGame } from "@/lib/game/store";
import { JOIN_CODE, LazyBoundary, preloadOnIdle } from "@/lib/lazy";
import { play, setMuted, useMuted } from "@/lib/sound";
import { PLAYER_COLORS, PLAYER_NAMES } from "@/lib/game/types";
import { useFocusTrap } from "@/lib/focus-trap";
import "./title.css";

const PEEK_CODE = JOIN_CODE;
// A join link is read on the first Title of a page load only: later visits to the title (goTitle) start empty.
let linkRead = false;
function stripLink() {
  const url = new URL(location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("watch");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function Title() {
  const name = useGame((s) => s.name);
  const color = useGame((s) => s.color);
  const choices = useGame((s) => s.wayfarerChoices);
  const rules = { ai: choices.ai ?? "on", online: choices.online ?? "on", hotseat: choices.hotseat ?? "on" };
  const setHowTo = useGame.getState().setHowTo;
  const howTo = useGame((s) => s.howTo);
  const [join, setJoin] = useState("");
  const [openMode, setOpenMode] = useState(false);
  const [panel, setPanel] = useState<"rules" | "color" | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const showPanel = (kind: "rules" | "color", button: HTMLElement) => { opener.current = button; setPanel(kind); };
  const watchTable = useGame.getState().watchTable;
  // A ?watch= link makes Watch the primary button for this visit (docs/design/spectator.md).
  const [watchLink, setWatchLink] = useState(false);
  const peekTable = useGame.getState().peekTable;
  const peekedCode = useGame((s) => s.code);
  const peekedSeats = useGame((s) => s.seats);
  const error = useGame((s) => s.error);
  const muted = useMuted();
  // Colors already seated at the table whose code is in the field (docs/design/color-peek.md).
  const taken = peekedCode === join ? peekedSeats.map((s) => s.color) : [];

  useEffect(() => {
    if (!PEEK_CODE.test(join)) return;
    const timer = setTimeout(() => peekTable(join), 300);
    const again = setInterval(() => peekTable(join), 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(again);
    };
  }, [join, peekTable]);

  // #304: a join link (?code=K7QP) fills the field so the peek above runs; nothing is sent until Join is pressed. A watch
  // link (?watch=K7QP) does the same and makes Watch the primary button. #492: the link stays in the URL until the online
  // chunk has loaded, so the stale-chunk reload refills the field; then it leaves the URL so a later reload does not refill
  // a dead code. Only the first Title of a page load reads it.
  useEffect(() => {
    if (linkRead) return;
    linkRead = true;
    const url = new URL(location.href);
    const code = url.searchParams.get("code")?.toUpperCase();
    const watch = url.searchParams.get("watch")?.toUpperCase();
    if (code === undefined && watch === undefined) return;
    const fill = code ?? watch!;
    if (!PEEK_CODE.test(fill)) return stripLink();
    setJoin(fill);
    void online.prefetch().then((ok) => ok && stripLink());
    if (code === undefined) setWatchLink(true);
  }, []);

  // #488: How to play is a lazy chunk; idle time on the title fetches it, and so does a pointer or focus on its button.
  useEffect(() => preloadOnIdle(sheets.prefetch), []);

  // One primary per screen (docs/design/polish.md): Play, or Watch on a watch link. Watch only shows once there is a code.
  const showWatch = watchLink || join.length === 4;

  return (
    <>
      <div data-testid="title-card" className="title-cover title-card">
        <div className="title-identity">
          <h1 className="title-wordmark font-display">Emberisle</h1>
          <div className="title-name">
            <Button variant="outline" size="icon" aria-label="Your color" onClick={e => showPanel("color", e.currentTarget)}>
              <SeatDot color={color ?? PLAYER_COLORS[0]!} className="size-5" />
            </Button>
            <input value={name} onChange={e => useGame.getState().setName(e.target.value)} onBlur={useGame.getState().commitName}
              placeholder="Your name" aria-label="Your name" maxLength={16} />
          </div>
        </div>
        <div className="title-journeys">
          <div className="title-bots">
            <Button variant={watchLink ? "outline" : "primary"} onClick={useGame.getState().startAi}>Play against bots</Button>
            <p className="title-helper">Just you and three bots. No network needed.</p>
          </div>
          <div className="title-online" onPointerEnter={online.prefetch} onFocus={online.prefetch}>
            <p className="title-online-heading">Play online</p>
            <form aria-label="Join code" onSubmit={e => {
              e.preventDefault();
              if (join.length !== 4) return;
              if (watchLink) watchTable(join);
              else useGame.getState().joinTable(join);
            }}>
              <div className="title-host">
                <Button variant="outline" onClick={() => useGame.getState().hostTable(openMode ? "open" : undefined)}>Host a table</Button>
                <LazyBoundary failed={null}><OpenModeToggle openMode={openMode} setOpenMode={setOpenMode} /></LazyBoundary>
              </div>
              <input value={join} onChange={e => setJoin(e.target.value.toUpperCase())} placeholder="Code" aria-label="Join code"
                aria-describedby="code-help" autoCapitalize="characters" autoComplete="off" maxLength={4} />
              <Button variant="outline" type="submit" disabled={join.length !== 4}>Join</Button>
              <Button variant={watchLink ? "primary" : "outline"} disabled={join.length !== 4}
                onPointerEnter={online.prefetch} onFocus={online.prefetch} onClick={() => { if (join.length === 4) watchTable(join); }}>Watch</Button>
            </form>
            <p id="code-help" className="sr-only">Code for private tables</p>
            <p className="sr-only" aria-live="polite" data-testid="watch-announce">{showWatch ? "Watch available" : ""}</p>
          </div>
          <div className="title-pass">
            <Button variant="outline" onClick={() => useGame.getState().startHotseat(4)}>Pass this device</Button>
            <p className="title-helper">Four people, one screen.</p>
          </div>
        </div>
        <div className="title-tools">
          <Button variant="outline" onClick={e => showPanel("rules", e.currentTarget)}>Wayfarer rules</Button>
          <Button variant="outline" onPointerEnter={sheets.prefetch} onFocus={sheets.prefetch} onClick={e => setHowTo(!howTo, e.currentTarget)}>How to play</Button>
          <Button variant="outline" data-testid="sound-toggle" aria-pressed={!muted} silent onClick={() => { setMuted(!muted); if (muted) play("ui_click"); }}>
            Sound {muted ? "off" : "on"}
          </Button>
        </div>
        {error ? <p role="alert" className="title-error">{error}</p> : null}
        <LazyBoundary failed={null}><OpenTables /></LazyBoundary>
      </div>
      {panel ? <TitleSheet name={panel === "rules" ? "Wayfarer rules" : "Your color"} opener={opener.current} onClose={() => setPanel(null)}>
        {panel === "rules" ? <LazyBoundary failed={<p role="alert">Couldn't load Wayfarer rules. Close and try again.</p>}>
          <div data-testid="wayfarer-setup"><WayfarerOptions rules={rules} choose={useGame.getState().setWayfarerChoice} /></div>
        </LazyBoundary> : <div role="radiogroup" aria-label="Your color" className="title-colors">
          {PLAYER_COLORS.map((c, i) => <button key={c} type="button" role="radio" aria-checked={!taken.includes(c) && color === c}
            aria-label={taken.includes(c) ? `${PLAYER_NAMES[i]} (taken)` : PLAYER_NAMES[i]} title={taken.includes(c) ? `${PLAYER_NAMES[i]} (taken)` : PLAYER_NAMES[i]}
            disabled={taken.includes(c)} onClick={() => { useGame.getState().setColor(c); setPanel(null); }}
            style={{ borderColor: !taken.includes(c) && color === c ? "#1c1915" : "transparent" }}>
            <SeatDot color={c} className="size-7" />
          </button>)}
        </div>}
      </TitleSheet> : null}
      {howTo ? <LazyBoundary failed={<HowToFailed />}><HowTo onClose={() => setHowTo(false)} /></LazyBoundary> : null}
    </>
  );
}

function TitleSheet({ name, opener, onClose, children }: { name: string; opener: HTMLElement | null; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, undefined, opener);
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [onClose]);
  return <div className="title-sheet-backdrop">
    <div ref={ref} role="dialog" aria-modal="true" aria-label={name} className="title-sheet">
      <div className="title-sheet-heading"><h2>{name}</h2><Button variant="outline" onClick={onClose} back>Close</Button></div>
      {children}
    </div>
  </div>;
}

// The sheets chunk did not load: drop the open flag so the next press mounts How to play again and retries (#492).
function HowToFailed() {
  const setHowTo = useGame((s) => s.setHowTo);
  useEffect(() => setHowTo(false), [setHowTo]);
  return null;
}

