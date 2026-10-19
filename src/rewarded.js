/* POTA: native rewarded-ad boosts. An SDK reward receipt is required; web clicks never grant points. */
(function(global){
 'use strict';
 const DURATION=5*60*1000,STORAGE_KEY='pota.rewarded-boost.v1';
 function createPotaRewardedAds(options){
  options=options||{};
  const clock=typeof options.now==='function'?options.now:Date.now;
  const doc=options.document||global.document;
  let storage=options.storage;
  if(storage===undefined)try{storage=global.localStorage;}catch(_){storage=null;}
  let active=null,completedOffers=0,pending=null,nativeState={},timer=0,disposed=false;
  let status='idle',reason='',sequence=0,lastSnapshot='';
  const listeners=new Set();
  if(typeof options.onState==='function')listeners.add(options.onState);
  const removers=[];

  function time(){const value=Number(clock());return Number.isFinite(value)?value:Date.now();}
  function bridge(){return options.nativeBridge===undefined?global.PotaNative:options.nativeBridge;}
  function parse(value){
   if(typeof value==='string')try{value=JSON.parse(value);}catch(_){return null;}
   return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
  }
  function readNative(){
   try{const host=bridge();return host&&typeof host.getAdsState==='function'?parse(host.getAdsState())||{}:{};}catch(_){return {};}
  }
  function save(){
   try{if(storage)storage.setItem(STORAGE_KEY,JSON.stringify({version:1,active,completedOffers}));}catch(_){}
  }
  function validActive(value,at){
   return value&&(value.multiplier===2||value.multiplier===3)&&Number.isSafeInteger(value.awardedAt)&&Number.isSafeInteger(value.expiresAt)&&
    value.expiresAt-value.awardedAt===DURATION&&value.awardedAt<=at&&value.expiresAt>at&&value.expiresAt-at<=DURATION;
  }
  try{
   const stored=storage&&parse(storage.getItem(STORAGE_KEY));
   if(stored&&stored.version===1){
    if(Number.isSafeInteger(stored.completedOffers)&&stored.completedOffers>=0)completedOffers=Math.min(stored.completedOffers,1000000);
    if(validActive(stored.active,time()))active={multiplier:stored.active.multiplier,awardedAt:stored.active.awardedAt,expiresAt:stored.active.expiresAt};
    else if(stored.active)save();
   }
  }catch(_){}
  function expire(at){
   if(active&&!validActive(active,at)){active=null;status='expired';reason='';save();return true;}
   return false;
  }
  function isOnline(){return !(global.navigator&&global.navigator.onLine===false)&&nativeState.online===true;}
  function snapshot(){
   const at=time();expire(at);
   const host=bridge(),online=isOnline(),configured=nativeState.configured===true;
   const available=!!(host&&typeof host.requestRewarded==='function'&&configured&&online);
   const busy=!!pending||nativeState.busy===true;
   const privacyRequired=nativeState.privacyRequired===true;
   const offerMultiplier=(completedOffers+1)%4===0?3:2;
   return Object.freeze({
    offerMultiplier,requiredAds:offerMultiplier===3?2:1,
    activeMultiplier:active?active.multiplier:1,
    remainingSeconds:active?Math.max(0,Math.ceil((active.expiresAt-at)/1000)):0,
    expiresAt:active?active.expiresAt:0,
    online,available,ready:!disposed&&available&&nativeState.ready===true&&!busy&&!active,
    busy:!disposed&&busy,testMode:nativeState.testMode===true,privacyRequired,privacyPolicyAvailable:nativeState.privacyPolicyAvailable===true,
    status:disposed?'disposed':status,reason,pendingRequestId:pending?pending.requestId:null
   });
  }
  function updateTimer(){
   const visible=!doc||doc.visibilityState!=='hidden';
   if(!disposed&&active&&visible){
    if(!timer)timer=global.setInterval(()=>emit(),1000);
   }else if(timer){global.clearInterval(timer);timer=0;}
  }
  function emit(force){
   const state=snapshot();updateTimer();
   const signature=JSON.stringify(state);
   if(!force&&signature===lastSnapshot)return state;
   lastSnapshot=signature;
   for(const listener of listeners)try{listener(state);}catch(_){}
   return state;
  }
  function cancelPending(why){
   if(!pending)return;
   pending=null;status='cancelled';reason=why;
  }
  function refresh(){
   if(disposed)return snapshot();
   nativeState=readNative();
   if(!isOnline())cancelPending('offline');
   return emit();
  }
  function nonce(){
   const bytes=new Uint32Array(3);
   try{global.crypto.getRandomValues(bytes);}catch(_){for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*0x100000000);}
   return 'pota-'+time().toString(36)+'-'+(++sequence).toString(36)+'-'+Array.from(bytes,value=>value.toString(36)).join('-');
  }
  function requestBoost(){
   if(disposed||!refresh().ready)return false;
   const multiplier=(completedOffers+1)%4===0?3:2;
   const request={requestId:nonce(),multiplier,requiredAds:multiplier===3?2:1};
   pending=request;status='watching';reason='';emit();
   try{
    const answer=bridge().requestRewarded(request.multiplier,request.requestId);
    const parsed=parse(answer);
    if(answer===false||(parsed&&parsed.accepted===false)){
     if(pending===request){pending=null;status='failed';reason='not-ready';refresh();}
     return false;
    }
   }catch(_){
    if(pending===request){pending=null;status='failed';reason='native-error';refresh();}
    return false;
   }
   return true;
  }
  function showPrivacyOptions(){
   if(disposed)return false;
   try{
    const host=bridge();
    if(!host||typeof host.showPrivacyOptions!=='function')return false;
    const answer=host.showPrivacyOptions(),parsed=parse(answer);
    refresh();
    return answer!==false&&!(parsed&&parsed.accepted===false);
   }catch(_){refresh();return false;}
  }
  function onResult(event){
   if(disposed||!pending)return;
   const result=parse(event&&event.detail),request=pending;
   if(!result||result.requestId!==request.requestId)return;
   nativeState=readNative();
   if(!isOnline()){cancelPending('offline');emit();return;}
   /* Read the native receipt independently. A synthetic DOM event or partial two-ad flow cannot award a boost. */
   const receipt=parse(nativeState.lastReward);
   const earned=result.earned===true&&result.multiplier===request.multiplier&&result.requiredAds===request.requiredAds&&result.completedAds===request.requiredAds&&
    typeof result.token==='string'&&result.token.length>=16&&receipt&&receipt.earned===true&&receipt.requestId===request.requestId&&
    receipt.multiplier===request.multiplier&&receipt.completedAds===request.requiredAds&&receipt.token===result.token;
   pending=null;
   if(earned){
    const awardedAt=Math.trunc(time());
    active={multiplier:request.multiplier,awardedAt,expiresAt:awardedAt+DURATION};
    completedOffers=Math.min(1000000,completedOffers+1);status='complete';reason='';save();
   }else{status='failed';reason=typeof result.reason==='string'?result.reason.slice(0,80):'reward-not-completed';}
   emit();
  }
  function listen(target,name,listener){
   if(!target||typeof target.addEventListener!=='function')return;
   target.addEventListener(name,listener);removers.push(()=>target.removeEventListener(name,listener));
  }
  listen(global,'pota:ad-state',refresh);
  listen(global,'pota:ad-result',onResult);
  listen(global,'online',refresh);
  listen(global,'offline',refresh);
  listen(doc,'visibilitychange',refresh);
  refresh();
  return Object.freeze({
   getState(){return emit();},
   subscribe(listener){
    if(typeof listener!=='function'||disposed)return()=>{};
    listeners.add(listener);try{listener(snapshot());}catch(_){}
    return()=>listeners.delete(listener);
   },
   requestBoost,showPrivacyOptions,refresh,
   getMultiplier(at){
    if(disposed)return 1;
    if(expire(at===undefined?time():Number(at)))emit();
    return active?active.multiplier:1;
   },
   dispose(){
    if(disposed)return;
    disposed=true;pending=null;
    for(const remove of removers)remove();
    if(timer){global.clearInterval(timer);timer=0;}
    listeners.clear();
   }
  });
 }
 global.createPotaRewardedAds=createPotaRewardedAds;
})(typeof window!=='undefined'?window:globalThis);
