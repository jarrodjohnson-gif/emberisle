import json, pathlib, sys
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "docs/proofs/1089-hotseat-provenance/control.json")
d = json.loads(p.read_text())
audio = [x for x in d["trace"] if x["kind"] == "audio"]
assert [x["path"] for x in audio] == d["plays"]
assert [x["ordinal"] for x in audio] == list(range(1, len(audio) + 1))
assert d["observed"] == d["plays"][d["baseline"]:d["baseline"] + len(d["observed"])]
controlled = [x for x in audio if x["path"] == "/audio/back_001.wav" and "controlledLeaveExtraClip" in x["stack"]]
assert len(controlled) == 1
native = [x for x in d["trace"] if x["kind"] == "input" and x.get("button") == "Leave table" and x.get("trusted")]
assert {"pointerdown", "pointerup", "click"} <= {x["event"] for x in native}
up = next(x for x in native if x["event"] == "pointerup")
assert controlled[0]["at"] >= up["at"]
scheduled = {x["ordinal"]: x for x in d["trace"] if x["kind"] == "pump-scheduled"}
fired = [x for x in d["trace"] if x["kind"] == "pump-fired"]
assert scheduled and fired
assert all(x["ordinal"] in scheduled and isinstance(x["lateness"], (int, float)) and x["ms"] == 150 for x in fired)
stale = next(x for x in audio if x["ordinal"] == d["baseline"] + 1)
down = next(x for x in native if x["event"] == "pointerdown")
assert stale["path"] == "/audio/scratch_001.wav"
assert stale["at"] < down["at"] <= controlled[0]["at"]
assert stale["at"] - d["quiet"]["at"] >= 400
assert any(x["scheduled"] < d["quiet"]["at"] and x["at"] > d["quiet"]["at"] + 400 and x["lateness"] > 300 for x in fired)
print("PASS: baseline/slice, all clip ordinals/paths, trusted Leave, controlled extra stack, pump timing; earlier cue crosses baseline before injection")
