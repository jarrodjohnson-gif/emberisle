// #662: the sea-and-wind ambience, public/audio/amb_sea.mp3 (CC0, levelled to -30.6 LUFS in #1014), as one gapless WebAudio
// loop: a decoded buffer loops with no gap at the seam, where an <audio> loop can leave one. A lazy chunk that sound.ts loads on
// the ambience's first start. It plays while sound.ts gives it a level (after the first gesture, Sea sounds on, not muted,
// Music on) and the tab is visible. The file is fetched once, on the first start; a pause suspends the context, so the loop
// resumes where it left off.

let level = 0;
let ctx: AudioContext | undefined;
let gain: GainNode | undefined;
let loading: Promise<void> | undefined;

const wanted = () => level > 0 && document.visibilityState === "visible";

function update() {
  if (gain) gain.gain.value = level;
  if (!wanted()) {
    if (ctx?.state === "running") ctx.suspend().catch(() => {});
    return;
  }
  // A failed download or decode stays quiet and tries again on the next start.
  if (!loading) loading = load().catch(() => { loading = undefined; });
  else if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
}

async function load() {
  const res = await fetch(`${import.meta.env.BASE_URL}audio/amb_sea.mp3`);
  if (!res.ok) throw new Error(`ambience ${res.status}`);
  const bytes = await res.arrayBuffer();
  ctx ??= new AudioContext();
  const buffer = await ctx.decodeAudioData(bytes);
  gain = ctx.createGain();
  gain.connect(ctx.destination);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  // The choice may have changed while the file loaded: this sets the level and suspends the context if it is no longer wanted.
  update();
  source.start();
}

export function sync(next: number) {
  level = next;
  update();
}

document.addEventListener("visibilitychange", update);
