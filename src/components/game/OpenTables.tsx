// Open-table list on the title card (#833): one-tap Join for tables the host made public.
// Lives in its own lazy chunk so the first-load index stays inside the growth allowance.
// The list rides the WebSocket `{type:"list"}` → `openTables` path — no HTTP /tables poll.
import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";
import { connectTable, hostUrl, type OpenTableEntry } from "@/lib/net/table";
import { Button } from "@/components/ui/button";

function statusLabel(status: OpenTableEntry["status"], seated: number, total: number) {
  if (status === "playing") return `${seated}/${total} · in game`;
  if (status === "over") return `${seated}/${total} · game over`;
  if (seated >= total) return `${seated}/${total} full`;
  return `${seated}/${total} seated`;
}

// Dial only when a rules host is expected. Vite without ?host= and the GitHub Pages build have no host,
// and a failed WebSocket would log console errors that pages-prove / client-prove treat as a hard fail.
function hostExpected(): boolean {
  if (new URLSearchParams(location.search).has("host")) return true;
  if (import.meta.env.DEV) return false;
  // Non-root base builds are static — including local Pages previews after a repository rename.
  if (import.meta.env.BASE_URL !== "/") return false;
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
    const client = connectTable(hostUrl(window.location), {
      openTables: (tables) => {
        if (alive) setOpenTables(tables);
      },
      closed: () => {
        // Seatless dial failed or dropped: clear the list and stop. No redial without a seat.
        if (!alive) return;
        setOpenTables([]);
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      },
    });
    const refresh = () => {
      if (!alive) return;
      client.list();
      timer = setTimeout(refresh, 5000);
    };
    refresh();
    return () => {
      alive = false;
      if (timer !== undefined) clearTimeout(timer);
      client.close();
    };
  }, []);

  if (!openTables.length) return null;

  return (
    <div data-testid="open-tables" className="mt-2 border-t border-border pt-2">
      <p className="mb-1 text-xs font-medium text-muted">Open tables</p>
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
                  <Button size="sm" variant="secondary" aria-label={`Join ${t.name}`} data-testid="open-table-join" className="h-11 min-w-0 px-3" onClick={() => joinTable(t.code)}>
                    Join
                  </Button>
                )
              ) : (
                <Button size="sm" variant="ghost" aria-label={`Watch ${t.name}`} data-testid="open-table-watch" className="h-11 min-w-0 px-3" onClick={() => watchTable(t.code)}>
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
