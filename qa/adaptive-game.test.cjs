/* Actual game/UI/storage/input/rewards with a controlled display clock. Renderer
 * and audio alone are replaced so frame pacing can be measured without a GPU. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8'),KEY='pota.fixed-shots.v1';
const seed={attempts:7,made:5,streak:2,best:4,balance:5432,totalPoints:10012,sound:false,showFPS:true,drawingMode:true,graphicsQuality:'ultra',resolutionQuality:'max',ownedBalls:['classic','carbon'],equippedBall:'carbon',ownedParticles:['none','sparks'],equippedParticle:'sparks',ownedNets:['nylon','chain'],equippedNet:'chain',ownedRims:['standard','gold-rim'],equippedRim:'gold-rim',ownedBackboards:['glass','street-board'],equippedBackboard:'street-board',ownedEnvironments:['gym','desert-court'],equippedEnvironment:'desert-court'};
const cosmetics=['ownedBalls','ownedParticles','ownedNets','ownedRims','ownedBackboards','ownedEnvironments','equippedBall','equippedParticle','equippedNet','equippedRim','equippedBackboard','equippedEnvironment'];
const tag=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
function harness(hz){return `
window.__clock=1000;Object.defineProperty(performance,'now',{value:()=>__clock});window.__wallTime=1800000000000;Date.now=()=>__wallTime;
window.__hidden=false;Object.defineProperty(document,'hidden',{get:()=>__hidden});
window.__online=true;Object.defineProperty(navigator,'onLine',{get:()=>__online});
const pending=new Map();let next=0;
window.requestAnimationFrame=fn=>{pending.set(++next,fn);return next};window.cancelAnimationFrame=id=>pending.delete(id);
window.__raf={count:()=>pending.size,run(time){__clock=time;const f=[...pending.values()];pending.clear();for(const fn of f)fn(time);return f.length}};
window.ResizeObserver=class{constructor(fn){this.fn=fn}observe(){this.fn()}disconnect(){}};
HTMLCanvasElement.prototype.setPointerCapture=function(id){this.__pointer=id};HTMLCanvasElement.prototype.hasPointerCapture=function(id){return this.__pointer===id};HTMLCanvasElement.prototype.releasePointerCapture=function(){this.__pointer=null};
window.__metrics={renders:0,animations:[],physicsSteps:0,netSteps:0,launches:[],qualities:[],resolutions:[],preferences:[],targets:[],observations:[],audioSuspends:0};
const oldPhysics=HoopPhysics,oldLaunch=HoopPhysics.launch,oldStep=HoopPhysics.step;window.HoopPhysics={...oldPhysics,launch:options=>{__metrics.launches.push(options);return oldLaunch(options)},step:(b,dt)=>{__metrics.physicsSteps++;return oldStep(b,dt)}};
window.__native={configured:false,ready:false,online:true,busy:false,testMode:true,privacyRequired:false,requests:[],lastReward:null};
window.PotaNative={getDeviceInfo:()=>JSON.stringify({refreshRate:${hz},displayRefreshRate:${hz},supportedRefreshRates:[${hz}],memoryClass:256,lowRamDevice:false}),getDisplayRefreshRate:()=>${hz},getRefreshRate:()=>${hz},getAdsState:()=>JSON.stringify(__native),requestRewarded:(multiplier,requestId)=>{__native.requests.push({multiplier,requestId});return true}};
window.createCourtScene=()=>{const T=THREE,world={camera:new T.PerspectiveCamera(58,.5,.01,100),ball:{position:new T.Vector3(),visible:true},aimArrow:{visible:false},resize(){},render(){__metrics.renders++},setBall(p){this.ball.position.copy(p)},setAimArrow(p,v){this.aimArrow.visible=v},setTrajectory(){},setGraphicsQuality(v){__metrics.qualities.push(v);return true},setResolutionQuality(v){__metrics.resolutions.push(v);return true},setPerformancePreference(v){__metrics.preferences.push(v);return true},setDisplayRefreshRate(v){__metrics.targets.push(v);return true},setDeveloperOverrides(v){__metrics.developer=v;__metrics.qualities.push(v.enabled?v.quality:'auto');__metrics.resolutions.push(v.enabled?v.resolution:'auto');return true},samplePerformanceFrame(v){__metrics.observations.push(v)},resetPerformanceTiming(){},degradeGraphics(){},getGraphicsDiagnostics(){return{quality:__metrics.qualities.at(-1)||'auto',resolutionQuality:__metrics.resolutions.at(-1)||'auto'}},getCosmeticState(){return{}},getNetDiagnostics(){return[]},getWeatherDiagnostics(){return{}},getNetAudioState(){return[]},beginNetFrame(){},stepNetPhysics(){__metrics.netSteps++},animate(dt,time){__metrics.animations.push({dt,time})}};for(const k of ['setBallSkin','setParticleStyle','setNetStyle','setRimStyle','setBackboardStyle','setEnvironmentStyle'])world[k]=()=>true;return world};
window.createCourtAudio=()=>new Proxy({diagnostics:{},suspend(){__metrics.audioSuspends++}},{get:(o,k)=>k in o?o[k]:()=>{}});
`;}
function fixture(hz,compat=false){
 let html=read('src/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+read('src/style.css')+'</style>');
 let game=read('src/game.js'),end=game.lastIndexOf('})();');assert(end>0);
 game=game.slice(0,end)+`window.__qa={finish:finishRecord,flight:()=>flight,physics:advancePhysics,ready(){state='ready';flight=null;recorded=false;drag=null;hideAimArrow();$('menu-button').disabled=false},worldTime:()=>worldTime};\n`+game.slice(end);
 const files=['vendor/three.min.js','src/physics.js','src/net.js','src/rewards.js','src/fairplay.js','src/shop.js'];
 const scripts=files.map(read).concat(harness(hz));if(compat)scripts.push(read('src/compat-scene.js'),"window.createCourtScene=()=>{throw Error('QA forces unavailable WebGL')};");if(fs.existsSync(path.join(ROOT,'src/rewarded.js')))scripts.push(read('src/rewarded.js'));scripts.push(game);
 return html.replace('</body>',()=>scripts.map(tag).join('')+'</body>');
}
async function open(browser,hz=60,saved=seed,boostSeed=null,compat=false){
 const context=await browser.newContext({viewport:{width:390,height:780},deviceScaleFactor:1}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));await context.route('http://pota-adaptive.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:fixture(hz,compat)}));
 if(saved)await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:KEY,value:saved});
 if(boostSeed)await context.addInitScript(value=>localStorage.setItem('pota.rewarded-boost.v1',JSON.stringify(value)),boostSeed);
 await page.goto('http://pota-adaptive.test/');assert(await page.evaluate(()=>Boolean(window.Pota&&window.__qa)),'Actual game boot: '+errors.join('; '));
 return{context,page,errors};
}
async function compatibility(browser){
 const {context,page,errors}=await open(browser,60,{...seed,showFPS:false},null,true);
 try{
  const result=await page.evaluate(()=>{
   const check=(v,m)=>{if(!v)throw Error(m)},state=Pota.getState(),canvas=document.getElementById('court');
   check(state.graphics.pipeline==='canvas2d-compatibility','Unavailable WebGL activates actual Canvas renderer');
   check(state.stats.balance===5432&&state.stats.equippedNet==='chain','Compatibility retains wallet and cosmetics');
   __raf.run(1000);const context=canvas.getContext('2d'),pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let lit=0;for(let i=0;i<pixels.length;i++)if(i%4<3&&pixels[i]>10)lit++;
   check(lit>1000,'Compatibility canvas contains rendered pixels');
   function event(type,x,y,t){__clock=t;const e=new PointerEvent(type,{pointerId:1,button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(e,'timeStamp',{value:t});canvas.dispatchEvent(e)}event('pointerdown',190,650,1100);event('pointermove',195,450,1400);event('pointerup',195,450,1420);check(Pota.getState().state==='release','Compatibility uses actual swipe shot handler');
   for(let i=1;i<=240;i++)__raf.run(1420+i*1000/60);
   const after=Pota.getState();check(after.ball===null||Object.values(after.ball.position).every(Number.isFinite),'Fallback ball stays finite');
   check(after.net.every(n=>n.finite!==false),'Fallback net stays finite');
   return{pipeline:state.graphics.pipeline,lit,resolution:state.graphics.sceneResolution,afterState:after.state,attempts:after.stats.attempts,netCount:after.net.length};
  });await page.screenshot({path:path.join(__dirname,'adaptive-compatibility.png')});assert.deepEqual(errors,[]);return result;
 }finally{await context.close()}
}
async function settings(browser){
 const {context,page,errors}=await open(browser);
 try{
  const result=await page.evaluate(async({seed,cosmetics,KEY})=>{
   const $=id=>document.getElementById(id),check=(v,m)=>{if(!v)throw Error(m)},snap=()=>Pota.getState(),flush=()=>new Promise(r=>setTimeout(r,25));
   let state=snap();for(const field of cosmetics)check(JSON.stringify(state.stats[field])===JSON.stringify(seed[field]),'Preserved '+field);
   check(state.stats.balance===seed.balance&&state.stats.totalPoints===seed.totalPoints,'Wallet retained');
   check(!state.stats.drawingMode&&!$('drawing-mode-button')&&!$('drawing-overlay'),'Drawing UI and saved mode removed');
   check(!$('fullscreen'),'Fullscreen button absent');
   check(state.stats.graphicsQuality==='auto'&&state.stats.resolutionQuality==='auto','Old manual settings migrate to automatic');
   check(state.stats.showFPS&& !$('fps-counter').hidden,'Existing FPS preference retained');
   check(__metrics.qualities.at(-1)==='auto'&&__metrics.resolutions.at(-1)==='auto','Renderer boot uses automatic quality and resolution');
   check(__raf.count()===1,'Single initial RAF');
   $('menu-button').click();check(__raf.count()===0,'Menu stops RAF');
   const dev=$('developer-toggle');
   check(dev,'Developer mode exists');
   const quality=$('graphics-quality'),resolution=$('resolution-quality');
   check(quality&&resolution,'Developer manual selectors retained');
   check(!quality.checkVisibility()&&!resolution.checkVisibility(),'Manual controls hidden from ordinary settings');
   const pref=$('performance-preference');check(pref,'Smoothness/graphics preference exists');
   check(pref.checkVisibility(),'Performance preference visible in settings');
   const values=Array.from(pref.options).map(o=>o.value);check(values.includes('smooth')&&values.includes('graphics'),'Both preference choices');
   pref.value='graphics';pref.dispatchEvent(new Event('change',{bubbles:true}));
   check(snap().stats.performancePreference==='graphics','Graphics preference selected');
   check(JSON.parse(localStorage.getItem(KEY)).performancePreference==='graphics','Preference persisted');
   dev.click();check(snap().stats.developerMode===true&&quality.checkVisibility()&&resolution.checkVisibility(),'Developer mode exposes manual controls');
   quality.value='ultra';quality.dispatchEvent(new Event('change',{bubbles:true}));resolution.value='medium';resolution.dispatchEvent(new Event('change',{bubbles:true}));
   check(snap().stats.graphicsQuality==='ultra'&&snap().stats.resolutionQuality==='medium','Developer manual settings selected');
   dev.click();check(snap().stats.developerMode===false&&!quality.checkVisibility(),'Developer mode can return to automatic');
   $('fps-button').click();check($('fps-counter').hidden&&!snap().stats.showFPS,'FPS can turn off');
   $('fps-button').click();check(!$('fps-counter').hidden&&snap().stats.showFPS,'FPS can turn on');
   $('close-menu').click();await flush();check(__raf.count()===1,'Closing menu resumes once');
   window.dispatchEvent(new Event('pota:pause'));check(__raf.count()===0,'Native pause stops RAF');
   const stopped=__metrics.renders;check(__raf.run(500000)===0&&__metrics.renders===stopped,'No background rendering');
   __hidden=true;document.dispatchEvent(new Event('visibilitychange'));__hidden=false;document.dispatchEvent(new Event('visibilitychange'));check(__raf.count()===0,'Hidden/visible cannot resume native pause');
   window.dispatchEvent(new Event('pota:resume'));window.dispatchEvent(new Event('pota:resume'));check(__raf.count()===1,'Resume remains single RAF');
   __raf.run(500000);check(__metrics.animations.at(-1).dt<=1/60+.0001,'Resume has no elapsed catchup');
   __hidden=true;document.dispatchEvent(new Event('visibilitychange'));check(__raf.count()===0,'Hidden page stops work');
   __hidden=false;document.dispatchEvent(new Event('visibilitychange'));check(__raf.count()===1,'Visible page resumes once');
   return{wallet:state.stats.balance,cosmetics:cosmetics.length,defaultAuto:true,oldDrawingRemoved:true,manualControlsHidden:true,developerOverrides:true,preferenceValues:values,savedPreference:JSON.parse(localStorage.getItem(KEY)).performancePreference,quietPause:true};
  },{seed,cosmetics,KEY});
  assert.deepEqual(errors,[]);return result;
 }finally{await context.close()}
}
async function rewardScoring(browser,multiplier=2){
 const boostSeed=multiplier===3?{version:1,active:null,completedOffers:3}:null;
 const {context,page,errors}=await open(browser,60,{...seed,showFPS:false},boostSeed);
 try{
  const result=await page.evaluate(({multiplier,KEY})=>{
   const $=id=>document.getElementById(id),snap=()=>Pota.getState(),check=(v,m)=>{if(!v)throw Error(m)};let serial=0,start=2000;
   const refresh=()=>window.dispatchEvent(new CustomEvent('pota:ad-state',{detail:{}}));
   function gesture(){__qa.ready();start+=4000;const id=++serial,canvas=$('court');function event(type,x,y,t){__clock=t;const e=new PointerEvent(type,{pointerId:id,button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(e,'timeStamp',{value:t});canvas.dispatchEvent(e)}event('pointerdown',180,650,start);for(let i=1;i<=7;i++)event('pointermove',180+Math.sin(i/7*Math.PI)*(serial+2),650-i*180/7,start+i*(47+serial));event('pointerup',180,470,start+7*(47+serial));check(snap().state==='release','Actual gesture launches shot');check(!__metrics.launches.at(-1).drawnPath,'Saved drawing preference cannot select removed drawing physics');return __qa.flight()}
   check($('reward-ad-button').hidden,'No configured SDK means no offer');
   __native.configured=true;__native.ready=true;__native.online=true;refresh();
   check(!$('reward-ad-button').hidden,'Available native reward offers visible');
   __online=false;__native.online=false;window.dispatchEvent(new Event('offline'));check($('reward-ad-button').hidden,'Offline offer hidden');
   $('reward-ad-button').click();check(__native.requests.length===0,'Hidden offline button cannot start ad');
   __online=true;__native.online=true;window.dispatchEvent(new Event('online'));
   $('reward-ad-button').click();let request=__native.requests.at(-1);check(request.multiplier===multiplier,'Correct 2x/3x offer requested');
   window.dispatchEvent(new CustomEvent('pota:ad-result',{detail:{...request,earned:false,completedAds:0,requiredAds:multiplier===3?2:1,reason:'not-completed'}}));
   check(snap().rewarded.activeMultiplier===1&&$('boost-badge').hidden,'Failed or dismissed ad earns no boost');
   $('reward-ad-button').click();request=__native.requests.at(-1);const first=gesture();check(first.pointMultiplier===1,'Shot before ad snapshots base multiplier');
   const requiredAds=multiplier===3?2:1,token='native-receipt-test-'+serial+'-'+multiplier;
   __native.lastReward={...request,completedAds:requiredAds,earned:true,token};
   const receipt={...request,completedAds:requiredAds,requiredAds,earned:true,token};window.dispatchEvent(new CustomEvent('pota:ad-result',{detail:receipt}));
   check(snap().rewarded.activeMultiplier===multiplier&&snap().rewarded.remainingSeconds===300,'Completed native receipt grants exactly five minutes');
   check(!$('boost-badge').hidden&&$('boost-value').textContent.includes(String(multiplier)),'Active multiplier badge visible');
   const before=snap().stats;__qa.finish(true);__qa.finish(true);let after=snap().stats;
   check(after.balance-before.balance===4,'In-flight base basket keeps launch snapshot: 2 base + 2 streak');
   const boosted=gesture();check(boosted.pointMultiplier===multiplier,'Boosted shot captures earned multiplier');
   __wallTime+=300001;snap();const pre=snap().stats;__qa.finish(true);after=snap().stats;
   check(after.balance-pre.balance===5*multiplier,'Boosted basket multiplies base and streak even if timer expires in flight');
   check(after.history.at(-1).points===5*multiplier,'Recorded reward equals wallet award');
   check(snap().rewarded.activeMultiplier===1,'Expired boost returns to normal');
   window.dispatchEvent(new CustomEvent('pota:ad-result',{detail:receipt}));check(snap().rewarded.activeMultiplier===1,'Replayed completed callback cannot mint boost');
   const ordinary=gesture();check(ordinary.pointMultiplier===1,'New shot after expiry earns normal reward');
   const last=snap().stats;__qa.finish(true);after=snap().stats;check(after.balance-last.balance===6,'Normal scoring and streak continue');
   check(JSON.parse(localStorage.getItem(KEY)).balance===after.balance,'Rewarded wallet persisted');
   return{multiplier,requiredAds,duration:300,baseSnapshotAward:4,boostedSnapshotAward:5*multiplier,postExpiryAward:6,offlineHidden:true,dismissedUnrewarded:true,replayUnrewarded:true,wallet:after.balance};
  },{multiplier,KEY});assert.deepEqual(errors,[]);return result;
 }finally{await context.close()}
}
async function pacing(browser,hz){
 const {context,page,errors}=await open(browser,hz,{sound:false,showFPS:true});
 try{
  const result=await page.evaluate(hz=>{
   const check=(v,m)=>{if(!v)throw Error(m)};let time=1000;__raf.run(time);
   const initial=__metrics.animations.length,worldStart=__qa.worldTime(),netStart=__metrics.netSteps;
   for(let i=1;i<=hz*4;i++){time=1000+i*1000/hz;check(__raf.count()===1,'Exactly one RAF at display '+hz);__raf.run(time)}
   const frames=__metrics.animations.length-initial,elapsed=__qa.worldTime()-worldStart,target=hz>=120?120:60;
   check(Pota.getState().targetFps===target,'Declared display target '+target);
   check(Math.abs(frames-target*4)<=3,'Render target '+target+' at '+hz+' Hz, got '+frames/4);
   check(Math.abs(elapsed-4)<.025,'Paced time accumulates actual elapsed, got '+elapsed);
   const steps=__metrics.netSteps-netStart;check(Math.abs(steps-960)<=1,'240Hz physics remains independent of display cadence');
   const fps=document.getElementById('fps-counter').textContent;check(Math.abs(parseInt(fps)-target)<=2,'FPS measures displayed frames');
   const before=__qa.worldTime(),animationCount=__metrics.animations.length;__raf.run(time+10000);const catchup=__qa.worldTime()-before;
   check(catchup>=0&&catchup<=.251,'Long stall caps simulation catchup');
   check(__metrics.animations.length<=animationCount+1,'No multi-render catchup loop');
   check(/FPS/.test(fps),'FPS label retained');
   return{hz,target,rendered:frames,measuredFPS:frames/4,physicsSteps:steps,elapsed,catchup,fps,declaredTarget:Pota.getState().targetFps,displayRefreshRate:Pota.getState().displayRefreshRate};
  },hz);assert.deepEqual(errors,[]);return result;
 }finally{await context.close()}
}
async function main(){
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{const preferences=await settings(browser),framePacing=[],rewarded=[];for(const hz of [60,120,144])framePacing.push(await pacing(browser,hz));for(const multiplier of [2,3])rewarded.push(await rewardScoring(browser,multiplier));const fallback=await compatibility(browser),result={passed:true,implementation:'Actual game/UI/physics/rewards/fairplay/shop/native-reward controller with scene/audio-only fixture and controlled display clock, plus actual Canvas2D fallback',preferences,framePacing,rewarded,fallback};fs.writeFileSync(path.join(__dirname,'adaptive-game-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))}finally{await browser.close()}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={open,read,ROOT,KEY,seed,cosmetics,settings,pacing,rewardScoring,compatibility};
