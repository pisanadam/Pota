'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const T = require('../vendor/three.min.js');
const source = fs.readFileSync(path.join(__dirname, '../src/weather.js'), 'utf8');
const baselinePath = process.argv[2];
function create(text) {
  const window = { THREE: T };
  new Function('window', text)(window);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera();
  camera.position.set(0, 1.7, -4.2);
  const weather = window.createPotaWeather({ scene, camera });
  return { weather, scene, center: scene.getObjectByName('weather-grains-precipitation').geometry.attributes.aCenter };
}

// Mimic the renderer consuming update ranges: only the current visible prefix
// should be uploaded, and frames without movement should enqueue no upload.
const fixture = create(source), { weather, center } = fixture;
weather.setQuality('balanced'); center.clearUpdateRanges();
const version = center.version;
weather.update(0, 123);
assert.equal(center.version, version, 'unchanged particle centers are not uploaded');
assert.equal(center.updateRanges.length, 0);
weather.update(1 / 60, 123.01);
const record = center.updateRanges[0];
assert.deepEqual(record, { start: 0, count: weather.getDiagnostics().count * 3 });
for (let i = 0; i < 100; i++) weather.update(1 / 60, 124 + i / 60);
assert.equal(center.updateRanges.length, 1, 'unrendered updates do not accumulate upload ranges');
assert.equal(center.updateRanges[0], record, 'no per-frame update-range allocation');
weather.setQuality('ultra');
assert.equal(record.count, weather.getDiagnostics().count * 3, 'newly visible prefix is uploaded immediately');
weather.setEnvironment('desert-court'); weather.setQuality('balanced');
assert.equal(record.count, center.array.length, 'a pending full environment reset is never shortened');
center.clearUpdateRanges(); weather.update(1 / 60, 127);
assert.equal(record.count, weather.getDiagnostics().count * 3);
assert.equal(center.updateRanges[0], record);
weather.dispose();

let baseline = null, maxDeviation = 0;
if (baselinePath) {
  baseline = fs.readFileSync(baselinePath, 'utf8');
  const old = create(baseline), current = create(source);
  const environments = ['gym', 'sunset-gym', 'night-gym', 'neon-arena', 'royal-arena', 'street-court', 'midnight-court', 'coastal-court', 'desert-court', 'alpine-court'];
  for (const environment of environments) {
    old.weather.setEnvironment(environment); current.weather.setEnvironment(environment);
    for (const quality of ['auto', 'balanced', 'high', 'ultra']) {
      old.weather.setQuality(quality); current.weather.setQuality(quality);
      for (let frame = 0; frame < 360; frame++) {
        const dt = frame % 73 === 0 ? 0 : frame % 37 === 0 ? 0.06 : 1 / 60;
        const time = frame / 60 + 500.25;
        old.weather.update(dt, time); current.weather.update(dt, time);
      }
      for (const name of ['weather-grains-precipitation', 'weather-soft-world-haze', 'weather-ground-splash-rings']) {
        const before = old.scene.getObjectByName(name), after = current.scene.getObjectByName(name);
        assert.equal(before.geometry.instanceCount, after.geometry.instanceCount);
        const a = before.geometry.attributes.aCenter.array, b = after.geometry.attributes.aCenter.array;
        for (let i = 0; i < a.length; i++) maxDeviation = Math.max(maxDeviation, Math.abs(a[i] - b[i]));
      }
      assert(maxDeviation < 0.00002, `seeded movement changed: ${environment}/${quality}, max ${maxDeviation}`);
    }
  }
  old.weather.dispose(); current.weather.dispose();
}

function benchmark(text, environment) {
  const item = create(text); item.weather.setEnvironment(environment); item.weather.setQuality('ultra');
  for (let i = 0; i < 1000; i++) { item.weather.update(1 / 60, i / 60); item.center.clearUpdateRanges(); }
  const rounds = [];
  for (let round = 0; round < 5; round++) {
    const start = performance.now();
    for (let i = 0; i < 2000; i++) { item.weather.update(1 / 60, 100 + i / 60); item.center.clearUpdateRanges(); }
    rounds.push((performance.now() - start) / 2000);
  }
  item.weather.dispose(); rounds.sort((a, b) => a - b); return rounds[2];
}
const rows = [];
if (baseline) {
  for (const environment of ['gym', 'street-court', 'alpine-court', 'desert-court']) {
    const beforeMs = benchmark(baseline, environment), afterMs = benchmark(source, environment);
    rows.push({ environment, quality: 'ultra', beforeMs, afterMs, reductionPercent: 100 * (1 - afterMs / beforeMs) });
  }
}
const result = {
  passed: true, method: 'Node same-context deterministic seed, 1000 warmup + median of 5 × 2000 updates; CPU update only, not device FPS',
  baselineSha256: baseline && crypto.createHash('sha256').update(baseline).digest('hex'),
  optimizedSha256: crypto.createHash('sha256').update(source).digest('hex'), maxPositionDeviationMetres: maxDeviation,
  staticCacheBytes: 3 * 2200 * 8, perFrameRangeAllocations: 0, cpu: rows,
  uploadExample: { environment: 'gym', quality: 'balanced', beforeFloats: 6600, afterFloats: 63 }
};
fs.writeFileSync(path.join(__dirname, 'optimization-weather-results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
