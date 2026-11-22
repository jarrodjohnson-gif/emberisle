#!/bin/bash
# usage: run.sh <name> <tmpfs size, e.g. 64m>
# Runs the unchanged client-prove with TMPDIR on a fresh tmpfs of that size; samples its usage every 50 ms.
set -u
S=$(dirname "$0"); N=$1; SZ=$2; D=/tmp/claude-0/shm-$N
mkdir -p $D; mountpoint -q $D && umount $D; mount -t tmpfs -o size=$SZ tmpfs $D
( while :; do echo "$(date +%s%3N) $(df -k --output=used $D | tail -1)"; sleep 0.05; done ) > $S/$N.tmp.txt &
SP=$!; FP=; [ -n "${FD:-}" ] && { python3 $S/fdscan.py $D $S/$N.fd.jsonl & FP=$!; }
cd /home/user/emberisle
T0=$(date +%s%3N); echo "t0 $T0" > $S/$N.log
TMPDIR=$D OBS_OUT=$S/$N.obs.jsonl timeout 600 node --import $S/observer.mjs scripts/client-prove.mjs >> $S/$N.log 2>&1
echo "exit $?" >> $S/$N.log
kill $SP $FP; sleep 0.2; umount $D
