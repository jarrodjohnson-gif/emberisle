// #608 research: a settled state and its public log cannot reveal every bot action's order.
// Keep this on production rules: a parser cannot recover information absent from its input.
import assert from "node:assert/strict";
import { createGame } from "../src/lib/game/board.ts";
import { logBotAction } from "../src/lib/game/ai.ts";
import { applyAction, legalRoads, legalSettle } from "../src/lib/game/rules.ts";
import { RESOURCES } from "../src/lib/game/types.ts";

function apply(state, actor, action) {
  const result = applyAction(state, actor, action);
  assert.ifError(result.error);
  assert.notStrictEqual(result.state, state, "a successful action commits a new state");
  return result.state;
}

function assertConserved(state) {
  for (const resource of RESOURCES) {
    const counts = [state.bank[resource], ...state.players.map((p) => p.resources[resource])];
    assert.ok(counts.every((n) => Number.isInteger(n) && n >= 0), `valid ${resource} counts after each action`);
    assert.equal(counts.reduce((sum, n) => sum + n, 0), 19, `${resource} supply conserved after each action`);
  }
}

// Deterministic legal setup; no RNG rolls or browser timing is involved.
let initial = createGame({ humans: [{ name: "Ember" }], bots: 2, seed: 608 });
initial.phase = "setupSettle";
initial.rollOff = null;
let placements = 0;
while (initial.phase === "setupSettle" || initial.phase === "setupRoad") {
  assert.ok(++placements <= 12, "three seats finish their two setup pairs");
  const actor = initial.current;
  const action = initial.phase === "setupSettle"
    ? { type: "setupSettle", vertexId: legalSettle(initial, actor, true)[0] }
    : { type: "setupRoad", edgeId: legalRoads(initial, actor, true)[0] };
  initial = apply(initial, actor, action);
}
assert.equal(placements, 12);
const actor = initial.players.find((p) => p.kind === "bot").id;
initial.current = actor;
initial.phase = "main";
initial.dice = [2, 3];
initial.log = [];
const player = initial.players.find((p) => p.id === actor);
player.resources = { timber: 2, clay: 2, wool: 0, grain: 0, ore: 0 };
for (const resource of RESOURCES) {
  initial.bank[resource] = 19 - initial.players.reduce((sum, p) => sum + p.resources[resource], 0);
  assert.ok(initial.bank[resource] >= 0, "fixture conserves the goods supply");
}
const [first, second] = legalRoads(initial, actor, false);
assert.ok(first && second && first !== second, "two distinct paths are legal before either build");
const initialBytes = JSON.stringify(initial);
assertConserved(initial);

function history(order) {
  let state = structuredClone(initial);
  const commits = [];
  for (const edgeId of order) {
    assert.ok(legalRoads(state, actor, false).includes(edgeId), "each ordered path remains legal");
    const before = state;
    state = apply(state, actor, { type: "buildPath", edgeId });
    // Use the same production annotation step as practice dispatch and the host bot loop.
    state = logBotAction(before, state, { type: "buildPath", edgeId }, actor, player.name);
    assertConserved(state);
    assert.equal(state.seq, before.seq + 1, "each path is a separate committed action");
    assert.equal(state.edges.find((edge) => edge.id === edgeId).path, actor);
    const changedEdges = state.edges.filter((edge) => edge.path !== before.edges.find((old) => old.id === edge.id)?.path);
    assert.deepEqual(changedEdges.map((edge) => edge.id), [edgeId], "production commit changes exactly the requested edge");
    commits.push({ actor, edgeId, seq: state.seq });
    // Unlike requested edgeId, this witness is read from the committed board delta.
    commits.at(-1).observedEdgeId = changedEdges[0].id;
  }
  return { state, commits };
}

const forward = history([first, second]);
const reverse = history([second, first]);
assert.equal(JSON.stringify(initial), initialBytes, "neither history mutates its baseline");
assert.notEqual(forward.commits[0].edgeId, reverse.commits[0].edgeId, "true first targets differ");
assert.notDeepEqual(forward.commits, reverse.commits, "explicit commit metadata preserves the order");
assert.notEqual(forward.commits[0].observedEdgeId, reverse.commits[0].observedEdgeId, "production first edge deltas distinguish the histories");
assert.equal(forward.state.log.length, 2, "both public action lines are retained");
assert.deepEqual(forward.state.log, reverse.state.log, "complete public logs are identical");
assert.equal(JSON.stringify(forward.state), JSON.stringify(reverse.state), "complete settled states are byte-identical");
assert.equal(forward.state.players.find((p) => p.id === actor).pathsLeft, player.pathsLeft - 2);
assert.equal(forward.state.seq, initial.seq + 2);
// A one-action snapshot is distinguishable: the equality above is not a constant/empty fixture.
const prefix = apply(structuredClone(initial), actor, { type: "buildPath", edgeId: first });
assert.notEqual(JSON.stringify(prefix), JSON.stringify(forward.state));
assert.notDeepEqual(prefix.log, forward.state.log);
assertConserved(prefix);

console.log(`PASS: both legal histories commit two paths; first targets ${first} and ${second} differ.`);
console.log(`PASS: complete final state and public log are byte-identical at seq ${forward.state.seq}.`);
console.log(`Public log: ${JSON.stringify(forward.state.log)}`);
console.log("PASS: explicit commit metadata distinguishes order; a one-action control differs.");
console.log("PASS: production logBotAction preserves equality; committed edge deltas distinguish order; goods conserved after every path.");
console.log("bot-action-order-prove: all checks passed");
