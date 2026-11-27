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

// What the bar waits for, in order, with its share of the bar (about each part's share of the bytes and work) and its line.
// The island's chunk is most of the download; the Hex Jelly scenes are the next chunk and most of the build.
const STEPS: [string, number][] = [
  ["Fetching the board", 55],
  ["Raising the island", 10],
  ["Painting the hexes", 20],
  ["Carving the ports", 8],
  ["Waking the lanterns", 7],
];

type Cloud = [x: number, y: number, z: number, s: number, t: HTMLCanvasElement, d: number];

// One cloud puff: the invite page's cloud texture, lit for day (a shaded underside, then sunlit tops).
function puff(seed: number) {
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const x = c.getContext("2d")!;
  const rnd = mulberry32(seed);
  const blobs = Array.from({ length: 18 }, () => {
    const u = rnd();
    const hump = Math.sin(u * Math.PI);
    return [n * (0.18 + u * 0.64), n * (0.62 - hump * 0.22 - rnd() * 0.1), n * (0.09 + hump * 0.12 + rnd() * 0.05)] as const;
  });
  const pass = (dy: number, col: string, a: number) => {
    for (const [bx, by, r] of blobs) {
      const y = by + dy;
      const g = x.createRadialGradient(bx, y, 0, bx, y, r);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(0.62, `rgba(${col},${a * 0.85})`);
      g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g;
      x.beginPath();
      x.arc(bx, y, r, 0, 7);
      x.fill();
    }
  };
  pass(n * 0.03, "168,192,198", 0.9);
  pass(-n * 0.015, "255,255,255", 0.95);
  return c;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  v = clamp01((v - a) / (b - a));
  return v * v * (3 - 2 * v);
};

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
  const actions = useRef({ retry() {}, begin() {} });

  useEffect(() => {
    const canvas = sky.current!;
    const g = canvas.getContext("2d")!;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    boot.intro = true;
    const puffs = [1, 2, 3, 4, 5, 6].map(puff);
    const rnd = mulberry32(1281);
    const clouds: Cloud[] = Array.from({ length: 64 }, (_, i) => [
      (rnd() * 2 - 1) * 4.5, (rnd() * 2 - 1) * 3.2, 3.2 + rnd() * 14, 1.3 + rnd() * 1.6, puffs[i % 6]!, rnd() * 6.28,
    ] as Cloud).sort((a, b) => b[2] - a[2]);
    let w = 0, h = 0, started = 0, frame = 0;
    let tArrive: ReturnType<typeof setTimeout> | undefined;
    let tFinish: ReturnType<typeof setTimeout> | undefined;

    // The sky over the island (gone once `reveal` is 1), the cloud bank `camZ` deep, and the whiteout inside it.
    const paint = (camZ: number, reveal: number, cloudAlpha: number, time: number) => {
      g.clearRect(0, 0, w, h);
      const skyGrad = g.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, "#8fc6cf");
      skyGrad.addColorStop(0.7, "#cfe7e8");
      skyGrad.addColorStop(1, "#eef4f3");
      g.globalAlpha = 1 - reveal;
      g.fillStyle = skyGrad;
      g.fillRect(0, 0, w, h);
      const f = Math.max(w, h) * 0.55;
      for (const [cx, cy, cz, cs, ct, cd] of clouds) {
        const dz = cz - camZ;
        // A puff at or behind the camera (dz <= 0.25) has no alpha and is skipped below. Puffs fade as the camera passes through them; far ones sink into the haze.
        const a = clamp01((dz - 0.25) / 1.6) * clamp01(1.15 - dz / 17) * cloudAlpha;
        if (a <= 0.01) continue;
        const k = f / dz;
        const size = cs * k;
        const sx = w / 2 + (cx + Math.sin(time * 0.15 + cd) * 0.12) * k;
        const sy = h * 0.42 + cy * k;
        g.globalAlpha = a;
        g.drawImage(ct, sx - size, sy - size * 0.6, size * 2, size * 1.2);
      }
      // At most 0.46, and never below 0, so it needs no clamp.
      g.globalAlpha = cloudAlpha * (0.06 + 0.4 * Math.exp(-(((camZ - 8) / 2.4) ** 2))) * (1 - reveal);
      g.fillStyle = "#f3f6f5";
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    };

    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth;
      h = innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (calm && !started) paint(0, 0, 1, 0);
    };
    resize();
    addEventListener("resize", resize);

    // The island's chunk is the same load the app's canvas waits on; the sheets, the lobby and the moments come along.
    const loaded = new Set<object>();
    const fetchAll = () => {
      setFailed(false);
      for (const c of [island, sheets, online, moments]) if (!loaded.has(c)) c.load().then(() => loaded.add(c), () => setFailed(true));
    };
    fetchAll();

    // #1385: the title card arrives and the screen goes on timers set at Start; the frames only paint. A frame can come
    // seconds late on a slow GPU or a busy machine, and the screen must not wait for one to end the fade or the push.
    const once = (fn: () => void) => {
      let ran = false;
      return () => {
        if (!ran) {
          ran = true;
          fn();
        }
      };
    };
    const arrive = once(onArrive);
    const finish = once(() => {
      cancelAnimationFrame(frame);
      onDone();
    });
    actions.current = {
      retry: () => {
        fetchAll();
        onRetry();
      },
      begin: () => {
        if (started) return;
        started = performance.now();
        canvas.style.pointerEvents = "none";
        tArrive = setTimeout(arrive, calm ? FADE_MS / 2 : PUSH_MS * 0.8);
        tFinish = setTimeout(finish, calm ? FADE_MS : PUSH_MS + SETTLE_MS);
      },
    };
    const t0 = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!started) {
        const hasIsland = loaded.has(island);
        setParts(
          (hasIsland ? 1 : 0) | (boot.drawn ? 2 : 0) | (boot.scenes ? 4 : 0) | (boot.shore ? 8 : 0) | (loaded.size === (hasIsland ? 4 : 3) ? 16 : 0),
        );
        if (!calm) {
          const secs = (now - t0) / 1000;
          paint(Math.sin(secs * 0.2) * 0.25, 0, 1, secs);
        }
        return;
      }
      // #1383: a frame can be stamped before the Start click; a negative time would make the push's `t ** 1.6` NaN.
      const ms = Math.max(0, now - started);
      const style = card.current!.style;
      const t = clamp01(ms / (calm ? FADE_MS : PUSH_MS));
      if (calm) {
        paint(0, t, 1 - t, 0);
        style.opacity = String(1 - smooth(0, 0.5, t));
        if (t >= 0.5) arrive();
        if (t >= 1) finish();
        return;
      }
      if (t < 1) {
        // Ease in: the push speeds up, and the island's settle eases it out.
        paint(t ** 1.6 * 19, smooth(0.4, 0.9, t), 1, ms / 1000);
        // The push ends at aerial lift 0.9 (from 1.7: 1.7 - 0.8 = 0.9), then settles to the title's own view.
        boot.lift = 1.7 - 0.8 * smooth(0.4, 1, t);
        const out = smooth(0, 0.2, t);
        style.transform = `translateY(${out * 140}%)`;
        style.opacity = String(1 - out);
        style.visibility = out < 1 ? "" : "hidden";
      } else {
        g.clearRect(0, 0, w, h);
        const s = clamp01((ms - PUSH_MS) / SETTLE_MS);
        boot.lift = 0.9 * (1 - (s < 0.5 ? 4 * s * s * s : 1 - (-2 * s + 2) ** 3 / 2));
        if (s >= 1) finish();
      }
      if (t >= 0.8) arrive();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(tArrive);
      clearTimeout(tFinish);
      removeEventListener("resize", resize);
      boot.lift = 0;
      boot.intro = false;
    };
    // The callbacks are the app's state setters, stable for the screen's life.
  }, []);

  let done = 0, next = "";
  STEPS.forEach(([label, share], i) => (parts & (1 << i) ? (done += share) : (next ||= label)));
  const ready = done === 100;
  const status = ready ? "Ready when you are" : waited ? `Start opens at 100% · ${done}%` : next;

  return (
    <>
      <canvas ref={sky} className="loading-sky" aria-hidden />
      <div ref={card} data-testid="loading-card" className="loading-card">
        <h1 className="title-wordmark">Emberisle</h1>
        <button
          type="button"
          className="loading-start"
          aria-disabled={!ready}
          onClick={() => (ready ? actions.current.begin() : setWaited(true))}
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
              <button type="button" className="loading-retry" onClick={() => actions.current.retry()}>
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
