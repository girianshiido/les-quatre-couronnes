"""Original score: Les chemins de la couronne. GM MIDI, no third-party Python dependencies."""
import json, struct, math
from pathlib import Path
PPQ=480; BPM=120; BARS=32; BEATS=BARS*4; SECONDS=BEATS*60/BPM
ROOT=Path(__file__).resolve().parent.parent
# name, channel, GM program (zero based), volume, pan
PARTS=[('Flute / trompette',0,73,103,70),('Clarinette',1,71,76,44),('Cordes pincees',2,45,79,35),('Harpe',3,46,85,89),('Cordes',4,48,66,62),('Contrebasse',5,32,91,61),('Cor',6,60,78,84),('Violon',7,40,72,43),('Celesta',8,8,69,91),('Percussions',9,0,69,64),('Guitare nylon',10,24,81,53)]
# Root bass, upper voicing. Same harmony in both versions enables phase-aligned crossfades.
A=[(38,[62,66,69,74]),(37,[61,64,69,73]),(35,[59,62,66,71]),(30,[57,61,66,69]),(31,[59,62,67,71]),(30,[57,62,66,69]),(28,[55,59,62,66]),(33,[57,61,64,67])]
B=[(31,[59,62,67,71]),(33,[57,61,64,69]),(30,[57,61,66,69]),(35,[59,62,66,71]),(31,[55,59,62,67]),(28,[55,59,64,67]),(33,[57,61,64,67]),(33,[57,61,64,67])]
HARMONY=A+A+B+A
# Memorable eight-bar question and answer, in beats. None represents a breath.
MELODY=[
 [(74,.75),(73,.25),(71,.5),(69,.5),(66,.5),(69,.5),(74,.75),(None,.25)],
 [(73,.5),(76,.5),(69,1),(73,.75),(71,.25),(69,.5),(64,.5)],
 [(71,.75),(74,.25),(78,.75),(76,.25),(74,.5),(71,.5),(66,.75),(None,.25)],
 [(69,.5),(73,.5),(78,1),(76,.5),(73,.5),(69,.75),(None,.25)],
 [(67,.5),(71,.5),(74,.5),(76,.5),(74,1),(71,.75),(None,.25)],
 [(66,.5),(69,.5),(74,1),(73,.5),(71,.5),(69,.75),(None,.25)],
 [(67,.5),(71,.5),(76,.75),(74,.25),(71,.5),(69,.5),(67,.75),(None,.25)],
 [(69,.5),(73,.5),(76,.75),(79,.25),(78,.5),(76,.5),(73,.75),(None,.25)],
]
MIDDLE=[
 [(74,1),(76,.5),(78,.5),(79,.75),(78,.25),(74,.5),(71,.5)],
 [(73,.75),(76,.25),(81,1),(79,.5),(76,.5),(73,.75),(None,.25)],
 [(78,.75),(76,.25),(73,.5),(69,.5),(73,.75),(76,.25),(78,.75),(None,.25)],
 [(78,1),(74,.5),(71,.5),(74,.5),(76,.5),(78,.75),(None,.25)],
 [(79,.75),(78,.25),(74,.5),(71,.5),(74,1),(67,.75),(None,.25)],
 [(76,.75),(74,.25),(71,.5),(67,.5),(71,.75),(74,.25),(76,.75),(None,.25)],
 [(76,.5),(78,.5),(79,.75),(76,.25),(73,.5),(71,.5),(69,.75),(None,.25)],
 [(73,.5),(76,.5),(79,.5),(78,.5),(76,.75),(73,.25),(69,.75),(None,.25)],
]

def vlq(v):
 out=[v&127];v>>=7
 while v:out.insert(0,(v&127)|128);v>>=7
 return bytes(out)
def meta(kind,text):
 data=text.encode('utf-8');return b'\xff'+bytes([kind])+vlq(len(data))+data

