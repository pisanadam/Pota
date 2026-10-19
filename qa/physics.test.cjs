'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/physics.js'), 'utf8'), sandbox);
const P = sandbox.window.HoopPhysics;

function simulate(ball, seconds = 7, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds; t += dt) events.push(...P.step(ball, dt));
  return events;
}

function peakHeight(origin, speed, angleDeg) {
  const vy = speed * Math.sin(angleDeg * Math.PI / 180);
  const t = Math.log1p(vy * P.AIR_DRAG / P.G) / P.AIR_DRAG;
  const factor = -Math.expm1(-P.AIR_DRAG * t) / P.AIR_DRAG;
  return origin.y + vy * factor - P.G / P.AIR_DRAG * (t - factor);
}

function insideRoom(ball) {
  const { x, y, z } = ball.position, r = P.BALL_RADIUS, room = P.roomBounds;
  assert.ok(x >= room.minX + r - 1e-9 && x <= room.maxX - r + 1e-9, 'Sphere stays between the side walls');
  assert.ok(z >= room.minZ + r - 1e-9 && z <= room.maxZ - r + 1e-9, 'Sphere stays between the end walls');
  assert.ok(y >= room.floor + r - 1e-9 && y <= room.ceiling - r + 1e-9, 'Sphere stays above floor and below ceiling');
}

assert.equal(P.G, 9.81);
assert.ok(Math.abs(2 * (P.RIM_RADIUS - P.RIM_TUBE_RADIUS) - 0.457) < 1e-12, 'Regulation inside hoop diameter is 45.7 cm');
assert.equal(P.solveSpeed(0.2, 45), null, 'An angle below the hoop cannot produce an ideal speed');
assert.equal(P.solveSpeed(4, 90), null);

// Centre and sideline shots, both baskets, several feasible release angles.
let makes = 0;
for (const targetHoop of [0, 1]) {
  for (const origin of [
    { x: 0, y: 1.95, z: 0 },
    { x: -6, y: 1.95, z: -3 },
    { x: 6.3, y: 1.95, z: 8 },
    { x: 0, y: 1.95, z: targetHoop === 0 ? -8 : 8 }
  ]) {
    const isClose = Math.hypot(origin.x - P.hoops[targetHoop].x, origin.z - P.hoops[targetHoop].z) < 5;
    for (const angleDeg of isClose ? [52, 65] : [45, 52, 65]) {
      const speed = P.idealSpeed(origin, targetHoop, angleDeg);
      assert.ok(speed > 0 && Number.isFinite(speed));
      // The indoor roof physically blocks high arcs that would work outdoors.
      if (peakHeight(origin, speed, angleDeg) >= P.roomBounds.ceiling - P.BALL_RADIUS) continue;
      const ball = P.launch({ position: origin, targetHoop, speed, angleDeg });
      const events = simulate(ball);
      assert.equal(events.filter(e => e === 'score').length, 1,
        `Ideal shot should score once: hoop=${targetHoop}, x=${origin.x}, z=${origin.z}, a=${angleDeg}`);
      assert.equal(events.filter(e => e === 'miss').length, 0);
      assert.equal(ball.scoredHoop, targetHoop);
      assert.equal(ball.resolved, true);
      assert.equal(simulate(ball, 2).filter(e => e === 'score').length, 0, 'Continued animation cannot count another basket');
      makes++;
    }
  }
}

// A point trajectory alone does not guarantee that a sphere clears the rim.
// Close, low arcs must still collide with the front lip of the hoop.
const shallow = P.launch({ position: { x: 0, y: 1.95, z: -8 }, angleDeg: 45 });
const shallowEvents = simulate(shallow);
assert.ok(shallowEvents.includes('rim'));
assert.equal(shallow.scored, false);

const short = P.launch({ position: { x: 0, y: 1.95, z: -5 }, angleDeg: 52, speed: 4 });
const shortEvents = simulate(short);
assert.equal(shortEvents.filter(e => e === 'miss').length, 1);
assert.equal(short.scored, false);
assert.ok(shortEvents.includes('floor'));
assert.equal(simulate(short, 3).filter(e => e === 'miss').length, 0);

