#!/bin/bash
B="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
cd "$(dirname "$0")/../.."
for code in "$@"; do
  echo "=== $code $(date +%T)"
  "$B" -b --python tools/scripts/export_stage.py -- public/assets/stage_${code}.glb 1.68 raw/stage/${code}.xfbin 2>&1 | grep -i "error\|traceback\|EXPORTED\|wrote" | tail -4
  ls -la public/assets/stage_${code}.glb 2>/dev/null | awk '{print $5,$9}'
done
echo "=== DONE $(date +%T)"
