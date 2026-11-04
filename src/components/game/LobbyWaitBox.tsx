// #1262: Sandwich Stacker, mounted by the shelf only while it is open. Ruffle is a script tag pointed at
// /minigames/ruffle/ruffle.js, never an import, so its wasm stays out of every JS chunk. Unmounting (Close, Start,
// Leave, or the tab returning to Table) removes the player and releases any held key.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";

type RufflePlayerElement = HTMLElement & {
  ruffle(): { load(options: Record<string, unknown>): Promise<void>; volume: number };
};
type RuffleGlobal = { newest(): { createPlayer(): RufflePlayerElement } | null };
declare global {
  interface Window {
    RufflePlayer?: RuffleGlobal;
  }
}

const STACKER_LOGO = `${import.meta.env.BASE_URL}images/sandwich-stacker-logo.png`;

const KEY_CODES = { ArrowLeft: 37, ArrowRight: 39 } as const;
type Arrow = keyof typeof KEY_CODES;

function loadRuffle(base: string): Promise<void> {
  if (window.RufflePlayer?.newest) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${base}minigames/ruffle/ruffle.js`;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("ruffle"));
    };
    document.head.append(script);
  });
}

// The shelf and the player share this chunk. The lobby renders it only after Play games is chosen, and the player
// (and therefore the Ruffle script) mounts only after Play.
export function LobbyPlay({ onGame }: { onGame: (open: boolean) => void }) {
  const seats = useGame((s) => s.seats);
  const [stacker, setStacker] = useState(false);
  useEffect(() => {
    onGame(stacker);
    return () => onGame(false);
  }, [stacker, onGame]);
  const missing = 3 - seats.length;
  const readyCount = seats.filter((s) => s.ready).length;
  const status = missing > 0 ? `Need ${missing} more player${missing === 1 ? "" : "s"}` : readyCount === seats.length ? "Everyone is ready" : `${readyCount} of ${seats.length} ready`;
  return (
    <div className="ly">
      <p className="lr">{seats.map((s) => s.name).join(" · ")} · {status}</p>
      {stacker ? <LobbyWaitBox onClose={() => setStacker(false)} /> : (
        <div className="ls">
          <h2>While you wait</h2>
          <div className="lt" role="group" aria-label="Sandwich Stacker"><img className="lw" src={STACKER_LOGO} alt="Sandwich Stacker" width="240" height="210" /><span><b aria-hidden="true">Sandwich Stacker</b><span>Solo</span></span><button type="button" onClick={() => setStacker(true)}>Play</button></div>
        </div>
      )}
    </div>
  );
}

export function LobbyWaitBox({ onClose }: { onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sound, setSound] = useState(false);
  const [coarse, setCoarse] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const stage = useRef<HTMLDivElement>(null);
  const player = useRef<RufflePlayerElement | null>(null);
  const held = useRef(new Set<Arrow>());
  const soundOn = useRef(sound);
  soundOn.current = sound;

  const press = (code: Arrow, down: boolean) => {
    const p = player.current;
    if (!p) return;
    if (down) held.current.add(code);
    else held.current.delete(code);
    p.focus({ preventScroll: true });
    p.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: code, code, keyCode: KEY_CODES[code], which: KEY_CODES[code], bubbles: true, cancelable: true } as KeyboardEventInit));
  };
  const release = () => {
    for (const code of [...held.current]) press(code, false);
  };

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const on = () => setCoarse(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    let live = true;
    const base = import.meta.env.BASE_URL;
    let mine: RufflePlayerElement | null = null;
    (async () => {
      await loadRuffle(base);
      if (!live || !stage.current) return;
      const created = window.RufflePlayer!.newest()!.createPlayer();
      mine = created;
      created.tabIndex = 0;
      created.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%";
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
      created.ruffle().volume = soundOn.current ? 1 : 0;
      created.focus({ preventScroll: true });
      player.current = created;
      setReady(true);
    })().catch(() => live && setFailed(true));
    return () => {
      live = false;
      release();
      mine?.remove();
      player.current = null;
      setReady(false);
      setFailed(false);
      setSound(false);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const out = () => release();
    window.addEventListener("blur", out);
    document.addEventListener("visibilitychange", out);
    return () => {
      window.removeEventListener("blur", out);
      document.removeEventListener("visibilitychange", out);
    };
  }, [ready]);

  useEffect(() => {
    if (player.current) player.current.ruffle().volume = sound ? 1 : 0;
  }, [sound]);

  const hold = (code: Arrow) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (!player.current) return;
      e.preventDefault();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the press still reaches the player */ }
      press(code, true);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
  });

  const status = failed ? "Couldn't load the game." : ready ? (coarse ? "Hold to move." : "Arrow keys move. Keys stay in the game while it has focus.") : "Loading…";

  return (
    <div
      data-testid="lobby-wait"
      className="lobby-wait"
      onKeyDownCapture={(e) => {
        if (!/^ruffle-player/i.test((e.target as Element | null)?.tagName ?? "")) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === " ") e.preventDefault();
      }}
    >
      <div className="lobby-wait-head">
        <b className="stacker-title"><img src={STACKER_LOGO} alt="Sandwich Stacker" width="240" height="210" /><span aria-hidden="true">Sandwich Stacker</span></b>
        <Button variant="outline" aria-pressed={sound} data-testid="lobby-wait-sound" onClick={() => setSound((on) => !on)}>{sound ? "Sound on" : "Sound off"}</Button>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
      <div ref={stage} data-testid="lobby-wait-stage" className="lobby-wait-stage" />
      <div className="lobby-wait-holds">
        <Button variant="outline" silent className="min-h-11 flex-1 touch-none" data-testid="lobby-wait-left" {...hold("ArrowLeft")}>Left</Button>
        <Button variant="outline" silent className="min-h-11 flex-1 touch-none" data-testid="lobby-wait-right" {...hold("ArrowRight")}>Right</Button>
      </div>
      <p data-testid="lobby-wait-status" className="lobby-wait-keys" aria-live="polite">{status}</p>
    </div>
  );
}
