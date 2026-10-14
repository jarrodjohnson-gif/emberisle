# Waves: how games get a natural break, and what to change in crystal-water.ts

Target path in repo: `docs/research/waves.md`. Owner verdict on the current sea: "it wasn't a natural break, it was a bit choppy".

Source honesty: only the GPU Gems chapter was read in full. The Sea of Thieves SIGGRAPH PDF would not parse (compressed stream), so its content below comes from the abstract and search snippets. I found no primary source for Wind Waker, Animal Crossing, Townscaper, Tiny Glade or Dorfromantik, and no readable AC4 / Uncharted 4 slides. Those entries are marked **[inference]** or **[recollection]** and should be checked before anyone quotes them.

## 1. How the references do it

Shader-only means no per-frame state beyond time. Simulation means a state or spectrum is stepped or transformed each frame (FFT, particles, height-field).

**GPU Gems ch. 1, Finch, "Effective Water Simulation from Physical Models" (shader-only, Gerstner).** Read in full. https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models
- Four geometric (vertex) waves plus about 15 normal-map waves rendered to a 256x256 target.
- Wavelengths are drawn between 0.5x and 2x a median wavelength, with a constant amplitude-to-wavelength ratio, and directions are random within a set angle of the wind. Speed comes from the dispersion relation, not an arbitrary period.
- Steepness is Q_i = Q / (w_i A_i N) with sum(Q_i w_i A_i) <= 1 (the surface loops above that).
- The mesh edge must be at most half the shortest wavelength, and a wave's amplitude is faded between 4x and 2x edge length.
- A wave whose wavelength changes should fade out and respawn rather than morph.
- Our sea breaks the second and third rules: its amplitudes follow no ratio, and its chops sit near the swell's length.

**Tessendorf, "Simulating Ocean Water" (simulation, FFT).** Course notes, 2001 and later revisions: https://jtessen.people.clemson.edu/reports/papers_files/waterslides2001.pdf and https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf
- A statistical spectrum (Phillips, from buoy data) is evolved with the deep-water dispersion w^2 = g k and turned into a height field by an inverse FFT each frame. Choppiness is a second FFT for horizontal displacement.
- The spectrum has a peak and a fall-off, so energy sits in a band of wavelengths. That bandwidth is what looks "natural", where three similar-slope sines look like noise.
- Foam is classically the Jacobian of the displacement going negative (the surface folding), which is crest-based, like our crash foam. It has no notion of a shoreline.
- Typical use is 2-4 tiled cascades (for example 256^2 at 3 different tile sizes). That is far beyond what our 13k-vertex mesh and "no simulation" brief want, but its spectrum idea transfers: a few components with a clear peak.

