from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math, random, json
OUT=Path(__file__).parent
S=3
DARK=(36,48,42); ORANGE=(233,141,72); SEAM=(73,46,35)

def cubic(points, count=100):
 p=[]
 for i in range(count+1):
  t=i/count;u=1-t
  p.append((u**3*points[0][0]+3*u*u*t*points[1][0]+3*u*t*t*points[2][0]+t**3*points[3][0],u**3*points[0][1]+3*u*u*t*points[1][1]+3*u*t*t*points[2][1]+t**3*points[3][1]))
 return p

def draw_ball(im,cx,cy,r):
 p=im.load(); rng=random.Random(180)
 for y in range(max(0,int(cy-r)),min(im.height,int(cy+r)+1)):
  for x in range(max(0,int(cx-r)),min(im.width,int(cx+r)+1)):
   nx=(x-cx)/r;ny=(y-cy)/r;dd=nx*nx+ny*ny
   if dd<=1:
    z=math.sqrt(1-dd); light=max(0,(-nx*.38-ny*.54+z*.75));shade=.69+light*.32
    grain=rng.random()*1.5
    p[x,y]=tuple(int(min(255,max(0,c*shade+grain))) for c in ORANGE)
 d=ImageDraw.Draw(im)
 w=max(1,int(r*.026))
 def path(ps):d.line([(cx+x*r,cy+y*r) for x,y in ps],fill=SEAM,width=w,joint='curve')
 path([(-1,0),(1,0)]);path([(0,-1),(0,1)])
 path(cubic([(-.63,-.78),(.48,-.33),(.5,.36),(-.63,.78)]))
 path(cubic([(.63,-.78),(-.48,-.33),(-.5,.36),(.63,.78)]))
 d.arc((cx-r*.80,cy-r*.80,cx+r*.75,cy+r*.75),start=216,end=254,fill=(255,202,139),width=max(1,int(r*.018)))

im=Image.new('RGB',(512*S,512*S),DARK);d=ImageDraw.Draw(im)
# Edge-to-edge icon background: Play applies its own mask.
for y in range(im.height):
 c=tuple(int(v*(1.04-.14*y/im.height)) for v in DARK)
 d.line((0,y,im.width,y),fill=c)
d.ellipse((83*S,111*S,435*S,463*S),fill=(23,34,28))
draw_ball(im,256*S,249*S,170*S)
im=im.resize((512,512),Image.Resampling.LANCZOS).convert('RGBA')
im.save(OUT/'icon-512.png',optimize=True)

W,H=1024*S,500*S
im=Image.new('RGB',(W,H),DARK);d=ImageDraw.Draw(im)
for y in range(H):
 c=tuple(int(v*(1.08-.18*y/H)) for v in DARK)
 d.line((0,y,W,y),fill=c)
# Understated perspective court lines are original artwork, not a gameplay mockup.
court=(55,70,58)
d.line([(477*S,500*S),(681*S,333*S),(936*S,333*S),(1115*S,500*S)],fill=court,width=2*S)
d.line((578*S,418*S,1024*S,418*S),fill=court,width=2*S)
d.ellipse((620*S,351*S,993*S,568*S),outline=court,width=2*S)
d.ellipse((644*S,115*S,964*S,435*S),fill=(24,35,29))
draw_ball(im,800*S,253*S,143*S)
font_bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font_regular='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
d=ImageDraw.Draw(im)
d.text((74*S,132*S),'POTA',font=ImageFont.truetype(font_bold,102*S),fill=(245,240,226),stroke_width=0)
d.ellipse((396*S,221*S,410*S,235*S),fill=ORANGE)
d.text((79*S,270*S),'Bir şut daha.',font=ImageFont.truetype(font_regular,31*S),fill=(208,211,193))
d.line((80*S,338*S,143*S,338*S),fill=ORANGE,width=3*S)
im.resize((1024,500),Image.Resampling.LANCZOS).save(OUT/'feature-1024x500.png',optimize=True)

(OUT/'icon-source.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#27342d"/><stop offset="1" stop-color="#1f2924"/></linearGradient><radialGradient id="ball" cx=".32" cy=".26" r=".85"><stop stop-color="#ef9956"/><stop offset=".6" stop-color="#e18a47"/><stop offset="1" stop-color="#b16a35"/></radialGradient></defs><path fill="url(#bg)" d="M0 0h512v512H0z"/><circle cx="259" cy="287" r="176" fill="#17221c"/><circle cx="256" cy="249" r="170" fill="url(#ball)"/><g fill="none" stroke="#492e23" stroke-width="4.5"><path d="M86 249h340M256 79v340M149 116C338 193 341 310 149 382M363 116C174 193 171 310 363 382"/></g><path fill="none" stroke="#ffca8b" stroke-width="3" stroke-linecap="round" d="M159 145c17-20 36-32 56-39"/></svg>''')

report={}
for f in ['icon-512.png','feature-1024x500.png']:
 img=Image.open(OUT/f)
 report[f]={'width':img.width,'height':img.height,'mode':img.mode,'bytes':(OUT/f).stat().st_size,'origin':'Original programmatic brand artwork. Not a gameplay screenshot.'}
(OUT/'asset-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
