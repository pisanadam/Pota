'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/rewarded.js'),'utf8');
const KEY='pota.rewarded-boost.v1',DURATION=300000;
function emitter(target={}){
 const events=new Map();
 target.addEventListener=(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);};
 target.removeEventListener=(name,fn)=>events.get(name)?.delete(fn);
 target.dispatch=(name,detail)=>{for(const fn of events.get(name)||[])fn({type:name,detail});};
 target.listenerCount=()=>Array.from(events.values()).reduce((sum,set)=>sum+set.size,0);
 return target;
}
function harness(options={}){
 let now=options.now??1800000000000,timerId=0;
 const timers=new Map(),store=options.store||new Map(),requests=[],updates=[];
 const native={configured:true,ready:true,online:true,busy:false,testMode:false,privacyRequired:false,...options.state};
 const document=emitter({visibilityState:'visible'});
 const context=emitter({document,navigator:{onLine:true},crypto:webcrypto,console,
  setInterval(fn){const id=++timerId;timers.set(id,fn);return id;},clearInterval(id){timers.delete(id);},
  localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)}});
 context.window=context;
 const host={
  getAdsState:()=>JSON.stringify(native),
  requestRewarded(multiplier,requestId){requests.push({multiplier,requestId});return options.accepted!==false;}
 };
 if(options.bridge!==false)context.PotaNative=host;
 vm.runInNewContext(source,context);
 const controller=context.createPotaRewardedAds({now:()=>now,onState:state=>updates.push(state)});
 function result(overrides={},receipt=true){
  const request=requests.at(-1);
  assert(request,'a native request must exist');
  const value={...request,requiredAds:request.multiplier===3?2:1,completedAds:request.multiplier===3?2:1,earned:true,token:'native-reward-receipt-0001',...overrides};
  if(receipt)native.lastReward={...value};
  context.dispatch('pota:ad-result',value);
  return value;
 }
 return{controller,context,document,native,host,store,timers,requests,updates,result,
  advance(ms){now+=ms;},tick(){for(const fn of [...timers.values()])fn();},now:()=>now};
}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS:',name);}
test('web and unconfigured SDKs never expose an ad or grant a reward',()=>{
 for(const options of [{bridge:false},{state:{configured:false}},{state:{ready:false}}]){
  const h=harness(options);assert.equal(h.controller.getState().ready,false);assert.equal(h.controller.requestBoost(),false);assert.equal(h.controller.getMultiplier(),1);assert.equal(h.requests.length,0);assert.equal(h.timers.size,0);
 }
});
test('required privacy options remain accessible without blocking already-consented ads',()=>{
 const h=harness({state:{privacyRequired:true,canRequestAds:true}});assert.equal(h.controller.getState().privacyRequired,true);assert.equal(h.controller.getState().ready,true);
 const blocked=harness({state:{ready:false,canRequestAds:false}});assert.equal(blocked.controller.getState().ready,false);
});
test('privacy options forward safely to native, refresh state, and never grant a boost',()=>{
 const h=harness({state:{privacyRequired:true}});let opens=0;
 h.host.showPrivacyOptions=()=>{opens++;h.native.privacyRequired=false;return true;};
 assert.equal(h.controller.showPrivacyOptions(),true);assert.equal(opens,1);assert.equal(h.controller.getState().privacyRequired,false);assert.equal(h.controller.getMultiplier(),1);
 h.host.showPrivacyOptions=()=>false;assert.equal(h.controller.showPrivacyOptions(),false);
 h.host.showPrivacyOptions=()=>{throw new Error('privacy unavailable');};assert.equal(h.controller.showPrivacyOptions(),false);
 delete h.host.showPrivacyOptions;assert.equal(h.controller.showPrivacyOptions(),false);
 h.controller.dispose();h.host.showPrivacyOptions=()=>{opens++;return true;};assert.equal(h.controller.showPrivacyOptions(),false);assert.equal(opens,1);
 assert.equal(harness({bridge:false}).controller.showPrivacyOptions(),false);
});
test('native validated internet and browser internet are both required',()=>{
 const h=harness({state:{online:false}});assert.equal(h.controller.getState().ready,false);
 h.native.online=true;h.context.navigator.onLine=false;h.controller.refresh();assert.equal(h.controller.getState().ready,false);
 h.context.navigator.onLine=true;h.controller.refresh();assert.equal(h.controller.getState().ready,true);
 h.context.dispatch('pota:ad-state',{configured:true,ready:true,online:true});
 h.native.online=false;h.context.dispatch('pota:ad-state',{configured:true,ready:true,online:true});assert.equal(h.controller.getState().online,false);
});
test('request, elapsed ad time, and native ready events never grant points',()=>{
 const h=harness();assert(h.controller.requestBoost());assert.equal(h.requests.length,1);assert.equal(h.controller.getState().busy,true);
 assert.equal(h.controller.requestBoost(),false);h.advance(600000);h.context.dispatch('pota:ad-state',{});assert.equal(h.controller.getMultiplier(),1);assert.equal(h.timers.size,0);
});
test('one completed SDK ad grants exactly five real-time minutes and blocks duration stacking',()=>{
 const h=harness();h.controller.requestBoost();h.result();
 assert.equal(h.controller.getMultiplier(),2);assert.equal(h.controller.getState().remainingSeconds,300);assert.equal(h.timers.size,1);
 const expiry=h.controller.getState().expiresAt;assert.equal(h.controller.requestBoost(),false);
 h.result();assert.equal(h.controller.getState().expiresAt,expiry);
 h.advance(299001);h.tick();assert.equal(h.controller.getState().remainingSeconds,1);assert.equal(h.controller.getMultiplier(),2);
 h.advance(999);assert.equal(h.controller.getMultiplier(),1);assert.equal(h.timers.size,0);assert.equal(h.controller.getState().status,'expired');
});
test('synthetic or replayed result events without a matching native receipt cannot grant',()=>{
 for(const change of [()=>{},h=>{h.native.lastReward={requestId:'wrong',earned:true,token:'native-reward-receipt-0001'};},h=>{h.native.lastReward={...h.requests[0],earned:true,completedAds:1,token:'different-receipt-token'};}]){
  const h=harness();h.controller.requestBoost();change(h);h.result({},false);assert.equal(h.controller.getMultiplier(),1);
 }
 const h=harness();h.controller.requestBoost();const old=h.result({earned:false,reason:'closed'});
 h.controller.requestBoost();h.native.lastReward={...old,earned:true};h.context.dispatch('pota:ad-result',{...old,earned:true});assert.equal(h.controller.getMultiplier(),1);assert.equal(h.controller.getState().busy,true);
});
test('wrong multiplier, short tokens, wrong nonce, failed and incomplete rewards do not award',()=>{
 for(const override of [{multiplier:3},{token:'short'},{requestId:'other'},{earned:false,reason:'closed'},{completedAds:0},{requiredAds:2}]){
  const h=harness();h.controller.requestBoost();h.result(override);assert.equal(h.controller.getMultiplier(),1);assert.equal(h.timers.size,0);
 }
});
test('every fourth earned offer requires two fully rewarded ads for a 3x boost',()=>{
 const store=new Map([[KEY,JSON.stringify({version:1,active:null,completedOffers:3})]]);
 const h=harness({store});assert.equal(h.controller.getState().offerMultiplier,3);assert.equal(h.controller.getState().requiredAds,2);
 assert(h.controller.requestBoost());assert.equal(h.requests[0].multiplier,3);
 h.result({completedAds:1});assert.equal(h.controller.getMultiplier(),1);
 assert(h.controller.requestBoost());h.result();assert.equal(h.controller.getMultiplier(),3);assert.equal(h.controller.getState().remainingSeconds,300);
 h.advance(DURATION);h.tick();assert.equal(h.controller.getState().offerMultiplier,2);
});
test('normal offers remain 2x between the occasional 3x offers',()=>{
 for(let completedOffers=0;completedOffers<12;completedOffers++){
  const store=new Map([[KEY,JSON.stringify({version:1,active:null,completedOffers})]]);
  const h=harness({store});assert.equal(h.controller.getState().offerMultiplier,(completedOffers+1)%4===0?3:2);
 }
});
test('a connection drop cancels the complete flow even if a late rewarded callback arrives',()=>{
 const h=harness();h.controller.requestBoost();h.context.navigator.onLine=false;h.context.dispatch('offline');
 assert.equal(h.controller.getState().busy,false);assert.equal(h.controller.getState().ready,false);assert.equal(h.controller.getState().reason,'offline');
 h.context.navigator.onLine=true;h.context.dispatch('online');h.result();assert.equal(h.controller.getMultiplier(),1);
 const other=harness();other.controller.requestBoost();other.native.online=false;other.result();assert.equal(other.controller.getMultiplier(),1);
});
test('earned boosts persist without extending their expiration and continue while offline',()=>{
 const h=harness();h.controller.requestBoost();h.result();h.advance(4000);h.context.navigator.onLine=false;h.context.dispatch('offline');
 assert.equal(h.controller.getMultiplier(),2);assert.equal(h.controller.getState().remainingSeconds,296);
 const reloaded=harness({store:h.store,state:{online:false},now:h.now()});reloaded.advance(110000);assert.equal(reloaded.controller.getMultiplier(),2);assert.equal(reloaded.controller.getState().remainingSeconds,186);
 reloaded.advance(186000);assert.equal(reloaded.controller.getMultiplier(),1);
});
test('invalid, expired, future-dated and overlong stored rewards are rejected',()=>{
 const now=1800000000000;
 for(const active of [
  {multiplier:2,awardedAt:now,expiresAt:now+DURATION+1},
  {multiplier:2,awardedAt:now+1,expiresAt:now+1+DURATION},
  {multiplier:2,awardedAt:now-DURATION,expiresAt:now},
  {multiplier:4,awardedAt:now,expiresAt:now+DURATION},
  {multiplier:2,awardedAt:'not-a-number',expiresAt:now+DURATION}
 ]){
  const h=harness({store:new Map([[KEY,JSON.stringify({version:1,active,completedOffers:1})]])});assert.equal(h.controller.getMultiplier(),1);assert.equal(h.timers.size,0);
 }
});
test('countdown has one timer, pauses in hidden documents, and catches up on resume',()=>{
 const h=harness();h.controller.requestBoost();h.result();for(let i=0;i<10;i++)h.controller.refresh();assert.equal(h.timers.size,1);
 h.document.visibilityState='hidden';h.document.dispatch('visibilitychange');assert.equal(h.timers.size,0);
 h.advance(DURATION+1000);h.document.visibilityState='visible';h.document.dispatch('visibilitychange');assert.equal(h.controller.getMultiplier(),1);assert.equal(h.timers.size,0);
});
test('unavailable native calls and refused ad requests fail without a grant',()=>{
 const h=harness({accepted:false});assert.equal(h.controller.requestBoost(),false);assert.equal(h.controller.getMultiplier(),1);assert.equal(h.controller.getState().busy,false);
 const other=harness();other.host.requestRewarded=()=>{throw new Error('gone');};assert.equal(other.controller.requestBoost(),false);assert.equal(other.controller.getMultiplier(),1);
});
test('native ad callbacks can be delayed by hiding the document and still award on verified completion',()=>{
 const h=harness();h.controller.requestBoost();h.document.visibilityState='hidden';h.document.dispatch('visibilitychange');h.result();assert.equal(h.controller.getMultiplier(),2);assert.equal(h.timers.size,0);
 h.advance(16000);h.document.visibilityState='visible';h.document.dispatch('visibilitychange');assert.equal(h.controller.getState().remainingSeconds,284);assert.equal(h.timers.size,1);
});
test('subscription cleanup and disposal remove listeners, timers, and further requests',()=>{
 const h=harness();let count=0;const unsubscribe=h.controller.subscribe(()=>count++);assert.equal(count,1);
 unsubscribe();h.controller.requestBoost();h.result();assert.equal(count,1);assert.equal(h.timers.size,1);
 h.controller.dispose();h.controller.dispose();assert.equal(h.timers.size,0);assert.equal(h.context.listenerCount(),0);assert.equal(h.document.listenerCount(),0);assert.equal(h.controller.requestBoost(),false);assert.equal(h.controller.getMultiplier(),1);
});
console.log(`${passed} rewarded-ad controller cases passed.`);
