# Narrow lobby label measurements

Original source72e4e3f8: 320x568 button right297.05, row right295; overflow2.05 px.
Runtime05fb5d10 reduces How to play horizontal padding from16 to8 px.
It preserves font, label, one line,44 px height and at least8 px padding.
The real hosted320x568 and ordinary667x375 views then fit.

At667x375 with left/right47 px and bottom21 px safe-area insets:
- Current single-line button right312.05 versus row right285.73:26.32 px overflow.
- Browser-only option B:76 px width,44 px height, two lines using the existing Play games pattern.
- Option B right281.48, inside the row; it is NOT implemented in runtime.
-320x568,390x844,844x390 and1280x720 remain one-line cases under the proposed narrow-landscape-only rule.

The options pictures are real hosted UI with temporary inline sizing, not production implementation or owner acceptance.
The capture script identifies the exact temporary overrides. JSON files preserve the measured boxes.
No assertion, tolerance, deadline or budget was changed. The original failed permanent proof is retained.
A repository Question requests the remaining layout decision; all independent approved work continues.
