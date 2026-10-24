# Open questions for the owner

Only Jarrod can settle these. Each has a recommendation and the alternative. Until answered, the laws carry the recommended number marked "proposed".

1. **Island minimum share (law 3).** Recommendation: the island's fitted box keeps at least 60 % of viewport height in portrait (today it is about 68 % before the roll and 55 % in main at 390x844, measured from the current frames), and in landscape the full height beside a column no wider than 42 % of the width (the current code's cap). Alternative: the benchmark's 62 % / HUD under 38 %, which is tighter and would force the dock below about 320 px tall in portrait. You said you gave no pixel budget; this is the one number the laws cannot do without.

2. **Dock height in portrait (laws 1 and 2).** Recommendation: one box of about 300 px above the safe-area inset at 390x844, holding the turn line (32), hand (78), action row (52), utility row (44) and log/deck strip (20) with 8 px gaps, so every slot exists in every state. Alternative: about 250 px by merging the utility row into the action row, which puts Trade next to End turn (against law 6's spacing note) or drops the log strip.

3. **Is landscape phone a first-class layout?** You said "we are overengineering for a vertical mode" and that small landscape is cramped (a box covering about 45 % of the screen). Recommendation: portrait is first-class and landscape phone is a supported second layout built from the same slots as a left column, with no features only one orientation has. Alternative: landscape-only on phones (what CATAN Universe does) or portrait-only (what Offsuit does). Either removes a layout we test today.

4. **What fills the dock on another seat's turn?** You said never show dice or Roll then, but keep the space useful. Recommendation: the Roll/End slot shows the acting player and their event ("Tide rolled 8", "Dune is trading"), the action-row slot shows your greyed builds with costs so you can plan, and the offer line takes its slot when one arrives. Alternative: an empty greyed slot with "Tide's turn" only.

5. **Title menu: practice, online and hotseat nested under a settings disclosure.** Recommendation: Play stays the one primary; Host a table, Join and Hotseat become three equal secondary buttons on the card, and settings (wayfarer, bots) go behind one disclosure. Alternative: keep the current single disclosure but rename it "Game" so it does not read as settings.

6. **Does the bottom-third rule apply on desktop (law 5)?** Recommendation: no; desktop keeps the dock centred at the bottom as today, and the law applies to coarse pointers only. Alternative: apply everywhere for one mental model.

7. **Skippable long animations (law 11).** Recommendation: a tap anywhere jumps the roll moment and the win sequence to their end state. Alternative: keep them unskippable and shorten the roll moment from 900 to 600 ms.

8. **Time-boxed elements.** The HIG asks to minimise controls that auto-dismiss on a timer. Our offer countdown and the 1.6 s "Need 1 clay" hint are such elements. Recommendation: keep both (a trade needs a clock; the hint is advisory and the full sentence is also announced) and record this as a deliberate exception. Alternative: make the hint stay until the next tap.
