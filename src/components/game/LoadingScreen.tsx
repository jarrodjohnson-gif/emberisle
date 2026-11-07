// #1281: the startup loading screen (docs/design/loading-screen-1281, owner-approved 2026-11-06). The island loads behind a
// bank of cloud with a bar that fills as its real parts arrive; one Start button opens at 100%, and tapping it pushes the
// camera through the clouds (2.4 s, the invite page's reveal) onto an aerial view of the island, where the title card rises
// and the camera settles into the title's slow orbit. With reduced motion it is a cross-fade only.
import { useEffect, useRef, useState } from "react";
import { island, moments, online, sheets } from "@/components/game/chunks";
import { mulberry32 } from "@/lib/game/random";
import { boot } from "@/lib/lazy";
import "./loading.css";

const PUSH_MS = 2400;
const FADE_MS = 400;
const SETTLE_MS = 1600;
// The push ends this far up (boot.lift: 1 doubles the title camera's distance), then settles to the title's own view.
const LIFT_FROM = 1.7;
const LIFT_AERIAL = 0.9; // LIFT_FROM - LIFT_AERIAL is the 0.8 in the push below

// What the bar waits for, in order, with its share of the bar (about each part's share of the bytes and work) and its line.
// The island's chunk is most of the download; the Hex Jelly scenes are the next chunk and most of the build.
const STEPS: [string, number][] = [
  ["Fetching the board", 55],
  ["Raising the island", 10],
  ["Painting the hexes", 20],
  ["Carving the ports", 8],
  ["Waking the lanterns", 7],
];

type Cloud = { x: number; y: number; z: number; s: number; t: HTMLCanvasElement; d: number };

// One cloud puff: the invite page's cloud texture, lit for day (a shaded underside, then sunlit tops).
function puff(seed: number) {
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const x = c.getContext("2d")!;
  const rnd = mulberry32(seed);
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 18; i++) {
    const u = rnd();
    const hump = Math.sin(u * Math.PI);
    blobs.push([n * (0.18 + u * 0.64), n * (0.62 - hump * 0.22 - rnd() * 0.1), n * (0.09 + hump * 0.12 + rnd() * 0.05)]);
  }
  const pass = (dy: number, col: string, a: number) => {
    for (const [bx, by, r] of blobs) {
      const g = x.createRadialGradient(bx, by + dy, 0, bx, by + dy, r);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(0.62, `rgba(${col},${a * 0.85})`);
      g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g;
      x.beginPath();
      x.arc(bx, by + dy, r, 0, 7);
      x.fill();
    }
  };
  pass(n * 0.03, "168,192,198", 0.9);
  pass(-n * 0.015, "255,255,255", 0.95);
  return c;
}

function makeClouds(): Cloud[] {
  const puffs = [1, 2, 3, 4, 5, 6].map(puff);
  const rnd = mulberry32(1281);
  const clouds: Cloud[] = [];
  for (let i = 0; i < 64; i++)
    clouds.push({ x: (rnd() * 2 - 1) * 4.5, y: (rnd() * 2 - 1) * 3.2, z: 3.2 + rnd() * 14, s: 1.3 + rnd() * 1.6, t: puffs[i % 6]!, d: rnd() * 6.28 });
  return clouds.sort((a, b) => b.z - a.z);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  v = clamp((v - a) / (b - a), 0, 1);
  return v * v * (3 - 2 * v);
};
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);

// The sky over the island (gone once `reveal` is 1), the cloud bank `camZ` deep, and the whiteout inside it.
function paint(g: CanvasRenderingContext2D, w: number, h: number, clouds: Cloud[], camZ: number, reveal: number, cloudAlpha: number, time: number) {
  g.clearRect(0, 0, w, h);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#8fc6cf");
  sky.addColorStop(0.7, "#cfe7e8");
  sky.addColorStop(1, "#eef4f3");
  g.globalAlpha = 1 - reveal;
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const f = Math.max(w, h) * 0.55;
  for (const c of clouds) {
    const dz = c.z - camZ;
    // A puff at or behind the camera (dz <= 0.25) has no alpha and is skipped below. Puffs fade as the camera passes through them; far ones sink into the haze.
    const a = clamp((dz - 0.25) / 1.6, 0, 1) * clamp(1.15 - dz / 17, 0, 1) * cloudAlpha;
    if (a <= 0.01) continue;
    const k = f / dz;
    const size = c.s * k;
    const sx = w / 2 + (c.x + Math.sin(time * 0.15 + c.d) * 0.12) * k;
    const sy = h * 0.42 + c.y * k;
    g.globalAlpha = a;
    g.drawImage(c.t, sx - size, sy - size * 0.6, size * 2, size * 1.2);
  }
  // At most 0.46, and never below 0, so it needs no clamp.
  g.globalAlpha = cloudAlpha * (0.06 + 0.4 * Math.exp(-(((camZ - 8) / 2.4) ** 2))) * (1 - reveal);
  g.fillStyle = "#f3f6f5";
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
}

