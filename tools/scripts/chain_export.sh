#!/bin/bash
# Wait for the running export batch to finish, then re-export everything with the side-throw clips.
R=/c/Users/ysoyo/OneDrive/Desktop/wan/storm4-proto
while ! grep -q "=== DONE" $R/tools/logs/export_batch_itm.log 2>/dev/null; do sleep 20; done
bash $R/tools/scripts/export_batch2.sh 2nrt 2ssk 2kks 2fou 2gar 2itc 2ddr 3mfn > $R/tools/logs/export_batch2.log 2>&1
