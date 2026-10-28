"""Render paired MIDI loops with MuseScore General HQ; validate decoded OGGs."""
import concurrent.futures, json, math, subprocess, sys, wave
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parent.parent
SF=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT.parent/'science-fantasy-jrpg/soundfonts/MuseScore_General_HQ.sf2'
assert SF.is_file(), SF
RATE=44100
tracks=json.loads((ROOT/'music/biome-midi-validation.json').read_text())

def render(track):
    name=Path(track['file']).stem
    stem=ROOT/f'qa/biome-music/{name}'
    wav=Path(str(stem)+'-render.wav')
    with Path(str(stem)+'.log').open('w') as log:
        subprocess.run(['fluidsynth','-ni','-g','0.55','-R','1','-C','1',
            '-o','synth.reverb.room-size=0.35','-o','synth.reverb.damp=0.45',
            '-o','synth.reverb.level=0.23','-o','synth.chorus.level=0.10',
            '-F',str(wav),'-r',str(RATE),str(SF),str(stem)+'-render.mid'],
            check=True,stdout=log,stderr=subprocess.STDOUT)
    frames=round(track['seconds']*RATE)
    with wave.open(str(wav),'rb') as w:
        assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(RATE,2,2)
        raw=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).astype(np.float64)/32768
    assert len(raw)>=frames*3 and np.max(np.abs(raw))<.99, name
    pcm=raw[frames:frames*2].copy();n=round(.04*RATE)
    mix=(.5-.5*np.cos(np.linspace(0,math.pi,n)))[:,None]
    pcm[:n]=raw[frames*2:frames*2+n]*(1-mix)+pcm[:n]*mix
    target=.108 if track['mood']=='essor' else .095
    pcm*=min(target/np.sqrt(np.mean(pcm**2)),.79/np.max(np.abs(pcm)))
    loop=Path(str(stem)+'-loop.wav')
    with wave.open(str(loop),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE)
        w.writeframes(np.rint(pcm*32767).astype('<i2').tobytes())
    # The newer forest pair is archived; the first biome uses the original.
    ogg=ROOT/(f'music/{name}.ogg' if track['biome']=='foret' else f'public/audio/{name}.ogg')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(loop),'-c:a','libvorbis','-q:a','5',
        '-metadata',f'title={track["title"]}','-metadata','artist=Les Quatre Couronnes',str(ogg)],check=True)
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries',
        'format=duration:stream=codec_name,sample_rate,channels','-of','json',str(ogg)]))
    st=info['streams'][0]
    assert (st['codec_name'],st['sample_rate'],st['channels'])==('vorbis',str(RATE),2)
    dec=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(ogg),'-f','f32le','-acodec','pcm_f32le','-']),dtype='<f4').reshape(-1,2)
    assert len(dec)==frames and np.isfinite(dec).all() and np.max(np.abs(dec))<1, name
    block=round(.05*RATE)
    windows=np.sqrt(np.mean(dec[:len(dec)//block*block].reshape(-1,block,2)**2,axis=(1,2)))
    assert windows.min()>.001, (name,windows.min())
    report={'file':str(ogg.relative_to(ROOT)),'seconds':track['seconds'],'channels':2,'sampleRate':RATE,'codec':'vorbis',
        'peakDbFS':round(20*math.log10(float(np.max(np.abs(dec)))),2),
        'rmsDbFS':round(20*math.log10(float(np.sqrt(np.mean(dec**2)))),2),
        'quietest50msDbFS':round(20*math.log10(float(windows.min())),2),
        'seamJump':float(np.max(np.abs(dec[0]-dec[-1]))),'clippedSamples':0}
    print(f'{name}: {track["seconds"]}s, peak {report["peakDbFS"]} dBFS, loop OK',flush=True)
    return report

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    reports=list(pool.map(render,tracks))
(ROOT/'music/biome-audio-validation.json').write_text(json.dumps(reports,indent=2)+'\n')
