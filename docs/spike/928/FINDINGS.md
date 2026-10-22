# Sandwich Stacker runtime and controls feasibility

**Recommendation: build the next isolated lobby prototype, with held Left and Right buttons.**
Ruffle plays this file through actual gameplay and the final-score screen.
Mouse follow and touch dragging do not move the character. Page buttons do.
Jarrod still decides whether to proceed. This leaf does not integrate the lobby.

Builder: Codex-928, GPT-6.1 Sol, accepted by the desk on #928.
Scope: the desk-approved S-sized feasibility leaf, not the original M-sized integration.

## What was tested

Automated **headed** Chromium ran on an Xorg dummy display, using ANGLE/SwiftShader.
The desktop viewport was 960×800. The phone viewport was 390×844, with mobile and touch emulation.
The phone run used device scale factor 1 and no CPU or network throttling.
These are container measurements, not physical-phone or hardware-GPU measurements.
No person listened to the audio. The sound result measures Web Audio samples only.

| Check | Observed result |
|---|---|
| Real file | SHA-256 `d4f3897d3db66b2a531646e94bf8635e68e95017ef25e1fcc6139928a42e9ece`, 183,738 bytes. |
| Stage | CWS v6 RECT: x 0–11,600, y 0–6,400 twips; **580×320 pixels**. |
| Timing | Header and Ruffle metadata agree: 24 fps, 79 root-timeline frames, AVM1. |
| PLAY | A pointer click at the title's PLAY button starts Level 1. A phone tap also works. |
| Gameplay | Falling ingredients animate. Caught ingredients accumulate on the tray. |
| Progression | A separate initial run reached Sandwich Break, Level 1, score 50. |
| Game over | An unattended run reached the final-score failure screen with Play Again. |
| Native arrows | Trusted ArrowLeft/ArrowRight presses move the character left/right. |
| Synthetic arrows | Page buttons dispatch untrusted keydown/keyup on the Ruffle player. Held presses move the character. |
| Mouse follow | Moving the mouse across the stage leaves the character stationary. |
| Phone drag | Touch dragging left/right across the stage leaves the character stationary. |
| Phone buttons | Held touch presses move the character. Release sends keyup. No repeat-event timer is required. |
| Phone fit | Stage 366×201.92 CSS pixels; buttons 177×56 pixels. No horizontal overflow or input-induced page scroll. |
| Default sound | Checkbox unchecked; Ruffle volume 0. |
| Enabled sound | Web Audio context running at 44,100 Hz; sampled output peak **0.609436** after enabling sound. |
| Decode warnings | No MP3 decode warnings appeared in the recorded run. Audible quality remains unverified. |
| Collapse/unload | After the toggle event, zero player elements remain and `spike.loaded` is false. |
| Reopen | Cancelling an in-flight player, then reopening, leaves exactly one loaded player. |

See [desktop title](evidence/desktop-title.png), [caught ingredients](evidence/desktop-catch.png),
[score 50](evidence/desktop-score50.png), and [game over](evidence/desktop-gameover.png).
Compare [held left](evidence/desktop-held-left.png) and [held right](evidence/desktop-held-right.png).
At 390×844, compare [drag left](evidence/phone-drag-left.png), [drag right](evidence/phone-drag-right.png),
[held left](evidence/phone-held-left.png), and [held right](evidence/phone-held-right.png).
Screenshots are separate moments; ingredient positions and catches vary between runs.

## Load and frame measurements

Ruffle is pinned to npm `@ruffle-rs/ruffle@0.7.1`.
Archive SHA-256: `dc9e7407549a91accc41a14932b0b9d9a9d51a3742ce6f020888c8a76682b157`.
Only opening the details panel requests Ruffle. Before opening, the phone resource list was empty.
All game/runtime requests used the local server. No remote game requests were observed.
The only recorded console error was the harness server's missing `favicon.ico`.

| Selected asset | Bytes served | gzip bytes, locally computed |
|---|---:|---:|
| ruffle.js | 465,885 | 101,157 |
| core.ruffle.16d61072ac7fdc4d5013.js | 108,322 | 27,030 |
| 172de42e6619eac8f371.wasm | 14,302,754 | 4,994,086 |
| Selected runtime total | **14,876,961** | **5,122,273** |

The package also contains an alternate WASM/core pair; the tested browser did not request it.
The local server sent uncompressed assets. gzip figures are computed sizes, not measured transfers.
The SWF adds 183,738 bytes. The runtime stays outside the repository and application bundle.

| Measurement | Headed desktop | Emulated phone |
|---|---:|---:|
| Open → loadedmetadata | 855.6 ms | 689.4 ms |
| Browser RAF callbacks in a five-second sample | 146 | 301 |
| RAF interval median | 33.3 ms | 16.7 ms |
| RAF interval p95 | 66.7 ms | 16.8 ms |
| Longest sampled RAF interval | 83.3 ms | 16.8 ms |

These RAF counts measure browser scheduling, **not Flash's achieved animation frame rate**.
Flash declares 24 fps. Desktop software rendering showed jank; the smaller emulated stage did not in this sample.
Phone HTTP caching was disabled. Both runs used local files and may reuse Chromium's compiled-WASM cache.
These timings do not predict a first load over mobile data or on a physical phone.
Raw observations: [desktop](evidence/desktop-measurements.json) and [phone](evidence/phone-measurements.json).
Audio sampling used an AnalyserNode between Ruffle's output and AudioDestinationNode during the desktop run.

## Harness and reproduction

`index.html` is a plain standalone research harness. It is not imported by Emberisle or served from `public/`.
No application, server, package, or CI file changes. No production proof or dependency was added.
The runtime and its WASM files are not committed.

From the repository root, stage the files in a temporary directory:

```sh
spike_dir=$(mktemp -d)
mkdir "$spike_dir/runtime"
curl -LfsS https://registry.npmjs.org/@ruffle-rs/ruffle/-/ruffle-0.7.1.tgz -o "$spike_dir/ruffle.tgz"
sha256sum "$spike_dir/ruffle.tgz"
tar -xzf "$spike_dir/ruffle.tgz" -C "$spike_dir/runtime" --strip-components=1
cp docs/spike/928/index.html docs/spike/928/sandwichStacker.swf "$spike_dir/"
python3 -m http.server 8098 --bind 127.0.0.1 --directory "$spike_dir"
```

Open `http://127.0.0.1:8098/` in a headed browser.
Open the collapsed panel, click PLAY, and compare native arrows with held page buttons.
Enable Sound to test actual listening on a device with speakers.
At 390×844, try a stage drag, then hold each page button and release it.
Collapse the panel; inspect that `document.querySelectorAll('ruffle-player').length` becomes zero.
Reopen, or cancel during loading and reopen; exactly one player should remain.
`spike.metadata`, `spike.loadMs`, and `spike.events` expose the harness observations.
The plain page can scroll vertically to show diagnostic metadata.

## Boundaries for the next decision

- Keep the runtime lazy and self-hosted. Preserve its Apache/MIT license files when distributing it.
- Keep the exact 580:320 stage ratio. Use held page buttons for touch; dragging is insufficient.
- Isolate a future embedded player in its own frame and verify shortcuts there.
  An early harness stopped keyboard propagation before Ruffle's global listener; that prevented movement.
  The final standalone harness does not block those events. It does not establish lobby keyboard isolation.
- Test audio by listening, and test load time and responsiveness on real phones before accepting integration.
- Lobby placement, game-start teardown, and the production lazy-loading proof belong to the later integration issue.
  This standalone Unload button does not prove teardown on an Emberisle game start.
- Astra's #929 spec and Jarrod's decision still govern the lobby feature.
