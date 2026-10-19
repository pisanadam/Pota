'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T = require('../vendor/three.min.js');
const context = { window: { THREE: T } };
vm.runInNewContext(fs.readFileSync(require.resolve('../src/weather.js'), 'utf8'), context);
const scene = new T.Scene(), camera = new T.PerspectiveCamera();
camera.position.set(0,1.7,-4.2);
const weather = context.window.createPotaWeather({scene,camera});
const group = scene.getObjectByName('environment-weather');
assert(group && group.children.length === 3);
const main = scene.getObjectByName('weather-grains-precipitation');
const initialUUID = weather.getDiagnostics().bufferUUID, initialMaterial = weather.getDiagnostics().materialUUID;
let disposeEvents = 0;
for(const mesh of group.children){
  assert(mesh.material.depthTest && !mesh.material.depthWrite && mesh.material.transparent);
  assert(mesh.material.forceSinglePass, 'flat transparent quads only need one pass');
  mesh.geometry.addEventListener('dispose',()=>disposeEvents++);
  mesh.material.addEventListener('dispose',()=>disposeEvents++);
}
const profiles = ['balanced','auto','high','ultra'];
const envs = ['gym','sunset-gym','night-gym','neon-arena','royal-arena','street-court','midnight-court','coastal-court','desert-court','alpine-court'];
let samples = [];
for(const env of envs){
  let prior = 0;
  assert(weather.setEnvironment(env));
  for(const profile of profiles){
    assert(weather.setQuality(profile));
    let d=weather.getDiagnostics(); assert(d.activeParticles>prior); prior=d.activeParticles;
    assert(d.activeParticles<=2200 && d.hazeCount<=36 && d.splashCount<=72 && d.drawCalls<=3);
    assert.equal(d.bufferUUID,initialUUID); assert.equal(d.materialUUID,initialMaterial);
    const p=main.geometry.attributes.aCenter.array, before=p[0];
    for(let frame=0;frame<300;frame++)weather.update(1/60,frame/60);
    assert.notEqual(p[0],before,'particles actually move in world space');
    for(let i=0;i<d.activeParticles;i++){
      assert(Number.isFinite(p[i*3]) && Number.isFinite(p[i*3+1]) && Number.isFinite(p[i*3+2]));
      assert(Math.abs(p[i*3])<=11.601 && Math.abs(p[i*3+2])<=17.601);
      assert(p[i*3+1]>=0.05 && p[i*3+1]<=11.65);
    }
    weather.update(NaN,Infinity); assert(weather.getDiagnostics().finite);
  }
  const d=weather.getDiagnostics(); samples.push({environment:env,mode:d.mode,count:d.activeParticles,haze:d.hazeCount,splashes:d.splashCount});
  if(env.endsWith('gym') || env.endsWith('arena'))assert(d.mode==='motes' && !d.hazeCount && !d.splashCount);
  if(env==='desert-court')assert(d.mode==='sandstorm' && d.hazeCount===36 && !d.splashCount);
  if(env==='alpine-court')assert(d.mode==='snow' && !d.hazeCount && !d.splashCount);
}
assert(!weather.setEnvironment('__proto__')); assert(!weather.setQuality('missing'));
const last=weather.getDiagnostics(); assert.equal(last.environment,'alpine-court');
weather.dispose();weather.dispose();assert.equal(disposeEvents,6);assert(!scene.getObjectByName('environment-weather'));
assert(weather.getDiagnostics().disposed);assert(!weather.setEnvironment('gym'));assert(!weather.setQuality('ultra'));
console.log('PASS: all 10 environments × 4 quality profiles, genuine animated world-space buffers, density/bounds/finiteness, fixed allocation and all GPU resources disposed.');
console.log(JSON.stringify(samples));
