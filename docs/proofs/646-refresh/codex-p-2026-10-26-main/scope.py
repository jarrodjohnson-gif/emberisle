import subprocess,json,pathlib
main='9bde9861490662ef3e95e90db5cfa2dc7874fd55';old='18f6794c01059051108f913016522751a4b61b89'
def git(*args):return subprocess.check_output(['git',*args],text=True).strip()
def show(ref,p):return subprocess.check_output(['git','show',ref+':'+p],text=True)
def tree(ref):return {p:meta.split()[2] for line in git('ls-tree','-r',ref).splitlines() for meta,p in [line.split('\t',1)]}
mt,ot=tree(main),tree(old);stage={p:meta.split()[1] for line in git('ls-files','-s').splitlines() for meta,p in [line.split('\t',1)]}
fixtures=[p for p in mt if p.startswith('scripts/fixtures/size/') and p.endswith('.json')]
exceptions=set(fixtures+['.github/workflows/ci.yml','package.json','server/package.json','scripts/size-prove.mjs','server/host.mjs','src/lib/net/table.ts','src/components/game/SeatRail.tsx','src/components/game/TradePanel.tsx'])
checks={'all_other_main_files_exact':all(stage.get(p)==sha for p,sha in mt.items() if p not in exceptions)}
own=['server/needs.mjs','server/needs-prove.mjs','scripts/needs-prove.mjs','src/lib/game/needs.ts','src/components/game/SeatNeeds.tsx','src/components/game/need-state.ts','src/components/game/SeatRail.tsx','src/components/game/TradePanel.tsx']
checks['own_need_modules_proofs_mounts_exact']=all(stage[p]==ot[p] for p in own)
checks['all_main_fixture_values_exact']=all({k:v for k,v in json.loads(pathlib.Path(p).read_text()).items() if k!='SeatNeeds'}==json.loads(show(main,p)) for p in fixtures)
checks['original_fixture_1780_exact']=all(json.loads(pathlib.Path(p).read_text())['SeatNeeds']==json.loads(show(old,p))['SeatNeeds']==1780 for p in fixtures)
for p in ['package.json','server/package.json']:
 m=json.loads(show(main,p));s=json.loads(pathlib.Path(p).read_text());del s['scripts']['needs-prove'];checks[p+'_all_main_values_exact']=s==m
checks['locks_exact_main']=all(stage[p]==mt[p] for p in ['package-lock.json','server/package-lock.json'])
ci=pathlib.Path('.github/workflows/ci.yml').read_text()
for block in ["      - if: needs.changes.outputs.docs_only != 'true'\n        run: node --import ./server/register.mjs server/needs-prove.mjs\n","      - if: needs.changes.outputs.docs_only != 'true' && matrix.suite == 'a3'\n        run: npm run needs-prove\n"]:
 assert ci.count(block)==1;ci=ci.replace(block,'')
checks['ci_exact_main_plus_needs_once']=ci==show(main,'.github/workflows/ci.yml')
s=pathlib.Path('scripts/size-prove.mjs').read_text();addition='  // #646: lazy public needs and picker; reviewed ceiling retained.\n  { name: "SeatNeeds", gzipBytes: 1900 },\n';assert s.count(addition)==1
checks['size_policy_exact_main_plus_original1900']=s.replace(addition,'')==show(main,'scripts/size-prove.mjs')
h=pathlib.Path('server/host.mjs').read_text()
for text in ['import { advanceRoomNeeds, restoredNeed, validNeeds } from "./needs.mjs";\n','    player: s.pid ?? null,\n    needs: [...(s.needs?.kinds ?? [])],\n','    if (advanceRoomNeeds(room, g, room.game, action?.type === "bankTrade")) publish(room);\n','  if (advanceRoomNeeds(room, before, room.game, true)) publish(room);\n','  if (advanceRoomNeeds(room, before, room.game, action.type === "bankTrade")) publish(room);\n','  if (msg.type === "need") {\n    if (!room.game || room.game.phase === "over") return send(ws, { type: "error", message: "Needs are available during a game." });\n    if (!validNeeds(msg.kinds)) return send(ws, { type: "error", message: "Choose up to two different goods." });\n    ws.seat.needs = msg.kinds.length ? { kinds: [...msg.kinds], turnsLeft: 2 } : undefined;\n    return publish(room);\n  }\n']:
 assert h.count(text)==1,text;h=h.replace(text,'')
assert h.count('    s.needs = undefined;\n')==2;h=h.replace('    s.needs = undefined;\n','')
for a,b in [('turnStartedAt, needs, extension,','turnStartedAt, extension,'),('...(needs ? { needs } : {}), ',''),('...s, needs: restoredNeed(s.needs),','...s,'),('function respond(room, actor, yes) {\n  const before = room.game;','function respond(room, actor, yes) {')]:
 assert h.count(a)==1,a;h=h.replace(a,b)
checks['host_exact_main_except_original_need_hooks']=h==show(main,'server/host.mjs')
n=pathlib.Path('src/lib/net/table.ts').read_text()
for text in ['  player?: string | null;\n  needs?: Resource[];\n','  need(kinds: Resource[]): void;\n','    need: (kinds) => send({ type: "need", kinds }),\n']:
 assert n.count(text)==1;n=n.replace(text,'')
checks['table_exact_main_except_original_need_contract']=n==show(main,'src/lib/net/table.ts')
audit={'main':main,'old_head':old,'checks':checks,'main_files_count':len(mt),'own_exact_files':own,'exception_files':sorted(exceptions),'hashes':{p:{'main':mt.get(p),'old':ot.get(p),'merged_stage':stage.get(p)} for p in sorted(set(own)|exceptions)}}
pathlib.Path('/tmp/p873-main/scope.json').write_text(json.dumps(audit,indent=2)+'\n');print(json.dumps({k:v for k,v in audit.items() if k!='hashes'},indent=2));assert all(checks.values())
