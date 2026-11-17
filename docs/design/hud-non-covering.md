# HUD framing and layering references

Refs [#129](https://github.com/jarrodjohnson-gif/emberisle/issues/129).
This guide points to existing designs and implementation. It does not define another HUD layout or z-index hierarchy.

| Topic | Reference |
|---|---|
| Board-hole measurement, camera refits and glides | [Camera and light](camera-light.md) |
| Phone HUD and turn indication | [Mobile HUD](mobile-hud.md) |
| Expanded seats and phone-strip constraints | [Six players](six-players.md) |
| Other browser-table visual designs | [Browser table index](browser-table-visuals.md) |
| Later owner decisions that supersede earlier design text | [Decisions](../DECISIONS.md) |

Use the current implementation for inset formulas and layer classes:

- [mobile-fit.ts](../../src/lib/scene/mobile-fit.ts) computes `playHole` and viewport-dependent rails.
- [Hud.tsx](../../src/components/game/Hud.tsx) defines the HUD and bottom tray.
- [TurnMoment.tsx](../../src/components/game/TurnMoment.tsx) defines the turn moment’s overlay layer.

The camera design describes remeasuring the board hole and gliding after it changes.
This guide adds no conflicting rule that the camera must remain still.

The #129 thread retains the requested `hud.md`, mockups and screenshot checks, plus the earlier supersession discussion.
This reference does not close that issue or claim those deliverables are complete.
