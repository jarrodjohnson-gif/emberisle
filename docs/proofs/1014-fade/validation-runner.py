import subprocess,pathlib,json,time
base=pathlib.Path('/workspace/work/ambience-1015/docs/proofs/1014-fade/fresh');base.mkdir(exist_ok=True)
root='/workspace/work/ambience-verify'
tasks=[('base-build',['npm','run','build'],'/workspace/work/ambience-base'),('typecheck',['npm','run','typecheck'],root),('build',['npm','run','build'],root),('registered',['node','scripts/registered-prove.mjs'],root),('loosen',['node','scripts/loosen-prove.mjs','--base','origin/main'],root),('size',['node','scripts/size-prove.mjs','--base','/workspace/work/ambience-base'],root),('mixer',['node','scripts/sound-mixer-prove.mjs'],root),('loop',['node','scripts/ambience-loop-prove.mjs'],root),('levels',['node','scripts/audio-level-prove.mjs'],root)]
results=[]
for name,cmd,cwd in tasks:
    t=time.monotonic()
    with (base/(name+'.log')).open('w') as f:
        f.write('$ '+' '.join(cmd)+'\n');f.flush()
        r=subprocess.run(cmd,cwd=cwd,stdout=f,stderr=subprocess.STDOUT)
    results.append({'name':name,'command':cmd,'cwd':cwd,'exit':r.returncode,'seconds':round(time.monotonic()-t,2)})
    (base/'results.json').write_text(json.dumps(results,indent=2)+'\n')
    print(name,r.returncode,flush=True)
