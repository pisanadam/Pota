#!/usr/bin/env bash
set -euo pipefail
tools_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# Python preserves the inherited HTTPS proxy and CA trust. Every archive is pinned.
python3 - "$tools_root" <<'PY'
import hashlib,pathlib,sys,urllib.request,zipfile,os
root=pathlib.Path(sys.argv[1]);(root/'downloads').mkdir(parents=True,exist_ok=True)
items=[
 ('https://dl.google.com/android/repository/platform-36_r02.zip','platform-36.zip','37607369a28c5b640b3a7998868d45898ebcb777565a0e85f9acf36f29631d2e',root/'platforms',root/'platforms/android-36/android.jar'),
 ('https://dl.google.com/android/repository/build-tools_r36_linux.zip','build-tools-36.zip','5d9ac77fb6ff43d9da518a337b4fcf8f9097113df531d99ccefe80ef7ce8250b',root/'build-tools',root/'build-tools/36.0.0/aapt2'),
 ('https://downloads.gradle.org/distributions/gradle-8.14.3-bin.zip','gradle-8.14.3-bin.zip','bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531',root,root/'gradle-8.14.3/bin/gradle'),
 ('https://github.com/google/bundletool/releases/download/1.18.3/bundletool-all-1.18.3.jar','bundletool-all-1.18.3.jar','a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29',None,root/'bundletool-all-1.18.3.jar')]
for url,name,digest,dest,installed in items:
 if installed.exists():continue
 archive=(root/'downloads'/name) if dest else installed
 if not archive.exists():urllib.request.urlretrieve(url,archive)
 assert hashlib.sha256(archive.read_bytes()).hexdigest()==digest,'Checksum mismatch: '+name
 if dest:
  with zipfile.ZipFile(archive) as z:z.extractall(dest)
  if name=='platform-36.zip':
   for p in dest.iterdir():
    if p.name.startswith('android-36') and p.name!='android-36':p.rename(dest/'android-36')
  if name=='build-tools-36.zip':
   for p in dest.iterdir():
    if (p/'source.properties').exists() and 'Pkg.Revision=36.0.0' in (p/'source.properties').read_text() and p.name!='36.0.0':p.rename(dest/'36.0.0')
for p in [root/'gradle-8.14.3/bin/gradle',*(root/'build-tools/36.0.0').glob('*')]:
 if p.is_file() and not p.suffix:p.chmod(0o700)
print('Pinned Android36, Gradle8.14.3 and bundletool1.18.3 ready.')
PY
