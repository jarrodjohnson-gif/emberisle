# Narrow lobby label measurements

Original source 72e4e3f8: 320x568 button right 297.05, row right 295; overflow 2.05 px.
Runtime 05fb5d10 reduces How to play horizontal padding from 16 to 8 px.
It preserves font, label, one line, 44 px height and at least 8 px padding.
The real hosted 320x568 and ordinary 667x375 views then fit.

At 667x375 with left/right 47 px and bottom 21 px safe-area insets:
- Current single-line button right 312.05 versus row right 285.73: 26.32 px overflow.
- Desk answered Option B on 2026-11-12.
- Option B allows two-line 76x44 px with 8 px padding at width <= 700 px in landscape.
- Option B right 281.48 fits cleanly inside row right 285.73.
- Implemented in src/components/game/lobby.css.
- 320x568, 390x844, 844x390 and 1280x720 remain single-line.
