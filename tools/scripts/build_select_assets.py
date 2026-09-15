"""Assemble the character-select / HUD art for the roster from the decoded Storm 2/3 UI textures.

Inputs (decoded earlier with ntp3_tex2png.py / xfbin_tex2png.py):
  C:/Users/ysoyo/storm2proto/ui_s2/sel/sel1_*.png            Storm 2 chara_sel/sel1.xfbin pieces
  C:/Users/ysoyo/storm2proto/ui_s2/sel/sel1_stand_2all_N.png  Storm 2 full-body "stand" art (alphabetical code order)
  C:/Users/ysoyo/storm2proto/ui_s2/vs/vs_<code>.png           Storm 2 versus face art (1052x1112)
  C:/Users/ysoyo/storm2proto/ui_s2/duel/player_<code>_0.png   Storm 2 HUD face medallions
  C:/Users/ysoyo/storm2proto/ui_s3/*.png                      Storm 3 crsel icons / player faces (Mifune)
Outputs: public/assets/ui/sel/{bg.png,title.png,frame_*.png,icon_<code>.png,stand_<code>.png,vs_<code>.png}
         public/assets/ui/player_<code>.png
"""
import os, sys
from PIL import Image

S2 = r"C:/Users/ysoyo/storm2proto/ui_s2"
S3 = r"C:/Users/ysoyo/storm2proto/ui_s3"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "assets", "ui", "sel")
HUD = os.path.join(ROOT, "public", "assets", "ui")
os.makedirs(OUT, exist_ok=True)

# Storm 2 face_vs code order (48) minus the three non-playable variants that have no stand art.
FACE_ORDER = "2asm 2cyb 2ddr 2fou 2gar 2guy 2hdn 2hnt 2ino 2itc 2jry 2jug 2kar 2kbt 2kib 2kks 2klb 2klv 2knk 2knn 2ksm 2kzu 2lar 2nej 2nrb 2nrt 2nrv 2nrx 2nrz 2orc 2pea 2peb 2roc 2sai 2sco 2sgt 2sik 2sin 2skr 2ssk 2ssx 2ssy 2ten 2tmr 2tnd 2tob 2tyo 2ymt".split()
STAND_ORDER = [c for c in FACE_ORDER if c not in ("2nrb", "2nrz", "2peb")]

# sel1_10.png: 11 x 5 grid of framed 128 px icons (Storm 2 roster order)
ICON_CELLS = {"2nrt": (0, 0), "2ssk": (0, 5), "2gar": (1, 6), "2ddr": (2, 1), "2kks": (2, 2), "2itc": (3, 2), "2fou": (3, 3)}
ROSTER = ["2nrt", "2ssk", "2ddr", "2gar", "2itc", "2kks", "2fou"]

def crop_alpha(im, box):
    cell = im.crop(box)
    bbox = cell.getchannel("A").getbbox()
    return cell.crop(bbox) if bbox else cell

def save(im, path, size=None):
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(path, optimize=True)
    print(os.path.relpath(path, ROOT), im.size)

# --- static pieces -------------------------------------------------------------------------
bg = Image.open(f"{S2}/sel/sel1_0.png").convert("RGBA")
save(bg, f"{OUT}/bg.png", (1024, 1024))
title = Image.open(f"{S2}/vs/sel1_text_0.png").convert("RGBA")
save(crop_alpha(title, (0, 0) + title.size), f"{OUT}/title.png")
pieces = Image.open(f"{S2}/sel/sel1_2.png").convert("RGBA")
# name plate (top-left banner), frame (hexagonal white frame), red brush, wide plate
save(crop_alpha(pieces, (0, 0, 460, 110)), f"{OUT}/plate_name.png")
save(crop_alpha(pieces, (520, 0, 760, 180)), f"{OUT}/frame_hex.png")
save(crop_alpha(pieces, (0, 110, 480, 220)), f"{OUT}/brush_red.png")
save(crop_alpha(pieces, (780, 0, 1240, 110)), f"{OUT}/brush_black.png")
save(crop_alpha(pieces, (20, 240, 800, 384)), f"{OUT}/plate_wide.png")
save(crop_alpha(pieces, (840, 260, 1400, 360)), f"{OUT}/plate_mid.png")
# cursor glows (hexes) and 1P/2P digits
save(crop_alpha(pieces, (870, 195, 920, 245)), f"{OUT}/hex_red.png")
save(crop_alpha(pieces, (915, 195, 960, 245)), f"{OUT}/hex_cyan.png")
save(crop_alpha(pieces, (960, 195, 1005, 245)), f"{OUT}/hex_purple.png")
save(crop_alpha(pieces, (1495, 0, 1536, 50)), f"{OUT}/num_1p.png")
save(crop_alpha(pieces, (1495, 45, 1536, 95)), f"{OUT}/num_2p.png")

# --- per-character pieces -----------------------------------------------------------------
icons = Image.open(f"{S2}/sel/sel1_10.png").convert("RGBA")
# measured bands: 125 px framed icons on a 135 px pitch starting at (5, 5)
PITCH, SIZE, ORG = 135, 125, 5
for code in ROSTER:
    r, c = ICON_CELLS[code]
    box = (ORG + c * PITCH, ORG + r * PITCH, ORG + c * PITCH + SIZE, ORG + r * PITCH + SIZE)
    save(icons.crop(box), f"{OUT}/icon_{code}.png", (128, 128))
    idx = STAND_ORDER.index(code)
    stand = Image.open(f"{S2}/sel/sel1_stand_2all_{idx}.png").convert("RGBA")
    stand = crop_alpha(stand, (0, 0) + stand.size)
    h = 900; w = int(stand.width * h / stand.height)
    save(stand, f"{OUT}/stand_{code}.png", (w, h))
    vs = Image.open(f"{S2}/vs/vs_{code}.png").convert("RGBA")
    save(vs, f"{OUT}/vs_{code}.png", (526, 556))
    face = f"{S2}/duel/player_{code}_0.png"
    if os.path.exists(face) and not os.path.exists(f"{HUD}/player_{code}.png"):
        save(Image.open(face).convert("RGBA"), f"{HUD}/player_{code}.png")

# Mifune (Storm 3 UI): 128 px select icon and 256 px HUD face
mf = Image.open(f"{S3}/crsel_3mfn.png").convert("RGBA")
save(mf, f"{OUT}/icon_3mfn.png", (128, 128))
save(Image.open(f"{S3}/player_3mfn.png").convert("RGBA"), f"{HUD}/player_3mfn.png", (192, 192))
print("done")
