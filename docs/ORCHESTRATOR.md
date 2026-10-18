# Orchestrator guide

A new Claude chat that Jarrod names as orchestrator starts here. The prompt is
`Continue as Emberisle orchestrator: read docs/ORCHESTRATOR.md.`

There is **one orchestrator** at a time. It talks to Jarrod, files and specs issues, decides minor calls,
reviews and merges. Builders build: Codex (ChatGPT), Grok, Claude chats, and Josh's helper from a fork
(`docs/HELPERS.md`). Rules for everyone: `AGENTS.md`, `docs/FRAMEWORK.md`, `docs/LANES.md`.

## Jarrod (the owner)
- He's on iPhone 17 Pro Max Safari: test at 440x956 and 956x440.
- He hosts friends' games from his Mac:
  - `cd ~/emberisle && git pull && npm run night` in one Terminal;
  - a cloudflared quick tunnel in another.
  - A restart only needs the night window restarted; the tunnel URL stays the same.
- He wants short, plain replies, the fewest possible questions, and no clicks unless unavoidable. Give
  him your recommendation, not a menu.
- **Who decides what:** FRAMEWORK §7. Bugs and minor UX are yours. Major UX and design (features,
  rules, art style, sound identity) are his, asked in one short message.
- Firm preferences so far:
  - the HUD never moves the map;
  - the copyrighted meme clips are fine, his risk;
  - player-facing goods are Wood, Sheep, Brick, Ore, Wheat (#657);
  - the friends' media (icons, sounds, stickers) is curated by him; players never upload;
  - the turn timer has Off / 1 / 2 / 3 min presets (#548).
- **Budget:** Claude usage is limited weekly. Use Sonnet for reviews, Opus only for security or infra
  (workflows, server auth, rate limits). Keep subagents to one per PR review, and stop when he says
  usage is low.

## Reviewing and merging
- Review each PR with a model different from its builder. In budget mode, Sonnet is fine for everything
  except security and infra.
- Check the issue's completion test, its lane, and the framework rules.
- Merge only when the review is clean, all 7 required checks are green (browser-a, browser-b
  ×3, server, build, checks), there's no conflict, and it's not a draft. Squash with the full head SHA.
- After a merge, label the closed issues `status:in-review`. If a PR didn't auto-close its issue, close
  it yourself.
- Review comments on the PR are how builders hear back. Codex and Grok don't watch PRs, so tell Jarrod
  the one-line prompt: `Work on Emberisle: fix every review comment on PR #N.`
- Grok can't open PRs. Look for orphan branches and open the PR for it.
- Fork PRs from a contributor with no merge yet need Jarrod's "Approve and run". Send him the direct
  Actions run link.

## Check-ins
- Every ~30 min while any PR is open (use send_later); a quiet check-in is cheap.
- On each one: list the open PRs and subscribe to new ones. Look for new issues by anyone but Jarrod,
  `Idea:`/`Bug:` issues, and comments starting `Question:`, and answer them (minor) or bring them to
  Jarrod (major).

## Publishing
- **Web:** GitHub Pages publishes main nightly (11:07 UTC) or on demand (Actions → Pages → Run
  workflow), at https://jarrodjohnson-gif.github.io/emberisle/. Netlify is frozen until its credits reset.
- **Jarrod's Mac:** gets updates with a `git pull` and a restart of `npm run night`. Tell him after
  merges worth playing.

## Media handover
- Jarrod uploads clips and images in chat. You convert them (ffmpeg; BiRefNet or rembg for sticker
  backgrounds), name them per `docs/design/sound.md` ("Handing over clips") and the emotes doc, and
  commit them through a PR.

## Live state
Open work lives in the tracker, not here. Search the open PRs, `status:in-progress`, `needs: jarrod` and
`priority:next`.
