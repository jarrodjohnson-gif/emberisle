from pathlib import Path
import subprocess,json,hashlib
old=lambda p:subprocess.check_output(['git','show','f9270fc:'+p])
for p in ['scripts/open-table-prove.mjs','scripts/title-chunks-prove.mjs','scripts/haptics-prove.mjs','server/serve-prove.mjs','server/open-table-prove.mjs','scripts/size-prove.mjs','server/package.json']:
 assert Path(p).read_bytes()==old(p),p
for p in Path('scripts/fixtures/size').glob('*.json'):assert p.read_bytes()==old(str(p)),p
p='package.json';current=json.loads(Path(p).read_text());assert current['scripts'].pop('open-host-prove')=='node scripts/open-host-prove.mjs';assert current==json.loads(old(p))
p='.github/workflows/ci.yml';s=Path(p).read_text();step="      - if: needs.changes.outputs.docs_only != 'true' && matrix.suite == 'flows-b'\n        run: npm run open-host-prove\n";assert s.count(step)==1 and s.replace(step,'').encode()==old(p)
print('PASS: existing open-table/title-chunks/haptics/native-serving/native-open proofs unchanged; every existing budget, fixture and server command unchanged.')
print('PASS: package and complete eight-leg CI equal reviewed f9270fc plus exactly one new open-host proof in flows-b.')
