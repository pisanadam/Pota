/* Deterministic attachment budgets and adaptive auto-profile behavior. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const THREE = require('../vendor/three.min.js');
const source = fs.readFileSync(path.join(__dirname, '../src/graphics.js'), 'utf8');
function fixture({desktop = true, hdr = true, memory = 8, nativeDevice = {}, texture = 8192, renderbuffer = 8192, framebuffer = true, color = [4,2], depth = [4,2]} = {}) {
  const targets = [], profiles = [], draws = [];
  class Target extends THREE.WebGLRenderTarget { constructor(...args) {super(...args); targets.push(this);} }
  let ratio = 1, size = [1,1], target = null, scissorTest = false;
  const gl = {MAX_TEXTURE_SIZE:1,MAX_RENDERBUFFER_SIZE:2,RENDERBUFFER:3,RGBA16F:4,DEPTH_COMPONENT24:5,SAMPLES:6,
    getParameter(key){return key===1?texture:renderbuffer;},getInternalformatParameter(_,format){return format===4?color:depth;},getContextAttributes(){return{antialias:false};}};
  const renderer = {potaHDRSupported:framebuffer,capabilities:{isWebGL2:hdr,maxTextureSize:texture},extensions:{has:()=>hdr},getContext:()=>gl,
    setPixelRatio(value){ratio=value;},setSize(w,h){size=[Math.max(1,Math.floor(w*ratio)),Math.max(1,Math.floor(h*ratio))];},
    getDrawingBufferSize(out){return out.set(...size);},getRenderTarget:()=>target,setRenderTarget(value){target=value;},
    getScissorTest:()=>scissorTest,setScissorTest(value){scissorTest=value;},getViewport(out){return out.set(0,0,...size);},setViewport(){},getScissor(out){return out.set(0,0,...size);},setScissor(){},
    render(scene){draws.push(scene);}};
  const context = {THREE:{...THREE,WebGLRenderTarget:Target},innerWidth:desktop?1280:390,innerHeight:desktop?720:844,devicePixelRatio:desktop?1:3,
    PotaDeviceInfo:nativeDevice,navigator:{deviceMemory:memory,hardwareConcurrency:memory>=8?8:2},matchMedia:()=>({matches:!desktop}),performance:{now:()=>1000},document:{hidden:false,addEventListener(){},removeEventListener(){}}};
  vm.createContext(context);vm.runInContext(source,context);
  const pipeline = context.createPotaGraphics({renderer,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),onQualityChange:row=>profiles.push(row)});
  pipeline.resize(context.innerWidth,context.innerHeight);
  return{pipeline,renderer,context,targets,profiles,draws};
}
function bounded(row){
  assert(row.sceneResolution.every(n=>Number.isFinite(n)&&n>0&&n<=row.maxTargetDimension));
  assert(row.estimatedTargetBytes<=row.memoryBudgetMB*1024*1024,'All estimated main + side attachment bytes obey budget');
  assert(row.sceneResolution[0]*row.sceneResolution[1]<=row.resolutionPixelBudget);
}
function simulate(pipeline,start,duration,frameMs=1000/60,renderMs=2){
  let now=start;
  for(let i=0;i<Math.ceil(duration/frameMs);i++){now+=frameMs;pipeline.sampleFrame({now,frameMs,renderMs,visible:true});}
  return now;
}
const startup=[];
for(const memory of [1,2,4,8,0])for(const desktop of [true,false])for(const hdr of [true,false]){
  const f=fixture({memory,desktop,hdr}),d=f.pipeline.diagnostics();bounded(d);
  assert.equal(d.quality,'auto');assert.equal(d.resolutionQuality,'auto');assert.equal(d.targetFps,60);assert.equal(d.preference,'smooth');assert.equal(d.developerOverrides.enabled,false);
  assert(d.automaticTier<=1);if(memory<=2&&memory||!hdr){assert.equal(d.hdr,false);assert.equal(d.automaticTier,0);}
  startup.push({memory,desktop,hdr,budget:d.memoryBudgetMB,tier:d.automaticTier,pixels:d.sceneResolution[0]*d.sceneResolution[1]});
  f.pipeline.dispose();
}
const f=fixture(),p=f.pipeline,identity=f.targets.slice();
assert.equal(p.setDisplayRefreshRate(60),true);assert.equal(p.diagnostics().targetFps,60);
for(const hz of [90,100,110]){p.setDisplayRefreshRate(hz);assert.equal(p.diagnostics().targetFps,60);}
for(const hz of [119.88,120,144,240]){p.setDisplayRefreshRate(hz);assert.equal(p.diagnostics().targetFps,120);}
for(const hz of [0,NaN,Infinity,1001,'120'])assert.equal(p.setDisplayRefreshRate(hz),false);
for(const preference of ['graphics','balanced','smooth']){
  p.setPerformancePreference(preference);
  for(const hz of [60,89.9,90,120,144]){
    p.setDisplayRefreshRate(hz);
    const expected=preference==='graphics'?60:preference==='balanced'?(hz>=89?90:60):(hz>=119?120:60);
    assert.equal(p.diagnostics().targetFps,expected,`${preference} follows its target on ${hz} Hz`);
    bounded(p.diagnostics());
  }
}
for(const desktop of [true,false]){
  const modes=fixture({desktop}),graphics=modes.pipeline;
  graphics.setDisplayRefreshRate(144);
  const smooth=graphics.diagnostics();
  graphics.setPerformancePreference('balanced');const balanced=graphics.diagnostics();
  graphics.setPerformancePreference('graphics');const visual=graphics.diagnostics();
  assert.equal(visual.targetFps,60);assert.equal(balanced.targetFps,90);assert.equal(smooth.targetFps,120);
  assert.equal(visual.effectiveProfile,'high');assert.equal(balanced.effectiveProfile,'auto');
  assert(visual.sceneResolution[0]*visual.sceneResolution[1]>balanced.sceneResolution[0]*balanced.sceneResolution[1]);
  assert(balanced.sceneResolution[0]*balanced.sceneResolution[1]>smooth.sceneResolution[0]*smooth.sceneResolution[1]);
  assert(visual.aoStrength>balanced.aoStrength&&balanced.aoStrength>smooth.aoStrength,'Effects increase along with automatic resolution');
  assert.equal(modes.profiles.at(-1).targetFps,60);
  graphics.setPerformancePreference('balanced');
  assert.equal(modes.profiles.at(-1).reflectionInterval,6,'90 FPS does not run auxiliary passes more than the 60 FPS budget');
  assert.equal(modes.profiles.at(-1).netShadowInterval,4);
  const stable=graphics.diagnostics();
  graphics.setPerformancePreference('balanced');assert.equal(graphics.diagnostics().drawingBufferResizes,stable.drawingBufferResizes,'Reapplying a preference is a no-op');
  for(const row of [smooth,balanced,visual])bounded(row);
  graphics.dispose();
}
p.setDisplayRefreshRate(60);assert.equal(p.setPerformancePreference('graphics'),true);
let now=simulate(p,1000,40000);let d=p.diagnostics();assert.equal(d.automaticTier,4,'Sustained measured headroom reaches unchanged Ultra');
assert.equal(d.effectiveProfile,'ultra');assert.equal(d.aoSamples,16);assert.equal(d.bloomExtractSamples,13);bounded(d);
const ultraPixels=d.sceneResolution[0]*d.sceneResolution[1];
now=simulate(p,now,18000,70,35);d=p.diagnostics();bounded(d);
assert(d.automaticTier<4);assert(d.sceneResolution[0]*d.sceneResolution[1]<ultraPixels,'Sustained overload lowers actual rendered pixels');
assert(d.adaptationChanges>0);const overloaded={tier:d.automaticTier,scale:d.automaticScale,changes:d.adaptationChanges};
p.resetTiming();const beforePause=p.diagnostics().adaptationChanges;
for(let i=0;i<10;i++)p.sampleFrame({now:now+i*10000,frameMs:10000,renderMs:1000,visible:false});
assert.equal(p.diagnostics().adaptationChanges,beforePause,'Hidden/menu gaps never lower the auto profile');
for(const quality of ['auto','balanced','high','ultra'])for(const resolution of ['auto','low','medium','high','max']){
  assert.equal(p.setDeveloperOverrides({enabled:true,quality,resolution}),true);bounded(p.diagnostics());
}
assert.deepEqual(f.targets,identity,'Profile changes reuse the same two JS target resources');
p.setDeveloperOverrides({enabled:true,quality:'ultra',resolution:'max'});p.resize(20000,20000);bounded(p.diagnostics());
const manual=p.diagnostics();now=simulate(p,now,30000,80,45);assert.equal(p.diagnostics().automaticScale,manual.automaticScale,'Fully manual developer mode does not adapt');
p.setPerformancePreference('balanced');assert.equal(p.diagnostics().quality,'ultra');assert.equal(p.diagnostics().resolutionQuality,'max');assert.equal(p.diagnostics().automaticScale,manual.automaticScale,'Preference changes respect manual developer overrides');
assert.equal(p.setDeveloperOverrides({enabled:false}),true);assert(p.diagnostics().automatic);
assert.equal(p.setDeveloperOverrides({enabled:true,quality:'bogus'}),false);assert.equal(p.setDeveloperOverrides({enabled:true,resolution:'bogus'}),false);
assert.equal(p.resize(NaN,800),false);assert.equal(p.setPerformancePreference('bogus'),false);
p.degrade('context-restored');d=p.diagnostics();assert.equal(d.hdr,false);assert.equal(d.automaticTier,0);assert.equal(d.fallbackReason,'context-restored');assert(f.targets.every(t=>t.width===1&&t.height===1));bounded(d);
p.setPerformancePreference('graphics');d=p.diagnostics();assert.equal(d.hdr,false);assert(d.automaticTier<=1);assert(d.automaticScale<=.65);bounded(d);
p.dispose();p.dispose();assert.equal(p.setPerformancePreference('smooth'),false);assert.equal(p.setDeveloperOverrides({enabled:false}),false);assert.equal(p.diagnostics().disposed,true);
const limited=fixture({memory:1,desktop:false,texture:1024,renderbuffer:256});limited.pipeline.setDeveloperOverrides({enabled:true,quality:'ultra',resolution:'max'});limited.pipeline.resize(20000,20000);bounded(limited.pipeline.diagnostics());assert(limited.profiles.at(-1).shadowResolution<=256);limited.pipeline.dispose();
const failed=fixture({framebuffer:false});assert.equal(failed.pipeline.diagnostics().hdrSupported,false);failed.pipeline.setDeveloperOverrides({enabled:true,quality:'ultra',resolution:'high'});assert.equal(failed.pipeline.diagnostics().hdr,false);failed.pipeline.render();assert.equal(failed.draws.length,1);failed.pipeline.dispose();
const mismatch=fixture({color:[4],depth:[2]});mismatch.pipeline.setDeveloperOverrides({enabled:true,quality:'ultra',resolution:'auto'});assert.equal(mismatch.pipeline.diagnostics().msaaSamples,0);mismatch.pipeline.dispose();
console.log('PASS automatic startup, bounded attachments, preference-specific 60/90/120 targets, immediate visual preference quality/resolution, measured headroom → Ultra, overload → lower resolution/effects, pause exclusion, developer overrides, HDR probe veto, restore fallback:',JSON.stringify({startup:startup.length,overloaded,renderTargets:identity.length}));
for(const nativeDevice of [{memoryGB:1,lowRam:false},{memoryGB:8,lowRam:true},{lowRam:true}]){
 const native=fixture({memory:8,nativeDevice}),row=native.pipeline.diagnostics();bounded(row);assert(row.memoryBudgetMB<=40,'Native memory/low-RAM hint overrides browser high-memory hint');assert.equal(row.automaticTier,0);native.pipeline.dispose();
}
console.log('PASS native Android memory and low-RAM startup hints.');
for(const memory of [1,2])for(const hdr of [true,false]){
  const weak=fixture({memory,hdr,desktop:false,texture:1024,renderbuffer:512});
  for(const preference of ['balanced','graphics','smooth']){
    weak.pipeline.setPerformancePreference(preference);
    const row=weak.pipeline.diagnostics();bounded(row);assert(row.automaticTier<=(hdr?2:1),'Visual preference cannot bypass weak-device auto-tier ceiling');
  }
  weak.pipeline.dispose();
}
console.log('PASS all three preferences preserve weak-device and framebuffer limits.');
