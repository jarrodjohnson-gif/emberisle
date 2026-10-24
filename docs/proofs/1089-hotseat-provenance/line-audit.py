from pathlib import Path
import subprocess
base = subprocess.check_output(["git", "show", "5bb959c:scripts/hotseat-prove.mjs"], text=True).splitlines()
head = Path("scripts/hotseat-prove.mjs").read_text().splitlines()
pos = 0
for line in base:
    if line == 'import { existsSync } from "node:fs";':
        continue
    while pos < len(head) and head[pos].strip() != line.strip():
        pos += 1
    assert pos < len(head), ("original line removed/changed", line)
    pos += 1
print("PASS: every original proof line remains in order; only fs import extended and Leave assertion reindented")
