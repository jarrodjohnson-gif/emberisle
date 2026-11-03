from pathlib import Path
import subprocess,json,re
BASE='4892049'; PUBLISHED='28b1686'
def old(p,ref=BASE):return subprocess.check_output(['git','show',ref+':'+p],text=True)
def read(p):return Path(p).read_text()
p='scripts/size-prove.mjs'
pattern=r'\{ name: "([^"]+)", gzipBytes: (\d+) \}'
main={k:int(v) for k,v in re.findall(pattern,old(p))};now={k:int(v) for k,v in re.findall(pattern,read(p))}
assert set(now)-set(main)=={'OpenTables','WayfarerOptions'}
assert now.pop('OpenTables')==1300 and now.pop('WayfarerOptions')==500
assert now==main
assert dict(re.findall(pattern,old(p,PUBLISHED)))['OpenTables']=='1300'
def outside_ceilings(s):
 a=s.index('const CEILINGS = [');b=s.index('];',a)+2;return s[:a]+s[b:]
assert outside_ceilings(read(p))==outside_ceilings(old(p)),'an allowance or other size check changed'
for p in Path('scripts/fixtures/size').glob('*.json'):
 expected=json.loads(old(str(p)));expected['OpenTables']=json.loads(old(str(p),PUBLISHED))['OpenTables'];expected['WayfarerOptions']=350
 assert json.loads(p.read_text())==expected,p
p='package.json';current=json.loads(read(p));base=json.loads(old(p))
assert current['scripts'].pop('open-table-prove')=='node --import ./server/register.mjs scripts/open-table-prove.mjs'
assert current['scripts'].pop('title-chunks-prove')=='node scripts/title-chunks-prove.mjs'
assert current==base
p='server/package.json';current=json.loads(read(p));base=json.loads(old(p))
expected=base['scripts']['test']+' && node --import ./register.mjs open-table-prove.mjs'
assert current['scripts']['test']==expected
current['scripts']['test']=base['scripts']['test'];assert current==base
p='.github/workflows/ci.yml';current=read(p)
for proof in ['open-table-prove','title-chunks-prove']:
 addition="      - if: needs.changes.outputs.docs_only != 'true' && matrix.suite == 'flows-b'\n        run: npm run "+proof+'\n'
 assert current.count(addition)==1;current=current.replace(addition,'')
assert current==old(p),'an existing matrix/step/guard changed'
for p in ['scripts/title-prove.mjs','scripts/chunk-fail-prove.mjs','scripts/open-table-prove.mjs','server/open-table-prove.mjs']:
 assert read(p)==old(p,PUBLISHED),'published proof changed: '+p
p='src/components/game/SetupReference.tsx';assert read(p)==old(p)
print('PASS: all existing main and published-PR budgets/allowances retained; only new WayfarerOptions500 ceiling; fixture key union exact.')
print('PASS: every main package/server command, matrix step/guard/leg retained; open-table and title-chunks each exactly once in flows-b; full server chain plus one native proof.')
print('PASS: published title/chunk-fail/open-table/browser/server proofs byte-identical; original setup diagrams restored byte-identical to main.')
