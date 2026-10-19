'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/audio.js'),'utf8');

function harness(legacy=false){
 const writes=[],contexts=[];
 function param(name){return {value:0,setValueAtTime(value,time){writes.push({name,value,time});this.value=value;},cancelScheduledValues(){},setTargetAtTime(){}};}
 function node(){return {gain:param('gain'),connect(){},disconnect(){}};}
 class Context {
  constructor(){
   contexts.push(this);this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination=node();this.failNext=false;
   this.listener=legacy?{setPosition:(...values)=>writes.push({name:'position',values}),setOrientation:(...values)=>writes.push({name:'orientation',values})}:{};
   if(!legacy)for(const key of ['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ']){
    const p=param(key),set=p.setValueAtTime;
    p.setValueAtTime=(value,time)=>{if(this.failNext){this.failNext=false;throw Error('temporary listener failure');}set.call(p,value,time);};this.listener[key]=p;
   }
  }
  createGain(){return node();}
  createDynamicsCompressor(){const n=node();for(const key of ['threshold','knee','ratio','attack','release'])n[key]=param(key);return n;}
  createConvolver(){return node();}
  createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {getChannelData:i=>data[i],sampleRate,length};}
  resume(){this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
 }
 const window={AudioContext:Context,setTimeout,clearTimeout};vm.runInNewContext(source,{window,Math,Number,Map,Set,Array,Object,Float32Array,Float64Array,Uint8Array,DataView,Promise});
 return {audio:window.createCourtAudio(),writes,contexts};
}
function close(actual,expected){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<1e-14,`${actual[i]} != ${expected[i]}`);}

(async()=>{
 const {audio,writes,contexts}=harness();
 // Updates before the first gesture must survive initialization.
 audio.updateListener([2,1.8,-4],[3,0,-4],[0,2,0]);assert.equal(writes.length,0);
 await audio.unlock();assert.equal(writes.length,9);const listener=contexts[0].listener;
 close([listener.positionX.value,listener.positionY.value,listener.positionZ.value],[2,1.8,-4]);
 close([listener.forwardX.value,listener.forwardY.value,listener.forwardZ.value],[.6,0,-.8]);
 close([listener.upX.value,listener.upY.value,listener.upZ.value],[0,1,0]);
 const firstWrites=writes.length;
 for(let i=0;i<3600;i++){contexts[0].currentTime=i/60;audio.updateListener({x:2,y:1.8,z:-4},{x:3,y:0,z:-4},{x:0,y:2,z:0});}
 assert.equal(writes.length,firstWrites,'one stationary minute must enqueue no duplicate listener events');
 audio.updateListener([3,1.8,-4],[3,0,-4],[0,2,0]);assert.equal(writes.length,firstWrites+3);
 assert(writes.slice(-3).every(w=>w.name.startsWith('position')),'translation updates position only');
 audio.updateListener([3,1.8,-4],[0,0,-9],[0,2,0]);assert.equal(writes.length,firstWrites+6);
 assert(writes.slice(-3).every(w=>w.name.startsWith('forward')),'aim changes update forward only');
 audio.updateListener([3,1.8,-4],[0,0,-9],[1,1,0]);assert.equal(writes.length,firstWrites+9);
 assert(writes.slice(-3).every(w=>w.name.startsWith('up')),'camera roll updates up only');
 close([listener.upX.value,listener.upY.value,listener.upZ.value],[Math.SQRT1_2,Math.SQRT1_2,0]);
 audio.updateListener([NaN,Infinity,-5],[0,0,0],[0,0,0]);
 close([listener.positionX.value,listener.positionY.value,listener.positionZ.value],[3,1.8,-5]);
 close([listener.forwardX.value,listener.forwardY.value,listener.forwardZ.value],[0,0,-1]);
 close([listener.upX.value,listener.upY.value,listener.upZ.value],[Math.SQRT1_2,Math.SQRT1_2,0]);
 const beforeRetry=writes.length;contexts[0].failNext=true;
 audio.updateListener([4,1.8,-5],[0,0,0],[0,0,0]);assert.equal(writes.length,beforeRetry);
 audio.updateListener([4,1.8,-5],[0,0,0],[0,0,0]);assert.equal(writes.length,beforeRetry+3,'failed apply must retry even if the next camera input is unchanged');
 const beforeMove=writes.length;
 for(let i=0;i<120;i++)audio.updateListener([4+i*.001,1.8,-5],[0,0,-1],[0,1,0]);
 assert.equal(writes.filter((w,i)=>i>=beforeMove&&w.name.startsWith('position')).length,119*3,'small continuous movement is never quantized or throttled');
 audio.dispose();

 const old=harness(true);old.audio.updateListener([0,2,0],[0,0,-1],[0,1,0]);await old.audio.unlock();
 assert.equal(old.writes.length,2);for(let i=0;i<3600;i++)old.audio.updateListener([0,2,0],[0,0,-1],[0,1,0]);
 assert.equal(old.writes.length,2,'legacy stationary listener must not repeat native calls');
 old.audio.updateListener([.1,2,0],[0,0,-1],[0,1,0]);assert.equal(old.writes.at(-1).name,'position');
 old.audio.updateListener([.1,2,0],[1,0,-1],[0,1,0]);assert.equal(old.writes.at(-1).name,'orientation');
 close(old.writes.at(-1).values,[Math.SQRT1_2,0,-Math.SQRT1_2,0,1,0]);old.audio.dispose();
 console.log('PASS: listener initialization, stationary caching, independent position/forward/up updates, array/object inputs, finite fallback, zero-vector fallback, failed-apply retry, unthrottled sub-centimeter movement, and legacy listener support.');
 console.log(JSON.stringify({stationarySeconds:60,frames:3600,previousParameterWrites:3600*9,currentParameterWrites:0,avoidedParameterWrites:32400,movingPositionWritesPerFrame:3,previousMovingWritesPerFrame:9}));
})().catch(error=>{console.error(error);process.exitCode=1;});
