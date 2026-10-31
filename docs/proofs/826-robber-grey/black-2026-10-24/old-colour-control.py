from pathlib import Path
import subprocess,hashlib,json,os
assert Path.cwd().name.startswith("verify"), "use a disposable verification checkout"
paths=["src/lib/scene/isle-renderer.ts","src/lib/scene/jelly-board.ts"]
original={p:Path(p).read_bytes() for p in paths}
shots={p:Path(p).read_bytes() for p in ["test-results/robber-grey-1280x720.png","test-results/robber-grey-390x844.png"]}
out=Path(os.environ["CONTROL_LOG_DIR"]);out.mkdir(parents=True,exist_ok=True)
try:
 # Substitute only the old colour paths; keep current CPU canvas readback and all other code.
 for p in paths:
  text=original[p].decode();old=subprocess.check_output(["git","show","f1bbf7a:"+p],text=True)
  if p.endswith("isle-renderer.ts"):
   start="  private shadeRobber(";end="\n  // Where the wayfarer stands"
   a=text.index(start);b=text.index(end,a);oa=old.index(start);ob=old.index(end,oa)
   text=text[:a]+old[oa:ob]+text[b:]
  else:
   assert text.count("const DULL = new THREE.Color(0, 0, 0);")==1
   text=text.replace("const DULL = new THREE.Color(0, 0, 0);","const DULL = new THREE.Color(0.22, 0.22, 0.24);")
   start="function hexPatch(";end="\n// The camera-facing quads"
   a=text.index(start);b=text.index(end,a);oa=old.index(start);ob=old.index(end,oa)
   text=text[:a]+old[oa:ob]+text[b:]
  Path(p).write_text(text)
 with (out/"old-colour.log").open("w") as log:
  r=subprocess.run(["npm","run","robber-hex-prove"],stdout=log,stderr=subprocess.STDOUT)
 text=(out/"old-colour.log").read_text()
 failures=[line.split(" {",1)[0].strip() for line in text.splitlines() if line.startswith("FAIL ") and not line.startswith("FAIL 4:")]
 expected=["FAIL move: token disc and face are plain black","FAIL move: light numeral and pips remain on the black face","FAIL 1280x720: blocked terrain is black without a brown cast","FAIL 390x844: blocked terrain is black without a brown cast"]
 assert r.returncode==1 and failures==expected,(r.returncode,failures)
 assert "ok   no console errors []" in text
finally:
 for p,data in original.items():Path(p).write_bytes(data)
 for p,data in shots.items():Path(p).write_bytes(data)
 assert all(Path(p).read_bytes()==data for p,data in {**original,**shots}.items())
(out/"old-colour-control.json").write_text(json.dumps({"oldColourSourceCommit":"f1bbf7a","substitutedOnly":["shadeRobber","DULL","hexPatch"],"cpuCanvasReadbackRetained":True,"exit":1,"expectedFailures":expected,"restoredSha256":{p:hashlib.sha256(data).hexdigest() for p,data in original.items()},"positiveCapturesRestored":True},indent=2)+"\n")
print("PASS: published brown/grey implementation fails exactly the four added black/readability checks; original assertions pass; final source and positive captures restored byte-for-byte.")
