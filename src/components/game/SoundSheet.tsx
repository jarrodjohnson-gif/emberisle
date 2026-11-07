// #669: the Sound panel, option A of docs/design/sound-sheet-1276. TableMenu shows it in its own place: All sound, one volume and
// mute for each kind of sound, the Sea sounds switch (#1163) and the players this device has muted. Every level is a slider in
// 10% steps with a 44 px touch area; letting go of one plays a short clip of its kind so the level can be heard.
// A lazy chunk: it loads when the Table menu opens, long before Sound is pressed.
import { useEffect, useRef, type CSSProperties } from "react";
import { ChevronLeft, Volume2, VolumeX, X } from "lucide-react";
import { SeatDot } from "@/components/game/SeatDot";
import { useGame } from "@/lib/game/store";
import { useMutedSeats } from "@/lib/use-muted-seats";
import { isMusicOn, play, setMusicOn, setMuted, useMuted, useMusicOn, type SoundName } from "@/lib/sound";
import { useSeaSounds, setSeaSounds } from "@/lib/sea-setting";
import { SOUND_CATEGORIES, getSoundMix, setCategoryMuted, setCategoryVolume, setMasterVolume, useSoundMix, type SoundCategory } from "@/lib/sound-settings";

type Id = "master" | SoundCategory;
const ROWS: { id: Id; name: string; sample: SoundName }[] = [
  { id: "master", name: "All sound", sample: "ui_click" },
  { id: "game", name: "Game sounds", sample: "ui_click" },
  { id: "touch", name: "Board touch", sample: "tap_forest" },
  { id: "memes", name: "Soundboard and memes", sample: "board_bong" },
  { id: "music", name: "Music and ambience", sample: "game_start" },
];

const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
const Speaker = ({ off }: { off: boolean }) => (off ? <VolumeX className="size-5" aria-hidden="true" /> : <Volume2 className="size-5" aria-hidden="true" />);

function Row({ id, name, sample, level, off, onLevel, onMute }: { id: Id; name: string; sample: SoundName; level: number; off: boolean; onLevel: (v: number) => void; onMute: () => void }) {
  const pct = Math.round(level * 100);
  // The slider commits as it moves; the sample plays on release (a pointer let go, or an arrow key lifted).
  const sampleOnRelease = () => {
    if (id !== "master") return play(sample, 1, id);
    // All sound's sample rides on the loudest kind that is on, at clip volume 1 (a clip volume above 1 would break the next mix change),
    // so it is heard at All sound x that kind's level: the best a sample can do for All sound without a kind of its own.
    const mix = getSoundMix();
    const kind = SOUND_CATEGORIES.filter((c) => !mix[c].muted && mix[c].volume && (c !== "music" || isMusicOn())).sort((x, y) => mix[y].volume - mix[x].volume)[0];
    if (kind) play(sample, 1, kind);
  };
  return (
    <div className={`ss-row${id === "master" ? " ss-master" : ""}`} data-testid={`sound-row-${id}`}>
      <span className="ss-label">{name}</span>
      <button type="button" className="ss-mute" data-testid={`sound-mute-${id}`} aria-pressed={off} aria-label={`${off ? "Unmute" : "Mute"} ${name}`} onClick={onMute}>
        <Speaker off={off} />
      </button>
      <input
        type="range"
        className="ss-range"
        data-testid={`sound-slider-${id}`}
        min={0}
        max={100}
        step={10}
        value={pct}
        aria-label={`${name} volume`}
        style={{ "--v": `${pct}%` } as CSSProperties}
        data-off={off ? "" : undefined}
        onChange={(e) => onLevel(Number(e.currentTarget.value) / 100)}
        onPointerUp={sampleOnRelease}
        onKeyUp={(e) => { if (ARROWS.has(e.key)) sampleOnRelease(); }}
      />
      <span className="ss-val">{off ? "Off" : `${pct}%`}</span>
    </div>
  );
}

export function SoundSheet({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const mix = useSoundMix();
  const muted = useMuted();
  const music = useMusicOn();
  const sea = useSeaSounds();
  const seats = useGame((s) => s.seats);
  const seatId = useGame((s) => s.seatId);
  const code = useGame((s) => s.code);
  const mode = useGame((s) => s.mode);
  const { muted: mutedSeats, toggle } = useMutedSeats(code);
  const back = useRef<HTMLButtonElement>(null);
  // Focus starts on Back; leaving for the rows puts it on their Sound row (a closing menu has none, and keeps the focus it set).
  useEffect(() => {
    back.current?.focus();
    return () => document.querySelector<HTMLElement>('[data-testid="sound-entry"]')?.focus();
  }, []);
  const targets = mode === "online" ? seats.filter((seat) => seat.id !== seatId && seat.name) : [];

  const row = (r: (typeof ROWS)[number]) => {
    if (r.id === "master") return <Row key={r.id} {...r} level={mix.master} off={muted} onLevel={setMasterVolume} onMute={() => { setMuted(!muted); if (muted) play("ui_click"); }} />;
    const c = mix[r.id];
    // Music is also off when the old Music switch was saved off; pressing mute then brings it back.
    const off = c.muted || (r.id === "music" && !music);
    return (
      <Row
        key={r.id}
        {...r}
        level={c.volume}
        off={off}
        onLevel={(v) => setCategoryVolume(r.id as SoundCategory, v)}
        onMute={() => {
          if (r.id === "music" && !music) setMusicOn(true);
          setCategoryMuted(r.id as SoundCategory, !off);
        }}
      />
    );
  };

  return (
    <>
      <header className="ss-head">
        <button ref={back} type="button" className="ss-icon" data-testid="sound-back" aria-label="Back to Table menu" onClick={() => { play("ui_back"); onBack(); }}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <h2>Sound</h2>
        <button type="button" className="ss-icon" data-testid="sound-close" aria-label="Close" onClick={() => { play("ui_back"); onClose(); }}>
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>
      <div className="ss-body" data-testid="sound-sheet">
        <section className="ss-card ss-mix">{ROWS.slice(0, 4).map(row)}</section>
        <section className="ss-card ss-music">
          {row(ROWS[4]!)}
          <div className="ss-row ss-sub">
            <span className="ss-label">Sea sounds</span>
            <button type="button" role="switch" className="ss-switch" data-testid="sound-sea" aria-checked={sea} aria-label="Sea sounds" onClick={() => setSeaSounds(!sea)}>
              <span />
            </button>
          </div>
        </section>
        {targets.length ? (
          <section className="ss-card ss-players" data-testid="sound-players">
            <h3>Muted players</h3>
            <p className="ss-note">Hides their chat and reactions, on this device only.</p>
            <div className="ss-seats">
              {targets.map((seat) => {
                const isMuted = mutedSeats.has(seat.id);
                return (
                  <div key={seat.id} className="ss-seat">
                    <button type="button" className="ss-mute" data-testid={`sound-seat-${seat.id}`} aria-pressed={isMuted} aria-label={`${isMuted ? "Unmute" : "Mute"} player ${seat.name}`} onClick={() => toggle(seat.id)}>
                      <Speaker off={isMuted} />
                    </button>
                    <SeatDot color={seat.color} className="size-3" />
                    <span className="ss-name">{seat.name}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
