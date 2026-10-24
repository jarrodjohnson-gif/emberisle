// Open-table list on the title card (#833): one-tap Join for tables the host made public.
// Lives in its own lazy chunk so the first-load index stays inside the growth allowance.
// The list rides the WebSocket `{type:"list"}` → `openTables` path — no HTTP /tables poll.
import { useEffect, useState } from "react";
import { Globe, Lock } from "lucide-react";
import { useGame } from "@/lib/game/store";
import { connectTable, hostUrl, type OpenTableEntry } from "@/lib/net/table";
import { Button } from "@/components/ui/button";

// Only the rules host marks its served HTML. Static root builds also support offline play.
function hostExpected(): boolean {
  return new URLSearchParams(location.search).has("host") || !!document.querySelector('meta[name="emberisle-host"]');
}

export function OpenTables() {
  const [openTables, setOpenTables] = useState<OpenTableEntry[]>([]);
  const joinTable = useGame((s) => s.joinTable);
  const watchTable = useGame((s) => s.watchTable);

  useEffect(() => {
    if (!hostExpected()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const client = connectTable(hostUrl(location), {
      openTables: (tables) => {
        if (alive) setOpenTables(tables);
      },
      closed: () => {
        // Seatless dial failed or dropped: clear the list and stop. No redial without a seat.
        if (!alive) return;
        setOpenTables([]);
        clearTimeout(timer);
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
      clearTimeout(timer);
      client.close();
    };
  }, []);

  if (!openTables.length) return null;

  return (
    <div data-testid="open-tables" className="mt-2 border-t border-border pt-2">
      <p className="mb-1 text-xs font-medium text-muted">Open tables</p>
      <ul className="flex flex-col gap-1">
        {openTables.map((t) => {
          return (
            <li
              key={t.code}
              data-testid="open-table-entry"
              className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">{t.name}</p>
                <p className="text-xs leading-tight text-muted">{`${t.seated}/${t.total}${t.status === "playing" ? " · in game" : t.status === "over" ? " · game over" : t.seated >= t.total ? " full" : " seated"}`}</p>
              </div>
              {t.status === "lobby" ? (
                t.seated >= t.total ? (
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

// The optional toggle never replaces the eager Host button under an in-flight press.
export function OpenModeToggle({ openMode, setOpenMode }: {
  openMode: boolean;
  setOpenMode: (toggle: (old: boolean) => boolean) => void;
}) {
  const VisibilityIcon = openMode ? Globe : Lock;
  return (
    <Button
      variant="ghost"
      className="absolute right-0 top-0 w-11 rounded-none border-l border-control-line px-0"
      aria-pressed={openMode}
      title={openMode ? "Anyone can join" : "Code needed"}
      aria-label={openMode ? "Open to anyone" : "Private, code needed"}
      data-testid="open-mode-toggle"
      onClick={() => setOpenMode((m) => !m)}
    >
      <VisibilityIcon size={16} aria-hidden />
    </Button>
  );
}