**Sea of Thieves (Rare; FFT, stylised, simulation).** Rare, "The Technical Art of Sea of Thieves", SIGGRAPH 2018 talk (Ang et al.): https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf, abstract at https://history.siggraph.org/?p=84316
- The abstract and a developer-diary write-up (https://www.mcvuk.com/development-news/rares-sea-of-thieves-started-with-photorealistic-water/) say the sea is a Tessendorf FFT. The stylised look is layered on top: colour blended by view angle, sun direction and a wave-peak mask taken from the FFT choppiness offsets.
- Waves are kept in sync between players for naval combat.
- Rare started from a photographic sea and let artists push it. The lesson for us is to keep the physical spectrum and stylise the shading, not to fake the motion with equal sines.
- **[recollection]** The shore and the breakers are handled by a separate near-island system, not by the FFT. I could not verify it.

**Assassin's Creed III / IV (Ubisoft; FFT plus Gerstner-like detail, simulation).** The only primary item found is the GDC Vault AC3 rendering talk (St-Amour, ocean section): https://gdcvault.com/play/1017710/Rendering-Assassin-s-Creed
- Secondary lists name Black Flag among FFT-ocean games (https://www.slideshare.net/Codemotion/an-introduction-to-realistic-ocean-rendering-through-fft-fabio-suriano-codemotion-rome-2017). A GameDev.net thread notes that AC4's ocean technology was never presented in depth (https://gamedev.net/forums/topic/652966-assassins-creed-iv-black-flag-ocean-technology-talk/).
- **[recollection]** The AC3/AC4 sea is a GPU FFT heightfield with LOD'd tiles, a foam texture driven by folding, buoyancy sampled on the CPU, and shore foam from a depth-buffer fade. Treat all of this as unconfirmed.

**Uncharted 3 / 4 (Naughty Dog; wave particles and flow, simulation).**
- U3 shipped "From a calm puddle to a stormy ocean" (SIGGRAPH 2012, https://history.siggraph.org/?p=72445). Per a secondary source, it used wave particles (Yuksel et al. 2007) for local high-frequency ocean waves: https://github.com/acskyline/wave-particles-with-interactive-vortices
- U4's rapids talk (Gonzalez-Ochoa, "Rendering Rapids in Uncharted 4", SIGGRAPH 2016) used a "wave profile buffer" to stop advected-texture pulsing (same secondary source; slides not retrieved). The technique is a flow map moving a texture, with noise and blend to hide repetition.
- Takeaway for shore interaction: foam and ripples are advected along the water's flow rather than evaluated in place. We can do the same, because our flow is known analytically (shoreward at c(o)).

**The Legend of Zelda: The Wind Waker (GameCube; shader-ish / texture, no simulation).** **[inference, no primary source found]**
- Community analysis points to scrolling, UV-distorted tiled textures (a Polycount thread guesses a static foam texture sampled through UVs warped by scrolling noise).
- The sea is a near-flat plane with a few slow vertex swells. The foam is drawn lines and rings: crisp, bounded in lifetime, and spawned where the shore or an object meets the water.
- The reason it reads natural is rhythm and silhouette, not physics. Foam rings spread outward at a constant pace and fade, and the shore line is a clear band, not noise.
- It is evidence that clean, low-frequency foam shapes beat fine-grained noise in a stylised world.

**Animal Crossing: New Horizons (shader-only, shore-driven) [inference, no technical source found].**
- Observed behaviour: bands of foam arrive in slow pulses (about 6-10 s apart), wash up the sand, thin out into a lace, and retreat. There are no tides (https://www.nookipedia.com/wiki/Sea).
- Probably a shore-distance field (baked or from depth) feeding a time-offset sawtooth: foam at distance d is on when frac(t/T - d*k) is in a window. Our `sinceCrest` is already this pattern.
- The craft is in the timing curve: asymmetric (a fast push up the sand, a slow draw-back) and a lacy edge where the noise threshold rises as the foam ages.

**Townscaper, Tiny Glade, Dorfromantik (cheap stylised seas) [inference, no sources found].**
- The common recipe is depth-fade foam from the depth buffer (a rim wherever water meets geometry), one or two slow-scrolling low-frequency noises, and a toon-stepped colour ramp.
- Waves are a few vertex sines, or none. The sea is a flat colour field with foam outlines around structures, and the animation is quiet and slow.
- They look calm because nothing moves fast or fine. Wave motion has one low frequency, and the only high-contrast element is the foam rim.

## 2. Why ours reads choppy (from `crystal-water.ts`)

1. **The chops carry as much slope as the swell.** Slope is amplitude x wavenumber: swell 0.06 x 0.90 = 0.054, chop1 0.015 x 2.86 = 0.043, chop2 0.008 x 4.83 = 0.039. Height is dominated by the swell, but lighting and the normal-driven refraction and glint follow slope, and slope is nearly equal across three components. That is the signature of noise, not a swell. A real spectrum falls off steeply, with chop slope roughly 20-40 % of swell slope.
2. **Wavelengths sit too close and too short.** 7 / 2.2 / 1.3 is a 5.4x spread, but the two chops at 2.2 and 1.3 units are about 2 and 1.3 hexes long, which reads as a ripple on a hex-scale board. The amplitude ratio is also 1 : 0.25 : 0.13, so no component is clearly a "background". They all fill the same visual octave.
3. **There are no sets.** The swell is one sine at a 6 s period. Every crest is identical and arrives every 6.0 s. Real water bunches: sets of larger waves with lulls between them. Metronome regularity plus three uncorrelated sines is the textbook choppy look.
4. **The break is a crossfade of two unrelated waves.** `shoreLift` swaps the swell (7 long, fixed direction) for the `shore` Gerstner (4.2 long, aimed at the coast) over the last 2 units, with a different wavelength and an arbitrary phase (`shorePhase` uses -k*o and a sin/cos jitter `alongCoast`). The crest the eye follows therefore does not connect from deep water to the beach. A front never visibly forms, travels and slows. The band is 2 units, so even a connected 4.2-long crest would fit only half a wavelength.
5. **The shore wave runs at a constant phase speed.** It travels at 4.2/6 = 0.7 units/s all the way in. Real celerity falls as sqrt(g d): with our own depth table (d = 0.1 at 0.22 out, 0.26 at 0.9, 0.9 at 4) and g_eff = 2 pi L/T^2 = 1.22 for the swell, c drops from about 0.9 at 2.8 out to about 0.35 at the beach edge. Constant speed means no slowdown, no bunching, no steepening.
6. **Amplitude does not shoal.** The shore wave is a flat 1.6x. Green's law gives H proportional to d^(-1/4), so H grows 1.5-1.7x only at depths of 0.2-0.1, and what matters is H/d crossing about 0.78 at the point where it breaks. Breaking should depend on that ratio per wave, so big sets break further out and small ones barely break. Ours breaks the same way every time.
7. **Foam is driven by position, not by a breaking wave.** `life` is on wherever o is in 0.2-1.0 and `sinceCrest` is under 1 s, whether or not that wave is big enough to break. Open-water `caps` pop where two chop crests coincide, which gives random flecks (also choppy).
8. **Foam noise is far too fine.** vnoise at 18 and 41 cycles per unit has features 0.055 and 0.024 units wide (1/20th and 1/40th of a hex, a couple of pixels at the home zoom). The `caps` use 24 per unit, the glint fleck 70. It shimmers instead of reading as foam shapes, and scrolls at 0.5-0.8 units/s unrelated to the wave speed (0.7 on the shore wave). It is also scrolled by time, not advected with the front, so foam does not travel shoreward, it twinkles.
9. **Foam lives 1 s.** `1 - smoothstep(0, 1, sinceCrest)`. The front (5 s later) is a blink; a real surf line holds 2-3 s.
10. **Everything else on the surface adds tiny-scale motion.** A sin ripple at 2.1 and 1.7 cycles per unit with unit-scale time terms, and a 70-per-unit sparkle drifting at 0.9 units/s.

## 3. Recipe: a natural break without simulation

Design stance: one connected wave train. Deep water carries two swell components that beat into sets, near the coast the same train's phase is re-timed by travel time (so the crest is the same crest from sea to beach), breaking is a function of H/d, and foam lives in wave-phase space.

### 3.1 Parameters (a hex is about 1 unit; coast-to-deep band about 2 units; g_eff = 1.22 units/s^2, so T = sqrt(5.15 L))

| Component | Dir (vs. current swell dir) | L (units) | a (units) | T (s) | q | Notes |
|---|---|---|---|---|---|---|
| Swell A | 0 deg | 6.6 | 0.050 | 5.8 | 0.35 | main train |
| Swell B | +12 deg | 8.2 | 0.030 | 6.5 | 0.30 | beats with A: 1/(1/5.8 - 1/6.5) = 54 s set period |
| Chop 1 | -40 deg | 3.0 | 0.006 | 3.9 | 0.25 | slope 0.013 |
| Chop 2 | +70 deg | 4.2 | 0.008 | 4.65 | 0.20 | slope 0.012 |

- Old chops were L=2.2 and 1.3 with a=0.015 and 0.008 (slopes 0.043, 0.039). The new chops have about a third of the slope at 1.4x to 3.2x the wavelength.
- Group height: A+B peaks at a = 0.08 (H = 0.16 crest to trough), lulls at 0.02 (H = 0.04). The envelope is the physical beat, and sets travel at half the phase speed, so the group visibly rolls in.
- Keep sum(q k a) <= 0.9 on open water: A gives 0.35 x 0.95 x 0.05 = 0.017. The recipe has headroom to raise q to 0.6 if crests look too round.
- Add slow gusts to the chops: multiply their amplitude by `0.6 + 0.4 * vnoise(p * 0.15 + vec2(0.02 * t))` so chop comes in patches. Fade the chops out for o < 2.5 (`smoothstep(0.5, 2.5, o)`): in the surf zone the breaker owns the surface.
- Drop the 70 per unit sparkle to 25 and the ripple to 0.8 / 0.6 cycles per unit with half the amplitude.

### 3.2 Shoaling by travel time (phase, not amplitude, does the work)

- CPU, once per vertex row, from the existing `DEPTH` profile: finite-depth dispersion `c(d) = sqrt(g / k * tanh(k d))` with k = 2 pi / 6.6 gives roughly 0.35 u/s at the beach edge, 0.56 at d = 0.26, 0.87 at d = 0.62, 0.94 deep.
- Integrate the travel time `tau(o) = integral of do / c` from the coast outward. By hand, tau(2) is about 3.1 s and tau(4) about 5.8 s, so a crest takes about 3 s to cross the 2-unit band (and slows 2.5x).
- Upload `aTravel = tau(o)` and `aDepth = d(o)` as two extra per-vertex attributes next to `aCoast`. The shader then needs no integration and no table, only +2 floats x 13k = 104 KB.
- Phase of each swell component (w = 2 pi / T):
  - `theta_deep = k * dot(dir, p) - w * t` (unchanged)
  - `theta_shore = k * dot(dir, p + inward * o) - w * (t + tau)`: the crest sits at the coast point it will hit, `tau` seconds before it arrives
  - `theta = mix(theta_deep, theta_shore, s)` with `s = 1 - smoothstep(2.5, 4.5, o)`
- Mixing unwrapped phase (not amplitude) keeps the crest continuous from open water to the beach, which fixes cause 4. Arrival order around the island is automatic (windward coast first), so `alongCoast` can go.
- Shoaling amplitude by Green's law: `a_loc = a * pow(0.9 / max(d, 0.08), 0.25)` (1.46x at d = 0.2, 1.73x at 0.1).
- Local gradient for the normal: `grad theta ~ mix(k*dir, (w / c) * inward, s)`. Ignoring the derivatives of the slowly varying a_loc and c is fine for lighting. `makeSwell` should use the same `tau` lookup (the CPU loop already finds `o` and `inward`).

### 3.3 Breaker front (a function of the wave, not of position)

- `Hloc = 2 * a_loc` (summed A+B at this phase), `B = smoothstep(0.7, 0.95, Hloc / d)`. The rule H/d = 0.78 puts breaking at o about 1.0 for a set peak (H0 = 0.16, d = 0.26), about 0.45 for an average wave (H0 = 0.10, d = 0.19), and not at all in a lull (H0 = 0.04). Big sets therefore break further out.
- Steepening: raise q toward the break, `q = mix(q0, min(0.85 / (k_loc * a_loc), 3.5), B)`. k_loc = w / c is about 2.2 at d = 0.2, so the crest cusps with the front face about 0.12 units forward of the back. Keep q k a <= 0.85 so the surface never loops. Mesh spacing is 0.12 over the band, so a crest that sharp covers 2-3 vertices; do not go finer in the shader than that.
- Foam birth at the crest: `crest = pow(0.5 + 0.5 * cos(theta - pi/2), 8.0)`. Foam age `s = mod(pi/2 - theta, TAU) / w` (seconds since the crest passed, same as `sinceCrest`, but now with the connected travel-time phase).
- Foam body: `mask = B * (1 - smoothstep(0.3, 2.2, s))`. The first 0.35 s are a solid line (the lip, about 0.15 units thick at c = 0.45), then it breaks into lace.
- Lace: threshold `thr = 0.25 + 0.55 * (s / 2.2)`, `foam = mask * smoothstep(thr - 0.08, thr + 0.08, n)` with `n = 0.7 * vnoise(q1) + 0.3 * vnoise(q2)`.
- Noise advected with the wave, not with the clock: `q1 = (vRest + inward * c_bar * t) * 2.2` and `q2 = (vRest + inward * c_bar * t) * 7.0`, with c_bar = 0.5 u/s. Features are 0.45 and 0.14 units, large against a hex. The 41 per unit layer goes.
- Foam lifetime therefore starts at about 0.3 s solid, thins out over 1.5-2.2 s, and is gone by 2.5 s.

### 3.4 Swash and retreat

- The bore reaches the waterline at s about tau(0.3) after crest. Run-up edge `e(s) = 0.35 - 0.33 * f(s / 3)` with f asymmetric: 0.9 s up (ease-out) and 2.1 s back (ease-in), for example `f = u < 0.3 ? sin(u/0.3 * pi/2) : cos((u-0.3)/0.7 * pi/2)`.
- Edge line lasts 2.4 s as now. Gate the whole swash by the incoming wave's B or its size, so lulls give a gentle lap and set peaks give a visible rush. The current code runs it on every wave.
- Keep the thin waterline lace (it already stays in reduced motion).

### 3.5 Per-frame cost

- Vertex (13k verts): previously 4 Gerstner terms and `shoreLift`. Now 4 Gerstner terms (A, B, chop1, chop2) plus a Green's-law `pow`, two phase mixes, one `vnoise` for gusts, and two attribute reads. About +30-40 ALU per vertex, about 0.5 M extra ALU per frame. On a phone GPU that is well below 0.05 ms. The SwiftShader proof measured 2.7 ms for the vertex stage; expect 2.9-3.3 ms.
- Fragment: the same number of noise lookups (the 18/41 pair becomes 2.2/7) plus `B`, one `pow` and one `cos`: +5 %. Drop `caps` (-2 sin, -2 vnoise) and net the fragment about even.
- Memory: +104 KB of attributes. CPU twin: one table lookup and two more `sin` per boat per frame.

## 4. Verification we can automate (headless, deterministic via `uTime`)

**A. CPU-twin metrics (no GL, milliseconds).** Run `makeSwell` at a shore point (o = 1.6) and an open-water point, sampled at dt = 0.05 s for 600 s.
1. *Arrival intervals.* Upward crossings of the (mean + 0.3 sigma) level give intervals I_k. Natural: mean 5.5-7 s and coefficient of variation of intervals 0.15-0.45 (a metronome has about 0.02, as ours does now).
2. *Set period.* The autocorrelation of a rolling-peak envelope (max over a 8 s window) has its first peak at 40-60 s and a peak-to-trough ratio >= 2.
3. *Bandwidth.* Share of spectral energy with T < 3.5 s is under 5 % of the total. Current code: chop slope is about the same as the swell's, so well above.
4. *Slope.* Max |grad h| in open water <= 0.12 (about 7 degrees), and chop-only RMS slope <= 0.4x the swell's RMS slope.
5. *Celerity.* Track a crest by phase between o = 2.0 and 0.4: the mean speed ratio c(0.4)/c(2.0) should be 0.35-0.5. A constant-speed wave fails.
6. *Break position vs set size.* Per wave, `o_break` (first o where B > 0.5) is monotone in the group height: the largest 10 % of waves break >= 0.3 units further out than the median, and the smallest 20 % do not break.

**B. Foam lifetime from pixels (SwiftShader, existing `jelly-ocean-prove` style).**
1. Add a debug define that outputs foam mask only (white on black); use an orthographic overhead camera on a straight coast strip.
2. Render 120 s at 4 fps. For each pixel record foam-on runs: lifetime distribution median 1.5-2.5 s, p95 <= 3.5 s (swash excluded by the strip o > 0.5), no run over 5 s. The current code has median under 1 s.
3. Foam centroid in o moves shoreward over each foam event at 0.3-0.6 u/s (fit slope), and never seaward. It catches foam that merely twinkles in place.
4. Anti-noise: the share of foam edge energy at features under 0.1 units is <= 10 % (2D FFT of the mask, or ratio of edge pixels to area). It rejects the 41 per unit layer.
5. Coverage: foamy fraction of the o in [0.3, 2] strip is 8-35 % averaged over a set cycle, and varies with the set (std/mean >= 0.4 over 54 s), so sets show.
6. Reduced motion (`uMotion` = 0): foam mask empty apart from the waterline lace.

**C. Eyeball gate.** A 20-second contact sheet (4 fps, 80 frames, 8x10) per commit so a human can approve the rhythm in one glance. The numbers pass only if the sheet shows sets.

## Three parameter changes to make first

1. **Chops: 2.2 / 1.3 -> 3.0 / 4.2 and amplitude 0.015 / 0.008 -> 0.006 / 0.008, fade out inside o < 2.5.** This cuts chop slope from about 0.04 to about 0.012, the single biggest cause of "choppy".
2. **Add a second swell (L 8.2, T 6.5, a 0.030, +12 deg) and drop the main one to L 6.6, T 5.8, a 0.050.** This gives 54 s sets with no extra machinery.
3. **Foam: noise 18 / 41 -> 2.2 / 7 per unit, lifetime 1 s -> 2.2 s, and advect the noise with the wave (`inward * 0.5 * t`).** After that, if the break still feels disconnected, move to the travel-time phase (3.2) and H/d breaking (3.3).
