import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useGame } from "@/lib/game/store";
import { heldRates } from "@/lib/game/rules";
import { RESOURCE_LABEL, type Resource } from "@/lib/game/types";

export default function HandRates({ owner, hint, onClose }: {
  owner: string;
  hint: { resource: Resource; top: number };
  onClose: () => void;
}) {
  const state = useGame((s) => s.state);
  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-testid="hand-rates"]')) onClose();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);
  if (!state) return null;
  const rates = heldRates(state, owner, hint.resource).map((rate) =>
    rate === 4 ? "Bank 4:1" : rate === 3 ? "Dock 3:1" : `${RESOURCE_LABEL[hint.resource]} dock 2:1`,
  ).join(" · ");
  return createPortal(<div
    data-testid="hand-rates"
    role="status"
    className="pointer-events-none fixed left-3 right-3 z-50 mx-auto w-fit max-w-[calc(100%_-_24px)] rounded-control border border-line bg-surface px-3 py-2 text-[16px] font-semibold text-fg shadow-lg"
    style={{ bottom: Math.max(12, innerHeight - hint.top + 8) }}
  >{rates}</div>, document.body);
}
