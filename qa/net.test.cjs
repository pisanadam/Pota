'use strict';
const assert = require('node:assert/strict');
require('../src/net.js');
require('../src/physics.js');
const N = global.PotaNetPhysics, P = global.HoopPhysics, H = 1 / 240;
const axes = ['x', 'y', 'z'];
function finite(n, b) {
  for (const value of n.positions) assert(Number.isFinite(value), 'finite cloth positions');
  for (const value of n.velocities) assert(Number.isFinite(value), 'finite cloth velocities');
  for (const axis of axes) { assert(Number.isFinite(b.position[axis])); assert(Number.isFinite(b.velocity[axis])); assert(Number.isFinite(b.spin[axis])); }
}
function mechanicalEnergy(n, b) {
  const mass = 0.62, inertia = 2 / 3 * mass * 0.12 ** 2;
  let energy = mass * (0.5 * axes.reduce((a, k) => a + b.velocity[k] ** 2, 0) + 9.81 * b.position.y) +
    0.5 * inertia * axes.reduce((a, k) => a + b.spin[k] ** 2, 0);
  for (let j = n.spokes; j < n.particleCount; j++) {
    const k = j * 3;
    energy += (0.5 * (n.velocities[k] ** 2 + n.velocities[k + 1] ** 2 + n.velocities[k + 2] ** 2) + 9.81 * (n.origin.y + n.positions[k + 1])) / n.inverseMass[j];
  }
  for (const list of [n.links, n.bends]) for (const edge of list) {
    const a = edge.a * 3, b = edge.b * 3;
    let extension = Math.hypot(n.positions[b] - n.positions[a], n.positions[b + 1] - n.positions[a + 1], n.positions[b + 2] - n.positions[a + 2]) - edge.rest;
    if (list === n.links) extension = Math.max(0, extension);
    energy += 0.5 * extension * extension / edge.compliance;
  }
  return energy;
}
function drop(options = {}) {
  const n = N.create(), b = { position: { x: options.x || 0, y: 3.5, z: 0 },
    velocity: { x: 0, y: -(options.speed || 5), z: 0 }, spin: { x: options.spin === undefined ? 8 : options.spin, y: 0, z: 0 } };
  const initialEnergy = mechanicalEnergy(n, b);
  let energyPeak = initialEnergy, maxDisplacement = 0, maxStrain = 0, contacts = 0, impulse = 0, work = 0, slip = 0, widestMouth = 0, exit = null;
  for (let i = 0; i < (options.seconds || 6) * 240; i++) {
    n.beginFrame();
    b.velocity.y -= 9.81 * H;
    for (const axis of axes) b.position[axis] += b.velocity[axis] * H;
    n.step(H, b); n.finishFrame();
    const d = n.diagnostics(), a = n.audioState;
    maxDisplacement = Math.max(maxDisplacement, d.maxDisplacement); maxStrain = Math.max(maxStrain, d.maxStrain);
    energyPeak = Math.max(energyPeak, mechanicalEnergy(n, b));
    contacts += a.contactCount; impulse += a.normalImpulse; work += a.frictionWork; slip = Math.max(slip, a.slipSpeed);
    let mouth = 0;
    for (let j = n.particleCount - n.spokes; j < n.particleCount; j++) mouth += Math.hypot(n.positions[j * 3], n.positions[j * 3 + 2]) / n.spokes;
    widestMouth = Math.max(widestMouth, mouth);
    if (!exit && b.position.y < 2) exit = JSON.parse(JSON.stringify(b));
    assert.equal(d.anchorError, 0, 'rim anchors never drift');
    for (const edge of n.links) assert(edge.lambda <= 1e-12, 'cord constraints pull only, never act as compression struts');
    assert(a.contactCount <= n.links.length, 'each strand is counted only once, not once per solver iteration');
    assert(a.frictionWork >= 0 && a.normalImpulse >= 0);
    assert.equal(a.frameDt, H);
    assert(d.totalEnergy < 2, 'cloth kinetic energy remains bounded');
  }
  finite(n, b);
  assert(energyPeak <= initialEnergy + 0.01, 'ball + cloth + elastic + gravitational energy does not grow');
  return { n, b, exit, maxDisplacement, maxStrain, contacts, impulse, work, slip, widestMouth };
}

const idle = N.create();
assert.equal(idle.spokes, 12);
assert.equal(idle.particleCount, 72);
const hangingLength = -Math.min(...idle.positions.filter((_, i) => i % 3 === 1));
assert(hangingLength >= 0.4 && hangingLength <= 0.45, 'regulation-size hanging net');
let mass = 0; for (const w of idle.inverseMass) if (w > 0) mass += 1 / w;
assert(Math.abs(mass - 0.11) < 1e-12, 'mass distribution totals the documented 110 g assumption');
for (let i = 0; i < 60 * 60; i++) { idle.beginFrame(); idle.step(1 / 60, null); idle.finishFrame(); }
assert.equal(idle.audioState.contactCount, 0); assert.equal(idle.audioState.motionEnergy, 0);
assert.equal(idle.audioState.normalImpulse, 0); assert.equal(idle.audioState.frictionWork, 0);
assert.equal(idle.diagnostics().anchorError, 0); assert(idle.diagnostics().sleeping);
console.log('PASS: dimensions, 12 exact anchors, mass, gravity equilibrium and one minute silent idle');

