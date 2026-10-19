/* Bounded verification of shipped game/UI/storage, render pacing and 240 Hz
 * simulation. Only 3D rendering/audio are stubbed by the existing harness;
 * the fallback checks additionally use the actual Canvas2D renderer. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {open,KEY,seed,cosmetics}=require('./adaptive-game.test.cjs');
const MODES=['smooth','balanced','graphics'];
const target=(mode,hz)=>mode==='graphics'?60:mode==='balanced'?(hz>=89?90:60):(hz>=119?120:60);
async function pacing(browser,mode,hz){
 const {context,page,errors}=await open(browser,hz,{sound:false,showFPS:true,performancePreference:mode});
 try{
  const result=await page.evaluate(({mode,hz,expected})=>{
   const check=(v,m)=>{if(!v)throw Error(m)};__raf.run(1000);
   const initial=__metrics.animations.length,start=__qa.worldTime(),netStart=__metrics.netSteps;
   for(let i=1;i<=hz*4;i++){check(__raf.count()===1,'One RAF at '+mode+'/'+hz);__raf.run(1000+i*1000/hz);check(__raf.count()===1,'One next RAF at '+mode+'/'+hz);}
   const state=Pota.getState(),rendered=__metrics.animations.length-initial,elapsed=__qa.worldTime()-start,steps=__metrics.netSteps-netStart,fps=document.getElementById('fps-counter').textContent;
   check(state.stats.performancePreference===mode,'Saved '+mode+' accepted');
   check(state.targetFps===expected,'Target '+expected+' at '+mode+'/'+hz+', got '+state.targetFps);
   check(Math.abs(rendered-expected*4)<=3,'Render target '+expected+' at '+mode+'/'+hz+', got '+rendered/4);
   check(Math.abs(elapsed-4)<.025,'Elapsed simulation remains four seconds, got '+elapsed);
   check(Math.abs(steps-960)<=5,'240 Hz simulation invariant, got '+steps);
   check(Math.abs(parseInt(fps)-expected)<=2,'FPS label measures paced frames, got '+fps);
   const old=__qa.worldTime(),before=__metrics.renders;__raf.run(15000);
   check(__metrics.renders===before+1,'Single render after stall');check(__qa.worldTime()-old<=.251,'Stall catchup remains bounded');
   return{mode,hz,target:expected,rendered,measuredFPS:rendered/4,physicsSteps:steps,elapsed,fps,singleRAF:true};
  },{mode,hz,expected:target(mode,hz)});
  assert.deepEqual(errors,[]);return result;
 }finally{await context.close()}
}
async function switching(browser){
 const {context,page,errors}=await open(browser,144,{...seed,performancePreference:'graphics'});
 try{
  const result=await page.evaluate(()=>{
   const check=(v,m)=>{if(!v)throw Error(m)},$=id=>document.getElementById(id),select=$('performance-preference');let time=1000;
   const change=mode=>{select.value=mode;select.dispatchEvent(new Event('change',{bubbles:true}));};
   __raf.run(time);const switches=[];
   for(const [mode,expected]of [['balanced',90],['smooth',120],['graphics',60]]){
    const before=__metrics.animations.length;change(mode);
    check(Pota.getState().targetFps===expected,'Immediate mode target '+mode);check(__raf.count()===1,'Changing mode keeps one RAF');
    time+=1000/144;__raf.run(time);
    check(__metrics.animations.length===before+1,'Mode change clears previous frame deadline: '+mode);
    const start=__metrics.animations.length,begin=time;
    for(let i=1;i<=144*2;i++){check(__raf.count()===1,'Single RAF through mode switch');__raf.run(time=begin+i*1000/144);}
    const frames=__metrics.animations.length-start;check(Math.abs(frames-expected*2)<=2,'Switched render pacing '+mode+', got '+frames/2);
    const fps=$('fps-counter').textContent;check(Math.abs(parseInt(fps)-expected)<=2,'FPS window refreshes after switching '+mode);
    switches.push({mode,target:expected,rendered:frames,fps});
   }
   change('balanced');const display=[];
   for(const [hz,expected]of [[60,60],[90,90],[120,90],[144,90]]){
    window.dispatchEvent(new CustomEvent('pota:display-change',{detail:{refreshRate:hz}}));
    const state=Pota.getState();check(state.displayRefreshRate===hz&&state.targetFps===expected,'Balanced reacts to physical display '+hz);
    check(__metrics.targets.at(-1)===hz,'Scene receives physical display '+hz);check(__raf.count()===1,'Display change keeps one RAF');
    const before=__metrics.animations.length;__raf.run(time+=1000/hz);check(__metrics.animations.length===before+1,'Display change clears deadline');display.push({hz,target:state.targetFps});
   }
   $('menu-button').click();check(__raf.count()===0,'Settings pauses game');select.value='graphics';select.dispatchEvent(new Event('change',{bubbles:true}));
   check(__raf.count()===0&&Pota.getState().targetFps===60,'Paused preference does not start RAF');
   return{switches,display,pausedSelection:true,singleRAF:true};
  });assert.deepEqual(errors,[]);return result;
 }finally{await context.close()}
}
async function settings(browser){
 const {context,page,errors}=await open(browser,120,{...seed,performancePreference:'balanced'});
 try{
  const before=await page.evaluate(({seed,cosmetics,KEY})=>{
   const check=(v,m)=>{if(!v)throw Error(m)},$=id=>document.getElementById(id),state=Pota.getState();
   check(state.stats.performancePreference==='balanced'&&state.targetFps===90,'Balanced save restores on initial boot');
   for(const field of cosmetics)check(JSON.stringify(state.stats[field])===JSON.stringify(seed[field]),'Cosmetic retained '+field);
   check(state.stats.balance===seed.balance&&state.stats.totalPoints===seed.totalPoints,'Wallet retained');
   check(Number($('current-points-value').textContent.replace(/\D/g,''))===seed.balance,'Header displays current wallet');
   const p=$('current-points').getBoundingClientRect(),m=$('menu-button').getBoundingClientRect();check(p.right<=m.left+2,'Wallet remains left of settings');
   $('menu-button').click();const select=$('performance-preference'),options=Array.from(select.options).map(o=>({value:o.value,label:o.textContent}));
   check(JSON.stringify(options.map(o=>o.value))===JSON.stringify(['smooth','balanced','graphics']),'Exactly three valid preference options');
   check(options.find(o=>o.value==='balanced').label==='Dengeli','Balanced label is Turkish');
   check(select.value==='balanced','GUI reflects restored balanced preference');
   select.value='graphics';select.dispatchEvent(new Event('change',{bubbles:true}));
   check(Pota.getState().stats.performancePreference==='graphics'&&Pota.getState().targetFps===60,'Graphics selection changes target');
   check(JSON.parse(localStorage.getItem(KEY)).performancePreference==='graphics','Selected mode is persisted');
   check($('developer-panel').hidden,'Developer controls remain hidden');
   check(!$('fullscreen')&&!$('drawing-mode-button')&&!$('drawing-overlay'),'Removed controls stay removed');
   return{options,wallet:state.stats.balance,headerLeftOfSettings:true,cosmetics:cosmetics.length,persisted:'graphics'};
  },{seed,cosmetics,KEY});
  // addInitScript seeds on every navigation, so replace it with a new saved
  // seed to make reload verify the serialized preference without re-seeding.
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  const next=await open(browser,120,saved);
  try{
   const reloaded=await next.page.evaluate(()=>({mode:Pota.getState().stats.performancePreference,target:Pota.getState().targetFps,value:document.getElementById('performance-preference').value,balance:Pota.getState().stats.balance}));
   assert.deepEqual(reloaded,{mode:'graphics',target:60,value:'graphics',balance:seed.balance});assert.deepEqual(next.errors,[]);
   assert.deepEqual(errors,[]);return{...before,reload:reloaded};
  }finally{await next.context.close()}
 }finally{await context.close()}
}
async function fallback(browser){
 const {context,page,errors}=await open(browser,144,{...seed,showFPS:true,performancePreference:'balanced'},null,true);
 try{
  const result=await page.evaluate(()=>{
   const check=(v,m)=>{if(!v)throw Error(m)},$=id=>document.getElementById(id);let time=1000;__raf.run(time);
   const initial=Pota.getState();check(initial.graphics.pipeline==='canvas2d-compatibility','Actual fallback active');
   const cases=[];
   for(const mode of ['smooth','balanced','graphics'])for(const hz of [60,90,120,144]){
    const select=$('performance-preference');select.value=mode;select.dispatchEvent(new Event('change',{bubbles:true}));
    window.dispatchEvent(new CustomEvent('pota:display-change',{detail:{refreshRate:hz}}));
    const state=Pota.getState(),expected=mode==='graphics'?60:mode==='balanced'?(hz>=89?90:60):(hz>=119?120:60);
    check(state.targetFps===expected&&state.graphics.targetFps===expected,'Fallback target parity '+mode+'/'+hz);
    check(state.graphics.performancePreference===mode,'Fallback receives preference '+mode);check(__raf.count()===1,'Fallback keeps one RAF');
    __raf.run(time+=1000/hz);check(Pota.getState().net.every(n=>n.finite!==false),'Fallback physical net finite');
    cases.push({mode,hz,target:state.targetFps});
   }
   const canvas=$('court'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let lit=0;for(let i=0;i<pixels.length;i++)if(i%4<3&&pixels[i]>10)lit++;
   check(lit>1000,'Fallback rendered actual pixels');check(Pota.getState().stats.balance===5432,'Fallback wallet preserved');
   __qa.ready();time+=100;
   function event(type,x,y,t){__clock=t;const e=new PointerEvent(type,{pointerId:7,button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(e,'timeStamp',{value:t});canvas.dispatchEvent(e)}
   event('pointerdown',190,650,time);event('pointermove',194,450,time+280);event('pointerup',194,450,time+300);
   check(Pota.getState().state==='release','Fallback actual swipe launches shot');
   const wallet=Pota.getState().stats.balance;__qa.finish(true);__qa.finish(true);
   const after=Pota.getState();check(after.stats.balance-wallet===4,'Ordinary points and existing streak score once');
   check(Number($('current-points-value').textContent.replace(/\D/g,''))===after.stats.balance,'Header refreshes immediately after basket');
   check(after.stats.attempts===8&&after.stats.made===6,'Existing shooting statistics continue');
   return{cases,lit,pipeline:initial.graphics.pipeline,actualSwipe:true,basketAward:after.stats.balance-wallet,headerWallet:after.stats.balance,scoreOnce:true};
  });assert.deepEqual(errors,[]);return result;
 }finally{await context.close()}
}
async function main(){
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  const framePacing=[];for(const mode of MODES)for(const hz of [60,90,120,144])framePacing.push(await pacing(browser,mode,hz));
  const result={passed:true,implementation:'Actual game.js/UI/storage/physics with controlled RAF and scene/audio fixtures; actual Canvas2D fallback',framePacing,switching:await switching(browser),settings:await settings(browser),fallback:await fallback(browser)};
  fs.writeFileSync(path.join(__dirname,'mode-game-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close()}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={pacing,switching,settings,fallback};
