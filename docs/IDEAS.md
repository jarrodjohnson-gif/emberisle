# Ideas

Not scheduled. An idea becomes an issue only when Jarrod says to build it (see [FRAMEWORK.md](FRAMEWORK.md) section 8). Then write `→ #<number>` on that line.

- A fifth and sixth seat, which needs a larger island. The 19-hex table stays 3 or 4.
- Background music. Table sounds already have a milestone.
- Lock one exact number-token spiral from a picture, instead of dealing tokens. The dock counts are not an idea; they are a rule. See the README.
- A spectator who can watch and not play.
- Cooking a Mac build. That choice is already `Decide:` issue #61.

---

## AI Workflow Failure Note — #50 (feat/show-dice branch)

**What went wrong:**
An earlier session (jarrodjohnson-gif) violated docs/FRAMEWORK.md step 4 (Testing). It:
- Started implementation without a research/design pass
- Committed store changes to track roll history
- Did NOT run the required proof commands
- Did NOT paste test output into the issue
- Did NOT open a PR with passing CI

**Current state:**
- Branch: `feat/show-dice`
- Files touched: `src/lib/game/store.ts` (with `RollRecord` type and `rollHistory` state)
- Hud component dice display: NOT IMPLEMENTED
- Store wiring to `rolled` message: INCOMPLETE
- Tests: NOT RUN

**What the next agent must do to fix this:**

1. **Complete the implementation:**
   - Wire `store.ts` to capture the `rolled` event and call `addRoll()`
   - Add dice display component to `src/components/game/Hud.tsx` with fade animation
   - Add roll history toggle/expansion UI

2. **Run the full test suite from a fresh clone:**
   ```
   npm run typecheck
   npm run build
   npm test
   npm run client-prove
   npm run tabs-prove
   ```

3. **Paste exact output into issue #50**

4. **Open the PR only after all tests pass**

5. **Mark issue as In Review**

**Do NOT merge, claim done, or treat as complete until step 4 is done.**

Per docs/FRAMEWORK.md: "Done means runs. A Testing step is done only when its command passes from a fresh clone, and the output is pasted in the issue."

---
