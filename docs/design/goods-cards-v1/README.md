# Goods cards: V1 Column (the owner's pick)

Jarrod picked V1 on 2026-10-20 for #773. It follows the #772 decision.

## Files

- `v1.html` with `base.css` and `cards.js`: the static mock. Open it in a browser.
- `demo-fragment.html`: the live animation, with buttons for gain, loss and roll, and a reduced-motion toggle.
- `v1-*.png`: renders at 390 px wide, 2x. They show rest, gain, loss, reduced motion and 3x zooms.

## The look

- Size: 66.8 x 62 px, the same footprint as today. The map never refits.
- Layout: one vertical axis. An 18 px symbol, a 24 px tabular count, and a 10 px tracked uppercase name.
- Centring: the count, symbol and name sit within 0.01 px of the card centre. Keep it exact.
- Rest: a paper face with a 1 px edge in the good's colour.
- Gain: the card fills with the full good colour, gets a 1 px dark ring and a soft shadow, and lifts. The +N is a tab growing out of the card's top edge, in the good's side colour.
- Gain timing: the fill holds for about 2.2 s (FLASH_MS), then fades over 300 ms.
- Loss: the card dips. The −N is a hollow red tab.
- Pictures: the current symbols for Wood, Brick, Wheat and Stone. Sheep is the new two-tone illustration in `cards.js`.
- Reduced motion: no lift or dip. The card shows a still fill for the same time.

## Measured contrast

- Count on paper: 11.05:1.
- Count on the Wood fill: 6.37:1. Count on the Sheep fill: 6.63:1.
- Names: 5.7 to 6.4:1.
- +N tab: 11.96:1.

## Still open

- The sideways 844x390 layout needs its own pass. It is not rendered here.
- The motion code in Gemini's closed PR #888, on branch `gemini/773-goods-card-look`, may be reused. That is the lift and dip, the WAAPI checks in hand-cards-prove, and the GainFloats removal. The look must match this mock.
