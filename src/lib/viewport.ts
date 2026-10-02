// The one phone / portrait test every phone layout keys off (docs/design/mobile-hud.md "Breakpoint").
import { useEffect, useState } from "react";

export type Viewport = { phone: boolean; portrait: boolean };

export function readViewport(): Viewport {
  return {
    phone: matchMedia("(pointer: coarse)").matches || window.innerWidth < 768,
    portrait: window.innerHeight > window.innerWidth,
  };
}

export function useViewport(): Viewport {
  const [v, setV] = useState(readViewport);
  useEffect(() => {
    const mq = matchMedia("(pointer: coarse)");
    const update = () =>
      setV((o) => {
        const n = readViewport();
        return n.phone === o.phone && n.portrait === o.portrait ? o : n;
      });
    window.addEventListener("resize", update);
    mq.addEventListener("change", update);
    update();
    return () => {
      window.removeEventListener("resize", update);
      mq.removeEventListener("change", update);
    };
  }, []);
  return v;
}
