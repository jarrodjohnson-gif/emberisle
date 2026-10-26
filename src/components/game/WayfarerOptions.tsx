import type { WayfarerMode } from "@/lib/game/types";

// The title's closed settings body loads separately from the first-load index. The summary stays eager.
export function WayfarerOptions({ rules, choose }: {
  rules: Record<"ai" | "online" | "hotseat", WayfarerMode>;
  choose: (context: "ai" | "online" | "hotseat", mode: WayfarerMode) => void;
}) {
  return <>
    {([["ai", "Practice"], ["online", "Online"], ["hotseat", "Hotseat"]] as const).map(([context, label]) => <label key={context} className="flex min-h-11 items-center justify-between gap-2 text-sm">
      {label}<select aria-label={`${label} wayfarer`} aria-describedby="wayfarer-help" value={rules[context]} onChange={e => choose(context, e.target.value as WayfarerMode)} className="h-11 min-w-32 rounded-control border bg-surface px-2 text-fg">
        <option value="on">On</option><option value="off">Off</option>
      </select>
    </label>)}
    <p id="wayfarer-help" className="py-2 text-xs text-muted">Off never moves or blocks. Sevens still discard. Off fortunes add to the army.</p>
  </>;
}
