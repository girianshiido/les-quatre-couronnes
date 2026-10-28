"""Three original screen themes, editable GM MIDI. No recorded music or voices."""
import json, struct
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
PPQ=480

def vlq(v):
    out=[v&127];v>>=7
    while v:out.insert(0,(v&127)|128);v>>=7
    return bytes(out)
def meta(kind,text):
    b=text.encode('utf-8');return b'\xff'+bytes([kind])+vlq(len(b))+b

class Score:
    def __init__(self,title,bpm,bars,key,parts):
        self.title=title;self.tempo=round(60000000/bpm);self.bars=bars;self.key=key;self.parts=parts
        self.notes=[];self.events={ch:[] for _,ch,_,_,_ in parts}
    def note(self,ch,p,at,dur,velocity):
        if p is None:return
        start=round(at*PPQ);end=round((at+dur)*PPQ)
        assert 0<=start<end<=self.bars*4*PPQ,(ch,p,at,dur)
        self.notes.append((ch,p,start,end))
        self.events[ch]+=[(start,2,bytes([0x90|ch,p,velocity])),(end,0,bytes([0x80|ch,p,0]))]
    def phrase(self,ch,bar,phrase,velocity=76,transpose=0):
        at=bar*4
        for p,d in phrase:
            self.note(ch,None if p is None else p+transpose,at,d*.90,velocity)
            at+=d
        assert abs(at-(bar+1)*4)<1e-8
    def write(self,path,cycles=1):
        held={}
        for ch,p,start,end in sorted(self.notes):
            assert held.get((ch,p),-1)<=start,(ch,p,start)
            held[ch,p]=end
        length=self.bars*4*PPQ
        tracks=[[(0,0,meta(3,self.title)),(0,0,b'\xff\x51\x03'+self.tempo.to_bytes(3,'big')),
                 (0,0,b'\xff\x58\x04\x04\x02\x18\x08'),(0,0,b'\xff\x59\x02'+bytes([self.key,int(getattr(self,"minor",False))]))]]
        for name,ch,pg,volume,pan in self.parts:
            events=[(0,0,meta(3,name)),(0,1,bytes([0xc0|ch,pg])),(0,1,bytes([0xb0|ch,7,volume])),
                    (0,1,bytes([0xb0|ch,10,pan])),(0,1,bytes([0xb0|ch,91,35])),(0,1,bytes([0xb0|ch,93,8]))]
            for cycle in range(cycles):events.extend((t+cycle*length,rank,m) for t,rank,m in self.events[ch])
            tracks.append(events)
        chunks=[]
        for events in tracks:
            buf=bytearray();last=0
            for tick,rank,msg in sorted(events,key=lambda e:(e[0],e[1])):buf+=vlq(tick-last)+msg;last=tick
            buf+=vlq(length*cycles-last)+b'\xff\x2f\x00';chunks.append(b'MTrk'+struct.pack('>I',len(buf))+buf)
        path.write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(chunks),PPQ)+b''.join(chunks))
        return {'file':str(path.relative_to(ROOT)),'title':self.title,'tracks':len(tracks),'notes':len(self.notes),
                'bars':self.bars,'bpm':round(60000000/self.tempo,3),'seconds':self.bars*4*self.tempo/1000000,'samePitchOverlaps':0}

# Root and voicing; a recognisable four-note invitation returns in the third phrase.
D=[(38,[62,66,69]),(37,[61,64,69]),(35,[59,62,66]),(30,[57,61,66]),
   (31,[59,62,67]),(30,[57,62,66]),(28,[59,64,67]),(33,[61,64,67])]
G=[(31,[59,62,67]),(33,[61,64,69]),(30,[57,61,66]),(35,[59,62,66]),
   (31,[59,62,67]),(28,[59,64,67]),(33,[61,64,67]),(33,[61,64,69])]
