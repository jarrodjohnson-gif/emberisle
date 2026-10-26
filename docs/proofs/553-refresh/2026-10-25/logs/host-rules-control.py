from pathlib import Path
import subprocess,os,json,hashlib
root=Path('/workspace/emberisle/work/verify716-oct25');out=Path('/workspace/emberisle/work/716-refresh-validation/final')
p=root/'src/lib/game/store.ts';original=p.read_bytes();s=original.decode()
a='t.open(me, { wayfarerMode, visibility })';b='t.open(me, { wayfarerMode: get().wayfarerChoices.online ?? "on", visibility })'
assert s.count(a)==1
env={**os.environ,'PLAYWRIGHT_BROWSERS_PATH':'/workspace/emberisle/work/browsers'}
try:
 p.write_text(s.replace(a,b))
 with (out/'late-rules-control.log').open('w') as log: r=subprocess.run(['npm','run','connection-health-prove'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
 reason='late edits cannot change the rules chosen at Host'
 matched=reason in (out/'late-rules-control.log').read_text()
 assert r.returncode!=0 and matched,(r.returncode,matched)
finally:
 p.write_bytes(original)
 assert p.read_bytes()==original
with (out/'health-restored.log').open('w') as log: positive=subprocess.run(['npm','run','connection-health-prove'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
result={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'negative_exit':r.returncode,'expected':reason,'matched':matched,'restored_source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'positive_exit':positive.returncode}
(out/'host-rules-control.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
assert positive.returncode==0
