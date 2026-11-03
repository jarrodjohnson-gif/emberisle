from pathlib import Path
import subprocess,os,re,json,hashlib,time,sys,tempfile
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path.cwd()
out=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else Path(tempfile.mkdtemp(prefix='emberisle-health-controls-'))
out.mkdir(parents=True,exist_ok=True)
store=root/'src/lib/game/store.ts';lazy=root/'src/lib/lazy.ts'
originals={p:p.read_bytes() for p in [store,lazy]}
case=[]
s=originals[store].decode();old='  if (cancelled) return;\n  const { connectTable, hostUrl } = transport;';assert s.count(old)==1
case.append(('missing-cancel',store,s.replace(old,'  const { connectTable, hostUrl } = transport;'),'late client load cannot pull practice back online'))
s=originals[lazy].decode();mutated,count=re.subn(r'(?m)^    failedUrl \? import.* : load\(\);$','    load();',s);assert count==1
case.append(('cached-retry',lazy,mutated,'timed out: next explicit action retries the client'))
s=originals[store].decode();old='restoreTimer = setTimeout(() => !cancelled && get().restoring && set({ restoring: false }), 3000);';assert s.count(old)==1
case.append(('widened-restore',store,s.replace(old,old.replace('3000','4000')),'quiet fallback keeps the original 3000ms delay'))
s=originals[store].decode();old='    if (!net && stopWake && !peeking) return;\n';assert s.count(old)==1
case.append(('pending-peek',store,s.replace(old,''),'background peeks cannot replace a pending saved-seat dial'))
results=[]
env=os.environ.copy()
try:
 for name,path,mutated,reason in case:
  for p,b in originals.items():p.write_bytes(b)
  path.write_text(mutated)
  start=time.monotonic()
  with (out/(name+'.log')).open('w') as log:
   run=subprocess.run(['npm','run','connection-health-prove'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
  body=(out/(name+'.log')).read_text()
  result={'name':name,'code':run.returncode,'expected':reason,'matched':reason in body,'seconds':round(time.monotonic()-start,2)}
  results.append(result);print(json.dumps(result),flush=True)
  assert run.returncode!=0 and reason in body,result
finally:
 for p,b in originals.items():p.write_bytes(b)
 restored={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in originals}
 assert all(p.read_bytes()==b for p,b in originals.items())
 (out/'controls.json').write_text(json.dumps({'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'cases':results,'restored':restored},indent=2)+'\n')
with (out/'health-final.log').open('w') as log:
 run=subprocess.run(['npm','run','connection-health-prove'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
doc=json.loads((out/'controls.json').read_text());doc['restored_positive_exit_code']=run.returncode;(out/'controls.json').write_text(json.dumps(doc,indent=2)+'\n')
assert run.returncode==0,run.returncode
print('PASS all four intended controls; source byte-exact; complete restored health proof passes',flush=True)
