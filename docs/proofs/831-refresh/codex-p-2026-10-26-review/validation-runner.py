import os,subprocess,json,pathlib,time,sys
root=pathlib.Path('/workspace/emberisle/work/p-verify883')
base=pathlib.Path('/workspace/emberisle/work/p-review-base883-main9bd')
logs=pathlib.Path('/tmp/p883-review/fresh');logs.mkdir(parents=True,exist_ok=True)
env=os.environ.copy();env.pop('CHROMIUM_PATH',None);env['PLAYWRIGHT_BROWSERS_PATH']='/workspace/emberisle/work/browsers'
head='1a2db48c131ce4dd7e7427093b85195e2c0437fb'; main='9bde9861490662ef3e95e90db5cfa2dc7874fd55'
steps=[('base-clone',['git','clone','--single-branch','--branch','main','https://github.com/jarrodjohnson-gif/emberisle.git',str(base)],'/workspace'),('base-checkout',['git','checkout','--detach',main],base),('base-install',['npm','ci'],base),('base-build',['npm','run','build'],base),('clone-clean',['git','status','--porcelain'],root),('fetch',['git','fetch','origin','refs/heads/codex/831-option-a-complete:refs/remotes/origin/codex/831-option-a-complete','refs/heads/main:refs/remotes/origin/main'],root),('checkout',['git','checkout','--detach',head],root),('install',['npm','ci'],root),('server-install',['npm','--prefix','server','ci'],root),('environment',['bash','-c','node --version; npm ls playwright --depth=0; /workspace/emberisle/work/browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell --version; git rev-parse HEAD; git merge-base origin/main HEAD'],root),('types',['npm','run','typecheck'],root),('registered',['npm','run','registered-prove'],root),('loosen',['npm','run','loosen-prove'],root),('build',['npm','run','build'],root),('size',['node','scripts/size-prove.mjs','--base',str(base)],root),('trade-tabs',['npm','run','trade-tabs-prove'],root),('trade-map',['node','--import','./server/register.mjs','scripts/trade-map.test.mjs'],root),('clean',['git','status','--porcelain'],root)]
status={}
if '--resume-setup' in sys.argv:
 steps=steps[1:]
if '--trade-map' in sys.argv:
 status=json.loads((logs/'exit-status.json').read_text());steps=steps[-2:]
if '--setup-proof' in sys.argv:
 status=json.loads((logs/'exit-status.json').read_text())
 steps=[('fetch-proof',['git','fetch','origin','refs/heads/codex/831-option-a-complete:refs/remotes/origin/codex/831-option-a-complete'],root),('checkout-proof',['git','checkout','--detach','8539238901bb4af28c1f9dcf1ae822900592e47f'],root),('loosen-proof',['npm','run','loosen-prove'],root),('trade-tabs-prefetch',['npm','run','trade-tabs-prove'],root),('clean-proof',['git','status','--porcelain'],root)]
for name,cmd,cwd in steps:
 print('START',name,flush=True);started=time.time()
 with (logs/(name+'.log')).open('w') as f:
  f.write('$ '+subprocess.list2cmdline(cmd)+'\n');f.flush();r=subprocess.run(cmd,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
 tested_root=base if name=='base-clone' else cwd
 tested=subprocess.run(['git','rev-parse','HEAD'],cwd=tested_root,text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL).stdout.strip() or None
 status[name]={'exit':r.returncode,'seconds':round(time.time()-started,2),'command':cmd,'cwd':str(cwd),'tested_commit':tested}
 (logs/'exit-status.json').write_text(json.dumps(status,indent=2)+'\n');print('DONE',name,r.returncode,status[name]['seconds'],flush=True)
 if r.returncode:sys.exit(r.returncode)
