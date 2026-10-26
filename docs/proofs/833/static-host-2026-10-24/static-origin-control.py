from pathlib import Path
import subprocess,os,hashlib,json
assert Path.cwd().name.startswith('verify'), 'use a disposable verification checkout'
p=Path('src/components/game/OpenTables.tsx');original=p.read_bytes();out=Path(os.environ['CONTROL_LOG_DIR']);out.mkdir(parents=True,exist_ok=True)
try:
 p.write_bytes(subprocess.check_output(['git','show','f9270fc:'+str(p)]))
 with (out/'old-static-build.log').open('w') as log:subprocess.run(['npm','run','build'],check=True,stdout=log,stderr=subprocess.STDOUT)
 with (out/'old-static-origin.log').open('w') as log:r=subprocess.run(['npm','run','open-host-prove'],stdout=log,stderr=subprocess.STDOUT)
 text=(out/'old-static-origin.log').read_text()
 assert r.returncode==1 and 'automatic discovery opens no WebSocket on a static root build' in text,(r.returncode,text[-1500:])
finally:
 p.write_bytes(original);assert p.read_bytes()==original
 with (out/'restored-build.log').open('w') as log:subprocess.run(['npm','run','build'],check=True,stdout=log,stderr=subprocess.STDOUT)
(out/'static-origin-control.json').write_text(json.dumps({'oldGate':'f9270fc','expectedExit':1,'failedAssertion':'automatic discovery opens no WebSocket on a static root build','restoredSourceSha256':hashlib.sha256(original).hexdigest()},indent=2)+'\n')
print('PASS: old production-root gate opens a static-origin socket and fails the exact no-WebSocket assertion; final app restored byte-for-byte and rebuilt.')
