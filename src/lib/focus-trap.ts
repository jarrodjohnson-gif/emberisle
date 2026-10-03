// Keyboard half of aria-modal: Tab and Shift+Tab cycle inside `ref` while `active`, focus moves in on open and back to the opener on close.
import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => !el.hasAttribute("disabled"));
}

// `initial` is a selector for the element to focus on open; the first focusable one otherwise.
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true, initial?: string) {
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const first = (initial && ref.current?.querySelector<HTMLElement>(initial)) || focusableIn(ref.current)[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusableIn(ref.current);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === -1 || i === items.length - 1 ? 0 : i + 1;
      e.preventDefault();
      items[next]!.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [ref, active, initial]);
}
