// Open-table list on the title card (#833): one-tap Join for tables the host made public.
// Lives in its own lazy chunk so the first-load index stays inside the growth allowance.
import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";
import { hostUrl, tablesUrl, type OpenTableEntry } from "@/lib/net/table";
import { Button } from "@/components/ui/button";

function statusLabel(status: OpenTableEntry["status"], seated: number, total: number) {
  if (status === "playing") return `${seated}/${total} · in game`;
  if (status === "over") return `${seated}/${total} · game over`;
  if (seated >= total) return `${seated}/${total} full`;
  return `${seated}/${total} seated`;
}

// Resolves tables on a reachable host; null when the dial failed (console already logged the refusal).
function fetchOpenTables(): Promise<OpenTableEntry[] | null> {
  const url = tablesUrl(hostUrl(window.location));
  return fetch(url)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => null);
}

// Poll only when a rules host is expected. Vite without ?host= and the GitHub Pages site have no /tables,
// and a failed fetch logs ERR_CONNECTION_REFUSED / 404 that client-prove treats as a hard fail.
function hostExpected(): boolean {
  if (new URLSearchParams(location.search).has("host")) return true;
  if (import.meta.env.DEV) return false;
  if (location.hostname.endsWith("github.io")) return false;
  return true;
}

export function OpenTables() {
  const [openTables, setOpenTables] = useState<OpenTableEntry[]>([]);
  const joinTable = useGame((s) => s.joinTable);
  const watchTable = useGame((s) => s.watchTable);

  useEffect(() => {
    if (!hostExpected()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      void fetchOpenTables().then((tables) => {
        if (!alive) return;
        if (tables === null) {
          setOpenTables([]);
          return; // stop: a down host would spam ERR_CONNECTION_REFUSED / ERR_UNSAFE_PORT
        }
        setOpenTables(tables);
        timer = setTimeout(refresh, 5000);
      });
    };
    refresh();
    return () => {
      alive = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  if (!openTables.length) return null;

  return (
    <div data-testid="open-tables" className="mt-2 border-t border-border pt-2">
      <p className="mb-1 text-xs font-medium text-muted">Open table</p>
      <ul className="flex flex-col gap-1">
        {openTables.map((t) => {
          const full = t.seated >= t.total;
          return (
            <li
              key={t.code}
              data-testid="open-table-entry"
              className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">{t.name}</p>
                <p className="text-xs leading-tight text-muted">{statusLabel(t.status, t.seated, t.total)}</p>
              </div>
              {t.status === "lobby" ? (
                full ? (
                  <span data-testid="open-table-full" className="shrink-0 px-2 text-xs text-muted">
                    Full
                  </span>
                ) : (
                  <Button size="sm" variant="primary" data-testid="open-table-join" className="h-9 min-w-0 px-3" onClick={() => joinTable(t.code)}>
                    Join
                  </Button>
                )
              ) : (
                <Button size="sm" variant="ghost" data-testid="open-table-watch" className="h-9 min-w-0 px-3" onClick={() => watchTable(t.code)}>
                  Watch
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
