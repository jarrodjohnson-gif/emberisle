// Shared oracle for the pre-setup roll-off order (#1286, README line 53, docs/design/first-player.md).
// Seat 0 is the winner, the other rerollers follow by reroll die, and earlier-eliminated players follow
// by round-1 die descending (join order breaks equal dice).
export function expectedRollOffOrder(log, players, firstSeatedId) {
  const nameToId = new Map(players.map((p) => [p.name, p.id]));
  const joinOrder = (id) => Number(id.slice(1));

  const rounds = [];
  let currentRound = [];

  for (const line of log) {
    if (line.includes("places first, then")) break;
    const mRoll = line.match(/^(.+) rolls a (\d)\.$/);
    if (mRoll) {
      const id = nameToId.get(mRoll[1]);
      if (id) currentRound.push({ id, die: Number(mRoll[2]) });
    }
    const mTie = line.match(/^(.+) tie at (\d) and roll again\.$/);
    if (mTie) {
      const die = Number(mTie[2]);
      const tiedNames = mTie[1].split(/(?:, and |, | and )/);
      for (const name of tiedNames) {
        const id = nameToId.get(name);
        if (id && !currentRound.some((x) => x.id === id)) {
          currentRound.push({ id, die });
        }
      }
      rounds.push(currentRound);
      currentRound = [];
    }
  }
  if (currentRound.length) rounds.push(currentRound);
  if (!rounds.length) return players.map((p) => p.id);

  let settled = [];
  for (let r = 0; r < rounds.length; r++) {
    const round = rounds[r];
    const top = Math.max(...round.map((x) => x.die));
    const isFinalRound = r === rounds.length - 1;
    const out = round
      .filter((x) => (isFinalRound ? x.id !== round.find((y) => y.die === top).id : x.die !== top))
      .sort((a, b) => b.die - a.die || joinOrder(a.id) - joinOrder(b.id));
    settled = [...out.map((x) => x.id), ...settled];
  }

  const finalRound = rounds.at(-1);
  const finalTop = Math.max(...finalRound.map((x) => x.die));
  const winner = finalRound.find((x) => x.die === finalTop)?.id;

  const order = [winner, ...settled];
  return firstSeatedId ? [firstSeatedId, ...order] : order;
}

export function rollOffOrderOk(g) {
  const expected = expectedRollOffOrder(g.log, g.players, g.rollOff?.first);
  const actual = g.players.map((p) => p.id);
  const rolls = g.rollOff.rolls;
  const expectedRollCount = g.rollOff.first ? g.players.length - 1 : g.players.length;
  return (
    actual.join() === expected.join() &&
    g.current === g.players[0].id &&
    g.phase === "setupSettle" &&
    g.setupIndex === 0 &&
    g.rollOff.pending.length === 0 &&
    Object.keys(rolls).length === expectedRollCount &&
    g.players.every((p) => p.id === g.rollOff.first || (rolls[p.id] >= 1 && rolls[p.id] <= 6))
  );
}