// Backboard impacts reverse the normal component at either end of the court.
for (const targetHoop of [0, 1]) {
  const hoop = P.hoops[targetHoop];
  const ball = P.launch({ position: { x: 0, y: 3.65, z: hoop.boardZ + hoop.front * 0.7 }, targetHoop, speed: 8, angleDeg: 0 });
  ball.velocity = { x: 0, y: 0, z: -hoop.front * 8 };
  const events = P.step(ball, 0.09);
  assert.ok(events.includes('board'));
  assert.ok(ball.velocity.z * hoop.front > 0, 'Backboard should reverse incoming travel');
}

const rim = P.launch({ position: { x: P.RIM_RADIUS, y: 3.27, z: P.hoops[0].z }, speed: 0, angleDeg: 0 });
rim.velocity = { x: 0, y: -2, z: 0 };
const rimEvents = P.step(rim, 0.05);
assert.ok(rimEvents.includes('rim'));
assert.ok(rim.velocity.y > 0, 'Ball dropped on the rim should rebound upward');
assert.equal(rim.scored, false);

const upward = P.launch({ position: { x: 0, y: 2.9, z: P.hoops[0].z }, speed: 3, angleDeg: 90 });
assert.ok(!P.step(upward, 0.08).includes('score'), 'Upward hoop crossings cannot score');

// A deliberately wide shot misses despite having the right height and power.
const side = P.launch({ position: { x: 0, y: 1.95, z: -5 }, angleDeg: 52, azimuthOffset: 4 });
assert.equal(simulate(side).filter(e => e === 'score').length, 0);

const defaultShot = P.launch({ position: { x: 0, y: 1.95, z: -7.8 }, angleDeg: 54 });
assert.equal(simulate(defaultShot).filter(type => type === 'score').length, 1,
  'The original fixed-position medium swipe still scores with regulation rim and precise board geometry');

// Substeps should make outcomes stable across renderer frame rates.
for (const dt of [1 / 30, 1 / 60, 1 / 144, 0.12]) {
  const ball = P.launch({ position: { x: 4, y: 1.95, z: 3 }, angleDeg: 56 });
  assert.equal(simulate(ball, 7, dt).filter(e => e === 'score').length, 1);
}

const preview = P.trajectory({ position: { x: 0, y: 1.95, z: -5 }, angleDeg: 52 });
assert.ok(preview.length > 10);
assert.ok(preview.at(-1).y >= P.BALL_RADIUS);
assert.ok(preview.at(-1).t <= 4 + 1e-8);
for (const point of preview) assert.ok(Number.isFinite(point.x + point.y + point.z));

// Every room face reflects the sphere at its radius-offset boundary. Sweep
// integration must retain the portion of the frame after the impact.
for (const axis of ['x', 'z']) {
  for (const sign of [-1, 1]) {
    const boundary = P.roomBounds[(sign < 0 ? 'min' : 'max') + axis.toUpperCase()];
    const centreLimit = boundary - sign * P.BALL_RADIUS;
    const position = { x: 0, y: 2.6, z: 0 };
    position[axis] = centreLimit - sign * 0.2;
    const ball = P.launch({ position, speed: 0 });
    ball.velocity = { x: axis === 'x' ? sign * 8 : 1, y: 2, z: axis === 'z' ? sign * 8 : 1 };
    const events = P.step(ball, 0.04);
    assert.equal(events.filter(type => type === 'wall').length, 1);
    assert.ok(ball.velocity[axis] * sign < 0, 'Wall reverses the incoming normal velocity');
    assert.ok(Math.abs(Math.abs(ball.velocity[axis]) - 8 * 0.65 * Math.exp(-P.AIR_DRAG * 0.04)) < 1e-9);
    assert.ok(ball.position[axis] * sign < centreLimit * sign, 'Ball moves inward during the rest of the frame');
    assert.equal(ball.resolved, false, 'A wall bank is still a live shot');
    assert.equal(ball.firstFloorTime, null);
    assert.equal(ball.contacts.length, 1);
    const hit = ball.contacts[0];
    assert.equal(hit.type, 'wall');
    assert.equal(hit.normal[axis], -sign);
    assert.ok(Math.abs(hit.position[axis] - boundary) < 1e-9);
    assert.ok(hit.impactSpeed > 7.9 && hit.impactSpeed < 8);
    assert.ok(hit.time > 0 && hit.time < 0.04);
    insideRoom(ball);
    P.step(ball, 0.001);
    assert.equal(ball.contacts.length, 0, 'Each frame replaces the contact list');
  }
}

