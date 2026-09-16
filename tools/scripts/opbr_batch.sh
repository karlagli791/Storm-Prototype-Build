#!/usr/bin/env bash
# opbr_batch.sh — unpack the One Piece: Fighting Path rips and convert them to engine GLBs.
#
#   bash tools/scripts/opbr_batch.sh [key ...]
#
# Sources live in the user's OPBR folder (zips straight from the model-rip packs). Each zip is
# unpacked into raw/opbr/ once, then opbr_import.py writes public/assets/op_<key>.glb + .json.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRCZIP="${OPBR_ZIPS:-C:/Users/ysoyo/OneDrive/Desktop/OPBR}"
RAW="$ROOT/raw/opbr"
OUT="$ROOT/public/assets"
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 4.5/blender.exe}"
SEVENZ="/c/Program Files/7-Zip/7z.exe"

mkdir -p "$RAW" "$OUT"

# key|zip glob|model path inside the extraction (relative to raw/opbr)
MODELS="
luffy|*Luffy*|Wano Country Luffy/Wano Country Luffy.dae
law|*Law*|Wano Country Law/Wano Country Law.dae
sabo|*Sabo*|Sabo/Sabo.dae
shanks|*Shanks*|Shanks/Shanks.dae
katakuri|*Katakuri*|Charlotte Katakuri/Charlotte Katakuri.dae
fujitora|*Fujitora*|Fujitora/Fujitora.dae
kuma|*Kuma*|Bartholomew Kuma/Bartholomew Kuma.dae
burgess|*Burgess*|Jesus Burgess/Jesus Burgess.dae
shiki|*Shiki*|Shiki/Shiki.dae
karasu|*Karasu*|Karasu/17004_U (Ultra)/Karasu (Ultra).dae
karasu_crow|*Karasu*|Karasu/17004_U (Ultra)/Crow/Karasu (Crow - Ultra).dae
chopper|*Chopper*|Chopper (Egghead)/19808_U (Ultra)/Chopper (Egghead) (Ultra).dae
koby|one-piece-fighting-path-koby.zip|koby/koby/12017 (merge).fbx
"

WANT="$*"
printf '%s
' "$MODELS" | while IFS='|' read -r key glob model; do
  [ -z "$key" ] && continue
  if [ -n "$WANT" ]; then case " $WANT " in *" $key "*) ;; *) continue;; esac; fi
  if [ ! -f "$RAW/$model" ]; then
    zip=$(ls "$SRCZIP"/$glob 2>/dev/null | head -1)
    if [ -z "$zip" ]; then echo "!! no zip for $key ($glob)"; continue; fi
    echo "-- unpacking $key"
    "$SEVENZ" x -y -o"$RAW" "$zip" >/dev/null
    # koby ships a nested rar
    [ -f "$RAW/source/koby.rar" ] && "$SEVENZ" x -y -o"$RAW/koby" "$RAW/source/koby.rar" >/dev/null
  fi
  [ -f "$RAW/$model" ] || { echo "!! missing model for $key: $model"; continue; }
  echo "== $key"
  "$BLENDER" -b -noaudio -P "$ROOT/tools/scripts/opbr_import.py" --     --src "$RAW/$model" --out "$OUT/op_$key.glb" --key "$key" 2>&1 | grep -E "OPBR_OK|Error:|Traceback"
done

ls -la "$OUT"/op_*.glb 2>/dev/null
