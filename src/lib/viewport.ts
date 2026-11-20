// The one phone / portrait test every phone layout keys off (docs/design/mobile-hud.md "Breakpoint").
import { useEffect, useState } from "react";

export type Viewport = { phone: boolean; portrait: boolean };

export function readViewport(): Viewport {
  if (typeof window === "undefined") return { phone: false, portrait: false };
  const coarse = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)").matches : false;
  return {
    phone: coarse || window.innerWidth < 768,
    portrait: window.innerHeight > window.innerWidth,
  };
}

export function useViewport(): Viewport {
  const [v, setV] = useState(readViewport);
  useEffect(() => {
    const mq = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)") : null;
    const update = () =>
      setV((o) => {
        const n = readViewport();
        return n.phone === o.phone && n.portrait === o.portrait ? o : n;
      });
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    if (typeof mq?.addEventListener === "function") mq.addEventListener("change", update);
    else if (typeof mq?.addListener === "function") mq.addListener(update);
    update();
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (typeof mq?.removeEventListener === "function") mq.removeEventListener("change", update);
      else if (typeof mq?.removeListener === "function") mq.removeListener(update);
    };
  }, []);
  return v;
}
