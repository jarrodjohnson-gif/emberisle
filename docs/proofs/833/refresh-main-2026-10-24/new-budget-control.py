from pathlib import Path
import json,subprocess
sizes=json.loads(Path('scripts/fixtures/size/pass.json').read_text());sizes['WayfarerOptions']=501
p=Path('/tmp/issue833-oct24-new-cap.json');p.write_text(json.dumps(sizes))
r=subprocess.run(['node','scripts/size-prove.mjs','--sizes',str(p),'--base-sizes','scripts/fixtures/size/base.json'],capture_output=True,text=True)
failures=[line for line in r.stdout.splitlines() if line.startswith('FAIL')]
assert r.returncode==1 and len(failures)==1 and failures[0].startswith('FAIL WayfarerOptions:'),(r.returncode,failures)
print('PASS: 501 B fails only the new 500 B WayfarerOptions ceiling; growth and every other fixed budget pass.')
print(failures[0])
