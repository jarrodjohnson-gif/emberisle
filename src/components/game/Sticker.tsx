// #1363: a sticker as the tray, the seat bubble and the chat log draw it, in a chunk of its own (loaded by talk.tsx Emote).
// An animated sticker (APNG, or WebP with ANMF frames) plays while it is on screen. With reduced motion it shows its first
// frame only, and in the tray (`once`) it stops after one loop, resting on its first frame.
import { useEffect, useState } from "react";
import { EMOTES } from "@/components/game/emotes";
import { cn } from "@/lib/utils";

// One loop in ms from the file's frame durations (APNG fcTL, WebP ANMF), or 0 for a single frame. Browsers play a frame of
// 10 ms or less as 100 ms, and so does this. scripts/stickers-prove.mjs reads the same chunks to enforce the loop limit.
export function loopMs(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (at: number) => String.fromCharCode(...b.subarray(at, at + 4));
  let frames = 0;
  let ms = 0;
  const add = (d: number) => {
    frames++;
    ms += d <= 10 ? 100 : d;
  };
  if (tag(0) === "RIFF")
    for (let at = 12; at + 8 <= b.length; at += 8 + ((v.getUint32(at + 4, true) + 1) & ~1)) {
      if (tag(at) === "ANMF") add(v.getUint16(at + 20, true) + (b[at + 22] << 16));
    }
  else
    for (let at = 8; at + 12 <= b.length; at += 12 + v.getUint32(at)) {
      if (tag(at + 4) === "fcTL") add(Math.round((v.getUint16(at + 28) * 1000) / (v.getUint16(at + 30) || 100)));
    }
  return frames > 1 ? ms : 0;
}

// Once per sticker: its loop and its first frame as a still picture. A file that cannot be read counts as static.
type Motion = { loop: number; still: string } | null;
const motions = new Map<string, Promise<Motion>>();
function motion(url: string) {
  let found = motions.get(url);
  if (!found)
    motions.set(
      url,
      (found = fetch(url)
        .then((r) => r.blob())
        .then(async (blob): Promise<Motion> => {
          const loop = loopMs(new Uint8Array(await blob.arrayBuffer()));
          if (!loop) return null;
          // createImageBitmap decodes an animated image's first frame.
          const frame = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = frame.width;
          canvas.height = frame.height;
          canvas.getContext("2d")!.drawImage(frame, 0, 0);
          frame.close();
          return { loop, still: canvas.toDataURL() };
        })
        .catch(() => null)),
    );
  return found;
}

const CALM = "(prefers-reduced-motion: reduce)";

export function Sticker({ id, once, className }: { id: string; once?: boolean; className?: string }) {
  const url = EMOTES[id];
  const [calm, setCalm] = useState(() => matchMedia(CALM).matches);
  // undefined while the file is read, null for a static sticker.
  const [found, setFound] = useState<Motion>();
  const [rested, setRested] = useState(false);
  useEffect(() => {
    const query = matchMedia(CALM);
    const change = () => setCalm(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let live = true;
    if (url) void motion(url).then((m) => live && setFound(m));
    return () => {
      live = false;
    };
  }, [url]);
  useEffect(() => {
    if (!once || !found || calm || rested) return;
    const timer = setTimeout(() => setRested(true), found.loop);
    return () => clearTimeout(timer);
  }, [once, found, calm, rested]);
  if (!url) return null;
  const still = found && (calm || rested);
  // With reduced motion, nothing is drawn until the file is read, so an animated sticker never plays a frame.
  const src = still ? found.still : calm && found === undefined ? undefined : url;
  return <img src={src} alt={id} data-still={still ? "" : undefined} className={cn("object-contain", className)} />;
}
