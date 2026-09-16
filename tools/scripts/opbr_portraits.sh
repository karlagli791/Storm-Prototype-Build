#!/usr/bin/env bash
# opbr_portraits.sh — select-screen art for the One Piece fighters.
#
#   bash tools/scripts/opbr_portraits.sh [key ...]
#
# Renders each converted model with the same cel look as the rest of the roster
# (render_portraits.py), then crops the results into the four sizes the UI wants:
#   sel/stand_op_<key>.png, sel/vs_op_<key>.png, sel/icon_op_<key>.png, player_op_<key>.png
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 4.5/blender.exe}"
TMP="$ROOT/tools/logs/opbr_art"
UI="$ROOT/public/assets/ui"
mkdir -p "$TMP" "$UI/sel"

KEYS="${*:-luffy law sabo shanks katakuri fujitora kuma burgess shiki karasu koby chopper}"
for key in $KEYS; do
  glb="$ROOT/public/assets/op_$key.glb"
  [ -f "$glb" ] || { echo "!! no model for $key"; continue; }
  echo "== $key"
  # Gear-4 limbs, mochi weapons and detached props are hidden in game; keep them out of the art too.
  strip='Weapon_0[238]|15025_0[345]_Weapon|11043_Weapon|_LOD|shadow'
  "$BLENDER" -b -noaudio -P "$ROOT/tools/scripts/render_portraits.py" -- "op_$key" "$TMP" "$glb" --strip "$strip" --head 2>&1 | grep -E "RENDERED|STRIP|Error|Traceback"
done
python "$ROOT/tools/scripts/opbr_portraits.py" "$TMP" "$UI" $KEYS
