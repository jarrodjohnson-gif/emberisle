from pathlib import Path
import subprocess,json,re
old=lambda ref,p:subprocess.check_output(['git','show',ref+':'+p],text=True)
def checks(s):
 result=[]
 for m in re.finditer(r'(?<![\w$])check\(',s):
  i=m.end();depth=1;quote=None;escaped=False
  while depth:
   c=s[i]
   if quote:
    if escaped:escaped=False
    elif c=='\\':escaped=True
    elif c==quote:quote=None
   elif c in ['"',"'",'`']:quote=c
   elif s[i:i+2]=='//':i=s.index('\n',i)
   elif s[i:i+2]=='/*':i=s.index('*/',i)+1
   elif c=='(':depth+=1
   elif c==')':depth-=1
   i+=1
  result.append(s[m.start():i])
 return result
p='scripts/robber-hex-prove.mjs';before=checks(old('19bb0f9',p));after=checks(Path(p).read_text())
for check in before:assert check in after,'published assertion changed: '+check
for p in ['scripts/size-prove.mjs','scripts/tokens-prove.mjs','scripts/flash-prove.mjs','scripts/wayfarer-prove.mjs']:
 assert Path(p).read_text()==old('4892049',p),p
p='.github/workflows/ci.yml';s=Path(p).read_text();step="      - if: needs.changes.outputs.docs_only != 'true' && matrix.suite == 'flows-c'\n        run: npm run robber-hex-prove\n"
assert s.count(step)==1 and s.replace(step,'')==old('4892049',p)
p='package.json';pkg=json.loads(Path(p).read_text());assert pkg['scripts'].pop('robber-hex-prove')=='node scripts/robber-hex-prove.mjs';assert pkg==json.loads(old('4892049',p))
print(f'PASS: all {len(before)} published check calls retained byte-for-byte; {len(after)-len(before)} stricter checks added.')
print('PASS: token/flash/wayfarer proofs and size rules exact main; exact main CI plus one robber step in flows-c; main package plus one registration.')
