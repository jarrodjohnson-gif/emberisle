import json, pathlib, sys
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "docs/proofs/1089-hotseat-provenance/control.json")
d = json.loads(p.read_text())
audio = [x for x in d["trace"] if x["kind"] == "audio"]
assert [x["path"] for x in audio] == d["plays"]
assert [x["ordinal"] for x in audio] == list(range(1, len(audio) + 1))
assert d["observed"] == d["plays"][d["baseline"]:d["baseline"] + len(d["observed"])]
marker, = [x for x in d["trace"] if x["kind"] == "controlled-extra"]
controlled = next(x for x in audio if x["ordinal"] == marker["ordinal"])
assert controlled["path"] == marker["path"] == "/audio/back_001.wav"
assert controlled["at"] >= marker["at"]
assert d["baseline"] < marker["ordinal"] <= d["baseline"] + len(d["observed"])
native = [x for x in d["trace"] if x["kind"] == "input" and x.get("button") == "Leave table" and x.get("trusted")]
assert {"pointerdown", "pointerup", "click"} <= {x["event"] for x in native}
up = next(x for x in native if x["event"] == "pointerup")
assert marker["eventAt"] == up["eventAt"]
scheduled = {x["ordinal"]: x for x in d["trace"] if x["kind"] == "pump-scheduled"}
fired = [x for x in d["trace"] if x["kind"] == "pump-fired"]
assert scheduled and fired
assert all(x["ordinal"] in scheduled and isinstance(x["lateness"], (int, float)) and x["ms"] == 150 for x in fired)
assert all("stack" not in x for x in d["trace"] if x["kind"] in {"audio", "pump-scheduled", "pump-fired"})
stacked = [x for x in d["trace"] if "stack" in x]
assert len(stacked) == 1 and stacked[0]["event"] == "click" and stacked[0]["button"] == "Leave table"
assert isinstance(stacked[0]["stack"], str) and stacked[0]["stack"]
print("PASS: original clip ordinals/baseline/slice; trusted Leave/control marker; pump timing; zero audio/pump stacks and one native Leave-click stack")
