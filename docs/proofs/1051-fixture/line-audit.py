from pathlib import Path
import subprocess
base = subprocess.check_output(["git", "show", "10dbecd:scripts/longest-army-prove.mjs"], text=True)
head = Path("scripts/longest-army-prove.mjs").read_text()
lines = head.splitlines()
pos = 0
for line in base.splitlines():
    while pos < len(lines) and lines[pos].strip() != line.strip():
        pos += 1
    assert pos < len(lines), ("original proof line removed", line)
    pos += 1
marker = "  for (const v of VIEWS)"
assert base[base.index(marker):] == head[head.index(marker):]
assert 'for (let seed = 1; seed < 60 && !steps; seed++)' in head
assert 'for (let i = 0; i < 200 && st.phase !== "roll"; i++)' in head
print("PASS: every original line retained; browser/diagnostic block byte-identical; seed1–59 and setup200 bounds unchanged")
