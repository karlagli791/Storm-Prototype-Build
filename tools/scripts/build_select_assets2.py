"""Select-screen / HUD art for additional roster codes from the decoded Storm 2 UI textures.
usage: python build_select_assets2.py <code>...
Icons: sel1_10.png grid cells (row, col) mapped by hand from the contact sheet; stands and versus
faces come from the Storm 2 face order; HUD faces from ui_s2/duel/player_<code>_0.png when present.
"""
import os, sys
from PIL import Image
S2 = r"C:/Users/ysoyo/storm2proto/ui_s2"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "assets", "ui", "sel"); HUD = os.path.join(ROOT, "public", "assets", "ui")
FACE_ORDER = "2asm 2cyb 2ddr 2fou 2gar 2guy 2hdn 2hnt 2ino 2itc 2jry 2jug 2kar 2kbt 2kib 2kks 2klb 2klv 2knk 2knn 2ksm 2kzu 2lar 2nej 2nrb 2nrt 2nrv 2nrx 2nrz 2orc 2pea 2peb 2roc 2sai 2sco 2sgt 2sik 2sin 2skr 2ssk 2ssx 2ssy 2ten 2tmr 2tnd 2tob 2tyo 2ymt".split()
STAND_ORDER = [c for c in FACE_ORDER if c not in ("2nrb", "2nrz", "2peb")]
ICON_CELLS = {
    "2nrt": (0, 0), "2skr": (0, 1), "2sai": (0, 2), "2kar": (0, 3), "2sgt": (0, 4), "2ssk": (0, 5), "2nej": (0, 6), "2roc": (0, 7), "2ten": (0, 8), "2jug": (0, 9), "2kbt": (0, 10),
    "2orc": (1, 0), "2sik": (1, 1), "2ino": (1, 2), "2tyo": (1, 3), "2tmr": (1, 4), "2knk": (1, 5), "2gar": (1, 6), "2sin": (1, 7), "2kib": (1, 8), "2hnt": (1, 9), "2cyb": (1, 10),
    "2sco": (2, 0), "2ddr": (2, 1), "2kks": (2, 2), "2ymt": (2, 3), "2guy": (2, 4), "2tob": (2, 5), "2kzu": (2, 6), "2hdn": (2, 7), "2asm": (2, 8), "2jry": (2, 9), "2tnd": (2, 10),
    "2knn": (3, 0), "2ksm": (3, 1), "2itc": (3, 2), "2fou": (3, 3), "2lar": (3, 4), "2nrx": (3, 5), "2ssx": (3, 6),
    "2nry": (4, 0), "2ssy": (4, 1), "2klb": (4, 2), "2pea": (4, 3), "2nrv": (4, 4),
}
PITCH, SIZE, ORG = 135, 125, 5
icons = Image.open(f"{S2}/sel/sel1_10.png").convert("RGBA")
def crop_alpha(im):
    bbox = im.getchannel("A").getbbox(); return im.crop(bbox) if bbox else im
def save(im, path, size=None):
    if size: im = im.resize(size, Image.LANCZOS)
    im.save(path, optimize=True); print(os.path.relpath(path, ROOT), im.size)
for code in sys.argv[1:]:
    r, c = ICON_CELLS[code]
    save(icons.crop((ORG + c * PITCH, ORG + r * PITCH, ORG + c * PITCH + SIZE, ORG + r * PITCH + SIZE)), f"{OUT}/icon_{code}.png", (128, 128))
    if code in STAND_ORDER:
        stand = crop_alpha(Image.open(f"{S2}/sel/sel1_stand_2all_{STAND_ORDER.index(code)}.png").convert("RGBA"))
        h = 900; save(stand, f"{OUT}/stand_{code}.png", (int(stand.width * h / stand.height), h))
    vs = f"{S2}/vs/vs_{code}.png"
    if os.path.exists(vs): save(Image.open(vs).convert("RGBA"), f"{OUT}/vs_{code}.png", (526, 556))
    face = f"{S2}/duel/player_{code}_0.png"
    if os.path.exists(face): save(Image.open(face).convert("RGBA"), f"{HUD}/player_{code}.png")
    else: print('no HUD face for', code)
print("done")
