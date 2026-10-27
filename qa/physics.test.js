const test = require('node:test');
const assert = require('node:assert/strict');
const { HoopPhysics: P } = require('./load')('physics.js');

function simulate(options) {
  const ball = P.launch(options);
  for (let i = 0; i < 240 * 6 && !ball.resolved; i++) P.step(ball, 1 / 240);
  return ball;
}

test('an ideal shot scores in the main hoop', () => {
  const position = { x: 0, y: 1.95, z: -7.35 };
  const ball = simulate({ position, targetHoop: 0, angleDeg: 55, speed: P.idealSpeed(position, 0, 55) });
  assert.equal(ball.scored, true);
  assert.equal(ball.scoredHoop, 0);
});

test('an ideal shot scores in the far hoop', () => {
  const position = { x: 0, y: 1.95, z: 7.35 };
  const ball = simulate({ position, targetHoop: 1, angleDeg: 55, speed: P.idealSpeed(position, 1, 55) });
  assert.equal(ball.scored, true);
  assert.equal(ball.scoredHoop, 1);
});

test('aim offset turns toward the same screen side at both hoops', () => {
  // Screen right is +x when facing hoop 0 (-z) and -x when facing hoop 1 (+z).
  const near = P.launch({ position: { x: 0, y: 1.95, z: -7 }, targetHoop: 0, azimuthOffset: 10 });
  const far = P.launch({ position: { x: 0, y: 1.95, z: 7 }, targetHoop: 1, azimuthOffset: 10 });
  assert.ok(near.velocity.x > 0);
  assert.ok(far.velocity.x < 0);
});
