import subprocess,pathlib,json,time
base=pathlib.Path('/workspace/work/trade883/docs/proofs/831-refresh/codex-p3-main');base.mkdir(parents=True,exist_ok=True)
root='/workspace/work/trade883-verify'
tasks=[('typecheck',['npm','run','typecheck']),('build',['npm','run','build']),('registered',['node','scripts/registered-prove.mjs']),('loosen',['node','scripts/loosen-prove.mjs','--base','beafd405']),('size',['node','scripts/size-prove.mjs','--base','/workspace/work/ambience-base']),('trade-map',['node','--import','./server/register.mjs','scripts/trade-map.test.mjs']),('trade-tabs',['npm','run','trade-tabs-prove'])]
results=[]
for name,cmd in tasks:
    t=time.monotonic()
    with (base/(name+'.log')).open('w') as f:
        f.write('$ '+' '.join(cmd)+'\n');f.flush();r=subprocess.run(cmd,cwd=root,stdout=f,stderr=subprocess.STDOUT)
    results.append({'name':name,'command':cmd,'cwd':root,'exit':r.returncode,'seconds':round(time.monotonic()-t,2)})
    (base/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(name,r.returncode,flush=True)
