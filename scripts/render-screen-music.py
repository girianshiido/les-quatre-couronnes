"""Keep a settled middle cycle, including reverb; encode and validate three loops."""
import json, math, subprocess, wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parent.parent
RATE=44100
reports=[]
for name,seconds,target in [('titre',60,.10),('victoire-finale',30,.115),('defaite',36,.085)]:
    frames=seconds*RATE
    with wave.open(str(ROOT/f'qa/screen-music/{name}-render.wav'),'rb') as w:
        assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(RATE,2,2)
        raw=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).astype(np.float64)/32768
    assert len(raw)>=frames*3 and np.max(np.abs(raw))<.99
    pcm=raw[frames:frames*2].copy();n=round(.04*RATE)
    mix=(.5-.5*np.cos(np.linspace(0,math.pi,n)))[:,None]
    pcm[:n]=raw[frames*2:frames*2+n]*(1-mix)+pcm[:n]*mix
    pcm*=min(target/np.sqrt(np.mean(pcm**2)),.79/np.max(np.abs(pcm)))
    wav=ROOT/f'qa/screen-music/{name}-loop.wav'
    with wave.open(str(wav),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE)
        w.writeframes(np.rint(pcm*32767).astype('<i2').tobytes())
    ogg=ROOT/f'public/audio/ecran-{name}.ogg'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libvorbis','-q:a','5','-metadata',f'title={name}','-metadata','artist=Les Quatre Couronnes',str(ogg)],check=True)
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',str(ogg)]))
    stream=info['streams'][0];assert (stream['codec_name'],stream['sample_rate'],stream['channels'])==('vorbis',str(RATE),2)
    dec=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(ogg),'-f','f32le','-acodec','pcm_f32le','-']),dtype='<f4').reshape(-1,2)
    assert len(dec)==frames and np.isfinite(dec).all() and np.max(np.abs(dec))<1
    block=round(.05*RATE);windows=np.sqrt(np.mean(dec.reshape(-1,block,2)**2,axis=(1,2)))
    assert windows.min()>.001
    reports.append({'file':str(ogg.relative_to(ROOT)),'seconds':seconds,'channels':2,'sampleRate':RATE,'codec':'vorbis',
        'peakDbFS':round(20*math.log10(float(np.max(np.abs(dec)))),2),'rmsDbFS':round(20*math.log10(float(np.sqrt(np.mean(dec**2)))),2),
        'quietest50msDbFS':round(20*math.log10(float(windows.min())),2),'seamJump':float(np.max(np.abs(dec[0]-dec[-1]))),'clippedSamples':0})
(ROOT/'music/screen-audio-validation.json').write_text(json.dumps(reports,indent=2)+'\n')
print(json.dumps(reports,indent=2))
