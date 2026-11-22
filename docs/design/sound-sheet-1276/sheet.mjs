// #1276: markup for each Sound sheet option. capture.mjs adds it to the running game; sheet.css lays it out per size.
// Controls and wording follow #669. The levels are example values, chosen to show every state (on, muted, off).

const svg = paths => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
// lucide-react 1.48 icon paths, the set the game already uses.
const SPEAKER = '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>';
const ICON = {
  on: svg(`${SPEAKER}<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>`),
  off: svg(`${SPEAKER}<path d="m16.5 14.5 5-5"/><path d="m16.5 9.5 5 5"/>`),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
};

const MIX = [
  { id: "master", name: "All sound", hint: "Turns every sound below up or down", v: 80 },
  { id: "game", name: "Game sounds", hint: "Dice, builds, your turn, the timer", v: 100 },
  { id: "touch", name: "Board touch", hint: "Tapping hexes and pieces", v: 60, muted: true },
  { id: "memes", name: "Soundboard and memes", hint: "Clips players send, robbed, GG", v: 40 },
  { id: "music", name: "Music and ambience", hint: "Start and end music, the sea", v: 70 },
];
const SEA = { name: "Sea sounds", on: true };
const MUTED_SEAT = "Bot";

export const OPTIONS = [
  { id: "a", name: "A. Panel in the menu's spot", tldr: "Sound opens where the Table menu was, with every slider showing at once." },
  { id: "b", name: "B. Big sheet with hints", tldr: "A bigger sheet covers the table, and each slider says what it covers." },
  { id: "c", name: "C. Switches first", tldr: "Each kind of sound is one on/off switch; tap its row to show the slider." },
];

const mute = (m, cls = "ss-mute") => `<button type="button" class="${cls}" aria-pressed="${!!m.muted}" aria-label="${m.muted ? "Unmute" : "Mute"} ${m.name}">${m.muted ? ICON.off : ICON.on}</button>`;
const range = m => `<input type="range" class="ss-range" min="0" max="100" step="10" value="${m.v}" aria-label="${m.name} volume" style="--v:${m.v}%"${m.muted ? " data-off" : ""}>`;
const value = m => `<span class="ss-val">${m.muted ? "Off" : `${m.v}%`}</span>`;
const toggle = (name, on) => `<button type="button" role="switch" class="ss-switch" aria-checked="${on}" aria-label="${name}"><span></span></button>`;
const head = (back = true) => `<header class="ss-head">${back ? `<button type="button" class="ss-icon" aria-label="Back to Table menu">${ICON.back}</button>` : ""}<h2>Sound</h2><button type="button" class="ss-icon ss-close" aria-label="Close">${ICON.close}</button></header>`;
const dot = s => `<span class="ss-dot" style="background:${s.color}"></span>`;
const seatMuted = s => s.name === MUTED_SEAT;

// A: the Table menu's spot. Label above, then mute, slider and level on one line (one line throughout when wide).
function optionA({ seats }) {
  const row = m => `<div class="ss-row${m.id === "master" ? " ss-master" : ""}"><span class="ss-label">${m.name}</span>${mute(m)}${range(m)}${value(m)}</div>`;
  const players = seats.map(s => `<div class="ss-seat">${mute({ name: s.name, muted: seatMuted(s) })}${dot(s)}<span class="ss-name">${s.name}</span></div>`).join("");
  return `${head()}<div class="ss-body" data-scroll>
    <section class="ss-card ss-mix">${MIX.slice(0, 4).map(row).join("")}</section>
    <section class="ss-card ss-music">${row(MIX[4])}<div class="ss-row ss-sub"><span class="ss-label">${SEA.name}</span>${toggle(SEA.name, SEA.on)}</div></section>
    <section class="ss-card ss-players"><h3>Muted players</h3><p class="ss-note">Hides their chat and reactions, on this device only.</p><div class="ss-seats">${players}</div></section>
  </div>`;
}

