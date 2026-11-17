# Browser table visual designs

Refs [#124](https://github.com/jarrodjohnson-gif/emberisle/issues/124).
This index links the existing designs for the browser table. It adds no separate visual specification.

| Area | Design |
|---|---|
| Camera, lighting and board presentation | [Camera and light](camera-light.md) |
| Phone camera fit and touch interaction | [Mobile camera fit and touch-to-place](mobile-camera-touch.md) |
| Coast, beach and ocean structure | [Ocean and coast](ocean.md) |
| Default Crystal sea and Simple fallback | [Crystal water](crystal-water.md) |
| Paths, outposts, strongholds, docks and boats | [Pieces](pieces.md) |
| Wayfarer appearance and motion | [Wayfarer](wayfarer.md) |

Read [mobile-fit.ts](../../src/lib/scene/mobile-fit.ts) for the current `playHole` inset calculations.
Use each linked design for its dimensions, behaviour and proof references.

Epic #124 keeps its original completion test.
Its child issues supply 1280×720 before/after pictures of the lobby, setup and a mid-game turn with a 7.
`npm run client-prove` and `npm run tabs-prove` must remain green with zero console errors.
This index does not close the epic or replace those checks.
