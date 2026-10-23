// #937: "Play while you wait", a closed box in the lobby that runs Sandwich Stacker in Ruffle. Plain on purpose (Astra restyles it).
// Nothing is requested until it is opened: Ruffle (~14 MB of wasm) is a script tag pointed at the self-hosted /minigames/ruffle/
// (vite.config.ts copies it at build time), never an import, so it stays out of every JS chunk. Closing the box, or the lobby
// unmounting because the game started or the player left, removes the player and releases any held key.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type RufflePlayerElement = HTMLElement & {
  ruffle(): { load(options: Record<string, unknown>): Promise<void>; volume: number };
};
type RuffleGlobal = { newest(): { createPlayer(): RufflePlayerElement } | null };
declare global {
  interface Window {
    RufflePlayer?: RuffleGlobal;
  }
}

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

export function LobbyWaitBox() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sound, setSound] = useState(false);
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
    p.focus();
    p.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: code, code, keyCode: KEY_CODES[code], which: KEY_CODES[code], bubbles: true, cancelable: true } as KeyboardEventInit));
  };
  const release = () => {
    for (const code of [...held.current]) press(code, false);
  };

  useEffect(() => {
    if (!open) return;
    let live = true;
    const base = import.meta.env.BASE_URL;
    let mine: RufflePlayerElement | null = null;
    // The controls sit under the stage: bring the whole box into the card's view, above the sticky Ready/Leave footer (scroll-mb).
    stage.current?.parentElement?.scrollIntoView({ block: "nearest" });
    (async () => {
      await loadRuffle(base);
      if (!live || !stage.current) return;
      const created = window.RufflePlayer!.newest()!.createPlayer();
      mine = created;
      created.tabIndex = 0;
      created.style.cssText = "display:block;width:100%;height:100%";
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
  }, [open]);

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
    disabled: !ready,
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      press(code, true);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
  });

  return (
    <div
      data-testid="lobby-wait-box"
      // Closed: one compact line so 1280x720 still fits the chat input above the Ready footer (chat-prove). Open: bordered stage.
      className={open ? "mt-1 shrink-0 rounded-[12px] border border-border bg-surface p-2" : "mt-1 shrink-0"}
      // Arrows and Space steer the game while focus is on the Ruffle player. Only the default is cancelled: stopping
      // propagation would keep the event from Ruffle's own listener (docs/spike/928/FINDINGS.md).
      onKeyDownCapture={(e) => {
        if (!(e.target as Element).closest?.("ruffle-player")) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === " ") e.preventDefault();
      }}
    >
      <button type="button" data-testid="lobby-wait-box-toggle" aria-expanded={open} className="h-7 w-full cursor-pointer text-left text-sm text-muted" onClick={() => setOpen(!open)}>
        Play while you wait {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="mt-2 scroll-mb-56">
          <div ref={stage} data-testid="lobby-wait-box-stage" className="w-full bg-black" style={{ aspectRatio: "580 / 320" }} />
          <p className="mt-1 min-h-4 text-xs text-muted" aria-live="polite">
            {failed ? "Couldn't load the game." : ready ? "Arrow keys, or hold Left and Right." : "Loading…"}
          </p>
          <div className="mt-1 flex gap-2">
            <Button variant="outline" silent className="min-h-11 flex-1 touch-none" data-testid="lobby-wait-left" {...hold("ArrowLeft")}>
              Left
            </Button>
            <Button variant="outline" silent className="min-h-11 flex-1 touch-none" data-testid="lobby-wait-right" {...hold("ArrowRight")}>
              Right
            </Button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" data-testid="lobby-wait-sound" checked={sound} onChange={(e) => setSound(e.target.checked)} />
            Sound
          </label>
        </div>
      ) : null}
    </div>
  );
}
