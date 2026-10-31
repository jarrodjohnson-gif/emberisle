# Final owner screenshots: #883

Builder: Codex-p; runtime worker: GPT-6.1 Sol, parent Codex-p. This continues the existing PR, not a new issue or PR.

The owner's final direction is in main's `docs/design/trade-window-b/README.md`, with three source PNGs in `owner-approved-2026-10-27/`, added by PR1185. Desk6446380704/6446696915 supersede the earlier Bank-above/left arrangement. All three pictures and V1 rest were opened before implementation.

Runtime98ec09c changes only TradePanel.tsx and trade-panel.css. It puts Table left and Bank right, restores `You give N good. You get 1 good.`, shows Bank stock, uses the one-exchange heading, prevents unselected cards stretching to selected-card height, and paints disabled icons/names neutral. Existing per-good palette, quantity component, bank eligibility and rates remain intact. No store, rules, server, Hand, focus trap, dependencies, lockfiles, registration or budget changes.

Proof equivalents are separate4da2483/738b091; additive compact-card/visible-stock coverage is c002da6. [Exact old/new table](equivalents.md) includes every changed proof block and the preserved Ask/Bank order swap. The advisory loosen check flags five superseded geometry/palette lines; none is suppressed. Their final-spec equivalents run alongside every original44px target,8px gap,12px text, both-row visibility, settlement, refusal, keyboard, motion and lazy-recovery check. Quote fixtures retain exact goods, rates and stock. No assertion timeout or numeric allowance changes.

## Pictures and differences

Nine `pictures/` captures show initial, affordable and disabled drafts at390x844,844x390 and1280x720. Previous comparable pictures are at fbabecf3ea106cefb716114ff4cf49d7c5f086bf, `docs/proofs/831-refresh/b-rebuild-2026-10-27/pictures/`. The PR body places before and after beside the owner's source references.

- Unselected cards are102px high on normal-height screens and90px including border on short screens. Upright cards are about62px wide, matching source1; sideways they are about115px wide, matching source2. Icons/names retain their own good colour. Unavailable controls use pale neutral text; eligibility remains unchanged pending dimming Question8316440584919.
- Selected cards still gain the existing explicit44px minus: below on normal screens, beside on short screens. They are154px high on normal screens. This is a remaining difference from the desired compact selected look, not claimed complete. Question8836448516813 asks how removal/tapping should work. No tap-handler or removal semantics were guessed.
- Footer columns now match source3's Table-left/Bank-right order. Normal-height Bank has the exact quote, visible stock and full-width action underneath. On short screens its existing horizontal action and hidden headings remain so both goods rows and44px controls fit. This differs from source3's vertical footer and requires owner acceptance; source2 itself shows a horizontal short-screen Bank box.
- Existing seat cards, extra seat details and hotseat Bank-only mode remain outside the settled changes. Prior Question8316440584919 covers them. Desktop uses the same settled normal-height footer; the owner supplied no separate desktop composition.
- Existing V1 vector symbols, type, paper/palette tokens and button styling remain. Source screenshots use an older fixture/board and font rendering; no screenshot overlays or replacement art were introduced. The real renderer is visible behind the modal.

The capture uses legal seeded setup, followed by controlled conserved hands and an online-mode store fixture. It is not a live-host game or physical-device acceptance. Its Offline badge is expected. Seed and source hashes are recorded rather than assuming the earlier capture's seed. All nine images were individually inspected; quantity controls meet44px targets. Desktop scrollHeight rounds0.5px above the fractional client height; the existing row-visibility checks decide fit without a new tolerance.

## Validation record

Actual results at c002da6:

```text
typecheck: pass
registered-prove: all151 proofs are in package.json and ci.yml
trade tabs proof ok: three viewports, both motion settings, real rules settlement, zero browser errors
hand-cards-prove: ok
rotate-overlays-prove: ok
trade map proof ok; zero browser errors
build: pass
index growth: base124370 B, PR124367 B, -3 B, allowance400 B
sheets growth: base7143 B, PR7144 B, +1 B, allowance200 B
TradeResource833/1650 B gzip; existing approved ceiling unchanged
size-prove: all chunks inside ceiling and growth allowance
old-UI negative: exit1 at final owner Table-left/Bank-right assertion
source audit: exactly4 executable files changed; check lines145→151;5 documented equivalents
```

The loosen advisory exits1 for the five explicitly replaced geometry/palette lines; its detector and output are retained. This is not reported as a passing loosen check. All other selected checks pass. Runtime stays98ec09c throughout; c002da6 includes the separate proof changes. No unrelated full scene/client suites were rerun for these two HUD files.

See `records.json` and the raw logs for exact commands, outcomes and source hashes. Selected checks run once serially under the shared browser lock in a fresh no-local clone with frozen root/server installs and pinned Chromium153.0.8010.12. Later evidence-only verification does not claim new browser runs.

The earlier CI40516415723 audio timeout remains cause-unproved. Diagnostic checkpoint e0c559c retained it and passed its local controls; CI40548936803 subsequently reproduced the known #1176 Copy-padding failure7.8/7.8px at375x667. Existing #1181 owns that fix. The excerpt is retained here; no overlapping lobby edit or CI retry. Current-head CI, fresh independent Claude review, the unanswered interaction/dimming decisions and owner picture acceptance remain gates. No builder merge.
