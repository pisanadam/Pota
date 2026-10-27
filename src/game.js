/* POTA — fixed-position, touch-first shooting. All assets and stats stay local. */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const stage = $('stage'), dialog = $('menu-dialog'), shopDialog = $('shop-dialog');
let canvas=$('court');
function uiOpen(){return dialog.open||Boolean(shopDialog&&shopDialog.open);}
const STORAGE_KEY = 'pota.fixed-shots.v1';
const BALL_SKINS=window.PotaShopCatalog.filter(item=>item.type==='ball').map(item=>item.id),PARTICLE_STYLES=window.PotaShopCatalog.filter(item=>item.type==='particle').map(item=>item.id);
const COURT_FIELDS={net:{owned:'ownedNets',equipped:'equippedNet',base:'nylon',setter:'setNetStyle'},rim:{owned:'ownedRims',equipped:'equippedRim',base:'standard',setter:'setRimStyle'},backboard:{owned:'ownedBackboards',equipped:'equippedBackboard',base:'glass',setter:'setBackboardStyle'},environment:{owned:'ownedEnvironments',equipped:'equippedEnvironment',base:'gym',setter:'setEnvironmentStyle'}};
const defaults = () => ({attempts:0,made:0,streak:0,best:0,sound:true,showFPS:false,performancePreference:'smooth',developerMode:false,graphicsQuality:'auto',resolutionQuality:'auto',history:[],balance:0,totalPoints:0,ownedBalls:['classic'],ownedParticles:['none'],equippedBall:'classic',equippedParticle:'none',ownedNets:['nylon'],equippedNet:'nylon',ownedRims:['standard'],equippedRim:'standard',ownedBackboards:['glass'],equippedBackboard:'glass',ownedEnvironments:['gym'],equippedEnvironment:'gym',goals:window.PotaGoals.normalize(null)});
let stats = defaults();
try {
 const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
 if (saved && typeof saved === 'object') {
  for (const key of ['attempts','made','streak','best']) if(Number.isSafeInteger(saved[key]) && saved[key]>=0) stats[key]=saved[key];
  stats.made=Math.min(stats.made,stats.attempts);stats.streak=Math.min(stats.streak,stats.made);stats.best=Math.max(stats.streak,Math.min(stats.best,stats.made));
  stats.sound=typeof saved.sound==='boolean'?saved.sound:true;
  stats.performancePreference=['smooth','balanced','graphics'].includes(saved.performancePreference)?saved.performancePreference:'smooth';
  stats.developerMode=saved.developerMode===true;
  stats.showFPS=saved.showFPS===true;
  stats.graphicsQuality=stats.developerMode&&['auto','high','balanced','ultra'].includes(saved.graphicsQuality)?saved.graphicsQuality:'auto';
  stats.resolutionQuality=stats.developerMode&&['auto','low','medium','high','max'].includes(saved.resolutionQuality)?saved.resolutionQuality:'auto';
  if(Array.isArray(saved.history))stats.history=saved.history.filter(s=>s && typeof s.made==='boolean' && Number.isFinite(s.speed)).slice(-100);
  for(const key of ['balance','totalPoints'])if(Number.isSafeInteger(saved[key])&&saved[key]>=0)stats[key]=saved[key];
  if(!Number.isSafeInteger(saved.totalPoints))stats.totalPoints=stats.made*2;
  if(!Number.isSafeInteger(saved.balance))stats.balance=stats.totalPoints;
  if(Array.isArray(saved.ownedBalls))stats.ownedBalls=[...new Set(['classic',...saved.ownedBalls.filter(id=>BALL_SKINS.includes(id))])];
  if(Array.isArray(saved.ownedParticles))stats.ownedParticles=[...new Set(['none',...saved.ownedParticles.filter(id=>PARTICLE_STYLES.includes(id))])];
  if(stats.ownedBalls.includes(saved.equippedBall))stats.equippedBall=saved.equippedBall;
  if(stats.ownedParticles.includes(saved.equippedParticle))stats.equippedParticle=saved.equippedParticle;
  for(const[type,field]of Object.entries(COURT_FIELDS)){
   const allowed=window.PotaShopCatalog.filter(item=>item.type===type).map(item=>item.id);
   if(Array.isArray(saved[field.owned]))stats[field.owned]=[...new Set([field.base,...saved[field.owned].filter(id=>allowed.includes(id))])];
   if(stats[field.owned].includes(saved[field.equipped]))stats[field.equipped]=saved[field.equipped];
  }
  stats.goals=window.PotaGoals.normalize(saved.goals);
  // Saves from before goals existed: credit earlier baskets and streaks once.
  if(!saved.goals){stats.goals.progress.baskets=stats.made;stats.goals.progress.bestStreak=stats.best;}
 }
} catch (_) {}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(stats));}catch(_){}}
const fpsCounter=$('fps-counter'),fpsButton=$('fps-button');
const pointsNumber=new Intl.NumberFormat('tr-TR'),compactPointsNumber=new Intl.NumberFormat('tr-TR',{notation:'compact',maximumFractionDigits:1});
let fpsWindowStart=null,fpsLastTime=null,fpsFrames=0;
function resetFPS(){fpsWindowStart=fpsLastTime=null;fpsFrames=0;if(fpsCounter.textContent!=='— FPS')fpsCounter.textContent='— FPS';}
function sampleFPS(milliseconds){
 // Count displayed game frames against the real RAF clock, including slow
 // frames. Physics uses a capped delta and must not determine this number.
 if(fpsWindowStart===null||milliseconds<=fpsLastTime){fpsWindowStart=milliseconds;fpsLastTime=milliseconds;fpsFrames=0;return;}
 fpsLastTime=milliseconds;fpsFrames++;
 const elapsed=milliseconds-fpsWindowStart;
 if(elapsed>=500){const label=Math.round(fpsFrames*1000/elapsed)+' FPS';if(fpsCounter.textContent!==label)fpsCounter.textContent=label;fpsWindowStart=milliseconds;fpsFrames=0;}
}
function updateStats(){
 const rate=stats.attempts?Math.round(100*stats.made/stats.attempts):0;
 $('accuracy').innerHTML=rate+'<span>%</span>';
 for(const key of ['made','attempts','streak','best'])$(key).textContent=stats[key];
 $('stat-caption').textContent=stats.streak?'Sonraki basket +'+Math.min(stats.streak,window.PotaRewards.MAX_STREAK_BONUS)+' seri bonusu, üçlükte +'+Math.min(stats.streak,window.PotaRewards.MAX_STREAK_BONUS)*window.PotaRewards.THREE_STREAK_STEP+'.':stats.attempts?'Yeni bir seri başlat.':'İlk şutunla başla.';
 $('sound-button').setAttribute('aria-pressed',String(stats.sound));
 $('sound-button').innerHTML='<svg><use href="#i-'+(stats.sound?'sound':'muted')+'"/></svg><span>Ses '+(stats.sound?'açık':'kapalı')+'</span>';
 $('performance-preference').value=stats.performancePreference;
 $('developer-toggle').setAttribute('aria-pressed',String(stats.developerMode));
 $('developer-toggle').textContent='Geliştirici modu '+(stats.developerMode?'açık':'kapalı');
 $('developer-panel').hidden=!stats.developerMode;
 fpsButton.setAttribute('aria-pressed',String(stats.showFPS));
 fpsButton.querySelector('span').textContent='FPS göstergesi '+(stats.showFPS?'açık':'kapalı');
 fpsCounter.hidden=!stats.showFPS;
 $('graphics-quality').value=stats.graphicsQuality;
 $('resolution-quality').value=stats.resolutionQuality;
 if($('wallet-balance'))$('wallet-balance').textContent=stats.balance;
 $('current-points-value').textContent=(stats.balance>=100000?compactPointsNumber:pointsNumber).format(stats.balance);
 $('current-points').title=pointsNumber.format(stats.balance)+' harcanabilir puan';
 if($('total-points'))$('total-points').textContent=stats.totalPoints;
 renderGoals();
}
function renderGoals(){
 const list=$('goals-list');if(!list)return;
 const goals=window.PotaGoals.summary(stats.goals);
 $('goals-count').textContent=goals.filter(goal=>goal.done).length+'/'+goals.length;
 list.replaceChildren(...goals.map(goal=>{
  const item=document.createElement('li');item.className='goal-item'+(goal.done?' is-done':'');
  const title=document.createElement('strong');title.textContent=goal.name;
  const reward=document.createElement('span');reward.className='goal-reward';reward.textContent=goal.done?'Tamamlandı':'+'+pointsNumber.format(goal.reward);
  const text=document.createElement('p');text.textContent=goal.description;
  const progress=document.createElement('span');progress.className='goal-progress';
  const bar=document.createElement('i'),fill=document.createElement('b');fill.style.width=(100*goal.current/goal.target)+'%';bar.appendChild(fill);
  progress.append(bar,pointsNumber.format(goal.current)+' / '+pointsNumber.format(goal.target));
  item.append(title,reward,text,progress);return item;
 }));
}
updateStats();
let nativeInfo={};
try{if(window.PotaNative&&typeof window.PotaNative.getDeviceInfo==='function')nativeInfo=JSON.parse(window.PotaNative.getDeviceInfo())||{};}catch(_){}
window.PotaDeviceInfo=nativeInfo;
function preferenceTarget(rate){return stats.performancePreference==='graphics'?60:stats.performancePreference==='balanced'?(rate>=89?90:60):rate>=119?120:60;}
let displayRefreshRate=Number(nativeInfo.refreshRate)||60,targetFps=preferenceTarget(displayRefreshRate);
let refreshKnown=Number(nativeInfo.refreshRate)>0;
let renderPaceTime=null,previousRafTime=null,fastRefreshSamples=0,mediumRefreshSamples=0;
let world;
try{if(sessionStorage.getItem('pota.compatibility')==='true')throw Error('Compatibility restart');world=window.createCourtScene({canvas});}catch(error){
 console.warn('POTA compatibility renderer',error);
 try{const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;world=window.createPotaCompatibilityScene({canvas});}catch(fallbackError){$('loading').hidden=true;$('webgl-error').hidden=false;$('retry-game').onclick=()=>location.reload();console.error('POTA initialization failed',fallbackError);return;}
}
const T=window.THREE,P=window.HoopPhysics;
function applyPresentation(){
 targetFps=preferenceTarget(displayRefreshRate);renderPaceTime=null;
 world.setPerformancePreference(stats.performancePreference);
 world.setDeveloperOverrides({enabled:stats.developerMode,quality:stats.graphicsQuality,resolution:stats.resolutionQuality});
 try{if(window.PotaNative&&typeof window.PotaNative.setPerformancePreference==='function')window.PotaNative.setPerformancePreference(stats.performancePreference);}catch(_){}
 if(stats.developerMode){const d=world.getGraphicsDiagnostics();$('developer-status').textContent=(d.pipeline||'')+' · Hedef '+targetFps+' FPS';}
}
world.setDisplayRefreshRate(displayRefreshRate);applyPresentation();
world.setBallSkin(stats.equippedBall);world.setParticleStyle(stats.equippedParticle);
for(const field of Object.values(COURT_FIELDS))world[field.setter](stats[field.equipped]);
const cameraPosition=new T.Vector3(0,1.7,-7.35);
const lookTarget=new T.Vector3(0,2.72,-12.35);
// The player faces the hoop on their half of the court. Walking stops in
// front of each backboard: no shooting from behind the glass.
let activeHoop=0;
const COURT_LIMIT_Z=Math.abs(P.hoops[0].z)-.1;
function faceHoop(index){activeHoop=index;const hoop=P.hoops[index];lookTarget.set(hoop.x,2.72,hoop.z);}
world.camera.position.copy(cameraPosition);world.camera.lookAt(lookTarget);
const forward=new T.Vector3();world.camera.getWorldDirection(forward);
const right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0)).normalize();
const up=new T.Vector3().crossVectors(right,forward).normalize();
let width=1,height=1;
function resize(){const rect=stage.getBoundingClientRect();width=rect.width;height=rect.height;world.resize(width,height); // Keep hoop, ball and court readable on a portrait phone.
 world.camera.fov=height>width?Math.min(78,58+(height/width-1)*14):58;world.camera.updateProjectionMatrix();if(uiOpen())world.render();}
