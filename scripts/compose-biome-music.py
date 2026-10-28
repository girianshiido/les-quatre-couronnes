"""Five original paired map loops. GM programs are zero-based; no brass fanfare.

Each pair shares its tempo, metre, harmonic form and exact loop length, allowing
the game to crossfade on a bar without resetting the musical clock.
"""
import json
from pathlib import Path
from midi_score import Score, ROOT

OUT = ROOT / 'qa/biome-music'
OUT.mkdir(parents=True, exist_ok=True)
REPORTS = []

def save(score, slug, rising):
    name = f'carte-{slug}-{"essor" if rising else "normal"}'
    report = score.write(ROOT / f'music/{name}.mid')
    score.write(OUT / f'{name}-render.mid', cycles=3)
    report.update(biome=slug, mood='essor' if rising else 'normal',
                  beatsPerBar=score.beats, signature=list(score.signature))
    REPORTS.append(report)

def drum(s, bar, hits):
    for pitch, beat, vel in hits:
        s.note(9, pitch, bar*s.beats+beat, .08, vel)

def forest(rising):
    s=Score('La futaie en marche' if rising else 'Sous les branches',100,32,1,[
        ('Flute des sentiers',0,73,95,48),('Guitare nylon',1,24,86,36),
        ('Basse boisee',2,32,88,64),('Cordes pizzicato',3,45,74,88),
        ('Petites percussions',9,0,65,64)],3,(6,3))
    chords=[(43,[55,59,62]),(38,[54,57,62]),(40,[55,59,64]),(36,[55,60,64]),
            (43,[55,59,62]),(45,[57,60,64]),(38,[54,57,62]),(43,[55,59,62])]
    # A lilting call, an answering descent, then a higher refrain.
    a=[[(74,.5),(76,.5),(79,1),(78,.5),(76,.5)],
       [(74,1),(69,.5),(74,.5),(None,1)],
       [(71,.5),(74,.5),(76,.5),(79,.5),(76,1)],
       [(76,1),(74,.5),(72,.5),(None,1)],
       [(74,.5),(76,.5),(79,.5),(83,.5),(81,.5),(79,.5)],
       [(76,1),(72,.5),(69,.5),(72,.5),(76,.5)],
       [(78,.5),(76,.5),(74,1),(69,.5),(72,.5)],
       [(71,1.5),(67,.5),(None,1)]]
    b=[[(79,1),(83,.5),(81,.5),(79,.5),(74,.5)],
       [(78,.5),(81,.5),(86,1),(81,.5),(78,.5)],
       [(83,1),(79,.5),(76,.5),(74,.5),(71,.5)],
       [(76,.5),(79,.5),(84,1),(83,.5),(79,.5)],
       [(83,.5),(81,.5),(79,.5),(74,.5),(76,.5),(79,.5)],
       [(81,1),(76,.5),(72,.5),(69,.5),(72,.5)],
       [(74,.5),(78,.5),(81,.5),(78,.5),(74,.5),(72,.5)],
       [(71,1),(74,.5),(79,.5),(None,1)]]
    for bar in range(32):
        root,ch=chords[bar%8]; t=bar*3
        phrase=(b if (bar//8)%2 else a)[bar%8]
        if rising and bar//8 in (0,2): phrase=b[bar%8]
        s.phrase(0,bar,phrase,78 if rising else 72)
        for k in range(6):s.note(1,ch[[0,1,2,1,0,2][k]],t+k*.5,.42,62+(k%3)*4)
        s.note(2,root,t,1.25,70);s.note(2,root+7,t+1.5,1.25,63)
        for k in ([0,1,2,3,4,5] if rising else [0,3]):
            s.note(3,ch[(k+bar)%3]+12,t+k*.5,.3,55 if rising else 46)
        drum(s,bar,[(64,0,58),(54,1,34),(63,1.5,48),(54,2.5,38)])
    save(s,'foret',rising)

def desert(rising):
    s=Score('Les caravanes du soleil' if rising else 'Sept pas dans les dunes',120,24,-2,[
        ('Oud de nylon',0,24,101,48),('Sitar des dunes',1,104,75,92),
        ('Bourdon de contrebasse',2,32,91,64),('Dulcimer',3,15,68,28),
        ('Flute de roseau',4,75,72,76),('Peaux et tambourin',9,0,78,64)],3.5,(7,3),True)
    chords=[(38,[50,54,57]),(39,[51,55,58]),(38,[50,54,57]),(36,[48,52,55]),
            (43,[50,55,58]),(39,[51,55,58]),(45,[49,52,57]),(38,[50,54,57])]
    a=[[(74,.5),(75,.5),(78,.5),(81,1),(78,.5),(75,.5)],
       [(79,.5),(77,.5),(75,1),(70,.5),(None,1)],
       [(74,.5),(78,.5),(81,.5),(86,.5),(81,.5),(78,.5),(74,.5)],
       [(79,1),(76,.5),(72,.5),(70,.5),(None,1)],
       [(79,.5),(82,.5),(86,1),(82,.5),(79,.5),(77,.5)],
       [(75,.5),(79,.5),(82,.5),(79,.5),(75,1),(None,.5)],
       [(73,.5),(76,.5),(81,1),(79,.5),(76,.5),(73,.5)],
       [(74,1.5),(78,.5),(75,.5),(74,.5),(None,.5)]]
    b=[[(81,.5),(86,.5),(87,.5),(86,.5),(81,.5),(78,1)],
       [(82,1),(79,.5),(77,.5),(75,1),(None,.5)],
       [(78,.5),(81,.5),(86,1),(87,.5),(86,.5),(81,.5)],
       [(84,.5),(79,.5),(76,.5),(79,1),(72,.5),(None,.5)],
       [(82,.5),(86,.5),(89,1),(86,.5),(82,.5),(79,.5)],
       [(87,1),(82,.5),(79,.5),(75,.5),(79,.5),(82,.5)],
       [(85,.5),(81,.5),(76,.5),(73,.5),(76,.5),(79,.5),(81,.5)],
       [(86,1),(81,.5),(78,.5),(75,.5),(74,1)]]
    for bar in range(24):
        root,ch=chords[bar%8];t=bar*3.5
        s.phrase(0,bar,(b if rising or bar//8==1 else a)[bar%8],85 if rising else 76)
        s.note(2,root,t,1.3,69);s.note(2,root+7,t+1.5,.85,60);s.note(2,root,t+2.5,.85,65)
        for k in range(7):s.note(1,ch[[0,2,1,0,2,1,2][k]]+12,t+k*.5,.34,44+(k%3)*5)
        for k in ([0,1,2,3,4,5,6] if rising else [0,3,5]):
            s.note(3,ch[k%3]+24,t+k*.5,.36,48)
        if rising or 8<=bar<16:
            s.note(4,ch[1]+12,t+1.5,.8,51);s.note(4,ch[2]+12,t+2.5,.8,54)
        drum(s,bar,[(64,0,70),(62,1,47),(63,1.5,65),(54,2,45),(64,2.5,64),(62,3,43)])
    save(s,'desert',rising)

def snow(rising):
    s=Score('La danse des aurores' if rising else 'Les flocons voyageurs',96,24,-3,[
        ('Celesta',0,8,99,54),('Harpe',1,46,79,30),('Cordes de neige',2,48,69,80),
        ('Contrebasse',3,32,80,62),('Flute des aurores',4,73,77,74),
        ('Glockenspiel',5,9,57,44)],3,(3,2))
    chords=[(39,[55,58,63]),(34,[53,58,62]),(36,[55,60,63]),(32,[56,60,63]),
            (39,[55,58,63]),(41,[56,60,65]),(34,[53,58,62]),(39,[55,58,63])]
    a=[[(79,1.5),(77,.5),(75,1)],[(74,.5),(77,.5),(82,1),(None,1)],
       [(79,.5),(84,1),(82,.5),(79,1)],[(80,1),(79,.5),(77,.5),(75,1)],
       [(79,.5),(82,.5),(87,1.5),(86,.5)],[(84,1),(80,.5),(77,.5),(None,1)],
       [(82,.5),(80,.5),(77,.5),(74,.5),(77,1)],[(75,2),(None,1)]]
    b=[[(87,1),(82,.5),(79,.5),(82,1)],[(86,.5),(82,.5),(77,1),(74,1)],
       [(84,1.5),(87,.5),(91,1)],[(92,.5),(87,.5),(84,.5),(80,.5),(79,1)],
       [(87,.5),(86,.5),(82,.5),(79,.5),(82,.5),(87,.5)],
       [(89,1),(84,.5),(80,.5),(77,1)],[(86,1),(82,.5),(80,.5),(77,1)],
       [(79,.5),(82,.5),(87,1),(None,1)]]
    for bar in range(24):
        root,ch=chords[bar%8];t=bar*3
        s.phrase(0,bar,(b if rising or bar//8==1 else a)[bar%8],72)
        s.note(3,root,t,2.7,64)
        for p in ch:s.note(2,p,t+.1,2.7,39 if rising else 34)
        for k in range(6):s.note(1,ch[k%3]+12,t+k*.5,.44,51+(k%2)*5)
        if rising:
            s.phrase(4,bar,a[bar%8],55,transpose=-12)
            for k in (0,2,4):s.note(5,ch[k%3]+24,t+k*.5,.42,40)
        elif bar%4==3:s.note(5,ch[2]+24,t+2,.7,35)
    save(s,'neige',rising)

def marsh(rising):
    s=Score('La ronde du delta' if rising else 'Au fil des marees',80,16,-2,[
        ('Marimba',0,12,99,44),('Cor anglais',1,69,86,78),('Basse du delta',2,32,91,60),
        ('Vibraphone de verre',3,11,62,95),('Cordes de brume',4,49,64,28),
        ('Bois et peaux',9,0,72,64)],4,(4,2),True)
    chords=[(36,[48,51,55]),(41,[53,57,60]),(34,[50,53,58]),(43,[53,55,62]),
            (36,[48,51,55]),(38,[50,53,57]),(41,[53,57,60]),(43,[53,55,62])]
    a=[[(72,.75),(79,.75),(75,.5),(74,.5),(72,1),(None,.5)],
       [(69,1),(72,.5),(77,1),(75,.5),(72,.5),(None,.5)],
       [(74,.75),(77,.75),(82,.5),(81,.5),(77,1),(None,.5)],
       [(79,1.5),(77,.5),(74,.5),(71,.5),(None,1)],
       [(75,.5),(79,.5),(84,1.5),(82,.5),(79,1)],
       [(81,.75),(77,.75),(74,.5),(72,1),(69,.5),(None,.5)],
       [(72,1),(77,.5),(81,.5),(84,.5),(81,.5),(77,1)],
       [(79,1),(74,.5),(71,.5),(72,1),(None,1)]]
    b=[[(84,.75),(79,.75),(75,.5),(79,.5),(82,.5),(84,1)],
       [(81,1),(84,.5),(89,.5),(84,1),(81,.5),(77,.5)],
       [(82,.75),(77,.75),(74,.5),(77,.5),(81,.5),(82,1)],
       [(86,1),(83,.5),(79,.5),(77,1),(74,.5),(71,.5)],
       [(84,.5),(87,.5),(86,.5),(84,.5),(79,1),(75,.5),(79,.5)],
       [(81,1.5),(77,.5),(74,.5),(77,.5),(81,1)],
       [(84,1),(81,.5),(77,.5),(72,.5),(77,.5),(81,.5),(84,.5)],
       [(86,.5),(83,.5),(79,1),(74,.5),(71,.5),(72,1)]]
    for bar in range(16):
        root,ch=chords[bar%8];t=bar*4
        s.phrase(0,bar,(b if rising and bar>=8 else a)[bar%8],73)
        for at,p in [(0,root),(1.5,root+7),(3,root+12)]:s.note(2,p,t+at,.65,67)
        for p in ch:s.note(4,p+12,t,.0+3.7,32)
        for k in ([0,1.5,2.5,3] if rising else [0,1.5,3]):
            s.note(3,ch[int(k)%3]+24,t+k,.62,44)
        if rising or bar//8==1:s.phrase(1,bar,a[bar%8],51,transpose=-12)
        drum(s,bar,[(64,0,62),(76,.75,36),(63,1.5,52),(77,2.25,32),(64,3,57),(76,3.5,35)])
    save(s,'marais',rising)

def crystal(rising):
    s=Score('Les cinq eclats' if rising else 'Le jardin des prismes',120,16,5,[
        ('Boite a musique',0,10,95,56),('Cristal',1,98,67,87),('Celesta',2,8,75,29),
        ('Basse electrique ronde',3,33,80,64),('Nappe de cristal',4,88,55,74),
        ('Vibraphone',5,11,72,40)],5,(5,2))
    chords=[(35,[54,58,63]),(42,[54,58,61]),(44,[56,59,63]),(40,[56,59,63]),
            (35,[54,58,63]),(37,[56,61,65]),(42,[54,58,61]),(35,[54,58,63])]
    a=[[(83,.5),(78,.5),(82,1),(85,1.5),(83,.5),(78,1)],
       [(85,1),(82,.5),(78,.5),(73,1),(78,1),(None,1)],
       [(80,.5),(83,.5),(87,1),(92,1.5),(87,.5),(83,1)],
       [(88,1.5),(87,.5),(83,1),(80,.5),(78,.5),(None,1)],
       [(83,.5),(85,.5),(90,1),(94,1),(90,.5),(85,.5),(83,1)],
       [(85,1),(89,.5),(92,.5),(97,1),(92,1),(None,1)],
       [(94,.5),(90,.5),(85,1),(82,1),(78,.5),(82,.5),(85,1)],
       [(83,2),(78,.5),(82,.5),(83,1),(None,1)]]
    b=[[(95,1),(90,.5),(87,.5),(83,1),(85,.5),(90,.5),(95,1)],
       [(94,.5),(90,.5),(85,1),(82,.5),(85,.5),(90,1),(None,1)],
       [(92,.5),(87,.5),(83,1),(80,.5),(83,.5),(87,.5),(92,.5),(95,1)],
       [(100,1),(95,.5),(92,.5),(88,1),(87,.5),(83,.5),(80,1)],
       [(95,.5),(94,.5),(90,1),(87,.5),(90,.5),(94,.5),(95,.5),(90,1)],
       [(97,1),(92,.5),(89,.5),(85,1),(89,.5),(92,.5),(97,1)],
       [(94,.5),(90,.5),(85,.5),(82,.5),(78,1),(82,.5),(85,.5),(90,1)],
       [(95,1),(90,.5),(87,.5),(83,2),(None,1)]]
    for bar in range(16):
        root,ch=chords[bar%8];t=bar*5
        s.phrase(0,bar,(b if rising else a)[bar%8],69 if rising else 64)
        for p in ch:s.note(4,p,t,4.7,29)
        for k in range(10):s.note(2,ch[[0,2,1,2,0][k%5]]+12,t+k*.5,.36,44+(k%2)*5)
        for at,p in [(0,root),(2,root+7),(3.5,root+12)]:s.note(3,p,t+at,1.25,63)
        for at,p in [(0,ch[2]+24),(2,ch[1]+24),(3.5,ch[0]+24)]:s.note(1,p,t+at,.8,40)
        if rising:s.phrase(5,bar,a[bar%8],49,transpose=-12)
    save(s,'cristal',rising)

for composer in (forest,desert,snow,marsh,crystal):
    for rising in (False,True):composer(rising)
(ROOT/'music/biome-midi-validation.json').write_text(json.dumps(REPORTS,indent=2)+'\n')
print(json.dumps(REPORTS,indent=2))
