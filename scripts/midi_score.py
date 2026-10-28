"""Small dependency-free GM MIDI score writer, with note-lifetime validation."""
import struct
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
    def __init__(self,title,bpm,bars,key,parts,beats=4,signature=(4,2),minor=False):
        self.title=title;self.tempo=round(60000000/bpm);self.bars=bars;self.key=key;self.parts=parts
        self.beats=beats;self.signature=signature;self.minor=minor
        self.notes=[];self.events={ch:[] for _,ch,_,_,_ in parts}
    def note(self,ch,p,at,dur,velocity):
        if p is None:return
        start=round(at*PPQ);end=round((at+dur)*PPQ)
        assert 0<=start<end<=round(self.bars*self.beats*PPQ),(ch,p,at,dur)
        self.notes.append((ch,p,start,end))
        self.events[ch]+=[(start,2,bytes([0x90|ch,p,velocity])),(end,0,bytes([0x80|ch,p,0]))]
    def phrase(self,ch,bar,phrase,velocity=76,transpose=0):
        at=bar*self.beats
        for p,d in phrase:
            self.note(ch,None if p is None else p+transpose,at,d*.90,velocity)
            at+=d
        assert abs(at-(bar+1)*self.beats)<1e-8
    def write(self,path,cycles=1):
        held={}
        for ch,p,start,end in sorted(self.notes):
            assert held.get((ch,p),-1)<=start,(ch,p,start)
            held[ch,p]=end
        length=round(self.bars*self.beats*PPQ)
        tracks=[[(0,0,meta(3,self.title)),(0,0,b'\xff\x51\x03'+self.tempo.to_bytes(3,'big')),
                 (0,0,b'\xff\x58\x04'+bytes([*self.signature,36 if self.signature[1]==3 else 24,8])),(0,0,b'\xff\x59\x02'+bytes([self.key&255,int(self.minor)]))]]
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
                'bars':self.bars,'bpm':round(60000000/self.tempo,3),'seconds':self.bars*self.beats*self.tempo/1000000,'samePitchOverlaps':0}
