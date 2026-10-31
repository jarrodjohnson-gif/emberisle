import os, subprocess, json, time, pathlib, sys
logs = pathlib.Path('/tmp/p905-main074/fresh'); logs.mkdir(exist_ok=True)
root = pathlib.Path('/workspace/emberisle/work/p-review-verify905')
base = pathlib.Path('/workspace/emberisle/work/p-review-base905')
env = os.environ.copy()
env['PLAYWRIGHT_BROWSERS_PATH']='/workspace/emberisle/work/browsers'
env['CHROMIUM_PATH']='/workspace/emberisle/work/browsers/chromium-1243/chrome-linux64/chrome'
merge='96ad756ca4cb1d824e19070021c56457eb4cf260'
main='074faf0a2405484369b511655a78d768a964d28d'
steps=[
 ('base-clean',['git','status','--porcelain'],base),
 ('base-fetch',['git','fetch','origin',main],base),
 ('base-checkout',['git','checkout','--detach',main],base),
 ('base-install',['npm','ci'],base),
 ('base-build',['npm','run','build'],base),
 ('clone-clean',['git','status','--porcelain'],root),
 ('fetch-merge',['git','fetch','/workspace/emberisle/work/p-refresh905',merge],root),
 ('fetch-main',['git','fetch','origin','refs/heads/main:refs/remotes/origin/main'],root),
 ('checkout',['git','checkout','--detach',merge],root),
 ('install',['npm','ci'],root),
 ('server-install',['npm','--prefix','server','ci'],root),
 ('environment',['bash','-c','node --version; npm ls playwright --depth=0; "$CHROMIUM_PATH" --version; git rev-parse HEAD'],root),
 ('types',['npm','run','typecheck'],root),
 ('registered',['npm','run','registered-prove'],root),
 ('loosen',['npm','run','loosen-prove','--','--base',main],root),
 ('build',['npm','run','build'],root),
 ('size',['node','scripts/size-prove.mjs','--base',str(base)],root),
 ('keyboard',['npm','run','keyboard-fit-prove'],root),
 ('hole',['npm','run','hole-prove'],root),
 ('overlays',['npm','run','rotate-overlays-prove'],root),
 ('robber-prompt',['npm','run','robber-prompt-prove'],root),
 ('client',['npm','run','client-prove'],root),
 ('keyboard-headless',['npm','run','keyboard-fit-prove'],root),
 ('clean',['git','status','--porcelain'],root),
]
status={}
if '--remaining' in sys.argv:
 status=json.loads((logs/'exit-status.json').read_text())
 steps=steps[18:]
 env.pop('CHROMIUM_PATH',None)
if '--headless' in sys.argv:
 status=json.loads((logs/'exit-status.json').read_text())
 steps=steps[-2:]
 env.pop('CHROMIUM_PATH',None)
for name,cmd,cwd in steps:
 print('START',name,flush=True); started=time.time()
 with (logs/(name+'.log')).open('w') as f:
  f.write('$ '+subprocess.list2cmdline(cmd)+'\n');f.flush()
  result=subprocess.run(cmd,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
 tested=subprocess.check_output(['git','rev-parse','HEAD'],cwd=cwd,text=True).strip()
 status[name]={'exit':result.returncode,'seconds':round(time.time()-started,2),'command':cmd,'cwd':str(cwd),'tested_commit':tested}
 (logs/'exit-status.json').write_text(json.dumps(status,indent=2)+'\n')
 print('DONE',name,result.returncode,status[name]['seconds'],flush=True)
 if result.returncode: sys.exit(result.returncode)
