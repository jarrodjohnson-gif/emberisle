// #767: the Profile sheet's Wins and History views, in their own chunk, loaded when a signed-in player opens one of them
// (docs/design/profiles.md, "Profile and Wins surfaces"). Every number comes from the host's committed results: nothing is
// counted here. Loading and a refused or offline host each say so; neither shows a zero. History is the owner's own only.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import type { HistoryRow, ProfileRecord, WinsRow, createProfileClient } from "@/lib/net/profiles";

type Client = ReturnType<typeof createProfileClient>;
type Status = "loading" | "failed" | "ready";

// A ProfileClientError carries a code. Checked by shape, as in ProfileForms, so the client class stays out of this chunk.
const failure = (e: unknown) => (typeof (e as { code?: unknown })?.code === "string" ? (e as Error).message : "Profiles unavailable on this host.");
// A reply this view can't read is treated like a refusal: it is never shown as a number.
const count = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
const rate = (r: unknown) => r === null || (typeof r === "number" && r >= 0 && r <= 100);
const totals = (r: Record<string, unknown>) => [r.games, r.wins, r.losses, r.streak].every(count) && r.games === (r.wins as number) + (r.losses as number) && rate(r.winRate);
function check<T>(ok: boolean, value: unknown) {
  if (!ok) throw new Error("bad reply");
  return value as T;
}
// The profile client carries one request at a time, so each read here waits for the one before it, even one a closed view
// started.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>) {
  const run = queue.then(job);
  queue = run.catch(() => undefined);
  return run;
}
async function fetchRecord(c: Client) {
  const r = (await serial(() => c.query("profileRecord"))).record as Record<string, unknown>;
  return check<ProfileRecord>(Boolean(r) && totals(r) && (r.lastPlayed === null || count(r.lastPlayed)), r);
}
async function fetchPage(c: Client, kind: "wins" | "history", next: number | string | null) {
  const reply = await serial(() => (kind === "wins" ? c.query("profileWins", next === null ? {} : { after: next }) : c.query("profileHistory", next === null ? {} : { before: next })));
  const rows = reply.rows as Record<string, unknown>[];
  const row = (r: Record<string, unknown>) =>
    kind === "wins"
      ? count(r.rank) && typeof r.displayName === "string" && totals(r) && typeof r.you === "boolean"
      : typeof r.gameId === "string" && count(r.endedAt) && count(r.durationMs) && typeof r.won === "boolean" && Number.isSafeInteger(r.points) && Array.isArray(r.players);
  const more = reply.next === null || (kind === "wins" ? count(reply.next) : typeof reply.next === "string");
  return check<{ rows: (WinsRow | HistoryRow)[]; next: number | string | null }>(Array.isArray(rows) && rows.every((r) => r && typeof r === "object" && row(r)) && more, reply);
}
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
// One decimal and a percent sign, beside the games it comes from; none before the first counted game.
const rateText = (r: number | null) => (r === null ? "No rate yet" : `${r.toFixed(1)}%`);

