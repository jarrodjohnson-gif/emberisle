// #662: the sea-and-wind ambience, public/audio/amb_sea.mp3 (CC0, levelled to -30.6 LUFS in #1014), as one gapless WebAudio
// loop: a decoded buffer loops with no gap at the seam, where an <audio> loop can leave one. A lazy chunk that sound.ts loads on
// the ambience's first start. It plays while sound.ts gives it a level (after the first gesture, Sea sounds on, not muted,
// Music on) and the tab is visible. The file is fetched once, on the first start; a pause suspends the context, so the loop
// resumes where it left off.

// Safari before 14.1 has only the prefixed constructor; with neither, the ambience stays silent and fetches nothing.
const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
let level = 0;
let ctx: AudioContext | undefined;
let gain: GainNode | undefined;
let loading: Promise<void> | undefined;

const wanted = () => level > 0 && document.visibilityState === "visible";

// Every change asks for the state it wants, suspend or resume, and never reads ctx.state to skip the call: some browsers
// report the new state only after suspend() settles, so a quick mute and unmute would read "running" and stay suspended.
function update() {
  if (!Ctx) return;
  if (gain) gain.gain.value = level;
  if (!wanted()) {
    ctx?.suspend().catch(() => {});
    return;
  }
  ctx ??= new Ctx();
  ctx.resume().catch(() => {});
  // A failed download or decode stays quiet and tries again on the next start.
  loading ??= load(ctx).catch(() => { loading = undefined; });
}

async function load(c: AudioContext) {
  const res = await fetch(`${import.meta.env.BASE_URL}audio/amb_sea.mp3`);
  if (!res.ok) throw new Error(`ambience ${res.status}`);
  const buffer = await c.decodeAudioData(await res.arrayBuffer());
  gain = c.createGain();
  gain.gain.value = level;
  gain.connect(c.destination);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  // Starting a source on a suspended context is fine: it plays from here when the context resumes.
  source.start();
}

export function sync(next: number) {
  level = next;
  update();
}

document.addEventListener("visibilitychange", update);
// iOS lets a context start only inside a gesture, and this chunk loads just after the first one, so a later press or key
// resumes a context the browser held back.
for (const type of ["pointerdown", "keydown"]) addEventListener(type, () => { if (wanted()) ctx?.resume().catch(() => {}); }, { capture: true, passive: true });
