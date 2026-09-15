"""Extract DDS payloads from CC2 texture xfbins (PC builds store raw 'DDS ' blocks) and save PNGs.
usage: python xfbin_tex2png.py <out_dir> <file.xfbin>..."""
import sys, os, re, io, struct
from PIL import Image

MAGIC = re.escape(b'DDS ' + struct.pack('<I', 124))
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for path in sys.argv[2:]:
    d = open(path, 'rb').read()
    starts = [m.start() for m in re.finditer(MAGIC, d)]
    base = os.path.splitext(os.path.basename(path))[0]
    for n, s in enumerate(starts):
        e = starts[n + 1] if n + 1 < len(starts) else len(d)
        try:
            im = Image.open(io.BytesIO(d[s:e]))
            im.load()
            name = f"{base}{'' if len(starts) == 1 else '_' + str(n)}.png"
            im.save(os.path.join(out, name))
            print(name, im.size, im.mode)
        except Exception as ex:
            print(path, 'dds', n, 'failed', ex)
