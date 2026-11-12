// #1263: tic-tac-toe in the Play games shelf (docs/design/mini-games-shelf, choice C: invite a named seat). The host keeps the
// board and sends it to the two seats playing; this draws the tile, the seat picker and the board, and sends taps.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { useGame } from "@/lib/game/store";

const NOTE = { declined: "said no.", closed: "closed the game.", left: "left." } as const;

export function TicTacToe({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const msg = useGame((s) => s.ttt);
  const seats = useGame((s) => s.seats);
  const me = useGame((s) => s.seatId);
  const net = useGame((s) => s.net);
  // Choice G: a watcher has no seat to play from, so it gets Sandwich Stacker only.
  const spectator = useGame((s) => s.spectator);
  const [pick, setPick] = useState(false);
  const g = msg?.game ?? null;
  const was = useRef(g);
  // The inviter's board opens when the invite is taken; any board closes with its game.
  useEffect(() => {
    if (g?.status === "playing" && was.current?.status === "invited" && g.x === me) setOpen(true);
    if (!g) setOpen(false);
    was.current = g;
  }, [g, me, setOpen]);
  const seat = (id: string | null | undefined) => seats.find((s) => s.id === id);
  const name = (id: string | null | undefined) => seat(id)?.name ?? "Your table-mate";
  const mates = seats.filter((s) => s.id !== me && !s.bot && !s.away);
  const them = g ? (g.x === me ? g.o : g.x) : null;
  const send = (type: Parameters<NonNullable<typeof net>["ttt"]>[0], fields: Record<string, unknown> = {}) => net?.ttt(type, { id: g?.id, ...fields });
  if (spectator) return null;

  if (open && g && g.status !== "invited") {
    const over = g.status !== "playing";
    const mine = g.x === me ? "x" : "o";
    const mark = (m: string) => (m === "x" ? "X" : "O");
    const turn = g.status === "draw" ? "Draw" : g.winner ? (g.winner === me ? "You won" : `${name(g.winner)} won`) : g.turn === me ? "Your turn" : `${name(g.turn)}'s turn`;
    return (
      <div data-testid="ttt" className="lobby-wait lx">
        <div className="lobby-wait-head">
          <b>Tic-tac-toe</b>
          <Button variant="outline" back onClick={() => setOpen(false)}>Hide</Button>
        </div>
        <p className="lx-who">
          <span><SeatDot color={seat(me)?.color ?? "#000"} className="size-3" />You <i style={{ color: seat(me)?.color }}>{mark(mine)}</i></span>
          <b data-testid="ttt-turn" aria-live="polite">{turn}</b>
          <span><SeatDot color={seat(them)?.color ?? "#000"} className="size-3" />{name(them)} <i style={{ color: seat(them)?.color }}>{mark(mine === "x" ? "o" : "x")}</i></span>
        </p>
        <div className="lx-grid" role="group" aria-label="Board">
          {[...g.board].map((c, i) => (
            <button
              key={i}
              type="button"
              className={g.line?.includes(i) ? "lx-win" : undefined}
              style={{ color: seat(c === "x" ? g.x : g.o)?.color }}
              disabled={over || c !== "." || g.turn !== me}
              aria-label={`Square ${i + 1}${c === "." ? "" : `, ${mark(c)}`}`}
              onClick={() => send("tttMove", { cell: i })}
            >
              {c === "." ? "" : mark(c)}
            </button>
          ))}
        </div>
        <div className="lx-foot">
          {over ? <Button variant="outline" onClick={() => send("tttAgain")}>Play again</Button> : null}
          <Button variant="ghost" onClick={() => send("tttClose")}>Quit game</Button>
        </div>
      </div>
    );
  }

  const note = !g && msg?.reason && msg.reason !== "start" && msg.by !== me ? `${name(msg.by)} ${NOTE[msg.reason]}` : null;
  let line = mates.length ? "With a table-mate" : "Needs a table-mate";
  let buttons = <Button variant="outline" disabled={!mates.length} onClick={() => setPick(true)}>Play</Button>;
  if (g?.status === "invited" && g.x === me) {
    line = `Waiting for ${name(them)}…`;
    buttons = <Button variant="outline" back onClick={() => send("tttClose")}>Cancel</Button>;
  } else if (g?.status === "invited") {
    line = `${name(them)} wants to play`;
    buttons = (
      <>
        <Button variant="outline" onClick={() => send("tttAnswer", { yes: false })}>No</Button>
        <Button onClick={() => { send("tttAnswer", { yes: true }); setOpen(true); }}>Play</Button>
      </>
    );
  } else if (g) {
    line = `You and ${name(them)}`;
    buttons = <Button onClick={() => setOpen(true)}>Open</Button>;
  } else if (pick) {
    line = "Play with…";
    buttons = <Button variant="outline" back onClick={() => setPick(false)}>Cancel</Button>;
  }
  return (
    <div data-testid="ttt-tile" className="lx-tile" role="group" aria-label="Tic-tac-toe">
      <span className="lx-pic" aria-hidden="true">#</span>
      <span><b>Tic-tac-toe</b><span>{note ?? line}</span></span>
      {buttons}
      {pick && !g ? (
        <div className="lx-pick">
          {mates.map((s) => (
            <Button key={s.id} variant="outline" onClick={() => { setPick(false); net?.ttt("tttInvite", { to: s.id }); }}>
              <SeatDot color={s.color} className="size-3" />{s.name}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