TITLE=[[(66,1),(69,.5),(74,.5),(73,1),(None,1)],[(71,.5),(69,.5),(64,1),(69,1),(None,1)],
       [(66,1),(71,.5),(74,.5),(78,1.5),(None,.5)],[(76,1),(73,.5),(69,.5),(66,1),(None,1)],
       [(67,1),(71,.5),(74,.5),(76,1),(74,1)],[(73,.5),(71,.5),(69,1),(66,1),(None,1)],
       [(67,.5),(71,.5),(76,1),(74,.5),(71,.5),(67,1)],[(69,1),(73,.5),(76,.5),(73,1),(None,1)]]
TITLE_B=[[(71,1),(74,.5),(79,.5),(78,1),(74,1)],[(76,1),(73,.5),(69,.5),(73,1),(None,1)],
         [(73,.5),(76,.5),(78,1),(76,.5),(73,.5),(69,1)],[(71,1.5),(74,.5),(78,1),(None,1)],
         [(79,1),(78,.5),(74,.5),(71,1),(None,1)],[(76,.5),(74,.5),(71,1),(67,1),(None,1)],
         [(69,1),(73,.5),(76,.5),(79,1),(78,1)],[(76,1),(73,.5),(71,.5),(69,1),(None,1)]]
parts=[('Piano',0,0,96,58),('Clarinette',1,71,85,75),('Harpe',2,46,78,88),('Cordes',3,48,62,52),('Contrebasse',4,32,83,61),('Cor',5,60,71,80),('Pizzicati',6,45,72,36),('Percussions',9,0,56,64)]
s=Score('Sous les quatre bannieres',96,24,2,parts)
for bar,(bass,chord) in enumerate(D+G+D):
    phrase=TITLE_B[bar%8] if 8<=bar<16 else TITLE[bar%8]
    s.phrase(1 if 8<=bar<16 else 0,bar,phrase,74 if bar<16 else 80)
    for j,p in enumerate([chord[0]+12,chord[1]+12,chord[2]+12,chord[1]+12]):s.note(2,p,bar*4+j,.78,48+j%2*6)
    for p in chord:s.note(3,p-12,bar*4+.03,3.84,40)
    for at,p in [(0,bass),(2,bass+7)]:s.note(4,p,bar*4+at,1.45,60)
    for at,p in [(.5,chord[0]),(2.5,chord[2])]:s.note(6,p,bar*4+at,.32,43)
    if bar%4==3:
        s.note(5,chord[0],bar*4+2,1.7,48)
    for at in [1,3]:s.note(9,54,bar*4+at,.06,22)
    s.note(9,35,bar*4,.08,30)
SCORES={'titre':s}

# A celebratory cadence, distinct from the continuous battlefield arrangement.
VICTORY=[[(74,.75),(69,.25),(74,.5),(78,.5),(81,1),(None,1)],[(79,.5),(78,.5),(76,1),(73,1),(None,1)],
         [(74,.75),(78,.25),(81,1),(78,.5),(74,.5),(71,.75),(None,.25)],[(73,1),(76,.5),(78,.5),(76,1),(None,1)],
         [(79,.75),(78,.25),(74,.5),(71,.5),(74,1),(None,1)],[(78,.5),(76,.5),(74,1),(69,1),(None,1)],
         [(76,.75),(74,.25),(71,.5),(67,.5),(69,1),(73,.5),(76,.5)],[(78,1),(76,.5),(73,.5),(74,1.75),(None,.25)]]
