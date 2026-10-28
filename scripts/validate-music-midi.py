"""Independently read serialized MIDI tracks and validate all note lifetimes."""
from pathlib import Path
import json, struct
ROOT=Path(__file__).resolve().parent.parent
reports=[]
for path in sorted((ROOT/'music').glob('*.mid')):
    data=path.read_bytes();assert data[:4]==b'MThd'
    header,form,tracks,ppq=struct.unpack('>IHHH',data[4:14]);assert (header,form,ppq)==(6,1,480)
    pos=14;events=[];endings=[];tempos=[]
    for track in range(tracks):
        assert data[pos:pos+4]==b'MTrk'
        length=int.from_bytes(data[pos+4:pos+8],'big');body=data[pos+8:pos+8+length];pos+=8+length
        cursor=0;tick=0;running=None
        def var():
            global cursor
            value=0
            while True:
                b=body[cursor];cursor+=1;value=(value<<7)|(b&127)
                if b<128:return value
        while cursor<len(body):
            tick+=var();status=body[cursor]
            if status>=128:cursor+=1
            else:assert running is not None;status=running
            if status==255:
                kind=body[cursor];cursor+=1;n=var();chunk=body[cursor:cursor+n];cursor+=n
                if kind==47:endings.append(tick)
                if kind==81:tempos.append((tick,int.from_bytes(chunk,'big')))
            elif status in (240,247):n=var();cursor+=n;running=None
            else:
                running=status;n=1 if status&240 in (192,208) else 2
                args=body[cursor:cursor+n];cursor+=n
                if status&240 in (128,144):events.append((tick,status&15,args[0],status&240==144 and args[1]>0))
    held=set();notes=0
    for tick,ch,pitch,on in sorted(events,key=lambda e:(e[0],e[3])):
        key=(ch,pitch)
        if on:assert key not in held,(path.name,tick,key);held.add(key);notes+=1
        else:assert key in held,(path.name,tick,key);held.remove(key)
    assert not held and pos==len(data) and len(set(endings))==1 and len(endings)==tracks
    assert len(tempos)==1 and tempos[0][0]==0
    reports.append({'file':path.name,'tracks':tracks,'notes':notes,'seconds':endings[0]/ppq*tempos[0][1]/1000000,'overlaps':0,'hangingNotes':0})
(ROOT/'music/serialized-midi-validation.json').write_text(json.dumps(reports,indent=2)+'\n')
print(json.dumps(reports,indent=2))
