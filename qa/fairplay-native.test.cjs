'use strict';
// These are synthetic Android-style event deliveries, not extracted device
// traces. They reproduce sparse/coalesced input and frame-sized timing jitter
// while preserving the fixed generated swipe shown in the supplied recording.
const assert=require('node:assert/strict');
require('../src/fairplay.js');
const create=global.createPotaFairPlay;
let cases=0;
function test(name,run){run();cases++;console.log(`PASS: ${name}`);}
function swipe(index,options={}){
 const n=options.n??12,duration=options.duration??600+(index%3)*8.5,start=options.start??index*5200+(index%2)*13;
 const x=options.x??162,y=options.y??575,bend=options.bend??0;
 return {kind:'pointer',startedAt:start,endedAt:start+duration,startX:x,startY:y,width:324,height:702,context:options.context??'shoot:swipe:fixed',trusted:options.trusted??true,
  samples:Array.from({length:n},(_,i)=>{const p=i/(n-1);return{x:bend*Math.sin(Math.PI*p),y:166*p,t:duration*p};})};
}
function finishSeries(guard,shots,warningAt){
 const decisions=shots.map(s=>guard.recordShot(s));
 for(let i=0;i<warningAt-1;i++){assert.equal(decisions[i].allowPoints,true);assert.equal(decisions[i].warning,false);}
 assert.equal(decisions[warningAt-1].allowPoints,true);assert.equal(decisions[warningAt-1].warning,true);
 for(let i=warningAt;i<decisions.length;i++){assert.equal(decisions[i].allowPoints,false);assert.equal(decisions[i].status,'restricted');}
 return decisions;
}
test('fixed dense native swipe survives 17 ms duration and 26 ms cadence ranges',()=>{
 const g=create();finishSeries(g,Array.from({length:15},(_,i)=>swipe(i)),8);
 assert.equal(g.getDiagnostics().method,'native');assert.equal(g.getDiagnostics().warnings,1);assert.equal(g.getDiagnostics().blockedShots,7);
});
test('three to five distinct samples require twelve repeats and warn before blocking',()=>{
 for(const n of [3,4,5]){const g=create();finishSeries(g,Array.from({length:17},(_,i)=>swipe(i,{n})),12);assert.equal(g.getDiagnostics().minSampleCount,n);assert.equal(g.getDiagnostics().method,'native');}
});
test('coalesced density changes retain geometric evidence without making it stronger',()=>{
 const g=create();finishSeries(g,Array.from({length:15},(_,i)=>swipe(i,{n:[17,3,7,5,33][i%5]})),12);
 assert.equal(g.getDiagnostics().minSampleCount,3);
});
test('after dense warning, sparse delivery does not restore rewards',()=>{
 const g=create();for(let i=0;i<8;i++)g.recordShot(swipe(i));
 assert.equal(g.getDiagnostics().status,'warning');
 assert.equal(g.recordShot(swipe(8,{n:3})).allowPoints,false);
 assert.equal(g.recordShot(swipe(9,{n:5})).allowPoints,false);
 assert.equal(g.getDiagnostics().warnings,1);
});
test('after sparse warning, denser delivery cannot restart the evidence window',()=>{
 const g=create();for(let i=0;i<12;i++)g.recordShot(swipe(i,{n:3}));
 assert.equal(g.getDiagnostics().status,'warning');
 assert.equal(g.recordShot(swipe(12,{n:10})).allowPoints,false);
 assert.equal(g.getDiagnostics().warnings,1);
});
test('exact generated line with eight or nine millisecond delivery jitter is not a human exemption',()=>{
 for(const jitter of [8,9]){
  const g=create();finishSeries(g,Array.from({length:12},(_,i)=>swipe(i,{duration:600+(i%2)*jitter,start:i*5200+(i%2)*jitter})),8);
 }
});
test('keyboard thresholds and the strict replay of curved paths remain independent',()=>{
 const g=create();for(let i=0;i<7;i++)assert.equal(g.recordShot(swipe(i,{duration:600,start:i*5200,bend:4})).warning,false);
 assert.equal(g.recordShot(swipe(7,{duration:600,start:7*5200,bend:4})).warning,true);
 assert.equal(g.getDiagnostics().method,'strict');assert.equal(g.recordShot(swipe(8,{duration:600,start:8*5200,bend:4})).allowPoints,false);
});
test('a manually changed path or origin immediately restores eligibility',()=>{
 for(const changed of [{bend:2},{x:163},{y:576}]){
  const g=create();for(let i=0;i<10;i++)g.recordShot(swipe(i));
  const decision=g.recordShot(swipe(10,changed));assert.equal(decision.allowPoints,true);assert.equal(decision.status,'clear');
 }
});
test('straight aiming and a trained rhythm do not qualify with natural endpoint variation',()=>{
 const g=create();for(let i=0;i<1000;i++){
  const shot=swipe(i,{duration:600+(i%2)*8});
  for(const point of shot.samples)point.y*=1+(i%3)*.008;
  const r=g.recordShot(shot);assert.equal(r.allowPoints,true);assert.equal(r.warning,false);
 }
 assert.equal(g.getDiagnostics().warnings,0);
});
test('same endpoints and rhythm do not qualify when the motion contains wrist drift',()=>{
 const g=create();for(let i=0;i<1000;i++){
  const shot=swipe(i,{bend:(i%4)*.85,duration:600+(i%2)*8});
  const r=g.recordShot(shot);assert.equal(r.allowPoints,true);assert.equal(r.warning,false);
 }
});
test('native duration and cadence windows cover the whole pattern, without slow tolerance drift',()=>{
 for(const kind of ['duration','cadence']){
  const g=create();let start=0;
  for(let i=0;i<100;i++){
   start+=5200+(kind==='cadence'?i*14:0);
   const r=g.recordShot(swipe(i,{start,duration:kind==='duration'?600+i*7:600}));
   assert.equal(r.allowPoints,true);assert.equal(r.warning,false);
  }
 }
});
test('malformed, incomplete and two-endpoint input fails open and clears restriction',()=>{
 const bad=[swipe(12,{n:2}),swipe(12,{n:1}),swipe(12)];bad[2].samples[1].t=-1;
 for(const item of bad){const g=create();for(let i=0;i<10;i++)g.recordShot(swipe(i));assert.equal(g.getDiagnostics().status,'restricted');const r=g.recordShot(item);assert.equal(r.allowPoints,true);assert.equal(r.status,'clear');assert.equal(g.getDiagnostics().repeatCount,0);}
});
test('pause, long gap and context changes clear native evidence and keep snapshots immutable',()=>{
 for(const change of ['interrupt','gap','context']){
  const g=create();for(let i=0;i<10;i++)g.recordShot(swipe(i));
  if(change==='interrupt')g.interrupt();
  const r=g.recordShot(swipe(10,change==='gap'?{start:100000}:change==='context'?{context:'new-camera'}:{}));
  assert.equal(r.allowPoints,true);assert.equal(r.status,'clear');assert.equal(r.repeatCount,1);assert(Object.isFrozen(r));assert(Object.isFrozen(g.getDiagnostics()));
 }
});
test('bounded diagnostics expose the evidence type and count, not traces or persistent restrictions',()=>{
 const g=create();for(let i=0;i<10000;i++)g.recordShot(swipe(i));
 const d=g.getDiagnostics();assert.equal(d.method,'native');assert.equal(d.repeatCount,10000);assert.equal(d.minSampleCount,12);assert.equal(d.warnings,1);assert.equal(d.blockedShots,9992);assert.equal(d.sessionOnly,true);
 assert(!JSON.stringify(d).includes('prototype'));assert(!JSON.stringify(d).includes('samples'));assert(JSON.stringify(d).length<300);
});
console.log(`PASS: ${cases} synthetic native delivery cases; recording supplies geometry/cadence context only, not a raw event trace.`);
