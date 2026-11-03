from pathlib import Path
import subprocess,json,hashlib
BASE='a7592b0280cc004a621a0ddc9fa18c29e488737b'
CODE='b06d4b00c809b66a63cceb5cbd2bfdc6494d12d8'
REVIEWED='df502a148eb98d77514b98c2590c9396eee6f545'
def read(rev,path):return subprocess.check_output(['git','show',rev+':'+path])
files=['server/profiles.mjs','server/profile-lock-prove.mjs','server/profile-auth-prove.mjs','server/profile-edit-prove.mjs']
for path in files:
 b=read(CODE,path);assert b==read(REVIEWED,path),path
 print('PASS exact Opus delta-reviewed df502a1',path,hashlib.sha256(b).hexdigest())
def lock(b):return b[b.index(b'const publishedOwners ='):b.index(b'function alive(')]
assert lock(read(CODE,'server/profiles.mjs'))==lock(read('470c4c7','server/profiles.mjs'))
print('PASS approved470c4c7 publishedOwners/takeLock exact bytes')
package=json.loads(read(CODE,'package.json'));assert package['scripts'].pop('profile-lock-prove')=='node server/profile-lock-prove.mjs'
assert package==json.loads(read(BASE,'package.json'))
ci=read(CODE,'.github/workflows/ci.yml').decode();step="      - if: needs.changes.outputs.docs_only != 'true'\n        run: npm run profile-lock-prove\n"
assert ci.count(step)==1 and ci.replace(step,'').encode()==read(BASE,'.github/workflows/ci.yml')
assert read(CODE,'scripts/size-prove.mjs')==read(BASE,'scripts/size-prove.mjs')
paths=subprocess.check_output(['git','diff','--name-only',BASE,CODE],text=True).splitlines()
allowed=set(files+['package.json','.github/workflows/ci.yml'])
assert all(x.startswith('docs/') or x in allowed for x in paths),paths
print('PASS every main package command/CI condition/matrix retained; lock registered exactly once')
print('PASS all other runtime/proofs/budgets exact main; own six implementation files only')
