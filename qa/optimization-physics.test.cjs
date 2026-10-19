'use strict';
// A source-directory argument permits before/after measurements against an
// untouched copy. The same deterministic simulation digest guards the result.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = process.argv[2] || path.join(__dirname, '../src');
function load(counts) {
  const measuredMath = Object.create(Math);
  if (counts) for (const name of ['hypot', 'sqrt', 'log1p', 'expm1', 'exp']) {
    measuredMath[name] = (...values) => { counts[name] = (counts[name] || 0) + 1; return Math[name](...values); };
  }
  const context = {};
  // Both self-contained modules accept a window namespace. Executing in the
  // native realm avoids measuring V8 cross-context Math/typed-array overhead.
  for (const name of ['physics.js', 'net.js']) new Function('window', 'Math', fs.readFileSync(path.join(source, name), 'utf8'))(context, measuredMath);
  return { P: context.HoopPhysics, N: context.PotaNetPhysics };
}
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function physics(P) {
  const snapshots = [];
  for (let shot = 0; shot < 24; shot++) {
    const hoop = shot & 1, position = { x: (shot % 7 - 3) * 2.2, y: 1.95, z: (shot % 5 - 2) * 3.3 };
    const ball = P.launch({ position, targetHoop: hoop, angleDeg: 42 + shot % 5 * 5, sideSpin: shot % 3 ? shot - 12 : 0 });
    if (shot % 6 === 0) { ball.position.y = 8.55; ball.velocity.y = 15; }
    if (shot % 6 === 1) { ball.position.x = 11.7; ball.velocity.x = 40; }
    if (shot % 6 === 2) { ball.position = { x: .912, y: 3.6, z: -12.2 }; ball.velocity = { x: 0, y: 0, z: -50 }; }
    const events = [];
    for (let frame = 0; frame < 240; frame++) {
      events.push(...P.step(ball, 1 / 60));
      if (frame % 30 === 0) snapshots.push(JSON.parse(JSON.stringify(ball)));
    }
    snapshots.push(events, ball);
  }
  const guided = P.launch({ drawnPath: [{x:0,y:1.95,z:-7.8},{x:1,y:4.5,z:-10},{x:0,y:3.2,z:-12.35},{x:0,y:2.1,z:-12.35}], drawnDuration: 1.3 });
  for (let frame = 0; frame < 150; frame++) { const events = P.step(guided, 1 / 60); if (frame % 10 === 0) snapshots.push(JSON.parse(JSON.stringify(guided)), events); }
  return digest(snapshots);
}
function net(N) {
  const snapshots = [];
  for (const material of ['nylon', 'chain']) for (const x of [0, .1]) {
    const cloth = N.create({ material }), ball = { position: { x, y: 3.5, z: 0 }, velocity: { x: 0, y: -7, z: 0 }, spin: { x: 18, y: 0, z: 0 } };
    for (let tick = 0; tick < 480; tick++) {
      cloth.beginFrame();
      ball.velocity.y -= 9.81 / 240;
      for (const axis of ['x', 'y', 'z']) ball.position[axis] += ball.velocity[axis] / 240;
      cloth.step(1 / 240, ball); cloth.finishFrame();
      if (tick % 30 === 0) snapshots.push({ positions: Array.from(cloth.positions), velocities: Array.from(cloth.velocities), ball: JSON.parse(JSON.stringify(ball)), audio: JSON.parse(JSON.stringify(cloth.audioState)) });
    }
    snapshots.push(cloth.diagnostics());
  }
  return digest(snapshots);
}
const runtime = load();
const actual = { physics: physics(runtime.P), net: net(runtime.N) };
// Filled from the unchanged 1.9.0 solver before optimizing it.
const reference = { physics: '5ac5e9a211b94c007a07e2dcf1402517a299f5b96cf353ee7158a9defa440deb', net: 'c8e8e4bfe6ce8056e9492951a7cbb0ae521501d2e59969b97e8235ed99540e4f' };
assert.deepEqual(actual, reference, 'Positions, velocities, contacts, audio, scores and constraints must remain bit-identical');
const counts = {}, counted = load(counts);
physics(counted.P); const physicsOperations = { ...counts };
for (const key of Object.keys(counts)) delete counts[key];
net(counted.N); const netOperations = { ...counts };
if (path.resolve(source) === path.resolve(__dirname, '../src')) {
  assert(physicsOperations.hypot < 2000 && physicsOperations.log1p < 100, 'Distant rim/rest/ceiling checks must not evaluate unnecessary norms/apex searches');
  assert(netOperations.hypot < 3000000, 'Cord samples below the rim must be rejected before evaluating torus distances');
}
function medianMs(fn) {
  fn(); const durations = [];
  for (let i = 0; i < 5; i++) { const before = process.hrtime.bigint(); fn(); durations.push(Number(process.hrtime.bigint() - before) / 1e6); }
  return durations.sort((a, b) => a - b)[2];
}
const milliseconds = process.argv.includes('--timings') ? { physics: medianMs(() => physics(runtime.P)), net: medianMs(() => net(runtime.N)) } : undefined;
console.log(JSON.stringify({ source, digests: actual, physicsOperations, netOperations, milliseconds }, null, 2));
