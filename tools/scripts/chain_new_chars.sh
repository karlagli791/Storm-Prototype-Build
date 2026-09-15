#!/bin/bash
# After fetch_s4 finishes: export bodies, ultimate + jutsu cameras, dump prm and regenerate PrmData.
R=/c/Users/ysoyo/OneDrive/Desktop/wan/storm4-proto
cd $R
while ! grep -q "^DONE" tools/logs/fetch_s4.log 2>/dev/null; do sleep 20; done
while ! grep -q "^DONE" tools/logs/fetch_s4b.log 2>/dev/null; do sleep 20; done
CODES="2pea 2jry 2tnd 2orc 2roc 2nej 2skr 2hnt 2ksm 2hdn 2tob 2guy 2klb 2kbt 2sgt"
bash tools/scripts/export_batch2.sh $CODES > tools/logs/export_new.log 2>&1
bash tools/scripts/export_ult_cams.sh $CODES > tools/logs/ultcams_new.log 2>&1
bash tools/scripts/export_skl_cams.sh $CODES > tools/logs/sklcams_new.log 2>&1
python tools/scripts/prm_dump.py public/assets/prm $CODES > tools/logs/prm_new.log 2>&1
echo "=== CHAIN DONE $(date +%T)" >> tools/logs/export_new.log
