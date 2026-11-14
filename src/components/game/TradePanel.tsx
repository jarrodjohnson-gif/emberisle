// #1537: the trade sheet. Give and Get tokens feed one sentence, Ask the table, and one Bank button.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/lib/focus-trap";
import { harborRate } from "@/lib/game/rules";
import { useGame } from "@/lib/game/store";
import { RESOURCES, RESOURCE_LABEL, type Resource } from "@/lib/game/types";
import { play } from "@/lib/sound";
import { bagText } from "@/lib/game/trade";
import { chunk, LazyBoundary } from "@/lib/lazy";
import "./trade-panel.css";
import { NeedDots } from "./SeatNeeds";
import { setPlayerNeeds } from "./need-state";

const picker = chunk(() => import("./TradeResource"));
picker.prefetch();
const Stepper = picker.pick((m) => m.TradeResource);

const ZERO: Record<Resource, number> = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };

export function TradePanel() {
  const open = useGame((s) => s.tradeOpen);
  const setTradeOpen = useGame((s) => s.setTradeOpen);
  const state = useGame((s) => s.state);
  const localId = useGame((s) => s.localId);
  const mode = useGame((s) => s.mode);
  const dispatch = useGame((s) => s.dispatch);
  const askTable = useGame((s) => s.askTable);
  const opener = useGame((s) => s.tradeOpener);
  const [draftGive, setGive] = useState(ZERO);
  const [want, setWant] = useState(ZERO);
  const panel = useRef<HTMLElement>(null);

  const actor = mode === "hotseat" ? state?.current : localId;
  // Hotseat has nobody else to ask, and a partner turn takes no player trades (#1609): the sheet is the bank's only.
  const bankOnly = mode === "hotseat" || state?.role === "partner";
  const me = state?.players.find((p) => p.id === actor);
  const mine = Boolean(state && me && state.phase === "main" && state.current === actor);
  const shown = open && mine;

  // Clamp both the rendered offer and its draft when a live hand loses goods.
  const give = { ...draftGive };
  for (const r of RESOURCES) give[r] = Math.min(give[r], me?.resources[r] ?? 0);
  useEffect(() => {
    if (!me) return;
    setGive((old) => {
      const next = { ...old };
      for (const r of RESOURCES) next[r] = Math.min(next[r], me.resources[r]);
      return RESOURCES.some((r) => next[r] !== old[r]) ? next : old;
    });
  }, [me?.resources]);

  // #378: a modal dialog. Focus lands on Close (the first focusable), Tab cycles inside, and focus goes back to the opener on close.
  useFocusTrap(panel, shown, '[aria-label="Close"]', opener);

  useEffect(() => {
    // The turn moved on (or the game ended) with the panel up: drop it rather than pop it on the next turn.
    if (open && !mine) setTradeOpen(false);
  }, [open, mine, setTradeOpen]);
  useEffect(() => {
    if (open) return;
    setGive(ZERO);
    setWant(ZERO);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      play("ui_back");
      setTradeOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, setTradeOpen]);

  if (!shown || !state || !me) return null;

  const giving = RESOURCES.filter((r) => give[r] > 0);
  const wanting = RESOURCES.filter((r) => want[r] > 0);
  const asking = giving.length > 0 && wanting.length > 0;
  const giveText = bagText(give), getText = bagText(want);

  // The bank and the docks take one kind for one other kind, at the best rate a building of yours earns.
  const g = giving.length === 1 ? giving[0]! : null;
  const w = wanting.length === 1 ? wanting[0]! : null;
  const rate = g ? harborRate(state, me.id, g) : 4;
  const where = rate === 4 ? "Bank" : "Dock";
  const low = (r: Resource) => RESOURCE_LABEL[r].toLowerCase();
  const refusal = !g || !w
    ? ["One kind each", "Pick one kind to give and one to get."]
    : me.resources[g] < rate
      ? [`${where} needs ${rate}`, `Need ${rate} ${low(g)} for the ${where.toLowerCase()}.`]
      : state.bank[w] <= 0
        ? [`No ${low(w)} left`, `The bank has no ${low(w)}.`]
        : null;
  const bankLabel = refusal?.[0] ?? (rate === 2 ? `${RESOURCE_LABEL[g!]} dock 2:1` : `${where} ${rate}:1`);
  const bankHint = refusal?.[1] ?? `Give ${rate} ${low(g!)}, get 1 ${low(w!)}.`;

  const bank = () => {
    if (!g || !w || refusal) return;
    if (dispatch({ type: "bankTrade", give: g, want: w }).ok) setTradeOpen(false);
  };
  // #1537: your own needs follow from your offer: its Get goods, at most two.
  const ask = () => {
    setPlayerNeeds(me.id, wanting.slice(0, 2));
    askTable(give, want);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/15" onClick={() => setTradeOpen(false)}>
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-title"
        data-testid="trade-panel"
        className="trade-composer"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="trade-composer-header">
          <h2 id="trade-title" className="trade-title">Trade</h2>
          <Button variant="ghost" size="icon" onClick={() => setTradeOpen(false)} aria-label="Close" back>
            <X className="size-5" />
          </Button>
        </header>

        <div className="trade-composer-scroll" id="trade-goods" role="region" aria-labelledby="trade-goods-title" tabIndex={0}>
          <h3 id="trade-goods-title" className="sr-only">Trade goods</h3>
          <LazyBoundary failed={<p role="alert">Trade choices could not load. Close and reopen to retry.</p>}>
          {(["give", "want"] as const).map((side) => {
            const bag = side === "give" ? give : want;
            return (
              <section key={side} className="trade-half" data-testid={`trade-${side}-row`} aria-labelledby={`trade-${side}-title`}>
                <div className="trade-label">
                  <h3 id={`trade-${side}-title`}>{side === "give" ? "Give" : "Get"}</h3>
                  {side === "want" ? <p>dots show who is asking for it</p> : null}
                </div>
                <div className="trade-resource-grid">
                  {RESOURCES.map((r) => (
                    <Stepper key={r} resource={r} side={side} owned={me.resources[r]} value={bag[r]}
                      canMore={side === "give" ? give[r] < me.resources[r] && want[r] === 0 : want[r] < 19 && give[r] === 0}
                      onChange={(n) => side === "give" ? setGive({ ...give, [r]: n }) : setWant({ ...want, [r]: n })}
                    >{side === "want" ? <NeedDots kind={r} me={me.id} /> : null}</Stepper>
                  ))}
                </div>
              </section>
            );
          })}
          </LazyBoundary>
          {!bankOnly ? (
            <p className="trade-sentence" data-testid="trade-player-preview" aria-live="polite">
              {giveText || getText ? <>
                {giveText ? <span className="trade-give-text">Give {giveText}</span> : null}
                {giveText && getText ? " · " : null}
                {getText ? <span className="trade-get-text">Get {getText}</span> : null}
              </> : <span className="trade-empty">Pick what to give and what to get.</span>}
            </p>
          ) : null}
        </div>

        <footer className="trade-composer-footer">
          {!bankOnly ? <Button className="trade-ask" disabled={!asking} onClick={ask}>Ask the table</Button> : null}
          <Button variant="secondary" className="trade-bank" aria-describedby="trade-bank-quote" disabled={refusal !== null} onClick={bank}>{bankLabel}</Button>
          <p className="sr-only" id="trade-bank-quote" data-testid="trade-hint" aria-live="polite">{bankHint}</p>
        </footer>
      </section>
    </div>
  );
}
