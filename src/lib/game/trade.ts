import { RESOURCES, RESOURCE_LABEL } from "@/lib/game/types";
import type { Bag } from "@/lib/net/table";

// "2 sheep, 1 wheat" in the README's words, or "" for an empty bag.
export function bagText(bag: Bag) {
  return RESOURCES.filter((r) => (bag[r] ?? 0) > 0)
    .map((r) => `${bag[r]} ${RESOURCE_LABEL[r].toLowerCase()}`)
    .join(", ");
}
