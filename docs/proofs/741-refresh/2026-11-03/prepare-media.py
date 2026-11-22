from pathlib import Path
import subprocess,json
out=Path('docs/proofs/741-refresh/2026-11-03')
for r in json.load(open('/workspace/work/741-evidence/capture.json')):
 start=max(0,r['events'][0]['videoSeconds']-.7); duration=r['events'][-1]['videoSeconds']+1.6-start
 dest=out/f"motion-{r['width']}x{r['height']}.mp4"
 subprocess.run(['ffmpeg','-y','-loglevel','error','-ss',str(start),'-i',r['video'],'-t',str(duration),'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(dest)],check=True)
 subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(dest),'-vf','setpts=4*PTS','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f"motion-{r['width']}x{r['height']}-slow4x.mp4")],check=True)
 # A six-panel overview from the native video, approximately one second apart.
 subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(dest),'-vf',f"fps=1,scale={195 if r['width']==390 else 640}:-1,tile=3x2",'-frames:v','1',str(out/f"motion-overview-{r['width']}.png")],check=True)
for width in (390,1280):
 for label in ('before','after'):
  (out/f'{label}-{width}.png').write_bytes(Path(f'/workspace/work/741-evidence/{label}-{width}.png').read_bytes())
