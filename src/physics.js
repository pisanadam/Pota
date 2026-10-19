/* Pota: metre/second basketball simulation. No browser or rendering dependencies. */
(function (global) {
  'use strict';

  const G = 9.81;
  const BALL_RADIUS = 0.12;
  const RIM_RADIUS = 0.2465; // Centreline: 45.7 cm clear inside diameter.
  const RIM_TUBE_RADIUS = 0.018;
  const AIR_DRAG = 0.018; // Linear damping, s^-1; a small aerodynamic loss.
  const RELEASE_HEIGHT = 1.95;
  const CLEAR_RADIUS = RIM_RADIUS - RIM_TUBE_RADIUS - BALL_RADIUS;
  const MAX_STEP = 1 / 360;
  const AXES = ['x', 'y', 'z'];
  // Inner room faces, in metres. Ball-centre limits include its radius.
  const roomBounds = Object.freeze({
    minX: -11.94, maxX: 11.94, minZ: -17.94, maxZ: 17.94,
    floor: 0, ceiling: 8.89
  });
  const roomAxes = [
    { axis: 'x', min: roomBounds.minX + BALL_RADIUS, max: roomBounds.maxX - BALL_RADIUS },
    { axis: 'z', min: roomBounds.minZ + BALL_RADIUS, max: roomBounds.maxZ - BALL_RADIUS }
  ];
  const ceilingCentre = roomBounds.ceiling - BALL_RADIUS;
  const hoops = [
    { x: 0, y: 3.05, z: -12.35, boardZ: -12.75, front: 1 },
    { x: 0, y: 3.05, z: 12.35, boardZ: 12.75, front: -1 }
  ];
  function boardBox(type, x, y, z, width, height, depth, restitution, friction = 0.985) {
    return { type, restitution, friction,
      min: { x: x - width / 2, y: y - height / 2, z: z - depth / 2 },
      max: { x: x + width / 2, y: y + height / 2, z: z + depth / 2 } };
  }
  const boardParts = hoops.map(hoop => [
    boardBox('board', 0, 2.945, hoop.boardZ, 1.86, 0.10, 0.065, 0.60, 0.92),
    boardBox('frame', -0.912, 3.53, hoop.boardZ, 0.035, 1.105, 0.045, 0.65),
    boardBox('frame', 0.912, 3.53, hoop.boardZ, 0.035, 1.105, 0.045, 0.65),
    boardBox('frame', 0, 2.978, hoop.boardZ, 1.86, 0.035, 0.045, 0.65),
    boardBox('frame', 0, 4.082, hoop.boardZ, 1.86, 0.035, 0.045, 0.65),
    boardBox('board', 0, 3.53, hoop.boardZ, 1.81, 1.08, 0.025, 0.76)
  ]);

  const radians = value => value * Math.PI / 180;
  const clone = p => ({ x: p.x, y: p.y, z: p.z });
  const targetFor = value => typeof value === 'number' ? hoops[value] || hoops[0] : value || hoops[0];

  // At angle a, gravity must account for d*tan(a) - rise. With linear drag,
  // horizontal travel is v*cos(a)*A(t), A(t)=(1-exp(-k*t))/k. Solving the
  // resulting time equation avoids a speed estimate that ignores air loss.
  function speedFor(distance, angleDeg, releaseHeight, targetHeight) {
    const angle = radians(angleDeg);
    const gravityDrop = distance * Math.tan(angle) - (targetHeight - releaseHeight);
    if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(angle) ||
        angle <= 0 || angle >= Math.PI / 2 || gravityDrop <= 0) return null;
    const targetFall = gravityDrop * AIR_DRAG / G;
    const fall = t => t + Math.expm1(-AIR_DRAG * t) / AIR_DRAG;
    let low = 0;
    let high = Math.max(1, Math.sqrt(2 * gravityDrop / G) * 1.5);
    while (fall(high) < targetFall && high < 120) high *= 2;
    for (let i = 0; i < 60; i++) {
      const middle = (low + high) / 2;
      if (fall(middle) < targetFall) low = middle;
      else high = middle;
    }
    const flightTime = (low + high) / 2;
    const travelFactor = -Math.expm1(-AIR_DRAG * flightTime) / AIR_DRAG;
    const speed = distance / (Math.cos(angle) * travelFactor);
    return Number.isFinite(speed) ? speed : null;
  }

  function solveSpeed(distance, angleDeg, releaseHeight = RELEASE_HEIGHT) {
    return speedFor(distance, angleDeg, releaseHeight, hoops[0].y);
  }

  function idealSpeed(origin, target = 0, angleDeg = 52) {
    const hoop = targetFor(target);
    return speedFor(Math.hypot(hoop.x - origin.x, hoop.z - origin.z),
      angleDeg, origin.y, hoop.y);
  }

  // azimuthOffset is in degrees: positive rotates aim toward positive x
  // when looking toward the main hoop. Returned states remain mutable.
  function launch(options = {}) {
    const position = clone(options.position || { x: 0, y: RELEASE_HEIGHT, z: -5 });
    for (const limits of roomAxes) position[limits.axis] = Math.max(limits.min, Math.min(limits.max, position[limits.axis]));
    position.y = Math.max(roomBounds.floor + BALL_RADIUS, Math.min(ceilingCentre, position.y));
    const targetHoop = options.targetHoop === undefined ? 0 : options.targetHoop;
    const hoop = targetFor(targetHoop);
    const angleDeg = options.angleDeg === undefined ? 52 : options.angleDeg;
    const suggestedSpeed = idealSpeed(position, hoop, angleDeg);
    const speed = options.speed === undefined ? suggestedSpeed || 8 : Math.max(0, options.speed);
    const bearing = Math.atan2(hoop.x - position.x, hoop.z - position.z) - radians(options.azimuthOffset || 0);
    const angle = radians(angleDeg);
    const horizontalSpeed = speed * Math.cos(angle);
    const ball = {
      position,
      velocity: {
        x: Math.sin(bearing) * horizontalSpeed,
        y: Math.sin(angle) * speed,
        z: Math.cos(bearing) * horizontalSpeed
      },
      spin: { x: Math.cos(bearing) * 8, y: Math.max(-40, Math.min(40, Number.isFinite(options.sideSpin) ? options.sideSpin : 0)), z: -Math.sin(bearing) * 8 },
      sideSpin: Math.max(-40, Math.min(40, Number.isFinite(options.sideSpin) ? options.sideSpin : 0)),
      time: 0,
      resolved: false,
      scored: false,
      scoredHoop: null,
      targetHoop,
      firstFloorTime: null,
      floorContacts: 0,
      rimContacts: 0,
      boardContacts: 0,
      frameContacts: 0,
      wallContacts: 0,
      ceilingContacts: 0,
      contacts: [],
      _lastEvent: Object.create(null)
    };
    ball.drawingGuide = null;
    if (Array.isArray(options.drawnPath) && options.drawnPath.length >= 2 &&
        options.drawnPath.length <= 256 && options.drawnPath.every(p => p && ['x','y','z'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) < 1000))) {
      const points = options.drawnPath.map(clone), lengths = [0];
      for (let i=1;i<points.length;i++) lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y,points[i].z-points[i-1].z));
      const totalLength=lengths[lengths.length-1];
      if(totalLength>.08){
        ball.position=clone(points[0]);
        ball.drawingGuide={points,lengths,totalLength,duration:Math.max(.35,Math.min(3,Number.isFinite(options.drawnDuration)?options.drawnDuration:totalLength/7)),elapsed:0,active:true,reason:null};
      }
    }
    return ball;
  }

  function guideVelocity(ball, dt) {
    const guide=ball.drawingGuide;if(!guide||!guide.active)return;
    const next=Math.min(guide.duration,guide.elapsed+dt),distance=next/guide.duration*guide.totalLength;
    let i=1;while(i<guide.lengths.length-1&&guide.lengths[i]<distance)i++;
    const a=guide.points[i-1],b=guide.points[i],span=guide.lengths[i]-guide.lengths[i-1];
    const t=span>1e-10?(distance-guide.lengths[i-1])/span:1;
    const factor=-Math.expm1(-AIR_DRAG*dt)/AIR_DRAG;
    ball.velocity.x=(a.x+(b.x-a.x)*t-ball.position.x)/factor;
    ball.velocity.z=(a.z+(b.z-a.z)*t-ball.position.z)/factor;
    ball.velocity.y=(a.y+(b.y-a.y)*t-ball.position.y+G/AIR_DRAG*(dt-factor))/factor;
    guide.elapsed=next;
  }

  function addEvent(ball, events, event, cooldown = 0.08) {
    const previous = ball._lastEvent[event];
    if (previous === undefined || ball.time - previous >= cooldown) {
      events.push(event);
      ball._lastEvent[event] = ball.time;
      return true;
    }
    return false;
  }

  function contact(ball, events, type, normal, impactSpeed, cooldown = 0.08, position) {
    if (!addEvent(ball, events, type, cooldown)) return;
    ball.contacts.push({
      type,
      position: position ? clone(position) : {
        x: ball.position.x - normal.x * BALL_RADIUS,
        y: ball.position.y - normal.y * BALL_RADIUS,
        z: ball.position.z - normal.z * BALL_RADIUS
      },
      normal: clone(normal), impactSpeed, time: ball.time
    });
  }

  function normalImpact(velocity, normal) {
    return Math.max(0, -(velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z));
  }

  function bounce(velocity, normal, restitution, friction) {
    const dot = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
    if (dot >= 0) return false;
    const tangentX = velocity.x - dot * normal.x;
    const tangentY = velocity.y - dot * normal.y;
    const tangentZ = velocity.z - dot * normal.z;
    velocity.x = tangentX * friction - dot * restitution * normal.x;
    velocity.y = tangentY * friction - dot * restitution * normal.y;
    velocity.z = tangentZ * friction - dot * restitution * normal.z;
    return true;
  }

  function integrateFree(ball, dt) {
    const p = ball.position, v = ball.velocity;
    // Side-spin lift rotates horizontal velocity without manufacturing energy.
    // A conservative basketball Magnus approximation; the same solver drives
    // both the preview and the released shot.
    if (ball.sideSpin && ball.spin) {
      const angle = ball.spin.y * 0.006 * dt, c = Math.cos(angle), s = Math.sin(angle);
      const vx = v.x; v.x = vx * c + v.z * s; v.z = v.z * c - vx * s;
      ball.spin.y *= Math.exp(-0.12 * dt);
    }
    const decay = Math.exp(-AIR_DRAG * dt);
    const factor = -Math.expm1(-AIR_DRAG * dt) / AIR_DRAG;
    p.x += v.x * factor;
    p.z += v.z * factor;
    p.y += v.y * factor - G / AIR_DRAG * (dt - factor);
    v.x *= decay;
    v.z *= decay;
    v.y = v.y * decay - G * factor;
    ball.time += dt;
  }

  // Sweep to a room face, reflect at the exact impact time, then integrate
  // the remaining time. This keeps a fast ball inside even on a long frame,
  // handles simultaneous corner contacts, and preserves post-impact travel.
  function integrateRoom(ball, dt, events) {
    let remaining = dt;
    let collisions = 0;
    while (remaining > 1e-10 && collisions < 64) {
      const p = ball.position, v = ball.velocity;
      const travelFactor = -Math.expm1(-AIR_DRAG * remaining) / AIR_DRAG;
      let hit = null;
      for (const limits of roomAxes) {
        const axis = limits.axis;
        if (v[axis] === 0) continue;
        const boundary = v[axis] > 0 ? limits.max : limits.min;
        const factor = (boundary - p[axis]) / v[axis];
        if (factor < -1e-10 || factor > travelFactor + 1e-10) continue;
        const time = Math.max(0, -Math.log1p(-AIR_DRAG * Math.max(0, factor)) / AIR_DRAG);
        if (time <= remaining && (!hit || time < hit.time)) {
          const normal = { x: 0, y: 0, z: 0 };
          normal[axis] = v[axis] > 0 ? -1 : 1;
          hit = { type: 'wall', time, axis, boundary, normal, restitution: 0.65 };
        }
      }
      // Gravity and drag can only reduce upward travel from v.y * remaining.
      // Most substeps cannot reach the ceiling and need no apex/root search.
      if (v.y > 0 && p.y + v.y * remaining >= ceilingCentre - 1e-9) {
        const peakTime = Math.min(remaining, Math.log1p(v.y * AIR_DRAG / G) / AIR_DRAG);
        const heightAt = t => {
          const factor = -Math.expm1(-AIR_DRAG * t) / AIR_DRAG;
          return p.y + v.y * factor - G / AIR_DRAG * (t - factor);
        };
        if (heightAt(peakTime) >= ceilingCentre) {
          let low = 0, high = peakTime;
          for (let i = 0; i < 36; i++) {
            const middle = (low + high) / 2;
            if (heightAt(middle) >= ceilingCentre) high = middle;
            else low = middle;
          }
          const time = (low + high) / 2;
          if (!hit || time < hit.time) hit = {
            type: 'ceiling', time, axis: 'y', boundary: ceilingCentre,
            normal: { x: 0, y: -1, z: 0 }, restitution: 0.58
          };
        }
      }
      if (!hit) { integrateFree(ball, remaining); remaining = 0; break; }
      integrateFree(ball, hit.time);
      p[hit.axis] = hit.boundary;
      const impactSpeed = normalImpact(v, hit.normal);
      if (bounce(v, hit.normal, hit.restitution, 0.92)) {
        spinContact(ball, hit.normal, impactSpeed, 0.24);
        if (hit.type === 'wall') ball.wallContacts++;
        else ball.ceilingContacts++;
        contact(ball, events, hit.type, hit.normal, impactSpeed, 0.12);
      }
      remaining = Math.max(0, remaining - hit.time);
      collisions++;
    }
    // Defensive containment for caller-created extreme velocities or tiny
    // floating-point overshoots; normal gameplay resolves inside the loop.
    if (remaining > 0) integrateFree(ball, remaining);
    for (const limits of roomAxes) ball.position[limits.axis] = Math.max(limits.min, Math.min(limits.max, ball.position[limits.axis]));
    ball.position.y = Math.min(ceilingCentre, ball.position.y);
  }

  function rimCollision(ball, hoop, previous, events) {
    const p = ball.position;
    const contactRadius = BALL_RADIUS + RIM_TUBE_RADIUS;
    if (Math.abs(p.y - hoop.y) >= contactRadius ||
        Math.abs(p.x - hoop.x) > RIM_RADIUS + contactRadius ||
        Math.abs(p.z - hoop.z) > RIM_RADIUS + contactRadius) return;
    const dx = p.x - hoop.x;
    const dz = p.z - hoop.z;
    const radial = Math.hypot(dx, dz);
    if (radial < 1e-9) return;
    const nearest = {
      x: hoop.x + dx / radial * RIM_RADIUS,
      y: hoop.y,
      z: hoop.z + dz / radial * RIM_RADIUS
    };
    let nx = p.x - nearest.x;
    let ny = p.y - nearest.y;
    let nz = p.z - nearest.z;
    let distance = Math.hypot(nx, ny, nz);
    if (distance >= contactRadius) return;
    if (distance < 1e-8) {
      nx = previous.x - nearest.x;
      ny = previous.y - nearest.y;
      nz = previous.z - nearest.z;
      distance = Math.hypot(nx, ny, nz) || 1;
    }
    const normal = { x: nx / distance, y: ny / distance, z: nz / distance };
    p.x = nearest.x + normal.x * (contactRadius + 0.0001);
    p.y = nearest.y + normal.y * (contactRadius + 0.0001);
    p.z = nearest.z + normal.z * (contactRadius + 0.0001);
    const impactSpeed = normalImpact(ball.velocity, normal);
    if (bounce(ball.velocity, normal, 0.72, 0.985)) {
      spinContact(ball, normal, impactSpeed, 0.18);
      ball.rimContacts++;
      contact(ball, events, 'rim', normal, impactSpeed);
    }
  }

  // A swept sphere against an AABB has flat faces and genuinely rounded
  // edges/corners. Split the path at box planes; squared distance to the
  // nearest box point is quadratic within each interval, so its first root
  // is the physical contact rather than an expanded-box corner false hit.
  function sweepBox(previous, end, box) {
    const delta = { x: end.x - previous.x, y: end.y - previous.y, z: end.z - previous.z };
    const cuts = [0, 1];
    for (const axis of AXES) if (delta[axis] !== 0) {
      const entry = (box.min[axis] - previous[axis]) / delta[axis];
      const exit = (box.max[axis] - previous[axis]) / delta[axis];
      if (entry > 0 && entry < 1) cuts.push(entry);
      if (exit > 0 && exit < 1) cuts.push(exit);
    }
    cuts.sort((a, b) => a - b);
    let fraction = null;
    for (let i = 0; i < cuts.length - 1; i++) {
      const low = cuts[i], high = cuts[i + 1], middle = (low + high) / 2;
      let a = 0, b = 0, c = -BALL_RADIUS * BALL_RADIUS;
      for (const axis of AXES) {
        const value = previous[axis] + delta[axis] * middle;
        const edge = value < box.min[axis] ? box.min[axis] : value > box.max[axis] ? box.max[axis] : null;
        if (edge === null) continue;
        const offset = previous[axis] - edge;
        a += delta[axis] * delta[axis]; b += 2 * delta[axis] * offset; c += offset * offset;
      }
      if ((a * low + b) * low + c <= 1e-12) { fraction = low; break; }
      if (a < 1e-18) continue;
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) continue;
      const entry = (-b - Math.sqrt(discriminant)) / (2 * a);
      const exit = (-b + Math.sqrt(discriminant)) / (2 * a);
      if (entry <= high + 1e-10 && exit >= low - 1e-10) {
        fraction = Math.max(low, Math.min(high, entry)); break;
      }
    }
    if (fraction === null) return null;
    const centre = {}, nearest = {}, normal = {};
    for (const axis of AXES) {
      centre[axis] = previous[axis] + delta[axis] * fraction;
      nearest[axis] = Math.max(box.min[axis], Math.min(box.max[axis], centre[axis]));
      normal[axis] = centre[axis] - nearest[axis];
    }
    const length = Math.hypot(normal.x, normal.y, normal.z);
    if (length < 1e-9) return null;
    for (const axis of AXES) normal[axis] /= length;
    return { fraction, centre, nearest, normal, box };
  }

  function boardCollision(ball, hoopIndex, previous, events, dt) {
    const p = ball.position, boardZ = hoops[hoopIndex].boardZ;
    // Most shot substeps are far from a backboard. Reject a swept bounding
    // range before doing the precise rounded-edge intersections.
    if (Math.min(previous.x, p.x) > 1.05 || Math.max(previous.x, p.x) < -1.05 ||
        Math.min(previous.y, p.y) > 4.2195 || Math.max(previous.y, p.y) < 2.775 ||
        Math.min(previous.z, p.z) > boardZ + 0.1525 || Math.max(previous.z, p.z) < boardZ - 0.1525) return;
    let hit = null;
    for (const box of boardParts[hoopIndex]) {
      const candidate = sweepBox(previous, ball.position, box);
      if (!candidate || normalImpact(ball.velocity, candidate.normal) < 1e-8) continue;
      if (!hit || candidate.fraction < hit.fraction) hit = candidate;
    }
    if (!hit) return;
    const remaining = dt * (1 - hit.fraction);
    const decay = Math.exp(-AIR_DRAG * remaining);
    const factor = -Math.expm1(-AIR_DRAG * remaining) / AIR_DRAG;
    const v = ball.velocity;
    // Recover free-flight velocity at impact, reflect it there, and retain
    // gravity/drag during the rest of the substep.
    v.x /= decay; v.z /= decay; v.y = (v.y + G * factor) / decay;
    p.x = hit.centre.x + hit.normal.x * 0.000001;
    p.y = hit.centre.y + hit.normal.y * 0.000001;
    p.z = hit.centre.z + hit.normal.z * 0.000001;
    ball.time -= remaining;
    const impactSpeed = normalImpact(v, hit.normal);
    if (bounce(v, hit.normal, hit.box.restitution, hit.box.friction)) {
      spinContact(ball, hit.normal, impactSpeed, 0.28);
      if (hit.box.type === 'frame') ball.frameContacts++;
      else ball.boardContacts++;
      contact(ball, events, hit.box.type, hit.normal, impactSpeed, 0.08, hit.nearest);
    }
    integrateFree(ball, remaining);
  }

  function spinContact(ball, normal, impactSpeed, friction) {
    if (!ball.sideSpin || !ball.spin) return;
    const v=ball.velocity,w=ball.spin,r=BALL_RADIUS;
    // Surface velocity at the contact, including angular velocity. The
    // tangential impulse and equal torque use a thin-shell ball inertia.
    let x=v.x-r*(w.y*normal.z-w.z*normal.y);
    let y=v.y-r*(w.z*normal.x-w.x*normal.z);
    let z=v.z-r*(w.x*normal.y-w.y*normal.x);
    const dot=x*normal.x+y*normal.y+z*normal.z;
    x-=dot*normal.x;y-=dot*normal.y;z-=dot*normal.z;
    const slip=Math.hypot(x,y,z);if(slip<1e-8)return;
    const impulse=Math.min(slip/2.5,friction*impactSpeed);
    x*=impulse/slip;y*=impulse/slip;z*=impulse/slip;
    v.x-=x;v.y-=y;v.z-=z;
    w.x+=(normal.y*z-normal.z*y)*1.5/r;
    w.y+=(normal.z*x-normal.x*z)*1.5/r;
    w.z+=(normal.x*y-normal.y*x)*1.5/r;
  }

  function floorCollision(ball, dt, events) {
    const p = ball.position;
    const v = ball.velocity;
    if (p.y > BALL_RADIUS) return;
    p.y = BALL_RADIUS;
    const impact = -v.y;
    if (impact > 0) {
      if (ball.firstFloorTime === null) ball.firstFloorTime = ball.time;
      if (impact > 0.55) {
        ball.floorContacts++;
        contact(ball, events, 'floor', { x: 0, y: 1, z: 0 }, impact, 0.12);
      }
      v.y = impact > 0.45 ? impact * 0.74 : 0;
      v.x *= impact > 0.45 ? 0.88 : 1;
      v.z *= impact > 0.45 ? 0.88 : 1;
    }
    if (v.y < 0.15) {
      const friction = Math.exp(-1.8 * dt);
      v.x *= friction;
      v.z *= friction;
      if (Math.hypot(v.x, v.z) < 0.035) v.x = v.z = 0;
    }
  }

  function checkScore(ball, hoop, hoopIndex, previous, events) {
    if (ball.resolved || ball.scored || previous.y <= hoop.y || ball.position.y > hoop.y || ball.velocity.y >= 0) return;
    const fraction = (previous.y - hoop.y) / (previous.y - ball.position.y);
    const x = previous.x + (ball.position.x - previous.x) * fraction;
    const z = previous.z + (ball.position.z - previous.z) * fraction;
    if (Math.hypot(x - hoop.x, z - hoop.z) > CLEAR_RADIUS) return;
    ball.scored = true;
    ball.resolved = true;
    ball.scoredHoop = hoopIndex;
    events.push('score');
  }

  // Returns strings. Contact events may recur; score/miss are each emitted
  // at most once. Resolved balls can still be stepped for bounce animation.
  function step(ball, dt) {
    const events = [];
    ball.contacts = [];
    if (!Number.isFinite(dt) || dt <= 0) return events;
    const count = Math.max(1, Math.ceil(dt / MAX_STEP));
    const h = dt / count;
    // The previous position is consumed synchronously by collision checks;
    // one scratch object suffices for every substep in this call.
    const previous = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < count; i++) {
      const p = ball.position;
      const v = ball.velocity;
      previous.x = p.x; previous.y = p.y; previous.z = p.z;
      const contactCount=ball.floorContacts+ball.rimContacts+ball.boardContacts+ball.frameContacts+ball.wallContacts+ball.ceilingContacts;
      guideVelocity(ball,h);
      integrateRoom(ball, h, events);
      for (let j = 0; j < hoops.length; j++) {
        boardCollision(ball, j, previous, events, h);
        rimCollision(ball, hoops[j], previous, events);
      }
      for (let j = 0; j < hoops.length; j++) checkScore(ball, hoops[j], j, previous, events);
      floorCollision(ball, h, events);
      const guide=ball.drawingGuide;
      if(guide&&guide.active){
        const touched=ball.firstFloorTime!==null||contactCount!==ball.floorContacts+ball.rimContacts+ball.boardContacts+ball.frameContacts+ball.wallContacts+ball.ceilingContacts;
        if(touched||ball.scored||guide.elapsed>=guide.duration-1e-9){guide.active=false;guide.reason=touched?'contact':ball.scored?'score':'complete';}
      }
      if (!ball.resolved && (ball.time >= 6 ||
          (ball.firstFloorTime !== null && ball.time - ball.firstFloorTime > 0.5 &&
           p.y <= BALL_RADIUS + 0.01 && Math.hypot(v.x, v.y, v.z) < 0.6))) {
        ball.resolved = true;
        events.push('miss');
      }
    }
    return events;
  }

  // Includes actual drag, board/rim collisions, and scoring. Stops at the
  // first floor contact by default, suitable for an aiming arc.
  function trajectory(options, settings = {}) {
    const ball = launch(options);
    const dt = Math.max(1 / 240, settings.dt || 1 / 40);
    const maxTime = settings.maxTime === undefined ? 4 : settings.maxTime;
    const points = [{ ...clone(ball.position), t: 0 }];
    while (ball.time < maxTime) {
      step(ball, Math.min(dt, maxTime - ball.time));
      points.push({ ...clone(ball.position), t: ball.time });
      if (ball.firstFloorTime !== null && settings.stopAtFloor !== false) break;
    }
    return points;
  }

  global.HoopPhysics = Object.freeze({
    G, BALL_RADIUS, RIM_RADIUS, RIM_TUBE_RADIUS, AIR_DRAG, RELEASE_HEIGHT,
    CLEAR_RADIUS, roomBounds, hoops, solveSpeed, idealSpeed, launch, step, trajectory,
    // Alias retained for callers that prefer a descriptive verb.
    previewTrajectory: trajectory
  });
})(typeof window !== 'undefined' ? window : globalThis);
