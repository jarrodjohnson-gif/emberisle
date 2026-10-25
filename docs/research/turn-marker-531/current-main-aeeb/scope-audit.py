from pathlib import Path
import subprocess, hashlib
BASE = "caf88c6d7254bfd1beab69e9e2c02a981afc056c"
MERGE = "9ef72c0"
CODE = "2ddf8df158df1f278f1301e978b7734258429092"
def read(rev, name): return subprocess.check_output(["git", "show", rev + ":" + name]).decode()
root = "src/components/game/"
dot = read(MERGE, root + "SeatDot.tsx")
start = dot.index("// #531:")
marker = dot[start:]
assert read(CODE, root + "SeatDot.tsx") == dot[:start].rstrip() + "\n"
assert read(CODE, root + "SeatDot.tsx") == read(BASE, root + "SeatDot.tsx")
rail = read(MERGE, root + "SeatRail.tsx").replace('import { SeatDot, TurnMark } from "@/components/game/SeatDot";', 'import { SeatDot } from "@/components/game/SeatDot";')
where = rail.index("// One seat's card:")
assert read(CODE, root + "SeatRail.tsx") == rail[:where] + marker + "\n" + rail[where:]
for name in ["TradeToast.tsx", "WinScreen.tsx"]:
    expected = read(MERGE, root + name).replace('import { SeatDot, TurnMark } from "@/components/game/SeatDot";', 'import { SeatDot } from "@/components/game/SeatDot";\nimport { TurnMark } from "@/components/game/SeatRail";')
    assert read(CODE, root + name) == expected, name
assert read(CODE, "src/styles.css") == read(MERGE, "src/styles.css").replace("TurnMark, SeatDot.tsx", "TurnMark, SeatRail.tsx")
proof = "scripts/turn-marker-prove.mjs"
assert read(CODE, proof) == read("1897fe6", proof)
assert read(CODE, "scripts/size-prove.mjs") == read(BASE, "scripts/size-prove.mjs")
for name, added in [
    ("package.json", '    "turn-marker-prove": "node scripts/turn-marker-prove.mjs",\n'),
    (".github/workflows/ci.yml", "      - if: needs.changes.outputs.docs_only != 'true' && matrix.suite == 'presentation-2'\n        run: npm run turn-marker-prove\n")
]:
    text = read(CODE, name)
    assert text.count(added) == 1
    assert text.replace(added, "") == read(BASE, name), name
allowed = {"README.md", "package.json", ".github/workflows/ci.yml", proof, "src/styles.css", *(root + n for n in ["SeatRail.tsx", "TradeToast.tsx", "WinScreen.tsx"])}
paths = subprocess.check_output(["git", "diff", "--name-only", BASE, CODE]).decode().splitlines()
assert all(p in allowed or p.startswith("docs/research/turn-marker-531/") for p in paths), paths
print("PASS TurnMark exact function/comment moved; only three import edges rewired")
print("PASS SeatDot exact main; marker JSX/DOM and all feature CSS unchanged")
print("PASS original marker proof exact1897fe6 SHA256", hashlib.sha256(read(CODE, proof).encode()).hexdigest())
print("PASS every main command/guard/matrix retained plus own proof once in presentation-2")
print("PASS existing budgets exact main; source/proof scope retained; no new lazy gate or chunk")

assert subprocess.check_output(["git", "diff", "2ea5ff6", CODE, "--", "src", "server/host.mjs", "server/profiles.mjs", "server/profile-protocol.mjs"]) == b""
print("PASS subsequent main refresh keeps all tested app/host runtime bytes exact2ea5ff6")
