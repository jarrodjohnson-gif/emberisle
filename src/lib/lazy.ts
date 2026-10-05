// #488: UI that is online-only or rarely opened lives in its own chunk, so the first-load index stays inside its budget.
// `chunk(load)` wraps one dynamic import. `preload()` fetches it early (on idle, or on hover/focus of the trigger), and
// `pick(select)` makes a React.lazy component for one export. Once the module is loaded the thenable handed to React.lazy
// calls back synchronously, which React takes as an already-resolved module: the component renders on its first pass with
// no suspended frame, so a prefetched chunk never shows a blank frame or a fallback.
import { lazy, type ComponentType } from "react";

export function chunk<M>(load: () => Promise<M>) {
  let loaded: M | undefined;
  let pending: Promise<M> | undefined;
  const preload = () => (pending ??= load().then((m) => (loaded = m)));
  const pick = <P extends object>(select: (m: M) => ComponentType<P>) =>
    lazy(
      () =>
        ({
          then(resolve: (v: { default: ComponentType<P> }) => void, reject: (e: unknown) => void) {
            if (loaded) resolve({ default: select(loaded) });
            else preload().then((m) => resolve({ default: select(m) }), reject);
          },
        }) as unknown as Promise<{ default: ComponentType<P> }>,
    );
  return { preload, pick };
}

// Prefetch when the browser is idle (within 2 s even while the island keeps every frame busy), or after a short delay
// where requestIdleCallback is missing (Safari).
export function preloadOnIdle(preload: () => unknown) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(() => preload(), { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(preload, 300);
  return () => window.clearTimeout(id);
}
