// Open-table list on the title card (#833): one-tap Join for tables the host made public.
// Lives in its own lazy chunk so the first-load index stays inside the growth allowance.
// The list rides the WebSocket `{type:"list"}` → `openTables` path — no HTTP /tables poll.
import { useEffect, useState } from "react";
import { createLucideIcon } from "lucide-react";
import { useGame } from "@/lib/game/store";
import { connectTable, hostUrl, type OpenTableEntry } from "@/lib/net/table";
import { Button } from "@/components/ui/button";

// Same globe and lock marks, with short keys so the list warning stays quiet and the chunk stays under its ceiling.
const Globe = createLucideIcon("g", [["circle", { cx: "12", cy: "12", r: "10", key: "a" }], ["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", key: "b" }], ["path", { d: "M2 12h20", key: "c" }]]);
const Lock = createLucideIcon("l", [["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "a" }], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4", key: "b" }]]);


export function OpenTables() {
  const [openTables, setOpenTables] = useState<OpenTableEntry[]>([]);
  const joinTable = useGame((s) => s.joinTable);
  const watchTable = useGame((s) => s.watchTable);

  useEffect(() => {
    // Only the rules host marks its served HTML. Static root builds also support offline play.
    if (!new URLSearchParams(location.search).has("host") && !document.querySelector('meta[name="emberisle-host"]')) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let client: ReturnType<typeof connectTable>;
    let attempt = 0;
    const refresh = () => {
      if (!alive) return;
      client.list();
      timer = setTimeout(refresh, 5000);
    };
    const dial = () => {
      if (!alive) return;
      client = connectTable(hostUrl(location), {
        openTables: (tables) => {
          if (!alive) return;
          attempt = 0;
          setOpenTables(tables);
        },
        closed: () => {
          if (!alive) return;
          setOpenTables([]);
          clearTimeout(timer);
          // Discovery has no seat to rejoin. Redial only this seatless list client,
          // using the network client's 1/2/4/8/15-second backoff convention.
          timer = setTimeout(dial, Math.min(1000 * 2 ** Math.min(attempt++, 4), 15000));
        },
      });
      refresh();
    };
    dial();
    return () => {
      alive = false;
      clearTimeout(timer);
      client.close();
    };
  }, []);

  // #1151: nothing scrolls on a phone. A page of 3 tables, 1 on a sideways phone; More shows the next page, then the first.
  const [from, setFrom] = useState(0);
  const per = innerHeight < 500 ? 1 : 3;
  const at = from < openTables.length ? from : 0;
  if (!openTables.length) return null;

  return (
    <div data-testid="open-tables" className="mt-2 border-t border-border pt-2">
      <p className="mb-1 text-xs font-medium text-muted">Open tables</p>
      <ul className="flex flex-col gap-1">
        {openTables.slice(at, at + per).map((t) => {
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
      {openTables.length > per && (
        <Button size="sm" variant="ghost" className="h-11 min-w-0 px-3" onClick={() => setFrom(at + per)}>
          More
        </Button>
      )}
    </div>
  );
}

// The optional toggle never replaces the eager Host button under an in-flight press.
export function OpenModeToggle({ openMode, setOpenMode }: {
  openMode: boolean;
  setOpenMode: (toggle: (old: boolean) => boolean) => void;
}) {
  return (
    <Button
      variant="ghost"
      className="absolute right-0 top-0 w-11 rounded-none border-l border-control-line px-0"
      aria-pressed={openMode}
      title={openMode ? "Anyone can join" : "Code needed"}
      aria-label="Open table"
      data-testid="open-mode-toggle"
      onClick={() => setOpenMode((m) => !m)}
    >
      {openMode ? <Globe size={16} aria-hidden /> : <Lock size={16} aria-hidden />}
    </Button>
  );
}
