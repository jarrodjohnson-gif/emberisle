from pathlib import Path
import subprocess,os,json,time
root=Path('/workspace/emberisle/work/verify716-oct25');out=Path('/workspace/emberisle/work/716-refresh-validation')
env={**os.environ,'PLAYWRIGHT_BROWSERS_PATH':'/workspace/emberisle/work/browsers'}
steps=[('types',['npm','run','typecheck']),('registered',['npm','run','registered-prove']),('loosen',['npm','run','loosen-prove','--','--base','caf88c6d7254bfd1beab69e9e2c02a981afc056c']),('size-delta',['npm','run','size-delta-prove']),('build',['npm','run','build']),('size',['node','scripts/size-prove.mjs','--base','/workspace/emberisle/work/base1037-main137']),('server',['npm','test']),('recovery',['npm','run','render-recovery-prove']),('client',['npm','run','client-prove']),('chat',['npm','run','chat-prove']),('chunk-fail',['npm','run','chunk-fail-prove']),('title',['npm','run','title-chunks-prove']),('open',['npm','run','open-table-prove']),('haptics',['npm','run','haptics-prove'])]
results=[]
for name,cmd in steps:
 start=time.monotonic()
 with (out/(name+'.log')).open('w') as log:
  run=subprocess.run(cmd,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 row={'name':name,'command':cmd,'exit_code':run.returncode,'seconds':round(time.monotonic()-start,2)}
 results.append(row);(out/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(row),flush=True)
 if run.returncode:raise SystemExit(run.returncode)
print('PASS all required static/native/serial browser neighbors',flush=True)
