/* Real game input handlers and scoring, with test-only scene/audio and frame controls.
 * No WebGL, product hooks or duplicated award implementation are used. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const seed={attempts:7,made:7,streak:3,best:7,balance:5000,totalPoints:200,sound:false,ownedBalls:['classic','carbon'],equippedBall:'classic',ownedNets:['nylon','chain'],equippedNet:'chain',ownedParticles:['none'],ownedRims:['standard','gold-rim'],equippedRim:'gold-rim'};
let html=read('src/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
html=html.replace('</head>','<style>#stage{position:relative!important;width:400px!important;height:800px!important}#court{width:400px;height:800px}</style></head>');
if(!html.includes('id="fairplay-notice"'))html=html.replace('</body>','<aside id="fairplay-notice" hidden><strong id="fairplay-title"></strong><p id="fairplay-message"></p></aside></body>');
let game=read('src/game.js');
const end=game.lastIndexOf('})();');
assert(end>0);
game=game.slice(0,end)+`window.__qa={finish:finishRecord,ready:()=>{state='ready';flight=null;recorded=false;drag=null;$('menu-button').disabled=false;},frame};\n`+game.slice(end);
const harness=`
window.__clock=1000;Object.defineProperty(performance,'now',{value:()=>window.__clock});
window.requestAnimationFrame=()=>1;window.ResizeObserver=class{constructor(fn){this.fn=fn}observe(){this.fn()}disconnect(){}};
HTMLCanvasElement.prototype.setPointerCapture=function(id){this.__captured=id};HTMLCanvasElement.prototype.hasPointerCapture=function(id){return this.__captured===id};HTMLCanvasElement.prototype.releasePointerCapture=function(){this.__captured=null};
window.createCourtScene=({canvas})=>{
 const T=window.THREE,camera=new T.PerspectiveCamera(58,.5,.01,100),ball={position:new T.Vector3(),visible:true},aimArrow={visible:false};
 const w={camera,ball,aimArrow,resize(){},render(){},setBall(p){ball.position.copy(p)},setAimArrow(p,v){aimArrow.visible=v},setTrajectory(){},setGraphicsQuality(){return true},setResolutionQuality(){return true},getGraphicsDiagnostics(){return{}},getCosmeticState(){return{}},getNetDiagnostics(){return[]},getWeatherDiagnostics(){return{}},getNetAudioState(){return[]},beginNetFrame(){},stepNetPhysics(){},animate(){}};
 for(const key of ['setBallSkin','setParticleStyle','setNetStyle','setRimStyle','setBackboardStyle','setEnvironmentStyle'])w[key]=()=>true;return w;
};
window.createCourtAudio=()=>new Proxy({diagnostics:{}},{get:(target,key)=>key in target?target[key]:()=>{}});
`;
html=html.replace('</body>',()=>[
 read('vendor/three.min.js'),read('src/physics.js'),read('src/rewards.js'),read('src/fairplay.js'),read('src/shop.js'),harness,game
].map(s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>').join('')+'</body>');

(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  const context=await browser.newContext({viewport:{width:420,height:840}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(String(e));console.error('Browser error:',String(e));});
  await page.route('**/*',route=>route.request().url()==='http://pota-fairplay.test/'?route.fulfill({status:200,contentType:'text/html',body:html}):route.abort());
  await page.addInitScript(seed=>{localStorage.setItem('pota.fixed-shots.v1',JSON.stringify(seed));},seed);
  await page.goto('http://pota-fairplay.test/');
  assert.equal(await page.evaluate(()=>Boolean(window.Pota&&window.__qa)),true,'real game boot; page errors: '+errors.join('; '));
  const results=await page.evaluate(()=>{
   const check=(value,message)=>{if(!value)throw Error(message)},$=id=>document.getElementById(id),snap=()=>Pota.getState();
   let start=1000,serial=0;
   function pointer({dx=0,duration=350,cadence=4000,startX=200,curve=0}={}){
    __qa.ready();start+=cadence;__clock=start;const id=++serial,canvas=$('court');
    function event(type,x,y,t){__clock=t;const e=new PointerEvent(type,{pointerId:id,button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(e,'timeStamp',{value:t});canvas.dispatchEvent(e);}
    event('pointerdown',startX,650,start);
    for(let i=1;i<=7;i++)event('pointermove',startX+dx*i/7+Math.sin(Math.PI*i/7)*curve,650-180*i/7,start+duration*i/7);
    event('pointerup',startX+dx,470,start+duration);check(snap().state==='release','pointer handler must release actual flight');
   }
   function complete(){const before=snap().stats;__qa.finish(true);__qa.finish(true);const after=snap().stats;check(after.attempts===before.attempts+1,'finishRecord must be one-shot');check(after.history.length===(before.history.length||0)+1,'one history record only');return after;}
   const outcomes=[];
   for(let i=1;i<=9;i++){
    pointer();const pre=snap().stats,decision=snap().fairplay,post=complete(),last=post.history.at(-1);
    if(i<8){check(decision.status==='clear','early gesture must remain eligible');check($('fairplay-notice').hidden,'no early notice');}
    if(i===8){check(decision.status==='warning','eighth exact gesture warns');check(!$('fairplay-notice').hidden,'first warning visible');check(post.balance>pre.balance,'first warning shot still earns points');check($('score-popup').firstChild.textContent==='+2','warning basket shows base +2');check(last.pointsBlocked===false,'warning history eligible');}
    if(i===9){check(decision.status==='restricted','ninth identical gesture restricted');check(post.balance===pre.balance&&post.totalPoints===pre.totalPoints,'blocked basket cannot mint balance or total');check(post.made===pre.made+1,'blocked basket still counted as made');check(post.streak===0,'blocked basket clears streak');check(last.points===0&&last.bonus===0&&last.pointsBlocked===true,'blocked history explicitly records no points');check($('score-popup').firstChild.textContent==='Basket','blocked popup retains basket');check($('score-popup').querySelector('.score-bonus').textContent==='Puan verilmedi','blocked popup explains zero reward');check(!$('fairplay-notice').hidden,'continued automation warning visible');}
    outcomes.push({shot:i,status:decision.status,award:last.points});
   }
   pointer({dx:12,curve:3});let pre=snap().stats,after=complete();
   check(snap().fairplay.status==='clear','different manual gesture restores eligibility');check($('fairplay-notice').hidden,'manual gesture clears stale warning');check(after.balance===pre.balance+2,'manual basket resumes base points');
   for(let i=0;i<20;i++){
    pointer({dx:(i%4)*1.4,duration:310+(i%5)*11,cadence:3800+(i%3)*37,curve:(i%3)*1.7,startX:200+(i%2)*2});
    check(snap().fairplay.status==='clear'&&$('fairplay-notice').hidden,'normal gesture jitter must not warn');complete();
   }
   for(let i=0;i<20;i++){
    pointer({duration:320+(i%4)*13,cadence:4100+(i%4)*41});
    check(snap().fairplay.status==='clear'&&$('fairplay-notice').hidden,'normal same-origin gestures with human timing must not warn');complete();
   }
   const keyOutcomes=[];
   for(let i=1;i<=17;i++){
    __qa.ready();start+=4000;__clock=start;const canvas=$('court');
    function key(type,t){__clock=t;const e=new KeyboardEvent(type,{code:'Space',bubbles:true,cancelable:true});Object.defineProperty(e,'timeStamp',{value:t});canvas.dispatchEvent(e);}
    key('keydown',start);__clock=start+350;__qa.frame(__clock);key('keyup',start+350);
    check(snap().state==='release','keyboard handler must release actual flight');
    const decision=snap().fairplay,before=snap().stats,post=complete();
    if(i<16)check(decision.status==='clear','keyboard does not warn early');
    if(i===16)check(decision.status==='warning'&&post.balance>before.balance,'keyboard first warning earns points');
    if(i===17)check(decision.status==='restricted'&&post.balance===before.balance,'keyboard continued pattern earns zero');
    keyOutcomes.push({shot:i,status:decision.status});
   }
   window.dispatchEvent(new Event('pota:pause'));check($('fairplay-notice').hidden&&snap().fairplay.status==='clear','pause clears session restriction and notice');
   pointer({dx:7,duration:381});const recoveredBefore=snap().stats,recovered=complete();
   check(recovered.balance===recoveredBefore.balance+2&&snap().fairplay.status==='clear','manual shot after pause earns points');
   const saved=JSON.parse(localStorage.getItem('pota.fixed-shots.v1'));
   check(saved.ownedNets.includes('chain')&&saved.ownedRims.includes('gold-rim')&&saved.ownedBalls.includes('carbon'),'existing owned cosmetics retained');
   check(saved.equippedNet==='chain'&&saved.equippedRim==='gold-rim','equipped cosmetics retained');
   check(saved.balance>=5000&&saved.totalPoints>=200,'prior wallet untouched');
   check(!('fairplay' in saved)&&!('pointsBlocked' in saved),'restriction state never persisted at save root');
   return{outcomes,keyOutcomes,attempts:saved.attempts,made:saved.made,normalShots:40,warningShots:snap().fairplay.warnings,blockedShots:snap().fairplay.blockedShots};
  });
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,implementation:'actual game pointer handlers and finishRecord with real physics/rewards/fairplay; scene/audio-only stubs',...results},null,2));
  await context.close();
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
