from pathlib import Path
import subprocess,json,re,collections,hashlib
BASE='2638b7013abb21127e8c6507df508f84bb207b38'
MERGE='7e1d6c7'
CODE='a1ae342'
def read(rev,path):return subprocess.check_output(['git','show',rev+':'+path]).decode()
def checks(s):return collections.Counter(line.strip() for line in s.splitlines() if re.search(r'\bassert(?:\.\w+)?\s*\(|\bthrow\b|process\.exit',line) and not line.lstrip().startswith('//'))
proof='scripts/connection-health-prove.mjs';old=read(MERGE,proof);new=read(CODE,proof)
assert not (checks(old)-checks(new)),checks(old)-checks(new)
for path in ['src/lib/net/table.ts','server/host.mjs','src/components/game/ConnectionStatus.tsx','src/components/game/Lobby.tsx','src/components/game/TableMenu.tsx','src/components/game/chunks.ts','src/components/game/online.ts']:
 assert read(CODE,path)==read(MERGE,path),path
lazy=read(CODE,'src/lib/lazy.ts')
addition='''  // Non-React callers share the same cache and failed-URL retry as the UI.
  const loadModule = () => {
    if (pending?.status === "rejected") pending = undefined;
    return preload();
  };
  return { prefetch, pick, load: loadModule };'''
assert lazy.count(addition)==1
assert lazy.replace(addition,'  return { prefetch, pick };')==read(MERGE,'src/lib/lazy.ts')
for path in Path('scripts/fixtures/size').glob('*.json'):
 b=json.loads(read(CODE,str(path)));a=json.loads(read(BASE,str(path)));assert b.pop('table')==2000 and b==a,path
size=read(CODE,'scripts/size-prove.mjs');cap='  // #553: shared on-demand table transport, measured 2.08 kB; existing caps stay fixed.\n  { name: "table", gzipBytes: 2200 },\n'
assert size.count(cap)==1 and size.replace(cap,'')==read(BASE,'scripts/size-prove.mjs')
def callbacks(s):
 a=s.index('    health: (connectionHealth) => {')
 return s[a:s.index('\n  });',a)]
assert callbacks(read(CODE,'src/lib/game/store.ts'))==callbacks(read(MERGE,'src/lib/game/store.ts'))
a=re.findall(r'^const ROOM_SHAPE = .*$',read(BASE,'server/host.mjs'),re.M)
b=re.findall(r'^const ROOM_SHAPE = .*$',read(CODE,'server/host.mjs'),re.M)
assert a and a==b,(a,b)
assert read(CODE,'src/lib/net/proto.ts')==read(BASE,'src/lib/net/proto.ts')
store=read(CODE,'src/lib/game/store.ts');before=read(MERGE,'src/lib/game/store.ts')
def prefix(text):return text[:text.index('type ConnectKind =')]
expected=prefix(before).replace('import { connectTable, hostUrl, type Bag, type ChatLine, type Legal, type Me, type Reaction, type Seat, type TableClient } from "@/lib/net/table";', 'import type { Bag, ChatLine, Legal, Me, Reaction, Seat, TableClient } from "@/lib/net/table";\nimport { chunk } from "@/lib/lazy";')
expected=expected.replace('// The window listeners that wake a backing-off table; one connection at a time, so one remover.', '// The client is needed only for discovery or an explicit online journey.\nconst tableModule = chunk(() => import("@/lib/net/table"));\n\n// The window listeners that wake a backing-off table; one connection at a time, so one remover.')
expected=expected.replace('    if (net) return peeking ? net.peek(code) : undefined;', '    if (!net && stopWake && !peeking) return;\n    if (net) return peeking ? net.peek(code) : undefined;')
expected=expected.replace('    connect(set, get, (t, me) => t.open(me, { wayfarerMode: get().wayfarerChoices.online ?? "on", visibility }));','    const wayfarerMode = get().wayfarerChoices.online ?? "on";\n    connect(set, get, (t, me) => t.open(me, { wayfarerMode, visibility }));')
assert prefix(store)==expected
haptic=read(CODE,'scripts/haptics-prove.mjs')
restored=haptic.replace('const got = await coldStep(page.evaluate(async () => {','const got = await page.evaluate(async () => {').replace('    let socket, onDial;\n    const dialled = new Promise(resolve => { onDial = resolve; });','    let socket;').replace('socket = this; onDial();','socket = this;').replace('      await dialled; // The optional client must create the injected socket before any frames arrive.\n','').replace('  }), "timed out: haptic trade socket fixture");','  });')
assert restored==read(BASE,'scripts/haptics-prove.mjs')
assert checks(haptic)==checks(read(BASE,'scripts/haptics-prove.mjs'))
package=json.loads(read(CODE,'package.json'));main_package=json.loads(read(BASE,'package.json'))
assert package['scripts'].pop('connection-health-prove')=='node scripts/connection-health-prove.mjs'
assert package==main_package
ci_add='      - if: needs.changes.outputs.docs_only != \'true\' && matrix.suite == \'a1\'\n        run: npm run connection-health-prove\n'
ci=read(CODE,'.github/workflows/ci.yml');assert ci.count(ci_add)==1 and ci.replace(ci_add,'')==read(BASE,'.github/workflows/ci.yml')
# The last main merge touched renderer/proofs/rules only; tested network/backend/UI bytes remain equal.
for path in ['server/host.mjs','src/lib/net/table.ts','src/lib/net/proto.ts','src/components/game/ConnectionStatus.tsx','src/components/game/Lobby.tsx','src/components/game/TableMenu.tsx']:
 assert read(CODE,path)==read('e9568ec',path),path

print('PASS every original health assert/throw/exit line retained; new production cases added')
print('PASS transport protocol and backend exactly merged7e1; UI markup/styles exactly merged7e1')
print('PASS protocol callbacks exact merge7e1; store actions differ only in pending-peek guard and Host rules snapshot')
print('PASS prior lazy cache/retry/pick/prefetch implementation unchanged; only public .load added')
print('PASS every original ceiling/allowance exact main; table2200 only new cap')
print('PASS original fixture sizes exact main; table2000 only new field in each JSON')
print('PASS package/CI retain every main entry; health proof runs once on a1; haptics waits for injected socket under existing STEP_MS only')
print('PASS room shape/protocol constants unchanged')
print('SOURCE SHA256',json.dumps({p:hashlib.sha256(read(CODE,p).encode()).hexdigest() for p in ['src/lib/game/store.ts','src/lib/lazy.ts',proof]},sort_keys=True))
