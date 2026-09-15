"""Decode NTP3 (CC2 .nut) texture blocks inside Storm 1/2/3 xfbins to PNG.
usage: python ntp3_tex2png.py <out_dir> [--swap] <file.xfbin>...
--swap byte-swaps 16-bit words of the DXT blocks (PS3/X360 big-endian dumps)."""
import sys, os, re, io, struct
from PIL import Image

FMT = {0: 'DXT1', 1: 'DXT3', 2: 'DXT5', 14: 'ARGB', 17: 'ARGB'}

def dds_header(w, h, fmt, size):
    flags = 0x1 | 0x2 | 0x4 | 0x1000 | (0x80000 if fmt.startswith('DXT') else 0x8)
    pf = struct.pack('<II4sIIIII', 32, 0x4, fmt.encode(), 0, 0, 0, 0, 0) if fmt.startswith('DXT') else \
         struct.pack('<II4sIIIII', 32, 0x41, b'\0\0\0\0', 32, 0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000)
    return b'DDS ' + struct.pack('<IIIIIII', 124, flags, h, w, size if fmt.startswith('DXT') else w * 4, 0, 1) + b'\0' * 44 + pf + struct.pack('<IIIII', 0x1000, 0, 0, 0, 0)

def decode(d, swap):
    out = []
    for m in re.finditer(b'NTP3', d):
        p = m.start()
        count = struct.unpack('>H', d[p + 6:p + 8])[0]
        q = p + 16
        for n in range(count):
            total, _, size, hdr = struct.unpack('>IIIH', d[q:q + 14])
            mips, fmt, w, h = struct.unpack('>HHHH', d[q + 16:q + 24])
            name = FMT.get(fmt, None)
            pix = d[q + hdr:q + hdr + size]
            if name is None:
                out.append((f'fmt{fmt}_{w}x{h}', None)); q += total; continue
            if name.startswith('DXT'):
                top = w * h * (1 if name == 'DXT5' or name == 'DXT3' else 0.5)
                top = int(top)
                blk = bytearray(pix[:top])
                if swap:
                    blk[0::2], blk[1::2] = pix[1:top:2], pix[0:top:2]
                blob = dds_header(w, h, name, top) + bytes(blk)
            else:
                # ARGB big-endian -> BGRA little-endian
                px = pix[:w * h * 4]
                rgba = bytearray(len(px))
                rgba[0::4] = px[1::4]; rgba[1::4] = px[2::4]; rgba[2::4] = px[3::4]; rgba[3::4] = px[0::4]
                im = Image.frombytes('RGBA', (w, h), bytes(rgba))
                out.append((f'{w}x{h}', im)); q += total; continue
            try:
                im = Image.open(io.BytesIO(blob)); im.load()
                out.append((f'{name}_{w}x{h}', im))
            except Exception as ex:
                out.append((f'{name}_{w}x{h}_fail_{ex}', None))
            q += total
    return out

if __name__ == '__main__':
    args = sys.argv[1:]
    swap = '--swap' in args
    args = [a for a in args if a != '--swap']
    outdir = args[0]; os.makedirs(outdir, exist_ok=True)
    for path in args[1:]:
        d = open(path, 'rb').read()
        base = os.path.splitext(os.path.basename(path))[0]
        res = decode(d, swap)
        for n, (tag, im) in enumerate(res):
            if im is None:
                print(base, n, tag, 'skipped'); continue
            name = f"{base}{'' if len(res) == 1 else '_' + str(n)}.png"
            im.save(os.path.join(outdir, name)); print(name, tag)
