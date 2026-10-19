from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import urllib.request, re, json, datetime
from html.parser import HTMLParser
class Extract(HTMLParser):
 def __init__(self): super().__init__(); self.parts=[]; self.skip=0
 def handle_starttag(self,t,a):
  if t in ("script","style","nav","footer","header"): self.skip+=1
 def handle_endtag(self,t):
  if t in ("script","style","nav","footer","header") and self.skip: self.skip-=1
 def handle_data(self,d):
  if not self.skip: self.parts.append(d)
root=Path(__file__).parent
sources={
'target-api':'https://support.google.com/googleplay/android-developer/answer/11926878?hl=en',
'personal-account-testing':'https://support.google.com/googleplay/android-developer/answer/14151465?hl=en',
'preview-assets':'https://support.google.com/googleplay/android-developer/answer/9866151?hl=en',
'data-safety':'https://support.google.com/googleplay/android-developer/answer/10787469?hl=en',
'admob-data-disclosure':'https://developers.google.com/admob/android/privacy/play-data-disclosure',
'admob-privacy':'https://developers.google.com/admob/android/privacy',
'16kb':'https://developer.android.com/guide/practices/page-sizes',
'64bit':'https://developer.android.com/google/play/requirements/64-bit',
'app-bundle':'https://developer.android.com/guide/app-bundle',
'play-signing':'https://support.google.com/googleplay/android-developer/answer/9842756?hl=en',
'app-content':'https://support.google.com/googleplay/android-developer/answer/9859455?hl=en',
'content-rating':'https://support.google.com/googleplay/android-developer/answer/9859655?hl=en',
'privacy-policy':'https://support.google.com/googleplay/android-developer/answer/10144311?hl=en',
'fees':'https://support.google.com/googleplay/android-developer/answer/6112435?hl=en',
'google-privacy':'https://policies.google.com/privacy',
'google-partners':'https://policies.google.com/technologies/partner-sites',
'reward-policy':'https://support.google.com/admob/answer/7313578?hl=en',
}
def fetch(it):
 key,url=it
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(req,timeout=45) as r:
   raw=r.read().decode('utf-8','replace'); status=r.status; final_url=r.url
  parser=Extract(); parser.feed(raw)
  text=re.sub(r'\s+',' ',' '.join(parser.parts)).strip()
  (root/(key+'.txt')).write_text(text)
  title=re.search(r'<title>(.*?)</title>',raw,re.S)
  return {'key':key,'url':url,'final_url':final_url,'status':status,'title':title.group(1) if title else '', 'retrieved_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'characters':len(text)}
 except Exception as e: return {'key':key,'url':url,'error':str(e)}
with ThreadPoolExecutor(max_workers=6) as pool: results=list(pool.map(fetch,sources.items()))
(root/'official-sources.json').write_text(json.dumps(results,indent=2,ensure_ascii=False))
for r in results: print(r['key'], r.get('status',r.get('error')),r.get('characters',0))
