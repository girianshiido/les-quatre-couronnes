"""Assemble seamless, phase-compatible loops from the middle of three MIDI cycles.

First render qa/music/{normal,victory}-render.wav with FluidSynth; see music/README.md.
No ending fade: these files are designed to wrap while the game is running.
"""
import json, math, subprocess, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RATE = 44100
FRAMES = RATE * 64

def write(path, samples):
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(RATE)
        wav.writeframes(np.rint(samples * 32767).astype('<i2').tobytes())

def encode(source, target, title):
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-c:a','libvorbis','-q:a','5',
                    '-metadata',f'title={title}','-metadata','artist=Les Quatre Couronnes',str(target)],check=True)

loops = []
reports = []
for raw, name, target_rms in [('normal','normal',.10),('victory','victoire',.115)]:
    with wave.open(str(ROOT/f'qa/music/{raw}-render.wav'),'rb') as wav:
        assert (wav.getframerate(),wav.getnchannels(),wav.getsampwidth()) == (RATE,2,2)
        samples=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').reshape(-1,2).astype(np.float64)/32768
    assert len(samples) >= FRAMES*3
    assert np.max(np.abs(samples)) < .99, 'FluidSynth clipped: lower synth gain before encoding'
    loop=samples[FRAMES:2*FRAMES].copy()
    # Carry the exact following-cycle attack across the seam, then blend into the
    # settled middle cycle. Chorus/reverb vary slightly between otherwise identical cycles.
    n=round(.04*RATE)
    blend=(.5-.5*np.cos(np.linspace(0,math.pi,n)))[:,None]
    loop[:n]=samples[FRAMES*2:FRAMES*2+n]*(1-blend)+loop[:n]*blend
    gain=min(target_rms/np.sqrt(np.mean(loop**2)),.79/np.max(np.abs(loop)))
    loop*=gain
    wavpath=ROOT/f'qa/music/theme-{name}.wav'
    write(wavpath,loop)
    oggpath=ROOT/f'public/audio/theme-{name}.ogg'
    encode(wavpath,oggpath,f'Les chemins de la couronne — {name}')
    decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(oggpath),'-f','f32le','-acodec','pcm_f32le','-'])
    pcm=np.frombuffer(decoded,dtype='<f4').reshape(-1,2)
    assert len(pcm)==FRAMES and np.isfinite(pcm).all()
    peak=float(np.max(np.abs(pcm))); assert peak<1
    block=round(.05*RATE)
    windows=np.sqrt(np.mean(pcm[:len(pcm)//block*block].reshape(-1,block,2)**2,axis=(1,2)))
    assert float(windows.min())>.001, 'Unexpected silent gap'
    reports.append({'file':str(oggpath.relative_to(ROOT)),'seconds':len(pcm)/RATE,'codec':'vorbis',
                    'sampleRate':RATE,'channels':2,'peakDbFS':round(20*math.log10(peak),2),
                    'rmsDbFS':round(20*math.log10(float(np.sqrt(np.mean(pcm**2)))),2),
                    'quietest50msDbFS':round(20*math.log10(float(windows.min())),2),
                    'seamJump':float(np.max(np.abs(pcm[0]-pcm[-1]))),'clippedSamples':int(np.sum(np.abs(pcm)>=1))})
    loops.append(loop)

# Listening edition: one complete normal cycle, then a two-second bar-aligned
# crossfade into the victory cycle. Same transition and phase as the game.
preview=np.concatenate(loops)
fade=np.linspace(0,1,RATE*2)[:,None]
preview[FRAMES:FRAMES+len(fade)]=loops[0][:len(fade)]*(1-fade)+loops[1][:len(fade)]*fade
write(ROOT/'qa/music/preview.wav',preview)
encode(ROOT/'qa/music/preview.wav',ROOT/'music/les-chemins-de-la-couronne.ogg','Les chemins de la couronne — carte et victoire')
(ROOT/'music/audio-validation.json').write_text(json.dumps(reports,indent=2)+'\n')
print(json.dumps(reports,indent=2))
