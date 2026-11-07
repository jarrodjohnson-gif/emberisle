// Design mock for #1303: lobby controls, drawn over the running lobby. Not game code and not a proof.
// capture.mjs imports this file through the Vite dev server and calls mount(). It adds the proposed header and view
// switch next to today's, which controls.css hides. The new controls use the game's own store and copy helper; Table and
// Play games press today's hidden buttons, so the lobby below them is the real one. No src/ file changes.
import { useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { BookOpen, Check, Copy, UserPlus } from "lucide-react";
import { CopyFallback, useCopy } from "@/components/game/CopyText";
import { useGame } from "@/lib/game/store";

// A: tap the code to copy it, and one Invite (share sheet, or copy the link where there is none).
// B: tap the code to copy it, and keep Copy link and Invite as two buttons.
export type HeaderOption = "a" | "b";

const joinLink = (code: string) => {
  const host = new URLSearchParams(location.search).get("host");
  return `${location.origin}${location.pathname}?code=${code}${host ? `&host=${encodeURIComponent(host)}` : ""}`;
};

// Both labels sit in one grid cell and only one shows, so a button keeps the width of its longer label.
function Both({ on, off, onText }: { on: boolean; off: string; onText: string }) {
  return (
    <span className="lc-both">
      <span data-on={!on || undefined}>{off}</span>
      <span data-on={on || undefined}>{onText}</span>
    </span>
  );
}

function Header({ option }: { option: HeaderOption }) {
  const code = useGame((s) => s.code);
  const { state, copy } = useCopy<"code" | "link">();
  const done = (what: "code" | "link") => state?.ok && state.what === what;
  const invite = async () => {
    if (!navigator.share) return copy("link", joinLink(code));
    try {
      await navigator.share({ title: "Emberisle", text: `Join table ${code}`, url: joinLink(code) });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) copy("link", joinLink(code));
    }
  };
  const cover = document.querySelector(".lobby-cover");
  return (
    <>
      <button type="button" className="lc-code" data-testid="mock-code" data-copied={done("code") || undefined} aria-label={`Table code ${code.split("").join(" ")}. Copy`} onClick={() => copy("code", code)}>
        <span className="lc-code-text font-display">{code}</span>
        <span className="lc-code-act" aria-hidden="true">
          {done("code") ? <Check /> : <Copy />}
          <Both on={!!done("code")} off="Copy" onText="Copied" />
        </span>
      </button>
      <span className="lc-links">
        {option === "b" ? (
          <button type="button" className="lc-btn" data-testid="mock-copy-link" onClick={() => copy("link", joinLink(code))}>
            <Both on={!!done("link")} off="Copy link" onText="Copied" />
          </button>
        ) : null}
        <button type="button" className="lc-btn lc-invite" data-testid="mock-invite" aria-label="Invite" onClick={invite}>
          {option === "a" && done("link") ? <Check className="lc-icon-only" /> : <UserPlus className="lc-icon-only" />}
          <Both on={option === "a" && !!done("link")} off="Invite" onText="Copied" />
        </button>
      </span>
      {/* The game's own fallback: a polite "Copied" or "Select and copy", and on failure a field with the text selected. */}
      {cover && state && !state.ok
        ? createPortal(<div className="lobby-copy-fallback"><CopyFallback state={state} label={state.what === "link" ? "Join link" : "Table code"} /></div>, cover)
        : <CopyFallback state={state} label="Table code" />}
    </>
  );
}

function Views() {
  const [games, setGames] = useState(false);
  const invited = useGame((s) => s.ttt?.game?.status === "invited" && s.ttt.game.o === s.seatId);
  const setHowTo = useGame((s) => s.setHowTo);
  // Today's Table and Play games buttons are hidden, not gone: pressing them keeps the lobby's own state in charge.
  const pick = (g: boolean) => {
    setGames(g);
    document.querySelectorAll<HTMLButtonElement>(".lobby-rules .lm button")[g ? 1 : 0]?.click();
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const g = e.key === "Home" ? false : e.key === "End" ? true : !games;
    pick(g);
    document.querySelector<HTMLButtonElement>(`#lc-tab-${g ? "games" : "table"}`)?.focus();
  };
  return (
    <>
      <div role="tablist" aria-label="Lobby view" className="lc-seg" onKeyDown={keys}>
        <button type="button" role="tab" id="lc-tab-table" aria-selected={!games} tabIndex={games ? -1 : 0} onClick={() => pick(false)}>Table</button>
        <button type="button" role="tab" id="lc-tab-games" aria-selected={games} tabIndex={games ? 0 : -1} aria-label={invited ? "Play games, 1 invite" : undefined} onClick={() => pick(true)}>
          <span>Play games</span>{invited ? <b className="lb" aria-hidden="true">1</b> : null}
        </button>
      </div>
      <button type="button" className="lc-btn lc-rules" aria-label="Rules" onClick={(e) => setHowTo(true, e.currentTarget)}>
        <BookOpen aria-hidden="true" /> <span className="lc-rules-text">Rules</span>
      </button>
    </>
  );
}

const roots: Root[] = [];

// Adds the proposed controls beside today's, which controls.css hides. Call again with another option to swap the header.
export function mount(option: HeaderOption, tabs: "split" | "joined" = "split") {
  document.documentElement.dataset.mockLobby = option;
  document.documentElement.dataset.mockTabs = tabs;
  if (!roots.length) {
    const head = document.createElement("div");
    head.className = "lc-header";
    document.querySelector(".lobby-header")!.prepend(head);
    const views = document.createElement("div");
    views.className = "lc-views";
    document.querySelector(".lobby-rules")!.prepend(views);
    roots.push(createRoot(head), createRoot(views));
  }
  roots[0]!.render(<Header option={option} />);
  roots[1]!.render(<Views />);
}
