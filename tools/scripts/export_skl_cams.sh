#!/bin/bash
# Jutsu demo cameras (skl1 containers) -> public/assets/ult/<code>_skl.json
B="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
cd "$(dirname "$0")/../.."
for code in "$@"; do
  echo "=== $code $(date +%T)"
  CAM_ACTIONS="${code}skl\w*atk" "$B" -b --python tools/scripts/export_ultimate_camera.py -- $code public/assets/ult/${code}_skl.json raw/s4/${code}bod1.xfbin raw/s4/${code}skl1.xfbin 2>&1 | grep "CAMERA\|WROTE\|NO CAMERA\|Error" | head -8
done
echo "=== DONE $(date +%T)"
