from pathlib import Path
import subprocess,os,re,json,hashlib,time
root=Path('/workspace/emberisle/work/verify716-oct25')
out=Path('/workspace/emberisle/work/716-refresh-validation')
store=root/'src/lib/game/store.ts';lazy=root/'src/lib/lazy.ts'
originals={p:p.read_bytes() for p in [store,lazy]}
case=[]
s=originals[store].decode();old='  if (cancelled) return;\n  const { connectTable, hostUrl } = transport;';assert s.count(old)==1
case.append(('missing-cancel',store,s.replace(old,'  const { connectTable, hostUrl } = transport;'),'late client load cannot pull practice back online'))
s=originals[lazy].decode();mutated,count=re.subn(r'(?m)^    failedUrl \? import.* : load\(\);$','    load();',s);assert count==1
case.append(('cached-retry',lazy,mutated,'timed out: next explicit action retries the client'))
s=originals[store].decode();old='restoreTimer = setTimeout(() => !cancelled && get().restoring && set({ restoring: false }), 3000);';assert s.count(old)==1
case.append(('widened-restore',store,s.replace(old,old.replace('3000','4000')),'quiet fallback keeps the original 3000ms delay'))
results=[]
env={**os.environ,'PLAYWRIGHT_BROWSERS_PATH':'/workspace/emberisle/work/browsers'}
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
 (out/'controls.json').write_text(json.dumps({'cases':results,'restored':restored},indent=2)+'\n')
with (out/'health-final.log').open('w') as log:
 run=subprocess.run(['npm','run','connection-health-prove'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
assert run.returncode==0,run.returncode
print('PASS all three intended controls; source byte-exact; complete restored health proof passes',flush=True)
