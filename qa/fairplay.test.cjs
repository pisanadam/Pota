'use strict';
const assert=require('node:assert/strict');
require('../src/fairplay.js');
const create=global.createPotaFairPlay;
function pointer(index,options={}){
 const duration=options.duration??320,start=options.start??index*4000,count=options.count??17;
 const x=options.x??180,y=options.y??610,bend=options.bend??0;
 return {kind:'pointer',startedAt:start,endedAt:start+duration,startX:x,startY:y,width:390,height:844,context:options.context??'shoot:normal:0:2:7',trusted:options.trusted??true,
  samples:Array.from({length:count},(_,i)=>{const p=i/(count-1);return{x:x+72*p+bend*Math.sin(Math.PI*p),y:y-185*p,t:duration*p};})};
}
function key(index,options={}){const startedAt=options.start??index*4000,duration=options.duration??420;return{kind:'key',startedAt,endedAt:startedAt+duration,startX:0,startY:0,width:1024,height:768,context:options.context??'key:0',trusted:options.trusted??true,samples:[]};}
let cases=0;
function test(name,run){run();cases++;console.log(`PASS: ${name}`);}
test('eight matching pointer shots warn once, ninth and following do not earn points',()=>{
 const guard=create();for(let i=0;i<7;i++)assert.deepEqual(guard.recordShot(pointer(i)),{allowPoints:true,warning:false,status:'clear',repeatCount:i+1,reason:''});
 assert.deepEqual(guard.recordShot(pointer(7)),{allowPoints:true,warning:true,status:'warning',repeatCount:8,reason:'repeated-pointer-pattern'});
 for(let i=8;i<14;i++){const result=guard.recordShot(pointer(i));assert.equal(result.allowPoints,false);assert.equal(result.warning,false);assert.equal(result.status,'restricted');}
 assert.equal(guard.getDiagnostics().warnings,1);assert.equal(guard.getDiagnostics().blockedShots,6);
});
test('an actually changed manual gesture immediately restores eligibility',()=>{
 const guard=create();for(let i=0;i<9;i++)guard.recordShot(pointer(i));
 assert.equal(guard.recordShot(pointer(9,{bend:2})).allowPoints,true);assert.equal(guard.getDiagnostics().status,'clear');
 assert.equal(guard.recordShot(pointer(10)).allowPoints,true);assert.equal(guard.getDiagnostics().repeatCount,1);
});
test('one thousand natural jittered gestures never warn, regardless of accuracy',()=>{
 const guard=create();let seed=7919,start=0;
 function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
 for(let i=0;i<1000;i++){
  start+=3800+random()*400;const sample=pointer(i,{start,duration:285+random()*120,x:178+random()*5,y:608+random()*6,bend:random()*7});
  for(let j=1;j<sample.samples.length-1;j++){sample.samples[j].x+=(random()-.5)*2;sample.samples[j].y+=(random()-.5)*2;}
  sample.made=true;sample.streak=1000;
  const result=guard.recordShot(sample);assert(result.allowPoints);assert(!result.warning);
 }
 assert.equal(guard.getDiagnostics().warnings,0);
});
test('the same curved aim with varied timing stays eligible',()=>{
 const guard=create();for(let i=0;i<100;i++){const result=guard.recordShot(pointer(i,{bend:2,duration:320+(i%3)*9}));assert(result.allowPoints);assert(!result.warning);}
});
test('internal gesture timing differences are preserved even with identical duration and cadence',()=>{
 const guard=create();for(let i=0;i<100;i++){
  const sample=pointer(i,{bend:2});if(i%2)for(let j=1;j<sample.samples.length-1;j++)sample.samples[j].t+=Math.sin(j/16*Math.PI)*8;
  const result=guard.recordShot(sample);assert(result.allowPoints);assert(!result.warning);
 }
});
test('small pointer cadence variation remains eligible with a repeated curved path',()=>{
 const guard=create();let start=0;for(let i=0;i<100;i++){start+=4000+(i%2)*9;const result=guard.recordShot(pointer(i,{start,bend:2}));assert(result.allowPoints);assert(!result.warning);}
});
test('same cadence with changing paths is never evidence by itself',()=>{
 const guard=create();for(let i=0;i<100;i++){const result=guard.recordShot(pointer(i,{bend:(i%4)*1.2}));assert(result.allowPoints);assert(!result.warning);}
});
test('regular trained rhythm and straight aiming with natural origin and hold variation is safe',()=>{
 const guard=create();for(let i=0;i<100;i++){const result=guard.recordShot(pointer(i,{x:180+(i%2)*1.25,duration:320+(i%2)*8}));assert(result.allowPoints);assert(!result.warning);}
});
test('untrusted input alone is never punished and trusted native macro behavior is detected',()=>{
 const guard=create();for(let i=0;i<40;i++){const result=guard.recordShot(pointer(i,{trusted:false,bend:i%2?2:0}));assert(result.allowPoints);assert(!result.warning);}
 guard.interrupt();for(let i=0;i<8;i++)guard.recordShot(pointer(i,{trusted:false}));assert.equal(guard.getDiagnostics().warnings,1);
 assert.equal(guard.recordShot(pointer(8,{trusted:false})).allowPoints,false);
});
test('too little movement or only two endpoints cannot trigger',()=>{
 const guard=create();for(let i=0;i<40;i++){const sample=pointer(i);sample.samples=sample.samples.map(p=>({...p,x:180,y:610}));assert(guard.recordShot(sample).allowPoints);}
 for(let i=40;i<80;i++)assert(!guard.recordShot(pointer(i,{count:2})).warning);
 assert.equal(guard.getDiagnostics().repeatCount,0);
});
test('keyboard evidence requires sixteen repeated holds and warns before restricting',()=>{
 const guard=create();for(let i=0;i<15;i++){const result=guard.recordShot(key(i));assert(result.allowPoints);assert(!result.warning);}
 const warning=guard.recordShot(key(15));assert(warning.allowPoints);assert(warning.warning);assert.equal(warning.repeatCount,16);
 assert.equal(guard.recordShot(key(16)).allowPoints,false);
 assert.equal(guard.recordShot(key(17,{context:'key:ArrowLeft'})).allowPoints,true);
});
test('natural keyboard hold or cadence variation avoids restriction',()=>{
 const guard=create();for(let i=0;i<100;i++){const result=guard.recordShot(key(i,{duration:420+(i%2)*5}));assert(result.allowPoints);assert(!result.warning);}
 guard.interrupt();let start=0;for(let i=0;i<100;i++){start+=4000+(i%2)*8;const result=guard.recordShot(key(i,{start}));assert(result.allowPoints);assert(!result.warning);}
});
test('pause, explicit interruption, cancelled input and non-monotonic starts clear evidence',()=>{
 const guard=create();for(let i=0;i<9;i++)guard.recordShot(pointer(i));
 assert.equal(guard.interrupt().status,'clear');assert.equal(guard.getDiagnostics().repeatCount,0);
 assert.equal(guard.recordShot(pointer(0)).repeatCount,1);
 for(let i=1;i<9;i++)guard.recordShot(pointer(i));
 assert.equal(guard.recordShot(pointer(30)).repeatCount,1);assert.equal(guard.getDiagnostics().status,'clear');
 assert.equal(guard.recordShot(pointer(1)).repeatCount,1);
});
test('context, viewport and input-type changes clear the current pattern immediately',()=>{
 for(const alter of [sample=>{sample.context='walk-back-shoot';},sample=>{sample.width=400;},sample=>{sample.startX+=1;}]){
  const guard=create();for(let i=0;i<9;i++)guard.recordShot(pointer(i));const sample=pointer(9);alter(sample);assert(guard.recordShot(sample).allowPoints);assert.equal(guard.getDiagnostics().repeatCount,1);
 }
 const guard=create();for(let i=0;i<9;i++)guard.recordShot(pointer(i));assert(guard.recordShot(key(9)).allowPoints);
});
test('harmless event coalescing retains an identical continuous path',()=>{
 const guard=create();for(let i=0;i<7;i++)assert(!guard.recordShot(pointer(i,{count:i%2?33:17})).warning);
 assert(guard.recordShot(pointer(7,{count:49})).warning);
 assert.equal(guard.recordShot(pointer(8,{count:9})).allowPoints,false);
});
test('duplicate sample times are safe, incomplete and malformed traces cannot punish',()=>{
 const bad=[null,undefined,{},[],{kind:'pointer'},pointer(0,{duration:20}),pointer(0,{duration:6000})];
 const sampleA=pointer(0);sampleA.samples[4].x=NaN;bad.push(sampleA);
 const sampleB=pointer(0);sampleB.samples[4].t=-1;bad.push(sampleB);
 const sampleC=pointer(0);sampleC.samples.reverse();bad.push(sampleC);
 const sampleD=pointer(0);sampleD.width=0;bad.push(sampleD);
 const sampleE=pointer(0);sampleE.context={self:null};sampleE.context.self=sampleE.context;bad.push(sampleE);
 const sampleF=pointer(0);sampleF.samples=sampleF.samples.slice(1);bad.push(sampleF);
 const sampleG=pointer(0);sampleG.startedAt=Infinity;bad.push(sampleG);
 const sampleH=pointer(0);sampleH.samples[4].x=Number.MAX_VALUE;bad.push(sampleH);
 const guard=create();for(let i=0;i<9;i++)guard.recordShot(pointer(i));
 for(const sample of bad){const result=guard.recordShot(sample);assert(result.allowPoints);assert(!result.warning);assert.equal(result.status,'clear');}
 for(let i=0;i<10;i++){const sample=pointer(i);sample.samples.splice(5,0,{...sample.samples[5]});assert.doesNotThrow(()=>guard.recordShot(sample));}
});
test('strict timing windows compare the entire curved pattern rather than permitting slow drift',()=>{
 const guard=create();for(let i=0;i<20;i++){const result=guard.recordShot(pointer(i,{bend:2,duration:320+i}));assert(!result.warning);assert(result.allowPoints);}
});
test('snapshots and API are immutable, state is bounded and no trace is exposed',()=>{
 const guard=create();assert(Object.isFrozen(guard));const first=guard.recordShot(pointer(0));assert(Object.isFrozen(first));assert.throws(()=>{first.allowPoints=false;},TypeError);
 for(let i=1;i<10000;i++)guard.recordShot(pointer(i));
 const diagnostic=guard.getDiagnostics();assert(Object.isFrozen(diagnostic));assert.equal(diagnostic.repeatCount,10000);assert.equal(diagnostic.warnings,1);assert.equal(diagnostic.blockedShots,9992);
 assert.equal(JSON.stringify(diagnostic).includes('samples'),false);assert.equal(JSON.stringify(diagnostic).includes('prototype'),false);assert(JSON.stringify(diagnostic).length<250);
 assert.throws(()=>{diagnostic.status='clear';},TypeError);assert.equal(guard.getDiagnostics().status,'restricted');
});
console.log(`PASS: ${cases} fair-play behavior cases; no network, app inspection, permanent ban or retroactive wallet mutation.`);
