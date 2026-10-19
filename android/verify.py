#!/usr/bin/env python3
"""Verify release identity, native SDK packaging and exact internal game assets."""
import hashlib,json,pathlib,re,subprocess,sys,zipfile,shutil,os
root=pathlib.Path(__file__).resolve().parent
source,apk,aab=map(pathlib.Path,sys.argv[1:])
report_dir=root/'build';report_dir.mkdir(exist_ok=True)
tools=root/'tools/build-tools/36.0.0'
expected_cert='63bb7a92b5f55cd58f93d54bc3008a14a8f1adc92a2011bab97df1bd5f014a81'
build_config=(root/'app/build.gradle').read_text()
version_code=int(re.search(r'\bversionCode\s+(\d+)',build_config).group(1))
version_name=re.search(r"\bversionName\s+'([^']+)'",build_config).group(1)
def java_tool(name):
 found=shutil.which(name)
 if found:return found
 jdk=os.environ.get('JAVA_HOME')
 if jdk and (pathlib.Path(jdk)/'bin'/name).exists():return str(pathlib.Path(jdk)/'bin'/name)
 candidates=list((root/'tools/jdk').glob('*/bin/'+name))
 assert candidates,'Full JDK required for '+name
 return str(candidates[0])
def run(args):return subprocess.run([str(x) for x in args],check=True,capture_output=True,text=True).stdout
signature=run([tools/'apksigner','verify','--verbose','--print-certs',apk]);(report_dir/'signature-verification.txt').write_text(signature)
assert 'Signer #1 certificate SHA-256 digest: '+expected_cert in signature
for line in ['Verified using v1 scheme (JAR signing): true','Verified using v2 scheme (APK Signature Scheme v2): true','Verified using v3 scheme (APK Signature Scheme v3): true']:assert line in signature,line
run([tools/'zipalign','-c','-P','16','4',apk])
badging=run([tools/'aapt2','dump','badging',apk]);(report_dir/'apk-badging.txt').write_text(badging)
assert f"package: name='com.pota.court' versionCode='{version_code}' versionName='{version_name}'" in badging
assert "minSdkVersion:'23'" in badging and "targetSdkVersion:'36'" in badging
permissions=re.findall(r"uses-permission: name='([^']+)'",badging)
assert permissions == ['android.permission.VIBRATE'], 'Offline release gained unexpected permissions' 
expected=source.read_bytes();native=[]
for path,asset in [(apk,'assets/index.html'),(aab,'base/assets/index.html')]:
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  assert z.read(asset)==expected,'Different game asset in '+path.name
  native += [n for n in z.namelist() if n.endswith('.so')]
  assert any(n.endswith('classes.dex') for n in z.namelist())
assert not native,'New native libraries require a separate ELF/16KB compatibility check'
# AAB is a signed JAR; verify its certificate independently of the APK.
jar_result=run([java_tool('jarsigner'),'-verify',aab]);assert 'jar verified.' in jar_result
cert_output=run([java_tool('keytool'),'-printcert','-jarfile',aab]);match=re.search(r'SHA256:\s*([0-9A-Fa-f:]+)',cert_output)
assert match and match.group(1).replace(':','').lower()==expected_cert
bundle=run(['java','-jar',root/'tools/bundletool-all-1.18.3.jar','validate','--bundle='+str(aab)])
(report_dir/'bundle-validation.txt').write_text(bundle or 'bundletool validation passed\n')
mode_file=root/'app/build/generated/source/buildConfig/offline/release/com/pota/court/BuildConfig.java'
mode_text=mode_file.read_text();ads_enabled='public static final boolean ADS_ENABLED = true;' in mode_text
assert not ads_enabled
manifest_xml=run([tools/'aapt2','dump','xmltree',apk,'--file','AndroidManifest.xml'])
assert 'com.google.android.gms.ads' not in manifest_xml and 'androidx.startup' not in manifest_xml, 'Unexpected SDK provider in offline release'
feature_blocks=manifest_xml.split('E: uses-feature')[1:]
gl_block=next(block.split('E:')[0] for block in feature_blocks if 'glEsVersion' in block.split('E:')[0])
assert re.search(r'android:required[^\n]*=false',gl_block), 'OpenGL ES feature must be optional'
result={'package':'com.pota.court','versionName':version_name,'versionCode':version_code,'minSdk':23,'targetSdk':36,'compileSdk':36,
 'apk':{'path':str(apk),'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest()},
 'aab':{'path':str(aab),'bytes':aab.stat().st_size,'sha256':hashlib.sha256(aab.read_bytes()).hexdigest()},
 'gameAsset':{'bytes':len(expected),'sha256':hashlib.sha256(expected).hexdigest()},'permissions':permissions,
 'signerSha256':expected_cert,'apkSignatures':['v1','v2','v3'],'aabSignatureVerified':True,'bundletoolValidated':True,
 'openGLES2Required':False,'nativeLibraries':native,'pageSize16KB':'No native .so libraries; ELF page alignment not applicable',
 'flavor':'offline','adsSdk':None,'umpSdk':None,'futureMonetizedSdk':{'ads':'24.9.0','ump':'4.0.0'},'productionAdsEnabled':ads_enabled,'testAdsInRelease':False,
 'physicalDeviceRuntimeTested':False,'note':'User requested ads postponed. Offline release excludes advertising/consent SDKs and network permissions. Future monetized flavor retained in source.'}
(report_dir/'build-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
