// #912: the prefilled GitHub new-issue link behind the Table menu's "Report a bug" row. Pure and offline: it only builds a
// URL from the build version, the game seed, seq and the viewport. No names, tokens, table codes or chat go in.
// Online, the host strips the seed on purpose, so a missing seed leaves its line out.
const f = (k: string, v: unknown) => (v == null ? [] : [`${k}: ${String(v).replace(/\s+/g, " ").slice(0, 40)}`]);

export function bugReportUrl(i: { version: string; seed?: number | string; seq: number | string; width: number; height: number }): string {
  const body = [...f("Build", i.version), ...f("Seed", i.seed), ...f("Seq", i.seq), `Viewport: ${i.width}x${i.height}`, "", "## What happened", "", ""].join("\n");
  return `https://github.com/jarrodjohnson-gif/emberisle/issues/new?title=Bug%3A%20&body=${encodeURIComponent(body)}`;
}