const floor = P.launch({ position: { x: 2, y: 0.3, z: 0 }, speed: 0 });
floor.velocity = { x: 1, y: -6, z: 0 };
assert.ok(P.step(floor, 0.04).includes('floor'));
assert.ok(floor.velocity.y > 0);
const floorHit = floor.contacts.find(hit => hit.type === 'floor');
assert.equal(floorHit.normal.y, 1);
assert.ok(Math.abs(floorHit.position.y - P.roomBounds.floor) < 1e-9);
assert.ok(floorHit.impactSpeed > 6);
insideRoom(floor);

const ceiling = P.launch({ position: { x: 2, y: P.roomBounds.ceiling - P.BALL_RADIUS - 0.2, z: 0 }, speed: 0 });
ceiling.velocity = { x: 1, y: 8, z: 0 };
assert.ok(P.step(ceiling, 0.04).includes('ceiling'));
assert.ok(ceiling.velocity.y < 0);
const ceilingHit = ceiling.contacts.find(hit => hit.type === 'ceiling');
assert.equal(ceilingHit.normal.y, -1);
assert.ok(Math.abs(ceilingHit.position.y - P.roomBounds.ceiling) < 1e-9);
const remaining = 0.04 - ceilingHit.time;
const expectedCeilingVy = -0.58 * ceilingHit.impactSpeed * Math.exp(-P.AIR_DRAG * remaining) -
  P.G * -Math.expm1(-P.AIR_DRAG * remaining) / P.AIR_DRAG;
assert.ok(Math.abs(ceiling.velocity.y - expectedCeilingVy) < 1e-8, 'Roof restitution is followed by gravity for the remaining frame');
assert.ok(Math.abs(ceiling.velocity.x - 0.92 * Math.exp(-P.AIR_DRAG * 0.04)) < 1e-9);
assert.equal(ceiling.resolved, false);
insideRoom(ceiling);

const corner = P.launch({ position: { x: P.roomBounds.maxX - P.BALL_RADIUS - 0.1, y: 3, z: P.roomBounds.maxZ - P.BALL_RADIUS - 0.1 }, speed: 0 });
corner.velocity = { x: 10, y: 0, z: 10 };
const cornerEvents = P.step(corner, 0.04);
assert.equal(corner.wallContacts, 2, 'Both faces participate in a corner collision');
assert.ok(corner.velocity.x < 0 && corner.velocity.z < 0);
assert.equal(cornerEvents.filter(type => type === 'wall').length, 1, 'Simultaneous impacts share the audio cooldown');
assert.equal(corner.contacts.length, 1);
assert.equal(corner.resolved, false);
insideRoom(corner);

const highArc = P.launch({ position: { x: 6.3, y: 1.95, z: 8 }, angleDeg: 65 });
assert.ok(simulate(highArc).includes('ceiling'), 'A high long-range shot hits the actual indoor ceiling');
assert.equal(highArc.scored, false);
insideRoom(highArc);

