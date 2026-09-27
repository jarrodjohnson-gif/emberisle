# L13.1 — What the browser client needs that the repo lacks

- step: 1 Research (issue #73, level #69)
- date: 2026-09-27
- agent: Claude

## What I read

`src/components/game/EmberisleApp.tsx`, `Hud.tsx`, `src/components/scene/IslandCanvas.tsx`,
`src/lib/game/store.ts`, `src/lib/scene/isle-renderer.ts`, `src/lib/utils.ts`, `docs/HANDOFF.md` ("Stack / preview").

Commands:

```
grep -rn "^import" src
grep -rhoE "(bg|text|border|from|via|font)-(bg|fg|surface|raised|border|muted|sea|accent|display)" src | sort | uniq -c
grep -rhoE 'variant="[a-z]*"|size="[a-z]*"' src/components | sort | uniq -c
```

## What is true

The old sandbox was TanStack Start + Vite + React + Tailwind + Zustand + Three.js, on port 8080.
None of its scaffold files were pushed. Missing from the repo:

| Missing | Needed by | Fix in L13.2 |
|---|---|---|
| `package.json`, lockfile | everything | Add a root package with vite, react, react-dom, zustand, three, lucide-react, clsx, tailwind-merge, tailwindcss, and typescript |
| `index.html`, `src/main.tsx` | there is no entry at all (TanStack routes were not pushed) | A plain Vite SPA that mounts `<EmberisleApp />`. TanStack Start is not needed for one screen. |
| `vite.config.ts`, `tsconfig.json` | the `@/` import alias (`@/components/...`, `@/lib/...`) | alias `@` → `src` |
| `src/components/ui/button.tsx` | EmberisleApp.tsx:2, Hud.tsx:15 | shadcn-style `Button` with variants `default`, `secondary`, `sea`, `ghost` and sizes `default`, `sm`, `lg`, `icon` |
| Tailwind theme tokens | `bg-bg`, `bg-surface`, `bg-raised`, `bg-fg`, `text-fg`, `text-muted`, `text-sea`, `border-border`, `border-accent`, `font-display` (EmberisleApp, Hud) | `src/styles.css` with Tailwind v4 `@theme` colors from the build bible (stone `#efeae0`, text `#1c1915`, sea `#2a8f8a`, accent `#c45c3e`) |
| `public/textures/{forest,pasture,fields,hills,mountains,desert}.jpg` | isle-renderer.ts:25-30 | The jpgs are lost with the sandbox. When a load fails, draw a procedural canvas texture per terrain. |
| `public/refs/hex-north-star.jpg` | docs only | Not needed to run. Jarrod still has the stills in chat, so it is noted as `needs:jarrod` to re-upload. |
| `src/lib/multiplayer/*`, `routes/api/rtc.ts` | only HANDOFF mentions them. Nothing in `src/` imports them. | Not needed. L14 uses `server/host.mjs` instead. |

Already fixed in PR #68: `src/lib/game` no longer imports `clsx` (so `mulberry32` lives in `game/random.ts`).

## What I am not sure about

- Whether `Hud.tsx` uses Tailwind v3-only syntax. The Debug step (L13.4) will show it.
- How the textures looked. Procedural ones will be flat noise in the terrain colors, not photos.

## Handoff

```
done: research (#73); code (#75): package.json, vite, tsconfig, main.tsx, styles.css, button.tsx, painted textures;
      implementation (#74): npm run dev on 8080, README "Run it"; debug (#76): scripts/client-prove.mjs passes
broke: 404s for the lost jpgs and favicon -> sub-issue #89, fixed (photos only via import.meta.glob, inline icon)
next agent: L14 (#70), step #77
```