parts=[('Trompette',0,56,91,66),('Violons',1,40,72,42),('Cors',2,60,78,81),('Harpe',3,46,78,92),('Cordes',4,48,66,52),('Basse',5,32,88,62),('Timbales',6,47,70,36),('Percussions',9,0,66,64)]
s=Score('Une seule couronne',128,16,2,parts)
# Last two bars resolve on D, rather than ending the victory on a dominant.
harmony=D[:6]+[(33,[61,64,67]),(38,[62,66,69])]+G[:6]+[(33,[61,64,67]),(38,[62,66,69])]
for bar,(bass,chord) in enumerate(harmony):
    phrase=VICTORY[bar%8]
    s.phrase(0,bar,phrase,80+(4 if bar>=8 else 0));s.phrase(1,bar,phrase,63)
    for at in [0,2]:
        for p in chord:s.note(2,p,bar*4+at,.8,55)
    for p in chord:s.note(4,p,bar*4+.02,3.87,42)
    for j,p in enumerate([chord[0]+12,chord[1]+12,chord[2]+12,chord[1]+12]*2):s.note(3,p,bar*4+j*.5,.36,49+j%2*5)
    for at,p in [(0,bass),(1.5,bass+7),(2,bass),(3,bass+7)]:s.note(5,p,bar*4+at,.65,68)
    for at in [0,2]:s.note(9,36,bar*4+at,.08,60)
    for at in [1,3]:s.note(9,38,bar*4+at,.08,53)
    for j in range(8):s.note(9,42,bar*4+j*.5,.05,29 if j%2 else 34)
    if bar%4==0:s.note(9,49,bar*4,.2,46)
    if bar%8==7:
        s.note(6,bass+12,bar*4,1.2,58);s.note(6,bass+12,bar*4+2,1.4,52)
SCORES['victoire-finale']=s

# Reflective, with a gentle upward answer: defeat, but the story can continue.
MINOR=[(35,[59,62,66]),(31,[59,62,67]),(38,[62,66,69]),(33,[61,64,69]),
       (28,[59,64,67]),(30,[58,61,66]),(35,[59,62,66]),(35,[59,62,66]),
       (31,[59,62,67]),(28,[59,64,67]),(30,[58,61,66]),(30,[58,61,66])]
DEFEAT=[[(71,1.5),(69,.5),(66,1),(None,1)],[(67,1),(66,.5),(62,.5),(59,1),(None,1)],
        [(66,1.5),(69,.5),(74,1),(None,1)],[(73,1),(71,.5),(69,.5),(64,1),(None,1)],
        [(67,1),(71,1),(76,1),(74,.5),(None,.5)],[(73,1.5),(70,.5),(66,1),(None,1)],
        [(71,1),(74,.5),(73,.5),(71,1.5),(None,.5)],[(66,2),(62,1),(None,1)],
        [(67,1.5),(71,.5),(74,1),(None,1)],[(71,1),(67,.5),(64,.5),(67,1),(None,1)],
        [(70,1.5),(73,.5),(78,1),(76,.5),(None,.5)],[(73,1),(70,.5),(66,.5),(70,1),(None,1)]]
parts=[('Piano',0,0,99,59),('Violoncelle',1,42,79,77),('Cordes',2,48,61,43),('Harpe',3,46,73,88),('Clarinette',4,71,73,65)]
s=Score('Les braises du royaume',80,12,2,parts);s.minor=True
for bar,(bass,chord) in enumerate(MINOR):
    s.phrase(0,bar,DEFEAT[bar],69 if bar<8 else 74)
    s.note(1,bass+12,bar*4+.02,3.84,52)
    for p in chord[:2]:s.note(2,p,bar*4+.04,3.84,34)
    for j,p in enumerate([chord[0]+12,chord[2]+12,chord[1]+12,chord[2]+12]):s.note(3,p,bar*4+j,.78,40+j%2*4)
    if bar in [3,7,11]:s.note(4,chord[1]+12,bar*4+2,1.6,43)
SCORES['defaite']=s

reports=[]
for name,s in SCORES.items():
    reports.append(s.write(ROOT/'music'/f'ecran-{name}.mid'))
    s.write(ROOT/'qa/screen-music'/f'{name}-render.mid',3)
(ROOT/'music/screen-midi-validation.json').write_text(json.dumps(reports,indent=2)+'\n')
print(json.dumps(reports,indent=2))
