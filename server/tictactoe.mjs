// Tic-tac-toe in the lobby's Play games shelf (#1263, docs/design/mini-games-shelf). One seat invites one named seat; the host
// keeps the board and sends it to those two seats only. Nothing is saved. Every game closes when the table starts, and a
// seat's game closes when that seat leaves. A seat is in at most one game, so a room of four holds at most two, with no timers.
export const TTT_TYPES = new Set(["tttInvite", "tttAnswer", "tttMove", "tttAgain", "tttClose"]);
// A seat's tic-tac-toe messages have a bucket of their own, apart from the table's, so a flood here never slows Ready or Start.
export const TTT_CAP = 8;
export const TTT_RATE = 2;

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
let seq = 0;

// What the two seats see: seat ids, never sockets or secrets. `turn` and `winner` are seat ids.
function view(g) {
  const seatOf = (mark) => g.seats[mark === "x" ? 0 : 1].id;
  return {
    id: g.id,
    x: g.seats[0].id,
    o: g.seats[1].id,
    board: g.board.map((c) => c || ".").join(""),
    status: g.status,
    turn: g.status === "playing" ? seatOf(g.turn) : null,
    winner: g.status === "won" ? seatOf(g.turn) : null,
    line: g.line,
  };
}

function post(g, send) {
  const msg = { type: "ttt", game: view(g) };
  for (const s of g.seats) send(s.ws, msg);
}

function close(g, reason, by, send) {
  for (const s of g.seats) {
    s.ttt = null;
    send(s.ws, { type: "ttt", game: null, id: g.id, reason, by: by?.id ?? null });
  }
}

// One tic-tac-toe message from `seat`, lobby only. Returns the refusal for the sender, or nothing.
export function tictactoe(room, seat, msg, send) {
  const g = seat.ttt;
  if (msg.type === "tttInvite") {
    if (g) return "Close your game first.";
    const to = room.seats.find((s) => s.id === msg.to);
    if (!to || to === seat || to.bot) return "Pick a table-mate.";
    if (!to.ws || to.ws.readyState !== to.ws.OPEN) return `${to.name} is away.`;
    if (to.ttt) return `${to.name} is busy.`;
    seat.ttt = to.ttt = { id: `t${++seq}`, seats: [seat, to], board: Array(9).fill(""), first: "x", turn: "x", status: "invited", line: null };
    return post(seat.ttt, send);
  }
  if (!g || msg.id !== g.id) return "That game is over.";
  const mark = g.seats[0] === seat ? "x" : "o";
  if (msg.type === "tttClose") return close(g, "closed", seat, send);
  if (msg.type === "tttAnswer") {
    if (g.status !== "invited" || mark !== "o") return "That game is over.";
    if (msg.yes !== true) return close(g, "declined", seat, send);
    g.status = "playing";
    return post(g, send);
  }
  if (msg.type === "tttMove") {
    if (g.status !== "playing" || g.turn !== mark) return "Not your turn.";
    if (!Number.isInteger(msg.cell) || msg.cell < 0 || msg.cell > 8 || g.board[msg.cell]) return "Pick an empty square.";
    g.board[msg.cell] = mark;
    g.line = LINES.find((l) => l.every((i) => g.board[i] === mark)) ?? null;
    if (g.line) g.status = "won";
    else if (g.board.every(Boolean)) g.status = "draw";
    else g.turn = mark === "x" ? "o" : "x";
    return post(g, send);
  }
  // tttAgain: a fresh board under a new id, so a late move for the old one is refused. The other mark goes first.
  if (g.status !== "won" && g.status !== "draw") return "Finish this game first.";
  g.first = g.first === "x" ? "o" : "x";
  Object.assign(g, { id: `t${++seq}`, board: Array(9).fill(""), turn: g.first, status: "playing", line: null });
  post(g, send);
}

// The table started, or `seat` left: its game (or every game) closes for both players.
export function closeTtt(seats, reason, by, send) {
  for (const s of seats) if (s.ttt) close(s.ttt, reason, by, send);
}

// A seat back after a drop gets its game again.
export function resendTtt(seat, send) {
  if (seat.ttt) send(seat.ws, { type: "ttt", game: view(seat.ttt) });
}
