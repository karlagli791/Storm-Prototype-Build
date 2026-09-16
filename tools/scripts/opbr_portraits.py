"""opbr_portraits.py — cut the rendered One Piece art into the sizes the UI uses.

Input: the renders written by render_portraits.py (`stand_op_<key>.png`, `face_op_<key>.png`).
Output, matching the Storm 2 select art already in the roster:
  sel/stand_op_<key>.png  full body, trimmed, 495x900-ish
  sel/vs_op_<key>.png     bust for the VS splash
  sel/icon_op_<key>.png   128 px grid icon on the teal gradient
  player_op_<key>.png     192 px HUD medallion
"""
import os, sys
from PIL import Image, ImageDraw

src_dir, ui_dir = sys.argv[1], sys.argv[2]
keys = sys.argv[3:]
sel_dir = os.path.join(ui_dir, 'sel')
os.makedirs(sel_dir, exist_ok=True)


def trim(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def fit(im, w, h):
    """Contain `im` inside w x h without distorting it."""
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    k = min(w / im.width, h / im.height)
    r = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    out.paste(r, ((w - r.width) // 2, h - r.height), r)
    return out


def gradient(w, h, top=(28, 74, 96), bottom=(12, 26, 40)):
    g = Image.new('RGBA', (w, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=(
            int(top[0] + (bottom[0] - top[0]) * t),
            int(top[1] + (bottom[1] - top[1]) * t),
            int(top[2] + (bottom[2] - top[2]) * t), 255))
    return g


def circle_mask(size):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size - 1, size - 1), fill=255)
    return m


made = 0
for key in keys:
    code = f'op_{key}'
    stand_p = os.path.join(src_dir, f'stand_{code}.png')
    face_p = os.path.join(src_dir, f'face_{code}.png')
    if not os.path.exists(stand_p):
        print(f'!! no render for {code}')
        continue
    stand = trim(Image.open(stand_p).convert('RGBA'))
    stand.resize((int(stand.width * 900 / stand.height), 900), Image.LANCZOS).save(os.path.join(sel_dir, f'stand_{code}.png'))

    face = trim(Image.open(face_p).convert('RGBA')) if os.path.exists(face_p) else stand
    # A model with stray geometry throws the face framing off (Koby's rip measures 112 units
    # deep); when the close-up came back nearly empty, crop the head out of the full body instead.
    alpha = face.getchannel('A')
    covered = sum(alpha.point(lambda v: 1 if v > 40 else 0).getdata()) / max(1, face.width * face.height)
    if covered < 0.06:
        face = stand.crop((0, 0, stand.width, int(stand.height * 0.3)))
        face = trim(face)
    # VS splash: head and shoulders, generous margin.
    vs = fit(face, 526, 556)
    vs.save(os.path.join(sel_dir, f'vs_{code}.png'))

    # Grid icon: the face on the teal gradient the Storm 2 icons use.
    icon = gradient(128, 128)
    icon.alpha_composite(fit(face, 128, 126))
    icon.save(os.path.join(sel_dir, f'icon_{code}.png'))

    # HUD medallion: circular crop of the same face.
    med = gradient(192, 192, (40, 52, 74), (14, 18, 28))
    med.alpha_composite(fit(face, 192, 190))
    med.putalpha(circle_mask(192))
    med.save(os.path.join(ui_dir, f'player_{code}.png'))
    made += 1
    print(f'   art: {code}')
print(f'DONE {made} characters')
