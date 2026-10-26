import os,pathlib,subprocess,json
root=pathlib.Path('/workspace/emberisle/work/verify844-split')
env={**os.environ,'PLAYWRIGHT_BROWSERS_PATH':'/workspace/emberisle/work/browsers'}
cases=[('no-await','src/main.tsx','await import("./lib/haptics")','void import("./lib/haptics")','interactive controls are held before initialization'),('no-pointer-guard','src/lib/haptics.tsx',' && matchMedia("(pointer: coarse)").matches','','loaded haptics rechecks the current pointer'),('no-mute-guard','src/lib/haptics.tsx',' || isMuted()','','table mute preserves the previous haptic mute behavior')]
results=[]
for name,file,old,new,want in cases:
 p=root/file;original=p.read_text();assert original.count(old)==1,(name,original.count(old))
 try:
  p.write_text(original.replace(old,new))
  with open('/tmp/pr844-split-control-'+name+'.log','w') as log:
   r=subprocess.run(['node','scripts/haptics-prove.mjs'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=240)
  output=pathlib.Path('/tmp/pr844-split-control-'+name+'.log').read_text()
  result={'case':name,'exit':r.returncode,'expected_failure':want,'matched':want in output}
  results.append(result);print(json.dumps(result),flush=True)
  assert r.returncode==1 and want in output,(name,output[-2000:])
 finally:p.write_text(original)
pathlib.Path('/tmp/pr844-split-controls.json').write_text(json.dumps(results,indent=2)+'\n')
