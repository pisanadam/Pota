#!/usr/bin/env bash
set -euo pipefail
android_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
game_source="${1:-$android_root/app/src/main/assets/index.html}"
apk_output="${2:-$(pwd)/pota.apk}"
aab_output="${3:-$(pwd)/pota.aab}"
if [[ ! -f "$game_source" ]]; then printf 'Missing internal game asset. Run ../pack.py first.\n' >&2; exit 1; fi
mkdir -p "$android_root/app/src/main/assets" "$android_root/build"
if [[ "$(realpath "$game_source")" != "$(realpath "$android_root/app/src/main/assets/index.html")" ]]; then
    cp -- "$game_source" "$android_root/app/src/main/assets/index.html"
fi
chmod 600 "$android_root/signing/pota-local.jks"
python3 - "$android_root" <<'PY'
import os,pathlib,subprocess,sys,urllib.parse
root=pathlib.Path(sys.argv[1]);env=os.environ.copy()
jdk=env.get('JAVA_HOME','')
if not jdk or not (pathlib.Path(jdk)/'bin/javac').exists():
 candidates=list((root/'tools/jdk').glob('*/bin/javac'))
 if candidates:env['JAVA_HOME']=str(candidates[0].parent.parent)
command=[str(root/'tools/gradle-8.14.3/bin/gradle') if (root/'tools/gradle-8.14.3/bin/gradle').exists() else str(root/'gradlew'),'-p',str(root),'--no-daemon']
# Java does not inherit HTTP(S)_PROXY automatically. Preserve the session route.
for scheme in ['http','https']:
 proxy=env.get(scheme.upper()+'_PROXY') or env.get(scheme+'_proxy')
 if proxy:
  parsed=urllib.parse.urlparse(proxy)
  if parsed.hostname:command += ['-D'+scheme+'.proxyHost='+parsed.hostname,'-D'+scheme+'.proxyPort='+str(parsed.port or 80)]
trust=pathlib.Path('/etc/ssl/certs/java/cacerts')
if trust.exists():command += ['-Djavax.net.ssl.trustStore='+str(trust)]
command += [':app:assembleOfflineRelease',':app:bundleOfflineRelease']
if env.get('POTA_BUILD_AD_TEST') == '1':command += [':app:assembleMonetizedDebug']
subprocess.run(command,check=True,env=env)
PY
cp -- "$android_root/app/build/outputs/apk/offline/release/app-offline-release.apk" "$apk_output"
cp -- "$android_root/app/build/outputs/bundle/offlineRelease/app-offline-release.aab" "$aab_output"
if [[ "${POTA_BUILD_AD_TEST:-0}" == "1" ]]; then
    cp -- "$android_root/app/build/outputs/apk/monetized/debug/app-monetized-debug.apk" "$(dirname "$apk_output")/POTA-reklam-test.apk"
fi
python3 "$android_root/verify.py" "$game_source" "$apk_output" "$aab_output"
