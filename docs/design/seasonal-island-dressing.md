# Seasonal Island Dressing Specification

This design specifies seasonal island cosmetics for Issue #1450 item 12.
It introduces subtle visual changes that celebrate the calendar year.
Seasonal touches remain purely cosmetic and never alter game rules or card holdings.

## 1. Aesthetic Vision and Calendar Touches

Seasonal cosmetics respect the quiet, lit-diorama style established in polish.md.
Touches feel natural rather than garish or intrusive.

- Winter (December): Mountain peaks in ore hexes receive light snowcaps above elevation threshold 0.45.
- Winter accents: Timber pine trees display subtle white frost on upper foliage tips.
- Spring (April): Wool pastures sprout tiny pastel wildflower blossoms across grassy pads.
- Summer (July): Coastal beaches show sun-bleached driftwood and slightly brighter turquoise water tones.
- Autumn (October): Small paper lanterns glow warmly at harbor dock posts.
- Autumn accents: Timber hexes display mixed amber and golden deciduous leaves.

## 2. IslandCanvas Budget Limits

The IslandCanvas chunk has a strict size ceiling of 203,500 bytes gzipped.
DECISIONS 2026-11-04 limits weekly growth to at most 1,000 bytes.

- No core asset bloat: Never bundle seasonal geometries or heavy textures inside IslandCanvas.
- Core chunk budget: Core code changes in IslandCanvas must stay under 250 bytes gzip.
- Uniform delivery: Implement snow and leaf tints via existing terrain shader uniforms.
- Zero-byte shaders: Procedural elevation gradients and color lerps add zero bundle weight.

## 3. Asset Delivery and Lazy Chunking

Prop geometries load through dedicated seasonal chunks fetched on demand.

- Lazy loading: Dedicated seasonal chunk seasonal-props.ts loads only when an active season triggers.
- Date activation: Evaluate seasonal periods using local client calendar months.
- Default isolation: Months without special dressing download zero seasonal prop code.
- Failure fallback: Failed seasonal chunk requests fall back silently to standard terrain.
- Offline safety: The game remains fully playable offline without seasonal downloads.

## 4. Geometry and Performance Ceilings

Seasonal decorations must not degrade mobile rendering performance.

- Draw calls: Shader uniform tints add zero additional draw calls.
- Prop draw calls: Instanced seasonal props draw in at most 2 draw calls.
- Triangle budget: Total seasonal geometry must not exceed 800 triangles island-wide.
- Memory limit: Seasonal textures and buffers must consume under 500 KB GPU memory.
- Frame rate: Maintain stable 60 fps on desktops and 30 fps on phones.

## 5. Accessibility and User Control

Players maintain full control over visual presentation.

- Menu toggle: Add an optional "Seasonal dressing" switch inside Table menu settings.
- Reduced motion: Freeze all decorative lantern sway and falling leaf animations.
- Screen readers: Mark all seasonal props with aria-hidden="true" to avoid screen reader clutter.
- Color contrast: Verify snow and leaf tints preserve 3:1 token pad contrast.

## 6. Verification and Testing Strategy

Focused proofs protect bundle ceilings and render performance.

- Verify IslandCanvas bundle size stays under 203,500 B using npm run size-prove.
- Test calendar date detection across all twelve months in unit proofs.
- Verify shader compilation on software WebGL using npm run board-look-prove.
- Confirm zero regressions in token clearance with npm run tokens-prove.
- Run npm run typecheck and loosen-prove to ensure build integrity.
