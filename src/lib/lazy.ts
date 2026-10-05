// #488: UI that is online-only or rarely opened lives in its own chunk, so the first-load index stays inside its budget.
// `chunk(load)` wraps one dynamic import. `prefetch()` fetches it early and quietly (on idle, or on hover/focus of the
// trigger); `pick(select)` makes a component for one export. Once the module is loaded the component renders it on its
// first pass with no suspended frame, so a prefetched chunk never shows a blank frame or a fallback. Until then it
// suspends on the shared load; a failed load reaches the LazyBoundary around it and is forgotten there (or a second later
// if only a prefetch asked), so the next open or mount tries the network again.
import { Component, createElement, Suspense, use, type ComponentType, type ReactNode } from "react";

// A promise React's `use` can read without suspending once it has settled: it carries its own status, as React's thenable
// protocol allows, so a loaded chunk renders synchronously on every later pass (React must see `use` called on each pass).
type Tracked<M> = Promise<M> & { status?: "fulfilled" | "rejected"; value?: M; reason?: unknown; waited?: boolean };

// The boundary that catches a chunk's failure forgets it, so the next mount asks the network: keyed by the error thrown.
const caught = new WeakMap<object, () => void>();

export function chunk<M>(load: () => Promise<M>) {
  let pending: Tracked<M> | undefined;
  // The browser remembers a module that failed to fetch for the life of the page, so a plain retry of the same URL fails at
  // once without touching the network. The failure names the URL (Chromium and Firefox do; Safari does not, and there the
  // chunk waits for a reload), and the retry asks for the same file under a fresh query, which the server ignores.
  let failedUrl: string | undefined;
  let retries = 0;
  const fetchChunk = (): Promise<M> =>
    failedUrl ? import(/* @vite-ignore */ `${failedUrl}${failedUrl.includes("?") ? "&" : "?"}retry=${++retries}`) : load();
  const preload = () => {
    if (pending) return pending;
    const p: Tracked<M> = fetchChunk().then(
      (m) => {
        p.status = "fulfilled";
        p.value = m;
        return m;
      },
      (e: unknown) => {
        p.status = "rejected";
        p.reason = e;
        // The rejected load stays: React re-renders whatever suspended on it as soon as it settles, and that render has to
        // reach the error boundary, not ask the network again. The boundary forgets it once caught; a failed prefetch
        // nobody rendered on is forgotten a second later (or by the first mount that meets it, below).
        const forget = () => {
          if (pending === p) pending = undefined;
        };
        setTimeout(forget, 1000);
        if (typeof e === "object" && e !== null) caught.set(e, forget);
        failedUrl = chunkUrl(e) ?? failedUrl;
        throw e;
      },
    );
    return (pending = p);
  };
  // Resolves true once the chunk is in memory, false if the load failed.
  const prefetch = () => preload().then(() => true, () => false);
  const pick = <P extends object>(select: (m: M) => ComponentType<P>) =>
    function Lazy(props: P) {
      let p = preload();
      // A failed prefetch no render waited on (the table's idle one, with the win screen mounting at game over) is dropped,
      // and this mount asks the network. A failure this component waited on has to reach the boundary, which forgets it.
      if (p.status === "rejected" && !p.waited) {
        pending = undefined;
        p = preload();
      }
      if (!p.status) p.waited = true;
      // React's type for `use` wants one settled shape at a time; the promise reports whichever it is in at run time.
      return createElement(select(use(p as Promise<M>)), props);
    };
  return { prefetch, pick };
}

// Prefetch when the browser is idle (within 2 s even while the island keeps every frame busy), or after a short delay
// where requestIdleCallback is missing (Safari).
export function preloadOnIdle(prefetch: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(prefetch, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(prefetch, 300);
  return () => window.clearTimeout(id);
}

// Suspense plus an error boundary for a lazy chunk. While it loads nothing shows (a prefetched chunk never gets here); if
// it fails, `failed` shows instead: null for a dock or a sheet, so the rest of the table stands. A failed chunk tries
// again when `retryKey` changes (the next open) or on the next mount.
type BoundaryProps = { failed: ReactNode; retryKey?: string; children: ReactNode };
export class LazyBoundary extends Component<BoundaryProps, { failed: boolean; retryKey?: string }> {
  state = { failed: false, retryKey: this.props.retryKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    if (typeof e === "object" && e !== null) caught.get(e)?.();
  }
  static getDerivedStateFromProps(props: BoundaryProps, state: { failed: boolean; retryKey?: string }) {
    return props.retryKey !== state.retryKey ? { failed: false, retryKey: props.retryKey } : null;
  }
  render() {
    if (this.state.failed) return this.props.failed;
    return createElement(Suspense, { fallback: null }, this.props.children);
  }
}

// The URL a failed chunk load names (Chromium and Firefox name it; Safari does not), without any retry query. Dev serves the
// source files (.ts, .tsx), so the retry works there too; the stale-deploy reload below only runs on a build, because only
// the built preload helper fires `vite:preloadError`.
export function chunkUrl(e: unknown): string | undefined {
  return /(https?:\/\/[^\s'"]+\.(?:[cm]?js|tsx?))/.exec(String(e))?.[1]?.split("?")[0];
}

// A focused text field means the user is typing (a join code); a reload would throw that away.
function typing() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/.test(el.type);
}

export const JOIN_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

// The focus change that releases a held reload can be the press on Join or Host, which the reload then swallows. The join
// field's value rides the reload in the URL (as a join link does) so the field refills: a valid code replaces whatever link
// the URL held, and a cleared or partial field drops it.
function keepJoinCode() {
  const field = document.querySelector<HTMLInputElement>('input[aria-label="Join code"]');
  if (!field) return;
  const url = new URL(location.href);
  const code = field.value;
  if (JOIN_CODE.test(code)) {
    if (url.searchParams.get("watch")?.toUpperCase() !== code) {
      url.searchParams.delete("watch");
      url.searchParams.set("code", code);
    }
  } else {
    url.searchParams.delete("watch");
    url.searchParams.delete("code");
  }
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

// A chunk that fails to load on a page that is still at the title is most likely a stale page after a new deploy: the
// hashed chunk it asks for is gone. Reload once per failing URL, on Vite's own failure event; the session remembers the
// URLs it has reloaded for, so a chunk the network keeps refusing never loops, while a later deploy (new URLs) gets its one
// reload too. `when()` keeps a page that holds a game from reloading over a blip. Storage can be blocked; then the page
// never reloads itself.
const RELOADED_KEY = "emberisle-chunk-reloaded";
export function reloadOnStaleChunk(when: () => boolean) {
  let waiting = false;
  const attempt = (url: string) => {
    if (!when()) return;
    if (typing()) {
      if (waiting) return;
      waiting = true;
      document.addEventListener(
        "focusout",
        () => {
          waiting = false;
          // focusout fires before the next element is focused; look once focus has settled.
          setTimeout(() => attempt(url), 0);
        },
        { once: true },
      );
      return;
    }
    try {
      const done: string[] = JSON.parse(sessionStorage.getItem(RELOADED_KEY) ?? "[]");
      if (done.includes(url)) return;
      sessionStorage.setItem(RELOADED_KEY, JSON.stringify([...done, url]));
    } catch {
      return;
    }
    keepJoinCode();
    location.reload();
  };
  const onError = (e: Event) => attempt(chunkUrl((e as Event & { payload?: unknown }).payload) ?? "?");
  window.addEventListener("vite:preloadError", onError);
  return () => window.removeEventListener("vite:preloadError", onError);
}
