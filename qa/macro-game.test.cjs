/* Independent regression of actual POTA input handlers and score awards.
 * Scene/audio alone use the existing lightweight fixture. Tests dispatch real
 * PointerEvent handlers; only basket completion is controlled so accuracy never
 * determines the detector outcome. Video confirms vertical macro strokes and a
 * roughly 5.2 s cycle; Android batching/jitter below is synthetic coverage, not
 * an assertion about unobservable input events in the user's recording. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {open,seed,KEY}=require('./adaptive-game.test.cjs');

async function evaluatePattern(browser,kind){
 const {context,page,errors}=await open(browser,60,{...seed,showFPS:false});
 try{
  const result=await page.evaluate(({kind,KEY})=>{
   const $=id=>document.getElementById(id),snap=()=>Pota.getState(),check=(v,m)=>{if(!v)throw Error(kind+': '+m)};
   const canvas=$('court');let serial=0,start=2000;
   const report=[];
   function dispatch(type,x,y,at,id,coalesced){
    __clock=at+((serial%3)-1)*.6;
    const event=new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true,cancelable:true});
    Object.defineProperty(event,'timeStamp',{value:at});
    if(coalesced)Object.defineProperty(event,'getCoalescedEvents',{value:()=>coalesced.map(p=>({clientX:p.x,clientY:p.y,timeStamp:p.t}))});
    canvas.dispatchEvent(event);
   }
   function gesture({manual=false,straight=false,reset=true}={}){
    if(reset)__qa.ready();
    const n=serial++,id=n+1,rect=canvas.getBoundingClientRect();
    // Normalized visible video stroke, scaled to this fixture's viewport.
    const x=rect.left+rect.width*.5,y=rect.top+rect.height*.8191,length=rect.height*(.8191-.5826);
    const noisy=kind!=='exact',jitter=[0,8,-6,5,-9,4,1,-4];
    const duration=manual?310+(n%7)*13:350+(noisy?jitter[n%jitter.length]:0);
    const cadence=manual?4800+(n%5)*61:5200+(noisy?[0,12,-9,7,-14,5][n%6]:0);
    start+=cadence;dispatch('pointerdown',x+(manual&&!straight?(n%3)*1.5:0),y,start,id);
    const count=kind==='sparse'?3:kind==='coalesced'?15:7;
    const points=[];
    for(let i=1;i<=count;i++){
     const fraction=i/count,t=start+duration*fraction;
     let px=x,py=y-length*fraction;
     if(manual&&!straight){px+=(n%3)*1.5+Math.sin(Math.PI*fraction)*(2+n%5);py+=Math.sin(Math.PI*fraction)*(n%4);}
     else if(noisy){px=Math.round(px);py=Math.round(py);}
     points.push({x:px,y:py,t});
    }
    if(kind==='coalesced'){
     // Same physical line, delivered in a different number of frames.
     const batch=n%2?4:3;
     for(let i=0;i<points.length;i+=batch){const items=points.slice(i,i+batch),p=items.at(-1);dispatch('pointermove',p.x,p.y,p.t,id,items);}
    }else for(const p of points.slice(0,-1))dispatch('pointermove',p.x,p.y,p.t,id);
    const last=points.at(-1);dispatch('pointerup',last.x,last.y,last.t,id);
    check(snap().state==='release','actual pointer handlers must release flight');
    check(!__metrics.launches.at(-1).drawnPath,'drawing mode stays removed');
    return snap().fairplay;
   }
   function complete(expectedBlocked){
    const before=snap().stats;__qa.finish(true);__qa.finish(true);const after=snap().stats,last=after.history.at(-1);
    check(after.attempts===before.attempts+1,'duplicate completion cannot duplicate attempt');
    check(after.made===before.made+1,'blocked basket still records actual make');
    check(last.pointsBlocked===expectedBlocked,'history records flight eligibility');
    if(expectedBlocked){
     check(after.balance===before.balance&&after.totalPoints===before.totalPoints,'restricted flight never awards wallet or total points');
     check(after.streak===0&&last.points===0&&last.bonus===0,'restricted make clears streak and bonus');
     check($('score-popup').firstChild.textContent==='Basket','restricted popup records basket');
     check($('score-popup').querySelector('.score-bonus').textContent==='Puan verilmedi','restricted popup explains withheld points');
    }else check(after.balance>before.balance&&last.points>0,'eligible basket earns points');
    return{award:last.points,blocked:last.pointsBlocked};
   }
   let warningAt=0,restrictedAt=0;
   for(let i=1;i<=32;i++){
    const decision=gesture(),blocked=decision.status==='restricted';
    if(i<=2)check(decision.status==='clear'&&$('fairplay-notice').hidden,'two video-like shots alone are insufficient automation evidence');
    if(decision.status==='warning'&&!warningAt){warningAt=i;check(!$('fairplay-notice').hidden,'first warning is visible');}
    const award=complete(blocked);report.push({shot:i,status:decision.status,repeatCount:decision.repeatCount,...award});
    if(blocked){restrictedAt=i;break;}
   }
   check(warningAt>=8,'conservative repetition warning requires at least eight shots');
   check(warningAt<=24,'repetitive macro must warn within bounded evidence window');
   check(restrictedAt===warningAt+1,'continued same macro is restricted after first warning');
   const warning=report.find(r=>r.shot===warningAt);check(warning.award>0&&!warning.blocked,'first warning shot remains eligible');
   // A replay may trigger pause/visibility/focus changes while a blocked flight
   // is in progress. Such interruptions cannot rewrite its point eligibility.
   const again=gesture();check(again.status==='restricted','continued replay stays restricted');
   check($('menu-button').disabled,'in-flight menu cannot open');$('menu-button').click();check(!$('menu-dialog').open,'disabled settings button cannot clear decision');
   window.dispatchEvent(new Event('pota:pause'));window.dispatchEvent(new Event('pota:resume'));
   check(snap().fairplay.status==='clear','pause clears future-session detector candidate');
   check(__qa.flight().fairplay.allowPoints===false,'pause cannot modify blocked flight snapshot');complete(true);
   const manual=gesture({manual:true});check(manual.status==='clear'&&$('fairplay-notice').hidden,'different manual shot restores eligibility');complete(false);
   for(let i=0;i<40;i++){
    const decision=gesture({manual:true,straight:i>=20});check(decision.status==='clear'&&$('fairplay-notice').hidden,'ordinary manual variation must not warn at shot '+i);complete(false);
   }
   const saved=JSON.parse(localStorage.getItem(KEY));
   for(const key of ['ownedBalls','ownedParticles','ownedNets','ownedRims','ownedBackboards','ownedEnvironments'])check(saved[key].length>=2,'old cosmetics retained: '+key);
   check(saved.balance>=5432&&saved.totalPoints>=10012,'prior economy survives session');
   check(!('fairplay' in saved)&&!('pointsBlocked' in saved),'detector restriction is not persisted at save root');
   return{kind,warningAt,restrictedAt,normalShots:40,normalCurvedShots:20,normalSameOriginStraightShots:20,pauseCannotClearFlight:true,report,wallet:saved.balance};
  },{kind,KEY});
  assert.deepEqual(errors,[],'No real game page errors');return result;
 }finally{await context.close()}
}
async function main(){
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  const patterns=[];for(const kind of ['exact','coalesced','sparse'])patterns.push(await evaluatePattern(browser,kind));
  const result={passed:true,implementation:'Actual game/PointerEvent/scoring/storage with real physics/fairplay/reward controller; scene/audio-only fixture',videoEvidence:'Two vertical strokes about5.2seconds apart; delivered event count and timestamp jitter are not visible in the recording',patterns};
  fs.writeFileSync(path.join(__dirname,'macro-game-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close()}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
module.exports={evaluatePattern,main};
