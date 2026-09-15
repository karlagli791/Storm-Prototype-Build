"""Chroma-key the engine portrait captures (green clear colour) into tools/renders/{stand,face}_<code>.png
so build_rendered_assets.py can turn them into select/HUD art.
usage: python key_captures.py <code>..."""
import os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "public", "assets", "ui", "sel")
DST = os.path.join(ROOT, "tools", "renders")
os.makedirs(DST, exist_ok=True)

def key(im):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # greenness: how far green exceeds the other channels
            excess = g - max(r, b)
            if excess > 90 and g > 150:
                px[x, y] = (r, g, b, 0)
            elif excess > 30 and g > 120:
                # soft edge: fade alpha and despill green
                t = (excess - 30) / 60.0
                alpha = int(255 * (1 - t))
                gg = max(r, b)
                px[x, y] = (r, gg, b, alpha)
    return im

for code in sys.argv[1:]:
    for kind in ("stand", "face"):
        src = os.path.join(SRC, f"cap_{kind}_{code}.png")
        if not os.path.exists(src):
            print("missing", src); continue
        out = key(Image.open(src))
        out.save(os.path.join(DST, f"{kind}_{code}.png"))
        os.remove(src)
        print("keyed", kind, code, out.size)
