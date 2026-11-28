# The owner: device, publishing and media

How the work flows is in [`DESK.md`](DESK.md). This file keeps what the flow does not cover: Jarrod's device and preferences, publishing, and media handover.

## Jarrod (the owner)

- He's on iPhone 17 Pro Max Safari: test at 440x956 and 956x440.
- He hosts friends' games from his Mac:
  - `cd ~/emberisle && git pull && npm run night` in one Terminal;
  - a cloudflared quick tunnel in another.
  - A restart only needs the night window restarted; the tunnel URL stays the same.
- He wants short, plain words, the fewest possible questions, and no clicks unless unavoidable. Give him your recommendation, not a menu.
- He answers only on decision cards in the project dispatch thread ([`flow/dispatcher.md`](flow/dispatcher.md)). Never ask him in a chat.
- **Who decides what:** [`FRAMEWORK.md`](FRAMEWORK.md) section 7. Bugs and minor UX are the agents'. Major UX and design (features, rules, art style, sound identity) are his.
- Firm preferences so far:
  - the HUD never moves the map;
  - the copyrighted meme clips are fine, his risk;
  - player-facing goods are Wood, Sheep, Brick, Stone, Wheat (#657);
  - the friends' media (icons, sounds, stickers) is curated by him; players never upload;
  - the turn timer has Off / 1 / 2 / 3 min presets (#548).
- **Budget:** Claude usage is limited weekly. Keep subagents to one per PR review, and slow down when he says usage is low.

## Publishing

- **Web:** GitHub Pages publishes main nightly (11:07 UTC) or on demand (Actions → Pages → Run workflow), at https://jarrodjohnson-gif.github.io/emberisle/. Netlify is frozen until its credits reset.
- **Jarrod's Mac:** gets updates with a `git pull` and a restart of `npm run night`. The dispatch thread's nightly post lists what merged.

## Media handover

- Jarrod uploads clips and images in chat. You convert them (ffmpeg; BiRefNet or rembg for sticker backgrounds), name them per `docs/design/sound.md` ("Handing over clips") and the emotes doc, and commit them through a PR.
