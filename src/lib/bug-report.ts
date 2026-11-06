// #912: the prefilled GitHub new-issue link behind the Table menu's "Report a bug" row. Pure and offline: it only builds a
// URL from the build version, the game seed, seq and the viewport. No names, tokens, table codes or chat go in.
const NEW_ISSUE = "https://github.com/jarrodjohnson-gif/emberisle/issues/new";
const clip = (v: unknown) => String(v).replace(/[\r\n]+/g, " ").slice(0, 40);

export interface BugReportInfo {
  version: string;
  seed: number | string;
  seq: number | string;
  width: number;
  height: number;
}

export function bugReportUrl(i: BugReportInfo): string {
  const body = [
    `Build: ${clip(i.version)}`,
    `Seed: ${clip(i.seed)}`,
    `Seq: ${clip(i.seq)}`,
    `Viewport: ${Math.round(i.width)}x${Math.round(i.height)}`,
    "",
    "## What happened",
    "",
    "",
  ].join("\n");
  return `${NEW_ISSUE}?title=${encodeURIComponent("Bug: ")}&body=${encodeURIComponent(body)}`;
}