const centered = drop();
assert(centered.exit && centered.exit.velocity.y < -6, 'centered ball clears the bottom rather than hanging in a closed ring');
assert(centered.contacts > 0 && centered.impulse > 0 && centered.work > 0, 'a clean swish really contacts flexible lower cords');
assert(centered.widestMouth > 0.13, 'lower diamond loops open wider than the ball');
assert(centered.maxStrain < 0.02, 'mouth opens by folding rather than stretching nylon unrealistically');
assert(centered.maxDisplacement > 0.08 && centered.maxDisplacement < 0.5);
assert(centered.exit.velocity.y > -7.4, 'net takes momentum from the ball');
assert(centered.n.diagnostics().sleeping && centered.n.audioState.motionEnergy === 0, 'net settles fully to silence');
console.log('PASS: clean swish opens the net, transfers momentum and dissipates friction; then sleeps');

const graze = drop({ x: 0.1 });
assert(graze.contacts > centered.contacts && graze.impulse > centered.impulse);
assert(Math.abs(graze.exit.velocity.x) > 0.05, 'off-center contact changes the ball direction');
assert(graze.maxDisplacement > centered.maxDisplacement, 'one-sided shot swings the net asymmetrically');
assert(graze.maxStrain < 0.03 && graze.n.diagnostics().sleeping);
const nearMiss = drop({ x: 0.5, seconds: 1 });
assert.equal(nearMiss.contacts, 0); assert.equal(nearMiss.work, 0); assert.equal(nearMiss.impulse, 0);
console.log('PASS: off-center graze reacts asymmetrically; nearby miss creates no contact or sound');

const fast = drop({ speed: 18 });
assert(fast.contacts > 0 && fast.exit, '18 m/s pass cannot tunnel through the net');
assert(fast.maxStrain < 0.03 && fast.maxDisplacement < 0.55);
const noSpin = drop({ spin: 0, seconds: 1 }), backSpin = drop({ spin: 40, seconds: 1 });
assert(backSpin.slip > noSpin.slip + 3, 'slip audio includes the actual surface angular velocity');
assert(backSpin.exit.spin.x < 40, 'friction exerts torque on the spinning ball');
assert(backSpin.work > noSpin.work, 'faster rubbing dissipates more friction work');
console.log('PASS: fast pass, spin torque, friction work, finite state and total mechanical energy bounds');

function gameShot(fps) {
  const n = N.create({ origin: { x: 0, y: 3.044, z: -12.35 } });
  const origin = { x: 0, y: 1.95, z: -7.8 }, b = P.launch({ position: origin, speed: P.idealSpeed(origin, 0, 54), angleDeg: 54 });
  let contacts = 0, maxStrain = 0;
  for (let frame = 0; frame < fps * 6; frame++) {
    n.beginFrame();
    for (let step = 0; step < 240 / fps; step++) {
      P.step(b, H); n.step(H, b); maxStrain = Math.max(maxStrain, n.diagnostics().maxStrain);
      for (let knot = n.spokes; knot < n.particleCount; knot++) {
        const k = knot * 3, x = n.positions[k], y = n.positions[k + 1], z = n.positions[k + 2];
        const clearance = Math.hypot(Math.hypot(x, z) - 0.2465, y - 0.006);
        assert(clearance >= 0.018 + N.parameters.cordRadius - 0.0001, 'flying knot cannot pass through the solid rim');
        if (Math.abs(x) < 0.93 && y > -0.149 && y < -0.049) assert(-z <= 0.3675 - N.parameters.cordRadius + 0.0001, 'net remains in front of the lower board padding');
        if (Math.abs(x) < 0.905 && y > -0.054) assert(-z <= 0.3875 - N.parameters.cordRadius + 0.0001, 'net cannot pass through glass');
      }
      for (const edge of n.links) for (const t of [0.25, 0.5, 0.75]) {
        const a = edge.a * 3, c = edge.b * 3;
        const x = n.positions[a] * (1 - t) + n.positions[c] * t;
        const y = n.positions[a + 1] * (1 - t) + n.positions[c + 1] * t;
        const z = n.positions[a + 2] * (1 - t) + n.positions[c + 2] * t;
        assert(Math.hypot(Math.hypot(x, z) - 0.2465, y - 0.006) >= 0.018 + N.parameters.cordRadius - 0.0001, 'cord interiors remain outside steel');
      }
    }
    n.finishFrame(); contacts += n.audioState.contactCount;
  }
  assert(b.scored, 'the real default shot remains a make with net coupling');
  assert(contacts > 0 && maxStrain < 0.05);
  assert(n.diagnostics().sleeping && n.audioState.motionEnergy === 0);
  return { ball: b, positions: Array.from(n.positions) };
}
const at30 = gameShot(30), at60 = gameShot(60), at120 = gameShot(120);
assert.deepEqual(at30, at60); assert.deepEqual(at60, at120);
console.log('PASS: real scoring shot, rim/board cloth collision, identical net motion at 30, 60 and 120 render fps');
console.log(JSON.stringify({ hangingLength, centered: { contacts: centered.contacts, impulse: centered.impulse, frictionWork: centered.work, maxDisplacement: centered.maxDisplacement, maxStrain: centered.maxStrain }, graze: { impulse: graze.impulse, maxDisplacement: graze.maxDisplacement }, fast: { maxStrain: fast.maxStrain } }, null, 2));
