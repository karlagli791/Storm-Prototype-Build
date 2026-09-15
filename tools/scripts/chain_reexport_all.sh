#!/bin/bash
# After the awakened batch: re-export every playable character with the final whitelist
# (win poses, spl1_dmg victim clips, awakening clips), then regenerate PrmData.
R=/c/Users/ysoyo/OneDrive/Desktop/wan/storm4-proto
cd $R
while ! grep -q "=== DONE" tools/logs/export_awa.log 2>/dev/null; do sleep 20; done
bash tools/scripts/export_batch2.sh 2kks 2fou 3mfn 2pea 2jry 2tnd 2orc 2roc 2nej 2skr 2hnt 2ksm 2hdn 2tob 2guy 2klb 2kbt 2sgt > tools/logs/export_all2.log 2>&1
node tools/scripts/gen_prm_ts.cjs 2nrt 2ssk 2kks 2fou 2gar 2itc 2ddr 3mfn 2pea 2jry 2tnd 2orc 2roc 2nej 2skr 2hnt 2ksm 2hdn 2tob 2guy 2klb 2kbt 2sgt >> tools/logs/export_all2.log 2>&1
echo "=== CHAIN DONE $(date +%T)" >> tools/logs/export_all2.log
