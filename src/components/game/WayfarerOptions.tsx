import type { WayfarerMode } from "@/lib/game/types";

// The title's closed settings body loads separately from the first-load index. The summary stays eager.
export function WayfarerOptions({ rules, choose }: {
  rules: Record<"ai" | "online" | "hotseat", WayfarerMode>;
  choose: (context: "ai" | "online" | "hotseat", mode: WayfarerMode) => void;
}) {
  return <>
    {([["ai", "Play against bots"], ["online", "Host a table online"], ["hotseat", "Pass this device"]] as const).map(([context, label]) => <label key={context} className="title-rule">
      {label}<select aria-label={label} aria-describedby="wayfarer-help" value={rules[context]} onChange={e => choose(context, e.target.value as WayfarerMode)} className="title-rule-select">
        <option value="on">On</option><option value="off">Off</option>
      </select>
    </label>)}
    <p id="wayfarer-help" className="py-2 text-xs text-muted">Off never moves or blocks. Sevens still discard. Off fortunes add to the army.</p>
  </>;
}
