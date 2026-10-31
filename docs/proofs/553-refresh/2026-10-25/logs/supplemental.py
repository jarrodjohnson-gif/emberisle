from pathlib import Path
import subprocess,os,json,time
root=Path('/workspace/emberisle/work/verify716-oct25');out=Path('/workspace/emberisle/work/716-refresh-validation/final')
out.mkdir(exist_ok=True)
env={**os.environ,'PLAYWRIGHT_BROWSERS_PATH':'/workspace/emberisle/work/browsers'}
steps=[('types',['npm','run','typecheck']),('registered',['npm','run','registered-prove']),('loosen',['npm','run','loosen-prove','--','--base','2638b7013abb21127e8c6507df508f84bb207b38']),('size-delta',['npm','run','size-delta-prove']),('build',['npm','run','build']),('size',['node','scripts/size-prove.mjs','--base','/workspace/emberisle/work/base1037-main137']),('haptics',['npm','run','haptics-prove']),('health',['npm','run','connection-health-prove']),('wayfarer',['npm','run','wayfarer-setup-prove']),('profile-seat',['node','server/profile-seat-prove.mjs'])]
rows=[]
for name,cmd in steps:
 start=time.monotonic()
 with (out/(name+'.log')).open('w') as log: run=subprocess.run(cmd,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 row={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'name':name,'command':cmd,'exit_code':run.returncode,'seconds':round(time.monotonic()-start,2)}
 rows.append(row);(out/'results.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
 if run.returncode:raise SystemExit(run.returncode)