// B: a bottom sheet on a phone held upright, a side panel otherwise. Every slider names what it covers.
function optionB({ seats }) {
  const row = m => `<div class="ss-row${m.id === "master" ? " ss-strong" : ""}"><span class="ss-label">${m.name}<small>${m.hint}</small></span>${mute(m)}${range(m)}${value(m)}</div>`;
  const chips = seats.map(s => `<button type="button" class="ss-chip" aria-pressed="${seatMuted(s)}">${dot(s)}${s.name}${seatMuted(s) ? `<span class="ss-chip-state">${ICON.off}Muted</span>` : ""}</button>`).join("");
  return `<div class="ss-grab" aria-hidden="true"></div>${head(false)}<div class="ss-body" data-scroll>
    <section class="ss-card ss-all">${row(MIX[0])}</section>
    <section class="ss-card ss-kinds">${MIX.slice(1, 4).map(row).join("")}</section>
    <section class="ss-card ss-music">${row(MIX[4])}<div class="ss-row ss-sub"><span class="ss-label">${SEA.name}<small>Waves under the music, on by default</small></span>${toggle(SEA.name, SEA.on)}</div></section>
    <section class="ss-card ss-players"><h3>Muted players</h3><p class="ss-note">Tap a name to hide their chat and reactions, on this device only.</p><div class="ss-chips">${chips}</div></section>
  </div>`;
}

// C: one switch per kind of sound. All sound keeps its slider; a row opens its own slider (Soundboard is open here).
function optionC({ seats }) {
  const OPEN = "memes";
  const sw = m => {
    const open = m.id === OPEN;
    return `<div class="ss-line${open ? " ss-open" : ""}"><button type="button" class="ss-expand" aria-expanded="${open}"><span class="ss-label">${m.name}</span><span class="ss-val">${m.muted ? "Off" : `${m.v}%`}</span>${open ? ICON.down : ICON.next}</button>${toggle(m.name, !m.muted)}</div>${open ? `<div class="ss-line ss-slide">${range(m)}</div>` : ""}`;
  };
  const master = MIX[0];
  const muted = seats.filter(seatMuted).length;
  return `${head()}<div class="ss-body" data-scroll>
    <section class="ss-card ss-all"><div class="ss-line"><span class="ss-label ss-strong">${master.name}</span><span class="ss-val">${master.v}%</span>${toggle(master.name, true)}</div><div class="ss-line ss-slide">${range(master)}</div></section>
    <section class="ss-card ss-kinds">${MIX.slice(1, 4).map(sw).join("")}</section>
    <section class="ss-card ss-kinds ss-music">${sw(MIX[4])}<div class="ss-line ss-sub"><span class="ss-label">${SEA.name}</span>${toggle(SEA.name, SEA.on)}</div></section>
    <section class="ss-card ss-players"><button type="button" class="ss-line ss-expand"><span class="ss-label">Muted players</span><span class="ss-val">${muted} of ${seats.length}</span>${ICON.next}</button></section>
  </div>`;
}

const BUILD = { a: optionA, b: optionB, c: optionC };

export function sheet(id, ctx) {
  return `<div data-mock-sheet class="ss ss-${id}" role="dialog" aria-label="Sound">${BUILD[id](ctx)}</div>`;
}

// The Table menu row that replaces "Table sounds on" and "Music on". Same classes as the menu's other rows.
export const entryRow = () =>
  `<button type="button" data-testid="sound-entry" class="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-control font-medium bg-transparent text-fg hover:bg-fg/5 h-11 w-full justify-start px-3 text-body">${ICON.on.replace('width="20" height="20"', 'width="16" height="16" class="text-muted"')} Sound<span class="ml-auto flex items-center gap-1 text-caption text-muted">80%${ICON.next.replace('width="20" height="20"', 'width="16" height="16"')}</span></button>`;
