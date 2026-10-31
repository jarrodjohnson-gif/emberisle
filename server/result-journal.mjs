// The terminal outcome journal (#889, docs/design/profiles.md "Exactly-once recording", docs/research/profile-results.md).
// One file per finished tracked game, `<gameId>.json`, holding the frozen outcome the host computed once, at the win.
// It lives apart from the room files, so room cleanup, expiry and deletion never touch it. Result recording (#890) reads
// these and removes each one only after its receipt commits; until then they stay, across shutdown and restart.
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { UUID } from "./profiles.mjs";

export const OUTCOME_V = 1;
const NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/;

// Temp file, sync, rename, then sync the directory: a commit is acknowledged only once it would survive power loss.
// Windows cannot open a directory for fsync from Node (EPERM/EISDIR), so that last step is skipped there; NTFS orders
// the rename's metadata itself. Every other failure is the caller's to see.
export async function writeDurable(dir, name, text) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${name}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const fh = await fs.open(tmp, "wx", 0o600);
  try {
    await fh.writeFile(text);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fs.rename(tmp, path.join(dir, name));
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  if (process.platform === "win32") return;
  const d = await fs.open(dir, "r");
  try {
    await d.sync();
  } finally {
    await d.close();
  }
}

const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isTime = (v) => Number.isSafeInteger(v) && v >= 0;

// A frozen outcome as the host writes it: the game's id, start and end, policy and eligibility from the frozen roster, the
// rules engine's winner, and one row per starting player with its final points.
export function validOutcome(o) {
  if (!plain(o) || o.v !== OUTCOME_V || typeof o.gameId !== "string" || !UUID.test(o.gameId)) return false;
  if (!isTime(o.startedAt) || !isTime(o.endedAt) || o.endedAt < o.startedAt || !Number.isSafeInteger(o.policy) || typeof o.eligible !== "boolean") return false;
  if (!Array.isArray(o.players) || o.players.length < 1 || typeof o.winner !== "string") return false;
  return o.players.every(
    (p) =>
      plain(p) &&
      typeof p.pid === "string" &&
      (p.profileId === null || (typeof p.profileId === "string" && UUID.test(p.profileId))) &&
      typeof p.name === "string" &&
      (p.kind === "human" || p.kind === "bot") &&
      Number.isSafeInteger(p.points) &&
      typeof p.won === "boolean" &&
      typeof p.assisted === "boolean",
  ) && o.players.filter((p) => p.won).length === 1 && o.players.some((p) => p.pid === o.winner && p.won);
}

// Opens the journal at `dir`. Every `<gameId>.json` already there is pending, readable or not: an unreadable one is
// reported and left for repair, and its id still fences that game from resuming. `fault(point)` lets a proof fail or
// kill the host at "journal-before" and "journal-after".
export function openJournal(dir, { fault = () => {} } = {}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const ids = new Set();
  // Files that exist but are not a valid outcome: they fence their game, and a repair from the terminal room overwrites them.
  const corrupt = new Set();
  const outcomes = new Map();
  for (const name of readdirSync(dir)) {
    const m = name.match(NAME);
    if (!m) continue;
    try {
      const o = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
      if (validOutcome(o) && o.gameId === m[1]) {
        ids.add(m[1]);
        outcomes.set(m[1], o);
      } else {
        corrupt.add(m[1]);
        console.error(`results: pending outcome ${name} is not one this host wrote; kept for repair`);
      }
    } catch (e) {
      corrupt.add(m[1]);
      console.error(`results: pending outcome ${name} is unreadable (${e.message}); kept for repair`);
    }
  }
  // One write per game at a time: a retry or a second caller waits for the first and then finds it done.
  const inflight = new Map();
  async function put(outcome) {
    if (!validOutcome(outcome)) throw new Error("bad outcome");
    const id = outcome.gameId;
    if (ids.has(id)) return false;
    if (inflight.has(id)) return inflight.get(id);
    const run = (async () => {
      fault("journal-before");
      await writeDurable(dir, `${id}.json`, JSON.stringify(outcome));
      ids.add(id);
      corrupt.delete(id);
      outcomes.set(id, outcome);
      fault("journal-after");
      return true;
    })();
    inflight.set(id, run);
    try {
      return await run;
    } finally {
      inflight.delete(id);
    }
  }
  return {
    dir,
    // A game id that is pending (or, once #890 lands, was pending): it must never resume from a nonterminal snapshot.
    has: (id) => ids.has(id) || corrupt.has(id),
    // A readable pending outcome is on disk for this game; a corrupt file is not one and is repaired from the room.
    ready: (id) => ids.has(id),
    put,
    // The readable pending outcomes, oldest end first, for result recording to consume.
    pending: () => [...outcomes.values()].sort((a, b) => a.endedAt - b.endedAt || a.gameId.localeCompare(b.gameId)),
    get size() {
      return ids.size + corrupt.size;
    },
  };
}
