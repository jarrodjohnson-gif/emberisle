from pathlib import Path
import subprocess,json,hashlib
original=Path('scripts/pages-prove.mjs');source=original.read_bytes()
text=source.decode();before='const BASE = "/emberisle/";';after='const BASE = "/renamed/";'
assert text.count(before)==1
changed=text.replace(before,after);assert changed.replace(after,before)==text
control=Path('scripts/.pages-renamed-control.mjs');assert not control.exists()
try:
    control.write_text(changed)
    with open('/tmp/issue833-oct24-pages-renamed.log','w') as log:
        subprocess.run(['node',str(control)],check=True,stdout=log,stderr=subprocess.STDOUT)
finally:
    control.unlink(missing_ok=True)
    assert original.read_bytes()==source
print(json.dumps({'originalProofSha256':hashlib.sha256(source).hexdigest(),'onlyChange':'BASE /emberisle/ -> /renamed/','allAssertionsRetained':True,'originalRestored':True}))
