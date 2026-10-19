/* POTA: conservative, session-only repeated-input detection.
 * This observes shot gestures, never installed apps, scores or shooting accuracy.
 * A client-side heuristic cannot prove whether an OS-level macro is running.
 */
(function(global){
 'use strict';
 const TRACE_SIZE=17,MAX_INPUT_POINTS=2048,MAX_PAUSE=15000;
 const LIMITS=Object.freeze({pointer:Object.freeze({count:8,duration:3,cadence:5,position:.35}),key:Object.freeze({count:16,duration:2,cadence:3,position:.25})});
 // Android accessibility gestures can retain their generated coordinates while
 // WebView delivers their events a frame or two apart. This second track needs
 // independent positional, geometric and timing evidence; rhythm alone is never
 // sufficient. Sparse gestures need more repetitions than a detailed replay.
 const NATIVE=Object.freeze({duration:34,cadence:67,position:.5,straight:.5,shape:.5,count:8,sparseCount:12});
 const finite=value=>typeof value==='number'&&Number.isFinite(value);
 function createPotaFairPlay(){
  let candidate=null,nativeCandidate=null,status='clear',method=null,recordedShots=0,ignoredShots=0,warnings=0,blockedShots=0;
  function reset(){candidate=null;nativeCandidate=null;status='clear';method=null;}
  function leading(){
   if(method==='native'&&nativeCandidate)return nativeCandidate;
   if(method==='strict'&&candidate)return candidate;
   return !candidate?nativeCandidate:!nativeCandidate?candidate:candidate.count>=nativeCandidate.count?candidate:nativeCandidate;
  }
  function result(allowPoints=true,warning=false){
   const active=leading();
   return Object.freeze({allowPoints,warning,status,repeatCount:active?active.count:0,reason:status==='clear'?'':`repeated-${active.kind}-pattern`});
  }
  function normalize(raw){
   if(!raw||typeof raw!=='object'||(raw.kind!=='pointer'&&raw.kind!=='key'))return null;
   const {kind,startedAt,endedAt,startX,startY,width,height}=raw;
   if(![startedAt,endedAt,startX,startY,width,height].every(finite)||startedAt<0||endedAt>Number.MAX_SAFE_INTEGER||width<=0||height<=0||width>65536||height>65536||Math.abs(startX)>1e6||Math.abs(startY)>1e6)return null;
   const duration=endedAt-startedAt;
   // Very short taps and unusually long holds provide insufficient evidence.
   if(duration<60||duration>5000)return null;
   if(raw.context!==undefined&&typeof raw.context!=='string')return null;
   const context=raw.context||'';if(context.length>2048)return null;
   const item={kind,startedAt,endedAt,startX,startY,width,height,context,duration,trace:null,distinct:0,arc:null,nativeEligible:false,strictEligible:true};
   if(kind==='key')return item;
   const input=raw.samples;
   if(!Array.isArray(input)||input.length<3||input.length>MAX_INPUT_POINTS)return null;
   const points=[];
   for(const point of input){
    if(!point||![point.x,point.y,point.t].every(finite)||Math.abs(point.x)>1e6||Math.abs(point.y)>1e6||point.t<0||point.t>duration+2)return null;
    const previous=points[points.length-1];
    if(previous&&point.t<previous.t)return null;
    // Coalesced events can have a shared timestamp. Keep its final position.
    if(previous&&point.t===previous.t){previous.x=point.x;previous.y=point.y;continue;}
    points.push({x:point.x,y:point.y,t:Math.min(duration,point.t)});
   }
   if(points.length<3||points[0].t>3||duration-points[points.length-1].t>3)return null;
   let distinct=1,pathLength=0,lastDistinct=points[0];
   for(let i=1;i<points.length;i++){
    pathLength+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
    if(Math.hypot(points[i].x-lastDistinct.x,points[i].y-lastDistinct.y)>.5){distinct++;lastDistinct=points[i];}
   }
   if(distinct<3||pathLength<14)return null;
   item.distinct=distinct;item.strictEligible=distinct>=6;
   // Fixed temporal samples let identical paths survive harmless coalescing,
   // while preserving sub-pixel path and millisecond speed differences.
   const trace=[];let index=1;
   for(let i=0;i<TRACE_SIZE;i++){
    const t=duration*i/(TRACE_SIZE-1);
    while(index<points.length-1&&points[index].t<t)index++;
    const a=points[index-1],b=points[index],span=b.t-a.t;
    const fraction=span>0?Math.max(0,Math.min(1,(t-a.t)/span)):1;
    trace.push(a.x+(b.x-a.x)*fraction,a.y+(b.y-a.y)*fraction);
   }
   item.trace=trace;
   const first=points[0],last=points[points.length-1],dx=last.x-first.x,dy=last.y-first.y,chord=Math.hypot(dx,dy);
   // A native straight swipe is generated along one line; normal wrist drift,
   // hooks and backtracking invalidate this extra, delivery-jitter-tolerant
   // evidence. Curved gestures continue through the stricter timing track.
   let deviation=0;
   if(chord>=14)for(const point of points)deviation=Math.max(deviation,Math.abs((point.x-first.x)*dy-(point.y-first.y)*dx)/chord);
   item.nativeEligible=chord>=14&&deviation<=NATIVE.straight&&pathLength<=chord*1.005;
   if(item.nativeEligible){
    const arc=[];let pointIndex=1,travelled=0;
    for(let i=0;i<TRACE_SIZE;i++){
     const distance=pathLength*i/(TRACE_SIZE-1);
     let a=points[pointIndex-1],b=points[pointIndex],length=Math.hypot(b.x-a.x,b.y-a.y);
     while(pointIndex<points.length-1&&travelled+length<distance){travelled+=length;pointIndex++;a=points[pointIndex-1];b=points[pointIndex];length=Math.hypot(b.x-a.x,b.y-a.y);}
     const fraction=length>0?Math.max(0,Math.min(1,(distance-travelled)/length)):1;
     arc.push(a.x+(b.x-a.x)*fraction,a.y+(b.y-a.y)*fraction);
    }
    item.arc=arc;
   }
   return item;
  }
  function matches(a,b){
   const tolerance=LIMITS[a.kind].position;
   if(a.kind!==b.kind||a.context!==b.context||Math.abs(a.width-b.width)>.5||Math.abs(a.height-b.height)>.5||Math.abs(a.startX-b.startX)>tolerance||Math.abs(a.startY-b.startY)>tolerance)return false;
   if(a.kind==='pointer')for(let i=0;i<a.trace.length;i+=2)if(Math.hypot(a.trace[i]-b.trace[i],a.trace[i+1]-b.trace[i+1])>tolerance)return false;
   return true;
  }
  function begin(item){
   return {kind:item.kind,prototype:item,lastStart:item.startedAt,lastEnd:item.endedAt,count:1,minDistinct:item.distinct,minDuration:item.duration,maxDuration:item.duration,minCadence:null,maxCadence:null};
  }
  function nativeMatches(a,b){
   if(a.kind!==b.kind||a.context!==b.context||Math.abs(a.width-b.width)>.5||Math.abs(a.height-b.height)>.5||Math.hypot(a.startX-b.startX,a.startY-b.startY)>NATIVE.position)return false;
   for(let i=0;i<a.arc.length;i+=2)if(Math.hypot(a.arc[i]-b.arc[i],a.arc[i+1]-b.arc[i+1])>NATIVE.shape)return false;
   return true;
  }
  function advance(current,item,limits,match){
   if(!current)return begin(item);
   const cadence=item.startedAt-current.lastStart;
   const minDuration=Math.min(current.minDuration,item.duration),maxDuration=Math.max(current.maxDuration,item.duration);
   const minCadence=current.minCadence===null?cadence:Math.min(current.minCadence,cadence),maxCadence=current.maxCadence===null?cadence:Math.max(current.maxCadence,cadence);
   if(item.startedAt<current.lastEnd||cadence<100||cadence>MAX_PAUSE||!match(current.prototype,item)||maxDuration-minDuration>limits.duration||maxCadence-minCadence>limits.cadence)return begin(item);
   current.count=Math.min(Number.MAX_SAFE_INTEGER,current.count+1);
   current.lastStart=item.startedAt;current.lastEnd=item.endedAt;current.minDistinct=Math.min(current.minDistinct,item.distinct);
   current.minDuration=minDuration;current.maxDuration=maxDuration;current.minCadence=minCadence;current.maxCadence=maxCadence;
   return current;
  }
  function recordShot(raw){
   let item;
   try{item=normalize(raw);}catch(_){item=null;}
   if(!item){ignoredShots++;reset();return result();}
   recordedShots++;
   const previousStatus=status;
   candidate=item.strictEligible?advance(candidate,item,LIMITS[item.kind],matches):null;
   nativeCandidate=item.nativeEligible?advance(nativeCandidate,item,NATIVE,nativeMatches):null;
   const strictLimit=LIMITS[item.kind].count,nativeLimit=nativeCandidate&&nativeCandidate.warnedAt||(nativeCandidate&&nativeCandidate.minDistinct<6?NATIVE.sparseCount:NATIVE.count);
   const restrictedStrict=candidate&&candidate.count>strictLimit,restrictedNative=nativeCandidate&&nativeCandidate.count>nativeLimit;
   const warningStrict=candidate&&candidate.count===strictLimit,warningNative=nativeCandidate&&nativeCandidate.count===nativeLimit;
   method=restrictedStrict?'strict':restrictedNative?'native':warningStrict?'strict':warningNative?'native':null;
   if(restrictedStrict||restrictedNative){status='restricted';blockedShots++;return result(false,false);}
   if(warningStrict||warningNative){if(warningNative)nativeCandidate.warnedAt=nativeLimit;status='warning';const fresh=previousStatus!=='warning'&&previousStatus!=='restricted';if(fresh)warnings++;return result(true,fresh);}
   status='clear';
   return result();
  }
  function interrupt(){reset();return result();}
  function getDiagnostics(){const active=leading();return Object.freeze({status,repeatCount:active?active.count:0,kind:active?active.kind:null,method,minSampleCount:active?active.minDistinct:0,recordedShots,ignoredShots,warnings,blockedShots,sessionOnly:true});}
  // trusted/isTrusted deliberately does not participate in the policy: native
  // automation can be trusted, and accessibility input can be untrusted.
  return Object.freeze({recordShot,interrupt,getDiagnostics});
 }
 global.createPotaFairPlay=createPotaFairPlay;
})(typeof window!=='undefined'?window:globalThis);
