import { useEffect, useState } from "react";

// #402: true while the element has content scrolled out of view below its bottom edge.
// Returns a callback ref for the scroller (it may mount late) and the flag.
export function useMoreBelow(): [(el: HTMLElement | null) => void, boolean] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!el) return;
    const update = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const mutate = new MutationObserver(update);
    mutate.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
      mutate.disconnect();
    };
  }, [el]);
  return [setEl, more];
}
