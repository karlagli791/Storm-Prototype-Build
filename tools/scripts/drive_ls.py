"""List a public Google Drive folder via the static embedded folder view (no virtualization)."""
import re, sys, urllib.request, html
def ls(folder_id):
    url = f"https://drive.google.com/embeddedfolderview?id={folder_id}#list"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    out = []
    chunks = re.split(r'<div class="flip-entry" id="entry-', data)[1:]
    for chunk in chunks:
        eid = chunk.split('"', 1)[0]; body = chunk
        title = re.search(r'<div class="flip-entry-title">(.*?)</div>', body, re.S)
        size = re.search(r'<div class="flip-entry-size">(.*?)</div>', body, re.S)
        is_folder = 'drive.google.com/drive/folders/' in body.split('flip-entry-title')[0] or '/folders/' in body[:600]
        out.append((eid, html.unescape(title.group(1).strip()) if title else '?', size.group(1).strip() if size else '', is_folder))
    return out
if __name__ == "__main__":
    fid = sys.argv[1]; pat = re.compile(sys.argv[2]) if len(sys.argv) > 2 else None
    rows = ls(fid)
    print(f"# {len(rows)} entries")
    for eid, name, size, isf in rows:
        if pat and not pat.search(name): continue
        print(f"{eid}\t{name}\t{size}\t{'DIR' if isf else ''}")
