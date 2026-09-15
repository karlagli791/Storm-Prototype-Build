"""Download named files from a Drive folder: fetch_drive.py <folderId> <destDir> <name>..."""
import os, sys, json, time
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'scripts'))
from drive_ls import ls
import fetch_s4  # noqa (patched fetch handles the interstitial)
folder, dest = sys.argv[1], sys.argv[2]
os.makedirs(dest, exist_ok=True)
cache = os.path.join(ROOT, 'tools', 'logs', f'drive_{folder}.json')
if os.path.exists(cache): m = json.load(open(cache))
else:
    m = {name: fid for fid, name, size, is_dir in ls(folder)}; json.dump(m, open(cache, 'w'))
for name in sys.argv[3:]:
    fid = m.get(name)
    if not fid: print(name, 'not on drive'); continue
    st = fetch_s4.fetch(fid, os.path.join(dest, name))
    print(name, st, os.path.getsize(os.path.join(dest, name)) // 1024 if os.path.exists(os.path.join(dest, name)) else 0, 'KB', flush=True)
print('DONE')
