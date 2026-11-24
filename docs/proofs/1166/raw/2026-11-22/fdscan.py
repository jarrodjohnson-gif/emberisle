import os,sys,time,json
# Every 100 ms: each process's open fds that point into dir D (deleted or not), with their sizes.
D=sys.argv[1]; out=open(sys.argv[2],"w")
while True:
  rows=[]
  for p in os.listdir("/proc"):
    if not p.isdigit(): continue
    try: comm=open(f"/proc/{p}/cmdline","rb").read().split(b"\0")
    except: continue
    argv0=comm[0].decode(errors="replace")[-30:]
    typ=next((a.decode()[7:] for a in comm if a.startswith(b"--type=")),"browser" if comm and b"chrom" in comm[0] else None)
    if typ is None: continue
    try: fds=os.listdir(f"/proc/{p}/fd")
    except: continue
    for f in fds:
      try:
        l=os.readlink(f"/proc/{p}/fd/{f}")
        if l.startswith(D) or l.startswith("/memfd:") or l.startswith("/dev/shm"): rows.append((p,typ+"|"+argv0,l.replace(D,""),os.stat(f"/proc/{p}/fd/{f}").st_size))
      except: pass
  out.write(json.dumps({"t":int(time.time()*1000),"r":rows})+"\n"); out.flush()
  time.sleep(0.1)
