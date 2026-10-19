/* POTA net: metre/kilogram/second XPBD rope cloth, independent of rendering.
 * A 12-loop, 41 cm braided-nylon net is approximated by 72 knots and 120 cords.
 * Assumptions: 110 g free net mass; 7 mm cord diameter; 0.32 sliding friction.
 * Visible cords resist tension only. Soft knot bending preserves the woven
 * shape without preventing diamonds from folding and the lower mouth opening.
 * No prerecorded ball path, score animation or artificial ball-speed cap.
 */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2, G = 9.81;
  const PARAMETERS = Object.freeze({ mass: 0.11, length: 0.41, cordRadius: 0.0035,
    ballMass: 0.62, friction: 0.32, compliance: 0.000035,
    knotCompliance: 0.025, airDamping: 1.65, iterations: 18, maxStep: 1 / 240 });
  // Steel links retain the same attachment points and 41 cm hanging length.
  // The 6.5 mm collision envelope contains the open oval links, not a solid
  // 13 mm wire. Hinged links bend freely while axial stretch stays very small.
  const MATERIALS = Object.freeze({ nylon: PARAMETERS, chain: Object.freeze({ ...PARAMETERS,
    mass: 0.56, cordRadius: 0.0065, friction: 0.38, compliance: 0.0000015,
    knotCompliance: 0.006, airDamping: 0.95 }) });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function create(options = {}) {
    let material = 'nylon', parameters = MATERIALS.nylon;
    const origin = Object.assign({ x: 0, y: 3.044, z: 0 }, options.origin);
    const sign = options.sign || -1, spokes = 12, levels = 6, particleCount = spokes * levels;
    const positions = new Float64Array(particleCount * 3), velocities = new Float64Array(positions.length);
    const before = new Float64Array(positions.length), inverseMass = new Float64Array(particleCount);
    const radius = [0.236, 0.222, 0.197, 0.16, 0.122, 0.085];
    const height = [0, -0.069, -0.151, -0.237, -0.323, -0.41];
    for (let level = 0; level < levels; level++) for (let i = 0; i < spokes; i++) {
      const k = (level * spokes + i) * 3, a = TAU * (i + (level & 1) * 0.5) / spokes;
      positions[k] = Math.cos(a) * radius[level]; positions[k + 1] = height[level]; positions[k + 2] = Math.sin(a) * radius[level];
    }
    const initial = positions.slice(), links = [], bends = [], nodeMass = new Float64Array(particleCount);
    const node = (level, i) => level * spokes + (i + spokes) % spokes;
    function link(a, b, list, compliance) {
      const ai = a * 3, bi = b * 3, length = Math.hypot(positions[bi] - positions[ai], positions[bi + 1] - positions[ai + 1], positions[bi + 2] - positions[ai + 2]);
      const edge = { a, b, rest: length, compliance, lambda: 0 };
      list.push(edge); return edge;
    }
    // Each adjacent staggered ring is joined by two diagonal cords. No
    // horizontal cross-bracing: the diamond apertures can fold freely.
    for (let level = 0; level < levels - 1; level++) for (let i = 0; i < spokes; i++) {
      link(node(level, i), node(level + 1, i), links, parameters.compliance);
      link(node(level, i), node(level + 1, i + (level & 1 ? 1 : -1)), links, parameters.compliance);
    }
    // The last row ends in scalloped diamond loops, as a woven basketball
    // net does. An undersized continuous bottom ring would trap the ball.
    // Low-stiffness flexural constraints model woven knots. They are about
    // 700 times softer than axial cord stretch, and do not make rigid panels.
    for (let level = 0; level < levels - 2; level++) for (let i = 0; i < spokes; i++) {
      link(node(level, i), node(level + 2, i), bends, parameters.knotCompliance);
    }
    let massWeight = 0;
    for (const edge of links) {
      if (edge.a >= spokes) nodeMass[edge.a] += edge.rest * 0.5;
      if (edge.b >= spokes) nodeMass[edge.b] += edge.rest * 0.5;
    }
    for (let i = spokes; i < particleCount; i++) massWeight += nodeMass[i];
    for (let i = spokes; i < particleCount; i++) { nodeMass[i] *= parameters.mass / massWeight; inverseMass[i] = 1 / nodeMass[i]; }
    const contactLambda = new Float64Array(links.length), touched = new Uint8Array(links.length);
    // Compliance and inverse-mass sums stay unchanged throughout the solver's
    // 18 iterations. Refresh them once per substep, retaining the exact XPBD
    // division (rather than replacing it with a rounded reciprocal).
    const linkScales = new Float64Array(links.length * 2), bendScales = new Float64Array(bends.length * 2);
    const contactT = new Float64Array(links.length), contactNormals = new Float64Array(links.length * 3);
    const contactClosing = new Float64Array(links.length);
    const audioState = { id: options.id || `net-${sign}`, position: { x: origin.x, y: origin.y - 0.23, z: origin.z },
      material, contactSpeed: 0, slipSpeed: 0, contactCount: 0, normalImpulse: 0, frictionWork: 0,
      tension: 0, motionEnergy: 0, frameDt: 0 };
    let centroidX = 0, centroidY = 0, centroidZ = 0, centroidWeight = 0, quietTime = 0, sleeping = false;
    let peakTension = 0, rest;

    function beginFrame() {
      touched.fill(0); audioState.contactSpeed = 0; audioState.slipSpeed = 0; audioState.contactCount = 0;
      audioState.normalImpulse = 0; audioState.frictionWork = 0; audioState.tension = 0; audioState.frameDt = 0;
      centroidX = centroidY = centroidZ = centroidWeight = peakTension = 0;
    }
    function prepareLengths(list, scales, dtSquared) {
      for (let e = 0; e < list.length; e++) {
        const edge = list[e], alpha = edge.compliance / dtSquared;
        scales[e * 2] = alpha;
        scales[e * 2 + 1] = inverseMass[edge.a] + inverseMass[edge.b] + alpha;
      }
    }
    function solveLengths(list, scales, tensionOnly) {
      const p = positions;
      for (let e = 0; e < list.length; e++) {
        const edge = list[e], ai = edge.a * 3, bi = edge.b * 3, wa = inverseMass[edge.a], wb = inverseMass[edge.b];
        if (!wa && !wb) continue;
        const dx = p[bi] - p[ai], dy = p[bi + 1] - p[ai + 1], dz = p[bi + 2] - p[ai + 2];
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length < 1e-9) continue;
        const alpha = scales[e * 2];
        let delta = (-(length - edge.rest) - alpha * edge.lambda) / scales[e * 2 + 1];
        if (tensionOnly) { const next = Math.min(0, edge.lambda + delta); delta = next - edge.lambda; edge.lambda = next; }
        else edge.lambda += delta;
        const scale = delta / length;
        p[ai] -= wa * dx * scale; p[ai + 1] -= wa * dy * scale; p[ai + 2] -= wa * dz * scale;
        p[bi] += wb * dx * scale; p[bi + 1] += wb * dy * scale; p[bi + 2] += wb * dz * scale;
      }
    }
    function resolveContacts(ball, dt, invBall, ballRadius) {
      const p = positions, bp = ball.position, safeRadius = ballRadius + parameters.cordRadius;
      for (let e = 0; e < links.length; e++) {
        const bx = bp.x - origin.x, by = bp.y - origin.y, bz = bp.z - origin.z;
        const edge = links[e], ai = edge.a * 3, bi = edge.b * 3, wa = inverseMass[edge.a], wb = inverseMass[edge.b];
        if (!wa && !wb) continue;
        const sx = p[bi] - p[ai], sy = p[bi + 1] - p[ai + 1], sz = p[bi + 2] - p[ai + 2];
        const l2 = sx * sx + sy * sy + sz * sz;
        const t = l2 > 1e-12 ? clamp(((bx - p[ai]) * sx + (by - p[ai + 1]) * sy + (bz - p[ai + 2]) * sz) / l2, 0, 1) : 0.5, u = 1 - t;
        let nx = p[ai] + t * sx - bx, ny = p[ai + 1] + t * sy - by, nz = p[ai + 2] + t * sz - bz;
        // A separating coordinate already proves this segment is outside the
        // sphere; retain the full norm when releasing a prior contact lambda.
        if (contactLambda[e] === 0 && (Math.abs(nx) >= safeRadius || Math.abs(ny) >= safeRadius || Math.abs(nz) >= safeRadius)) continue;
        const distance = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (distance >= safeRadius && contactLambda[e] === 0) continue;
        if (distance < 1e-10) { nx = Math.cos(e * 2.4); ny = 0; nz = Math.sin(e * 2.4); }
        else { nx /= distance; ny /= distance; nz /= distance; }
        const weight = wa * u * u + wb * t * t + invBall;
        // Hard nonpenetration, mass weighted, zero restitution for soft cord.
        const next = Math.max(0, contactLambda[e] + (safeRadius - distance) / weight);
        const delta = next - contactLambda[e]; contactLambda[e] = next;
        p[ai] += wa * u * nx * delta; p[ai + 1] += wa * u * ny * delta; p[ai + 2] += wa * u * nz * delta;
        p[bi] += wb * t * nx * delta; p[bi + 1] += wb * t * ny * delta; p[bi + 2] += wb * t * nz * delta;
        bp.x -= invBall * nx * delta; bp.y -= invBall * ny * delta; bp.z -= invBall * nz * delta;
        if (next <= 0) continue;
        contactT[e] = t; const ni = e * 3;
        contactNormals[ni] = nx; contactNormals[ni + 1] = ny; contactNormals[ni + 2] = nz;
        const vx = ball.velocity.x - (velocities[ai] * u + velocities[bi] * t);
        const vy = ball.velocity.y - (velocities[ai + 1] * u + velocities[bi + 1] * t);
        const vz = ball.velocity.z - (velocities[ai + 2] * u + velocities[bi + 2] * t);
        contactClosing[e] = Math.max(contactClosing[e], nx * vx + ny * vy + nz * vz, 0);
      }
    }
    // The rim and the front/lower board are static obstacles for flying
    // cloth too. Three interior cord samples prevent a long segment from
    // cutting through the steel while its end knots remain outside it.
    let staticDX = 0, staticDY = 0, staticDZ = 0;
    function staticCorrection(x, y, z) {
      staticDX = staticDY = staticDZ = 0;
      const dy = y - 0.006, clearance = 0.018 + parameters.cordRadius;
      // Most knots/cord samples hang well below the torus. Its vertical
      // interval rejects them without calculating two Euclidean norms.
      if (Math.abs(dy) < clearance) {
        const radial = Math.hypot(x, z), q = radial - 0.2465;
        const distance = Math.hypot(q, dy);
        if (distance < clearance && radial > 1e-9) {
          const normalR = distance > 1e-9 ? q / distance : 0;
          const normalY = distance > 1e-9 ? dy / distance : -1;
          const penetration = clearance - distance;
          staticDX = x / radial * normalR * penetration;
          staticDY = normalY * penetration;
          staticDZ = z / radial * normalR * penetration;
        }
      }
      // Both hoops face inward; a net remains on the court side of its board.
      // Include the padded lower edge which hangs below the glass panel.
      const back = sign * z, radius = parameters.cordRadius;
      const padFront = 0.3675 - radius, glassFront = 0.3875 - radius;
      if (Math.abs(x) < 0.93 + radius && y >= -0.149 - radius && y <= -0.049 + radius && back > padFront)
        staticDZ += sign * (padFront - back);
      else if (Math.abs(x) < 0.905 + radius && y >= -0.054 - radius && y <= 1.026 + radius && back > glassFront)
        staticDZ += sign * (glassFront - back);
    }
    function solveStaticContacts() {
      const p = positions;
      for (let i = spokes; i < particleCount; i++) {
        const k = i * 3;
        if (p[k + 1] < -0.16) continue;
        staticCorrection(p[k], p[k + 1], p[k + 2]);
        p[k] += staticDX; p[k + 1] += staticDY; p[k + 2] += staticDZ;
      }
      for (const edge of links) {
        const ai = edge.a * 3, bi = edge.b * 3;
        if (Math.max(p[ai + 1], p[bi + 1]) < -0.16) continue;
        const wa = inverseMass[edge.a], wb = inverseMass[edge.b];
        for (let sample = 1; sample <= 3; sample++) {
          const t = sample * 0.25, u = 1 - t;
          staticCorrection(p[ai] * u + p[bi] * t, p[ai + 1] * u + p[bi + 1] * t, p[ai + 2] * u + p[bi + 2] * t);
          if (staticDX === 0 && staticDY === 0 && staticDZ === 0) continue;
          const weight = wa * u * u + wb * t * t;
          const sa = wa * u / weight, sb = wb * t / weight;
          p[ai] += staticDX * sa; p[ai + 1] += staticDY * sa; p[ai + 2] += staticDZ * sa;
          p[bi] += staticDX * sb; p[bi + 1] += staticDY * sb; p[bi + 2] += staticDZ * sb;
        }
      }
    }
    function applyFriction(ball, dt, invBall, ballRadius) {
      const bp = ball.position, bv = ball.velocity, spin = ball.spin || { x: 0, y: 0, z: 0 };
      // Thin spherical shell inertia is closer to an inflated basketball than
      // the solid-sphere approximation. Angular momentum uses rad/s.
      const invInertia = 1.5 * invBall / (ballRadius * ballRadius);
      for (let e = 0; e < links.length; e++) {
        if (contactLambda[e] <= 1e-12) continue;
        const edge = links[e], ai = edge.a * 3, bi = edge.b * 3, t = contactT[e], u = 1 - t;
        const wa = inverseMass[edge.a], wb = inverseMass[edge.b], ni = e * 3;
        const nx = contactNormals[ni], ny = contactNormals[ni + 1], nz = contactNormals[ni + 2];
        const massInverse = wa * u * u + wb * t * t + invBall;
        let vx = bv.x - (velocities[ai] * u + velocities[bi] * t);
        let vy = bv.y - (velocities[ai + 1] * u + velocities[bi + 1] * t);
        let vz = bv.z - (velocities[ai + 2] * u + velocities[bi + 2] * t);
        const normalSpeed = vx * nx + vy * ny + vz * nz;
        const extraImpulse = Math.max(0, normalSpeed) / massInverse;
        const normalImpulse = contactLambda[e] / dt + extraImpulse;
        if (extraImpulse > 0) {
          bv.x -= nx * extraImpulse * invBall; bv.y -= ny * extraImpulse * invBall; bv.z -= nz * extraImpulse * invBall;
          velocities[ai] += nx * extraImpulse * wa * u; velocities[ai + 1] += ny * extraImpulse * wa * u; velocities[ai + 2] += nz * extraImpulse * wa * u;
          velocities[bi] += nx * extraImpulse * wb * t; velocities[bi + 1] += ny * extraImpulse * wb * t; velocities[bi + 2] += nz * extraImpulse * wb * t;
        }
        vx += (spin.y * nz - spin.z * ny) * ballRadius;
        vy += (spin.z * nx - spin.x * nz) * ballRadius;
        vz += (spin.x * ny - spin.y * nx) * ballRadius;
        const vn = vx * nx + vy * ny + vz * nz;
        let tx = vx - nx * vn, ty = vy - ny * vn, tz = vz - nz * vn;
        const slip = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (slip > 1e-8) {
          tx /= slip; ty /= slip; tz /= slip;
          const frictionMass = massInverse + ballRadius * ballRadius * invInertia;
          const impulse = Math.min(parameters.friction * normalImpulse, slip / frictionMass);
          bv.x -= tx * impulse * invBall; bv.y -= ty * impulse * invBall; bv.z -= tz * impulse * invBall;
          velocities[ai] += tx * impulse * wa * u; velocities[ai + 1] += ty * impulse * wa * u; velocities[ai + 2] += tz * impulse * wa * u;
          velocities[bi] += tx * impulse * wb * t; velocities[bi + 1] += ty * impulse * wb * t; velocities[bi + 2] += tz * impulse * wb * t;
          spin.x -= (ny * tz - nz * ty) * ballRadius * impulse * invInertia;
          spin.y -= (nz * tx - nx * tz) * ballRadius * impulse * invInertia;
          spin.z -= (nx * ty - ny * tx) * ballRadius * impulse * invInertia;
          audioState.frictionWork += Math.max(0, impulse * slip - 0.5 * impulse * impulse * frictionMass);
        }
        audioState.contactSpeed = Math.max(audioState.contactSpeed, contactClosing[e]);
        audioState.slipSpeed = Math.max(audioState.slipSpeed, slip); audioState.normalImpulse += normalImpulse;
        if (!touched[e]) { touched[e] = 1; audioState.contactCount++; }
        const cx = bp.x + nx * ballRadius, cy = bp.y + ny * ballRadius, cz = bp.z + nz * ballRadius;
        centroidX += cx * normalImpulse; centroidY += cy * normalImpulse; centroidZ += cz * normalImpulse; centroidWeight += normalImpulse;
      }
    }
    function substep(dt, ball) {
      audioState.frameDt += dt;
      const near = ball && ball.position && ball.velocity &&
        Math.abs(ball.position.x - origin.x) < 0.75 && Math.abs(ball.position.z - origin.z) < 0.75 &&
        ball.position.y - origin.y < 0.24 && ball.position.y - origin.y > -0.9;
      if (near) { sleeping = false; quietTime = 0; }
      if (sleeping) return;
      const p = positions, damp = Math.exp(-parameters.airDamping * dt);
      before.set(p);
      for (let i = spokes; i < particleCount; i++) {
        const k = i * 3;
        velocities[k] *= damp; velocities[k + 1] = (velocities[k + 1] - G * dt) * damp; velocities[k + 2] *= damp;
        p[k] += velocities[k] * dt; p[k + 1] += velocities[k + 1] * dt; p[k + 2] += velocities[k + 2] * dt;
      }
      for (const edge of links) edge.lambda = 0;
      for (const edge of bends) edge.lambda = 0;
      contactLambda.fill(0); contactClosing.fill(0);
      const dtSquared = dt * dt;
      prepareLengths(links, linkScales, dtSquared); prepareLengths(bends, bendScales, dtSquared);
      const invBall = near ? 1 / (ball.mass > 0 ? ball.mass : parameters.ballMass) : 0;
      const ballRadius = near ? ball.radius || 0.12 : 0.12;
      const bx = near ? ball.position.x : 0, by = near ? ball.position.y : 0, bz = near ? ball.position.z : 0;
      for (let iteration = 0; iteration < parameters.iterations; iteration++) {
        solveLengths(links, linkScales, true); solveLengths(bends, bendScales, false);
        if (near) resolveContacts(ball, dt, invBall, ballRadius);
        solveStaticContacts();
      }
      let energy = 0;
      for (let i = spokes; i < particleCount; i++) {
        const k = i * 3;
        velocities[k] = (p[k] - before[k]) / dt; velocities[k + 1] = (p[k + 1] - before[k + 1]) / dt; velocities[k + 2] = (p[k + 2] - before[k + 2]) / dt;
      }
      if (near) {
        ball.velocity.x += (ball.position.x - bx) / dt;
        ball.velocity.y += (ball.position.y - by) / dt;
        ball.velocity.z += (ball.position.z - bz) / dt;
        applyFriction(ball, dt, invBall, ballRadius);
      }
      for (let i = spokes * 3; i < velocities.length; i += 3) energy += velocities[i] ** 2 + velocities[i + 1] ** 2 + velocities[i + 2] ** 2;
      audioState.motionEnergy = energy * 0.5 / (particleCount - spokes);
      for (const edge of links) peakTension = Math.max(peakTension, -edge.lambda / (dt * dt));
      if (!near && audioState.motionEnergy < 0.000018) quietTime += dt; else quietTime = 0;
      if (quietTime > 0.6) { sleeping = true; velocities.fill(0); audioState.motionEnergy = 0; }
    }
    function step(dt, ball) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      // The game couples one P.step then one net step at 240 Hz. A standalone
      // caller may also relax the cloth with larger idle intervals safely.
      const count = Math.ceil(dt / parameters.maxStep), h = dt / count;
      for (let i = 0; i < count; i++) substep(h, ball);
    }
    function finishFrame() {
      audioState.tension = clamp(peakTension / 15, 0, 1);
      if (centroidWeight > 1e-12) {
        audioState.position.x = centroidX / centroidWeight; audioState.position.y = centroidY / centroidWeight; audioState.position.z = centroidZ / centroidWeight;
      } else {
        audioState.position.x = origin.x; audioState.position.y = origin.y - 0.25; audioState.position.z = origin.z;
      }
      return audioState;
    }
    function diagnostics() {
      let anchorError = 0, maxDisplacement = 0, maxStrain = 0, totalEnergy = 0;
      for (let i = 0; i < particleCount; i++) {
        const k = i * 3, d = Math.hypot(positions[k] - rest[k], positions[k + 1] - rest[k + 1], positions[k + 2] - rest[k + 2]);
        if (i < spokes) anchorError = Math.max(anchorError, d); else maxDisplacement = Math.max(maxDisplacement, d);
        totalEnergy += nodeMass[i] * 0.5 * (velocities[k] ** 2 + velocities[k + 1] ** 2 + velocities[k + 2] ** 2);
      }
      for (const edge of links) {
        const ai = edge.a * 3, bi = edge.b * 3;
        maxStrain = Math.max(maxStrain, Math.hypot(positions[bi] - positions[ai], positions[bi + 1] - positions[ai + 1], positions[bi + 2] - positions[ai + 2]) / edge.rest - 1);
      }
      return { sign, particleCount, anchoredParticles: spokes, springCount: links.length,
        contacts: audioState.contactCount, anchorError, maxDisplacement, maxStrain, totalEnergy, sleeping, mass: parameters.mass, material, cordRadius: parameters.cordRadius };
    }
    function settle() {
      // Material purchases happen with the menu open. Start the new material
      // in its own gravity equilibrium without borrowing the previous motion
      // or producing contact impulses and phantom changeover sounds.
      positions.set(initial); velocities.fill(0); sleeping = false; quietTime = 0;
      for (const edge of links) { edge.compliance = parameters.compliance; edge.lambda = 0; }
      for (const edge of bends) { edge.compliance = parameters.knotCompliance; edge.lambda = 0; }
      for (let i = 0; i < 720; i++) substep(parameters.maxStep, null);
      velocities.fill(0); sleeping = true; quietTime = 1;
      if (rest) rest.set(positions); else rest = positions.slice();
      audioState.motionEnergy = 0; beginFrame(); finishFrame();
    }
    function setMaterial(next) {
      if (!Object.prototype.hasOwnProperty.call(MATERIALS, next)) return false;
      if (next === material) return true;
      const massRatio = MATERIALS[next].mass / parameters.mass;
      material = next; parameters = MATERIALS[next]; audioState.material = material;
      for (let i = spokes; i < particleCount; i++) {
        nodeMass[i] *= massRatio; inverseMass[i] = 1 / nodeMass[i];
      }
      settle(); return true;
    }
    // Begin in gravity equilibrium; a newly loaded court does not visibly
    // drop its nets or generate a phantom cloth sound.
    settle();
    if (options.material) setMaterial(options.material);
    return { origin, sign, spokes, particleCount, positions, velocities, rest, initial,
      inverseMass, links, bends, audioState, beginFrame, step, finishFrame, diagnostics, setMaterial };
  }
  global.PotaNetPhysics = Object.freeze({ create, parameters: PARAMETERS, materials: MATERIALS });
})(typeof window !== 'undefined' ? window : globalThis);
