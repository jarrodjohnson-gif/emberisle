// One live table per host player (#944). Each welcome carries a host tag, a one-way digest of the seat secret that never
// sits anyone down. This browser keeps them per host URL, newest first, and sends them back when it opens a table, so
// the host can refuse a second one. A tag goes only to the host that gave it. `add` stores one; the result is the tags
// for `url`. Storage that is blocked or holds anything unexpected reads as no tags.
const KEY = "emberisle-host-tags";
export function hostTags(url: string, add?: unknown): string[] {
  try {
    let all = (JSON.parse(localStorage.getItem(KEY) || "[]") as unknown[]).filter(
      (e): e is [string, string] => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string",
    );
    if (typeof add === "string" && add.length <= 64) {
      const tag: [string, string] = [url, add];
      all = [tag, ...all.filter((e) => e[0] !== url || e[1] !== add)].slice(0, 16);
      localStorage.setItem(KEY, JSON.stringify(all));
    }
    return all.filter((e) => e[0] === url).slice(0, 8).map((e) => e[1]);
  } catch {
    return [];
  }
}
