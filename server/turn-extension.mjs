import { randomUUID } from "node:crypto";

// A round contains several turns. Setup's two placements are separate turn occurrences.
export function extensionKey(game) {
  if (!game || game.phase === "over") return null;
  const stage = game.phase === "rollOff" ? "rollOff" : game.phase.startsWith("setup") ? `setup:${game.setupIndex}` : "play";
  return `${game.turn}:${game.current}:${stage}`;
}

export function extensionBudget(seat, game, extensionMs = 60_000) {
  const key = extensionKey(game);
  const e = seat.extension;
  if (e?.key !== key || typeof e.token !== "string" || e.token.length > 64 || typeof e.used !== "boolean" || !Number.isSafeInteger(e.extra) || e.extra < 0 || e.extra > extensionMs || (!e.used && e.extra !== 0)) {
    seat.extension = { key, token: randomUUID(), used: false, extra: 0 };
  }
  return seat.extension;
}

// Votes are transient; the consumed request and granted budget live in the saved seat.
export function turnExtensions(room, { changed, extend, extensionMs = 60_000, voteMs = 15_000 }) {
  let vote = null;
  let result = null;
  let timer = null;
  const connectedHuman = (s) => Boolean(s.ws && s.ws.readyState === s.ws.OPEN && !s.bot && room.game?.players.find((p) => p.id === s.pid)?.kind === "human");
  const targetSeat = () => room.seats.reduce((a, s) => s.turnDeadline && (!a || s.turnDeadline < a.turnDeadline) ? s : a, null);
  const finish = (outcome) => {
    const old = vote;
    if (!old) return;
    clearTimeout(timer);
    timer = null;
    vote = null;
    result = { id: old.id, target: old.target, key: old.key, outcome };
    if (outcome === "passed") {
      const seat = room.seats.find((s) => s.pid === old.target);
      extensionBudget(seat, room.game, extensionMs).extra = extensionMs;
      extend(seat, extensionMs);
    }
    changed();
  };
  const decide = () => {
    if (!vote) return;
    if (Date.now() >= vote.until) return finish("failed");
    const yes = vote.voters.filter((id) => vote.yes.includes(id)).length;
    if (yes > vote.voters.length / 2) return finish("passed");
    if (!vote.voters.length || vote.voters.every((id) => vote.yes.includes(id) || vote.no.includes(id)) || Date.now() >= vote.until) finish("failed");
  };
  const sync = () => {
    if (!vote) return;
    const seat = room.seats.find((s) => s.pid === vote.target);
    if (!seat?.turnDeadline || seat.turnDeadline <= Date.now() || extensionKey(room.game) !== vote.key || !connectedHuman(seat)) return finish("cancelled");
    // A dropped seat cannot block the table. A new/rejoining seat cannot acquire a vote mid-ballot.
    const live = new Set(room.seats.filter(connectedHuman).map((s) => s.pid));
    const count = vote.voters.length;
    vote.voters = vote.voters.filter((pid) => live.has(pid));
    decide();
    if (vote && count !== vote.voters.length) changed();
  };
  return {
    sync,
    state() {
      const seat = targetSeat();
      const budget = seat && extensionBudget(seat, room.game, extensionMs);
      const publicVote = vote && { id: vote.id, target: vote.target, until: vote.until, voters: [...vote.voters], yes: [...vote.yes], no: [...vote.no] };
      const publicResult = result && result.key === extensionKey(room.game) && (!seat || result.target === seat.pid) ? { id: result.id, target: result.target, outcome: result.outcome } : null;
      return { target: seat?.pid ?? null, key: budget?.token ?? null, used: budget?.used ?? false, vote: publicVote, result: publicResult };
    },
    ask(seat, msg) {
      sync();
      const target = targetSeat();
      if (!connectedHuman(seat) || !target || !connectedHuman(target) || target.turnDeadline <= Date.now() || msg.target !== target.pid || msg.key !== extensionBudget(target, room.game, extensionMs).token) return "That timer has changed.";
      const budget = extensionBudget(target, room.game, extensionMs);
      if (vote || budget.used) return "More time was already requested this turn.";
      const voters = room.seats.filter((s) => s.pid !== target.pid && connectedHuman(s)).map((s) => s.pid);
      if (!voters.length) return "No other connected players can vote.";
      budget.used = true;
      result = null;
      vote = { id: randomUUID(), key: budget.key, target: target.pid, until: Date.now() + voteMs, voters, yes: voters.includes(seat.pid) ? [seat.pid] : [], no: [] };
      timer = setTimeout(() => { sync(); if (vote) finish("failed"); }, voteMs);
      decide();
      if (vote) changed();
      return null;
    },
    answer(seat, msg) {
      sync();
      if (!vote || msg.voteId !== vote.id || typeof msg.yes !== "boolean" || !connectedHuman(seat) || !vote.voters.includes(seat.pid) || vote.yes.includes(seat.pid) || vote.no.includes(seat.pid) || Date.now() >= vote.until) return "That vote is closed or already answered.";
      (msg.yes ? vote.yes : vote.no).push(seat.pid);
      decide();
      if (vote) changed();
      return null;
    },
    close() { clearTimeout(timer); vote = null; },
  };
}
