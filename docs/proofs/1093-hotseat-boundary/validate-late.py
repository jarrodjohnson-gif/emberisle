from pathlib import Path
import json, sys
rows = json.loads(Path(sys.argv[1] if len(sys.argv)>1 else 'docs/proofs/1093-hotseat-boundary/late-pump.json').read_text())
assert len(rows)==1
x=rows[0]; t=x['trace']
starts=[r for r in t if r['kind']=='controlled-boundary-start']; delays=[r for r in t if r['kind']=='controlled-pump-delay']
assert len(starts)==len(delays)==1
start=starts[0]; delay=delays[0]
assert start['pending']==1 and x['pending']==0
assert delay['requestedMs']==150 and delay['delegatedMs']==750
scheduled=next(r for r in reversed(t[:t.index(delay)]) if r['kind']=='pump-scheduled')
fired=next(r for r in t if r['kind']=='pump-fired' and r['ordinal']==scheduled['ordinal'])
assert fired['at']-scheduled['scheduled']>=650
scratch=[r for r in t if r['kind']=='audio' and r['at']>=start['at'] and r['path']=='/audio/scratch_001.wav']
assert len(scratch)==1 and scratch[0]['at']>=fired['at']
assert sum(r['kind']=='pump-scheduled' for r in t)==sum(r['kind']=='pump-fired' for r in t)
assert all(r['at']<=x['at'] for r in t if r['kind']=='pump-fired')
assert x['quietAt']>=scratch[0]['at'] and x['at']-x['quietAt']>=400
assert x['at']-start['at']<4000
assert [r['ordinal'] for r in t if r['kind']=='audio']==list(range(1,x['baseline']+1))
print(json.dumps({'pendingAtStart':start['pending'],'pendingAtBaseline':x['pending'],'baseline':x['baseline'],
 'measuredBoundaryMs':x['at']-start['at'],'lastPumpFireAt':max(r['at'] for r in t if r['kind']=='pump-fired'),
 'scratchAt':scratch[0]['at'],'quietAt':x['quietAt'],'baselineAt':x['at'],'quietMs':x['at']-x['quietAt']}))
