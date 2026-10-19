// Open-table list on the title card (#833): one-tap Join for tables the host made public.
// Lives in its own lazy chunk so the first-load index stays inside the growth allowance.
import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";
import { hostUrl, tablesUrl, type OpenTableEntry } from "@/lib/net/table";
import { Button } from "@/components/ui/button";

function statusLabel(status: OpenTableEntry["status"], seated: number, total: number) {
  if (status === "playing") return `${seated}/${total} · in game`;
  if (status === "over") return `${seated}/${total} · game over`;
  return `${seated}/${total} seated`;
}

function fetchOpenTables(): Promise<OpenTableEntry[]> {
  const url = tablesUrl(hostUrl(window.location));
  return fetch(url)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
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
    const refresh = () => {
      void fetchOpenTables().then((tables) => {
        if (alive) setOpenTables(tables);
      });
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!openTables.length) return null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1 text-xs font-medium text-muted">Open table</p>
      <ul className="flex flex-col gap-1">
        {openTables.map((t) => (
          <li
            key={t.code}
            data-testid="open-table-entry"
            className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{t.name}</p>
              <p className="text-xs text-muted">{statusLabel(t.status, t.seated, t.total)}</p>
            </div>
            {t.status === "lobby" ? (
              <Button size="sm" variant="primary" data-testid="open-table-join" onClick={() => joinTable(t.code)}>
                Join
              </Button>
            ) : (
              <Button size="sm" variant="secondary" data-testid="open-table-watch" onClick={() => watchTable(t.code)}>
                Watch
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