const ro=new ResizeObserver(resize);ro.observe(stage);resize();
const hold=new T.Vector3(),ballDisplay=new T.Vector3(),returnStart=new T.Vector3(),releaseStart=new T.Vector3(),releaseEnd=new T.Vector3();
const release={x:0,y:1.95,z:-7.8};
let mode='shoot',roamDrag=null;
const walkKeys=new Set();
function alignView(){
 world.camera.position.copy(cameraPosition);world.camera.lookAt(lookTarget);
 world.camera.getWorldDirection(forward);right.crossVectors(forward,new T.Vector3(0,1,0)).normalize();up.crossVectors(right,forward).normalize();
 const horizontalLength=Math.hypot(forward.x,forward.z)||1;
 release.x=cameraPosition.x+forward.x/horizontalLength*.45;
 release.z=cameraPosition.z+forward.z/horizontalLength*.45;
}
function movePlayer(side,advance){
 const horizontalLength=Math.hypot(forward.x,forward.z)||1;
 cameraPosition.x=Math.max(-7.2,Math.min(7.2,cameraPosition.x+right.x*side+forward.x/horizontalLength*advance));
 cameraPosition.z=Math.max(-COURT_LIMIT_Z,Math.min(COURT_LIMIT_Z,cameraPosition.z+right.z*side+forward.z/horizontalLength*advance));
 for(const hoop of P.hoops){const dx=cameraPosition.x-hoop.x,dz=cameraPosition.z-hoop.z,distance=Math.hypot(dx,dz);if(distance<1.05){cameraPosition.x=hoop.x+(distance?dx/distance:0)*1.05;cameraPosition.z=hoop.z+(distance?dz/distance:1)*1.05;}}
 alignView();
}
// Turn when shooting resumes: flipping during a walk would reverse its
// controls and bounce a player who keeps walking back across half court.
function updateFacing(){const next=cameraPosition.z>0?1:0;if(next!==activeHoop){faceHoop(next);alignView();}}
alignView();
let state='ready',drag=null,flight=null,returnTime=0,releaseTime=0,afterResult=0,netPulse=0,recorded=false,firstShot=false;
let lastTime=0,worldTime=0,physicsRemainder=0,shotSerial=0;
let frameRequest=0,appPaused=false,graphicsLost=false;
function canAnimate(){return !appPaused&&!graphicsLost&&!document.hidden&&!uiOpen();}
function scheduleFrame(){if(!frameRequest&&canAnimate())frameRequest=requestAnimationFrame(frame);}
function stopFrames(){if(frameRequest){cancelAnimationFrame(frameRequest);frameRequest=0;}lastTime=0;renderPaceTime=previousRafTime=null;resetFPS();if(world.resetPerformanceTiming)world.resetPerformanceTiming();}
function observeRefresh(milliseconds){
 if(!refreshKnown&&previousRafTime!==null){
  const gap=milliseconds-previousRafTime;
  if(gap>=3&&gap<=9.5)fastRefreshSamples++;else if(gap>10)fastRefreshSamples=Math.max(0,fastRefreshSamples-1);
  if(gap>=9.8&&gap<=11.8)mediumRefreshSamples++;else mediumRefreshSamples=Math.max(0,mediumRefreshSamples-1);
  if(fastRefreshSamples>=30||mediumRefreshSamples>=30){displayRefreshRate=fastRefreshSamples>=30?120:90;targetFps=preferenceTarget(displayRefreshRate);renderPaceTime=null;refreshKnown=true;world.setDisplayRefreshRate(displayRefreshRate);}
 }
 previousRafTime=milliseconds;
}
window.addEventListener('pota:display-change',event=>{const rate=Number(event.detail&&event.detail.refreshRate);if(rate>=30&&rate<=500){displayRefreshRate=rate;targetFps=preferenceTarget(rate);refreshKnown=true;renderPaceTime=null;world.setDisplayRefreshRate(rate);}});
const PHYSICS_STEP=1/240;
const fairplay=window.createPotaFairPlay();
let fairplayNoticeTimer;
function clearFairplayNotice(){clearTimeout(fairplayNoticeTimer);const notice=$('fairplay-notice');if(notice)notice.hidden=true;}
function showFairplayDecision(decision){
 if(decision.status==='clear'){clearFairplayNotice();return;}
 if(!decision.warning&&decision.allowPoints)return;
 const notice=$('fairplay-notice');if(!notice)return;
 clearTimeout(fairplayNoticeTimer);$('fairplay-title').textContent='Otomatik atış tekrarı';
 $('fairplay-message').textContent=decision.allowPoints?'Aynı hareket ve zamanlamayla yinelenen atışlar algılandı. Bu şekilde devam eden atışlardan puan kazanılamaz.':'Bu otomatik atıştan puan kazanılamaz. Elle oynamaya devam edebilirsin.';
 notice.hidden=false;fairplayNoticeTimer=setTimeout(()=>{notice.hidden=true;},8000);
}
function inputTime(event){const now=performance.now(),stamp=Number(event&&event.timeStamp);return Number.isFinite(stamp)&&stamp>=0&&Math.abs(stamp-now)<60000?stamp:now;}
function fairplayContext(d){return[mode,'swipe',release.x.toFixed(3),release.y.toFixed(3),release.z.toFixed(3),width,height,d.id==='key'?'key-direction:'+d.dx:'pointer'].join('|');}
const audio=window.createCourtAudio();audio.setEnabled(stats.sound);audio.setEnvironment(stats.equippedEnvironment);audio.setNetStyle(stats.equippedNet);
let rewardStatusTimer=0,lastAdStatus='';
const rewarded=window.createPotaRewardedAds({onState:updateRewardedUI});
function updateRewardedUI(value){
 const button=$('reward-ad-button'),status=$('reward-ad-status');
 button.hidden=!value.ready||!value.online;button.disabled=value.busy||state!=='ready'||uiOpen();
 $('reward-ad-label').textContent=(value.offerMultiplier===3?'2 reklam izle · 3× puan':'Reklam izle · 2× puan')+(value.testMode?' · Test':'');
 $('boost-badge').hidden=value.activeMultiplier<=1;
 $('boost-value').textContent=value.activeMultiplier+'×';
 const remaining=value.remainingSeconds||0;$('boost-time').textContent=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');
 $('privacy-button').hidden=!value.privacyRequired;
 $('privacy-policy-button').hidden=!value.privacyPolicyAvailable;
 const messages={watching:'Reklam tamamlanınca ödülün etkinleşir.',cancelled:'Reklam tamamlanmadı. Çarpan verilmedi.',failed:'Reklam tamamlanamadı. Çarpan verilmedi.'};
 if(value.status!==lastAdStatus){lastAdStatus=value.status;clearTimeout(rewardStatusTimer);const message=messages[value.status]||'';status.textContent=message;status.hidden=!message;if(message)rewardStatusTimer=setTimeout(()=>{status.hidden=true;},8000);}
}
$('reward-ad-button').addEventListener('click',()=>{if(state==='ready'&&!uiOpen())rewarded.requestBoost();});
$('privacy-button').addEventListener('click',()=>rewarded.showPrivacyOptions());
$('privacy-policy-button').addEventListener('click',()=>{try{if(window.PotaNative&&typeof window.PotaNative.openPrivacyPolicy==='function')window.PotaNative.openPrivacyPolicy();}catch(_){}});
function ensureAudio(){audio.updateListener(cameraPosition,forward,up);audio.unlock();}
function sound(kind,position=release){if(kind==='throw')audio.shoot(position);}
function getHold(time){ // A ball held naturally below the line of sight.
 const breathing=Math.sin(time*1.7)*.004;
 hold.copy(cameraPosition).addScaledVector(forward,.75).addScaledVector(up,-.36+breathing);
 if(drag){hold.addScaledVector(right,Math.max(-.16,Math.min(.16,drag.dx/width*.65)));hold.addScaledVector(up,Math.max(-.04,Math.min(.21,drag.dy/height*.6)));}
 return hold;
}
function hideIntro(){if(!firstShot){firstShot=true;$('intro').classList.add('fade');$('gesture-cue').classList.remove('show');}}
function shotPointValue(){const hoop=P.hoops[activeHoop],dx=cameraPosition.x-hoop.x,dz=(cameraPosition.z-hoop.z)*hoop.front;return (dz<1.415?Math.abs(dx)>6.625:Math.hypot(dx,dz)>6.775)?3:2;}
let scorePopupTimer;
function showScore(points,bonus=0,blocked=false,multiplier=1){
 const popup=$('score-popup');clearTimeout(scorePopupTimer);popup.textContent=blocked?'Basket':'+'+points;popup.hidden=false;
 if(bonus||blocked||multiplier>1){const label=document.createElement('span');label.className='score-bonus';label.textContent=blocked?'Puan verilmedi':(multiplier>1?multiplier+'× puan':'')+(bonus?(multiplier>1?' · ':'')+'Seri +'+bonus:'');popup.appendChild(label);}
 popup.classList.remove('show');void popup.offsetWidth;popup.classList.add('show');
 scorePopupTimer=setTimeout(()=>{popup.hidden=true;popup.classList.remove('show');},1800);
}
let goalToastTimer;
function showGoals(goals,reward){
 const toast=$('goal-toast');clearTimeout(goalToastTimer);
 $('goal-toast-title').textContent=goals.length===1?'Hedef tamamlandı: '+goals[0].name:goals.length+' hedef tamamlandı';
 $('goal-toast-message').textContent='+'+pointsNumber.format(reward)+' puan ödül';
 toast.hidden=false;goalToastTimer=setTimeout(()=>{toast.hidden=true;},4500);
}
function finishRecord(made){if(recorded)return;recorded=true;const pointsBlocked=flight.fairplay.allowPoints===false,reward=window.PotaRewards.calculate(stats,flight.shotPoints,made&&!pointsBlocked,flight.pointMultiplier);stats.attempts++;stats.streak=reward.streak;stats.best=reward.best;if(made){stats.made++;stats.balance=Math.min(Number.MAX_SAFE_INTEGER,stats.balance+reward.points);stats.totalPoints=Math.min(Number.MAX_SAFE_INTEGER,stats.totalPoints+reward.points);netPulse++;showScore(flight.shotPoints*reward.multiplier,reward.bonus*reward.multiplier,pointsBlocked,reward.multiplier);if(navigator.vibrate)navigator.vibrate(20);}
 const goalResult=window.PotaGoals.record(stats.goals,{made,pointsBlocked,value:flight.shotPoints,streak:reward.streak,swish:flight.rimContacts+flight.boardContacts+flight.frameContacts===0,bank:flight.boardContacts>0,hoop:flight.scoredHoop});stats.goals=goalResult.state;
 if(goalResult.reward){stats.balance=Math.min(Number.MAX_SAFE_INTEGER,stats.balance+goalResult.reward);stats.totalPoints=Math.min(Number.MAX_SAFE_INTEGER,stats.totalPoints+goalResult.reward);showGoals(goalResult.newlyCompleted,goalResult.reward);}
 stats.history.push({made,speed:flight.shotSpeed,angle:flight.shotAngle,value:flight.shotPoints,hoop:activeHoop,bonus:reward.bonus,multiplier:reward.multiplier,points:reward.points,pointsBlocked,time:Date.now()});stats.history=stats.history.slice(-100);persist();updateStats();$('announce').textContent=(goalResult.reward?'Hedef tamamlandı, '+goalResult.reward+' puan ödül. ':'')+(made?pointsBlocked?'Basket. Otomatik atış tekrarından puan verilmedi. Top eline geri geliyor.':'Basket. '+reward.points+' puan kazandın. Top eline geri geliyor.':'Şut kaçtı. Seri sıfırlandı. Top eline geri geliyor.');
}
function shotOptions(d){
 const reference=Math.max(130,Math.min(220,height*.25));
 const ratio=Math.min(2.3,Math.max(0,d.dy/reference));
 const distance=Math.hypot(release.x-P.hoops[activeHoop].x,release.z-P.hoops[activeHoop].z);
 const minimumAngle=Math.min(83,89-9*distance);
 let angle=Math.min(83,Math.max(50+Math.min(12,ratio*4),minimumAngle));
 // A distant shot needs a flatter arc inside an actual gym ceiling.
 while(angle>35){
  const estimatedSpeed=P.idealSpeed(release,activeHoop,angle),vertical=estimatedSpeed*Math.sin(angle*Math.PI/180),dragRate=P.AIR_DRAG;
  const apex=release.y+vertical/dragRate-P.G/(dragRate*dragRate)*Math.log1p(dragRate*vertical/P.G);
  if(apex<P.roomBounds.ceiling-P.BALL_RADIUS-.18)break;angle-=1;
 }
 const ideal=P.idealSpeed(release,activeHoop,angle);
 // A gentle response near a medium swipe gives the finger finer power control.
 // The simulated flight and contacts still determine every result.
 const difference=ratio-1;
 const multiplier=Math.max(.44,Math.min(1.8,1+Math.sign(difference)*Math.pow(Math.abs(difference),1.65)*.7));
 const speed=ideal*multiplier;
 const direction=Math.max(-22,Math.min(22,d.dx/Math.min(width,650)*28));
 // Signed area between the finger stroke and its straight start/end chord
 // distinguishes a curved swipe from a diagonal straight swipe.
 let curve=0;
 const samples=d.samples||[];
 if(d.dy>22)for(let i=1;i<samples.length;i++){
  const a=samples[i-1],b=samples[i],dy=b.y-a.y;
  curve+=((a.x+b.x)*.5-d.dx*(a.y+b.y)*.5/d.dy)*dy;
 }
 const sideSpin=Math.max(-36,Math.min(36,-curve/Math.max(22,d.dy)/reference*95));
 return {position:release,targetHoop:activeHoop,speed,angleDeg:angle,azimuthOffset:direction,sideSpin};
}
let aimPreview=null,previewKey='';
function hideAimArrow(){aimPreview=null;previewKey='';world.setAimArrow([],false);world.setTrajectory([],false);}
function refreshAimArrow(){
 if(state!=='aim'||!drag||uiOpen()){hideAimArrow();return;}
 if(drag.dy<8){hideAimArrow();return;}
 const key=[Math.round(drag.dx*2),Math.round(drag.dy*2),drag.revision||0,width,height].join(':');
 if(key===previewKey)return;previewKey=key;
 const options=shotOptions(drag),preview=P.launch(options),points=[{...release}];
 const contacts=[];
 for(let i=0;i<90;i++){
  const events=P.step(preview,1/45);points.push({...preview.position});
  for(const event of events)if(!contacts.includes(event))contacts.push(event);
  if(events.includes('floor')||events.includes('score'))break;
 }
 // Keep the arrow on the moving launch arc instead of pinning its tip to an
 // artificial hoop-height intersection. Dots also show the bank continuation.
 const arrowStart=getHold(worldTime).clone().addScaledVector(up,P.BALL_RADIUS*1.12);
 const arrowPoints=points.slice(0,Math.min(points.length,9)).map(point=>{
  return{x:arrowStart.x+(point.x-release.x)*.55,y:arrowStart.y+(point.y-release.y)*.55,z:arrowStart.z+(point.z-release.z)*.55};
 });
 aimPreview={speed:options.speed,angle:options.angleDeg,direction:options.azimuthOffset,sideSpin:options.sideSpin,endpoint:points[points.length-1],arrowTip:arrowPoints[arrowPoints.length-1],contacts,points};
 world.setAimArrow(arrowPoints,true);
 world.setTrajectory(points.filter((_,i)=>i>=9&&i%2===1),true);
}
function throwBall(){
 const d=drag;if(!d)return;
 const options=shotOptions(d);hideAimArrow();
 if(d.dy<22){fairplay.interrupt();drag=null;state='ready';return;}
 hideIntro();
 const decision=fairplay.recordShot({kind:d.id==='key'?'key':'pointer',startedAt:d.startedAt,endedAt:d.endedAt,startX:d.startX||0,startY:d.startY||0,width,height,context:fairplayContext(d),trusted:d.trusted,samples:d.fairplaySamples});showFairplayDecision(decision);
 flight=P.launch(options);flight.shotSpeed=options.speed;flight.shotAngle=options.angleDeg;flight.shotPoints=shotPointValue();flight.pointMultiplier=rewarded.getMultiplier();
 flight.fairplay=decision;
 flight.audioShotId=++shotSerial;flight.netTouched=false;flight.passSoundPlayed=false;
 releaseEnd.set(options.position.x,options.position.y,options.position.z);
 releaseStart.copy(world.ball.position);releaseTime=0;drag=null;state='release';recorded=false;afterResult=0;world.ball.visible=true;world.setTrajectory([],false);sound('throw',options.position);$('reward-ad-button').disabled=true;
 $('menu-button').disabled=true;
}
function startDrag(event){if(state!=='ready'||uiOpen()||event.button>0)return;event.preventDefault();ensureAudio();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);$('intro').classList.add('fade');$('gesture-cue').classList.remove('show');if(mode==='walk'){roamDrag={id:event.pointerId,x:event.clientX,y:event.clientY};return;}drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,dx:0,dy:0,samples:[{x:0,y:0}],startedAt:inputTime(event),trusted:event.isTrusted===true,fairplaySamples:[{x:0,y:0,t:0}]};state='aim';}
function moveDrag(event){if(roamDrag&&roamDrag.id===event.pointerId){const dx=event.clientX-roamDrag.x,dy=roamDrag.y-event.clientY;roamDrag.x=event.clientX;roamDrag.y=event.clientY;movePlayer(dx*.018,dy*.018);return;}if(!drag||drag.id!==event.pointerId)return;for(const sample of event.getCoalescedEvents?event.getCoalescedEvents().concat([event]):[event]){
 const x=sample.clientX-drag.startX,y=drag.startY-sample.clientY,last=drag.samples[drag.samples.length-1];
 const t=Math.max(0,inputTime(sample)-drag.startedAt),previous=drag.fairplaySamples[drag.fairplaySamples.length-1];
 if(t>=previous.t&&(x!==previous.x||y!==previous.y||t!==previous.t)){drag.fairplaySamples.push({x,y,t});if(drag.fairplaySamples.length>512)drag.fairplaySamples.splice(1,1);}
 if(Math.hypot(x-last.x,y-last.y)>.5){drag.samples.push({x,y});drag.revision=(drag.revision||0)+1;if(drag.samples.length>256)drag.samples.splice(1,1);}
 drag.dx=x;drag.dy=y;
 }
 // Preserve every gesture sample, then build its prediction once on the next
 // displayed frame rather than repeating a full flight for each input event.
}
function endDrag(event){if(roamDrag&&roamDrag.id===event.pointerId){moveDrag(event);roamDrag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);return;}if(!drag||drag.id!==event.pointerId)return;moveDrag(event);drag.endedAt=Math.max(drag.startedAt,inputTime(event));drag.trusted=drag.trusted&&event.isTrusted===true;throwBall();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(!firstShot)$('intro').classList.remove('fade');}
function cancelDrag(event){if(roamDrag&&roamDrag.id===event.pointerId){roamDrag=null;fairplay.interrupt();return;}if(!drag||drag.id!==event.pointerId)return;fairplay.interrupt();drag=null;state='ready';hideAimArrow();if(!firstShot)$('intro').classList.remove('fade');}
canvas.addEventListener('pointerdown',startDrag);canvas.addEventListener('pointermove',moveDrag);canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',cancelDrag);canvas.addEventListener('lostpointercapture',event=>{if(state==='aim')cancelDrag(event);});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
// Keyboard fallback keeps the same simple shooting mechanic accessible.
let keyChargeStart=0;
canvas.addEventListener('keydown',event=>{if(mode==='walk'&&!uiOpen()&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();walkKeys.add(event.code);return;}if(mode==='shoot'&&event.code==='Space'&&!event.repeat&&state==='ready'&&!uiOpen()){event.preventDefault();ensureAudio();keyChargeStart=performance.now();drag={id:'key',dx:0,dy:0,startedAt:inputTime(event),trusted:event.isTrusted===true,fairplaySamples:[{x:0,y:0,t:0}]};state='aim';hideIntro();}if(event.code==='ArrowLeft'&&drag&&drag.id==='key'){event.preventDefault();drag.dx-=5;}if(event.code==='ArrowRight'&&drag&&drag.id==='key'){event.preventDefault();drag.dx+=5;}});
canvas.addEventListener('keyup',event=>{walkKeys.delete(event.code);if(event.code==='Space'&&drag&&drag.id==='key'){event.preventDefault();drag.endedAt=Math.max(drag.startedAt,inputTime(event));drag.trusted=drag.trusted&&event.isTrusted===true;drag.fairplaySamples.push({x:drag.dx,y:drag.dy,t:drag.endedAt-drag.startedAt});throwBall();}});
window.addEventListener('blur',()=>{fairplay.interrupt();clearFairplayNotice();walkKeys.clear();roamDrag=null;if(state==='aim'){drag=null;state='ready';hideAimArrow();}});
function pauseGame(){stopFrames();fairplay.interrupt();clearFairplayNotice();walkKeys.clear();roamDrag=null;physicsRemainder=0;if(state==='aim'){drag=null;state='ready';hideAimArrow();}clearTimeout(scorePopupTimer);$('score-popup').hidden=true;clearTimeout(goalToastTimer);$('goal-toast').hidden=true;audio.suspend();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();else{lastTime=0;scheduleFrame();}});
window.addEventListener('pota:pause',()=>{appPaused=true;pauseGame();});
window.addEventListener('pota:resume',()=>{appPaused=false;lastTime=0;scheduleFrame();});
function startReturn(){if(!recorded)finishRecord(false);returnStart.copy(world.ball.position);returnTime=0;state='return';}
function advancePhysics(dt){
 // Ball and cords exchange forces on the same clock, independent of rendering.
 world.beginNetFrame();physicsRemainder+=dt;
 while(physicsRemainder+1e-10>=PHYSICS_STEP){
  physicsRemainder-=PHYSICS_STEP;
  if(state==='flight'){
   const events=P.step(flight,PHYSICS_STEP);
   world.stepNetPhysics(PHYSICS_STEP,flight);
   const netStates=world.getNetAudioState();
   const netContact=netStates.some(n=>n.contactCount>0);
   if(netContact)flight.netTouched=true;
   if(flight.scored&&flight.netTouched&&!flight.passSoundPlayed){
    const hoop=P.hoops[flight.scoredHoop];
    if(hoop&&flight.position.y<hoop.y-.20&&flight.velocity.y<-.2&&Math.hypot(flight.position.x-hoop.x,flight.position.z-hoop.z)<.45){
     flight.passSoundPlayed=true;
     audio.swish({x:hoop.x,y:hoop.y-.26,z:hoop.z},{speed:Math.abs(flight.velocity.y),clean:flight.rimContacts+flight.boardContacts+flight.frameContacts===0,shotId:flight.audioShotId,material:stats.equippedNet==='chain'||stats.equippedNet==='gold-chain'?stats.equippedNet:'nylon'});
    }
   }
   for(const contact of flight.contacts||[])audio.impact(contact);
   for(const kind of events){if(kind==='score')finishRecord(true);else if(kind==='miss'||(kind==='floor'&&!recorded))finishRecord(false);}
   if(recorded)afterResult+=PHYSICS_STEP;
   if((recorded&&afterResult>(flight.scored?1.25:.5))||flight.time>5.8){world.setBall(flight.position);startReturn();}
  }else world.stepNetPhysics(PHYSICS_STEP,null);
 }
}
function frame(milliseconds){frameRequest=0;
 if(!canAnimate()){lastTime=0;return;}
 observeRefresh(milliseconds);
 const interval=1000/targetFps;
 if(renderPaceTime!==null&&milliseconds<renderPaceTime-.25){scheduleFrame();return;}
 renderPaceTime=renderPaceTime===null?milliseconds+interval:renderPaceTime+interval;
 if(renderPaceTime<=milliseconds)renderPaceTime=milliseconds+interval;
 const frameMs=lastTime?milliseconds-lastTime:interval,dt=Math.min(frameMs/1000,.25),frameStart=performance.now();lastTime=milliseconds;
 {worldTime+=dt;
  if(mode==='walk'){
   const side=Number(walkKeys.has('KeyD')||walkKeys.has('ArrowRight'))-Number(walkKeys.has('KeyA')||walkKeys.has('ArrowLeft'));
   const advance=Number(walkKeys.has('KeyW')||walkKeys.has('ArrowUp'))-Number(walkKeys.has('KeyS')||walkKeys.has('ArrowDown'));
   if(side||advance){const normal=Math.hypot(side,advance);movePlayer(side/normal*dt*2.7,advance/normal*dt*2.7);$('intro').classList.add('fade');}
  }
  audio.updateListener(cameraPosition,forward,up);
  advancePhysics(dt);
  if(state==='ready'||state==='aim'){
   if(drag&&drag.id==='key'){const reference=Math.max(130,Math.min(220,height*.25));drag.dy=Math.min(reference*2,(performance.now()-keyChargeStart)/900*reference);}
   ballDisplay.copy(getHold(worldTime));world.setBall(ballDisplay);
   if(state==='aim')refreshAimArrow();
  }else if(state==='release'){
   releaseTime+=dt;const progress=Math.min(1,releaseTime/.14);ballDisplay.copy(releaseStart).lerp(releaseEnd,progress);world.setBall(ballDisplay);if(progress===1)state='flight';
  }else if(state==='flight'){
   world.setBall(flight.position);
  }else if(state==='return'){
   returnTime+=dt;const progress=Math.min(1,returnTime/.7);const easing=progress*progress*(3-2*progress);
   ballDisplay.copy(returnStart).lerp(getHold(worldTime),easing);ballDisplay.y+=Math.sin(progress*Math.PI)*.42;world.setBall(ballDisplay);
   if(progress===1){state='ready';flight=null;$('menu-button').disabled=false;$('announce').textContent='Yeni şut için hazır.';updateRewardedUI(rewarded.getState());}
  }
  world.animate(dt,worldTime,{netPulse,targetHoop:Math.sign(P.hoops[activeHoop].z),ballState:state==='flight'?flight:null});
  for(const movement of world.getNetAudioState())audio.netMotion(movement);
  world.render();
  if(world.samplePerformanceFrame)world.samplePerformanceFrame({now:milliseconds,frameMs,renderMs:performance.now()-frameStart,visible:true});
  if(stats.showFPS)sampleFPS(milliseconds);
 }
 // The paused scene stays on the canvas behind menus without spending GPU
 // work on identical frames. Settings and cosmetics redraw once when changed.
 scheduleFrame();
}
world.setBall(getHold(0));world.render();$('loading').classList.add('done');setTimeout(()=>$('loading').hidden=true,700);scheduleFrame();
function closeMenu(){dialog.close();$('reset-confirm').hidden=true;canvas.focus({preventScroll:true});ensureAudio();}
function setMode(next){
 if(state!=='ready')return;fairplay.interrupt();clearFairplayNotice();mode=next;walkKeys.clear();roamDrag=null;if(mode==='shoot')updateFacing();hideAimArrow();world.ball.visible=mode==='shoot';
 $('shoot-mode').setAttribute('aria-pressed',String(mode==='shoot'));$('walk-mode').setAttribute('aria-pressed',String(mode==='walk'));
 canvas.setAttribute('aria-label',mode==='walk'?'Sahada gezinmek için parmağınla sürükle. Klavyede WASD veya yön tuşlarını kullan.':'Şut için yukarı kaydır; kavis çizerek falso ver. Ok ve izler uçuşu gösterir.');
 $('intro').querySelector('p').textContent=mode==='walk'?'Sahayı sürükleyerek dolaş.':'Bu noktadan şut at.';
 $('intro').querySelector('span').textContent=mode==='walk'?'Şut moduna dönerek bulunduğun yerden dene.':'Düz kaydır: şut. Kavisli kaydır: falso.';
 $('intro').classList.remove('fade');
 closeMenu();
}
$('shoot-mode').addEventListener('click',()=>setMode('shoot'));$('walk-mode').addEventListener('click',()=>setMode('walk'));
$('menu-button').addEventListener('click',()=>{fairplay.interrupt();clearFairplayNotice();walkKeys.clear();roamDrag=null;if(state==='aim'){drag=null;state='ready';hideAimArrow();world.render();}audio.suspend();updateStats();dialog.showModal();stopFrames();});
$('close-menu').addEventListener('click',closeMenu);$('resume-button').addEventListener('click',closeMenu);
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeMenu();}});
dialog.addEventListener('close',()=>{$('reset-confirm').hidden=true;lastTime=0;scheduleFrame();});
$('sound-button').addEventListener('click',()=>{stats.sound=!stats.sound;audio.setEnabled(stats.sound);ensureAudio();persist();updateStats();});
fpsButton.addEventListener('click',()=>{stats.showFPS=!stats.showFPS;resetFPS();persist();updateStats();});
$('performance-preference').addEventListener('change',()=>{const value=$('performance-preference').value;if(!['smooth','balanced','graphics'].includes(value)){updateStats();return;}stats.performancePreference=value;applyPresentation();persist();world.render();});
$('developer-toggle').addEventListener('click',()=>{stats.developerMode=!stats.developerMode;if(!stats.developerMode){stats.graphicsQuality='auto';stats.resolutionQuality='auto';}applyPresentation();persist();updateStats();world.render();});
for(const[id,key,allowed]of [['graphics-quality','graphicsQuality',['auto','balanced','high','ultra']],['resolution-quality','resolutionQuality',['auto','low','medium','high','max']]])$(id).addEventListener('change',()=>{const value=$(id).value;if(!stats.developerMode||!allowed.includes(value)){updateStats();return;}stats[key]=value;applyPresentation();persist();world.render();});
$('reset-stats').addEventListener('click',()=>{$('reset-confirm').hidden=false;});$('cancel-reset').addEventListener('click',()=>{$('reset-confirm').hidden=true;});
$('confirm-reset').addEventListener('click',()=>{fairplay.interrupt();clearFairplayNotice();const retained={sound:stats.sound,showFPS:stats.showFPS,performancePreference:stats.performancePreference,developerMode:stats.developerMode,graphicsQuality:stats.graphicsQuality,resolutionQuality:stats.resolutionQuality,balance:stats.balance,totalPoints:stats.totalPoints,ownedBalls:stats.ownedBalls,ownedParticles:stats.ownedParticles,equippedBall:stats.equippedBall,equippedParticle:stats.equippedParticle,goals:stats.goals};for(const field of Object.values(COURT_FIELDS)){retained[field.owned]=stats[field.owned];retained[field.equipped]=stats[field.equipped];}stats={...defaults(),...retained};persist();updateStats();$('reset-confirm').hidden=true;});
const shop=window.createPotaShop({
 getEconomy:()=>{
  const economy={balance:stats.balance,ownedBalls:[...stats.ownedBalls],ownedParticles:[...stats.ownedParticles],equippedBall:stats.equippedBall,equippedParticle:stats.equippedParticle};
  for(const field of Object.values(COURT_FIELDS)){economy[field.owned]=[...stats[field.owned]];economy[field.equipped]=stats[field.equipped];}
  return economy;
 },
 onPurchase:item=>{
  const actual=window.PotaShopCatalog.find(entry=>entry.type===item.type&&entry.id===item.id);if(!actual)return false;
  const owned=actual.type==='ball'?stats.ownedBalls:actual.type==='particle'?stats.ownedParticles:COURT_FIELDS[actual.type]?stats[COURT_FIELDS[actual.type].owned]:null;if(!owned)return false;if(owned.includes(actual.id))return true;
  if(stats.balance<actual.price)return 'Bu ürün için yeterli puanın yok. Basket atarak puan kazanabilirsin.';
  stats.balance-=actual.price;owned.push(actual.id);persist();updateStats();return true;
 },
 onEquip:item=>{
  if(item.type==='ball'&&stats.ownedBalls.includes(item.id)){stats.equippedBall=item.id;world.setBallSkin(item.id);}
  else if(item.type==='particle'&&stats.ownedParticles.includes(item.id)){stats.equippedParticle=item.id;world.setParticleStyle(item.id);}
  else if(COURT_FIELDS[item.type]){const field=COURT_FIELDS[item.type];if(!stats[field.owned].includes(item.id)||world[field.setter](item.id)===false)return false;stats[field.equipped]=item.id;if(item.type==='net')audio.setNetStyle(item.id);if(item.type==='environment')audio.setEnvironment(item.id);}
  else return false;persist();world.render();return true;
 }
});
$('open-shop').addEventListener('click',()=>{walkKeys.clear();roamDrag=null;closeMenu();shop.open();stopFrames();});
if(shopDialog)shopDialog.addEventListener('close',()=>{canvas.focus({preventScroll:true});lastTime=0;scheduleFrame();});
let contextRecoveryTimer=0;
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();graphicsLost=true;stopFrames();audio.suspend();$('loading').hidden=false;$('loading').classList.remove('done');$('loading').querySelector('p').textContent='Grafikler yeniden hazırlanıyor…';contextRecoveryTimer=setTimeout(()=>{try{sessionStorage.setItem('pota.compatibility','true');}catch(_){}location.reload();},5000);});
canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(contextRecoveryTimer);graphicsLost=false;lastTime=0;renderPaceTime=null;$('loading').hidden=true;scheduleFrame();});
// Read-only diagnostics for reproducible offline verification.
window.Pota={getState:()=>({state,mode,activeHoop,targetFps,displayRefreshRate,rewarded:rewarded.getState(),position:{x:cameraPosition.x,y:cameraPosition.y,z:cameraPosition.z},release:{...release},shotValue:shotPointValue(),stats:JSON.parse(JSON.stringify(stats)),arrowVisible:world.aimArrow.visible,aim:aimPreview?JSON.parse(JSON.stringify(aimPreview)):null,net:world.getNetDiagnostics(),cosmetics:world.getCosmeticState(),graphics:world.getGraphicsDiagnostics(),weather:world.getWeatherDiagnostics(),audio:audio.diagnostics,fairplay:fairplay.getDiagnostics(),ball:flight?{position:{...flight.position},time:flight.time,scored:flight.scored,guide:flight.drawingGuide?{active:flight.drawingGuide.active,elapsed:flight.drawingGuide.elapsed,duration:flight.drawingGuide.duration,reason:flight.drawingGuide.reason}:null}:null}),getShotReference:()=>Math.max(130,Math.min(220,height*.25))};
})();
