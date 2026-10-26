"""Calibrate against the unpublished full-Host prototype; restore every byte in finally."""
from pathlib import Path
import subprocess, os, hashlib, json
root=Path.cwd()
assert root.name.startswith('verify'), 'run only in a disposable verification clone'
files=['src/components/game/EmberisleApp.tsx','src/components/game/OpenTables.tsx','src/components/game/chunks.ts']
original={p:Path(p).read_bytes() for p in files}
env=os.environ.copy()
try:
    for p in files:Path(p).write_bytes(subprocess.check_output(['git','show','8728e4c:'+p]))
    with open('/tmp/issue833-oct24-firsttap-prototype-build.log','w') as log:
        subprocess.run(['npm','run','build'],check=True,stdout=log,stderr=subprocess.STDOUT)
    with open('/tmp/issue833-oct24-firsttap-prototype.log','w') as log:
        result=subprocess.run(['npm','run','title-chunks-prove'],env=env,stdout=log,stderr=subprocess.STDOUT)
    text=Path('/tmp/issue833-oct24-firsttap-prototype.log').read_text()
    assert result.returncode==1 and 'Host node survives optional mode arrival' in text
finally:
    for p,data in original.items():Path(p).write_bytes(data)
    assert all(Path(p).read_bytes()==data for p,data in original.items())
    with open('/tmp/issue833-oct24-firsttap-restored-build.log','w') as log:
        subprocess.run(['npm','run','build'],check=True,stdout=log,stderr=subprocess.STDOUT)
result={'prototype':'8728e4c','expectedExit':1,'failedAssertion':'Host node survives optional mode arrival',
        'restored':{p:hashlib.sha256(data).hexdigest() for p,data in original.items()}}
Path('/tmp/issue833-oct24-firsttap-control.json').write_text(json.dumps(result,indent=2)+'\n')
print('PASS: full-Host prototype fails node-preservation assertion; final source restored byte-for-byte and rebuilt.')
