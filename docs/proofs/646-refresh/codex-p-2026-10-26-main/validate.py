import os,subprocess,json,pathlib,time,sys
root=pathlib.Path('/workspace/emberisle/work/p-verify873-main');base=pathlib.Path('/workspace/emberisle/work/p-review-base873-main9bd');logs=pathlib.Path('/tmp/p873-main/fresh');logs.mkdir(exist_ok=True)
env=os.environ.copy();env.pop('CHROMIUM_PATH',None);env['PLAYWRIGHT_BROWSERS_PATH']='/workspace/emberisle/work/browsers'
head='4232a45b5921f1754566414660b2684a8425a9ad';main='9bde9861490662ef3e95e90db5cfa2dc7874fd55'
steps=[('base-clone',['git','clone','--single-branch','--branch','main','https://github.com/jarrodjohnson-gif/emberisle.git',str(base)],'/workspace'),('base-checkout',['git','checkout','--detach',main],base),('base-install',['npm','ci'],base),('base-build',['npm','run','build'],base),('clone',['git','clone','--single-branch','--branch','codex/646-seat-needs','https://github.com/jarrodjohnson-gif/emberisle.git',str(root)],'/workspace'),('fetch-main',['git','fetch','origin','refs/heads/main:refs/remotes/origin/main'],root),('checkout',['git','checkout','--detach',head],root),('install',['npm','ci'],root),('server-install',['npm','--prefix','server','ci'],root),('environment',['bash','-c','node --version; npm ls playwright --depth=0; /workspace/emberisle/work/browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell --version; git rev-parse HEAD; git merge-base origin/main HEAD'],root),('types',['npm','run','typecheck'],root),('registered',['npm','run','registered-prove'],root),('size-delta',['npm','run','size-delta-prove'],root),('loosen',['npm','run','loosen-prove'],root),('build',['npm','run','build'],root),('size',['node','scripts/size-prove.mjs','--base',str(base)],root),('server',['npm','test'],root),('server-needs',['npm','--prefix','server','run','needs-prove'],root),('browser-needs',['npm','run','needs-prove'],root),('trade',['npm','run','trade-prove'],root),('clean',['git','status','--porcelain'],root)]
status={}
for name,cmd,cwd in steps:
 print('START',name,flush=True);started=time.time()
 with (logs/(name+'.log')).open('w') as f:
  f.write('$ '+subprocess.list2cmdline(cmd)+'\n');f.flush();r=subprocess.run(cmd,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
 tagged=base if name=='base-clone' else root if name=='clone' else cwd
 tested=subprocess.run(['git','rev-parse','HEAD'],cwd=tagged,text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL).stdout.strip() or None
 status[name]={'exit':r.returncode,'seconds':round(time.time()-started,2),'command':cmd,'cwd':str(cwd),'tested_commit':tested}
 (logs/'exit-status.json').write_text(json.dumps(status,indent=2)+'\n');print('DONE',name,r.returncode,status[name]['seconds'],flush=True)
 if r.returncode:sys.exit(r.returncode)
