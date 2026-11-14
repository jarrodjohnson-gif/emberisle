# Lays the four owned-3x crops (real captures from capture-fixes.mjs) side by side, labelled. No pixel of a capture is changed.
# Usage: python3 docs/design/dock-trade-marks/fixes/compare.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

here = Path(__file__).parent
labels = ["fix0: PR #1602 today", "fix1: painted boards", "fix2: bigger plank, no outline", "fix3: painted boards + real pennant"]
crops = [Image.open(here / f"fix{i}-440x956-owned-3x.png").convert("RGB") for i in range(4)]
w, h = crops[0].size
gap, top = 12, 56
strip = Image.new("RGB", (4 * w + 3 * gap, h + top), "#f4f1ea")
draw = ImageDraw.Draw(strip)
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
for i, (crop, label) in enumerate(zip(crops, labels)):
    x = i * (w + gap)
    strip.paste(crop, (x, top))
    draw.text((x + 10, 14), label, fill="#263d3c", font=font)
strip.save(here / "compare-owned-3x.png", optimize=True)
print("saved compare-owned-3x.png", strip.size)
