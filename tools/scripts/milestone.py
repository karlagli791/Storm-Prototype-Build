"""Append a dated milestone to CONTINUER.md and commit it.
usage: python tools/scripts/milestone.py "What was achieved" [--no-commit]
"""
import subprocess, sys, datetime, os, re
root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
path = os.path.join(root, "CONTINUER.md")
text = " ".join(a for a in sys.argv[1:] if not a.startswith("--")).strip()
if not text:
    raise SystemExit("usage: milestone.py \"text\" [--no-commit]")
content = open(path, encoding="utf-8").read()
marker = "## 5. How this file updates itself"
stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
# number the milestone after the last numbered item in section 4
nums = [int(m) for m in re.findall(r"^(\d+)\. ", content.split(marker)[0], flags=re.M)]
n = (max(nums) + 1) if nums else 1
entry = f"{n}. [{stamp}] {text}\n\n"
head, tail = content.split(marker, 1)
head = head.rstrip("\n") + "\n" + entry + "---\n\n"
open(path, "w", encoding="utf-8").write(head + marker + tail)
print("milestone", n, "added")
if "--no-commit" not in sys.argv:
    subprocess.run(["git", "add", path], check=True)
    subprocess.run(["git", "commit", "-q", "-m", f"milestone: {text[:60]}"], check=True, env={**os.environ, "CONTINUER_SKIP": "1"})
    print("committed")