def score(victory=False):
 tracks={ch:[] for _,ch,_,_,_ in PARTS};notes=[]
 def note(ch,p,at,dur,vel):
  if p is None:return
  start=round(at*PPQ);end=round((at+dur)*PPQ)
  assert 0<=start<end<=BEATS*PPQ,(ch,p,at,dur)
  notes.append((ch,p,start,end));tracks[ch]+=[(start,2,bytes([0x90|ch,p,max(1,min(127,vel))])),(end,0,bytes([0x80|ch,p,0]))]
 for bar,(bass,chord) in enumerate(HARMONY):
  at=bar*4;phase=bar%8;mid=16<=bar<24
  phrase=MIDDLE[phase] if mid else MELODY[phase]
  # Reprise answers have small ornaments instead of being an exact copy.
  position=0
  for j,(p,dur) in enumerate(phrase):
   pitch=p
   if bar in [9,25] and j==1:pitch=78
   if bar in [15,31] and j==len(phrase)-2:pitch=73
   velocity=(84 if not victory else 77)+(4 if position in [0,2] else -2)
   note(0,pitch,at+position,dur*.92,velocity)
   if victory and pitch is not None:
    note(7,pitch,at+position+.012,dur*.85,62 if bar<16 else 69)
   position+=dur
  assert abs(position-4)<1e-9,(bar,position)
  # Broken-chord harp, with breathing space at phrase endings.
  arp=[chord[0]+12,chord[1]+12,chord[2]+12,chord[3]+12,chord[2]+12,chord[1]+12,chord[0]+12,chord[2]+12]
  for i,p in enumerate(arp):
   if phase==7 and i==7:continue
   note(3,p,at+i*.5,.43,52+(i%3)*3+(6 if victory else 0))
  # Bass alternates root and fifth, with a walking pickup only in the victory version.
  for p,offset,dur in [(bass,0,1.35),(bass+7,2,.65),(bass,3,.65)]:note(5,p,at+offset,dur,72 if victory else 66)
  if victory:note(5,bass+12,at+3.75,.18,57)
  # Warm pad; note-offs precede the next chord, including repeated chord tones.
  for p in chord[:3]:note(4,p,at+.025,3.87,46 if victory else 38)
  # A lightly syncopated dancing accompaniment.
  for beat in ([.5,1.5,2.5,3.5] if victory else [.5,2,3.5]):
   for k,p in enumerate(chord[:3]):note(10,p,at+beat+k*.012,.28,51 if victory else 43)
  for beat,p in [(0,chord[0]),(1.5,chord[2]),(2,chord[1]),(3.5,chord[2])]:note(2,p-12,at+beat,.25,53 if victory else 45)
  # Counters only in the spaces between longer phrases; no constant competing melody.
  if phase in [1,3,5,7]:
   for j,p in enumerate([chord[1],chord[2],chord[3]]):note(1,p+12,at+2.5+j*.5,.41,50 if victory else 44)
  if victory:
   for p in chord[1:3]:note(6,p,at,.85,57)
   for p in chord[:3]:note(6,p,at+2,.9,52)
  elif phase in [3,7]:
   note(6,chord[1],at+2,1.68,44)
  if phase in [0,4]:
   note(8,chord[2]+24,at,.8,45 if victory else 37)
   note(8,chord[3]+12,at+2.5,.65,41 if victory else 34)
  if victory:
   for beat in [0,1.5,2,2.75]:note(9,36,at+beat,.09,66 if beat in [0,2] else 43)
   for beat in [1,3]:note(9,38,at+beat,.08,58)
   for i in range(8):note(9,42,at+i*.5,.06,35 if i%2==0 else 27)
   for beat in [1,3]:note(9,54,at+beat,.08,40)
   if phase==0:note(9,49,at,.18,45)
   if phase==7:
    for i in range(4):note(9,38 if i%2 else 45,at+3+i*.25,.06,39+i*3)
  else:
   for beat in [0,2]:note(9,35,at+beat,.08,39)
   for beat in [1,3]:note(9,37,at+beat,.06,39)
   for beat in [.5,1.5,2.5,3.5]:note(9,54,at+beat,.05,27)
 # Verify actual cross-track/channel note identities, not merely duration sums.
 active={};overlaps=[]
 for ch,p,start,end in sorted(notes,key=lambda n:(n[0],n[1],n[2])):
  if active.get((ch,p),-1)>start:overlaps.append((ch,p,start))
  active[ch,p]=end
 assert not overlaps,overlaps
 return tracks,notes

def write_midi(path,modes):
 # modes can be repeated for a tail-settled, phase-consistent FluidSynth render.
 conductor=[(0,0,meta(3,'Les chemins de la couronne')),(0,0,b'\xff\x51\x03'+(500000).to_bytes(3,'big')),(0,0,b'\xff\x58\x04\x04\x02\x18\x08'),(0,0,b'\xff\x59\x02\x02\x00')]
 length=len(modes)*BEATS*PPQ;all_tracks=[conductor]
 totalnotes=0
 for name,ch,program,volume,pan in PARTS:
  events=[(0,0,meta(3,name))]
  for cycle,victory in enumerate(modes):
   base=cycle*BEATS*PPQ;data,notes=score(victory);totalnotes+=sum(n[0]==ch for n in notes)
   # Two identities, one phase-compatible score.
   pg=56 if victory and ch==0 else program
   vol=91 if victory and ch==0 else volume
   events.extend([(base,1,bytes([0xC0|ch,pg])),(base,1,bytes([0xB0|ch,7,vol])),(base,1,bytes([0xB0|ch,10,pan])),(base,1,bytes([0xB0|ch,91,38])),(base,1,bytes([0xB0|ch,93,12]))])
   events.extend((t+base,rank,msg) for t,rank,msg in data[ch])
  all_tracks.append(events)
 for i,mode in enumerate(modes):conductor.append((i*BEATS*PPQ,1,meta(6,'Victoire en vue' if mode else 'La vallee prend vie')))
 chunks=[]
 for events in all_tracks:
  buf=bytearray();previous=0
  for tick,rank,msg in sorted(events,key=lambda e:(e[0],e[1])):buf+=vlq(tick-previous)+msg;previous=tick
  buf+=vlq(length-previous)+b'\xff\x2f\x00';chunks.append(b'MTrk'+struct.pack('>I',len(buf))+buf)
 path.write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(chunks),PPQ)+b''.join(chunks))
 return {'file':str(path.relative_to(ROOT)),'tracks':len(chunks),'notes':totalnotes,'durationSeconds':len(modes)*SECONDS,'samePitchOverlaps':0}

reports=[]
for mode,name in [(False,'theme-normal'),(True,'theme-victoire')]:
 reports.append(write_midi(ROOT/'music'/f'{name}.mid',[mode]))
 write_midi(ROOT/'qa/music'/f'{name}-render.mid',[mode]*3)
reports.append(write_midi(ROOT/'music/les-chemins-de-la-couronne.mid',[False,True]))
(ROOT/'music/midi-validation.json').write_text(json.dumps({'bpm':BPM,'barsPerLoop':BARS,'loopSeconds':SECONDS,'key':'D major','reports':reports},indent=2)+'\n')
print(json.dumps(reports,indent=2))
