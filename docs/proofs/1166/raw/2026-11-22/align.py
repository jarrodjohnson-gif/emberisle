import sys,json
# usage: align.py name  -> max tmpfs used (MB) in each page-load window; times relative to the shell's t0
S=sys.argv[1]; n=sys.argv[2]
t0=int(open(f"{S}/{n}.log").readline().split()[1])
samp=[(int(a)-t0,int(b)) for a,b in (l.split() for l in open(f"{S}/{n}.tmp.txt") if len(l.split())==2)]
navs=[json.loads(l)["t"] for l in open(f"{S}/{n}.obs.jsonl") if '"nav"' in l]
fails=[json.loads(l) for l in open(f"{S}/{n}.obs.jsonl") if '"failed"' in l]
navs.append(10**9)
pk=max(samp,key=lambda x:x[1])
print("run peak %.0f MB at %d ms"%(pk[1]/1024,pk[0]))
for i in range(len(navs)-1):
  w=[u for t,u in samp if navs[i]<=t<navs[i+1]]
  print("load %d at %6d ms: max %4.0f MB"%(i+1,navs[i],max(w)/1024 if w else -1))
print("failed requests:",len(fails))
from collections import Counter
print(Counter(f["err"] for f in fails))