export function ProfileRecords({ c, kind, back }: { c: Client; kind: "wins" | "history"; back: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  // Every load takes a number; a reply for an older load, or one that lands after the view closed, is dropped.
  const seq = useRef(0);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [record, setRecord] = useState<ProfileRecord | null>(null);
  const [rows, setRows] = useState<(WinsRow | HistoryRow)[]>([]);
  const [next, setNext] = useState<number | string | null>(null);
  const [more, setMore] = useState(false);

  const load = async () => {
    const mine = ++seq.current;
    setStatus("loading");
    setMore(false);
    try {
      const own = kind === "wins" ? await fetchRecord(c) : null;
      if (mine !== seq.current) return;
      const page = await fetchPage(c, kind, null);
      if (mine !== seq.current) return;
      setRecord(own);
      setRows(page.rows);
      setNext(page.next);
      setStatus("ready");
    } catch (e) {
      if (mine !== seq.current) return;
      setError(failure(e));
      setStatus("failed");
    }
  };
  const loadMore = async () => {
    const mine = seq.current;
    setMore(true);
    setError("");
    try {
      const page = await fetchPage(c, kind, next);
      if (mine !== seq.current) return;
      setRows((r) => [...r, ...page.rows]);
      setNext(page.next);
    } catch (e) {
      if (mine === seq.current) setError(failure(e));
    } finally {
      if (mine === seq.current) setMore(false);
    }
  };

  // Opening a view puts the focus on its title; closing it hands the focus back to the summary button that opened it.
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("h3")?.focus();
    void load();
    return () => {
      seq.current++;
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-opens="${kind}"]`)?.focus());
    };
  }, [kind]);

  const empty = <p data-testid="records-empty" className="text-sm text-fg">No finished games yet.</p>;
  let body;
  if (status === "loading") {
    body = <p role="status" className="text-sm text-fg">Loading records…</p>;
  } else if (status === "failed") {
    body = (
      <>
        <p role="alert" className="text-sm text-accent-ink">{error}</p>
        <Button variant="secondary" className="w-full" onClick={() => void load()}>Try again</Button>
      </>
    );
  } else {
    const own = record && (record.games ? (
      <dl data-testid="profile-record" className="grid grid-cols-3 gap-2 text-center">
        {([["Games", record.games], ["Wins", record.wins], ["Losses", record.losses], ["Win rate", rateText(record.winRate)], ["Streak", record.streak], ["Last played", record.lastPlayed === null ? "—" : day(record.lastPlayed)]] as const).map(([k, v]) => (
          <div key={k} className="rounded-[12px] border border-border px-1 py-2">
            <dt className="text-xs text-muted">{k}</dt>
            <dd data-stat={k} className="text-base font-medium tabular-nums text-fg">{v}</dd>
          </div>
        ))}
      </dl>
    ) : empty);
    const list = kind === "wins" ? (
      <ol aria-label="Wins board" className="divide-y divide-border">
        {(rows as WinsRow[]).map((r, i) => (
          <li key={i} data-testid="wins-row" data-rank={r.rank} data-you={r.you || undefined} className="flex min-h-11 items-center gap-3 py-2">
            <span className="w-7 shrink-0 text-right font-medium tabular-nums text-fg">{r.rank}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base text-fg">{r.displayName}{r.you ? <span className="text-muted"> (you)</span> : null}</span>
              <span className="block text-xs text-muted">{plural(r.games, "game")} · {r.losses} lost · {rateText(r.winRate)}{r.streak ? ` · streak ${r.streak}` : ""}</span>
            </span>
            <span data-testid="wins-count" className="shrink-0 text-base font-medium tabular-nums text-fg">{plural(r.wins, "win")}</span>
          </li>
        ))}
      </ol>
    ) : rows.length ? (
      <ol aria-label="Your games" className="divide-y divide-border">
        {(rows as HistoryRow[]).map((g) => (
          <li key={g.gameId} data-testid="history-row" className="py-2">
            <p className="text-base text-fg">
              <strong>{g.won ? "Won" : "Lost"}</strong> · {plural(g.points, "point")} · {day(g.endedAt)} · {Math.max(1, Math.round(g.durationMs / 60000))} min
            </p>
            {g.assisted ? <p className="text-xs text-muted">A bot played your seat for part of this game.</p> : null}
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg">
              {g.players.map((p, i) => (
                <li key={i} className="flex items-center gap-1">
                  <SeatDot color={p.color} className="size-3" />
                  {p.name} {p.points}{p.won ? " (winner)" : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    ) : empty;
    body = (
      <>
        {own}
        {list}
        {next !== null ? (
          <Button variant="secondary" className="w-full" disabled={more} onClick={() => void loadMore()}>
            {more ? "Loading…" : "Show more"}
          </Button>
        ) : null}
        {error ? <p role="alert" className="text-sm text-accent-ink">{error}</p> : null}
      </>
    );
  }

  return (
    <div ref={root} data-testid="profile-records" className="space-y-3" aria-busy={status === "loading" || more}>
      <h3 tabIndex={-1} className="font-display text-xl text-fg outline-none">{kind === "wins" ? "Wins" : "Your games"}</h3>
      {body}
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-surface px-5 pb-5 pt-3">
        <Button variant="secondary" className="w-full" onClick={back} back>
          Back
        </Button>
      </div>
    </div>
  );
}
