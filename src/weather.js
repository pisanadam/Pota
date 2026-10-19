/* POTA — bounded, world-space procedural weather. No images, physics, or screen overlay. */
(function () {
  'use strict';
  const T = window.THREE;
  const ENVIRONMENTS = {
    gym: { mode: 'motes', kind: 0, count: 52, color: 0xbcb9aa, fall: 0.035, wind: 0.035 },
    'sunset-gym': { mode: 'motes', kind: 0, count: 72, color: 0xffd4a0, fall: 0.03, wind: 0.045 },
    'night-gym': { mode: 'motes', kind: 0, count: 38, color: 0xaac8dc, fall: 0.028, wind: 0.025 },
    'neon-arena': { mode: 'motes', kind: 0, count: 38, color: 0xa5bcd4, fall: 0.03, wind: 0.025 },
    'royal-arena': { mode: 'motes', kind: 0, count: 48, color: 0xe4c68c, fall: 0.032, wind: 0.03 },
    'street-court': { mode: 'rain', kind: 1, count: 1800, color: 0xabc4ce, fall: 10.8, wind: 1.1 },
    'midnight-court': { mode: 'rain', kind: 1, count: 1900, color: 0x8cbbdc, fall: 11.5, wind: 1.45 },
    'coastal-court': { mode: 'drizzle', kind: 1, count: 1350, color: 0xb9dadb, fall: 7.8, wind: 3.5 },
    'desert-court': { mode: 'sandstorm', kind: 3, count: 2200, color: 0xd5a363, fall: 0.27, wind: 5.8 },
    'alpine-court': { mode: 'snow', kind: 2, count: 1600, color: 0xe4eef1, fall: 0.68, wind: 0.68 }
  };
  const QUALITY = { auto: 0.5, balanced: 0.4, high: 0.7, ultra: 1 };
  const CAPACITY = 2200, HAZE_CAPACITY = 36, SPLASH_CAPACITY = 72;
  window.createPotaWeather = function createPotaWeather(options) {
    if (!T || !options || !options.scene || !options.camera) throw new Error('Weather requires THREE, scene and camera');
    const scene = options.scene, camera = options.camera, renderer = options.renderer;
    const group = new T.Group(); group.name = 'environment-weather'; scene.add(group);
    let environment = 'gym', quality = 'auto', preset = ENVIRONMENTS.gym, active = 0, hazeCount = 0, splashCount = 0;
    let elapsed = 0, disposed = false, windX = 0, windZ = 0, serial = 817321;
    const position = new Float32Array(CAPACITY * 3), seeds = new Float32Array(CAPACITY * 4);
    // The seed phases never change. Cache their trigonometry once, then use
    // angle addition with frame-wide sine/cosine values for identical flutter.
    const phaseSin = new Float64Array(CAPACITY), phaseCos = new Float64Array(CAPACITY), particleSpeed = new Float64Array(CAPACITY);
    const hazePositions = new Float32Array(HAZE_CAPACITY * 3), hazeSeeds = new Float32Array(HAZE_CAPACITY * 4);
    const splashPositions = new Float32Array(SPLASH_CAPACITY * 3), splashSeeds = new Float32Array(SPLASH_CAPACITY * 4);
    const color = new T.Color();
    function random() { serial = (Math.imul(serial, 1664525) + 1013904223) >>> 0; return serial / 4294967296; }
    for (let i = 0; i < seeds.length; i++) seeds[i] = random();
    for (let i = 0; i < hazeSeeds.length; i++) hazeSeeds[i] = random();
    for (let i = 0; i < splashSeeds.length; i++) splashSeeds[i] = random();
    for (let i = 0; i < CAPACITY; i++) {
      const k = i * 4, phase = seeds[k + 2] * Math.PI * 2;
      phaseSin[i] = Math.sin(phase); phaseCos[i] = Math.cos(phase); particleSpeed[i] = 0.72 + seeds[k + 1] * 0.56;
    }
    // Three clears updateRanges after each upload. Reuse the same range record
    // and retain the largest pending prefix if multiple updates precede a draw.
    function dirtyPositions(attribute, range, count) {
      if (!count) return;
      if (!attribute.updateRanges.length) { range.count = count; attribute.updateRanges.push(range); }
      else range.count = Math.max(range.count, count);
      attribute.needsUpdate = true;
    }
    function geometry(positions, attributes, capacity) {
      const g = new T.InstancedBufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
      g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.setAttribute('aCenter', new T.InstancedBufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
      g.setAttribute('aSeed', new T.InstancedBufferAttribute(attributes, 4));
      g.instanceCount = capacity; return g;
    }
    const sharedUniforms = {
      uTime: { value: 0 }, uKind: { value: 0 }, uWind: { value: new T.Vector2() }, uFall: { value: 0 },
      uColor: { value: color }, uOpacity: { value: 0.13 }, uCamera: { value: camera.position }
    };
    const mainGeometry = geometry(position, seeds, CAPACITY);
    const mainCenters = mainGeometry.attributes.aCenter, mainRange = { start: 0, count: 0 };
    const mainMaterial = new T.ShaderMaterial({
      transparent: true, depthTest: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true, uniforms: sharedUniforms,
      vertexShader: `
        attribute vec3 aCenter; attribute vec4 aSeed;
        uniform float uTime; uniform float uKind; uniform vec2 uWind; uniform float uFall; uniform vec3 uCamera;
        varying vec2 vUv; varying float vAlpha; varying float vAngle;
        void main() {
          vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
          float size = mix(0.024, 0.065, aSeed.x);
          vec2 q = position.xy;
          if (uKind > 0.5 && uKind < 1.5) {
            vec2 direction = (modelViewMatrix * vec4(uWind.x, -uFall, uWind.y, 0.0)).xy;
            direction /= max(length(direction), 0.001);
            vec2 side = vec2(-direction.y, direction.x);
            mv.xy += side * q.x * mix(0.010, 0.020, aSeed.x) + direction * q.y * mix(0.21, 0.48, aSeed.y);
          } else {
            if (uKind > 1.5 && uKind < 2.5) size = mix(0.045, 0.105, aSeed.x);
            if (uKind > 2.5) size = mix(0.014, 0.045, aSeed.x);
            float a = aSeed.z * 6.283185 + uTime * (aSeed.w - 0.5) * 1.8;
            float c = cos(a), s = sin(a);
            mv.xy += mat2(c, -s, s, c) * q * size;
          }
          float distanceToCamera = distance(aCenter, uCamera);
          vAlpha = smoothstep(0.75, 1.75, distanceToCamera) * (1.0 - smoothstep(30.0, 43.0, distanceToCamera));
          vAlpha *= mix(0.45, 1.0, aSeed.w);
          if (uKind > 1.5 && uKind < 2.5) vAlpha *= 0.68 + 0.32 * abs(sin(uTime * 0.85 + aSeed.z * 6.283185));
          vUv = uv; vAngle = aSeed.z * 6.283185; gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uKind; uniform vec3 uColor; uniform float uOpacity;
        varying vec2 vUv; varying float vAlpha; varying float vAngle;
        void main() {
          vec2 p = vUv * 2.0 - 1.0; float r = length(p); float shape;
          if (uKind > 0.5 && uKind < 1.5) {
            shape = (1.0 - smoothstep(0.08, 0.93, abs(p.x))) * (1.0 - smoothstep(0.45, 1.0, abs(p.y)));
          } else if (uKind > 1.5 && uKind < 2.5) {
            float arm = min(abs(p.x), min(abs(p.x * 0.5 + p.y * 0.866025), abs(p.x * 0.5 - p.y * 0.866025)));
            float crystal = exp(-190.0 * arm * arm) * (1.0 - smoothstep(0.64, 0.91, r));
            shape = max(crystal * 0.85, exp(-7.0 * r * r) * 0.45);
          } else if (uKind > 2.5) {
            shape = (1.0 - smoothstep(0.35, 0.9, abs(p.x) + abs(p.y) * 0.8));
          } else shape = exp(-7.0 * r * r) * (1.0 - smoothstep(0.6, 1.0, r));
          float alpha = shape * vAlpha * uOpacity; if (alpha < 0.003) discard;
          gl_FragColor = vec4(uColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    const main = new T.Mesh(mainGeometry, mainMaterial); main.name = 'weather-grains-precipitation'; main.frustumCulled = false; group.add(main);
    const hazeGeometry = geometry(hazePositions, hazeSeeds, HAZE_CAPACITY);
    const hazeCenters = hazeGeometry.attributes.aCenter, hazeRange = { start: 0, count: 0 };
    const hazeUniforms = { uTime: sharedUniforms.uTime, uColor: { value: new T.Color() }, uOpacity: { value: 0.025 }, uCamera: sharedUniforms.uCamera };
    const hazeMaterial = new T.ShaderMaterial({
      transparent: true, depthTest: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true, uniforms: hazeUniforms,
      vertexShader: `attribute vec3 aCenter; attribute vec4 aSeed; uniform float uTime; uniform vec3 uCamera; varying vec2 vUv; varying float vAlpha;
        void main() { vec4 mv = modelViewMatrix * vec4(aCenter,1.0); float angle = aSeed.z * 6.283185 + uTime * 0.035;
        float c = cos(angle), s = sin(angle); vec2 p = mat2(c,-s,s,c) * position.xy;
        mv.xy += p * mix(2.0,4.5,aSeed.x); vUv = uv; float d = distance(aCenter,uCamera);
        vAlpha = smoothstep(2.0,5.0,d) * (1.0-smoothstep(29.0,40.0,d)) * (0.55+0.45*sin(uTime*0.3+aSeed.w*6.283185));
        gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying float vAlpha;
        void main(){ vec2 p = vUv*2.0-1.0; float r = dot(p,p); float alpha = exp(-3.8*r)*(1.0-smoothstep(0.6,1.0,r))*uOpacity*vAlpha;
        if(alpha<0.001) discard; gl_FragColor=vec4(uColor,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`
    });
    const haze = new T.Mesh(hazeGeometry, hazeMaterial); haze.name = 'weather-soft-world-haze'; haze.frustumCulled = false; group.add(haze);
    const splashGeometry = geometry(splashPositions, splashSeeds, SPLASH_CAPACITY);
    const splashCenters = splashGeometry.attributes.aCenter, splashRange = { start: 0, count: 0 };
    const splashUniforms = { uTime: sharedUniforms.uTime, uColor: sharedUniforms.uColor, uCamera: sharedUniforms.uCamera };
    const splashMaterial = new T.ShaderMaterial({
      transparent: true, depthTest: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true, uniforms: splashUniforms,
      vertexShader: `attribute vec3 aCenter; attribute vec4 aSeed; uniform float uTime; uniform vec3 uCamera; varying vec2 vUv; varying float vLife; varying float vFade;
        void main(){ float life = fract(uTime * mix(1.8,3.1,aSeed.y) + aSeed.z); float size = mix(0.02,0.19,life);
        vec3 p = aCenter + vec3(position.x*size,0.018,position.y*size); vUv=uv; vLife=life;
        float d=distance(aCenter,uCamera); vFade=smoothstep(0.9,2.0,d)*(1.0-smoothstep(22.0,33.0,d)); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying vec2 vUv; varying float vLife; varying float vFade;
        void main(){ float r=length(vUv*2.0-1.0); float ring=exp(-110.0*(r-0.7)*(r-0.7)); float alpha=ring*(1.0-vLife)*vFade*0.27;
        if(alpha<0.004) discard; gl_FragColor=vec4(uColor,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`
    });
    const splashes = new T.Mesh(splashGeometry, splashMaterial); splashes.name = 'weather-ground-splash-rings'; splashes.frustumCulled = false; group.add(splashes);
    function resetPositions() {
      for (let i = 0; i < CAPACITY; i++) {
        const j = i * 3; position[j] = random() * 23.2 - 11.6; position[j + 2] = random() * 35.2 - 17.6;
        position[j + 1] = preset.kind === 3 ? Math.pow(random(), 1.8) * 6.5 + 0.12 : random() * (preset.kind === 0 ? 7.5 : 11.5) + 0.15;
      }
      for (let i = 0; i < HAZE_CAPACITY; i++) { const j = i * 3; hazePositions[j] = random()*25-12.5; hazePositions[j+1] = random()*2.6+0.25; hazePositions[j+2] = random()*37-18.5; }
      for (let i = 0; i < SPLASH_CAPACITY; i++) { const j = i * 3; splashPositions[j] = random()*22.5-11.25; splashPositions[j+1] = 0.012; splashPositions[j+2] = random()*34.5-17.25; }
      dirtyPositions(mainCenters, mainRange, position.length);
      dirtyPositions(hazeCenters, hazeRange, hazePositions.length);
      dirtyPositions(splashCenters, splashRange, splashPositions.length);
    }
    function applyCounts() {
      active = Math.ceil(preset.count * QUALITY[quality]);
      hazeCount = preset.kind === 3 ? Math.ceil(HAZE_CAPACITY * QUALITY[quality]) : environment === 'coastal-court' ? Math.ceil(14 * QUALITY[quality]) : 0;
      splashCount = preset.kind === 1 ? Math.ceil(SPLASH_CAPACITY * QUALITY[quality]) : 0;
      mainGeometry.instanceCount = active; hazeGeometry.instanceCount = hazeCount; splashGeometry.instanceCount = splashCount;
      main.visible = active > 0; haze.visible = hazeCount > 0; splashes.visible = splashCount > 0;
    }
    function setEnvironment(id) {
      if (disposed || !Object.prototype.hasOwnProperty.call(ENVIRONMENTS, id)) return false;
      if (environment === id && active) return true;
      environment = id; preset = ENVIRONMENTS[id]; color.setHex(preset.color);
      sharedUniforms.uKind.value = preset.kind; sharedUniforms.uFall.value = preset.fall;
      sharedUniforms.uOpacity.value = preset.kind === 0 ? 0.11 : preset.kind === 1 ? 0.32 : preset.kind === 2 ? 0.79 : 0.65;
      hazeUniforms.uColor.value.setHex(preset.kind === 3 ? 0xc89c66 : 0xb6d2d0); hazeUniforms.uOpacity.value = preset.kind === 3 ? 0.052 : 0.021;
      resetPositions(); applyCounts(); return true;
    }
    function setQuality(id) {
      if (disposed || !Object.prototype.hasOwnProperty.call(QUALITY, id)) return false;
      const oldActive = active, oldHaze = hazeCount;
      quality = id; applyCounts();
      // Newly revealed particles may have last been uploaded in another quality.
      if (active > oldActive) dirtyPositions(mainCenters, mainRange, active * 3);
      if (hazeCount > oldHaze) dirtyPositions(hazeCenters, hazeRange, hazeCount * 3);
      return true;
    }
    function update(dt, time) {
      if (disposed) return;
      dt = Number.isFinite(dt) ? Math.min(0.06, Math.max(0, dt)) : 0;
      elapsed = Number.isFinite(time) ? time : elapsed + dt;
      sharedUniforms.uTime.value = elapsed;
      const gust = 0.77 + 0.19 * Math.sin(elapsed * 0.34) + 0.15 * Math.sin(elapsed * 0.137 + 1.1);
      const direction = -0.48 + Math.sin(elapsed * 0.115) * 0.24;
      windX = Math.cos(direction) * preset.wind * gust; windZ = Math.sin(direction) * preset.wind * gust;
      sharedUniforms.uWind.value.set(windX, windZ);
      // Time uniforms still advance at dt=0, but unchanged centers need no CPU
      // integration or GPU upload (for example when rendering a paused frame).
      if (!dt) return;
      const kind = preset.kind, flutter = kind === 2 ? 0.24 : kind === 3 ? 0.12 : kind === 0 ? 0.024 : 0;
      const sineX = flutter ? Math.sin(elapsed * 1.2) : 0, cosineX = flutter ? Math.cos(elapsed * 1.2) : 0;
      const sineZ = flutter ? Math.sin(elapsed * 0.9) : 0, cosineZ = flutter ? Math.cos(elapsed * 0.9) : 0;
      const sineLift = kind === 3 ? Math.sin(elapsed * 0.7) : 0, cosineLift = kind === 3 ? Math.cos(elapsed * 0.7) : 0;
      for (let i = 0; i < active; i++) {
        const j = i * 3, speed = particleSpeed[i];
        let driftX = windX * speed, driftZ = windZ * speed;
        if (flutter) {
          driftX += (sineX * phaseCos[i] + cosineX * phaseSin[i]) * flutter;
          driftZ += (cosineZ * phaseCos[i] - sineZ * phaseSin[i]) * flutter;
        }
        position[j] += driftX * dt;
        position[j + 2] += driftZ * dt;
        position[j + 1] -= preset.fall * speed * dt;
        if (kind === 3) position[j+1] += (sineLift * phaseCos[i] + cosineLift * phaseSin[i])*0.38*dt;
        if (position[j] > 11.6) position[j] -= 23.2; else if (position[j] < -11.6) position[j] += 23.2;
        if (position[j + 2] > 17.6) position[j + 2] -= 35.2; else if (position[j + 2] < -17.6) position[j + 2] += 35.2;
        if (position[j + 1] < 0.06) { position[j + 1] = kind === 3 ? 0.4 + seeds[i*4]*3.2 : kind === 0 ? 7.7 : 11.5; }
      }
      for (let i = 0; i < hazeCount; i++) {
        const j=i*3; hazePositions[j] += windX*0.48*dt; hazePositions[j+2] += windZ*0.48*dt;
        if(hazePositions[j]>13) hazePositions[j]-=26; else if(hazePositions[j]<-13) hazePositions[j]+=26;
        if(hazePositions[j+2]>19) hazePositions[j+2]-=38; else if(hazePositions[j+2]<-19) hazePositions[j+2]+=38;
      }
      dirtyPositions(mainCenters, mainRange, active * 3);
      if(hazeCount) dirtyPositions(hazeCenters, hazeRange, hazeCount * 3);
    }
    function getDiagnostics() {
      let finite = true; for (let i = 0; i < active * 3; i++) if (!Number.isFinite(position[i])) { finite = false; break; }
      return { environment, quality, mode: preset.mode, capacity: CAPACITY, activeParticles: active, count: active, hazeCount, splashCount,
        hazeCapacity: HAZE_CAPACITY, splashCapacity: SPLASH_CAPACITY, wind: { x: windX, z: windZ }, finite, disposed,
        bufferUUID: mainGeometry.uuid, materialUUID: mainMaterial.uuid, drawCalls: (active ? 1 : 0) + (hazeCount ? 1 : 0) + (splashCount ? 1 : 0),
        worldSpace: true, depthTest: true, depthWrite: false, bounds: { x: 11.6, z: 17.6, height: preset.kind === 0 ? 7.7 : 11.5 } };
    }
    function dispose() {
      if(disposed) return; disposed=true; group.removeFromParent();
      mainGeometry.dispose(); hazeGeometry.dispose(); splashGeometry.dispose(); mainMaterial.dispose(); hazeMaterial.dispose(); splashMaterial.dispose();
    }
    setEnvironment('gym'); update(0, 0);
    return { setEnvironment, setQuality, update, getDiagnostics, dispose };
  };
}());
