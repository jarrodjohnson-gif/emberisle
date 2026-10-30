import { useLayoutEffect, useRef } from "react";

// The HUD that can reach into the island's hole: the top chrome, the phone seat strip and the bottom stack (on a short
// phone it can rise past the middle, and the hole then runs under it); softer, the status line floating over the board,
// which takes no taps and leaves on its own, so a moment may sit over it when nothing else gives it room.
const HARD = 'header, [data-testid="seat-strip"], [data-hud-stack], [data-testid="resource-flash"], [data-hand-rail]';
const SOFT = '[data-testid="banner"]';
const GAP = 8;

type Band = [number, number];

// The free bands of [from, to] between the boxes, padded by GAP, that overlap [left, right] across.
function bands(sel: string, from: number, to: number, left: number, right: number) {
  const spans = [...document.querySelectorAll(sel)]
    .map((n) => n.getBoundingClientRect())
    .filter((r) => r.height > 1 && r.left < right && r.right > left)
    .map((r): Band => [r.top - GAP, r.bottom + GAP])
    .sort((a, b) => a[0] - b[0]);
  const free: Band[] = [];
  let y = from;
  for (const [a, b] of spans) {
    if (a > y) free.push([y, Math.min(a, to)]);
    y = Math.max(y, b);
  }
  if (y < to) free.push([y, to]);
  return free;
}

// The top nearest `top` at which `h` fits in one of the bands, or null.
function fit(free: Band[], top: number, h: number) {
  let best: number | null = null;
  for (const [a, b] of free) {
    if (b - a < h) continue;
    const at = Math.min(Math.max(top, a), b - h);
    if (best === null || Math.abs(at - top) < Math.abs(best - top)) best = at;
  }
  return best;
}

// How far to move a centre-screen moment (TurnMoment) off the centre of the hole so it covers no HUD: none
// when it is clear; else the least move that clears all of it; else the least that clears all but the status line; else
// the middle of the largest free band. Measured from layout boxes when it shows and whenever `dep` changes, as a
// `translate` that leaves its own animated transform alone, and again when the hole resizes: the renderer refits it a
// frame after the HUD changes. Inline hole updates are observed before the next animation frame, too: resize
// delivery alone comes after RAF readers. This hook owns translate and its matching data attributes synchronously,
// so a queued React render cannot leave a frame at the previous position. `data-stage` says which it took (proofs).
export function useStage<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const area = el?.parentElement;
    if (!el || !area) return;
    let shift = 0, placed = false;
    el.style.translate = "0 0px";
    const measure = () => {
      const hole = area.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const top = box.top - shift;
      const hard = bands(HARD, hole.top, hole.bottom, box.left, box.right);
      const all = bands(`${HARD}, ${SOFT}`, hole.top, hole.bottom, box.left, box.right);
      const largest = hard.reduce<Band | null>((m, f) => (!m || f[1] - f[0] > m[1] - m[0] ? f : m), null);
      const clear = fit(all, top, box.height);
      const soft = clear ?? fit(hard, top, box.height);
      const at = soft ?? (largest ? (largest[0] + largest[1] - box.height) / 2 : top);
      const how = clear !== null ? (at === top ? "centre" : "moved") : soft !== null ? "over-status" : "crowded";
      const dy = at - top;
      if (!placed || shift !== dy || el.dataset.stage !== how) {
        placed = true;
        shift = dy;
        el.style.translate = `0 ${dy}px`;
        el.dataset.shift = String(dy);
        el.dataset.stage = how;
      }
    };
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(area);
    const moved = new MutationObserver(measure);
    if (area.parentElement) moved.observe(area.parentElement, { attributes: true, attributeFilter: ["style"] });
    return () => { resized.disconnect(); moved.disconnect(); };
  }, [dep]);
  return ref;
}