// This computed two-leg bank clears the roof, rebounds from the right wall,
// then drops through the hoop. The wall itself must not finalize a miss.
const bank = P.launch({ position: { x: 10, y: 1.95, z: P.hoops[0].z }, speed: 0 });
bank.velocity = { x: 12, y: 9.5932, z: 0 };
const bankEvents = simulate(bank);
const firstWall = bankEvents.indexOf('wall'), bankScore = bankEvents.indexOf('score');
assert.ok(firstWall >= 0 && bankScore > firstWall, 'A wall bank can still become a basket');
assert.equal(bankEvents.slice(0, bankScore).includes('floor'), false);
assert.equal(bank.scored, true);
assert.equal(bankEvents.filter(type => type === 'score').length, 1);
assert.equal(bankEvents.includes('miss'), false);
insideRoom(bank);

// A deliberately large frame and fast ball must not tunnel through any face.
const fast = P.launch({ position: { x: 0, y: 4, z: 0 }, speed: 0 });
fast.velocity = { x: 240, y: 160, z: -280 };
const fastEvents = P.step(fast, 0.8);
assert.ok(fastEvents.includes('wall') && fastEvents.includes('ceiling'));
assert.ok(fast.wallContacts >= 2);
insideRoom(fast);
for (let i = 0; i < 10; i++) { P.step(fast, 0.4); insideRoom(fast); }

// Metadata belongs to real collision events, including existing metal/glass
// contacts. No score/miss entry is mislabeled as a material impact.
const metadataRim = P.launch({ position: { x: P.RIM_RADIUS, y: 3.27, z: P.hoops[0].z }, speed: 0 });
metadataRim.velocity = { x: 0, y: -2, z: 0 };
P.step(metadataRim, 0.05);
assert.ok(metadataRim.contacts.some(hit => hit.type === 'rim' && hit.impactSpeed > 2));
const metadataBoard = P.launch({ position: { x: 0, y: 3.65, z: -12.05 }, speed: 0 });
metadataBoard.velocity = { x: 0, y: 0, z: -8 };
P.step(metadataBoard, 0.09);
const boardHit = metadataBoard.contacts.find(hit => hit.type === 'board');
assert.ok(boardHit && boardHit.impactSpeed > 7.9);
assert.equal(boardHit.normal.z, 1);
assert.ok(Math.abs(boardHit.position.z - (P.hoops[0].boardZ + 0.0125)) < 1e-9);
for (const ball of [fast, metadataRim, metadataBoard, ceiling, floor]) {
  for (const hit of ball.contacts) {
    assert.ok(Math.abs(Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z) - 1) < 1e-8);
    assert.ok(Number.isFinite(hit.position.x + hit.position.y + hit.position.z + hit.impactSpeed + hit.time));
    assert.ok(hit.impactSpeed > 0);
  }
}

// Glass and steel borders are separate actual scene boxes. Both sides of
// either backboard reflect; an overlapping steel face must not also sound
// a second glass impact.
for (const targetHoop of [0, 1]) {
  for (const side of [-1, 1]) {
    const hoop = P.hoops[targetHoop];
    const glass = P.launch({ position: { x: 0, y: 3.6, z: hoop.boardZ + side * 0.55 }, speed: 0 });
    glass.velocity = { x: 0, y: 0, z: -side * 10 };
    const glassEvents = P.step(glass, 0.07);
    assert.equal(glassEvents.filter(type => type === 'board').length, 1);
    assert.equal(glassEvents.includes('frame'), false);
    assert.ok(glass.velocity.z * side > 0);
    assert.ok(Math.abs(Math.abs(glass.velocity.z) - 10 * 0.76 * Math.exp(-P.AIR_DRAG * 0.07)) < 1e-8);
    const glassHit = glass.contacts.find(hit => hit.type === 'board');
    assert.equal(glassHit.normal.z, side);
    assert.ok(Math.abs(glassHit.position.z - (hoop.boardZ + side * 0.0125)) < 1e-9);

    const metal = P.launch({ position: { x: 0.912, y: 3.6, z: hoop.boardZ + side * 0.55 }, speed: 0 });
    metal.velocity = { x: 0, y: 0, z: -side * 10 };
    const metalEvents = P.step(metal, 0.07);
    assert.equal(metalEvents.filter(type => type === 'frame').length, 1);
    assert.equal(metalEvents.includes('board'), false, 'Steel in front of glass produces one material contact');
    assert.equal(metal.frameContacts, 1);
    assert.equal(metal.boardContacts, 0);
    assert.ok(metal.velocity.z * side > 0);
    assert.ok(Math.abs(Math.abs(metal.velocity.z) - 10 * 0.65 * Math.exp(-P.AIR_DRAG * 0.07)) < 1e-8);
    const frameHit = metal.contacts.find(hit => hit.type === 'frame');
    assert.equal(frameHit.normal.z, side);
    assert.ok(Math.abs(frameHit.position.z - (hoop.boardZ + side * 0.0225)) < 1e-9);
    assert.ok(frameHit.impactSpeed > 9.9);
    insideRoom(metal);
  }
}

