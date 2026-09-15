"""Extract the motion table of a Storm 4 character parameter file (<code>prm.bin.xfbin, decrypted on
the Drive) into JSON: every PL_ANM entry with its clip and hit records.

Layout (little-endian, worked out in session 6 — see CONTINUER §3):
  anim record, 212 bytes: name[32] clip[32] ... u16 fields @80 (hdr) ... cancel name @116
  sub records, 288 bytes each until the next anim record. A hit record has the bone name @64,
  the DAMAGE_ID @128, u16 s[8] @32 (s[0] = frame the previous box hands over / hit order),
  u16 t[8] @96 (t[0] = active start frame at 30 fps, t[2] = damage), f32 f[8] @192
  (f[2] = box radius, f[4] = knockback power, f[5] = scale).

usage: python prm_dump.py <out_dir> <code>...
"""
import os, re, sys, json, struct

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out_dir = sys.argv[1]; os.makedirs(out_dir, exist_ok=True)

def cstr(b): return b.split(b'\0', 1)[0].decode(errors='replace')

for code in sys.argv[2:]:
    path = os.path.join(ROOT, 'raw', 's4', 'prm', f'{code}prm.bin.xfbin')
    d = open(path, 'rb').read()
    ver = d.find(b'ver0.000\x00')
    base = ver + 64 if ver >= 0 else 0
    anims = [m.start() for m in re.finditer(rb'PL_ANM_[A-Z0-9_]+\x00', d)
             if m.start() >= base and re.match(rb'[0-9a-zA-Z]{4}[a-z0-9_]+\x00', d[m.start() + 32:m.start() + 64])]
    entries = []
    for i, a in enumerate(anims):
        end = anims[i + 1] if i + 1 < len(anims) else len(d)
        name = cstr(d[a:a + 32]); clip = cstr(d[a + 32:a + 64])
        hdr = list(struct.unpack('<16H', d[a + 80:a + 112]))
        cancel = cstr(d[a + 116:a + 148])
        region = d[a + 212:end]
        hits = []
        # A hit record is located by its DAMAGE_ID string (@128): the bone (@64) can be a body bone
        # ('2nrt00t0 r hand'), a weapon bone ('ksng_under', 'trall') or an effect dummy ('1efc_dmy01_01').
        seen = set()
        for m in re.finditer(rb'(DAMAGE_ID_|DMG_|DAMAGE_)[A-Za-z0-9_]+\x00', region):
            hs = m.start() - 128
            if hs < 0 or hs + 288 > len(region) or hs in seen: continue
            seen.add(hs)
            h = region[hs:hs + 288]
            if not re.match(rb'[ -~]{2,}\x00', h[64:128]): continue  # no bone name = not a hit box
            s = list(struct.unpack('<8H', h[32:48])); t = list(struct.unpack('<8H', h[96:112]))
            f = [round(x, 3) for x in struct.unpack('<8f', h[192:224])]
            hits.append({'bone': cstr(h[64:128]), 'dmgId': cstr(h[128:192]), 'order': s[0], 'flags': s[1], 'start': t[0], 'damage': t[2], 'radius': f[2], 'power': f[4], 'scale': f[5]})
        entries.append({'anm': name, 'clip': clip, 'hdr': hdr[:10], 'cancel': cancel, 'hits': hits})
    json.dump({'code': code, 'entries': entries}, open(os.path.join(out_dir, f'{code}.json'), 'w'), indent=0)
    atk = [e for e in entries if 'ATK' in e['anm']]
    print(code, len(entries), 'entries,', len(atk), 'attack entries;', ' '.join(f"{e['anm'].replace('PL_ANM_','')}={e['clip']}" for e in atk[:14]))
