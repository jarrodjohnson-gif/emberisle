// The one phone / portrait test every phone layout keys off (docs/design/mobile-hud.md "Breakpoint").
import { useEffect, useState } from "react";

// #1429: a wide screen with a mouse, taller than a short window: the desktop dock (docs/design/desktop-dock-1274), and the
// 88 x 80 goods card (hand-motion.css), which use this same rule.
const DOCK = "(min-width: 768px) and (pointer: fine) and (min-height: 481px)";

export type Viewport = { phone: boolean; portrait: boolean; dock: boolean };

export function readViewport(): Viewport {
  return {
    phone: matchMedia("(pointer: coarse)").matches || window.innerWidth < 768,
    portrait: window.innerHeight > window.innerWidth,
    dock: matchMedia(DOCK).matches,
  };
}

export function useViewport(): Viewport {
  const [v, setV] = useState(readViewport);
  useEffect(() => {
    const mq = matchMedia("(pointer: coarse)");
    const dock = matchMedia(DOCK);
    const update = () =>
      setV((o) => {
        const n = readViewport();
        return n.phone === o.phone && n.portrait === o.portrait && n.dock === o.dock ? o : n;
      });
    window.addEventListener("resize", update);
    mq.addEventListener("change", update);
    dock.addEventListener("change", update);
    update();
    return () => {
      window.removeEventListener("resize", update);
      mq.removeEventListener("change", update);
      dock.removeEventListener("change", update);
    };
  }, []);
  return v;
}
