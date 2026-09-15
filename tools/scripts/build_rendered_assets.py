"""Turn the Blender portrait renders (tools/renders/{stand,face}_<code>.png) into the select-screen
and HUD art for characters that have no Storm 2 UI textures: framed 128 px icon on the Storm 2
teal gradient, full-body stand (cropped, 900 px tall), versus face (526x556) and 192 px HUD medallion.
usage: python build_rendered_assets.py <code>..."""
import os, sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REN = os.path.join(ROOT, "tools", "renders")
SEL = os.path.join(ROOT, "public", "assets", "ui", "sel")
HUD = os.path.join(ROOT, "public", "assets", "ui")

def teal_bg(size):
    """Storm 2 icon backdrop: vertical teal gradient with a soft light band."""
    im = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(im)
    for y in range(size):
        t = y / (size - 1)
        r = int(70 + 60 * t); g = int(150 + 30 * (1 - t)); b = int(160 + 20 * (1 - t))
        d.line([(0, y), (size, y)], fill=(r, g, b, 255))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-size * 0.2, size * 0.1, size * 1.2, size * 0.9], fill=(255, 255, 255, 60))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(size * 0.12)))
    return im

def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def crop_alpha(im):
    b = im.getchannel("A").getbbox()
    return im.crop(b) if b else im

for code in sys.argv[1:]:
    stand = crop_alpha(Image.open(f"{REN}/stand_{code}.png").convert("RGBA"))
    face = crop_alpha(Image.open(f"{REN}/face_{code}.png").convert("RGBA"))
    # stand: 900 px tall like the Storm 2 art
    h = 900; w = int(stand.width * h / stand.height)
    stand.resize((w, h), Image.LANCZOS).save(f"{SEL}/stand_{code}.png", optimize=True)
    # versus face: head + shoulders, 526x556 with the face in the upper-middle
    vs = Image.new("RGBA", (526, 556), (0, 0, 0, 0))
    fh = 470; fw = int(face.width * fh / face.height)
    f2 = face.resize((fw, fh), Image.LANCZOS)
    vs.alpha_composite(f2, ((526 - fw) // 2, 40))
    vs.save(f"{SEL}/vs_{code}.png", optimize=True)
    # icon: face on teal, rounded 128 with a light frame
    icon = teal_bg(128)
    ih = 150; iw = int(face.width * ih / face.height)
    f3 = face.resize((iw, ih), Image.LANCZOS)
    icon.alpha_composite(f3, ((128 - iw) // 2, -4))
    icon.putalpha(rounded_mask(128, 16))
    frame = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle([1, 1, 126, 126], radius=16, outline=(235, 240, 245, 230), width=4)
    icon.alpha_composite(frame)
    icon.save(f"{SEL}/icon_{code}.png", optimize=True)
    # HUD medallion: 192 px, circular, teal backdrop
    med = teal_bg(192)
    mh = 230; mw = int(face.width * mh / face.height)
    med.alpha_composite(face.resize((mw, mh), Image.LANCZOS), ((192 - mw) // 2, -10))
    circ = Image.new("L", (192, 192), 0); ImageDraw.Draw(circ).ellipse([0, 0, 191, 191], fill=255)
    med.putalpha(circ)
    med.save(f"{HUD}/player_{code}.png", optimize=True)
    print(code, "stand", (w, h), "icon/vs/medallion written")
