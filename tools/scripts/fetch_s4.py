"""Download Storm 4 character containers from the shared Drive into raw/s4.

  python tools/scripts/fetch_s4.py [--parts bod1,bod1c,...] <code>...

Folder listings are cached in tools/logs/drive_<folder>.json. Missing parts are skipped with a
note (acc1 / spl1 are optional for some characters).
"""
import os, sys, json, subprocess, time
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'scripts'))
from drive_ls import ls  # noqa

FOLDERS = {
    'bod1': '1VNDItYKRhhC72M4VuOyHHzC77HmnnQXf', 'bod1c': '1wRgC45C8hjfOuhKGAVx6WJcGqPGGfqd6',
    'bod1l': '1mRQakbsNfvDPi6GpoBz5XUOQ9gxiTMkL', 'acc1': '16n0DdpqL6ZC4NYxJHF-uzu_p9zdBbGAo',
    'skl1': '1ha-ZKkWxC0cNWmd_gmmQC1CKfXeICBlW', 'spl1': '1yboJcBl6f0dOE9ZUIAfoxndjWzQdaw-G',
    'prm': '1ew2JWD6xvvxXeaq_zw-hy5RD8gDN8C28', 'awa': '1Izy5aaS7KRwLj_mMh7re8tF5ppy2GAaA',
    'aws': '1ooj5Zb2kas6VnqJQXtjQLkj9hg6d3aSr', 'bod1s': '1xx5RosX1PIHBFbnPDgdP__PzWqwJhhLR',
}
LOGS = os.path.join(ROOT, 'tools', 'logs'); os.makedirs(LOGS, exist_ok=True)

def listing(part):
    cache = os.path.join(LOGS, f'drive_{part}.json')
    if os.path.exists(cache):
        return json.load(open(cache))
    for attempt in range(3):
        try:
            rows = ls(FOLDERS[part])
            m = {name: fid for fid, name, size, is_dir in rows}
            json.dump(m, open(cache, 'w'), indent=0)
            return m
        except Exception as e:
            print('listing failed', part, e); time.sleep(3)
    return {}

def fetch(fid, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1024:
        return 'have'
    import re, html, urllib.request
    for attempt in range(3):
        try:
            op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
            data = op.open(f'https://drive.google.com/uc?export=download&id={fid}').read()
            if data[:4] != b'NUCC' and b'<html' in data[:300].lower():
                page = data.decode('utf-8', 'replace')
                form = re.search(r'action="([^"]+)"', page)
                fields = dict(re.findall(r'name="([^"]+)" value="([^"]*)"', page))
                u = html.unescape(form.group(1)) + '?' + '&'.join(f'{k}={v}' for k, v in fields.items())
                with op.open(u) as r, open(dest, 'wb') as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk: break
                        f.write(chunk)
            else:
                open(dest, 'wb').write(data)
            with open(dest, 'rb') as f: head = f.read(4)
            if head == b'NUCC' or (head[:1] != b'<' and os.path.getsize(dest) > 512): return 'ok'
            os.remove(dest)
        except Exception as e:
            print('  retry', e)
        time.sleep(2)
    return 'FAILED'

args = sys.argv[1:] if __name__ == "__main__" else []
parts = ['bod1', 'bod1c', 'bod1l', 'skl1', 'acc1', 'spl1', 'prm']
if args and args[0] == '--parts':
    parts = args[1].split(','); args = args[2:]
for code in args:
    for part in parts:
        m = listing(part)
        if part == 'prm':
            name = f'{code}prm.bin.xfbin'; dest = os.path.join(ROOT, 'raw', 's4', 'prm', name)
        else:
            name = f'{code}{part}.xfbin'; dest = os.path.join(ROOT, 'raw', 's4', name)
        fid = m.get(name)
        if not fid:
            print(f'{code} {part}: not on drive'); continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        st = fetch(fid, dest)
        print(f'{code} {part}: {st} {os.path.getsize(dest) // 1024 if os.path.exists(dest) else 0} KB', flush=True)
if __name__ == '__main__': print('DONE')
