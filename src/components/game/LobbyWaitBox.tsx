// #1262: Sandwich Stacker, mounted by the shelf only while it is open. Ruffle is a script tag pointed at
// /minigames/ruffle/ruffle.js, never an import, so its wasm stays out of every JS chunk. Unmounting (Close, Start,
// Leave, or the tab returning to Table) removes the player and releases any held key.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";
import { chunk, LazyBoundary } from "@/lib/lazy";

type RufflePlayerElement = HTMLElement & {
  ruffle(): { load(options: Record<string, unknown>): Promise<void>; volume: number };
};
type RuffleGlobal = { newest(): { createPlayer(): RufflePlayerElement } | null };
declare global {
  interface Window {
    RufflePlayer?: RuffleGlobal;
  }
}

// #1263: tic-tac-toe has a chunk of its own, loaded with the shelf.
const TicTacToe = chunk(() => import("@/components/game/LobbyTicTacToe")).pick((m) => m.TicTacToe);

const STACKER_LOGO = `${import.meta.env.BASE_URL}images/sandwich-stacker-logo.png`;
const COARSE = "(pointer: coarse)";
type Arrow = "ArrowLeft" | "ArrowRight";

// The shelf and the player share this chunk. The lobby renders it only after Play games is chosen, and the player
// (and therefore the Ruffle script) mounts only after Play.
export function LobbyPlay({ onGame }: { onGame: (open: boolean) => void }) {
  const seats = useGame((s) => s.seats);
  const [stacker, setStacker] = useState(false);
  const [board, setBoard] = useState(false);
  useEffect(() => {
    onGame(stacker || board);
    return () => onGame(false);
  }, [stacker, board, onGame]);
  const missing = 3 - seats.length;
  const readyCount = seats.filter((s) => s.ready).length;
  const status = missing > 0 ? `Need ${missing} more player${missing === 1 ? "" : "s"}` : readyCount === seats.length ? "All ready" : `${readyCount} of ${seats.length} ready`;
  return (
    <div className="ly">
      <p className="lr">{seats.map((s) => s.name).join(" · ")} · {status}</p>
      {stacker ? <LobbyWaitBox onClose={() => setStacker(false)} /> : (
        <div className="ls">
          {board ? null : <><h2>While you wait</h2>
          <div className="lt" role="group" aria-label="Sandwich Stacker"><img className="lw" src={STACKER_LOGO} alt="Sandwich Stacker" width="240" height="210" /><span><b aria-hidden="true">Sandwich Stacker</b><span>Solo</span></span><button type="button" onClick={() => setStacker(true)}>Play</button></div></>}
          <LazyBoundary failed={null}><TicTacToe open={board} setOpen={setBoard} /></LazyBoundary>
        </div>
      )}
    </div>
  );
}

export function LobbyWaitBox({ onClose }: { onClose: () => void }) {
  // 0: loading, 1: ready, 2: failed
  const [phase, setPhase] = useState(0);
  const [sound, setSound] = useState(false);
  const [coarse, setCoarse] = useState(() => matchMedia(COARSE).matches);
  const stage = useRef<HTMLDivElement>(null);
  const player = useRef<RufflePlayerElement | null>(null);
  const held = useRef(new Set<Arrow>());

  const press = (code: Arrow, down: boolean) => {
    const p = player.current;
    if (!p) return;
    held.current[down ? "add" : "delete"](code);
    p.focus({ preventScroll: true });
    const which = code === "ArrowLeft" ? 37 : 39;
    p.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: code, code, keyCode: which, which, bubbles: true, cancelable: true } as KeyboardEventInit));
  };
  const release = () => {
    for (const code of held.current) press(code, false);
  };

  useEffect(() => {
    let live = true;
    const base = import.meta.env.BASE_URL;
    let mine: RufflePlayerElement | null = null;
    const query = matchMedia(COARSE);
    const onCoarse = () => setCoarse(query.matches);
    query.addEventListener("change", onCoarse);
    addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    (async () => {
      if (!window.RufflePlayer?.newest) {
        await new Promise<unknown>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `${base}minigames/ruffle/ruffle.js`;
          script.onload = resolve;
          script.onerror = () => {
            script.remove();
            reject();
          };
          document.head.append(script);
        });
      }
      if (!live || !stage.current) return;
      const created = window.RufflePlayer!.newest()!.createPlayer();
      mine = created;
      created.tabIndex = 0;
      stage.current.append(created);
      const metadata = new Promise((resolve) => created.addEventListener("loadedmetadata", resolve, { once: true }));
      await created.ruffle().load({
        url: `${base}minigames/sandwichStacker.swf`,
        autoplay: "on",
        unmuteOverlay: "hidden",
        allowScriptAccess: false,
        allowNetworking: "none",
        contextMenu: "off",
        preferredRenderer: "webgl",
        letterbox: "on",
        scale: "showAll",
        backgroundColor: "#000000",
        volume: 0,
      });
      await metadata;
      if (!live) return;
      created.focus({ preventScroll: true });
      player.current = created;
      setPhase(1);
    })().catch(() => live && setPhase(2));
    return () => {
      live = false;
      release();
      query.removeEventListener("change", onCoarse);
      removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
      mine?.remove();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase === 1) player.current!.ruffle().volume = +sound;
  }, [phase, sound]);

  const status = ["Loading…", coarse ? "Hold to move." : "Arrow keys move. Keys stay in the game while it has focus.", "Couldn't load the game."][phase];

  return (
    <div
      data-testid="lobby-wait"
      className="lobby-wait"
      onKeyDownCapture={(e) => {
        if (/^ruffle-player/i.test((e.target as Element | null)?.tagName ?? "") && /^(Arrow(Left|Right|Up|Down)| )$/.test(e.key)) e.preventDefault();
      }}
    >
      <div className="lobby-wait-head">
        <b className="stacker-title"><img src={STACKER_LOGO} alt="Sandwich Stacker" width="240" height="210" /><span aria-hidden="true">Sandwich Stacker</span></b>
        <Button variant="outline" aria-pressed={sound} data-testid="lobby-wait-sound" onClick={() => setSound((on) => !on)}>{`Sound ${sound ? "on" : "off"}`}</Button>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
      <div ref={stage} data-testid="lobby-wait-stage" className="lobby-wait-stage" />
      <div className="lobby-wait-holds">
        {(["Left", "Right"] as const).map((side) => (
          <Button
            key={side}
            variant="outline"
            silent
            className="min-h-11 flex-1 touch-none"
            data-testid={`lobby-wait-${side.toLowerCase()}`}
            onPointerDown={(e) => {
              if (!player.current) return;
              e.preventDefault();
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the press still reaches the player */ }
              press(`Arrow${side}`, true);
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
          >
            {side}
          </Button>
        ))}
      </div>
      <p data-testid="lobby-wait-status" className="lobby-wait-keys" aria-live="polite">{status}</p>
    </div>
  );
}
