// Open-table list shown on the title card (#833): one-tap Join for tables the host made public.
import { useGame } from "@/lib/game/store";
import type { OpenTableEntry } from "@/lib/net/table";
import { Button } from "@/components/ui/button";

function statusLabel(status: OpenTableEntry["status"], seated: number, total: number) {
  if (status === "playing") return `${seated}/${total} · in game`;
  if (status === "over") return `${seated}/${total} · game over`;
  return `${seated}/${total} seated`;
}

export function OpenTables() {
  const openTables = useGame((s) => s.openTables);
  const joinTable = useGame((s) => s.joinTable);

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
              <Button
                size="sm"
                variant="primary"
                data-testid="open-table-join"
                onClick={() => joinTable(t.code)}
              >
                Join
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                data-testid="open-table-watch"
                onClick={() => {
                  useGame.getState().watchTable(t.code);
                }}
              >
                Watch
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
