// Keyboard half of aria-modal: Tab and Shift+Tab cycle inside `ref` while `active`, focus moves in on open and back to the opener on close.
import { useEffect, type RefObject } from "react";

const stack: RefObject<HTMLElement | null>[] = [];

function focusableIn(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,[tabindex]") ?? [])].filter(
    (el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && !el.closest("[hidden]"),
  );
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const items = focusableIn(stack.at(-1)!.current);
  const i = items.indexOf(document.activeElement as HTMLElement);
  items.at(e.shiftKey ? (i > 0 ? i - 1 : -1) : (i + 1) % items.length)?.focus();
}

// `initial` is a selector for the element to focus on open; the first focusable one otherwise. `opener` is where focus
// goes back on close; whatever was focused on open otherwise (Safari does not focus a clicked button, #302).
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true, initial?: string, opener?: HTMLElement | null) {
  useEffect(() => {
    if (!active) return;
    if (stack.push(ref) === 1) addEventListener("keydown", onKey, true);
    const back = opener ?? (document.activeElement as HTMLElement | null);
    ((initial && ref.current?.querySelector<HTMLElement>(initial)) || focusableIn(ref.current)[0])?.focus();
    return () => {
      stack.splice(stack.indexOf(ref), 1);
      if (!stack.length) removeEventListener("keydown", onKey, true);
      if (back?.isConnected) back.focus();
    };
  }, [ref, active, initial, opener]);
}