for (const sideX of [-1, 1]) {
  const outsideEdge = P.launch({ position: { x: sideX * 1.045, y: 3.6, z: P.hoops[0].boardZ + 0.55 }, speed: 0 });
  outsideEdge.velocity = { x: 0, y: 0, z: -10 };
  assert.ok(P.step(outsideEdge, 0.07).includes('frame'), 'The visible outer side frame cannot be bypassed');
  const hit = outsideEdge.contacts.find(contact => contact.type === 'frame');
  assert.ok(hit.normal.x * sideX > 0 && hit.normal.z > 0);
  assert.ok(Math.abs(Math.abs(hit.position.x) - 0.9295) < 1e-9);
  assert.ok(outsideEdge.velocity.x * sideX > 0, 'Rounded steel edge deflects the grazing sphere outward');
}

const topEdge = P.launch({ position: { x: 0, y: 4.205, z: P.hoops[0].boardZ + 0.55 }, speed: 0 });
topEdge.velocity = { x: 0, y: 0.5, z: -10 };
assert.ok(P.step(topEdge, 0.07).includes('frame'), 'Top steel edge extends above the glass collider');
const topHit = topEdge.contacts.find(hit => hit.type === 'frame');
assert.ok(topHit.normal.y > 0 && topHit.normal.z > 0);
assert.ok(Math.abs(topHit.position.y - 4.0995) < 1e-9);

const roundedMiss = P.launch({ position: { x: 1.035, y: 4.205, z: P.hoops[0].boardZ + 0.55 }, speed: 0 });
roundedMiss.velocity = { x: 0, y: 0.5, z: -10 };
const cornerMissEvents = P.step(roundedMiss, 0.09);
assert.equal(cornerMissEvents.includes('board') || cornerMissEvents.includes('frame'), false,
  'A sphere outside the rounded top corner must not hit an expanded cuboid');

const pad = P.launch({ position: { x: 0.5, y: 2.945, z: P.hoops[0].boardZ + 0.55 }, speed: 0 });
pad.velocity = { x: 0, y: 0, z: -10 };
assert.ok(P.step(pad, 0.07).includes('board'));
assert.ok(Math.abs(Math.abs(pad.velocity.z) - 10 * 0.60 * Math.exp(-P.AIR_DRAG * 0.07)) < 1e-8);
assert.ok(Math.abs(pad.contacts[0].position.z - (P.hoops[0].boardZ + 0.0325)) < 1e-9);

const fastFrame = P.launch({ position: { x: 0.912, y: 3.6, z: P.hoops[0].boardZ + 0.55 }, speed: 0 });
fastFrame.velocity = { x: 0, y: 0, z: -400 };
const fastFrameEvents = P.step(fastFrame, 0.006);
assert.ok(fastFrameEvents.includes('frame'), 'Swept steel collision catches a ball crossing the whole frame in one substep');
assert.equal(fastFrameEvents.includes('board'), false);
assert.ok(fastFrame.velocity.z > 0);
insideRoom(fastFrame);

console.log(`Physics checks passed: ${makes} indoor makes; regulation rim; front/back glass, separate metal frames and pad; rounded edges and fast sweeps; room containment; contact metadata and single scoring.`);
