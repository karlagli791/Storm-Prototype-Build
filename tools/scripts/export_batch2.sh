#!/bin/bash
# Like export_batch.sh but takes the *largest* copy of each body container (raw/ vs raw/s4/):
# the vanilla Storm 4 dumps in raw/ hold Naruto's launcher (cmb12/13) and side-throw (itl0/itr0) clips
# that the trimmed raw/s4 copies lack.
B="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
cd "$(dirname "$0")/../.."
pick() { # prints the larger of raw/$1 and raw/s4/$1
  local a="raw/$1" b="raw/s4/$1"
  if [ -s "$a" ] && { [ ! -s "$b" ] || [ $(stat -c%s "$a") -gt $(stat -c%s "$b") ]; }; then echo "$a"; elif [ -s "$b" ]; then echo "$b"; fi
}
for code in "$@"; do
  files=""
  for part in bod1 bod1c bod1l skl1 acc1 spl1 awa aws; do f=$(pick ${code}${part}.xfbin); [ -n "$f" ] && files="$files $f"; done
  echo "=== $code $(date +%T) :$files"
  "$B" -b --python tools/scripts/export_character.py -- $code public/assets/${code}.glb $files 2>&1 | grep -i "error\|traceback\|exported\|clips\|wrote\|Exception" | tail -8
  ls -la public/assets/${code}.glb 2>/dev/null
done
echo "=== DONE $(date +%T)"
