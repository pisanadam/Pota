from pathlib import Path
import base64,json
root=Path(__file__).resolve().parent
src=root/'src'
sample_root=root/'vendor'/'audio'
samples={p.stem:base64.b64encode(p.read_bytes()).decode('ascii') for p in sorted(sample_root.glob('*.wav'))}
licenses=json.loads((sample_root/'provenance.json').read_text()) if (sample_root/'provenance.json').exists() else []
(src/'audio-samples.js').write_text('/* Embedded recorded audio. Sources and licenses: vendor/audio/provenance.json */\nwindow.PotaAudioSamples='+json.dumps(samples,separators=(',',':'))+';\nwindow.PotaAudioLicenses='+json.dumps(licenses,ensure_ascii=False,separators=(',',':'))+';\n')
html=(src/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="style.css">','<style>\n'+(src/'style.css').read_text()+'\n</style>')
for name,path in [('three.min.js',root/'vendor'/'three.min.js'),('physics.js',src/'physics.js'),('net.js',src/'net.js'),('graphics.js',src/'graphics.js'),('weather.js',src/'weather.js'),('scene.js',src/'scene.js'),('compat-scene.js',src/'compat-scene.js'),('audio-samples.js',src/'audio-samples.js'),('audio.js',src/'audio.js'),('shop.js',src/'shop.js'),('rewards.js',src/'rewards.js'),('fairplay.js',src/'fairplay.js'),('rewarded.js',src/'rewarded.js'),('game.js',src/'game.js')]:
    script=path.read_text().replace('</script','<\\/script')
    ref=('../vendor/' if name=='three.min.js' else '')+name
    html=html.replace('<script src="'+ref+'"></script>','<script>\n'+script+'\n</script>')
path=root/'android'/'app'/'src'/'main'/'assets'/'index.html'
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(html)
assert html.count('src="')==0,'An external script was left in the Android asset'
print('Internal Android game asset ready:',len(html.encode()),'bytes. No standalone HTML exported.')