// `onArrive`: mount the title card now (it rises in by itself). `onDone`: the screen is gone. `onRetry`: Try again was
// pressed, so the app's canvas asks for the island again too.
export function LoadingScreen({ onArrive, onDone, onRetry }: { onArrive: () => void; onDone: () => void; onRetry: () => void }) {
  const sky = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // One bit a step, set once that part is in.
  const [parts, setParts] = useState(0);
  const [waited, setWaited] = useState(false);
  // A chunk did not download: Start stays closed and Try again asks for what is still missing.
  const [failed, setFailed] = useState(false);
  const retry = useRef(() => {});
  const begin = useRef(() => {});
  const started = useRef(0);

  useEffect(() => {
    const canvas = sky.current!;
    const g = canvas.getContext("2d")!;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    boot.intro = true;
    const clouds = makeClouds();
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth;
      h = innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (calm && !started.current) paint(g, w, h, clouds, 0, 0, 1, 0);
    };
    resize();
    addEventListener("resize", resize);

    // The island's chunk is the same load the app's canvas waits on; the sheets, the lobby and the moments come along.
    let chunkIn = false;
    const extras = new Set<object>();
    const fetchAll = () => {
      setFailed(false);
      if (!chunkIn) island.load().then(() => (chunkIn = true), () => setFailed(true));
      for (const c of [sheets, online, moments]) if (!extras.has(c)) c.load().then(() => extras.add(c), () => setFailed(true));
    };
    fetchAll();
    retry.current = () => {
      fetchAll();
      onRetry();
    };

    let frame = 0;
    let arrived = false;
    let finished = false;
    const timers: number[] = [];
    // #1385: the title card arrives and the screen goes on timers set at Start; the frames only paint. A frame can come
    // seconds late on a slow GPU or a busy machine, and the screen must not wait for one to end the fade or the push.
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      onArrive();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      onDone();
    };
    begin.current = () => {
      started.current = performance.now();
      const [at, end] = calm ? [FADE_MS / 2, FADE_MS] : [PUSH_MS * 0.8, PUSH_MS + SETTLE_MS];
      timers.push(window.setTimeout(arrive, at), window.setTimeout(finish, end));
    };
    const t0 = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!started.current) {
        setParts([chunkIn, boot.drawn, boot.scenes, boot.shore, extras.size === 3].reduce((bits, ok, i) => bits | (ok ? 1 << i : 0), 0));
        if (!calm) {
          const secs = (now - t0) / 1000;
          paint(g, w, h, clouds, Math.sin(secs * 0.2) * 0.25, 0, 1, secs);
        }
        return;
      }
      const ms = now - started.current;
      const c = card.current!;
      if (calm) {
        const t = Math.min(1, ms / FADE_MS);
        paint(g, w, h, clouds, 0, t, 1 - t, 0);
        c.style.opacity = String(1 - smooth(0, 0.5, t));
        if (t >= 0.5) arrive();
        if (t >= 1) finish();
        return;
      }
      const t = Math.min(1, ms / PUSH_MS);
      if (t < 1) {
        // Ease in: the push speeds up, and the island's settle eases it out.
        paint(g, w, h, clouds, t ** 1.6 * 19, smooth(0.4, 0.9, t), 1, ms / 1000);
        boot.lift = LIFT_FROM - 0.8 * smooth(0.4, 1, t);
        const out = smooth(0, 0.2, t);
        c.style.transform = `translateY(${out * 140}%)`;
        c.style.opacity = String(1 - out);
        c.style.visibility = out < 1 ? "" : "hidden";
      } else {
        g.clearRect(0, 0, w, h);
        const s = Math.min(1, (ms - PUSH_MS) / SETTLE_MS);
        boot.lift = LIFT_AERIAL * (1 - easeInOut(s));
        if (s >= 1) finish();
      }
      if (t >= 0.8) arrive();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      for (const id of timers) clearTimeout(id);
      removeEventListener("resize", resize);
      boot.lift = 0;
      boot.intro = false;
    };
    // The callbacks are the app's state setters, stable for the screen's life.
  }, []);

  const done = STEPS.reduce((sum, [, share], i) => sum + (parts & (1 << i) ? share : 0), 0);
  const ready = done === 100;
  const status = ready ? "Ready when you are" : waited ? `Start opens at 100% · ${done}%` : STEPS.find((_, i) => !(parts & (1 << i)))![0];

  return (
    <>
      <canvas ref={sky} className="loading-sky" aria-hidden />
      <div ref={card} data-testid="loading-card" className="loading-card">
        <h1 className="title-wordmark">Emberisle</h1>
        <button
          type="button"
          className="loading-start"
          aria-disabled={!ready}
          onClick={() => {
            if (started.current) return;
            if (!ready) return setWaited(true);
            begin.current();
            sky.current!.style.pointerEvents = "none";
          }}
        >
          Start
        </button>
        <div className="loading-progress">
          <div className="loading-row">
            <div className="loading-track" role="progressbar" aria-label="Loading Emberisle" aria-valuemin={0} aria-valuemax={100} aria-valuenow={done}>
              <div className="loading-fill" style={{ width: `${done}%` }} />
            </div>
            <span className="loading-pct">{done}%</span>
          </div>
          {failed ? (
            <div className="loading-row">
              <p className="loading-status loading-failed" role="alert">Couldn't load the game. Check your connection.</p>
              <button type="button" className="loading-retry" onClick={() => retry.current()}>
                Try again
              </button>
            </div>
          ) : (
            <p className="loading-status" role="status">{status}</p>
          )}
        </div>
      </div>
    </>
  );
}
