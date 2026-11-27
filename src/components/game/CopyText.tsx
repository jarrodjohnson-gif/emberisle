// Copy-to-clipboard with a fallback (#343). `navigator.clipboard` exists only in secure contexts, so on a LAN address over
// plain http (the "On your network" join line) it is missing, and it can also be denied. Then the text is shown in a
// read-only field, focused with its text selected, so the person can copy it by hand. Either outcome is announced.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type CopyState<K extends string> = { what: K; text: string; ok: boolean } | null;

export function useCopy<K extends string>(key?: unknown) {
  const [state, setState] = useState<CopyState<K>>(null);
  const timer = useRef<number>(undefined);
  const seq = useRef(0);
  const cancel = () => {
    seq.current++;
    window.clearTimeout(timer.current);
  };
  const reset = () => {
    cancel();
    setState(null);
  };
  useEffect(() => {
    reset();
    return cancel;
  }, [key]);
  const copy = (what: K, text: string) => {
    const mine = ++seq.current;
    window.clearTimeout(timer.current);
    const done = (ok: boolean) => {
      if (mine !== seq.current) return;
      setState({ what, text, ok });
      if (ok) timer.current = window.setTimeout(() => setState(null), 1500);
    };
    try {
      if (typeof navigator.clipboard?.writeText !== "function") done(false);
      else Promise.resolve(navigator.clipboard.writeText(text)).then(() => done(true), () => done(false));
    } catch {
      done(false);
    }
  };
  return { state, copy, reset };
}

// The polite live region is always mounted so a change is announced; the field shows only after a failed copy.
export function CopyFallback({ state, label, className }: { state: CopyState<string>; label: string; className?: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state && !state.ok) {
      field.current?.focus();
      field.current?.select();
    }
  }, [state]);
  return (
    <>
      <p aria-live="polite" className="sr-only" data-testid="copy-status">
        {state ? (state.ok ? "Copied" : "Select and copy") : ""}
      </p>
      {state && !state.ok ? (
        <label className={cn("flex flex-col gap-1 text-xs text-muted", className)}>
          Select and copy
          <textarea
            ref={field}
            readOnly
            aria-label={label}
            data-testid="copy-fallback"
            value={state.text}
            rows={state.text.includes("\n") ? 4 : 1}
            wrap={state.text.includes("\n") ? "soft" : "off"}
            className="w-full resize-none rounded-[8px] border border-border bg-surface px-2 py-1 text-sm text-fg"
          />
        </label>
      ) : null}
    </>
  );
}
