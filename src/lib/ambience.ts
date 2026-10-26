export function createBufferedAmbience(url: string) {
  let context: AudioContext | null = null;
  let buffer: AudioBuffer | null = null;
  let loading: Promise<AudioBuffer> | null = null;
  let source: AudioBufferSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let active = false;
  let gain = 0;
  let offset = 0;
  let startedAt = 0;
  let revision = 0;

  function stop() {
    if (!source || !context || !buffer) return;
    offset = (offset + Math.max(0, context.currentTime - startedAt)) % buffer.duration;
    source.stop();
    source.disconnect();
    source = null;
  }

  async function start(version: number) {
    try {
      context ??= new AudioContext();
      if (context.state !== "running") await context.resume();
      if (!active || version !== revision) return;
      if (!buffer) {
        loading ??= fetch(url).then((response) => {
          if (!response.ok) throw new Error("Ambience download failed");
          return response.arrayBuffer();
        }).then((bytes) => context!.decodeAudioData(bytes));
        try { buffer = await loading; } finally { loading = null; }
      }
      if (!active || version !== revision || source) return;
      if (!gainNode) {
        gainNode = context.createGain();
        gainNode.connect(context.destination);
      }
      gainNode.gain.value = gain;
      const next = context.createBufferSource();
      next.buffer = buffer;
      next.loop = true;
      next.connect(gainNode);
      startedAt = context.currentTime;
      try { next.start(0, offset); } catch (error) { next.disconnect(); throw error; }
      source = next;
    } catch {
      // A blocked or unavailable ambience stays quiet and can retry on a later activation.
    }
  }

  return {
    setActive(value: boolean) {
      active = value;
      const version = ++revision;
      if (active) void start(version);
      else stop();
    },
    setGain(value: number) {
      gain = value;
      if (gainNode) gainNode.gain.value = value;
    },
  };
}
