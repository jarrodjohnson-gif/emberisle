from pathlib import Path
import os,subprocess,wave,struct,math,json,hashlib
assert Path.cwd().name.startswith('verify'), 'use a disposable verification checkout'
out=Path(os.environ['CONTROL_LOG_DIR']);out.mkdir(parents=True,exist_ok=True)
rate=44100;n=20*rate
cases=[('bad-seam', 'first/last 10 ms differ by less than 2% of full scale'),('silent','the candidate is non-silent')]
results=[]
for name,expected in cases:
 wav=out/(name+'.wav');mp3=out/(name+'.mp3')
 if name=='silent':data=bytes(n*2)
 else:data=b''.join(struct.pack('<h',round((0.12*math.sin(2*math.pi*440*i/rate)+(0.4 if i>=n-441 else 0))*32767)) for i in range(n))
 with wave.open(str(wav),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(data)
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','96k',str(mp3)],check=True)
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(['npm','run','ambience-loop-prove','--','--file',str(mp3)],stdout=log,stderr=subprocess.STDOUT)
 text=(out/(name+'.log')).read_text();assert r.returncode==1 and expected in text,(name,r.returncode,text)
 results.append({'case':name,'exit':1,'failedAssertion':expected});wav.unlink();mp3.unlink()
p=Path('scripts/audio-level-lib.mjs');original=p.read_bytes()
try:
 p.write_bytes(original+b'\nTYPE_OF.effects.push("amb_sea");\n')
 with (out/'duplicate-type.log').open('w') as log:r=subprocess.run(['npm','run','sound-mixer-prove'],stdout=log,stderr=subprocess.STDOUT)
 text=(out/'duplicate-type.log').read_text();assert r.returncode==1 and 'every physical audio asset has exactly one mastering type' in text,(r.returncode,text)
 results.append({'case':'ambience also assigned to effects','exit':1,'failedAssertion':'every physical audio asset has exactly one mastering type'})
finally:
 p.write_bytes(original);assert p.read_bytes()==original
(out/'controls.json').write_text(json.dumps({'results':results,'restoredLibrarySha256':hashlib.sha256(original).hexdigest()},indent=2)+'\n')
print('PASS: bad seam, silence and duplicate/effect ambience classification fail their intended unchanged/added checks; source restored byte-for-byte.')
