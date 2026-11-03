# Owner's black blocked-hex palette

PR #838 / issue #826. GPT-6.1 Sol, continuing the original builder's adopted branch and normal main4892049 mergef1bbf7a. The owner's 24 October answer on #838 requested plain black instead of brown, with a readable number and new phone/desktop captures.

The blocked terrain tint is zero RGB. Its final material output also fades to black, removing the colored lighting/specular/emissive remainder. Unblocked materials keep their normal lighting. The token disc/face is black with light numeral and pips. Its existing glyph pixels are recolored, preserving their geometry; moving away restores the original texture object and colors. Temporary black textures are disposed on move, and the retained original/active texture is disposed with its material. Wastes remain unchanged.

## Verified

Fresh verification checkout `work/verify838-main`, frozen npm install. Implementation3cbcd6e, Node24.19.0, Chromium1243/SwiftShader. Later commits only add evidence/calibration. Every listed normal command exited0:

- `npm run robber-hex-prove`: desktop1280×720 and phone390×844 composed WebGL samples, black/no-brown limits, readable token face, original face-pixel hash restoration, Wastes skip and all original move/dim/restoration checks; no console errors.
- `npm run tokens-prove`: full geometry, numeral/pip sizes, contrast, screen spacing and scenery/wayfarer occlusion checks.
- `npm run flash-prove`: full motion/reduced payoff clocks, blocked/nonpaying behavior, pulse/haptic ownership and idle cases.
- `npm run wayfarer-prove`: full neighboring movement/animation proof.
- Types/build/registered133/loosen0 pass; no size budget changes.
- [scope audit](logs/scope-audit.py): all18 published `check` calls retained byte-for-byte, four stricter calls added. Existing tokens/flash/wayfarer proofs and size rules equal main. Main package plus one registration; exact main eight-leg CI plus robber once in flows-c beside wayfarer/tokens.

Terrain mean luminance: desktop **0.549613→0.001815**, phone **0.569911→0.002093**. Both return exactly to their before value on moving away. Each actual framebuffer sample includes648 pixels; tokens/wayfarer are hidden only for terrain sampling and restored for the owner captures. The unchanged 10%-darker and 0.02 restoration assertions remain, alongside the new absolute black/neutral checks.

Build after restoration atabd8551: see [size output](logs/restored-size.log). All fixed ceilings and growth allowances pass; final published-head numbers are posted on the PR because commit/time injection changes gzip bytes slightly.

## Failure controls and implementation correction

[Old-color control](old-colour-control.py) substitutes only the published shadeRobber/DULL/hexPatch color paths fromf1bbf7a, retaining current CPU canvas readback. It exits1 on exactly the four added black/readability checks, while all published assertions pass. Final source and positive captures are restored byte-for-byte in finally; restored build/size pass. Full control output and restored source hashes are committed.

The first implementation attempt failed the new restoration check and left residual lit tint (desktop mean0.080012 above the new0.08 bound). Final output modulation removed that tint without changing the bound. Regenerating a normal face was replaced by restoring the original texture. The full-renderer pixel hash still varied on the GPU-backed canvas despite returning the same original texture UUID; isolated texture switching showed no byte changes. CPU `willReadFrequently` contexts then passed the same exact hash assertion. This records observed readback behavior rather than a claim about a generic browser defect. The normal numberToken factory's palette, geometry and font remain.

A full old-source control initially failed five added checks, including readback stability, so it was not counted as the four-check palette calibration. Both its raw failure and the successful scoped calibration are retained. No assertion, threshold, timeout or budget was relaxed.

## Captures

[Phone390×844](390x844.png) and [desktop1280×720](1280x720.png) are actual rendered positive captures at3cbcd6e and were visually inspected. The black face has a readable light6 and pips; other tiles keep their colors. Current parent-directory captures have the same hashes. Historical brown captures remain in Git history at19bb0f9.

These screenshots fulfill the requested new pictures; **owner visual approval and independent review/current-head CI remain pending**. No merge or main push was performed.
