// Builds the hand from the real symbols (src/components/game/ResourceSymbols.tsx) plus a new two-tone sheep.
// State comes from the URL: ?state=rest|gain|loss|zoom-rest|zoom-gain  (&hold=ms freezes the animation at that time)
const FRAME = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
const SYMBOLS = {
  timber: `<svg ${FRAME}><path d="m9 2-4 6h2l-4 6h3l-3 5h12l-3-5h3l-4-6h2L9 2Z" fill="currentColor" stroke="none"/><path d="M9 18v4m9-17-3 5h2l-3 5h8l-3-5h2l-3-5Z"/><path d="M18 15v5"/></svg>`,
  clay: `<svg ${FRAME}><rect x="7" y="3" width="10" height="6" rx=".7" fill="currentColor" stroke="none"/><rect x="1" y="11" width="10" height="7" rx=".7" fill="currentColor" stroke="none"/><rect x="13" y="11" width="10" height="7" rx=".7" fill="currentColor" stroke="none"/></svg>`,
  // Option C's sheep, redrawn: a fleece cloud in the card's paper, a solid head with an ear, two legs and a pin of an eye.
  wool: `<svg ${FRAME}>
    <path d="M8.6 17.6v3.6M14.4 17.6v3.6" stroke-width="2"/>
    <path d="M6 17.6C3.1 17.6 2.3 13.9 4.5 12.7 3.4 10.4 5.9 8.2 8 9.3 8.6 6.5 12.5 6.2 13.5 8.6 15.9 7.4 18.8 9.5 17.9 12 20.3 13.2 19.6 16.9 16.9 17.6Z" fill="var(--fleece)" stroke-width="1.6"/>
    <ellipse cx="18.9" cy="12.4" rx="3.3" ry="2.35" transform="rotate(-12 18.9 12.4)" fill="currentColor" stroke="none"/>
    <path d="M16.1 10.8c-.4-1.3.3-2.2 1.6-2.2.4 1 0 2-1.6 2.2Z" fill="currentColor" stroke="none"/>
    <circle cx="20.1" cy="11.8" r=".65" fill="var(--fleece)" stroke="none"/>
  </svg>`,
  grain: `<svg ${FRAME}><path d="M7 22 17 2"/><path d="M13 7c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Z" fill="currentColor" stroke="none"/></svg>`,
  ore: `<svg ${FRAME}><path d="m2 20 7-14 7 14H2Zm11 0-3-6 5-12 8 18H13Z" fill="currentColor" stroke="none"/></svg>`,
};
const NAMES = { timber: "Wood", clay: "Brick", wool: "Sheep", grain: "Wheat", ore: "Stone" };
const ORDER = ["timber", "clay", "wool", "grain", "ore"];

const q = new URLSearchParams(location.search);
const state = q.get("state") || "rest";
const hold = q.get("hold");
const zoom = state.startsWith("zoom");
// Rest hand matches the Gemini #888 crop (3,0,2,1,0) so the comparison sheet reads like for like.
const rest = { timber: 3, clay: 0, wool: 2, grain: 1, ore: 0 };
const counts = { ...rest };
const deltas = {};
if (state === "gain" || state === "loss" || state === "zoom-gain") { counts.timber = 5; deltas.timber = 2; }
if (state === "zoom-sheep") { counts.wool = 3; deltas.wool = 1; }
if (state === "loss") { counts.wool = 1; deltas.wool = -1; }

document.body.classList.toggle("zoom", zoom);
const tray = document.querySelector(".tray");
for (const r of zoom ? [state === "zoom-sheep" ? "wool" : "timber"] : ORDER) {
  const delta = deltas[r];
  const slot = document.createElement("div");
  slot.className = `slot ${r} ${delta > 0 ? "gain" : delta < 0 ? "loss" : ""}`;
  slot.innerHTML = `
    <div class="card ${r} ${counts[r] === 0 ? "empty" : ""} ${delta > 0 ? "gain" : delta < 0 ? "loss" : ""}" data-r="${r}">
      <span class="sym" aria-hidden="true">${SYMBOLS[r]}</span>
      <span class="count">${counts[r]}</span>
      <span class="name">${NAMES[r]}</span>
      ${delta ? `<span class="tab ${delta > 0 ? "up" : "down"}">${delta > 0 ? "+" + delta : "−" + -delta}</span>` : ""}
    </div>`;
  tray.appendChild(slot);
}
