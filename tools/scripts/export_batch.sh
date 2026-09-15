#!/bin/bash
# Export several Storm 4 characters headlessly (bod1 + bod1c + bod1l + skl1 [+ acc1]).
B="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
cd "$(dirname "$0")/../.."
for code in "$@"; do
  files="raw/s4/${code}bod1.xfbin raw/s4/${code}bod1c.xfbin raw/s4/${code}bod1l.xfbin raw/s4/${code}skl1.xfbin"
  [ -s raw/s4/${code}acc1.xfbin ] && files="$files raw/s4/${code}acc1.xfbin"
  echo "=== $code $(date +%T)"
  "$B" -b --python tools/scripts/export_character.py -- $code public/assets/${code}.glb $files 2>&1 | grep -i "error\|traceback\|exported\|clips\|wrote\|Exception" | tail -8
  ls -la public/assets/${code}.glb 2>/dev/null
done
echo "=== DONE $(date +%T)"
