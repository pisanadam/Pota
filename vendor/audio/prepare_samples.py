#!/usr/bin/env python3
"""Reproduce the compact game samples from the retained CC0 Freesound previews.
Requires Python 3, numpy, scipy and ffmpeg. No generated sound is added.
"""
from pathlib import Path
import hashlib, json, subprocess, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, stft, istft

HERE = Path(__file__).resolve().parent
RATE = 32000
SOURCES = {
 '401622': dict(author='Roxis_Boy', title='Chain Rattling - 1', page='https://freesound.org/people/Roxis_Boy/sounds/401622/', preview='https://cdn.freesound.org/previews/401/401622_7516983-hq.mp3', description='Real chains rattled outdoors with varying intensity, recorded using a Zoom H6.'),
 '871036': dict(author='funkysandwich', title='metal_chain_pickup2', page='https://freesound.org/people/funkysandwich/sounds/871036/', preview='https://cdn.freesound.org/previews/871/871036_7118171-hq.mp3', description='Small metal chain with a connected metal piece being picked up; Sony PCM field recorder.'),
 '505628': dict(author='Blankened', title='BasketballBounce.wav', page='https://freesound.org/people/Blankened/sounds/505628/', preview='https://cdn.freesound.org/previews/505/505628_6512859-hq.mp3', description='Single basketball bounce recorded by the uploader.'),
 '262506': dict(author='OBXJohn', title='Basketball dribbling and shooting', page='https://freesound.org/people/OBXJohn/sounds/262506/', preview='https://cdn.freesound.org/previews/262/262506_3719168-hq.mp3', description='Field recording of one player dribbling and shooting in an open gym; uploader notes a quiet light hum.'),
 '244348': dict(author='reedhos', title='basketball.wav', page='https://freesound.org/people/reedhos/sounds/244348/', preview='https://cdn.freesound.org/previews/244/244348_4468535-hq.mp3', description='Uploader hitting a basketball rim with a basketball, recorded using a Samsung Galaxy S3.'),
 '381410': dict(author='fattirewhitey', title='Outdoor Basketball Shot.wav', page='https://freesound.org/people/fattirewhitey/sounds/381410/', preview='https://cdn.freesound.org/previews/381/381410_4838185-hq.mp3', description='Zoom H4N field recording of basketball in a driveway: nylon net, metal rim, rubber ball; uploader says the clip starts with a swish.'),
 '716930': dict(author='vhschool2019', title='Basketball Swish', page='https://freesound.org/people/vhschool2019/sounds/716930/', preview='https://cdn.freesound.org/previews/716/716930_9589340-hq.mp3', description='Basketball swish recorded by uploader with an iPad.'),
}
# Timing is in the decoded public HQ MP3 preview, not the original WAV.
CLIPS = [
 ('chain1','401622',6.18,6.90,220,False),
 ('chain2','401622',4.72,5.25,220,False),
 ('chain3','871036',.42,1.24,220,False),
 ('bounce1','505628',.027,.231,45,False),
 ('bounce2','262506',33.343,33.728,55,False),
 ('rim1','244348',.151,.766,75,False),
 ('rim2','244348',3.162,3.732,75,False),
 ('swish1','381410',.135,.590,160,True),
 ('swish2','716930',.105,.485,120,False),
]

def decode(file):
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        subprocess.run(['ffmpeg','-y','-v','error','-i',str(file),'-ac','1','-ar',str(RATE),tmp.name],check=True)
        rate, signal=wavfile.read(tmp.name)
    return signal.astype(np.float64)/32768

cache={}
manifest={'schema':1,'license':'CC0-1.0','licenseURL':'https://creativecommons.org/publicdomain/zero/1.0/', 'retrieved':'2026-10-17','encoding':{'format':'WAVE PCM16','sampleRate':RATE,'channels':1},'note':'Authentic recordings, edited for short interactive playback. Public HQ MP3 previews are the retained source files; these are not original lossless downloads. No synthetic sound has been added to these assets. Runtime spatial filtering and room acoustics are separate from the recordings.','sources':{},'samples':{}}
for sourceid, meta in SOURCES.items():
    original=HERE/'originals'/f'{sourceid}-hq.mp3'
    manifest['sources'][sourceid]={**meta,'license':'CC0-1.0','licenseURL':manifest['licenseURL'],'retainedFile':str(original.relative_to(HERE)),'sha256':hashlib.sha256(original.read_bytes()).hexdigest()}
    cache[sourceid]=decode(original)
for key,sourceid,start,end,hp,denoise in CLIPS:
    source=cache[sourceid]
    signal=source[round(start*RATE):round(end*RATE)].copy()
    signal-=np.mean(signal)
    edits=[f'Trimmed decoded preview from {start:.3f}s to {end:.3f}s','Downmixed to mono and resampled to 32000 Hz','Removed DC offset',f'High-pass filter at {hp} Hz; low-pass at 11800 Hz']
    filt=butter(2,[hp,11800],btype='bandpass',fs=RATE,output='sos')
    signal=sosfilt(filt,signal)
    if denoise:
        # Conservative stationary-noise attenuation, retaining the original phase.
        noise=sosfilt(filt,source[round(1.02*RATE):round(1.42*RATE)])
        _,_,nf=stft(noise,fs=RATE,nperseg=512,noverlap=384)
        floor=np.quantile(np.abs(nf)**2,.75,axis=1)
        _,_,spectrum=stft(signal,fs=RATE,nperseg=512,noverlap=384)
        power=np.abs(spectrum)**2
        gain=np.sqrt(np.maximum(power-.8*floor[:,None],0)/(power+1e-15))
        gain=np.clip(gain,.35,1.)
        _,clean=istft(spectrum*gain,fs=RATE,nperseg=512,noverlap=384)
        signal=clean[:len(signal)]
        edits.append('Reduced stationary outdoor noise using a conservative spectral gain (maximum reduction 9.1 dB), reference 1.02-1.42s')
    fadein=round((.004 if key.startswith('swish') else .001)*RATE)
    fadeout=round((.035 if key.startswith('swish') else .025)*RATE)
    signal[:fadein]*=np.linspace(0,1,fadein)
    signal[-fadeout:]*=np.linspace(1,0,fadeout)
    peak=float(np.max(np.abs(signal)))
    signal*=.90/peak
    pcm=np.round(np.clip(signal,-1,1)*32767).astype(np.int16)
    path=HERE/f'{key}.wav';wavfile.write(path,RATE,pcm)
    edits+=['Applied short click-free edge fades','Peak-normalized to -0.92 dBFS','Encoded as 16-bit PCM WAV']
    manifest['samples'][key]={'file':path.name,'source':sourceid,'sourceURL':SOURCES[sourceid]['page'],'author':SOURCES[sourceid]['author'],'license':'CC0-1.0','startSeconds':start,'endSeconds':end,'durationSeconds':len(pcm)/RATE,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'peak':float(np.max(np.abs(pcm.astype(float)))/32768),'rms':float(np.sqrt(np.mean((pcm.astype(float)/32768)**2))),'edits':edits}
(HERE/'provenance.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:{'file':v['file'],'duration':v['durationSeconds'],'bytes':v['bytes'],'rms':round(v['rms'],4)} for k,v in manifest['samples'].items()},indent=2))
