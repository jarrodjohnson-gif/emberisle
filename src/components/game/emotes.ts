// The emote ids and image URLs, from the same folder the host reads (server/chat.mjs loadEmotes). Design: docs/design/chat.md "Reactions".
export const EMOTES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob("../../assets/emotes/*.{png,webp}", { eager: true, query: "?url", import: "default" })).map(
    ([p, url]) => [p.split("/").pop()!.replace(/\.\w+$/, ""), url as string],
  ),
);

// Keep this small set in sync with server/host.mjs talk(); chat-prove sends every entry through the host.
export const QUICK_REACTIONS = [
  { emoji: "😠", label: "angry" },
  { emoji: "😊", label: "happy" },
  { emoji: "👏", label: "clap" },
  { emoji: "😂", label: "laugh" },
  { emoji: "🔥", label: "fire" },
  { emoji: "🐑", label: "sheep" },
] as const;
