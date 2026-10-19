/* CPU checks for quality budgets, HDR capability fallback and target reuse. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../vendor/three.min.js');
const source = fs.readFileSync(path.join(__dirname, '../src/graphics.js'), 'utf8');

function fixture({desktop = true, hdr = true, color = [4, 2], depth = [4, 2], texture = 8192, renderbuffer = 8192} = {}) {
  const targets = [], profiles = [], draws = [];
  class CountedTarget extends THREE.WebGLRenderTarget {
    constructor(...args) { super(...args); targets.push(this); }
  }
  let ratio = 1, size = [1, 1], target = null, scissorTest = true;
  const viewport = new THREE.Vector4(1, 2, 3, 4), scissor = new THREE.Vector4(5, 6, 7, 8);
  const gl = {
    MAX_TEXTURE_SIZE: 1, MAX_RENDERBUFFER_SIZE: 2, RENDERBUFFER: 3, RGBA16F: 4, DEPTH_COMPONENT24: 5, SAMPLES: 6,
    getParameter(key) { return key === this.MAX_TEXTURE_SIZE ? texture : renderbuffer; },
    getInternalformatParameter(_, format) { return format === this.RGBA16F ? color : depth; },
    getContextAttributes() { return {antialias: true}; }
  };
  const renderer = {
    capabilities: {isWebGL2: hdr, maxTextureSize: texture}, extensions: {has: () => hdr}, getContext: () => gl,
    setPixelRatio(value) { ratio = value; },
    setSize(width, height) { size = [Math.floor(width * ratio), Math.floor(height * ratio)]; },
    getDrawingBufferSize(out) { return out.set(...size); },
    getRenderTarget: () => target, setRenderTarget(value) { target = value; },
    getScissorTest: () => scissorTest, setScissorTest(value) { scissorTest = value; },
    getViewport(out) { out.copy(viewport); }, setViewport(value) { viewport.copy(value); },
    getScissor(out) { out.copy(scissor); }, setScissor(value) { scissor.copy(value); },
    render(scene, camera) { draws.push({scene, camera, target, material: scene.children[0]?.material}); }
  };
  const context = {
    THREE: {...THREE, WebGLRenderTarget: CountedTarget}, innerWidth: desktop ? 1280 : 390, innerHeight: desktop ? 720 : 844,
    matchMedia: () => ({matches: !desktop}), performance: {now: () => 1000},
    document: {addEventListener() {}, removeEventListener() {}}
  };
  vm.createContext(context); vm.runInContext(source, context);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
  const pipeline = context.createPotaGraphics({renderer, scene, camera, onQualityChange: row => profiles.push(row)});
  pipeline.resize(context.innerWidth, context.innerHeight);
  return {pipeline, targets, profiles, draws, renderer, scene, camera, viewport, scissor};
}

const desktop = fixture();
assert.equal(desktop.targets.length, 2);
desktop.pipeline.setQuality('high');
const high = desktop.pipeline.diagnostics(), highProfile = desktop.profiles.at(-1);
desktop.pipeline.setQuality('ultra');
const ultra = desktop.pipeline.diagnostics(), ultraProfile = desktop.profiles.at(-1);
assert.equal(ultra.quality, 'ultra'); assert.equal(ultra.effectiveProfile, 'ultra');
assert.equal(ultra.aoSamples, 16); assert.equal(high.aoSamples, 8);
assert.equal(ultra.bloomExtractSamples, 13); assert.equal(high.bloomExtractSamples, 5);
assert.equal(ultra.msaaSamples, 4); assert.equal(high.msaaSamples, 2);
assert.equal(ultra.postPasses, 2); assert.equal(ultra.renderTargets, 2);
assert.equal(ultraProfile.reflectionResolution, 2048); assert(ultraProfile.reflectionResolution > highProfile.reflectionResolution);
assert.equal(ultraProfile.shadowResolution, 4096);
assert.deepEqual([...ultra.sceneResolution], [...high.sceneResolution], 'Explicit resolution stays independent of effects');
assert.deepEqual([...ultra.bloomResolution], [...ultra.sceneResolution].map(value => Math.ceil(value / 2)));
assert.equal(ultra.colorPipeline, 'linear HDR → ACES → sRGB once');

const identities = desktop.targets.slice();
for (let i = 0; i < 12; i++) for (const id of ['balanced', 'high', 'auto', 'ultra']) assert(desktop.pipeline.setQuality(id));
assert.deepEqual(desktop.targets, identities, 'Repeated quality changes reuse the same two target objects');
desktop.pipeline.setResolutionQuality('max');
desktop.pipeline.setQuality('ultra');
assert.equal(desktop.pipeline.diagnostics().resolutionQuality, 'max');
desktop.pipeline.render();
assert.equal(desktop.draws.length, 3, 'One scene render and exactly two postprocessing passes');
assert.equal(desktop.draws[0].scene, desktop.scene); assert.equal(desktop.draws[0].target, identities[0]);
assert.equal(desktop.draws[1].target, identities[1]); assert.equal(desktop.draws[2].target, null);
assert.equal(desktop.draws[1].material.uniforms.highQuality.value, 1);
assert.equal(desktop.draws[2].material.uniforms.aoSamples.value, 16);
assert.equal(desktop.renderer.getScissorTest(), true); assert.deepEqual(desktop.viewport.toArray(), [1, 2, 3, 4]);
assert.deepEqual(desktop.scissor.toArray(), [5, 6, 7, 8]);
desktop.pipeline.setQuality('balanced');
const balanced = desktop.pipeline.diagnostics();
assert.equal(balanced.aoSamples, 0); assert.equal(balanced.bloomExtractSamples, 0); assert.equal(balanced.postPasses, 1);
const before = desktop.pipeline.diagnostics();
assert.equal(desktop.pipeline.setQuality('invalid'), false); assert.equal(desktop.pipeline.setResolutionQuality('invalid'), false);
assert.equal(desktop.pipeline.diagnostics().quality, before.quality);
desktop.pipeline.dispose(); desktop.pipeline.dispose();
assert.equal(desktop.pipeline.setQuality('ultra'), false); assert.equal(desktop.pipeline.setResolutionQuality('max'), false);
assert.equal(desktop.pipeline.diagnostics().disposed, true);

const mobile = fixture({desktop: false}); mobile.pipeline.setQuality('ultra');
const mobileUltra = mobile.pipeline.diagnostics();
assert.equal(mobileUltra.msaaSamples, 2); assert.equal(mobile.profiles.at(-1).reflectionResolution, 1536);
assert.equal(mobile.profiles.at(-1).shadowResolution, 4096); mobile.pipeline.dispose();

const limited = fixture({desktop: false, color: [4], depth: [4], texture: 1024, renderbuffer: 512});
limited.pipeline.setQuality('ultra'); limited.pipeline.setResolutionQuality('max'); limited.pipeline.resize(20000, 20000);
const limitedUltra = limited.pipeline.diagnostics();
assert.equal(limitedUltra.msaaSamples, 0, 'Unsupported 2x MSAA is never requested even if 4x is available');
assert.equal(limited.profiles.at(-1).reflectionResolution, 512); assert.equal(limited.profiles.at(-1).shadowResolution, 512);
assert(limitedUltra.sceneResolution.every(value => value > 0 && value <= 512)); limited.pipeline.dispose();

const mismatched = fixture({color: [4, 2], depth: [2]}); mismatched.pipeline.setQuality('ultra');
assert.equal(mismatched.pipeline.diagnostics().msaaSamples, 2, 'MSAA must be supported by both HDR color and depth'); mismatched.pipeline.dispose();

const direct = fixture({hdr: false}); assert.equal(direct.pipeline.setQuality('ultra'), true);
const fallback = direct.pipeline.diagnostics();
assert.equal(fallback.hdr, false); assert.equal(fallback.aoSamples, 0); assert.equal(fallback.bloomStrength, 0);
assert.equal(fallback.postPasses, 0); assert.equal(fallback.renderTargets, 0); assert.equal(direct.targets.length, 0);
direct.pipeline.render(); assert.equal(direct.draws.length, 1); assert.equal(direct.draws[0].scene, direct.scene);
assert.equal(fallback.colorPipeline, 'direct ACES → sRGB once'); direct.pipeline.dispose();
console.log('PASS Ultra quality budgets, mobile/desktop MSAA intersections, independent resolution, two-target reuse, state restoration and direct WebGL fallback');
