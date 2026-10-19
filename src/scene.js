/* POTA — a fully procedural, indoor regulation basketball court. */
(function () {
  'use strict';
  const T = window.THREE;
  if (!T) throw new Error('THREE is required before scene.js');

  window.createCourtScene = function createCourtScene(options) {
    const canvas = options.canvas;
    const scene = new T.Scene();
    scene.background = new T.Color(0xb6afa2);
    scene.fog = new T.Fog(0xb6afa2, 29, 62);
    const camera = new T.PerspectiveCamera(58, 1, 0.065, 85);
    camera.position.set(0, 1.7, -4.2);
    camera.lookAt(0, 3.05, -12.35);
    // Do not allocate a full device-sized multisampled backbuffer before the
    // automatic controller has measured the device. HDR uses its own AA pass.
    const rendererOptions = { canvas, antialias: false, alpha: false, powerPreference: 'default', stencil: false };
    let renderer;
    try { renderer = new T.WebGLRenderer(rendererOptions); }
    catch (firstError) {
      // A browser can reject its preferred context while still exposing a
      // usable WebGL 1 context (notably older Android WebViews).
      let context = null;
      try { context = canvas.getContext('webgl', rendererOptions) || canvas.getContext('experimental-webgl', rendererOptions); } catch (_) {}
      if (!context) throw firstError;
      renderer = new T.WebGLRenderer(Object.assign({}, rendererOptions, {context}));
    }
    // The graphics controller applies the saved resolution before the first frame.
    renderer.setPixelRatio(1);
    renderer.setSize(1, 1, false);
    if (!renderer.capabilities.isWebGL2) {
      const gl = renderer.getContext();
      // Knots, chains and weather need instancing; PBR bump/roughness needs
      // derivatives. Let the host select its lightweight canvas fallback if a
      // real WebGL 1 driver lacks these, rather than leave a black play field.
      if (typeof gl.drawElements === 'function' && (!renderer.extensions.has('ANGLE_instanced_arrays') || !renderer.extensions.has('OES_standard_derivatives'))) {
        renderer.dispose();
        throw new Error('This WebGL 1 driver needs the lightweight canvas renderer');
      }
    }
    const sideTargetLimit = (() => {
      const limits = [renderer.capabilities.maxTextureSize, 4096];
      try {
        const gl = renderer.getContext();
        limits.push(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      } catch (_) {}
      return Math.max(1, Math.floor(Math.min(...limits.filter(value => Number.isFinite(value) && value > 0))));
    })();
    renderer.potaHDRSupported = !!(renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float'));
    if (renderer.potaHDRSupported) {
      let probe = null;
      try {
        const gl = renderer.getContext();
        if (gl.checkFramebufferStatus) {
          probe = new T.WebGLRenderTarget(1, 1, {type:T.HalfFloatType,depthBuffer:true,stencilBuffer:false});
          renderer.setRenderTarget(probe);
          renderer.potaHDRSupported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        }
      } catch (_) { renderer.potaHDRSupported = false; }
      finally { if (probe) { renderer.setRenderTarget(null); probe.dispose(); } }
    }
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    // The world owns one matrix sync per displayed frame. Reflection passes
    // reuse it instead of traversing the entire court a second and third time.
    scene.matrixWorldAutoUpdate = false;
    scene.matrixAutoUpdate = false;
    scene.updateMatrix();
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    const mats = {};
    const material = (name, settings) => mats[name] || (mats[name] = new T.MeshStandardMaterial(settings));
    const ivory = material('ivory', { color: 0xf7f0df, roughness: 0.52, metalness: 0 });
    const black = material('black', { color: 0x24282a, roughness: 0.67, metalness: 0.18 });
    const steel = material('steel', { color: 0x959993, roughness: 0.29, metalness: 0.78 });
    const timber = material('timber', { color: 0x92744f, roughness: 0.57 });
    const wallMat = material('wall', { color: 0xc1beb4, roughness: 0.95 });
    const padMat = material('pad', { color: 0x3c4545, roughness: 0.88 });
    const ceilingMat = material('ceiling', { color: 0xa9ada7, roughness: 0.87, emissive: 0x6b706c, emissiveIntensity: 0.22 });
    const beamMat = material('beam', { color: 0x6a726f, roughness: 0.68, metalness: 0.28 });
    const meshes = [];
    const staticBatchStats = {sourceMeshes:0,batches:0,sourceTriangles:0};
    function freezeStaticTransforms(group) {
      group.traverse(object => { object.updateMatrix(); object.matrixAutoUpdate = false; });
    }
    function batchStaticGeometry(group) {
      // Merge only immutable opaque siblings with the same material and shadow
      // flags. UVs, smooth normals and every bevel vertex remain unchanged.
      // Each buffer stays below 65536 vertices, so it also works on WebGL 1
      // without the optional 32-bit element-index extension.
      const buckets = new Map(), removed = new Set();
      for (const mesh of group.children.slice()) {
        const g = mesh.geometry;
        if (!mesh.isMesh || mesh.isInstancedMesh || !g || Array.isArray(mesh.material) || mesh.material.transparent ||
            !g.attributes.position || !g.attributes.normal || !g.attributes.uv || g.attributes.position.count > 60000) continue;
        const key = `${mesh.material.id}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(mesh);
      }
      for (const siblings of buckets.values()) {
        if (siblings.length < 2) continue;
        let batch = [], count = 0;
        const flush = () => {
          if (batch.length < 2) { batch = []; count = 0; return; }
          const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uv = new Float32Array(count * 2);
          let indexCount = 0;
          for (const mesh of batch) indexCount += mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count;
          const indices = new Uint16Array(indexCount), normalMatrix = new T.Matrix3(), p = new T.Vector3(), n = new T.Vector3();
          let offset = 0, indexOffset = 0;
          for (const mesh of batch) {
            mesh.updateMatrix(); normalMatrix.getNormalMatrix(mesh.matrix);
            const g = mesh.geometry, source = g.attributes;
            for (let i = 0; i < source.position.count; i++) {
              p.fromBufferAttribute(source.position, i).applyMatrix4(mesh.matrix).toArray(positions, (offset + i) * 3);
              n.fromBufferAttribute(source.normal, i).applyMatrix3(normalMatrix).normalize().toArray(normals, (offset + i) * 3);
              uv[(offset + i) * 2] = source.uv.getX(i); uv[(offset + i) * 2 + 1] = source.uv.getY(i);
            }
            const elements = g.index ? g.index.count : source.position.count;
            for (let i = 0; i < elements; i++) indices[indexOffset++] = offset + (g.index ? g.index.getX(i) : i);
            offset += source.position.count; staticBatchStats.sourceTriangles += elements / 3;
            group.remove(mesh); removed.add(mesh); g.dispose();
          }
          const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
          geometry.setAttribute('normal', new T.BufferAttribute(normals, 3)); geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
          geometry.setIndex(new T.BufferAttribute(indices, 1)); geometry.computeBoundingSphere();
          const first = batch[0], merged = new T.Mesh(geometry, first.material); merged.name = 'batched-static-architecture';
          merged.castShadow = first.castShadow; merged.receiveShadow = first.receiveShadow; merged.renderOrder = first.renderOrder;
          group.add(merged); staticBatchStats.sourceMeshes += batch.length; staticBatchStats.batches++;
          batch = []; count = 0;
        };
        for (const mesh of siblings) { if (count + mesh.geometry.attributes.position.count > 60000) flush(); batch.push(mesh); count += mesh.geometry.attributes.position.count; }
        flush();
      }
      if (removed.size) for (let i = meshes.length - 1; i >= 0; i--) if (removed.has(meshes[i])) meshes.splice(i, 1);
      freezeStaticTransforms(group);
    }
    function box(w, h, d, x, y, z, mat, shadow = false, group = scene) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      group.add(m); meshes.push(m);
      return m;
    }
    // Bevels fit inside the original box dimensions: the collider silhouette
    // stays fixed while painted metal and foam catch a narrow, rounded highlight.
    function softBox(w, h, d, x, y, z, mat, radius = 0.008, group = scene) {
      const r = Math.min(radius, w * 0.24, h * 0.24, d * 0.24);
      const hw = w / 2 - r, hh = h / 2 - r, corner = Math.min(r, hw, hh);
      const shape = new T.Shape();
      shape.moveTo(-hw + corner, -hh); shape.lineTo(hw - corner, -hh);
      shape.quadraticCurveTo(hw, -hh, hw, -hh + corner); shape.lineTo(hw, hh - corner);
      shape.quadraticCurveTo(hw, hh, hw - corner, hh); shape.lineTo(-hw + corner, hh);
      shape.quadraticCurveTo(-hw, hh, -hw, hh - corner); shape.lineTo(-hw, -hh + corner);
      shape.quadraticCurveTo(-hw, -hh, -hw + corner, -hh);
      const geometry = new T.ExtrudeGeometry(shape, { depth: d - 2 * r, steps: 1, curveSegments: 3,
        bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3 });
      geometry.translate(0, 0, -(d - 2 * r) / 2);
      const mesh = new T.Mesh(geometry, mat); mesh.position.set(x, y, z);
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); meshes.push(mesh); return mesh;
    }
    // All visible fasteners in a group share two draw calls, irrespective of count.
    function addFasteners(entries, group = scene) {
      if (!entries.length) return;
      const heads = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 6), steel, entries.length);
      const washers = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 16), steel, entries.length);
      heads.name = 'instanced-hex-mounting-bolts'; washers.name = 'instanced-mounting-washers';
      const axis = new T.Vector3(0, 1, 0), normal = new T.Vector3(), position = new T.Vector3();
      const rotation = new T.Quaternion(), scale = new T.Vector3(), matrix = new T.Matrix4();
      entries.forEach((entry, index) => {
        normal.set(...entry.normal).normalize(); rotation.setFromUnitVectors(axis, normal);
        const radius = entry.radius || 0.014, depth = entry.depth || 0.011;
        position.set(...entry.position).addScaledVector(normal, depth * 0.58);
        matrix.compose(position, rotation, scale.set(radius, depth, radius)); heads.setMatrixAt(index, matrix);
        position.set(...entry.position).addScaledVector(normal, depth * 0.13);
        matrix.compose(position, rotation, scale.set(radius * 1.55, depth * 0.24, radius * 1.55)); washers.setMatrixAt(index, matrix);
      });
      for (const mesh of [heads, washers]) {
        mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.computeBoundingSphere(); group.add(mesh); meshes.push(mesh);
      }
    }
    let contactOcclusionMap;
    function addContactOcclusion(entries, group = scene) {
      if (!contactOcclusionMap) {
        const [c, ctx] = textureCanvas(128, 128);
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(17,21,18,.72)'); gradient.addColorStop(0.28, 'rgba(17,21,18,.5)');
        gradient.addColorStop(0.62, 'rgba(17,21,18,.13)'); gradient.addColorStop(1, 'rgba(17,21,18,0)');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); contactOcclusionMap = new T.CanvasTexture(c);
      }
      const mat = new T.MeshBasicMaterial({ map: contactOcclusionMap, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
      const mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), mat, entries.length);
      mesh.name = 'soft-static-ground-contact'; mesh.userData.groundContactOcclusion = true;
      const matrix = new T.Matrix4(), rotation = new T.Quaternion(), position = new T.Vector3(), scale = new T.Vector3();
      entries.forEach((entry, index) => {
        rotation.setFromEuler(new T.Euler(-Math.PI / 2, 0, entry.angle || 0));
        matrix.compose(position.set(entry.x, 0.018, entry.z), rotation, scale.set(entry.width, entry.depth, 1)); mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.renderOrder = 2; group.add(mesh); meshes.push(mesh);
    }
    function tubeBetween(a, b, radius, mat, group = scene, sides = 12) {
      const d = new T.Vector3().subVectors(b, a);
      const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, d.length(), sides), mat);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); meshes.push(mesh);
      return mesh;
    }
    function textureCanvas(w, h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      return [c, c.getContext('2d')];
    }
    let seed = 8821;
    function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    const surfaceDetailMaps = new Map();
    function surfaceTexture(surface, name, color = false, repeatX = 1, repeatY = 1) {
      const texture = new T.CanvasTexture(surface); texture.name = name;
      texture.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.minFilter = T.LinearMipmapLinearFilter; texture.magFilter = T.LinearFilter;
      return texture;
    }
    function surfaceNoise(x, y, salt = 0) {
      let n = Math.imul(x + 173, 374761393) + Math.imul(y + salt * 71, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }
    function mapleTexture() {
      if (surfaceDetailMaps.has('maple')) return surfaceDetailMaps.get('maple').map;
      const [c, ctx] = textureCanvas(2048, 2048), [h, height] = textureCanvas(1024, 1024), [r, rough] = textureCanvas(1024, 1024);
      ctx.fillStyle = '#c9aa7d'; ctx.fillRect(0, 0, 2048, 2048);
      height.fillStyle = '#999'; height.fillRect(0, 0, 1024, 1024); height.scale(0.5, 0.5);
      rough.fillStyle = '#ccc'; rough.fillRect(0, 0, 1024, 1024); rough.scale(0.5, 0.5);
      const pw = 64, ph = 512;
      for (let column = 0; column < 32; column++) {
        const offset = column % 2 ? -256 : 0;
        for (let row = -1; row < 5; row++) {
          const x = column * pw, y = row * ph + offset;
          const n = surfaceNoise(column, row + 2, 3), hue = 34 + n * 5, light = 65 + (surfaceNoise(column, row + 2, 8) - 0.5) * 9;
          ctx.fillStyle = `hsl(${hue},36%,${light}%)`; ctx.fillRect(x, y, pw, ph);
          const grainHeight = Math.round(151 + n * 8), boardRoughness = Math.round(187 + surfaceNoise(column, row + 2, 15) * 38);
          height.fillStyle = `rgb(${grainHeight},${grainHeight},${grainHeight})`; height.fillRect(x, y, pw, ph);
          rough.fillStyle = `rgb(${boardRoughness},${boardRoughness},${boardRoughness})`; rough.fillRect(x, y, pw, ph);
          // Narrow gym maple strips retain their own grain and varnish response.
          // Fine grain is predominantly albedo; the wood remains sanded flat.
          for (let g = 0; g < 66; g++) {
            const gn = surfaceNoise(g + column * 71, row + 3, 9), gx = x + gn * pw;
            const amplitude = 0.3 + surfaceNoise(g, column, row + 7) * 2.1, phase = gn * Math.PI * 2;
            ctx.strokeStyle = `rgba(103,68,33,${0.018 + gn * 0.06})`; ctx.lineWidth = 0.25 + gn * 0.8;
            height.strokeStyle = 'rgba(42,42,42,.035)'; height.lineWidth = 0.65;
            rough.strokeStyle = 'rgba(255,255,255,.07)'; rough.lineWidth = 0.7;
            for (const brush of [ctx, height, rough]) brush.beginPath();
            for (let i = 0; i <= 12; i++) {
              const yy = y + i * ph / 12, xx = gx + Math.sin(i * 0.43 + phase) * amplitude + Math.sin(i * 0.13 + column) * 0.6;
              for (const brush of [ctx, height, rough]) { if (!i) brush.moveTo(xx, yy); else brush.lineTo(xx, yy); }
            }
            ctx.stroke(); height.stroke(); rough.stroke();
          }
          ctx.strokeStyle = 'rgba(93,65,36,.27)'; ctx.lineWidth = 0.65; ctx.strokeRect(x, y, pw, ph);
          height.strokeStyle = '#737373'; height.lineWidth = 0.9; height.strokeRect(x, y, pw, ph);
          rough.strokeStyle = '#dedede'; rough.lineWidth = 1.2; rough.strokeRect(x, y, pw, ph);
          const sheen = ctx.createLinearGradient(x, 0, x + pw, 0); sheen.addColorStop(0, 'rgba(255,246,211,.035)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(87,58,25,.028)');
          ctx.fillStyle = sheen; ctx.fillRect(x + 1, y + 1, pw - 2, ph - 2);
        }
      }
      const pack = { map: surfaceTexture(c, 'maple-albedo-2048', true, 12, 4.5), bumpMap: surfaceTexture(h, 'maple-height-1024', false, 12, 4.5), roughnessMap: surfaceTexture(r, 'maple-roughness-1024', false, 12, 4.5), bumpScale: 0.00055 };
      surfaceDetailMaps.set('maple', pack); return pack.map;
    }
    // Painted masonry has a quiet surface texture rather than a featureless wall.
    const [plasterCanvas, plasterCtx] = textureCanvas(1024, 1024), [plasterHeight, plasterHeightCtx] = textureCanvas(512, 512), [plasterRough, plasterRoughCtx] = textureCanvas(512, 512);
    const plasterImage = plasterCtx.createImageData(1024, 1024), plasterHeightImage = plasterHeightCtx.createImageData(512, 512), plasterRoughImage = plasterRoughCtx.createImageData(512, 512);
    for (let i = 0; i < plasterImage.data.length; i += 4) {
      const pixel = i / 4, variation = Math.floor(surfaceNoise(pixel % 1024, Math.floor(pixel / 1024), 21) * 9) - 4;
      plasterImage.data[i] = 199 + variation; plasterImage.data[i + 1] = 197 + variation;
      plasterImage.data[i + 2] = 188 + variation; plasterImage.data[i + 3] = 255;
    }
    for (let i = 0; i < plasterHeightImage.data.length; i += 4) {
      const pixel = i / 4, x = pixel % 512, y = Math.floor(pixel / 512), n = surfaceNoise(x, y, 21), cloud = Math.sin(x * 0.055) * Math.sin(y * 0.038);
      const height = Math.round(151 + (n - 0.5) * 15 + cloud * 5), roughness = Math.round(224 + n * 20);
      for (let k = 0; k < 3; k++) { plasterHeightImage.data[i + k] = height; plasterRoughImage.data[i + k] = roughness; }
      plasterHeightImage.data[i + 3] = plasterRoughImage.data[i + 3] = 255;
    }
    plasterCtx.putImageData(plasterImage, 0, 0);
    plasterHeightCtx.putImageData(plasterHeightImage, 0, 0); plasterRoughCtx.putImageData(plasterRoughImage, 0, 0);
    plasterCtx.scale(2, 2); plasterCtx.strokeStyle = 'rgba(105,102,91,.075)'; plasterCtx.lineWidth = 0.75;
    plasterHeightCtx.strokeStyle = '#6e6e6e'; plasterHeightCtx.lineWidth = 0.8; plasterRoughCtx.strokeStyle = '#f4f4f4'; plasterRoughCtx.lineWidth = 0.8;
    for (const brush of [plasterCtx, plasterHeightCtx, plasterRoughCtx]) for (let row = 0; row < 8; row++) {
      const y = row * 64; brush.beginPath(); brush.moveTo(0, y); brush.lineTo(512, y); brush.stroke();
      for (let column = -1; column < 5; column++) {
        const x = column * 128 + (row % 2) * 64; brush.beginPath(); brush.moveTo(x, y); brush.lineTo(x, y + 64); brush.stroke();
      }
    }
    const plasterMap = surfaceTexture(plasterCanvas, 'painted-plaster-albedo-1024', true, 12, 6), plasterPack = { map: plasterMap, bumpMap: surfaceTexture(plasterHeight, 'painted-plaster-height-512', false, 12, 6), roughnessMap: surfaceTexture(plasterRough, 'painted-plaster-roughness-512', false, 12, 6) };
    surfaceDetailMaps.set('plaster', plasterPack);
    wallMat.map = plasterMap; wallMat.bumpMap = plasterPack.bumpMap; wallMat.bumpScale = 0.0015; wallMat.roughnessMap = plasterPack.roughnessMap; wallMat.color.set(0xffffff); wallMat.needsUpdate = true;
    const mapleAlbedo = mapleTexture(), maplePack = surfaceDetailMaps.get('maple');
    const floorMat = new T.MeshPhysicalMaterial({ map: mapleAlbedo, bumpMap: maplePack.bumpMap, bumpScale: maplePack.bumpScale, roughnessMap: maplePack.roughnessMap, roughness: 0.46, metalness: 0.015, clearcoat: 0.28, clearcoatRoughness: 0.32 });
    const floor = new T.Mesh(new T.PlaneGeometry(24, 36), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -0.012; scene.add(floor);
    // The painted court stays flush with the wood rather than floating above it.
    const paintMat = new T.MeshStandardMaterial({ color: 0xf4ead8, roughness: 0.57, transparent: true, opacity: 0.89, depthWrite: false });
    const keyMat = new T.MeshStandardMaterial({ color: 0x816450, roughness: 0.51, transparent: true, opacity: 0.42, depthWrite: false });
    function floorRect(w, d, x, z, mat = paintMat, y = 0.009) {
      const m = new T.Mesh(new T.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
    }
    function courtArc(cx, cz, r, start, end, width = 0.05, mat = paintMat) {
      const segments = Math.max(20, Math.ceil(Math.abs(end - start) * 20));
      const p = [], idx = [];
      for (let i = 0; i <= segments; i++) {
        const angle = start + (end - start) * i / segments;
        for (const radius of [r - width / 2, r + width / 2]) p.push(cx + Math.cos(angle) * radius, 0.014, cz + Math.sin(angle) * radius);
        if (i < segments) { const n = i * 2; idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new T.Mesh(g, mat); m.material.side = T.DoubleSide; m.receiveShadow = true; scene.add(m); return m;
    }
    floorRect(15.05, 0.05, 0, -14); floorRect(15.05, 0.05, 0, 14);
    floorRect(0.05, 28, -7.5, 0); floorRect(0.05, 28, 7.5, 0);
    floorRect(15, 0.05, 0, 0); courtArc(0, 0, 1.8, 0, Math.PI * 2);
    const logoMat = new T.MeshStandardMaterial({ color: 0x4d5b57, roughness: 0.62, transparent: true, opacity: 0.62 });
    courtArc(0, 0, 1.68, 0, Math.PI * 2, 0.012, logoMat);
    for (const sign of [-1, 1]) {
      floorRect(4.9, 5.8, 0, sign * 11.1, keyMat, 0.003);
      floorRect(0.05, 5.8, -2.45, sign * 11.1); floorRect(0.05, 5.8, 2.45, sign * 11.1);
      floorRect(4.9, 0.05, 0, sign * 8.2);
      courtArc(0, sign * 8.2, 1.8, sign < 0 ? 0 : Math.PI, sign < 0 ? Math.PI : Math.PI * 2);
      // Dashed half of the free throw circle inside the key.
      for (let i = 0; i < 11; i++) {
        const a = (sign < 0 ? Math.PI : 0) + i * Math.PI / 11;
        courtArc(0, sign * 8.2, 1.8, a, a + 0.13, 0.038);
      }
      // FIBA three point line: corners are straight, the arc ends at the sidelines.
      const radius = 6.75, cornerX = 6.6;
      const a = Math.acos(cornerX / radius);
      const joinZ = 12.35 - Math.sqrt(radius * radius - cornerX * cornerX);
      floorRect(0.05, 14 - joinZ, -cornerX, sign * ((14 + joinZ) / 2));
      floorRect(0.05, 14 - joinZ, cornerX, sign * ((14 + joinZ) / 2));
      courtArc(0, sign * 12.35, radius, sign < 0 ? a : Math.PI + a, sign < 0 ? Math.PI - a : 2 * Math.PI - a);
      courtArc(0, sign * 12.35, 1.25, sign < 0 ? 0 : Math.PI, sign < 0 ? Math.PI : 2 * Math.PI, 0.04);
      for (const x of [-2.68, 2.68]) for (const z of [10.1, 11.1, 12.1]) floorRect(0.34, 0.05, x, sign * z);
    }

    // Indoor architecture is one switchable set; hoop geometry and collisions
    // remain in world coordinates when an outdoor court is equipped.
    const architectureStart = scene.children.length;
    const architectureFixings = [];
    // Architecture: a calm, warm training hall with daylight and visible structure.
    box(0.25, 9, 36.2, -12.1, 4.45, 0, wallMat);
    box(0.25, 9, 36.2, 12.1, 4.45, 0, wallMat);
    box(24.3, 9, 0.25, 0, 4.45, -18.1, wallMat);
    box(24.3, 9, 0.25, 0, 4.45, 18.1, wallMat);
    box(24.3, 0.22, 36.3, 0, 9, 0, ceilingMat);
    for (const side of [-1, 1]) {
      softBox(0.08, 1.45, 35.9, side * 11.94, 0.725, 0, padMat, 0.012);
      box(0.12, 0.1, 36, side * 11.87, 1.46, 0, timber);
      for (let z = -15; z <= 15; z += 6) {
        softBox(0.3, 7.55, 0.3, side * 11.7, 5.17, z, beamMat, 0.012);
        for (const y of [1.78, 7.94]) for (const dz of [-0.07, 0.07]) {
          architectureFixings.push({ position: [side * 11.545, y, z + dz], normal: [-side, 0, 0], radius: 0.012 });
        }
      }
    }
    for (const sign of [-1, 1]) {
      softBox(23.85, 1.45, 0.08, 0, 0.725, sign * 17.94, padMat, 0.012);
      box(23.9, 0.1, 0.12, 0, 1.46, sign * 17.87, timber);
      for (const x of [-9, 9]) {
        box(1.5, 2.6, 0.055, x, 1.3, sign * 17.85, black);
        box(0.05, 0.65, 0.08, x + 0.48, 1.2, sign * 17.8, steel);
        const exit = new T.Mesh(new T.PlaneGeometry(0.55, 0.18), new T.MeshBasicMaterial({ color: 0x66a89c }));
        exit.position.set(x, 2.84, sign * 17.83); if (sign > 0) exit.rotation.y = Math.PI; scene.add(exit);
      }
    }
    const windowMat = new T.MeshStandardMaterial({ color: 0xd9e5e2, emissive: 0xc7ded8, emissiveIntensity: 0.65, roughness: 0.38 });
    for (const side of [-1, 1]) for (let z = -12; z <= 12; z += 6) {
      box(0.07, 1.9, 4.7, side * 11.92, 5.35, z, windowMat);
      for (const dz of [-2.35, -0.79, 0.79, 2.35]) box(0.11, 2.02, 0.055, side * 11.86, 5.35, z + dz, ivory);
      for (const y of [4.38, 6.32]) box(0.12, 0.065, 4.8, side * 11.86, y, z, ivory);
    }
    for (let z = -15; z <= 15; z += 6) {
      box(24, 0.27, 0.18, 0, 8.15, z, beamMat);
      tubeBetween(new T.Vector3(-11.8, 8.15, z), new T.Vector3(0, 8.83, z), 0.055, beamMat);
      tubeBetween(new T.Vector3(11.8, 8.15, z), new T.Vector3(0, 8.83, z), 0.055, beamMat);
    }
    for (const x of [-6.1, 6.1]) box(0.14, 0.19, 36, x, 8.55, 0, beamMat);
    const glowMat = new T.MeshBasicMaterial({ color: 0xfff7dd });
    for (const x of [-5, 5]) for (const z of [-12, -4, 4, 12]) {
      box(0.55, 0.14, 2.6, x, 7.94, z, black);
      box(0.46, 0.025, 2.48, x, 7.857, z, glowMat);
      tubeBetween(new T.Vector3(x, 8.14, z - 0.8), new T.Vector3(x, 8.6, z - 0.8), 0.013, steel);
      tubeBetween(new T.Vector3(x, 8.14, z + 0.8), new T.Vector3(x, 8.6, z + 0.8), 0.013, steel);
    }
    // Bleachers on one side, a low player bench on the other.
    for (let tier = 0; tier < 3; tier++) {
      const x = -8.6 - tier * 0.72, y = 0.25 + tier * 0.38;
      box(0.68, 0.13, 10.3, x, y, 0, timber, true);
      box(0.55, y - 0.06, 10.1, x, (y - 0.06) / 2, 0, black);
      for (const z of [-4.6, 0, 4.6]) box(0.07, 0.2, 0.09, x, y - 0.2, z, steel);
    }
    for (const side of [-1, 1]) {
      box(0.55, 0.10, 4.5, 9.7, 0.46, side * 5.1, timber, true);
      box(0.08, 0.37, 4.5, 9.95, 0.76, side * 5.1, timber, true);
      for (const dz of [-1.9, 1.9]) {
        box(0.08, 0.42, 0.08, 9.5, 0.21, side * 5.1 + dz, steel);
        box(0.08, 0.42, 0.08, 9.9, 0.21, side * 5.1 + dz, steel);
      }
    }
    function signTexture() {
      const [c, ctx] = textureCanvas(1024, 256);
      ctx.fillStyle = '#252b2b'; ctx.fillRect(0, 0, 1024, 256);
      ctx.textAlign = 'center'; ctx.fillStyle = '#eee7d7'; ctx.font = 'bold 112px Arial';
      ctx.fillText('P O T A', 512, 144);
      ctx.fillStyle = '#a9b4a8'; ctx.font = '22px Arial'; ctx.fillText('S E R B E S T   A T I Ş', 512, 203);
      const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace; return map;
    }
    const signMat = new T.MeshStandardMaterial({ map: signTexture(), roughness: 0.8 });
    for (const s of [-1, 1]) {
      const m = new T.Mesh(new T.PlaneGeometry(4.4, 1.1), signMat);
      m.position.set(0, 7.1, s * 17.92); if (s === 1) m.rotation.y = Math.PI; scene.add(m);
    }
    addFasteners(architectureFixings);
    addContactOcclusion([
      { x: -11.92, z: 0, width: 48, depth: 1.0, angle: Math.PI / 2 },
      { x: 11.92, z: 0, width: 48, depth: 1.0, angle: Math.PI / 2 },
      { x: 0, z: -17.92, width: 34, depth: 1.0 }, { x: 0, z: 17.92, width: 34, depth: 1.0 },
      { x: -9.32, z: 0, width: 3.35, depth: 11.0 },
      { x: 9.7, z: -5.1, width: 1.2, depth: 5.2 }, { x: 9.7, z: 5.1, width: 1.2, depth: 5.2 }
    ]);

    const indoorArchitecture = new T.Group(); indoorArchitecture.name = 'indoor-gym-architecture';
    for (const object of scene.children.slice(architectureStart)) indoorArchitecture.add(object);
    scene.add(indoorArchitecture);
    batchStaticGeometry(indoorArchitecture);

    const nets = [];
    const netMat = new T.MeshPhysicalMaterial({ color: 0xf5f1e4, roughness: 0.86,
      sheen: 0.28, sheenRoughness: 0.82, sheenColor: 0xece7d7 });
    const knotGeometry = new T.SphereGeometry(window.PotaNetPhysics.parameters.cordRadius * (18 / 11), 10, 8);
    const knotMatrix = new T.Matrix4();
    const chainMat = material('chain-net', { color: 0xb7c1c6, roughness: 0.24, metalness: 0.88 });
    // An oval swept wire, rather than flattened solid nylon: each visible link
    // has a real open centre, constant wire diameter and alternating planes.
    const chainGeometry = (() => {
      const pathSegments = 10, wireSegments = 4, vertices = [], normals = [], indices = [];
      for (let i = 0; i <= pathSegments; i++) {
        const a = i / pathSegments * Math.PI * 2, x = Math.cos(a) * 0.0045, y = Math.sin(a) * 0.0105;
        const nx = Math.cos(a) / 0.0045, ny = Math.sin(a) / 0.0105, inv = 1 / Math.hypot(nx, ny);
        for (let j = 0; j <= wireSegments; j++) {
          const b = j / wireSegments * Math.PI * 2, c = Math.cos(b), z = Math.sin(b);
          vertices.push(x + nx * inv * c * 0.0015, y + ny * inv * c * 0.0015, z * 0.0015);
          normals.push(nx * inv * c, ny * inv * c, z);
          if (i < pathSegments && j < wireSegments) {
            const n = i * (wireSegments + 1) + j, q = n + wireSegments + 1;
            indices.push(n, q, n + 1, n + 1, q, q + 1);
          }
        }
      }
      const g = new T.BufferGeometry(); g.name = 'interlocking-oval-wire'; g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); g.setIndex(indices); return g;
    })();
    const chainMatrix = new T.Matrix4(), chainTangent = new T.Vector3(), chainSide = new T.Vector3(), chainNormal = new T.Vector3(), chainNegativeSide = new T.Vector3();
    let selectedNetStyle = 'nylon', selectedRimStyle = 'standard', selectedBackboardStyle = 'glass', selectedEnvironmentStyle = 'gym';
    function createSpringNet(sign, hoopZ) {
      const solver = window.PotaNetPhysics.create({ id: `hoop-${sign}`, sign, origin: { x: 0, y: 3.044, z: hoopZ } });
      const { positions, rest, links, spokes, particleCount } = solver;
      const visibleEdges = links.length, sides = 8;
      const vertices = new Float32Array(visibleEdges * sides * 2 * 3);
      const normals = new Float32Array(vertices.length), indices = new Uint16Array(visibleEdges * sides * 6);
      for (let edge = 0; edge < visibleEdges; edge++) for (let side = 0; side < sides; side++) {
        const a = edge * sides * 2 + side, b = edge * sides * 2 + (side + 1) % sides, k = (edge * sides + side) * 6;
        indices[k] = a; indices[k + 1] = b; indices[k + 2] = a + sides;
        indices[k + 3] = b; indices[k + 4] = b + sides; indices[k + 5] = a + sides;
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(vertices, 3).setUsage(T.DynamicDrawUsage));
      geometry.setAttribute('normal', new T.BufferAttribute(normals, 3).setUsage(T.DynamicDrawUsage));
      geometry.setIndex(new T.BufferAttribute(indices, 1));
      const group = new T.Group(); group.name = `woven-net-${sign}`; group.position.set(0, 3.044, hoopZ);
      const mesh = new T.Mesh(geometry, netMat); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.userData.netShadowCaster = true;
      const knots = new T.InstancedMesh(knotGeometry, netMat, particleCount); knots.frustumCulled = false;
      knots.instanceMatrix.setUsage(T.DynamicDrawUsage); knots.castShadow = false; knots.receiveShadow = true;
      knots.userData.netShadowCaster = true;
      const chainCounts = new Uint8Array(visibleEdges); let chainCount = 0;
      for (let edge = 0; edge < visibleEdges; edge++) { chainCounts[edge] = Math.max(2, Math.ceil(links[edge].rest / 0.016)); chainCount += chainCounts[edge]; }
      const chain = new T.InstancedMesh(chainGeometry, chainMat, chainCount);
      chain.name = `interlocking-chain-net-${sign}`; chain.frustumCulled = false; chain.visible = false;
      chain.instanceMatrix.setUsage(T.DynamicDrawUsage); chain.castShadow = false; chain.receiveShadow = true;
      chain.userData.netShadowCaster = true; chain.userData.linkPitch = 0.016; chain.userData.wireDiameter = 0.003;
      mesh.name = `nylon-cords-${sign}`; knots.name = `nylon-knots-${sign}`;
      group.add(mesh, knots, chain); scene.add(group);
      const net = { solver, group, sign, positions, rest, links, visibleEdges, vertices, normals, geometry, spokes, particleCount, sides, mesh, knots, chain, chainCounts, chainCount,
        geometryPositions: new Float64Array(positions.length).fill(Infinity), geometryKind: '', geometryUpdates: 0 };
      updateNetGeometry(net); nets.push(net);
    }
    const netSectionCos = new Float64Array(8), netSectionSin = new Float64Array(8);
    for (let side = 0; side < 8; side++) {
      netSectionCos[side] = Math.cos(side * Math.PI / 4); netSectionSin[side] = Math.sin(side * Math.PI / 4);
    }
    function updateNetGeometry(net) {
      const kind = selectedNetStyle === 'chain' || selectedNetStyle === 'gold-chain' ? 'chain' : 'nylon';
      let changed = kind !== net.geometryKind;
      if (!changed) for (let i = 0; i < net.positions.length; i++) {
        if (net.positions[i] !== net.geometryPositions[i]) { changed = true; break; }
      }
      // A sleeping solver has exactly the same coordinates. Keep its complete
      // geometry and GPU buffers, including all small links, without reupload.
      if (!changed) return;
      net.geometryPositions.set(net.positions); net.geometryKind = kind; net.geometryUpdates++;
      if (kind === 'chain') { updateChainGeometry(net); return; }
      const p = net.positions, radius = window.PotaNetPhysics.parameters.cordRadius, sides = net.sides;
      for (let edge = 0; edge < net.visibleEdges; edge++) {
        const link = net.links[edge], ai = link.a * 3, bi = link.b * 3;
        let tx = p[bi] - p[ai], ty = p[bi + 1] - p[ai + 1], tz = p[bi + 2] - p[ai + 2];
        const length = Math.hypot(tx, ty, tz) || 1; tx /= length; ty /= length; tz /= length;
        let ux, uy, uz;
        if (Math.abs(ty) < 0.85) { ux = tz; uy = 0; uz = -tx; }
        else { ux = 0; uy = -tz; uz = ty; }
        const uLength = Math.hypot(ux, uy, uz) || 1; ux /= uLength; uy /= uLength; uz /= uLength;
        const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
        for (let end = 0; end < 2; end++) for (let side = 0; side < sides; side++) {
          const c = netSectionCos[side], sn = netSectionSin[side];
          const nx = ux * c + vx * sn, ny = uy * c + vy * sn, nz = uz * c + vz * sn;
          const source = end ? bi : ai, k = (edge * sides * 2 + end * sides + side) * 3;
          net.vertices[k] = p[source] + nx * radius; net.vertices[k + 1] = p[source + 1] + ny * radius; net.vertices[k + 2] = p[source + 2] + nz * radius;
          net.normals[k] = nx; net.normals[k + 1] = ny; net.normals[k + 2] = nz;
        }
      }
      for (let i = 0; i < net.particleCount; i++) {
        const k = i * 3; knotMatrix.makeTranslation(p[k], p[k + 1], p[k + 2]); net.knots.setMatrixAt(i, knotMatrix);
      }
      net.knots.instanceMatrix.needsUpdate = true;
      net.geometry.attributes.position.needsUpdate = true; net.geometry.attributes.normal.needsUpdate = true;
    }
    function updateChainGeometry(net) {
      const p = net.positions; let instance = 0;
      for (let edge = 0; edge < net.visibleEdges; edge++) {
        const link = net.links[edge], ai = link.a * 3, bi = link.b * 3, count = net.chainCounts[edge];
        chainTangent.set(p[bi] - p[ai], p[bi + 1] - p[ai + 1], p[bi + 2] - p[ai + 2]).normalize();
        if (Math.abs(chainTangent.y) < 0.85) chainSide.set(chainTangent.z, 0, -chainTangent.x).normalize();
        else chainSide.set(0, -chainTangent.z, chainTangent.y).normalize();
        chainNormal.crossVectors(chainSide, chainTangent).normalize(); chainNegativeSide.copy(chainSide).negate();
        for (let j = 0; j < count; j++) {
          const t = (j + 0.5) / count;
          if ((edge + j) & 1) chainMatrix.makeBasis(chainNormal, chainTangent, chainNegativeSide);
          else chainMatrix.makeBasis(chainSide, chainTangent, chainNormal);
          chainMatrix.setPosition(p[ai] + (p[bi] - p[ai]) * t, p[ai + 1] + (p[bi + 1] - p[ai + 1]) * t, p[ai + 2] + (p[bi + 2] - p[ai + 2]) * t);
          net.chain.setMatrixAt(instance++, chainMatrix);
        }
      }
      net.chain.instanceMatrix.needsUpdate = true;
    }
    function getNetDiagnostics() { return nets.map(net => Object.assign({}, net.solver.diagnostics(), { style: selectedNetStyle, chainLinks: net.chain.visible ? net.chainCount : 0, geometryUpdates: net.geometryUpdates })); }
    const rimMat = new T.MeshPhysicalMaterial({ color: 0xc04e24, roughness: 0.35, metalness: 0.55,
      clearcoat: 0.32, clearcoatRoughness: 0.18 });
    const glassMat = new T.MeshPhysicalMaterial({ color: 0xd5e7e3, transparent: true, opacity: 0.22,
      roughness: 0.06, metalness: 0.04, transmission: 0, thickness: 0.025, ior: 1.52,
      clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 0.48, side: T.DoubleSide, depthWrite: false });
    function glassFresnel(shader) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (opacity < 0.99) {
          float glassFacing = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
          float glassEdge = pow(1.0 - glassFacing, 5.0);
          diffuseColor.a = clamp(diffuseColor.a * (0.48 + glassEdge * 1.5) + glassEdge * 0.08, 0.0, 0.64);
        }`);
    }
    const backboards = [], boardTargets = [], boardFrames = [];
    const boardFrameMat = ivory.clone(), boardTargetMat = ivory.clone();
    boardFrameMat.name = 'cosmetic-board-frame'; boardTargetMat.name = 'cosmetic-board-target';
    const hoopFixings = [], gasketTransforms = [], hookTransforms = [];
    function addHoop(s) {
      const z = s * 12.35, boardZ = s * 12.75;
      // Freestanding professional stanchion with a padded front.
      softBox(1.08, 0.18, 1.75, 0, 0.09, s * 15, black, 0.035);
      softBox(0.52, 1.52, 0.7, 0, 0.92, s * 14.77, padMat, 0.045);
      softBox(0.21, 1.35, 0.21, 0, 2.05, s * 15.07, steel, 0.015);
      tubeBetween(new T.Vector3(0, 2.55, s * 15.07), new T.Vector3(0, 3.65, s * 12.93), 0.13, beamMat, scene, 20);
      for (const x of [-0.65, 0.65]) tubeBetween(new T.Vector3(0, 3.35, s * 13.65), new T.Vector3(x, 3.65, s * 12.88), 0.035, steel);
      softBox(0.38, 0.22, 0.04, 0, 3.65, boardZ + s * 0.055, steel, 0.006);
      const boardMaterial = glassMat.clone(); boardMaterial.onBeforeCompile = glassFresnel;
      boardMaterial.customProgramCacheKey = () => 'pota-board-glass-fresnel-v1';
      const board = box(1.81, 1.08, 0.025, 0, 3.53, boardZ, boardMaterial);
      board.name = `cosmetic-backboard-${s}`; backboards.push(board);
      for (const x of [-0.912, 0.912]) boardFrames.push(softBox(0.035, 1.105, 0.045, x, 3.53, boardZ, boardFrameMat, 0.004));
      for (const y of [2.978, 4.082]) boardFrames.push(softBox(1.86, 0.035, 0.045, 0, y, boardZ, boardFrameMat, 0.004));
      softBox(1.86, 0.10, 0.065, 0, 2.945, boardZ, padMat, 0.012);
      for (const x of [-0.886, 0.886]) gasketTransforms.push({ position: [x, 3.53, boardZ - s * 0.0155], size: [0.012, 1.047, 0.006] });
      for (const y of [3.012, 4.048]) gasketTransforms.push({ position: [0, y, boardZ - s * 0.0155], size: [1.784, 0.012, 0.006] });
      for (const x of [-0.847, 0.847]) for (const y of [3.037, 4.023]) {
        hoopFixings.push({ position: [x, y, boardZ - s * 0.018], normal: [0, 0, -s], radius: 0.010, depth: 0.007 });
      }
      for (const x of [-0.13, 0.13]) for (const y of [3.58, 3.72]) hoopFixings.push({ position: [x, y, boardZ + s * 0.079], normal: [0, 0, s], radius: 0.013 });
      for (const x of [-0.42, 0.42]) for (const dz of [-0.68, 0.68]) hoopFixings.push({ position: [x, 0.182, s * 15 + dz], normal: [0, 1, 0], radius: 0.018 });
      for (const x of [-0.13, 0.13]) hoopFixings.push({ position: [x, 3.35, s * 13.65], normal: [Math.sign(x), 0, 0], radius: 0.021 });
      const faceZ = boardZ - s * 0.02;
      for (const x of [-0.295, 0.295]) boardTargets.push(box(0.025, 0.45, 0.009, x, 3.3, faceZ, boardTargetMat));
      for (const y of [3.075, 3.525]) boardTargets.push(box(0.615, 0.025, 0.009, 0, y, faceZ, boardTargetMat));
      const rim = new T.Mesh(new T.TorusGeometry(0.2465, 0.018, 24, 128), rimMat);
      rim.name = `regulation-rim-${s}`; rim.rotation.x = Math.PI / 2; rim.position.set(0, 3.05, z);
      rim.castShadow = true; rim.receiveShadow = true; scene.add(rim);
      softBox(0.135, 0.026, 0.195, 0, 3.04, boardZ - s * 0.12, rimMat, 0.004);
      softBox(0.145, 0.15, 0.025, 0, 3.025, boardZ - s * 0.05, rimMat, 0.004);
      createSpringNet(s, z);
      const netSpokes = nets[nets.length - 1].spokes;
      for (let index = 0; index < netSpokes; index++) {
        const angle = index / netSpokes * Math.PI * 2;
        hookTransforms.push({ x: Math.cos(angle) * 0.236, y: 3.038, z: z + Math.sin(angle) * 0.236, angle: angle + Math.PI / 2 });
      }
    }
    addHoop(-1); addHoop(1);
    addFasteners(hoopFixings);
    addContactOcclusion([{ x: 0, z: -15, width: 1.85, depth: 2.7 }, { x: 0, z: 15, width: 1.85, depth: 2.7 }]);
    const gaskets = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), material('glass-gasket', { color: 0x25322f, roughness: 0.93 }), gasketTransforms.length);
    const hooks = new T.InstancedMesh(new T.TorusGeometry(0.008, 0.0022, 8, 12), rimMat, hookTransforms.length);
    gaskets.name = 'instanced-backboard-rubber-gaskets'; hooks.name = 'instanced-net-attachment-hooks';
    const fittingMatrix = new T.Matrix4(), fittingRotation = new T.Quaternion(), fittingPosition = new T.Vector3(), fittingScale = new T.Vector3();
    gasketTransforms.forEach((entry, index) => {
      fittingMatrix.compose(fittingPosition.set(...entry.position), fittingRotation.identity(), fittingScale.set(...entry.size)); gaskets.setMatrixAt(index, fittingMatrix);
    });
    hookTransforms.forEach((entry, index) => {
      fittingRotation.setFromAxisAngle(new T.Vector3(0, 1, 0), entry.angle);
      fittingMatrix.compose(fittingPosition.set(entry.x, entry.y, entry.z), fittingRotation, fittingScale.set(1, 1, 1)); hooks.setMatrixAt(index, fittingMatrix);
    });
    for (const mesh of [gaskets, hooks]) {
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); meshes.push(mesh);
    }
    const netAudioStates = Object.freeze(nets.map(net => net.solver.audioState));

    const hemisphere = new T.HemisphereLight(0xf4f7ef, 0x766451, 1.505); scene.add(hemisphere);
    const sun = new T.DirectionalLight(0xfff3d7, 3.245);
    sun.position.set(-10, 12, 5); sun.target.position.set(1, 0, -3); scene.add(sun, sun.target);
    const largeDisplay = window.innerWidth >= 900 && !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const shadowResolution = Math.min(512, sideTargetLimit);
    sun.castShadow = true; sun.shadow.mapSize.set(shadowResolution, shadowResolution);
    Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 21, bottom: -21, near: 1, far: 42 });
    sun.shadow.bias = -0.00032; sun.shadow.normalBias = 0.024;
    const fill = new T.DirectionalLight(0xd1e1e1, 0.6375); fill.position.set(10, 6, -8); scene.add(fill);
    const ceilingLights = [];
    for (const z of [-11, 0, 11]) {
      const spot = new T.SpotLight(0xfff4dc, 42, 22, 0.98, 0.9, 1.35);
      spot.position.set(0, 7.9, z); spot.target.position.set(0, 0, z); scene.add(spot, spot.target); ceilingLights.push(spot);
    }

    function basketballTexture() {
      const [c, ctx] = textureCanvas(1024, 512);
      ctx.fillStyle = '#bd642b'; ctx.fillRect(0, 0, 1024, 512);
      const gradient = ctx.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, 'rgba(255,184,77,.035)'); gradient.addColorStop(0.5, 'rgba(99,30,5,.015)'); gradient.addColorStop(1, 'rgba(63,23,7,.045)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 512);
      for (let y = 0; y < 512; y += 5) for (let x = 0; x < 1024; x += 5) {
        const n = surfaceNoise(x, y, 51); ctx.fillStyle = `rgba(64,25,8,${0.018 + n * 0.035})`;
        ctx.beginPath(); ctx.ellipse(x + (y % 10 ? 2.5 : 0), y, 1.2, 1.15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,198,120,.018)'; ctx.fillRect(x + 1, y - 1, 1, 1);
      }
      ctx.strokeStyle = '#402516'; ctx.lineWidth = 10;
      for (const x of [0, 256, 512, 768, 1024]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(1024, 256); ctx.stroke();
      ctx.lineWidth = 7;
      for (const offset of [0, Math.PI]) {
        ctx.beginPath();
        for (let x = 0; x <= 1024; x += 4) {
          const y = 256 + Math.sin(x / 1024 * Math.PI * 2 + offset) * 156;
          if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.textAlign = 'center'; ctx.font = 'bold 25px Arial'; ctx.fillStyle = 'rgba(60,30,15,.65)'; ctx.fillText('POTA', 630, 173);
      const tex = surfaceTexture(c, 'basketball-classic-albedo-1024', true); tex.wrapT = T.ClampToEdgeWrapping; return tex;
    }
    const ballMat = new T.MeshPhysicalMaterial({ map: basketballTexture(), roughness: 0.76, metalness: 0, clearcoat: 0.035, clearcoatRoughness: 0.68 });
    const ball = new T.Mesh(new T.SphereGeometry(0.12, 64, 48), ballMat);
    ball.castShadow = true; ball.receiveShadow = true; ball.position.set(0.23, 1.45, -4.68); scene.add(ball);
// INSERT AFTER the ball mesh is created and added to scene.
// Cosmetic changes never modify ball radius, position, velocity or physical state.
const ballSkinSettings = {
  classic: { roughness: 0.76, metalness: 0, emissive: 0x000000, glow: 0 },
  street: { roughness: 0.87, metalness: 0.025, emissive: 0x000000, glow: 0 },
  ice: { roughness: 0.49, metalness: 0.10, emissive: 0x000000, glow: 0 },
  gold: { roughness: 0.35, metalness: 0.63, emissive: 0x000000, glow: 0 },
  galaxy: { roughness: 0.65, metalness: 0.08, emissive: 0x7666bc, glow: 0.10 },
  lava: { roughness: 0.79, metalness: 0.025, emissive: 0xed4813, glow: 0.14 },
  neon: { roughness: 0.62, metalness: 0.06, emissive: 0x33ffc3, glow: 0.24 },
  camo: { roughness: 0.92, metalness: 0, emissive: 0x000000, glow: 0 },
  marble: { roughness: 0.31, metalness: 0.025, emissive: 0x000000, glow: 0 },
  carbon: { roughness: 0.48, metalness: 0.33, emissive: 0x000000, glow: 0 },
  retro: { roughness: 0.88, metalness: 0, emissive: 0x000000, glow: 0 },
  zebra: { roughness: 0.79, metalness: 0, emissive: 0x000000, glow: 0 },
  circuit: { roughness: 0.59, metalness: 0.28, emissive: 0x32ae6e, glow: 0.08 },
  chrome: { roughness: 0.18, metalness: 0.91, emissive: 0x000000, glow: 0 },
  rainbow: { roughness: 0.57, metalness: 0.04, emissive: 0x000000, glow: 0 },
  ocean: { roughness: 0.43, metalness: 0.07, emissive: 0x163c6f, glow: 0.05 },
  forest: { roughness: 0.86, metalness: 0, emissive: 0x000000, glow: 0 },
  royal: { roughness: 0.51, metalness: 0.26, emissive: 0x000000, glow: 0 },
  graffiti: { roughness: 0.82, metalness: 0, emissive: 0x000000, glow: 0 },
  comic: { roughness: 0.73, metalness: 0, emissive: 0x000000, glow: 0 },
  sunset: { roughness: 0.66, metalness: 0.025, emissive: 0xaa492f, glow: 0.07 },
  pixel: { roughness: 0.76, metalness: 0, emissive: 0x000000, glow: 0 },
  crystal: { roughness: 0.28, metalness: 0.22, emissive: 0x315981, glow: 0.04 },
  phoenix: { roughness: 0.68, metalness: 0.045, emissive: 0xf45912, glow: 0.17 },
  obsidian: { roughness: 0.19, metalness: 0.46, emissive: 0x000000, glow: 0, bump: 0.00035, environment: true },
  jade: { roughness: 0.27, metalness: 0.08, emissive: 0x143b28, glow: 0.06, bump: 0.00055 },
  solar: { roughness: 0.30, metalness: 0.72, emissive: 0xff8c17, glow: 0.13, bump: 0.00075, environment: true },
  hologram: { roughness: 0.20, metalness: 0.62, emissive: 0x3877a6, glow: 0.14, bump: 0.00025, environment: true },
  dragon: { roughness: 0.52, metalness: 0.32, emissive: 0x5d140a, glow: 0.06, bump: 0.0011 },
  aurora: { roughness: 0.43, metalness: 0.12, emissive: 0x23a881, glow: 0.21, bump: 0.0007 },
  sapphire: { roughness: 0.15, metalness: 0.28, emissive: 0x152f91, glow: 0.07, bump: 0.0003 },
  eclipse: { roughness: 0.30, metalness: 0.53, emissive: 0xdf7131, glow: 0.10, bump: 0.0006, environment: true },
  nebula: { roughness: 0.57, metalness: 0.06, emissive: 0x974dba, glow: 0.19, bump: 0.0008 },
  diamond: { roughness: 0.12, metalness: 0.38, emissive: 0x5c8ba1, glow: 0.04, bump: 0.0002 },
  astral: { roughness: 0.31, metalness: 0.66, emissive: 0x8c6d24, glow: 0.08, bump: 0.0006, environment: true },
  singularity: { roughness: 0.17, metalness: 0.78, emissive: 0x854bcf, glow: 0.17, bump: 0.0003, environment: true }
};


const ballSkinTextures = new Map([['classic', ballMat.map]]);
const smoothBallSkins = new Set(['ice', 'gold', 'marble', 'chrome', 'crystal', 'obsidian', 'jade', 'solar', 'hologram', 'sapphire', 'eclipse', 'diamond', 'astral', 'singularity']);
let selectedBallSkin = 'classic';
let selectedParticleStyle = 'none';
function skinRandomFactory(id) {
  let value = 2166136261;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619) >>> 0;
  return function () { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
function createBallSurfaceMaps(kind) {
  const key = 'basketball-' + kind;
  if (surfaceDetailMaps.has(key)) return surfaceDetailMaps.get(key);
  const [surface, brush] = textureCanvas(1024, 512), [roughSurface, rough] = textureCanvas(1024, 512);
  brush.fillStyle = '#8b8b8b'; brush.fillRect(0, 0, 1024, 512);
  rough.fillStyle = '#e8e8e8'; rough.fillRect(0, 0, 1024, 512);
  if (kind === 'leather') {
    const [stamp, pebble] = textureCanvas(8, 8), gradient = pebble.createRadialGradient(3.6, 3.4, 0, 4, 4, 3.5);
    gradient.addColorStop(0, '#bdbdbd'); gradient.addColorStop(0.5, '#ababab'); gradient.addColorStop(1, 'rgba(139,139,139,0)'); pebble.fillStyle = gradient; pebble.fillRect(0, 0, 8, 8);
    for (let y = 0; y < 512; y += 5) for (let x = 0; x < 1024; x += 5) {
      const n = surfaceNoise(x, y, 38), xx = x + (y % 10 ? 2.5 : 0), yy = y + (n - 0.5) * 0.5;
      brush.drawImage(stamp, xx - 2.1, yy - 2.1, 4.2, 4.2);
      const shade = Math.round(202 + n * 19); rough.fillStyle = `rgb(${shade},${shade},${shade})`;
      rough.beginPath(); rough.ellipse(xx, yy, 1.25, 1.18, 0, 0, Math.PI * 2); rough.fill();
    }
  } else if (kind === 'carbon') {
    for (let y = 0; y < 512; y += 12) for (let x = 0; x < 1024; x += 12) {
      const across = ((x + y) / 12) % 2 === 0;
      brush.fillStyle = across ? '#929292' : '#858585'; brush.fillRect(x, y, 11, 11);
      rough.fillStyle = across ? '#cfcfcf' : '#e4e4e4'; rough.fillRect(x, y, 11, 11);
      brush.strokeStyle = '#a1a1a1'; brush.lineWidth = 0.5;
      for (let n = 2; n < 12; n += 3) { brush.beginPath(); brush.moveTo(across ? x : x + n, across ? y + n : y); brush.lineTo(across ? x + 10 : x + n, across ? y + n : y + 10); brush.stroke(); }
    }
  } else {
    const image = brush.createImageData(1024, 512), roughImage = rough.createImageData(1024, 512);
    for (let i = 0; i < image.data.length; i += 4) {
      const pixel = i / 4, n = surfaceNoise(pixel % 1024, Math.floor(pixel / 1024), 67), height = Math.round(139 + n * 3), sheen = Math.round(225 + n * 20);
      for (let k = 0; k < 3; k++) { image.data[i + k] = height; roughImage.data[i + k] = sheen; } image.data[i + 3] = roughImage.data[i + 3] = 255;
    }
    brush.putImageData(image, 0, 0); rough.putImageData(roughImage, 0, 0);
  }
  // Grooves follow the same UV curves as every original cosmetic. Their
  // sub-millimetre depth changes illumination without deforming the ball.
  for (const [tool, outer, inner] of [[brush, '#575757', '#303030'], [rough, '#f4f4f4', '#eeeeee']]) {
    function seams(width, color) {
      tool.strokeStyle = color; tool.lineWidth = width;
      for (const x of [0, 256, 512, 768, 1024]) { tool.beginPath(); tool.moveTo(x, 0); tool.lineTo(x, 512); tool.stroke(); }
      tool.beginPath(); tool.moveTo(0, 256); tool.lineTo(1024, 256); tool.stroke();
      tool.lineWidth = width * 0.7;
      for (const offset of [0, Math.PI]) { tool.beginPath(); for (let x = 0; x <= 1024; x += 4) { const y = 256 + Math.sin(x / 1024 * Math.PI * 2 + offset) * 156; if (!x) tool.moveTo(x, y); else tool.lineTo(x, y); } tool.stroke(); }
    }
    seams(10, outer); seams(5.5, inner);
  }
  const pack = { bumpMap: surfaceTexture(surface, key + '-height-1024'), roughnessMap: surfaceTexture(roughSurface, key + '-roughness-1024') };
  pack.bumpMap.wrapT = pack.roughnessMap.wrapT = T.ClampToEdgeWrapping;
  surfaceDetailMaps.set(key, pack); return pack;
}
function createBallLeatherBump() { return createBallSurfaceMaps('leather').bumpMap; }
const ballLeatherBump = createBallLeatherBump();
ballMat.bumpMap = ballLeatherBump; ballMat.bumpScale = 0.0013; ballMat.roughnessMap = createBallSurfaceMaps('leather').roughnessMap;
ballMat.needsUpdate = true;
function drawPremiumBallPattern(brush, id, noise) {
  if (id === 'obsidian') {
    // Irregular polished volcanic faces separated by fine mineral seams.
    for (let y = -90; y < 600; y += 100) for (let x = -100; x < 1150; x += 120) {
      const cx = x + 60 + noise() * 28, cy = y + 45 + noise() * 25;
      const corners = [[x, y], [x + 120, y], [x + 120, y + 100], [x, y + 100]];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        brush.fillStyle = ['#10131b', '#252735', '#333447', '#191b26'][i];
        brush.strokeStyle = 'rgba(202,159,78,.65)'; brush.lineWidth = 1.2;
        brush.beginPath(); brush.moveTo(cx, cy); brush.lineTo(a[0], a[1]); brush.lineTo(b[0], b[1]); brush.closePath(); brush.fill(); brush.stroke();
      }
    }
  } else if (id === 'jade') {
    for (let i = 0; i < 38; i++) {
      const x = noise() * 1024, y = noise() * 512, r = 35 + noise() * 110;
      const cloud = brush.createRadialGradient(x, y, 0, x, y, r);
      cloud.addColorStop(0, i % 2 ? 'rgba(189,235,164,.32)' : 'rgba(2,43,32,.55)'); cloud.addColorStop(1, 'rgba(43,116,73,0)');
      brush.fillStyle = cloud; brush.fillRect(x - r, y - r, r * 2, r * 2);
    }
    brush.strokeStyle = 'rgba(193,227,166,.55)'; brush.lineWidth = 2;
    for (let x = 100; x < 1100; x += 235) for (let y = 115; y < 600; y += 270) {
      for (const r of [34, 41]) { brush.beginPath(); brush.arc(x, y, r, 0, Math.PI * 2); brush.stroke(); }
      brush.beginPath(); brush.moveTo(x - 20, y); brush.lineTo(x + 20, y); brush.moveTo(x, y - 21); brush.lineTo(x, y + 21); brush.stroke();
      brush.strokeRect(x - 13, y - 13, 26, 26);
    }
  } else if (id === 'solar') {
    const gold = brush.createLinearGradient(0, 0, 1024, 512);
    gold.addColorStop(0, '#f6c84c'); gold.addColorStop(0.5, '#a85417'); gold.addColorStop(1, '#ffdc72');
    brush.fillStyle = gold; brush.fillRect(0, 0, 1024, 512);
    for (let x = 90; x < 1150; x += 245) for (let y = 95; y < 600; y += 265) {
      brush.strokeStyle = '#ffe99b'; brush.lineWidth = 2.6;
      for (let ray = 0; ray < 24; ray++) {
        const a = ray * Math.PI / 12, reach = ray % 2 ? 62 : 78;
        brush.beginPath(); brush.moveTo(x + Math.cos(a) * 45, y + Math.sin(a) * 45); brush.lineTo(x + Math.cos(a) * reach, y + Math.sin(a) * reach); brush.stroke();
      }
      for (const r of [25, 35, 39]) { brush.beginPath(); brush.arc(x, y, r, 0, Math.PI * 2); brush.stroke(); }
      brush.fillStyle = '#f4bd3e'; brush.beginPath(); brush.arc(x, y, 22, 0, Math.PI * 2); brush.fill();
    }
  } else if (id === 'hologram') {
    for (let x = -500; x < 1400; x += 9) {
      brush.strokeStyle = `hsla(${(x * 0.8 + 720) % 360},80%,68%,.7)`; brush.lineWidth = 5;
      brush.beginPath(); brush.moveTo(x, 0); brush.lineTo(x + 410, 512); brush.stroke();
    }
    for (let y = -20; y < 580; y += 72) for (let x = -40; x < 1100; x += 84) {
      brush.strokeStyle = 'rgba(227,247,255,.7)'; brush.lineWidth = 2;
      brush.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; brush.lineTo(x + Math.cos(a) * 36, y + Math.sin(a) * 36); } brush.closePath(); brush.stroke();
      brush.fillStyle = 'rgba(16,36,74,.25)'; brush.fill();
    }
  } else if (id === 'dragon') {
    // Overlapping pointed scales with gold raised edges and deep red interiors.
    for (let row = -1; row < 10; row++) for (let column = -1; column < 19; column++) {
      const x = column * 64 + (row & 1) * 32, y = row * 65;
      const scale = brush.createLinearGradient(x, y, x, y + 78);
      scale.addColorStop(0, '#49121e'); scale.addColorStop(0.6, '#b43c31'); scale.addColorStop(1, '#641b28');
      brush.fillStyle = scale; brush.strokeStyle = '#c49b4f'; brush.lineWidth = 2;
      brush.beginPath(); brush.moveTo(x - 32, y); brush.quadraticCurveTo(x - 32, y + 48, x, y + 78);
      brush.quadraticCurveTo(x + 32, y + 48, x + 32, y); brush.closePath(); brush.fill(); brush.stroke();
      brush.strokeStyle = 'rgba(242,185,80,.35)'; brush.lineWidth = 1; brush.beginPath(); brush.moveTo(x, y + 12); brush.lineTo(x, y + 58); brush.stroke();
    }
  } else if (id === 'aurora') {
    for (let band = 0; band < 6; band++) {
      const gradient = brush.createLinearGradient(0, band * 60, 0, band * 60 + 135);
      gradient.addColorStop(0, 'rgba(85,243,177,0)'); gradient.addColorStop(0.45, band & 1 ? 'rgba(145,88,225,.65)' : 'rgba(42,235,161,.75)'); gradient.addColorStop(1, 'rgba(32,116,147,0)');
      brush.fillStyle = gradient; brush.beginPath();
      for (let x = 0; x <= 1024; x += 8) { const y = band * 68 + Math.sin(x / 120 + band) * 51 + Math.sin(x / 43) * 10; if (!x) brush.moveTo(x, y); else brush.lineTo(x, y); }
      for (let x = 1024; x >= 0; x -= 8) brush.lineTo(x, band * 68 + Math.sin(x / 120 + band) * 51 + Math.sin(x / 43) * 10 + 95);
      brush.closePath(); brush.fill();
    }
    brush.fillStyle = '#c1f5ea'; for (let i = 0; i < 130; i++) brush.fillRect(noise() * 1024, noise() * 512, 1.1, 1.1);
  } else if (id === 'sapphire') {
    for (let y = -40; y < 600; y += 105) for (let x = -40; x < 1100; x += 120) {
      const cx = x + (Math.round(y / 105) & 1) * 60;
      for (let face = 0; face < 6; face++) {
        const a = face * Math.PI / 3, b = (face + 1) * Math.PI / 3;
        brush.fillStyle = ['#203d85', '#326bb7', '#8eb8df', '#1a3475', '#101f53', '#487bb4'][face];
        brush.strokeStyle = 'rgba(181,211,247,.45)'; brush.lineWidth = 1.3;
        brush.beginPath(); brush.moveTo(cx, y); brush.lineTo(cx + Math.cos(a) * 58, y + Math.sin(a) * 58); brush.lineTo(cx + Math.cos(b) * 58, y + Math.sin(b) * 58); brush.closePath(); brush.fill(); brush.stroke();
      }
      brush.fillStyle = '#c2dff1'; brush.beginPath(); brush.arc(cx - 7, y - 8, 2.5, 0, Math.PI * 2); brush.fill();
    }
  } else if (id === 'eclipse') {
    for (let y = 85; y < 600; y += 240) for (let x = 110; x < 1150; x += 240) {
      const halo = brush.createRadialGradient(x, y, 30, x, y, 91);
      halo.addColorStop(0, 'rgba(255,197,105,.9)'); halo.addColorStop(0.48, 'rgba(236,103,34,.55)'); halo.addColorStop(1, 'rgba(192,53,44,0)');
      brush.fillStyle = halo; brush.fillRect(x - 91, y - 91, 182, 182);
      brush.fillStyle = '#f2c57e'; brush.beginPath(); brush.arc(x, y, 47, 0, Math.PI * 2); brush.fill();
      brush.fillStyle = '#171827'; brush.beginPath(); brush.arc(x + 10, y - 5, 44, 0, Math.PI * 2); brush.fill();
    }
  } else if (id === 'nebula') {
    for (let arm = 0; arm < 5; arm++) for (let step = 0; step < 150; step++) {
      const a = step * 0.064 + arm * Math.PI * 0.4, r = 8 + step * 3.7;
      const x = 512 + Math.cos(a) * r, y = 256 + Math.sin(a) * r * 0.48, size = 10 + noise() * 31;
      const cloud = brush.createRadialGradient(x, y, 0, x, y, size);
      cloud.addColorStop(0, arm & 1 ? 'rgba(223,90,175,.20)' : 'rgba(99,126,238,.24)'); cloud.addColorStop(1, 'rgba(80,40,130,0)');
      brush.fillStyle = cloud; brush.fillRect(x - size, y - size, size * 2, size * 2);
    }
    for (let i = 0; i < 180; i++) { brush.fillStyle = i % 5 ? '#bfa7df' : '#fae6ff'; brush.fillRect(noise() * 1024, noise() * 512, i % 5 ? 1.2 : 2.5, 1.2); }
  } else if (id === 'diamond') {
    for (let y = -64; y < 600; y += 128) for (let x = -64; x < 1150; x += 128) {
      const cx = x + ((y / 128) & 1) * 64, cy = y;
      const corners = [[cx, cy - 65], [cx + 64, cy], [cx, cy + 65], [cx - 64, cy]];
      for (let face = 0; face < 4; face++) {
        const a = corners[face], b = corners[(face + 1) % 4];
        brush.fillStyle = ['#e7f4f6', '#7898b3', '#c6dce7', '#425b79'][face]; brush.strokeStyle = '#effaff'; brush.lineWidth = 1.6;
        brush.beginPath(); brush.moveTo(cx - 10, cy - 9); brush.lineTo(a[0], a[1]); brush.lineTo(b[0], b[1]); brush.closePath(); brush.fill(); brush.stroke();
      }
    }
  } else if (id === 'astral') {
    brush.strokeStyle = '#d6b665'; brush.lineWidth = 1.8;
    for (let x = 120; x < 1200; x += 275) for (let y = 115; y < 650; y += 265) {
      for (let orbit = 0; orbit < 3; orbit++) { brush.beginPath(); brush.ellipse(x, y, 87, 32, orbit * Math.PI / 3, 0, Math.PI * 2); brush.stroke(); }
      brush.fillStyle = '#f4d887'; brush.beginPath();
      for (let point = 0; point < 8; point++) { const a = point * Math.PI / 4, r = point & 1 ? 9 : 35; brush.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      brush.closePath(); brush.fill();
      for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; brush.fillRect(x + Math.cos(a) * 82 - 2, y + Math.sin(a) * 82 - 2, 4, 4); }
    }
    brush.fillStyle = '#b6c5de'; for (let i = 0; i < 100; i++) brush.fillRect(noise() * 1024, noise() * 512, 1.1, 1.1);
  } else if (id === 'singularity') {
    for (let ring = 0; ring < 22; ring++) {
      const r = 48 + ring * 13;
      brush.strokeStyle = `hsla(${250 + ring * 4},80%,${42 + ring % 3 * 12}%,${0.95 - ring * 0.025})`; brush.lineWidth = ring % 3 ? 3.2 : 7;
      brush.beginPath(); brush.ellipse(512, 256, r * 1.7, r * 0.46, -0.22, 0, Math.PI * 2); brush.stroke();
    }
    const core = brush.createRadialGradient(512, 256, 39, 512, 256, 78);
    core.addColorStop(0, '#05040c'); core.addColorStop(0.65, '#0b0717'); core.addColorStop(0.86, '#b794ef'); core.addColorStop(1, 'rgba(146,76,238,0)');
    brush.fillStyle = core; brush.beginPath(); brush.arc(512, 256, 78, 0, Math.PI * 2); brush.fill();
    brush.fillStyle = '#d2bce7'; for (let i = 0; i < 110; i++) { const x = noise() * 1024, y = noise() * 512; if (Math.hypot(x - 512, y - 256) > 100) brush.fillRect(x, y, 1.3, 1.3); }
  }
}
function createBallSkinTexture(id) {
  const [surface, brush] = textureCanvas(1024, 512);
  const noise = skinRandomFactory(id);
  const palette = {
    street: [57, 61, 62], ice: [123, 177, 191], gold: [180, 128, 35],
    galaxy: [26, 25, 55], lava: [43, 30, 27], neon: [14, 31, 34],
    camo: [100, 110, 70], marble: [219, 219, 221], carbon: [33, 34, 38],
    retro: [181, 153, 107], zebra: [226, 225, 217], circuit: [23, 51, 35],
    chrome: [174, 184, 193], rainbow: [72, 65, 130], ocean: [17, 88, 130],
    forest: [40, 61, 40], royal: [61, 37, 87], graffiti: [60, 58, 60],
    comic: [233, 187, 56], sunset: [197, 113, 99], pixel: [45, 50, 84],
    crystal: [168, 193, 211], phoenix: [38, 32, 39],
    obsidian: [19, 20, 28], jade: [27, 91, 66], solar: [190, 105, 22],
    hologram: [84, 131, 157], dragon: [91, 25, 28], aurora: [12, 29, 48],
    sapphire: [22, 47, 111], eclipse: [29, 25, 46], nebula: [33, 18, 58],
    diamond: [133, 157, 171], astral: [19, 33, 60], singularity: [13, 10, 29]
  }[id] || [197, 104, 41];
  const image = brush.createImageData(1024, 512);
  for (let p = 0; p < image.data.length; p += 4) {
    const grain = (noise() - 0.5) * 16;
    image.data[p] = palette[0] + grain;
    image.data[p + 1] = palette[1] + grain;
    image.data[p + 2] = palette[2] + grain;
    image.data[p + 3] = 255;
  }
  brush.putImageData(image, 0, 0);
  if (id === 'street') {
    for (let i = 0; i < 35; i++) {
      const x = noise() * 1024, y = noise() * 512, r = 20 + noise() * 70;
      const wear = brush.createRadialGradient(x, y, 0, x, y, r);
      wear.addColorStop(0, 'rgba(168,171,161,.13)'); wear.addColorStop(1, 'rgba(168,171,161,0)');
      brush.fillStyle = wear; brush.fillRect(x - r, y - r, r * 2, r * 2);
    }
    brush.lineWidth = 0.6;
    for (let i = 0; i < 150; i++) {
      const x = noise() * 1024, y = noise() * 512;
      brush.strokeStyle = 'rgba(210,216,204,.15)'; brush.beginPath();
      brush.moveTo(x, y); brush.lineTo(x + 4 + noise() * 20, y + noise() * 5); brush.stroke();
    }
  } else if (id === 'ice') {
    for (let i = 0; i < 50; i++) {
      const x = noise() * 1024, y = noise() * 512, r = 22 + noise() * 70;
      brush.fillStyle = `rgba(220,248,251,${0.035 + noise() * 0.11})`;
      brush.strokeStyle = 'rgba(223,252,255,.18)'; brush.lineWidth = 0.7;
      brush.beginPath(); brush.moveTo(x, y - r);
      brush.lineTo(x + r * 0.66, y - r * 0.15); brush.lineTo(x + r * 0.48, y + r * 0.7);
      brush.lineTo(x - r * 0.35, y + r * 0.9); brush.lineTo(x - r * 0.58, y - r * 0.2);
      brush.closePath(); brush.fill(); brush.stroke();
    }
  } else if (id === 'gold') {
    const metal = brush.createLinearGradient(0, 0, 1024, 512);
    metal.addColorStop(0, 'rgba(255,223,114,.32)'); metal.addColorStop(0.32, 'rgba(139,87,17,.08)');
    metal.addColorStop(0.62, 'rgba(255,229,153,.22)'); metal.addColorStop(1, 'rgba(78,46,7,.23)');
    brush.fillStyle = metal; brush.fillRect(0, 0, 1024, 512);
    brush.lineWidth = 0.55;
    for (let i = 0; i < 500; i++) {
      const y = noise() * 700 - 150;
      brush.strokeStyle = `rgba(255,233,165,${0.025 + noise() * 0.025})`;
      brush.beginPath(); brush.moveTo(0, y); brush.lineTo(1024, y + 200); brush.stroke();
    }
  } else if (id === 'galaxy') {
    for (let i = 0; i < 28; i++) {
      const x = noise() * 1024, y = noise() * 512, r = 30 + noise() * 125;
      const cloud = brush.createRadialGradient(x, y, 0, x, y, r);
      cloud.addColorStop(0, i % 2 ? 'rgba(84,89,180,.38)' : 'rgba(117,56,158,.38)');
      cloud.addColorStop(1, 'rgba(60,49,115,0)');
      brush.fillStyle = cloud; brush.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 100; i++) {
      const x = noise() * 1024, y = noise() * 512, r = 0.55 + noise() * 1.3;
      brush.fillStyle = `rgba(205,217,244,${0.28 + noise() * 0.48})`;
      brush.beginPath(); brush.arc(x, y, r, 0, Math.PI * 2); brush.fill();
    }
  } else if (id === 'lava') {
    for (let i = 0; i < 15; i++) {
      let x = noise() * 1024, y = noise() * 512;
      brush.beginPath(); brush.moveTo(x, y);
      for (let step = 0; step < 7; step++) {
        x += 7 + noise() * 35; y += (noise() - 0.5) * 80; brush.lineTo(x, y);
      }
      brush.strokeStyle = 'rgba(163,44,8,.85)'; brush.lineWidth = 7; brush.shadowBlur = 9; brush.shadowColor = '#e44c12'; brush.stroke();
      brush.shadowBlur = 0; brush.strokeStyle = '#dc681f'; brush.lineWidth = 2.3; brush.stroke();
      brush.strokeStyle = 'rgba(255,182,73,.80)'; brush.lineWidth = 0.85; brush.stroke();
    }
  } else if (id === 'neon') {
    // Bright cyan / lime grid printed into dark rubber, with soft painted halos.
    brush.lineWidth = 3.4; brush.shadowBlur = 9;
    for (let x = 0; x <= 1024; x += 64) {
      brush.strokeStyle = x % 128 ? '#45ffa4' : '#18cfe2'; brush.shadowColor = brush.strokeStyle;
      brush.beginPath(); brush.moveTo(x, 0); brush.lineTo(x, 512); brush.stroke();
    }
    for (let y = 0; y <= 512; y += 64) {
      brush.strokeStyle = y % 128 ? '#18cfe2' : '#45ffa4'; brush.shadowColor = brush.strokeStyle;
      brush.beginPath(); brush.moveTo(0, y); brush.lineTo(1024, y); brush.stroke();
    }
    brush.shadowBlur = 0; brush.fillStyle = '#b3ffd8';
    for (let y = 64; y < 512; y += 128) for (let x = 64; x < 1024; x += 128) brush.fillRect(x - 3, y - 3, 6, 6);
  } else if (id === 'camo') {
    const shades = ['#374c37', '#566448', '#92936b', '#b1a17a', '#28352c'];
    for (let i = 0; i < 90; i++) {
      const x = noise() * 1120 - 48, y = noise() * 610 - 48, r = 27 + noise() * 48;
      brush.fillStyle = shades[i % shades.length]; brush.beginPath();
      brush.moveTo(x + r, y);
      for (let j = 0; j < 9; j++) {
        const a = j * Math.PI * 2 / 8, reach = r * (0.70 + noise() * 0.55);
        const nx = x + Math.cos(a) * reach, ny = y + Math.sin(a) * reach * 0.65;
        brush.quadraticCurveTo(x + Math.cos(a - 0.35) * reach * 1.2, y + Math.sin(a - 0.35) * reach, nx, ny);
      }
      brush.closePath(); brush.fill();
    }
  } else if (id === 'marble') {
    for (let i = 0; i < 17; i++) {
      const y = noise() * 512;
      brush.beginPath(); brush.moveTo(-30, y);
      let previousX = -30, previousY = y;
      for (let x = 120; x <= 1110; x += 130) {
        const nextY = previousY + (noise() - 0.47) * 120;
        brush.bezierCurveTo(previousX + 45, previousY - 35, x - 35, nextY + 30, x, nextY);
        previousX = x; previousY = nextY;
      }
      brush.strokeStyle = 'rgba(166,147,189,.21)'; brush.lineWidth = 12 + noise() * 11; brush.stroke();
      brush.strokeStyle = 'rgba(114,87,148,.56)'; brush.lineWidth = 1.8 + noise() * 2.3; brush.stroke();
      brush.strokeStyle = 'rgba(244,239,250,.55)'; brush.lineWidth = 0.65; brush.stroke();
    }
  } else if (id === 'carbon') {
    // Alternating horizontal and vertical strands produce a woven carbon finish.
    for (let y = 0; y < 512; y += 20) for (let x = 0; x < 1024; x += 20) {
      const across = ((x + y) / 20) % 2 === 0;
      const strand = brush.createLinearGradient(x, y, across ? x : x + 20, across ? y + 20 : y);
      strand.addColorStop(0, '#14161c'); strand.addColorStop(0.44, '#4c515b'); strand.addColorStop(1, '#23272e');
      brush.fillStyle = strand; brush.fillRect(x, y, 19, 19);
      brush.strokeStyle = 'rgba(130,139,151,.23)'; brush.lineWidth = 0.7;
      for (let n = 3; n < 20; n += 4) {
        brush.beginPath(); brush.moveTo(across ? x : x + n, across ? y + n : y);
        brush.lineTo(across ? x + 18 : x + n, across ? y + n : y + 18); brush.stroke();
      }
    }
  } else if (id === 'retro') {
    const shades = ['#b4966d', '#dbc296', '#7f6348', '#c3a676'];
    for (let y = 0; y < 512; y += 256) for (let x = 0; x < 1024; x += 256) {
      brush.fillStyle = shades[(x / 256 + y / 256) % 4]; brush.fillRect(x, y, 256, 256);
      const fade = brush.createLinearGradient(x, y, x + 256, y + 256);
      fade.addColorStop(0, 'rgba(247,220,165,.18)'); fade.addColorStop(1, 'rgba(74,40,18,.15)');
      brush.fillStyle = fade; brush.fillRect(x, y, 256, 256);
    }
    brush.fillStyle = 'rgba(65,41,25,.64)'; brush.textAlign = 'center';
    brush.font = 'bold 37px Georgia'; brush.fillText('ATHLETIC', 128, 170); brush.fillText('ATHLETIC', 640, 426);
    brush.font = '20px Georgia'; brush.fillText('1976', 128, 200); brush.fillText('1976', 640, 456);
    brush.strokeStyle = 'rgba(93,59,32,.24)'; brush.lineWidth = 2;
    for (let i = 0; i < 140; i++) {
      const x = noise() * 1024, y = noise() * 512;
      brush.beginPath(); brush.moveTo(x, y); brush.lineTo(x + 10 + noise() * 12, y + 2); brush.stroke();
    }
  } else if (id === 'zebra') {
    brush.fillStyle = '#e2e1d9'; brush.fillRect(0, 0, 1024, 512);
    for (let stripe = -1; stripe < 14; stripe++) {
      const center = stripe * 88, width = 20 + noise() * 20;
      brush.fillStyle = '#16191c'; brush.beginPath();
      for (let y = 0; y <= 520; y += 10) {
        const x = center + Math.sin(y / 81 + stripe * 0.82) * 35 + Math.sin(y / 39 + stripe) * 8;
        if (!y) brush.moveTo(x - width / 2, y); else brush.lineTo(x - width / 2, y);
      }
      for (let y = 520; y >= 0; y -= 10) {
        const x = center + Math.sin(y / 81 + stripe * 0.82) * 35 + Math.sin(y / 39 + stripe) * 8;
        brush.lineTo(x + width / 2, y);
      }
      brush.closePath(); brush.fill();
    }
  } else if (id === 'circuit') {
    for (let i = 0; i < 75; i++) {
      const x = Math.floor(noise() * 64) * 16, y = Math.floor(noise() * 32) * 16;
      const dx = (2 + Math.floor(noise() * 7)) * 16, dy = (noise() < 0.5 ? -1 : 1) * (1 + Math.floor(noise() * 5)) * 16;
      brush.strokeStyle = i % 3 ? '#67b994' : '#b7ac62'; brush.lineWidth = i % 3 ? 2.4 : 3.5;
      brush.beginPath(); brush.moveTo(x, y); brush.lineTo(x + dx, y); brush.lineTo(x + dx, y + dy); brush.lineTo(x + dx + 24, y + dy); brush.stroke();
      brush.fillStyle = '#cad39b'; brush.beginPath(); brush.arc(x, y, 4.2, 0, Math.PI * 2); brush.fill();
      brush.beginPath(); brush.arc(x + dx + 24, y + dy, 4.2, 0, Math.PI * 2); brush.fill();
    }
    for (let y = 72; y < 512; y += 144) for (let x = 86; x < 1024; x += 208) {
      brush.fillStyle = '#152922'; brush.fillRect(x, y, 34, 44);
      brush.strokeStyle = '#aeaa6e'; brush.lineWidth = 2;
      for (let n = 5; n < 40; n += 7) {
        brush.beginPath(); brush.moveTo(x - 5, y + n); brush.lineTo(x + 39, y + n); brush.stroke();
      }
      brush.fillStyle = '#152922'; brush.fillRect(x + 2, y + 2, 30, 40);
    }
  } else if (id === 'chrome') {
    const steel = brush.createLinearGradient(0, 0, 0, 512);
    steel.addColorStop(0, '#d6dce1'); steel.addColorStop(0.23, '#89939d'); steel.addColorStop(0.40, '#eef0ed');
    steel.addColorStop(0.49, '#a8b0b6'); steel.addColorStop(0.54, '#626d78'); steel.addColorStop(0.78, '#c9cdd0'); steel.addColorStop(1, '#929ca5');
    brush.fillStyle = steel; brush.fillRect(0, 0, 1024, 512);
    brush.lineWidth = 0.55;
    for (let i = 0; i < 750; i++) {
      const y = noise() * 512;
      brush.strokeStyle = i % 2 ? 'rgba(247,252,255,.075)' : 'rgba(42,54,68,.045)';
      brush.beginPath(); brush.moveTo(0, y); brush.lineTo(1024, y + 2); brush.stroke();
    }
  } else if (id === 'rainbow') {
    const bands = ['#ee4261', '#f98731', '#f2d650', '#55c18a', '#35b7d1', '#5968d0', '#aa62bd'];
    for (let band = -3; band < 14; band++) {
      brush.fillStyle = bands[(band + 7) % 7]; brush.beginPath();
      for (let x = 0; x <= 1024; x += 12) {
        const y = band * 68 + x * 0.19 + Math.sin(x / 115) * 27;
        if (!x) brush.moveTo(x, y); else brush.lineTo(x, y);
      }
      for (let x = 1024; x >= 0; x -= 12) brush.lineTo(x, band * 68 + 63 + x * 0.19 + Math.sin(x / 115) * 27);
      brush.closePath(); brush.fill();
    }
  } else if (id === 'ocean') {
    const sea = brush.createLinearGradient(0, 0, 0, 512);
    sea.addColorStop(0, '#2d9fc0'); sea.addColorStop(0.5, '#176b9a'); sea.addColorStop(1, '#103852');
    brush.fillStyle = sea; brush.fillRect(0, 0, 1024, 512);
    for (let row = -1; row < 9; row++) {
      brush.strokeStyle = row % 2 ? 'rgba(119,218,229,.50)' : 'rgba(169,233,237,.28)'; brush.lineWidth = row % 2 ? 6 : 3;
      brush.beginPath();
      for (let x = 0; x <= 1024; x += 8) {
        const y = row * 66 + Math.sin(x / 72 + row * 0.8) * 17;
        if (!x) brush.moveTo(x, y); else brush.lineTo(x, y);
      }
      brush.stroke();
    }
    for (let i = 0; i < 85; i++) {
      const x = noise() * 1024, y = noise() * 512, r = 2 + noise() * 8;
      brush.strokeStyle = 'rgba(187,241,244,.30)'; brush.lineWidth = 1.3;
      brush.beginPath(); brush.arc(x, y, r, 0, Math.PI * 2); brush.stroke();
      brush.fillStyle = 'rgba(231,255,251,.42)'; brush.beginPath(); brush.arc(x - r * 0.25, y - r * 0.30, r * 0.18, 0, Math.PI * 2); brush.fill();
    }
  } else if (id === 'forest') {
    for (let i = 0; i < 68; i++) {
      const x = noise() * 1024, y = noise() * 512, length = 38 + noise() * 50;
      brush.save(); brush.translate(x, y); brush.rotate(noise() * Math.PI * 2);
      brush.fillStyle = i % 3 === 0 ? '#788651' : i % 3 === 1 ? '#394c31' : '#9a9a5b';
      brush.beginPath(); brush.moveTo(0, -length * 0.55);
      brush.bezierCurveTo(length * 0.35, -length * 0.18, length * 0.30, length * 0.28, 0, length * 0.55);
      brush.bezierCurveTo(-length * 0.30, length * 0.28, -length * 0.35, -length * 0.18, 0, -length * 0.55); brush.fill();
      brush.strokeStyle = 'rgba(199,195,126,.45)'; brush.lineWidth = 1.2;
      brush.beginPath(); brush.moveTo(0, -length * 0.40); brush.lineTo(0, length * 0.7); brush.stroke();
      for (let branch = -2; branch <= 2; branch++) {
        brush.beginPath(); brush.moveTo(0, branch * length * 0.12); brush.lineTo(length * 0.15, branch * length * 0.12 - length * 0.15); brush.stroke();
        brush.beginPath(); brush.moveTo(0, branch * length * 0.12); brush.lineTo(-length * 0.15, branch * length * 0.12 - length * 0.15); brush.stroke();
      }
      brush.restore();
    }
  } else if (id === 'royal') {
    brush.strokeStyle = '#cba657'; brush.lineWidth = 2.8;
    for (let y = 80; y < 600; y += 176) for (let x = 80; x < 1120; x += 176) {
      brush.beginPath(); brush.arc(x, y, 49, 0, Math.PI * 2); brush.stroke();
      brush.lineWidth = 1.6;
      for (let petal = 0; petal < 8; petal++) {
        const a = petal * Math.PI / 4;
        brush.save(); brush.translate(x, y); brush.rotate(a);
        brush.beginPath(); brush.moveTo(0, -8);
        brush.bezierCurveTo(22, -20, 23, -46, 0, -60); brush.bezierCurveTo(-23, -46, -22, -20, 0, -8); brush.stroke();
        brush.restore();
      }
      brush.fillStyle = '#dec079'; brush.beginPath(); brush.arc(x, y, 6, 0, Math.PI * 2); brush.fill();
      brush.lineWidth = 2.8;
    }
  } else if (id === 'graffiti') {
    const paints = ['#e86795', '#48c6b3', '#e9b741', '#5d89c6', '#ba82d1'];
    for (let i = 0; i < 35; i++) {
      const x = noise() * 1024, y = noise() * 512, radius = 22 + noise() * 45;
      brush.fillStyle = paints[i % paints.length]; brush.globalAlpha = 0.30 + noise() * 0.26;
      brush.beginPath(); brush.arc(x, y, radius, 0, Math.PI * 2); brush.fill();
      for (let dot = 0; dot < 30; dot++) {
        const a = noise() * Math.PI * 2, r = radius * (0.7 + noise() * 1.1);
        brush.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 2 + noise() * 3, 2 + noise() * 3);
      }
    }
    brush.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      brush.save(); brush.translate(110 + i * 205, i % 2 ? 360 : 165); brush.rotate(-0.22 + noise() * 0.15);
      brush.font = 'italic bold 68px Arial'; brush.textAlign = 'center'; brush.lineJoin = 'round'; brush.lineWidth = 8;
      brush.strokeStyle = '#23242b'; brush.strokeText(i % 2 ? 'FLOW' : 'HOOP', 0, 0);
      brush.fillStyle = paints[i]; brush.fillText(i % 2 ? 'FLOW' : 'HOOP', 0, 0);
      brush.restore();
    }
  } else if (id === 'comic') {
    const colors = ['#d74644', '#f0c344', '#458caf', '#ece4c6'];
    for (let y = 0; y < 512; y += 256) for (let x = 0; x < 1024; x += 256) {
      brush.fillStyle = colors[(x / 256 + y / 256) % 4]; brush.fillRect(x, y, 256, 256);
      brush.fillStyle = 'rgba(17,32,44,.20)';
      for (let py = y + 6; py < y + 256; py += 12) for (let px = x + 6; px < x + 256; px += 12) {
        brush.beginPath(); brush.arc(px + (py % 24 ? 3 : 0), py, 2.8, 0, Math.PI * 2); brush.fill();
      }
      brush.strokeStyle = '#252933'; brush.lineWidth = 6; brush.strokeRect(x + 3, y + 3, 250, 250);
    }
    brush.save(); brush.translate(637, 410); brush.rotate(-0.15);
    brush.fillStyle = '#f0ebd9'; brush.strokeStyle = '#20252c'; brush.lineWidth = 5; brush.beginPath();
    for (let point = 0; point < 16; point++) {
      const a = point * Math.PI / 8, r = point % 2 ? 55 : 91;
      if (!point) brush.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.60); else brush.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.60);
    }
    brush.closePath(); brush.fill(); brush.stroke();
    brush.font = 'italic bold 29px Arial'; brush.fillStyle = '#222630'; brush.textAlign = 'center'; brush.fillText('SWISH!', 0, 10); brush.restore();
  } else if (id === 'sunset') {
    const dusk = brush.createLinearGradient(0, 0, 0, 512);
    dusk.addColorStop(0, '#654c91'); dusk.addColorStop(0.32, '#c06b97'); dusk.addColorStop(0.60, '#ee9864'); dusk.addColorStop(1, '#edc46e');
    brush.fillStyle = dusk; brush.fillRect(0, 0, 1024, 512);
    for (let spiral = 0; spiral < 4; spiral++) {
      brush.strokeStyle = spiral % 2 ? 'rgba(254,199,136,.65)' : 'rgba(117,65,103,.35)'; brush.lineWidth = spiral % 2 ? 13 : 23;
      brush.beginPath();
      for (let step = 0; step <= 250; step++) {
        const angle = step * 0.043 + spiral * Math.PI / 2, r = step * 2.7;
        const x = 512 + Math.cos(angle) * r, y = 256 + Math.sin(angle) * r * 0.62;
        if (!step) brush.moveTo(x, y); else brush.lineTo(x, y);
      }
      brush.stroke();
    }
  } else if (id === 'pixel') {
    const colors = ['#272c51', '#425887', '#5f83b1', '#65bea9', '#e2b878', '#c777a0', '#a375bd'];
    for (let y = 0; y < 512; y += 32) for (let x = 0; x < 1024; x += 32) {
      brush.fillStyle = colors[Math.floor(noise() * colors.length)]; brush.fillRect(x, y, 32, 32);
      if (noise() < 0.45) {
        brush.fillStyle = 'rgba(255,245,228,.16)'; brush.fillRect(x + 2, y + 2, 12, 12);
      }
    }
  } else if (id === 'crystal') {
    const gems = ['#80b5c9', '#a6cbd6', '#bac5df', '#ab96c5', '#d1cbdc', '#74a1b9', '#ddd9e7'];
    for (let y = 0; y < 576; y += 96) for (let x = 0; x < 1152; x += 128) {
      const mx = x + 46 + noise() * 36, my = y + 24 + noise() * 45;
      const corners = [[x, y], [x + 128, y], [x + 128, y + 96], [x, y + 96]];
      for (let face = 0; face < 4; face++) {
        const a = corners[face], b = corners[(face + 1) % 4];
        brush.fillStyle = gems[Math.floor(noise() * gems.length)];
        brush.strokeStyle = 'rgba(235,248,255,.35)'; brush.lineWidth = 1.3;
        brush.beginPath(); brush.moveTo(a[0], a[1]); brush.lineTo(b[0], b[1]); brush.lineTo(mx, my); brush.closePath(); brush.fill(); brush.stroke();
      }
    }
  } else if (id === 'phoenix') {
    // Repeated feather silhouettes have gold spines and red flame-shaped edges.
    for (let i = 0; i < 48; i++) {
      const x = noise() * 1024, y = noise() * 512, length = 62 + noise() * 74;
      brush.save(); brush.translate(x, y); brush.rotate(-0.75 + noise() * 1.50);
      const feather = brush.createLinearGradient(0, -length * 0.55, 0, length * 0.55);
      feather.addColorStop(0, '#e4b24a'); feather.addColorStop(0.36, '#e57721'); feather.addColorStop(1, '#9e2e20');
      brush.fillStyle = feather; brush.beginPath(); brush.moveTo(0, -length * 0.62);
      brush.bezierCurveTo(length * 0.42, -length * 0.25, length * 0.19, length * 0.13, 0, length * 0.57);
      brush.bezierCurveTo(-length * 0.18, length * 0.10, -length * 0.34, -length * 0.23, 0, -length * 0.62); brush.fill();
      brush.strokeStyle = '#f3c166'; brush.lineWidth = 1.9;
      brush.beginPath(); brush.moveTo(0, length * 0.60); brush.quadraticCurveTo(length * 0.08, 0, 0, -length * 0.50); brush.stroke();
      brush.strokeStyle = 'rgba(251,172,68,.60)'; brush.lineWidth = 1.0;
      for (let barb = -3; barb <= 3; barb++) {
        const by = barb * length * 0.09, reach = length * (0.18 - Math.abs(barb) * 0.027);
        brush.beginPath(); brush.moveTo(0, by + 7); brush.quadraticCurveTo(reach * 0.6, by, reach, by - 13); brush.stroke();
        brush.beginPath(); brush.moveTo(0, by + 7); brush.quadraticCurveTo(-reach * 0.6, by, -reach, by - 13); brush.stroke();
      }
      brush.restore();
    }
  }
  drawPremiumBallPattern(brush, id, noise);
  brush.shadowBlur = 0; brush.globalAlpha = 1;
  // Painted leather preserves its original micro-pattern. Polished stone and
  // metal receive near-flat relief rather than a coat of rubber-like pores.
  if (!smoothBallSkins.has(id) && id !== 'carbon') for (let y = 0; y < 512; y += 5) for (let x = 0; x < 1024; x += 5) {
    brush.fillStyle = `rgba(0,0,0,${0.015 + noise() * 0.04})`;
    brush.beginPath(); brush.ellipse(x + (y % 10 ? 2.5 : 0), y, 1.15, 1.1, 0, 0, Math.PI * 2); brush.fill();
    brush.fillStyle = 'rgba(255,255,255,.022)'; brush.fillRect(x + 1, y - 1, 1, 1);
  }
  const seam = {
    street: '#c0bfb4', ice: '#315965', gold: '#5b3815', galaxy: '#171622', lava: '#130e0b',
    neon: '#0d161b', camo: '#293328', marble: '#686076', carbon: '#111318',
    retro: '#4f3729', zebra: '#555c5c', circuit: '#17241d', chrome: '#424e5a',
    rainbow: '#25273b', ocean: '#123b51', forest: '#1c291f', royal: '#d2b365',
    graffiti: '#20222a', comic: '#20252c', sunset: '#653f56', pixel: '#20243c',
    crystal: '#596980', phoenix: '#251c1b', obsidian: '#b08c45', jade: '#153c2b',
    solar: '#7d3f0d', hologram: '#425582', dragon: '#dbad58', aurora: '#11232d',
    sapphire: '#a0b6e7', eclipse: '#8a5b48', nebula: '#492b64', diamond: '#4c6274',
    astral: '#d0b36b', singularity: '#7454a9'
  }[id] || '#402516';
  brush.strokeStyle = seam; brush.lineWidth = 10;
  for (const x of [0, 256, 512, 768, 1024]) {
    brush.beginPath(); brush.moveTo(x, 0); brush.lineTo(x, 512); brush.stroke();
  }
  brush.beginPath(); brush.moveTo(0, 256); brush.lineTo(1024, 256); brush.stroke();
  brush.lineWidth = 7;
  for (const offset of [0, Math.PI]) {
    brush.beginPath();
    for (let x = 0; x <= 1024; x += 4) {
      const y = 256 + Math.sin(x / 1024 * Math.PI * 2 + offset) * 156;
      if (!x) brush.moveTo(x, y); else brush.lineTo(x, y);
    }
    brush.stroke();
  }
  const lightLogo = ['street', 'neon', 'camo', 'carbon', 'circuit', 'forest', 'royal', 'graffiti', 'phoenix', 'obsidian', 'jade', 'dragon', 'aurora', 'sapphire', 'eclipse', 'nebula', 'astral', 'singularity'].includes(id);
  brush.fillStyle = lightLogo ? 'rgba(237,233,214,.60)' : 'rgba(9,12,17,.55)';
  brush.font = 'bold 25px Arial'; brush.textAlign = 'center'; brush.fillText('POTA', 630, 173);
  const texture = surfaceTexture(surface, 'basketball-' + id + '-albedo-1024', true); texture.wrapT = T.ClampToEdgeWrapping;
  return texture;
}

function setBallSkin(id) {
  if (!Object.prototype.hasOwnProperty.call(ballSkinSettings, id)) return false;
  if (id === selectedBallSkin) return true;
  if (!ballSkinTextures.has(id)) ballSkinTextures.set(id, createBallSkinTexture(id));
  const finish = ballSkinSettings[id];
  const smooth = smoothBallSkins.has(id), surface = createBallSurfaceMaps(id === 'carbon' ? 'carbon' : smooth ? 'smooth' : 'leather');
  ballMat.map = ballSkinTextures.get(id); ballMat.color.set(0xffffff);
  ballMat.roughness = finish.roughness; ballMat.metalness = finish.metalness;
  ballMat.bumpMap = surface.bumpMap; ballMat.roughnessMap = surface.roughnessMap;
  ballMat.bumpScale = smooth ? Math.max(0.0006, Math.min(finish.bump || 0.0009, 0.0011)) : id === 'carbon' ? 0.00055 : Math.min(finish.bump === undefined ? 0.0013 : finish.bump, 0.0014);
  ballMat.clearcoat = smooth ? 0.24 : id === 'carbon' ? 0.18 : 0.035; ballMat.clearcoatRoughness = smooth ? 0.24 : 0.68;
  const environment = finish.environment || finish.metalness > 0.35 || smooth;
  ballMat.envMap = environment ? ensureMetalEnvironment() : null;
  ballMat.envMapIntensity = environment ? 0.7 : 1;
  ballMat.emissive.setHex(finish.emissive); ballMat.emissiveIntensity = finish.glow;
  ballMat.emissiveMap = finish.glow ? ballMat.map : null;
  ballMat.needsUpdate = true; selectedBallSkin = id; reflectionReady = false;
  return true;
}

// One reusable 96-point pool. Birth/death is represented in fixed typed arrays;
// no meshes, vectors, matrices or textures are allocated during animation.
const cosmeticParticleCapacity = 96;
const cosmeticParticlePositions = new Float32Array(cosmeticParticleCapacity * 3);
const cosmeticParticleVelocity = new Float32Array(cosmeticParticleCapacity * 3);
const cosmeticParticleColors = new Float32Array(cosmeticParticleCapacity * 3);
const cosmeticParticleSizes = new Float32Array(cosmeticParticleCapacity);
const cosmeticParticleAlphas = new Float32Array(cosmeticParticleCapacity);
const cosmeticParticleAge = new Float32Array(cosmeticParticleCapacity);
const cosmeticParticleLife = new Float32Array(cosmeticParticleCapacity);
const cosmeticParticleScale = new Float32Array(cosmeticParticleCapacity);
const cosmeticParticlePhase = new Float32Array(cosmeticParticleCapacity);
const cosmeticParticleAngles = new Float32Array(cosmeticParticleCapacity);
const cosmeticParticleGeometry = new T.BufferGeometry();
cosmeticParticleGeometry.setAttribute('position', new T.BufferAttribute(cosmeticParticlePositions, 3).setUsage(T.DynamicDrawUsage));
cosmeticParticleGeometry.setAttribute('aColor', new T.BufferAttribute(cosmeticParticleColors, 3).setUsage(T.DynamicDrawUsage));
cosmeticParticleGeometry.setAttribute('aSize', new T.BufferAttribute(cosmeticParticleSizes, 1).setUsage(T.DynamicDrawUsage));
cosmeticParticleGeometry.setAttribute('aAlpha', new T.BufferAttribute(cosmeticParticleAlphas, 1).setUsage(T.DynamicDrawUsage));
cosmeticParticleGeometry.setAttribute('aAngle', new T.BufferAttribute(cosmeticParticleAngles, 1).setUsage(T.DynamicDrawUsage));
cosmeticParticleGeometry.setDrawRange(0, cosmeticParticleCapacity);
const cosmeticParticleMaterial = new T.ShaderMaterial({
  transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  uniforms: { uPointScale: { value: 700 }, uStyle: { value: 1 } },
  vertexShader: `
    attribute vec3 aColor;
    attribute float aSize;
    attribute float aAlpha;
    attribute float aAngle;
    uniform float uPointScale;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vAngle;
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = clamp(aSize * uPointScale / max(0.1, -mvPosition.z), 1.0, 40.0);
      vColor = aColor; vAlpha = mvPosition.z < 0.0 ? aAlpha : 0.0; vAngle = aAngle;
    }
  `,
  fragmentShader: `
    uniform float uStyle;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vAngle;
    float segment(vec2 p, vec2 a, vec2 b) {
      vec2 ab = b - a;
      return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
    }
    void main() {
      if (vAlpha < 0.001) discard;
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float cs = cos(vAngle), sn = sin(vAngle);
      p = mat2(cs, -sn, sn, cs) * p;
      float r = length(p), angle = atan(p.y, p.x);
      float glow = exp(-5.0 * r * r) * 0.25;
      float shape = 0.0;
      if (uStyle < 1.5) {
        // Short, hot sparks.
        shape = exp(-12.0 * (p.x * p.x + p.y * p.y * 0.38));
      } else if (uStyle < 2.5) {
        shape = (1.0 - smoothstep(0.50, 0.85, abs(p.x) + abs(p.y))) * 0.75 + glow;
      } else if (uStyle < 3.5) {
        float edge = 0.34 + 0.20 * cos(5.0 * angle);
        shape = (1.0 - smoothstep(edge - 0.03, edge + 0.04, r)) * 0.85 + glow;
      } else if (uStyle < 4.5) {
        shape = exp(-15.0 * r * r) * 0.80 + exp(-70.0 * (r - 0.41) * (r - 0.41)) * 0.30 + glow;
      } else if (uStyle < 5.5) {
        // Six arms and little crystal branches make a snowflake.
        float arm = min(abs(p.x), min(abs(p.x * 0.5 + p.y * 0.866), abs(p.x * 0.5 - p.y * 0.866)));
        float branches = abs(sin(angle * 6.0 + r * 9.0)) * 0.06;
        shape = exp(-850.0 * arm * arm) * (1.0 - smoothstep(0.61, 0.69, r));
        shape += exp(-1600.0 * branches * branches) * exp(-180.0 * (r - 0.42) * (r - 0.42)) * 0.28;
      } else if (uStyle < 6.5) {
        vec2 h = vec2(p.x * 1.35, -p.y * 1.35 + 0.25);
        float a = dot(h, h) - 0.72;
        float heart = a * a * a - h.x * h.x * h.y * h.y * h.y;
        shape = 1.0 - smoothstep(-0.018, 0.045, heart);
      } else if (uStyle < 7.5) {
        float bolt = min(segment(p, vec2(0.17, -0.72), vec2(-0.22, -0.04)), min(segment(p, vec2(-0.22, -0.04), vec2(0.24, -0.12)), segment(p, vec2(0.24, -0.12), vec2(-0.14, 0.72))));
        shape = exp(-420.0 * bolt * bolt) + exp(-36.0 * bolt * bolt) * 0.28;
      } else if (uStyle < 8.5) {
        shape = exp(-600.0 * (r - 0.61) * (r - 0.61)) * 0.72;
        shape += exp(-320.0 * dot(p - vec2(-0.25, -0.31), p - vec2(-0.25, -0.31))) * 0.9;
      } else if (uStyle < 9.5) {
        float rectangle = max(abs(p.x) - 0.29, abs(p.y) - 0.62);
        shape = 1.0 - smoothstep(-0.02, 0.025, rectangle);
      } else if (uStyle < 10.5) {
        vec2 flame = vec2(p.x * (1.0 + p.y * 0.45), p.y + 0.16);
        shape = exp(-12.0 * dot(flame, flame)) + exp(-45.0 * r * r) * 0.7;
      } else if (uStyle < 11.5) {
        float phase = fract((angle + 3.14159265) / 6.2831853);
        float spiral = min(abs(r - (0.14 + phase * 0.55)), abs(r - (0.14 + fract(phase + 0.5) * 0.55)));
        shape = exp(-750.0 * spiral * spiral) * 0.8 + glow * 0.55;
      } else if (uStyle < 12.5) {
        float head = exp(-60.0 * dot(p - vec2(0.0, -0.37), p - vec2(0.0, -0.37)));
        float tail = exp(-p.x * p.x * (30.0 + 95.0 * max(0.0, p.y))) * smoothstep(-0.4, -0.1, p.y) * (1.0 - smoothstep(0.25, 0.9, p.y));
        shape = head + tail * 0.63;
      } else if (uStyle < 13.5) {
        float rune = min(segment(p, vec2(-0.26, -0.62), vec2(-0.26, 0.62)), min(segment(p, vec2(-0.26, -0.52), vec2(0.3, -0.08)), min(segment(p, vec2(0.3, -0.08), vec2(-0.26, 0.24)), segment(p, vec2(-0.26, 0.24), vec2(0.31, 0.59)))));
        shape = exp(-580.0 * rune * rune) + exp(-65.0 * rune * rune) * 0.22;
      } else if (uStyle < 14.5) {
        float petal = (p.x * p.x * 2.6 + p.y * p.y * 0.8) / max(0.1, 1.0 - p.y * 0.44);
        shape = (1.0 - smoothstep(0.40, 0.48, petal)) * (0.75 + 0.25 * exp(-85.0 * p.x * p.x));
      } else if (uStyle < 15.5) {
        vec2 arc = p - vec2(0.0, 0.25);
        float ring = abs(length(arc) - 0.60);
        shape = exp(-140.0 * ring * ring) * (1.0 - smoothstep(0.15, 0.4, p.y));
      } else if (uStyle < 16.5) {
        // Feathered gray smoke, soft rather than a glowing hard-edged disc.
        shape = exp(-3.2 * r * r) * (0.72 + 0.13 * sin(p.x * 5.1 + p.y * 3.7));
      } else if (uStyle < 17.5) {
        // Icy comet: a bright offset nucleus and three curved blue gas jets.
        float head = exp(-75.0 * dot(p - vec2(0.0, -0.48), p - vec2(0.0, -0.48)));
        float tailX = p.x - sin(p.y * 2.7) * 0.10;
        float tail = exp(-110.0 * tailX * tailX) + exp(-180.0 * (tailX - 0.19) * (tailX - 0.19)) * 0.45 + exp(-180.0 * (tailX + 0.19) * (tailX + 0.19)) * 0.45;
        shape = head + tail * smoothstep(-0.5, -0.24, p.y) * (1.0 - smoothstep(0.3, 0.9, p.y)) * 0.65;
      } else if (uStyle < 18.5) {
        // Small luminous abdomen with two transparent firefly wings.
        float body = exp(-24.0 * (p.x * p.x * 3.3 + p.y * p.y));
        vec2 wingPoint = vec2(abs(p.x) - 0.28, p.y + 0.12);
        float wing = exp(-22.0 * (wingPoint.x * wingPoint.x + wingPoint.y * wingPoint.y * 2.6));
        shape = body + wing * 0.28 + glow * 0.5;
      } else if (uStyle < 19.5) {
        float wave = r - (0.42 + 0.12 * sin(angle * 3.0 + vAngle * 1.6));
        shape = exp(-250.0 * wave * wave) * 0.88 + exp(-38.0 * r * r) * 0.55;
        shape += exp(-900.0 * (wave - 0.12) * (wave - 0.12)) * 0.35;
      } else if (uStyle < 20.5) {
        float arm = abs(sin(angle * 4.0)) * r;
        shape = exp(-850.0 * arm * arm) * (1.0 - smoothstep(0.57, 0.75, r));
        shape += exp(-950.0 * (r - 0.56) * (r - 0.56)) * 0.65;
        shape += exp(-95.0 * r * r) * 0.65;
      } else if (uStyle < 21.5) {
        // Whole five-petal cherry blossom, distinct from the single-petal trail.
        float edge = 0.44 + 0.15 * cos(angle * 5.0);
        shape = (1.0 - smoothstep(edge - 0.035, edge + 0.035, r)) * 0.8;
        shape += exp(-180.0 * r * r) * 0.6;
        shape *= 0.72 + 0.28 * abs(cos(angle * 5.0));
      } else if (uStyle < 22.5) {
        float chevron = min(segment(p, vec2(-0.44, -0.27), vec2(0.0, 0.11)), segment(p, vec2(0.0, 0.11), vec2(0.44, -0.27)));
        float rear = min(segment(p, vec2(-0.34, 0.13), vec2(0.0, 0.43)), segment(p, vec2(0.0, 0.43), vec2(0.34, 0.13)));
        shape = exp(-700.0 * chevron * chevron) + exp(-700.0 * rear * rear) * 0.62 + glow * 0.25;
      } else if (uStyle < 23.5) {
        float cross = min(abs(p.x) * 1.6 + abs(p.y) * 0.20, abs(p.x) * 0.20 + abs(p.y) * 1.6);
        shape = exp(-42.0 * cross * cross) * (1.0 - smoothstep(0.59, 0.83, r));
        shape += exp(-160.0 * p.x * p.x) * smoothstep(-0.1, 0.1, p.y) * (1.0 - smoothstep(0.3, 0.98, p.y)) * 0.32;
      } else if (uStyle < 24.5) {
        float curtain = p.x - sin(p.y * 4.5 + vAngle) * 0.20;
        shape = exp(-36.0 * curtain * curtain) * (1.0 - smoothstep(0.55, 0.94, abs(p.y)));
        shape *= 0.65 + 0.35 * pow(sin(p.y * 12.0 + vAngle * 2.0), 2.0);
      } else if (uStyle < 25.5) {
        float corona = 0.45 + 0.12 * sin(angle * 7.0 + vAngle * 0.8) + 0.04 * cos(angle * 13.0);
        shape = exp(-170.0 * (r - corona) * (r - corona)) * 0.8 + exp(-22.0 * r * r) * 0.95;
        shape += exp(-750.0 * (r - corona - 0.13) * (r - corona - 0.13)) * 0.28;
      } else {
        // A hollow pair of orbital shock rings with an unlit central void.
        float ellipse = length(vec2(p.x * 0.9, p.y * 1.5));
        shape = exp(-480.0 * (ellipse - 0.53) * (ellipse - 0.53)) * 0.9;
        shape += exp(-700.0 * (r - 0.72) * (r - 0.72)) * 0.55;
        shape *= 0.65 + 0.35 * cos(angle * 2.0 + vAngle);
      }
      float alpha = shape * vAlpha * (1.0 - smoothstep(0.85, 1.0, r));
      if (alpha < 0.008) discard;
      gl_FragColor = vec4(vColor, alpha);
    }
  `
});
const cosmeticParticles = new T.Points(cosmeticParticleGeometry, cosmeticParticleMaterial);
cosmeticParticles.name = 'shot-cosmetics'; cosmeticParticles.frustumCulled = false;
cosmeticParticles.visible = false; cosmeticParticles.renderOrder = 3; scene.add(cosmeticParticles);
const particleThemes = {
  none: null,
  sparks: { style: 1, color: [1, 0.43, 0.075], alternate: [1, 0.84, 0.35], life: 0.34, size: 0.068, gravity: 1.2, lift: 0, drag: 1.8, wobble: 0.02, spin: 3, orbit: 0, grow: -0.55, inherit: 0.028, rate: 38, opacity: 0.82 },
  ice: { style: 2, color: [0.32, 0.78, 1], alternate: [0.78, 0.96, 1], life: 0.42, size: 0.060, gravity: 0.65, lift: 0, drag: 1.1, wobble: 0.06, spin: 2, orbit: 0, grow: -0.4, inherit: 0.025, rate: 34, opacity: 0.8 },
  stars: { style: 3, color: [1, 0.78, 0.28], alternate: [1, 0.96, 0.72], life: 0.46, size: 0.085, gravity: 0.40, lift: 0.06, drag: 0.9, wobble: 0.09, spin: 5, orbit: 0, grow: -0.35, inherit: 0.021, rate: 32, opacity: 0.86 },
  galaxy: { style: 4, color: [0.48, 0.30, 1], alternate: [0.28, 0.68, 1], life: 0.50, size: 0.075, gravity: 0.25, lift: 0.05, drag: 0.7, wobble: 0.03, spin: 1.1, orbit: 0.6, grow: -0.3, inherit: 0.026, rate: 36, opacity: 0.82 },
  snow: { style: 5, color: [0.86, 0.94, 1], alternate: [0.58, 0.81, 1], life: 1.05, size: 0.079, gravity: 0.28, lift: -0.06, drag: 0.8, wobble: 0.14, spin: 0.5, orbit: 0, grow: -0.1, inherit: 0.012, rate: 28, opacity: 0.83 },
  hearts: { style: 6, color: [1, 0.15, 0.42], alternate: [1, 0.45, 0.69], life: 0.85, size: 0.092, gravity: -0.35, lift: 0.25, drag: 0.5, wobble: 0.12, spin: 0.1, orbit: 0, grow: 0.1, inherit: 0.014, rate: 26, opacity: 0.82, normal: true },
  lightning: { style: 7, color: [0.48, 0.83, 1], alternate: [0.92, 0.97, 1], life: 0.28, size: 0.11, gravity: 0, lift: 0.05, drag: 0.2, wobble: 0.45, spin: 0.3, orbit: 0, grow: -0.4, inherit: 0.032, rate: 44, opacity: 0.94, zigzag: 0.5 },
  bubbles: { style: 8, color: [0.45, 0.78, 0.94], alternate: [0.81, 0.94, 1], life: 1.0, size: 0.09, gravity: -0.6, lift: 0.16, drag: 1.2, wobble: 0.06, spin: 0.05, orbit: 0, grow: 0.8, inherit: 0.01, rate: 27, opacity: 0.75, normal: true },
  confetti: { style: 9, color: [1, 0.25, 0.26], alternate: [0.2, 0.85, 0.64], life: 0.86, size: 0.083, gravity: 2.8, lift: 0.10, drag: 0.9, wobble: 0.5, spin: 8, orbit: 0, grow: -0.05, inherit: 0.038, rate: 38, opacity: 0.95, normal: true, multicolor: true },
  embers: { style: 10, color: [1, 0.24, 0.025], alternate: [1, 0.61, 0.16], life: 0.72, size: 0.065, gravity: -0.1, lift: 0.22, drag: 1.3, wobble: 0.08, spin: 0.8, orbit: 0, grow: -0.6, inherit: 0.017, rate: 34, opacity: 0.88 },
  spiral: { style: 11, color: [0.28, 0.91, 0.73], alternate: [0.65, 0.40, 1], life: 0.76, size: 0.088, gravity: 0.02, lift: 0.02, drag: 0.5, wobble: 0, spin: 3.5, orbit: 5.5, grow: -0.25, inherit: 0.018, rate: 36, opacity: 0.88 },
  meteor: { style: 12, color: [1, 0.53, 0.21], alternate: [1, 0.90, 0.51], life: 0.37, size: 0.14, gravity: 3.4, lift: -0.1, drag: 0.18, wobble: 0, spin: 0, orbit: 0, grow: -0.68, inherit: 0.23, rate: 32, opacity: 0.91 },
  runes: { style: 13, color: [0.34, 0.96, 0.82], alternate: [0.71, 0.48, 1], life: 0.95, size: 0.11, gravity: 0.02, lift: 0.08, drag: 1.0, wobble: 0.04, spin: 1.8, orbit: 1.0, grow: -0.1, inherit: 0.01, rate: 24, opacity: 0.77 },
  petals: { style: 14, color: [1, 0.35, 0.61], alternate: [1, 0.71, 0.80], life: 1.0, size: 0.091, gravity: 0.55, lift: 0, drag: 0.6, wobble: 0.26, spin: 2.9, orbit: 0.2, grow: -0.16, inherit: 0.018, rate: 28, opacity: 0.87, normal: true },
  rainbow: { style: 15, color: [1, 0.27, 0.26], alternate: [0.33, 0.58, 1], life: 0.6, size: 0.099, gravity: 0.15, lift: 0.04, drag: 0.7, wobble: 0.05, spin: 1.2, orbit: 0.9, grow: -0.4, inherit: 0.021, rate: 42, opacity: 0.84, rainbow: true },
  smoke: { style: 16, color: [0.55, 0.57, 0.61], alternate: [0.73, 0.75, 0.79], life: 1.25, size: 0.095, gravity: -0.12, lift: 0.18, drag: 2.2, wobble: 0.07, spin: 0.45, orbit: 0, grow: 2.0, inherit: 0.008, rate: 26, opacity: 0.32, normal: true },
  comet: { style: 17, color: [0.23, 0.73, 1], alternate: [0.83, 0.98, 1], life: 0.61, size: 0.18, gravity: 1.4, lift: -0.05, drag: 0.32, wobble: 0.04, spin: 0, orbit: 0, grow: -0.52, inherit: 0.16, rate: 34, opacity: 0.92, alignFlight: true },
  fireflies: { style: 18, color: [0.68, 1, 0.20], alternate: [1, 0.91, 0.26], life: 1.55, size: 0.075, gravity: -0.12, lift: 0.11, drag: 1.8, wobble: 0.31, spin: 0.7, orbit: 1.2, grow: 0.22, inherit: 0.006, rate: 25, opacity: 0.92, flicker: 7.5, flutter: 0.16 },
  plasma: { style: 19, color: [0.86, 0.17, 1], alternate: [0.21, 0.78, 1], life: 0.72, size: 0.13, gravity: 0.04, lift: 0.05, drag: 0.25, wobble: 0.13, spin: 4.5, orbit: 6.4, grow: 0.42, inherit: 0.025, rate: 36, opacity: 0.9, pulse: 8, curl: 2.8 },
  frostnova: { style: 20, color: [0.55, 0.91, 1], alternate: [0.94, 1, 1], life: 0.76, size: 0.12, gravity: 0.75, lift: 0.06, drag: 1.0, wobble: 0.015, spin: 1.4, orbit: 0, grow: 1.25, inherit: 0.02, rate: 29, opacity: 0.86, pulse: 3.2 },
  cherryblossom: { style: 21, color: [1, 0.66, 0.79], alternate: [1, 0.88, 0.91], life: 1.5, size: 0.12, gravity: 0.38, lift: 0.02, drag: 0.7, wobble: 0.4, spin: 1.7, orbit: 0.35, grow: 0.12, inherit: 0.015, rate: 24, opacity: 0.91, normal: true, flutter: 0.35 },
  iontrail: { style: 22, color: [0.12, 1, 0.87], alternate: [0.60, 0.94, 1], life: 0.35, size: 0.14, gravity: 0, lift: 0, drag: 0.12, wobble: 0, spin: 0, orbit: 0, grow: -0.25, inherit: 0.055, rate: 52, opacity: 0.95, alignFlight: true, flicker: 21 },
  starfall: { style: 23, color: [1, 0.82, 0.48], alternate: [1, 0.98, 0.83], life: 1.1, size: 0.14, gravity: 4.1, lift: 0.18, drag: 0.2, wobble: 0.04, spin: 0.45, orbit: 0, grow: -0.31, inherit: 0.045, rate: 27, opacity: 0.92, flicker: 5.2 },
  auroraveil: { style: 24, color: [0.25, 1, 0.70], alternate: [0.68, 0.38, 1], life: 1.3, size: 0.21, gravity: -0.09, lift: 0.08, drag: 1.1, wobble: 0.19, spin: 0.28, orbit: 1.8, grow: 0.85, inherit: 0.01, rate: 30, opacity: 0.5, flutter: 0.17, pulse: 2.4 },
  solarflare: { style: 25, color: [1, 0.42, 0.045], alternate: [1, 0.89, 0.34], life: 0.64, size: 0.15, gravity: -0.5, lift: 0.25, drag: 1.5, wobble: 0.12, spin: 2.6, orbit: 0.9, grow: 0.62, inherit: 0.012, rate: 35, opacity: 0.91, pulse: 11, curl: -1.2 },
  voidpulse: { style: 26, color: [0.50, 0.25, 0.86], alternate: [0.83, 0.58, 1], life: 1.05, size: 0.14, gravity: 0, lift: 0.02, drag: 2.0, wobble: 0.015, spin: -1.8, orbit: -2.9, grow: 1.7, inherit: 0.003, rate: 23, opacity: 0.79, pulse: 4.5, curl: -3.2 }
};
let cosmeticParticleCursor = 0, cosmeticSpawnAccumulator = 0, cosmeticLastPulse;
let cosmeticLastBallX = 0, cosmeticLastBallY = 0, cosmeticLastBallZ = 0, cosmeticTrailActive = false;
let cosmeticSeed = 142887;
function cosmeticRandom() {
  cosmeticSeed = (Math.imul(cosmeticSeed, 1664525) + 1013904223) >>> 0;
  return cosmeticSeed / 4294967296;
}
function clearCosmeticParticles() {
  cosmeticParticleLife.fill(0); cosmeticParticleAlphas.fill(0);
  cosmeticParticleGeometry.attributes.aAlpha.needsUpdate = true;
  cosmeticSpawnAccumulator = 0; cosmeticTrailActive = false;
  cosmeticParticles.visible = false;
}
function setParticleStyle(id) {
  if (!Object.prototype.hasOwnProperty.call(particleThemes, id)) return false;
  if (id === selectedParticleStyle) return true;
  selectedParticleStyle = id; clearCosmeticParticles(); reflectionReady = false;
  if (particleThemes[id]) {
    cosmeticParticleMaterial.uniforms.uStyle.value = particleThemes[id].style;
    cosmeticParticleMaterial.blending = particleThemes[id].normal ? T.NormalBlending : T.AdditiveBlending;
  }
  return true;
}
function spawnCosmeticParticle(x, y, z, vx, vy, vz, burst, theme) {
  const i = cosmeticParticleCursor;
  cosmeticParticleCursor = (cosmeticParticleCursor + 1) % cosmeticParticleCapacity;
  const j = i * 3, scatter = burst ? 0.06 : 0.035;
  cosmeticParticlePositions[j] = x + (cosmeticRandom() - 0.5) * scatter;
  cosmeticParticlePositions[j + 1] = y + (cosmeticRandom() - 0.5) * scatter;
  cosmeticParticlePositions[j + 2] = z + (cosmeticRandom() - 0.5) * scatter;
  cosmeticParticleVelocity[j] = vx; cosmeticParticleVelocity[j + 1] = vy + theme.lift; cosmeticParticleVelocity[j + 2] = vz;
  cosmeticParticlePhase[i] = cosmeticRandom() * Math.PI * 2;
  const color = cosmeticRandom() < 0.35 ? theme.alternate : theme.color;
  cosmeticParticleColors[j] = color[0]; cosmeticParticleColors[j + 1] = color[1]; cosmeticParticleColors[j + 2] = color[2];
  if (theme.multicolor || theme.rainbow) setCosmeticRainbowColor(i, cosmeticParticlePhase[i] / (Math.PI * 2));
  cosmeticParticleAge[i] = 0;
  cosmeticParticleLife[i] = theme.life * (burst ? 1.6 : 1) * (0.75 + cosmeticRandom() * 0.50);
  cosmeticParticleScale[i] = theme.size * (burst ? 1.1 : 0.8) * (0.75 + cosmeticRandom() * 0.5);
}
function setCosmeticRainbowColor(i, hue) {
  const h = ((hue % 1) + 1) % 1 * 6, j = i * 3;
  cosmeticParticleColors[j] = 0.18 + 0.82 * Math.max(0, Math.min(1, Math.abs(h - 3) - 1));
  cosmeticParticleColors[j + 1] = 0.18 + 0.82 * Math.max(0, Math.min(1, 2 - Math.abs(h - 2)));
  cosmeticParticleColors[j + 2] = 0.18 + 0.82 * Math.max(0, Math.min(1, 2 - Math.abs(h - 4)));
}
function updateCosmeticParticles(dt, time, state) {
  const pulse = state.netPulse;
  const scored = pulse && pulse !== cosmeticLastPulse;
  cosmeticLastPulse = pulse;
  const theme = particleThemes[selectedParticleStyle];
  if (!theme) return;
  const frame = Math.min(0.05, Math.max(0, Number.isFinite(dt) ? dt : 0));
  const moving = state.ballState;
  if (moving && moving.position && moving.velocity) {
    const p = moving.position, v = moving.velocity;
    const speedSq = v.x * v.x + v.y * v.y + v.z * v.z;
    if (speedSq > 1) {
      if (!cosmeticTrailActive || Math.abs(p.x - cosmeticLastBallX) + Math.abs(p.y - cosmeticLastBallY) + Math.abs(p.z - cosmeticLastBallZ) > 3) {
        cosmeticLastBallX = p.x; cosmeticLastBallY = p.y; cosmeticLastBallZ = p.z;
      }
      cosmeticSpawnAccumulator += frame * theme.rate;
      const amount = Math.min(4, Math.floor(cosmeticSpawnAccumulator));
      cosmeticSpawnAccumulator -= amount;
      for (let n = 0; n < amount; n++) {
        const t = (n + 1) / amount;
        spawnCosmeticParticle(
          cosmeticLastBallX + (p.x - cosmeticLastBallX) * t,
          cosmeticLastBallY + (p.y - cosmeticLastBallY) * t,
          cosmeticLastBallZ + (p.z - cosmeticLastBallZ) * t,
          v.x * theme.inherit + (cosmeticRandom() - 0.5) * 0.11,
          v.y * theme.inherit + (cosmeticRandom() - 0.5) * 0.11,
          v.z * theme.inherit + (cosmeticRandom() - 0.5) * 0.11, false, theme
        );
      }
      cosmeticLastBallX = p.x; cosmeticLastBallY = p.y; cosmeticLastBallZ = p.z; cosmeticTrailActive = true;
    } else { cosmeticTrailActive = false; cosmeticSpawnAccumulator = 0; }
  } else { cosmeticTrailActive = false; cosmeticSpawnAccumulator = 0; }
  if (scored) {
    let sign = state.targetHoop;
    if (typeof sign === 'object' && sign) sign = Math.sign(sign.z);
    if (sign !== 1 && sign !== -1) sign = Math.sign(ball.position.z) || -1;
    for (let n = 0; n < 22; n++) {
      const angle = cosmeticRandom() * Math.PI * 2, speed = 0.55 + cosmeticRandom() * 0.90;
      spawnCosmeticParticle(0, 3.02, sign * 12.35, Math.cos(angle) * speed,
        0.25 + cosmeticRandom() * 1.0, Math.sin(angle) * speed, true, theme);
    }
  }
  let alive = 0;
  for (let i = 0; i < cosmeticParticleCapacity; i++) {
    if (cosmeticParticleLife[i] <= 0) continue;
    cosmeticParticleAge[i] += frame;
    if (cosmeticParticleAge[i] >= cosmeticParticleLife[i]) {
      cosmeticParticleLife[i] = 0; cosmeticParticleAlphas[i] = 0; continue;
    }
    const j = i * 3, progress = cosmeticParticleAge[i] / cosmeticParticleLife[i];
    const phase = cosmeticParticlePhase[i], age = cosmeticParticleAge[i];
    const damping = Math.max(0, 1 - theme.drag * frame);
    cosmeticParticleVelocity[j] *= damping; cosmeticParticleVelocity[j + 1] *= damping; cosmeticParticleVelocity[j + 2] *= damping;
    cosmeticParticleVelocity[j + 1] -= theme.gravity * frame;
    cosmeticParticlePositions[j] += cosmeticParticleVelocity[j] * frame + Math.sin(phase + age * 6) * theme.wobble * frame;
    cosmeticParticlePositions[j + 1] += cosmeticParticleVelocity[j + 1] * frame;
    cosmeticParticlePositions[j + 2] += cosmeticParticleVelocity[j + 2] * frame + Math.cos(phase + age * 4.7) * theme.wobble * frame;
    if (theme.orbit) {
      const orbit = phase + age * theme.orbit;
      cosmeticParticlePositions[j] -= Math.sin(orbit) * theme.orbit * 0.075 * frame;
      cosmeticParticlePositions[j + 2] += Math.cos(orbit) * theme.orbit * 0.075 * frame;
    }
    if (theme.zigzag) cosmeticParticlePositions[j] += (Math.sin(phase + age * 42) > 0 ? 1 : -1) * theme.zigzag * frame;
    if (theme.curl) {
      const turn = theme.curl * frame, cs = Math.cos(turn), sn = Math.sin(turn);
      const vx = cosmeticParticleVelocity[j], vz = cosmeticParticleVelocity[j + 2];
      cosmeticParticleVelocity[j] = vx * cs - vz * sn; cosmeticParticleVelocity[j + 2] = vx * sn + vz * cs;
    }
    if (theme.flutter) cosmeticParticlePositions[j + 1] += Math.sin(phase + age * 5.8) * theme.flutter * frame;
    if (theme.rainbow) setCosmeticRainbowColor(i, phase / (Math.PI * 2) + age * 0.42);
    cosmeticParticleAlphas[i] = (1 - progress) * (1 - progress) * theme.opacity;
    if (theme.flicker) cosmeticParticleAlphas[i] *= 0.30 + 0.70 * Math.pow(0.5 + 0.5 * Math.sin(phase + age * theme.flicker), 2);
    cosmeticParticleSizes[i] = cosmeticParticleScale[i] * (1 + progress * theme.grow);
    if (theme.pulse) cosmeticParticleSizes[i] *= 0.80 + 0.28 * Math.sin(phase + age * theme.pulse);
    cosmeticParticleAngles[i] = theme.style === 12 ? 0 : phase * 0.25 + age * theme.spin;
    if (theme.alignFlight) {
      const view = camera.matrixWorldInverse.elements;
      const vx = cosmeticParticleVelocity[j], vy = cosmeticParticleVelocity[j + 1], vz = cosmeticParticleVelocity[j + 2];
      const screenX = view[0] * vx + view[4] * vy + view[8] * vz;
      const screenY = view[1] * vx + view[5] * vy + view[9] * vz;
      cosmeticParticleAngles[i] = Math.atan2(screenY, screenX) - Math.PI / 2;
    }
    alive++;
  }
  cosmeticParticles.visible = alive > 0;
  cosmeticParticleMaterial.uniforms.uPointScale.value = Math.max(1, canvas.height) * 0.5 * camera.projectionMatrix.elements[5];
  if (alive) {
    cosmeticParticleGeometry.attributes.position.needsUpdate = true;
    cosmeticParticleGeometry.attributes.aColor.needsUpdate = true;
    cosmeticParticleGeometry.attributes.aSize.needsUpdate = true;
    cosmeticParticleGeometry.attributes.aAngle.needsUpdate = true;
  }
  cosmeticParticleGeometry.attributes.aAlpha.needsUpdate = true;
}
function addCosmeticTexturesToDisposal(textures) {
  // Include lazy cached maps that are no longer reachable from a scene material.
  ballSkinTextures.forEach(texture => textures.add(texture));
  textures.add(ballLeatherBump); ballSkinTextures.clear();
  for (const pack of surfaceDetailMaps.values()) for (const texture of Object.values(pack)) if (texture && texture.isTexture) textures.add(texture);
  surfaceDetailMaps.clear();
}


    // Local ambient contact darkens only close to the floor. The directional
    // shadow remains the renderer's real, light-projected ball silhouette.
    const [shadowC, shadowCtx] = textureCanvas(128, 128);
    const shadowGradient = shadowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    shadowGradient.addColorStop(0, 'rgba(20,24,20,.82)'); shadowGradient.addColorStop(0.24, 'rgba(20,24,20,.62)');
    shadowGradient.addColorStop(0.57, 'rgba(20,24,20,.2)'); shadowGradient.addColorStop(1, 'rgba(20,24,20,0)');
    shadowCtx.fillStyle = shadowGradient; shadowCtx.fillRect(0, 0, 128, 128);
    const ballShadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: new T.CanvasTexture(shadowC), transparent: true, depthWrite: false, opacity: 0.38, toneMapped: false }));
    ballShadow.name = 'ball-height-aware-contact'; ballShadow.userData.groundContactOcclusion = true;
    ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.y = 0.021; ballShadow.renderOrder = 3; scene.add(ballShadow);
    const trajectory = new T.Group(); trajectory.visible = false; scene.add(trajectory);
    const dotMat = new T.MeshBasicMaterial({ color: 0xfff6dd, transparent: true, opacity: 0.44, depthWrite: false });
    const dots = new T.InstancedMesh(new T.SphereGeometry(0.018, 7, 5), dotMat, 72); dots.frustumCulled = false; dots.count = 0; trajectory.add(dots);
    const dummy = new T.Object3D();
    // A translucent, camera-facing flight ribbon. Buffers and scratch vectors are
    // reused while a finger moves, so aiming does not create per-frame garbage.
    const aimArrow = new T.Group(); aimArrow.name = 'aim-arrow'; aimArrow.visible = false; scene.add(aimArrow);
    const arrowCapacity = 256;
    const arrowPath = new Float32Array(arrowCapacity * 3);
    const arrowVertices = new Float32Array(arrowCapacity * 2 * 3);
    const arrowIndices = new Uint16Array((arrowCapacity - 1) * 6);
    for (let i = 0; i < arrowCapacity - 1; i++) {
      const n = i * 2, k = i * 6;
      arrowIndices[k] = n; arrowIndices[k + 1] = n + 1; arrowIndices[k + 2] = n + 2;
      arrowIndices[k + 3] = n + 1; arrowIndices[k + 4] = n + 3; arrowIndices[k + 5] = n + 2;
    }
    const arrowGeometry = new T.BufferGeometry();
    arrowGeometry.setAttribute('position', new T.BufferAttribute(arrowVertices, 3).setUsage(T.DynamicDrawUsage));
    arrowGeometry.setIndex(new T.BufferAttribute(arrowIndices, 1)); arrowGeometry.setDrawRange(0, 0);
    const arrowMaterial = new T.MeshBasicMaterial({ color: 0xf1fbff, transparent: true, opacity: 0.48, side: T.DoubleSide, depthWrite: false, depthTest: true });
    const arrowRibbon = new T.Mesh(arrowGeometry, arrowMaterial);
    arrowRibbon.name = 'aim-ribbon'; arrowRibbon.frustumCulled = false; arrowRibbon.renderOrder = 4; aimArrow.add(arrowRibbon);
    const headVertices = new Float32Array(9);
    const headGeometry = new T.BufferGeometry();
    headGeometry.setAttribute('position', new T.BufferAttribute(headVertices, 3).setUsage(T.DynamicDrawUsage));
    const arrowHead = new T.Mesh(headGeometry, arrowMaterial);
    arrowHead.name = 'aim-arrowhead'; arrowHead.frustumCulled = false; arrowHead.renderOrder = 4; aimArrow.add(arrowHead);
    const arrowCenter = new T.Vector3(), arrowPrev = new T.Vector3(), arrowNext = new T.Vector3();
    const arrowTangent = new T.Vector3(), arrowToCamera = new T.Vector3(), arrowSide = new T.Vector3();
    const arrowTip = new T.Vector3(), arrowBase = new T.Vector3(), arrowDirection = new T.Vector3();
    const cameraForward = new T.Vector3(), cameraRight = new T.Vector3();
    let viewportHeight = Math.max(1, canvas.clientHeight || window.innerHeight || 1);
    function pathPoint(index, target) { return target.fromArray(arrowPath, index * 3); }
    function arrowFacingSide(point, tangent) {
      arrowToCamera.subVectors(camera.position, point);
      arrowSide.crossVectors(tangent, arrowToCamera);
      if (arrowSide.lengthSq() < 0.0000001) arrowSide.copy(cameraRight);
      else arrowSide.normalize();
      return arrowSide;
    }
    function updateAimArrow(points, visible) {
      aimArrow.visible = !!visible && !!points && points.length > 1;
      if (!aimArrow.visible) { arrowGeometry.setDrawRange(0, 0); return; }
      const count = Math.min(arrowCapacity - 1, points.length);
      for (let i = 0; i < count; i++) {
        const p = points[Math.round(i * (points.length - 1) / (count - 1))], k = i * 3;
        arrowPath[k] = p.x === undefined ? p[0] : p.x;
        arrowPath[k + 1] = p.y === undefined ? p[1] : p.y;
        arrowPath[k + 2] = p.z === undefined ? p[2] : p.z;
      }
      cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      pathPoint(count - 1, arrowTip);
      let lastDistinct = count - 2;
      do { pathPoint(lastDistinct, arrowPrev); arrowDirection.subVectors(arrowTip, arrowPrev); }
      while (arrowDirection.lengthSq() < 0.000001 && --lastDistinct >= 0);
      if (arrowDirection.lengthSq() < 0.000001) { aimArrow.visible = false; return; }
      arrowDirection.normalize();
      let pathLength = 0;
      pathPoint(0, arrowPrev);
      for (let i = 1; i < count; i++) { pathPoint(i, arrowNext); pathLength += arrowPrev.distanceTo(arrowNext); arrowPrev.copy(arrowNext); }
      const headLength = Math.min(0.22, pathLength * 0.42);
      arrowBase.copy(arrowTip).addScaledVector(arrowDirection, -headLength);
      // Trim the ribbon at the arrowhead's base, preventing overlapping folds
      // when physics previews supply very closely spaced samples near the rim.
      let cut = count - 2;
      while (cut > 0) {
        pathPoint(cut, arrowPrev); arrowPrev.sub(arrowTip);
        if (arrowPrev.dot(arrowDirection) < -headLength) break;
        cut--;
      }
      const bodyCount = cut + 2;
      for (let i = 0; i < bodyCount; i++) {
        if (i === bodyCount - 1) arrowCenter.copy(arrowBase); else pathPoint(i, arrowCenter);
        if (i === bodyCount - 1) arrowTangent.copy(arrowDirection);
        else {
          pathPoint(Math.max(0, i - 1), arrowPrev);
          if (i + 1 === bodyCount - 1) arrowNext.copy(arrowBase); else pathPoint(i + 1, arrowNext);
          arrowTangent.subVectors(arrowNext, arrowPrev).normalize();
        }
        arrowFacingSide(arrowCenter, arrowTangent);
        arrowToCamera.subVectors(arrowCenter, camera.position);
        const depth = Math.max(0.05, arrowToCamera.dot(cameraForward));
        const halfWidth = Math.min(0.10, Math.max(0.014, depth * 0.018)) * 0.5;
        const k = i * 6;
        arrowVertices[k] = arrowCenter.x + arrowSide.x * halfWidth;
        arrowVertices[k + 1] = arrowCenter.y + arrowSide.y * halfWidth;
        arrowVertices[k + 2] = arrowCenter.z + arrowSide.z * halfWidth;
        arrowVertices[k + 3] = arrowCenter.x - arrowSide.x * halfWidth;
        arrowVertices[k + 4] = arrowCenter.y - arrowSide.y * halfWidth;
        arrowVertices[k + 5] = arrowCenter.z - arrowSide.z * halfWidth;
      }
      arrowGeometry.setDrawRange(0, (bodyCount - 1) * 6); arrowGeometry.attributes.position.needsUpdate = true;
      arrowFacingSide(arrowBase, arrowDirection);
      arrowToCamera.subVectors(arrowTip, camera.position);
      const tipDepth = Math.max(0.05, arrowToCamera.dot(cameraForward));
      const worldPerPixel = 2 * tipDepth * Math.tan(T.MathUtils.degToRad(camera.fov * 0.5)) / viewportHeight;
      const halfHeadWidth = Math.max(0.075, worldPerPixel * 7);
      arrowTip.toArray(headVertices, 0);
      headVertices[3] = arrowBase.x + arrowSide.x * halfHeadWidth;
      headVertices[4] = arrowBase.y + arrowSide.y * halfHeadWidth;
      headVertices[5] = arrowBase.z + arrowSide.z * halfHeadWidth;
      headVertices[6] = arrowBase.x - arrowSide.x * halfHeadWidth;
      headVertices[7] = arrowBase.y - arrowSide.y * halfHeadWidth;
      headVertices[8] = arrowBase.z - arrowSide.z * halfHeadWidth;
      headGeometry.attributes.position.needsUpdate = true;
    }
    const targetMarker = new T.Group(); targetMarker.visible = false;
    const markerMat = new T.MeshBasicMaterial({ color: 0xf2e9d1, transparent: true, opacity: 0.45, depthWrite: false });
    const marker = new T.Mesh(new T.RingGeometry(0.16, 0.22, 48), markerMat); marker.rotation.x = -Math.PI / 2; marker.position.y = 0.021; targetMarker.add(marker); scene.add(targetMarker);
// INSERT after targetMarker has been added, immediately before `const api = {`.
// A low-strength planar reflection keeps the lacquered maple visible. The
// render target contains linear scene radiance; the final shader applies ACES
// and the renderer's output color space exactly once.
const reflectionCamera = new T.PerspectiveCamera();
const reflectionHDR = renderer.potaHDRSupported;
const reflectionTarget = new T.WebGLRenderTarget(1, 1, {
  minFilter: T.LinearFilter, magFilter: T.LinearFilter,
  format: T.RGBAFormat,
  type: reflectionHDR ? T.HalfFloatType : T.UnsignedByteType,
  depthBuffer: true, stencilBuffer: false
});
reflectionTarget.texture.name = 'maple-planar-reflection';
reflectionTarget.texture.colorSpace = T.LinearSRGBColorSpace;
reflectionTarget.texture.generateMipmaps = false;
const reflectionTextureMatrix = new T.Matrix4();
const reflectionUniforms = {
  tReflection: { value: reflectionTarget.texture },
  textureMatrix: { value: reflectionTextureMatrix },
  texel: { value: new T.Vector2(1, 1) },
  surfaceReflection: { value: 1 }
};
const floorReflectionMaterial = new T.ShaderMaterial({
  name: 'rough-lacquer-reflection',
  uniforms: reflectionUniforms,
  transparent: true, depthWrite: false, depthTest: true,
  toneMapped: true,
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 vReflection;
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vReflection = textureMatrix * world;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    uniform sampler2D tReflection;
    uniform vec2 texel;
    uniform float surfaceReflection;
    varying vec4 vReflection;
    varying vec3 vWorld;
    float grain(vec2 p) {
      float plank = floor(p.x * 2.0);
      float fine = sin(p.y * 72.0 + sin(p.y * 2.1 + plank) * 2.2 + plank * 8.7);
      return 0.5 + 0.5 * fine;
    }
    void main() {
      if (vReflection.w <= 0.0) discard;
      vec2 uv = vReflection.xy / vReflection.w;
      if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) discard;
      float wood = grain(vWorld.xz);
      vec3 toEye = normalize(cameraPosition - vWorld);
      float grazing = pow(1.0 - clamp(toEye.y, 0.0, 1.0), 5.0);
      // Nine weighted samples suppress crisp mirror edges on rough varnish.
      vec2 d = texel * mix(3.0, 5.8, wood);
      vec3 reflected = texture2D(tReflection, uv).rgb * 0.28;
      reflected += texture2D(tReflection, uv + vec2(d.x, 0.0)).rgb * 0.12;
      reflected += texture2D(tReflection, uv - vec2(d.x, 0.0)).rgb * 0.12;
      reflected += texture2D(tReflection, uv + vec2(0.0, d.y)).rgb * 0.12;
      reflected += texture2D(tReflection, uv - vec2(0.0, d.y)).rgb * 0.12;
      reflected += texture2D(tReflection, uv + d).rgb * 0.06;
      reflected += texture2D(tReflection, uv - d).rgb * 0.06;
      reflected += texture2D(tReflection, uv + vec2(d.x, -d.y)).rgb * 0.06;
      reflected += texture2D(tReflection, uv + vec2(-d.x, d.y)).rgb * 0.06;
      float fresnel = 0.04 + 0.96 * grazing;
      float opacity = clamp((0.025 + fresnel * 0.32) * mix(0.91, 1.0, wood), 0.035, 0.245);
      gl_FragColor = vec4(reflected * vec3(1.0, 0.98, 0.95), opacity * surfaceReflection);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
});
const floorReflection = new T.Mesh(new T.PlaneGeometry(24, 36), floorReflectionMaterial);
floorReflection.name = 'subtle-maple-reflection';
floorReflection.renderOrder = -2;
floorReflection.rotation.x = -Math.PI / 2;
// Below the painted court (y >= .003) and above the wooden plane (-.012).
floorReflection.position.y = -0.001;
floorReflection.visible = false;
scene.add(floorReflection);
const reflectionNormal = new T.Vector3(0, 1, 0);
const reflectionOrigin = new T.Vector3(0, 0, 0);
const reflectionEye = new T.Vector3(), reflectedEye = new T.Vector3();
const reflectionForward = new T.Vector3(), reflectionLook = new T.Vector3();
const reflectionUp = new T.Vector3(), reflectionPlane = new T.Plane();
const reflectionClip = new T.Vector4(), reflectionQ = new T.Vector4();
const reflectionLastCamera = new T.Matrix4();
const reflectionSavedViewport = new T.Vector4();
const reflectionSavedScissor = new T.Vector4();
// UI helpers and the contact shadow do not belong in the physical reflection.
const reflectionHidden = [floor, floorReflection, ballShadow, trajectory, aimArrow, targetMarker];
const reflectionVisibility = new Array(reflectionHidden.length);
let reflectionReady = false, reflectionFrame = 0, reflectionResolution = Math.min(512, sideTargetLimit), reflectionInterval = 2, reflectionEnabled = true;
const reflectionLastBallMatrix = new T.Matrix4();
let reflectionLastBallVisible = null, reflectionLastNet0 = -1, reflectionLastNet1 = -1, reflectionUpdates = 0;
function resizeFloorReflection(width, height) {
  const size = Math.max(1, Math.floor(Math.min(reflectionResolution, sideTargetLimit)));
  if (reflectionTarget.width !== size) reflectionTarget.setSize(size, size);
  reflectionUniforms.texel.value.set(1 / size, 1 / size);
  reflectionReady = false;
}
function renderFloorReflection() {
  if (!reflectionEnabled || reflectionUniforms.surfaceReflection.value <= 0) { floorReflection.visible = false; return; }
  camera.updateMatrixWorld();
  // Capture every second moving frame, but immediately after a camera change.
  const cameraMoved = !reflectionLastCamera.equals(camera.matrixWorld);
  const dynamicWeather = selectedEnvironmentStyle.endsWith('-court');
  const movingContents = (ball.visible && !reflectionLastBallMatrix.equals(ball.matrixWorld)) || ball.visible !== reflectionLastBallVisible ||
    reflectionLastNet0 !== nets[0].geometryUpdates || reflectionLastNet1 !== nets[1].geometryUpdates ||
    dynamicWeather || cosmeticParticles.visible;
  if (reflectionReady && !cameraMoved && !movingContents) return;
  if (reflectionReady && !cameraMoved && (++reflectionFrame % reflectionInterval)) return;
  reflectionEye.setFromMatrixPosition(camera.matrixWorld);
  if (reflectionEye.y <= 0.03) { floorReflection.visible = false; return; }
  reflectedEye.copy(reflectionEye);
  reflectedEye.y = -reflectionEye.y;
  reflectionForward.set(0, 0, -1).transformDirection(camera.matrixWorld);
  reflectionForward.reflect(reflectionNormal);
  reflectionLook.copy(reflectedEye).add(reflectionForward);
  reflectionUp.set(0, 1, 0).transformDirection(camera.matrixWorld).reflect(reflectionNormal);
  reflectionCamera.position.copy(reflectedEye);
  reflectionCamera.up.copy(reflectionUp);
  reflectionCamera.lookAt(reflectionLook);
  reflectionCamera.near = camera.near;
  reflectionCamera.far = camera.far;
  reflectionCamera.projectionMatrix.copy(camera.projectionMatrix);
  reflectionCamera.updateMatrixWorld();
  // Project the floor's world coordinates into the reflected camera image.
  reflectionTextureMatrix.set(
    0.5, 0.0, 0.0, 0.5,
    0.0, 0.5, 0.0, 0.5,
    0.0, 0.0, 0.5, 0.5,
    0.0, 0.0, 0.0, 1.0
  );
  reflectionTextureMatrix.multiply(reflectionCamera.projectionMatrix);
  reflectionTextureMatrix.multiply(reflectionCamera.matrixWorldInverse);
  // Oblique near plane excludes objects/markings below the floor and prevents
  // the mirrored camera from seeing the underside of the arena.
  reflectionOrigin.y = 0.026;
  reflectionPlane.setFromNormalAndCoplanarPoint(reflectionNormal, reflectionOrigin);
  reflectionPlane.applyMatrix4(reflectionCamera.matrixWorldInverse);
  reflectionClip.set(reflectionPlane.normal.x, reflectionPlane.normal.y, reflectionPlane.normal.z, reflectionPlane.constant);
  const projection = reflectionCamera.projectionMatrix.elements;
  reflectionQ.x = (Math.sign(reflectionClip.x) + projection[8]) / projection[0];
  reflectionQ.y = (Math.sign(reflectionClip.y) + projection[9]) / projection[5];
  reflectionQ.z = -1;
  reflectionQ.w = (1 + projection[10]) / projection[14];
  reflectionClip.multiplyScalar(2 / reflectionClip.dot(reflectionQ));
  projection[2] = reflectionClip.x;
  projection[6] = reflectionClip.y;
  projection[10] = reflectionClip.z + 1 - 0.0002;
  projection[14] = reflectionClip.w;
  reflectionCamera.projectionMatrixInverse.copy(reflectionCamera.projectionMatrix).invert();
  const previousTarget = renderer.getRenderTarget();
  const previousXR = renderer.xr.enabled;
  const previousShadowUpdate = renderer.shadowMap.autoUpdate;
  const previousScissorTest = renderer.getScissorTest();
  renderer.getViewport(reflectionSavedViewport);
  renderer.getScissor(reflectionSavedScissor);
  for (let i = 0; i < reflectionHidden.length; i++) {
    reflectionVisibility[i] = reflectionHidden[i].visible;
    reflectionHidden[i].visible = false;
  }
  renderer.xr.enabled = false;
  renderer.shadowMap.autoUpdate = false;
  // All temporarily hidden objects are non-casters. A pending sun-map update
  // can therefore serve this view and the main view together, including the
  // first frame, without rendering the same large depth map twice.
  renderer.setScissorTest(false);
  try {
    renderer.setRenderTarget(reflectionTarget);
    renderer.clear();
    renderer.render(scene, reflectionCamera);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(reflectionSavedViewport);
    renderer.setScissor(reflectionSavedScissor); renderer.setScissorTest(previousScissorTest);
    renderer.xr.enabled = previousXR;
    renderer.shadowMap.autoUpdate = previousShadowUpdate;
    for (let i = 0; i < reflectionHidden.length; i++) reflectionHidden[i].visible = reflectionVisibility[i];
  }
  reflectionLastCamera.copy(camera.matrixWorld);
  reflectionLastBallMatrix.copy(ball.matrixWorld); reflectionLastBallVisible = ball.visible;
  reflectionLastNet0 = nets[0].geometryUpdates; reflectionLastNet1 = nets[1].geometryUpdates; reflectionUpdates++;
  reflectionReady = true;
  floorReflection.visible = true;
}


// A court-wide shadow map gives even the thicker 7 mm cords less than one texel.
// Render the very same animated cords and knots into two tightly fitted light
// views instead. These maps replace only the net's sunlight occlusion; ambient
// light, ceiling fixtures and the existing shadows from other objects remain.
const netShadowWidth = 1.7, netShadowDepth = 11.9;
let netShadowSize = Math.min(512, sideTargetLimit), netShadowInterval = 1, netShadowFrame = 0;
const netShadowAngularRadius = 0.00465; // Sun's apparent half-angle, radians.
const netShadowDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, side: T.DoubleSide });
netShadowDepthMaterial.blending = T.NoBlending;
const netShadowSunDirection = new T.Vector3();
const netShadowRight = new T.Vector3(), netShadowUp = new T.Vector3();
const netShadowLightPosition = new T.Vector3(), netShadowLightTarget = new T.Vector3();
const netShadowPreviousDirection = new T.Vector3(99, 99, 99);
const netShadowBiasMatrix = new T.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const netShadowMaps = nets.map(net => {
  const target = new T.WebGLRenderTarget(netShadowSize, netShadowSize, {
    minFilter: T.NearestFilter, magFilter: T.NearestFilter,
    format: T.RGBAFormat, type: T.UnsignedByteType, depthBuffer: true, stencilBuffer: false
  });
  target.texture.name = `woven-net-depth-${net.sign}`;
  target.texture.generateMipmaps = false;
  const view = new T.OrthographicCamera(-netShadowWidth / 2, netShadowWidth / 2, netShadowWidth / 2, -netShadowWidth / 2, 0.1, 12);
  const depthScene = new T.Scene(), group = new T.Group(); group.matrixAutoUpdate = false;
  const cord = new T.Mesh(net.geometry, netShadowDepthMaterial); cord.frustumCulled = false;
  const knots = new T.InstancedMesh(knotGeometry, netShadowDepthMaterial, net.particleCount);
  knots.instanceMatrix = net.knots.instanceMatrix; knots.frustumCulled = false;
  const chain = new T.InstancedMesh(chainGeometry, netShadowDepthMaterial, net.chainCount);
  chain.instanceMatrix = net.chain.instanceMatrix; chain.frustumCulled = false; chain.visible = false;
  group.add(cord, knots, chain); depthScene.add(group);
  return { net, target, view, depthScene, group, cord, knots, chain, matrix: new T.Matrix4(), center: new T.Vector3(),
    previousPositions: new Float64Array(net.positions.length).fill(Infinity), previousMatrix: new T.Matrix4(),
    updates: 0, ready: false };
});
const netShadowUniforms = {
  uNetShadowEnabled: { value: 1 },
  uNetShadowMap0: { value: netShadowMaps[0].target.texture },
  uNetShadowMap1: { value: netShadowMaps[1].target.texture },
  uNetShadowMatrix0: { value: netShadowMaps[0].matrix },
  uNetShadowMatrix1: { value: netShadowMaps[1].matrix },
  uNetShadowSize: { value: netShadowSize },
  uNetShadowSunDirection: { value: netShadowSunDirection },
  uNetShadowRight: { value: netShadowRight },
  uNetShadowUp: { value: netShadowUp }
};
// Bilinear comparison filters coverage, never the packed depth itself. A fixed
// world-space disk is stable while the camera moves. Its radius grows with the
// actual blocker/receiver distance, so nearby cord shadows stay crisp and a net
// three metres above the floor produces the softer, fainter shadow of daylight.
const netShadowSampleCount = largeDisplay ? 48 : 32;
const netShadowDisk = [];
for (let i = 0; i < netShadowSampleCount; i++) {
  const radius = Math.sqrt((i + 0.5) / netShadowSampleCount), angle = i * 2.399963229728653;
  netShadowDisk.push(`vec2(${(Math.cos(angle) * radius).toFixed(7)}, ${(Math.sin(angle) * radius).toFixed(7)})`);
}
const netShadowShader = `
  uniform float uNetShadowEnabled;
  uniform sampler2D uNetShadowMap0, uNetShadowMap1;
  uniform mat4 uNetShadowMatrix0, uNetShadowMatrix1;
  uniform float uNetShadowSize;
  uniform vec3 uNetShadowSunDirection, uNetShadowRight, uNetShadowUp;
  varying vec3 vNetShadowWorldPosition;
  float potaNetCompare(sampler2D depthMap, vec2 uv, float z, vec2 receiverSlope) {
    vec2 grid = uv * uNetShadowSize - 0.5;
    vec2 f = fract(grid), base = (floor(grid) + 0.5) / uNetShadowSize;
    vec2 stepX = vec2(1.0 / uNetShadowSize, 0.0), stepY = stepX.yx;
    float a = step(z + dot(base - uv, receiverSlope), unpackRGBAToDepth(texture2D(depthMap, base)));
    float b = step(z + dot(base + stepX - uv, receiverSlope), unpackRGBAToDepth(texture2D(depthMap, base + stepX)));
    float c = step(z + dot(base + stepY - uv, receiverSlope), unpackRGBAToDepth(texture2D(depthMap, base + stepY)));
    float d = step(z + dot(base + stepX + stepY - uv, receiverSlope), unpackRGBAToDepth(texture2D(depthMap, base + stepX + stepY)));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float potaNetMapVisibility(sampler2D depthMap, vec3 q, vec3 worldNormal) {
    // No sampling outside the small light-space footprint, including on walls
    // behind the light or on receivers above the net.
    if (q.x <= 0.015 || q.y <= 0.015 || q.x >= 0.985 || q.y >= 0.985 || q.z <= 0.0 || q.z >= 0.999) return 1.0;
    float nLight = dot(worldNormal, uNetShadowSunDirection);
    vec2 slope = vec2(dot(worldNormal, uNetShadowRight), dot(worldNormal, uNetShadowUp))
      * (sign(nLight) / max(abs(nLight), 0.25)) * ${(netShadowWidth / netShadowDepth).toFixed(9)};
    // Bias is in metres, well below the cord radius. Receiver-plane correction
    // keeps filtering a grazing floor from creating detached or striped edges.
    float bias = (0.00030 + 0.00055 * (1.0 - abs(nLight))) / ${netShadowDepth.toFixed(1)};
    float receiverDepth = q.z - bias;
    float estimatedGap = max(0.0, (q.z - ${(1.9 / netShadowDepth).toFixed(9)}) * ${netShadowDepth.toFixed(1)});
    float searchRadius = max(1.0 / uNetShadowSize, estimatedGap * ${(netShadowAngularRadius / netShadowWidth).toFixed(9)});
    float blockerDepth = 0.0, blockers = 0.0;
    ${Array.from({ length: 12 }, (_, i) => {
      const r = Math.sqrt((i + 0.5) / 12), a = i * 2.399963229728653;
      const offset = `vec2(${(Math.cos(a) * r).toFixed(7)}, ${(Math.sin(a) * r).toFixed(7)})`;
      return `{ vec2 offset = ${offset} * searchRadius;
        float d = unpackRGBAToDepth(texture2D(depthMap, q.xy + offset));
        if (d < receiverDepth + dot(offset, slope)) { blockerDepth += d; blockers += 1.0; } }`;
    }).join('\n')}
    // The fallback is the known centre depth of this compact net, not a floor
    // decal. It avoids a disappearing thin-cord penumbra when a sparse blocker
    // search falls between strands; all visibility still comes from geometry.
    float gap = blockers > 0.0 ? max(0.0, (q.z - blockerDepth / blockers) * ${netShadowDepth.toFixed(1)}) : estimatedGap;
    float radius = max(0.45 / uNetShadowSize, gap * ${(netShadowAngularRadius / netShadowWidth).toFixed(9)});
    if (radius * uNetShadowSize < 0.8) return potaNetCompare(depthMap, q.xy, receiverDepth, slope);
    float visibility = 0.0;
    ${netShadowDisk.map(offset => `{ vec2 offset = ${offset} * radius;
      visibility += potaNetCompare(depthMap, q.xy + offset, receiverDepth + dot(offset, slope), slope); }`).join('\n')}
    return visibility / ${netShadowSampleCount.toFixed(1)};
  }
  float potaNetVisibility(vec3 viewNormal) {
    if (uNetShadowEnabled < 0.5) return 1.0;
    vec3 normalWorld = inverseTransformDirection(viewNormal, viewMatrix);
    vec3 a = (uNetShadowMatrix0 * vec4(vNetShadowWorldPosition, 1.0)).xyz;
    vec3 b = (uNetShadowMatrix1 * vec4(vNetShadowWorldPosition, 1.0)).xyz;
    return potaNetMapVisibility(uNetShadowMap0, a, normalWorld) * potaNetMapVisibility(uNetShadowMap1, b, normalWorld);
  }
`;
const netShadowReceivers = new Set();
function registerNetShadowReceiver(object) {
  for (const mat of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
    if (!mat.isMeshStandardMaterial || netShadowReceivers.has(mat)) continue;
    netShadowReceivers.add(mat);
    const previousCompile = mat.onBeforeCompile;
    const previousProgramKey = mat.customProgramCacheKey();
    mat.onBeforeCompile = function (shader, webglRenderer) {
      previousCompile.call(this, shader, webglRenderer);
      Object.assign(shader.uniforms, netShadowUniforms);
      shader.vertexShader = 'varying vec3 vNetShadowWorldPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 netWorldPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          netWorldPosition = instanceMatrix * netWorldPosition;
        #endif
        vNetShadowWorldPosition = (modelMatrix * netWorldPosition).xyz;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <packing>', '#include <packing>\n' + netShadowShader);
      const lighting = T.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',
        `getDirectionalLightInfo( directionalLight, directLight );
        #if defined(USE_SHADOWMAP) && (UNROLLED_LOOP_INDEX == 0)
          if (receiveShadow) directLight.color *= potaNetVisibility(normal);
        #endif`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', lighting);
    };
    mat.customProgramCacheKey = () => `${previousProgramKey}|pota-net-sun-v1-${netShadowSampleCount}`;
    mat.needsUpdate = true;
  }
}
scene.traverse(registerNetShadowReceiver);
const netShadowSavedViewport = new T.Vector4(), netShadowSavedScissor = new T.Vector4(), netShadowSavedColor = new T.Color();
let netShadowsDisposed = false;
function renderNetShadows() {
  if (netShadowsDisposed || netShadowUniforms.uNetShadowEnabled.value < 0.5) return;
  sun.getWorldPosition(netShadowLightPosition); sun.target.getWorldPosition(netShadowLightTarget);
  netShadowSunDirection.subVectors(netShadowLightPosition, netShadowLightTarget).normalize();
  const lightMoved = netShadowSunDirection.distanceToSquared(netShadowPreviousDirection) > 1e-14;
  if (!lightMoved && netShadowMaps[0].ready && netShadowMaps[1].ready && (++netShadowFrame % netShadowInterval)) return;
  let dirtyMaps = 0;
  for (const map of netShadowMaps) {
    map.chain.visible = map.net.chain.visible;
    map.cord.visible = map.net.mesh.visible; map.knots.visible = map.net.knots.visible;
    map.dirty = !map.ready || lightMoved || !map.previousMatrix.equals(map.net.group.matrixWorld);
    if (!map.dirty) for (let i = 0; i < map.net.positions.length; i++) {
      if (Math.abs(map.net.positions[i] - map.previousPositions[i]) > 0.000025) { map.dirty = true; break; }
    }
    if (map.dirty) dirtyMaps++;
  }
  // Avoid framebuffer, viewport and clear-state changes when both cached
  // depth maps already describe the exact currently displayed net geometry.
  if (!dirtyMaps) return;
  const previousTarget = renderer.getRenderTarget(), previousAutoClear = renderer.autoClear;
  const previousShadowUpdate = renderer.shadowMap.autoUpdate, previousXrEnabled = renderer.xr.enabled;
  const previousShadowNeedsUpdate = renderer.shadowMap.needsUpdate;
  const previousScissorTest = renderer.getScissorTest(), previousClearAlpha = renderer.getClearAlpha();
  renderer.getViewport(netShadowSavedViewport); renderer.getScissor(netShadowSavedScissor); renderer.getClearColor(netShadowSavedColor);
  try {
    renderer.autoClear = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false; renderer.xr.enabled = false;
    renderer.setScissorTest(false); renderer.setClearColor(0xffffff, 1);
    for (const map of netShadowMaps) {
      if (!map.dirty) continue;
      map.group.matrix.copy(map.net.group.matrixWorld);
      map.center.set(0, -0.22, 0).applyMatrix4(map.net.group.matrixWorld);
      map.view.position.copy(map.center).addScaledVector(netShadowSunDirection, 2);
      map.view.up.set(0, 1, 0);
      if (Math.abs(netShadowSunDirection.y) > 0.999) map.view.up.set(0, 0, 1);
      map.view.lookAt(map.center); map.view.updateMatrixWorld();
      netShadowRight.setFromMatrixColumn(map.view.matrixWorld, 0);
      netShadowUp.setFromMatrixColumn(map.view.matrixWorld, 1);
      map.matrix.copy(netShadowBiasMatrix).multiply(map.view.projectionMatrix).multiply(map.view.matrixWorldInverse);
      renderer.setRenderTarget(map.target); renderer.clear(true, true, false); renderer.render(map.depthScene, map.view);
      map.previousPositions.set(map.net.positions); map.previousMatrix.copy(map.net.group.matrixWorld);
      map.ready = true; map.updates++;
    }
    netShadowPreviousDirection.copy(netShadowSunDirection);
  } finally {
    renderer.setRenderTarget(previousTarget); renderer.setViewport(netShadowSavedViewport);
    renderer.setScissor(netShadowSavedScissor); renderer.setScissorTest(previousScissorTest);
    renderer.setClearColor(netShadowSavedColor, previousClearAlpha); renderer.autoClear = previousAutoClear;
    renderer.shadowMap.autoUpdate = previousShadowUpdate; renderer.xr.enabled = previousXrEnabled;
    renderer.shadowMap.needsUpdate = previousShadowNeedsUpdate;
  }
}
function getNetShadowDiagnostics() {
  return { enabled: netShadowUniforms.uNetShadowEnabled.value > 0.5, disposed: netShadowsDisposed,
    resolution: netShadowSize, texelWorldSize: netShadowWidth / netShadowSize,
    cordDiameter: window.PotaNetPhysics.parameters.cordRadius * 2,
    penumbraAngularRadius: netShadowAngularRadius, filterSamples: netShadowSampleCount,
    receiverMaterials: netShadowReceivers.size, coarseNetShadows: false,
    perHoop: netShadowMaps.map(map => ({ sign: map.net.sign, updates: map.updates,
      casterType: map.net.chain.visible ? 'interlocking-chain' : 'woven-cords',
      sharedInstanceBuffer: map.chain.instanceMatrix === map.net.chain.instanceMatrix,
      cords: map.net.chain.visible ? 0 : map.net.visibleEdges, knots: map.net.chain.visible ? 0 : map.net.particleCount,
      chainLinks: map.net.chain.visible ? map.net.chainCount : 0,
      casterVertices: map.net.chain.visible ? chainGeometry.attributes.position.count * map.net.chainCount : map.net.geometry.attributes.position.count + knotGeometry.attributes.position.count * map.net.particleCount,
      position: map.center.toArray(), shadowMatrix: map.matrix.toArray(), lightDirection: netShadowSunDirection.toArray() })) };
}

    const courtCosmeticTextures = new Map();
    const mapleMap = floorMat.map; courtCosmeticTextures.set('maple-original', mapleMap);
    let outdoorCourt = null, metalEnvironment = null, metalEnvironmentUnavailable = false;
    const environmentDecorGroups = new Map();
    function invalidateCourtAppearance() {
      reflectionReady = false;
      for (const map of netShadowMaps) map.ready = false;
      renderer.shadowMap.needsUpdate = true;
    }
    function ensureMetalEnvironment() {
      if (metalEnvironment) return metalEnvironment.texture;
      if (metalEnvironmentUnavailable || !renderer.potaHDRSupported) { metalEnvironmentUnavailable = true; return null; }
      // A small offline studio map provides broad gym/window reflections on
      // rounded metal. PMREM is built once and shared by all metal finishes.
      const [c, ctx] = textureCanvas(512, 256);
      ctx.fillStyle = '#6c7b80'; ctx.fillRect(0, 0, 512, 256);
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, '#b8cbd1'); gradient.addColorStop(0.48, '#6c7b80');
      gradient.addColorStop(0.53, '#8c806a'); gradient.addColorStop(1, '#444439');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 256);
      for (const x of [25, 158, 300, 438]) {
        ctx.fillStyle = '#e8f1e8'; ctx.fillRect(x, 62, 28, 42);
        ctx.fillStyle = '#fff8df'; ctx.fillRect(x + 7, 23, 9, 24);
      }
      const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace; map.mapping = T.EquirectangularReflectionMapping;
      let generator;
      try { generator = new T.PMREMGenerator(renderer); metalEnvironment = generator.fromEquirectangular(map); }
      catch (_) { metalEnvironmentUnavailable = true; }
      finally { map.dispose(); if (generator) generator.dispose(); }
      if (!metalEnvironment) return null;
      for (const mat of [chainMat, rimMat]) { mat.envMap = metalEnvironment.texture; mat.envMapIntensity = 0.8; mat.needsUpdate = true; }
      return metalEnvironment.texture;
    }
    function setNetStyle(id) {
      if (!['nylon', 'black-net', 'chain', 'gold-chain'].includes(id)) return false;
      const chain = id === 'chain' || id === 'gold-chain';
      if (chain) ensureMetalEnvironment();
      selectedNetStyle = id;
      netMat.color.set(id === 'black-net' ? 0x20272a : 0xf5f1e4);
      netMat.roughness = id === 'black-net' ? 0.91 : 0.86;
      chainMat.color.set(id === 'gold-chain' ? 0xe4b642 : 0xb7c1c6);
      chainMat.roughness = id === 'gold-chain' ? 0.21 : 0.24;
      for (const net of nets) {
        if (net.solver.setMaterial) net.solver.setMaterial(chain ? 'chain' : 'nylon');
        net.mesh.visible = !chain; net.knots.visible = !chain; net.chain.visible = chain;
        net.group.name = `${chain ? 'linked-chain' : 'woven-net'}-${net.sign}`;
        updateNetGeometry(net);
      }
      invalidateCourtAppearance(); return true;
    }
    const rimStyles = {
      standard: { color: 0xc04e24, roughness: 0.35, metalness: 0.55, emissive: 0x000000, intensity: 0 },
      'black-rim': { color: 0x171d21, roughness: 0.29, metalness: 0.68, emissive: 0x000000, intensity: 0 },
      'chrome-rim': { color: 0xe1e9ec, roughness: 0.14, metalness: 0.94, emissive: 0x000000, intensity: 0 },
      'gold-rim': { color: 0xe8b839, roughness: 0.22, metalness: 0.88, emissive: 0x000000, intensity: 0 },
      'neon-rim': { color: 0x96ebd5, roughness: 0.26, metalness: 0.34, emissive: 0x2cf2bf, intensity: 0.8 }
    };
    function setRimStyle(id) {
      const style = rimStyles[id]; if (!style) return false;
      if (id !== 'standard') ensureMetalEnvironment();
      selectedRimStyle = id; rimMat.color.set(style.color); rimMat.roughness = style.roughness;
      rimMat.metalness = style.metalness; rimMat.emissive.set(style.emissive); rimMat.emissiveIntensity = style.intensity;
      invalidateCourtAppearance(); return true;
    }
    function makeBoardTexture(id) {
      if (courtCosmeticTextures.has(id)) return courtCosmeticTextures.get(id);
      const [c, ctx] = textureCanvas(768, 456);
      ctx.fillStyle = id === 'street-board' ? '#ded4b8' : id === 'carbon-board' ? '#202b31' : '#111e2c';
      ctx.fillRect(0, 0, 768, 456);
      if (id === 'street-board') {
        for (let y = 0; y < 456; y += 76) {
          ctx.fillStyle = 'rgba(86,60,38,.35)'; ctx.fillRect(0, y, 768, 2);
          for (let i = 0; i < 20; i++) {
            ctx.strokeStyle = `rgba(113,85,52,${0.05 + random() * 0.09})`; ctx.lineWidth = 0.7;
            const yy = y + random() * 76; ctx.beginPath(); ctx.moveTo(0, yy); ctx.bezierCurveTo(240, yy + 5, 510, yy - 4, 768, yy + 1); ctx.stroke();
          }
        }
        ctx.strokeStyle = '#37474b'; ctx.lineWidth = 13; ctx.strokeRect(17, 17, 734, 422);
        ctx.font = 'bold 29px Arial'; ctx.fillStyle = '#6a5742'; ctx.textAlign = 'center'; ctx.fillText('POTA / STREET', 384, 69);
      } else if (id === 'carbon-board') {
        for (let y = 0; y < 456; y += 12) for (let x = 0; x < 768; x += 12) {
          ctx.fillStyle = ((x / 12 + y / 12) & 1) ? '#303c42' : '#18242b'; ctx.fillRect(x, y, 10, 10);
          ctx.fillStyle = 'rgba(176,191,194,.08)'; ctx.fillRect(x + 1, y + 1, 2, 8);
        }
        ctx.strokeStyle = '#b8c6cc'; ctx.lineWidth = 9; ctx.strokeRect(16, 16, 736, 424);
        ctx.fillStyle = '#d6e6e9'; ctx.textAlign = 'center'; ctx.font = 'bold 25px Arial'; ctx.fillText('C A R B O N', 384, 65);
      } else {
        ctx.strokeStyle = 'rgba(39,191,200,.25)'; ctx.lineWidth = 1;
        for (let x = 20; x < 768; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 456); ctx.stroke(); }
        for (let y = 10; y < 456; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(768, y); ctx.stroke(); }
        ctx.strokeStyle = '#3fe8d0'; ctx.lineWidth = 9; ctx.strokeRect(16, 16, 736, 424);
        ctx.strokeStyle = '#866eff'; ctx.lineWidth = 3; ctx.strokeRect(29, 29, 710, 398);
        ctx.fillStyle = '#6debd7'; ctx.font = 'bold 25px Arial'; ctx.textAlign = 'center'; ctx.fillText('P O T A  /  N E O N', 384, 65);
      }
      const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      courtCosmeticTextures.set(id, texture); return texture;
    }
    function setBackboardStyle(id) {
      if (!['glass', 'street-board', 'carbon-board', 'neon-board'].includes(id)) return false;
      selectedBackboardStyle = id; const glass = id === 'glass', neon = id === 'neon-board';
      const map = glass ? null : makeBoardTexture(id);
      for (const board of backboards) {
        const mat = board.material; mat.map = map; mat.color.set(glass ? 0xd5e7e3 : 0xffffff);
        mat.transparent = glass; mat.opacity = glass ? 0.22 : 1; mat.depthWrite = !glass;
        mat.roughness = glass ? 0.06 : id === 'street-board' ? 0.84 : 0.36;
        mat.metalness = id === 'carbon-board' ? 0.22 : 0.04;
        mat.clearcoat = glass ? 1 : id === 'street-board' ? 0.08 : 0.48;
        mat.emissive.set(neon ? 0x164b60 : 0x000000); mat.emissiveIntensity = neon ? 0.22 : 0;
        mat.needsUpdate = true;
      }
      for (const mat of [boardFrameMat, boardTargetMat]) {
        mat.color.set(neon ? 0x65f4dc : id === 'street-board' ? 0x34434a : id === 'carbon-board' ? 0xc9d8dc : 0xf7f0df);
        mat.emissive.set(neon ? 0x21d9b6 : 0x000000); mat.emissiveIntensity = neon ? 0.65 : 0;
        mat.metalness = id === 'carbon-board' ? 0.6 : 0; mat.roughness = glass ? 0.52 : 0.4;
      }
      invalidateCourtAppearance(); return true;
    }
    function asphaltTexture() {
      if (courtCosmeticTextures.has('asphalt')) return courtCosmeticTextures.get('asphalt');
      const [c, ctx] = textureCanvas(1024, 1024), [h, height] = textureCanvas(512, 512), [r, rough] = textureCanvas(512, 512);
      const pixels = ctx.createImageData(1024, 1024), heightPixels = height.createImageData(512, 512), roughPixels = rough.createImageData(512, 512);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const pixel = i / 4, x = pixel % 1024, y = Math.floor(pixel / 1024), aggregate = surfaceNoise(x >> 2, y >> 2, 74), fine = surfaceNoise(x, y, 31);
        const n = Math.round(aggregate * 12 + fine * 9); pixels.data[i] = 53 + n; pixels.data[i + 1] = 65 + n; pixels.data[i + 2] = 68 + n; pixels.data[i + 3] = 255;
      }
      for (let i = 0; i < heightPixels.data.length; i += 4) {
        const pixel = i / 4, x = pixel % 512, y = Math.floor(pixel / 512), aggregate = surfaceNoise(x >> 1, y >> 1, 74), n = surfaceNoise(x * 2, y * 2, 31);
        const relief = Math.round(126 + aggregate * 32 + n * 15), surfaceRoughness = Math.round(218 + n * 30);
        for (let k = 0; k < 3; k++) { heightPixels.data[i + k] = relief; roughPixels.data[i + k] = surfaceRoughness; } heightPixels.data[i + 3] = roughPixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0); height.putImageData(heightPixels, 0, 0); rough.putImageData(roughPixels, 0, 0);
      const pack = { map: surfaceTexture(c, 'asphalt-albedo-1024', true, 8, 12), bumpMap: surfaceTexture(h, 'asphalt-height-512', false, 8, 12), roughnessMap: surfaceTexture(r, 'asphalt-roughness-512', false, 8, 12), bumpScale: 0.0018 };
      surfaceDetailMaps.set('asphalt', pack); courtCosmeticTextures.set('asphalt', pack.map); return pack.map;
    }
    function createOutdoorCourt() {
      const group = new T.Group(); group.name = 'outdoor-street-court'; group.visible = false; scene.add(group);
      const fenceMat = new T.MeshStandardMaterial({ color: 0x718f93, metalness: 0.58, roughness: 0.48, side: T.DoubleSide, transparent: true, alphaTest: 0.18, depthWrite: true });
      const [c, ctx] = textureCanvas(128, 128); ctx.clearRect(0, 0, 128, 128);
      ctx.strokeStyle = '#c0d0d1'; ctx.lineWidth = 2.4;
      for (let i = -128; i <= 256; i += 64) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - 128, 128); ctx.stroke();
      }
      const baseMap = new T.CanvasTexture(c); baseMap.colorSpace = T.SRGBColorSpace; baseMap.wrapS = baseMap.wrapT = T.RepeatWrapping;
      baseMap.repeat.set(24, 9); fenceMat.map = baseMap; courtCosmeticTextures.set('fence-short', baseMap);
      const longMat = fenceMat.clone(), longMap = baseMap.clone(); longMap.repeat.set(36, 9); longMap.needsUpdate = true;
      longMat.map = longMap; courtCosmeticTextures.set('fence-long', longMap);
      const roofMat = fenceMat.clone(), roofMap = baseMap.clone(); roofMap.repeat.set(24, 36); roofMap.needsUpdate = true;
      roofMat.map = roofMap; roofMat.opacity = 0.48; courtCosmeticTextures.set('fence-roof', roofMap);
      const postMat = new T.MeshStandardMaterial({ color: 0x43585d, roughness: 0.46, metalness: 0.72 });
      // Full-height visible ball-stop fences coincide with all four existing
      // physical room faces. The overhead mesh also marks the ceiling limit.
      for (const sign of [-1, 1]) {
        const end = new T.Mesh(new T.PlaneGeometry(23.88, 8.89), fenceMat); end.position.set(0, 4.445, sign * 17.94); end.receiveShadow = true; group.add(end);
        const side = new T.Mesh(new T.PlaneGeometry(35.88, 8.89), longMat); side.rotation.y = Math.PI / 2; side.position.set(sign * 11.94, 4.445, 0); side.receiveShadow = true; group.add(side);
        for (let x = -11.94; x <= 12; x += 3.98) box(0.075, 8.89, 0.075, x, 4.445, sign * 17.94, postMat, true, group);
        for (let z = -13.95; z <= 14; z += 3.986) box(0.075, 8.89, 0.075, sign * 11.94, 4.445, z, postMat, true, group);
        box(23.95, 0.07, 0.07, 0, 8.87, sign * 17.94, postMat, true, group);
        box(0.07, 0.07, 35.95, sign * 11.94, 8.87, 0, postMat, true, group);
        box(23.95, 0.10, 0.13, 0, 0.05, sign * 17.94, postMat, false, group);
        box(0.13, 0.10, 35.95, sign * 11.94, 0.05, 0, postMat, false, group);
      }
      const roof = new T.Mesh(new T.PlaneGeometry(23.88, 35.88), roofMat); roof.rotation.x = Math.PI / 2; roof.position.y = 8.89; group.add(roof);
      const skyline = new T.Group(); skyline.name = 'outside-city-skyline'; group.add(skyline);
      const cityMat = new T.MeshStandardMaterial({ color: 0x647878, roughness: 0.94 });
      const windowMap = (() => {
        const [c, ctx] = textureCanvas(128, 256); ctx.fillStyle = '#6f8282'; ctx.fillRect(0, 0, 128, 256);
        for (let x = 9; x < 128; x += 24) for (let y = 12; y < 256; y += 30) {
          ctx.fillStyle = random() > 0.25 ? '#3b575d' : '#b1bfbb'; ctx.fillRect(x, y, 11, 15);
          ctx.fillStyle = 'rgba(210,220,205,.28)'; ctx.fillRect(x, y, 11, 2);
        }
        const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace; map.wrapS = map.wrapT = T.RepeatWrapping; courtCosmeticTextures.set('city-windows', map); return map;
      })(); cityMat.map = windowMap;
      for (const sign of [-1, 1]) for (let i = 0; i < 7; i++) {
        const height = 5 + random() * 11, x = -31 + i * 10.4;
        box(6 + random() * 3, height, 7, x, height * 0.5 - 0.8, sign * (29 + random() * 7), cityMat, false, skyline);
      }
      const outsideGround = new T.Mesh(new T.PlaneGeometry(120, 120), new T.MeshStandardMaterial({ color: 0x819382, roughness: 1 }));
      outsideGround.rotation.x = -Math.PI / 2; outsideGround.position.y = -0.06; outsideGround.receiveShadow = true; group.add(outsideGround);
      const skyMap = (() => {
        const [c, ctx] = textureCanvas(512, 256), gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#548fae'); gradient.addColorStop(0.47, '#c8dedb'); gradient.addColorStop(0.65, '#d8ded1'); gradient.addColorStop(1, '#7f958a');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 256);
        ctx.fillStyle = 'rgba(245,245,231,.36)';
        for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.ellipse(random() * 512, 60 + random() * 45, 23 + random() * 28, 3 + random() * 6, 0, 0, Math.PI * 2); ctx.fill(); }
        const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace; courtCosmeticTextures.set('outdoor-sky', map); return map;
      })();
      const sky = new T.Mesh(new T.SphereGeometry(72, 24, 16), new T.MeshBasicMaterial({ map: skyMap, side: T.BackSide, fog: false, depthWrite: false }));
      sky.name = 'outdoor-daylight-sky'; sky.renderOrder = -10; group.add(sky);
      group.userData = { skyline, cityMat, sky, outsideGround, fenceMat, longMat, postMat };
      batchStaticGeometry(skyline); batchStaticGeometry(group);
      group.traverse(registerNetShadowReceiver); return group;
    }
    function environmentSkyTexture(id) {
      const key = 'environment-sky-' + id;
      if (courtCosmeticTextures.has(key)) return courtCosmeticTextures.get(key);
      const colors = {
        'street-court': ['#526975', '#94a8af', '#c1cccc', '#72878a'],
        'midnight-court': ['#071020', '#182c41', '#3a4c60', '#192a38'],
        'coastal-court': ['#728e9d', '#b1d0d4', '#d4e1da', '#c9bb96'],
        'desert-court': ['#bb9972', '#d8b587', '#e3c297', '#b88454'],
        'alpine-court': ['#8da8b5', '#c0d5de', '#e2ebed', '#91a6a7']
      }[id];
      if (!colors) return courtCosmeticTextures.get('outdoor-sky');
      const [c, ctx] = textureCanvas(512, 256), gradient = ctx.createLinearGradient(0, 0, 0, 256);
      for (let i = 0; i < colors.length; i++) gradient.addColorStop([0, 0.45, 0.65, 1][i], colors[i]);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 256);
      if (id === 'midnight-court') {
        ctx.fillStyle = 'rgba(9,18,31,.3)';
        for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.ellipse(random() * 512, 38 + random() * 80, 45 + random() * 65, 9 + random() * 15, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(217,232,232,.4)'; ctx.shadowColor = '#8faabd'; ctx.shadowBlur = 23;
        ctx.beginPath(); ctx.arc(338, 69, 12, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(101,129,151,.22)'; ctx.beginPath(); ctx.arc(333, 67, 3.5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = id === 'desert-court' ? '#fff2c1' : 'rgba(255,255,248,.64)';
        if (id === 'desert-court') { ctx.fillStyle = 'rgba(255,232,180,.46)'; ctx.shadowColor = '#efd2a3'; ctx.shadowBlur = 38; ctx.beginPath(); ctx.arc(192, 76, 13, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
        else for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.ellipse(random() * 512, 58 + random() * 48, 21 + random() * 35, 3 + random() * 8, 0, 0, Math.PI * 2); ctx.fill(); }
      }
      const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace; courtCosmeticTextures.set(key, map); return map;
    }
    function environmentFloorTexture(id) {
      if (id === 'gym' || id === 'sunset-gym' || id === 'night-gym') return mapleMap;
      if (id === 'street-court' || id === 'midnight-court') return asphaltTexture();
      const key = 'environment-floor-' + id;
      if (courtCosmeticTextures.has(key)) return courtCosmeticTextures.get(key);
      const [c, ctx] = textureCanvas(1024, 1024), [h, height] = textureCanvas(512, 512), [r, rough] = textureCanvas(512, 512);
      ctx.scale(2, 2);
      ctx.fillStyle = id === 'royal-arena' ? '#24202d' : id === 'neon-arena' ? '#37404c' : '#bac0bb'; ctx.fillRect(0, 0, 512, 512);
      const heightPixels = height.createImageData(512, 512), roughPixels = rough.createImageData(512, 512);
      for (let i = 0; i < heightPixels.data.length; i += 4) {
        const pixel = i / 4, x = pixel % 512, y = Math.floor(pixel / 512), n = surfaceNoise(x, y, 91);
        const relief = Math.round(145 + n * (id === 'royal-arena' ? 3 : 18)), surfaceRoughness = Math.round((id === 'royal-arena' ? 205 : 221) + n * (id === 'royal-arena' ? 20 : 25));
        for (let k = 0; k < 3; k++) { heightPixels.data[i + k] = relief; roughPixels.data[i + k] = surfaceRoughness; } heightPixels.data[i + 3] = roughPixels.data[i + 3] = 255;
      }
      height.putImageData(heightPixels, 0, 0); rough.putImageData(roughPixels, 0, 0);
      for (let i = 0; i < 14000; i++) {
        const n = surfaceNoise(i, 0, 95); ctx.fillStyle = n > 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(10,24,32,.035)';
        const s = 0.25 + n * 0.8; ctx.fillRect(surfaceNoise(i, 1, 95) * 512, surfaceNoise(i, 2, 95) * 512, s, s);
      }
      if (id === 'royal-arena') {
        for (let i = 0; i < 15; i++) {
          const x = surfaceNoise(i, 0, 96) * 512, y = surfaceNoise(i, 1, 96) * 512; ctx.strokeStyle = `rgba(205,171,105,${0.12 + surfaceNoise(i, 2, 96) * 0.15})`; ctx.lineWidth = 0.4 + surfaceNoise(i, 3, 96);
          ctx.beginPath(); ctx.moveTo(x - 120, y - 150); ctx.bezierCurveTo(x + 80, y - 50, x - 90, y + 25, x + 130, y + 175); ctx.stroke();
          rough.strokeStyle = 'rgba(255,255,255,.09)'; rough.lineWidth = 1.4; rough.beginPath(); rough.moveTo(x - 120, y - 150); rough.bezierCurveTo(x + 80, y - 50, x - 90, y + 25, x + 130, y + 175); rough.stroke();
        }
      } else {
        // Synthetic tiles and outdoor painted concrete use different joint
        // sizes; the regulation court markings remain on their own meshes.
        const size = id === 'neon-arena' ? 64 : id === 'alpine-court' ? 128 : 256;
        ctx.strokeStyle = id === 'neon-arena' ? 'rgba(120,166,185,.2)' : 'rgba(58,73,69,.12)'; ctx.lineWidth = 1;
        height.strokeStyle = '#838383'; height.lineWidth = 0.55; rough.strokeStyle = '#f4f4f4'; rough.lineWidth = 0.7;
        for (const brush of [ctx, height, rough]) for (let i = 0; i <= 512; i += size) { brush.beginPath(); brush.moveTo(i, 0); brush.lineTo(i, 512); brush.moveTo(0, i); brush.lineTo(512, i); brush.stroke(); }
      }
      const repeatX = id === 'royal-arena' ? 4 : 6, repeatY = id === 'royal-arena' ? 6 : 9;
      const pack = { map: surfaceTexture(c, key + '-albedo-1024', true, repeatX, repeatY), bumpMap: surfaceTexture(h, key + '-height-512', false, repeatX, repeatY), roughnessMap: surfaceTexture(r, key + '-roughness-512', false, repeatX, repeatY), bumpScale: id === 'royal-arena' ? 0.00035 : id === 'neon-arena' ? 0.00075 : 0.0012 };
      surfaceDetailMaps.set(key, pack); courtCosmeticTextures.set(key, pack.map); return pack.map;
    }
    function createEnvironmentDecor(id) {
      if (environmentDecorGroups.has(id)) return environmentDecorGroups.get(id);
      const group = new T.Group(); group.name = 'environment-decor-' + id; group.visible = false; scene.add(group);
      environmentDecorGroups.set(id, group);
      function object(geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
        const mesh = new T.Mesh(geometry, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); group.add(mesh); return mesh;
      }
      // Every outdoor decoration stands beyond the existing visible fences.
      // Shared low-poly primitives keep each cached setting small and static.
      if (id === 'midnight-court') {
        const poleMat = new T.MeshStandardMaterial({ color: 0x273449, metalness: 0.65, roughness: 0.4 });
        const lightMat = new T.MeshBasicMaterial({ color: 0xc8ecff });
        const pole = new T.CylinderGeometry(0.065, 0.09, 7.3, 8), fixture = new T.BoxGeometry(0.85, 0.12, 0.55);
        for (const x of [-13.1, 13.1]) for (const z of [-19.2, 19.2]) {
          object(pole, poleMat, x, 3.65, z); object(fixture, lightMat, x, 7.28, z);
        }
      } else if (id === 'coastal-court') {
        const oceanMat = new T.MeshStandardMaterial({ color: 0x2598b3, roughness: 0.29, metalness: 0.12 });
        const ocean = object(new T.PlaneGeometry(110, 38), oceanMat, 0, -0.035, -44); ocean.rotation.x = -Math.PI / 2;
        const foamMat = new T.MeshBasicMaterial({ color: 0xc6e9dd, transparent: true, opacity: 0.55 });
        const wave = new T.PlaneGeometry(83, 0.12);
        for (let i = 0; i < 9; i++) { const m = object(wave, foamMat, (i % 2) * 3, -0.026, -27 - i * 3.7); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.sin(i) * 0.014; }
        const trunkMat = new T.MeshStandardMaterial({ color: 0x9b7850, roughness: 0.95 }), leafMat = new T.MeshStandardMaterial({ color: 0x3c7858, roughness: 0.86, side: T.DoubleSide });
        const trunk = new T.CylinderGeometry(0.12, 0.22, 1, 7), leaf = new T.BufferGeometry();
        leaf.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0.28, 0.2, 1, -0.28, 0.2, 1, 0.24, 0.05, 2.1, -0.24, 0.05, 2.1, 0, -0.75, 3.5], 3));
        leaf.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]); leaf.computeVertexNormals();
        for (const [i, p] of [[-15.4, -21.4], [15.3, -23], [-16, 22.5], [15.8, 24]].entries()) {
          const h = 6.2 + (i % 2) * 1.1, tree = object(trunk, trunkMat, p[0], h * 0.5, p[1], 1, h, 1); tree.rotation.z = i % 2 ? -0.065 : 0.055;
          for (let f = 0; f < 7; f++) { const frond = object(leaf, leafMat, p[0], h, p[1]); frond.rotation.y = f * Math.PI * 2 / 7 + i; frond.rotation.x = (f % 2) * 0.09; }
        }
      } else if (id === 'desert-court') {
        const duneMat = new T.MeshStandardMaterial({ color: 0xd6a96f, roughness: 1 }), ridgeMat = new T.MeshStandardMaterial({ color: 0xb7794f, roughness: 1 });
        const dune = new T.SphereGeometry(1, 14, 8);
        for (let i = 0; i < 11; i++) {
          const sign = i % 2 ? 1 : -1, x = -37 + (i % 6) * 14, z = sign * (29 + (i % 3) * 4);
          object(dune, i % 3 ? duneMat : ridgeMat, x, -0.6, z, 12 + i % 4, 3 + i % 3, 8 + i % 4);
        }
        const cactusMat = new T.MeshStandardMaterial({ color: 0x58745d, roughness: 0.88 }), branch = new T.CylinderGeometry(0.19, 0.22, 1, 7), cap = new T.SphereGeometry(0.2, 7, 5);
        for (const [x, z, h] of [[-15.5, -22, 3.8], [16.3, -25, 3.1], [-17, 23, 2.7], [15.6, 25, 3.9]]) {
          object(branch, cactusMat, x, h / 2, z, 1, h, 1); object(cap, cactusMat, x, h, z);
          for (const sign of [-1, 1]) { const arm = object(branch, cactusMat, x + sign * 0.45, h * 0.56, z, 0.75, 0.9, 0.75); arm.rotation.z = Math.PI / 2; object(branch, cactusMat, x + sign * 0.9, h * 0.56 + 0.42, z, 0.75, 0.85, 0.75); object(cap, cactusMat, x + sign * 0.9, h * 0.56 + 0.85, z, 0.75, 0.75, 0.75); }
        }
      } else if (id === 'alpine-court') {
        const rockMat = new T.MeshStandardMaterial({ color: 0x73888d, roughness: 0.94, flatShading: true }), snowMat = new T.MeshStandardMaterial({ color: 0xe9f1ec, roughness: 0.9, flatShading: true });
        const peak = new T.ConeGeometry(1, 1, 5);
        for (let i = 0; i < 9; i++) {
          const x = -43 + i * 11, h = 13 + (i % 3) * 4, z = -38 - (i % 2) * 5, w = 10 + i % 3;
          const mountain = object(peak, rockMat, x, h / 2 - 1, z, w, h, w * 0.75); mountain.rotation.y = i * 0.61;
          const snow = object(peak, snowMat, x, h * 0.79 - 1, z, w * 0.42, h * 0.42, w * 0.315); snow.rotation.y = mountain.rotation.y;
        }
        const barkMat = new T.MeshStandardMaterial({ color: 0x635d4c, roughness: 1 }), pineMat = new T.MeshStandardMaterial({ color: 0x2e6255, roughness: 0.91 });
        const stem = new T.CylinderGeometry(0.1, 0.16, 1, 6), needles = new T.ConeGeometry(1, 1, 7);
        for (let i = 0; i < 12; i++) {
          const sign = i % 2 ? -1 : 1, x = sign * (14 + i % 3 * 2), z = -25 + Math.floor(i / 2) * 10, h = 4 + (i % 3);
          object(stem, barkMat, x, h * 0.45, z, 1, h * 0.9, 1);
          object(needles, pineMat, x, h * 0.55, z, h * 0.25, h * 0.85, h * 0.25); object(needles, pineMat, x, h * 0.84, z, h * 0.18, h * 0.58, h * 0.18);
        }
      } else if (id === 'neon-arena' || id === 'royal-arena') {
        const neon = id === 'neon-arena';
        const trim = new T.MeshBasicMaterial({ color: neon ? 0x48e7f1 : 0xe3bc61 }), secondary = new T.MeshBasicMaterial({ color: neon ? 0xda5bdd : 0x8b619b });
        const rail = new T.BoxGeometry(0.035, 0.06, 34.5), vertical = new T.BoxGeometry(0.045, 3.6, 0.045);
        for (const sign of [-1, 1]) {
          object(rail, trim, sign * 11.82, 3.05, 0); object(rail, secondary, sign * 11.82, 6.7, 0);
          for (const z of [-15, -9, -3, 3, 9, 15]) object(vertical, z % 3 ? trim : secondary, sign * 11.82, 4.86, z);
        }
        const [c, ctx] = textureCanvas(512, 256); ctx.fillStyle = neon ? '#102130' : '#352344'; ctx.fillRect(0, 0, 512, 256);
        ctx.strokeStyle = neon ? '#52e5ee' : '#e2bd66'; ctx.lineWidth = 8; ctx.strokeRect(12, 12, 488, 232); ctx.lineWidth = 2; ctx.strokeRect(24, 24, 464, 208);
        if (!neon) { ctx.fillStyle = '#e2bd66'; ctx.beginPath(); ctx.moveTo(210, 83); ctx.lineTo(205, 48); ctx.lineTo(232, 66); ctx.lineTo(256, 37); ctx.lineTo(280, 66); ctx.lineTo(307, 48); ctx.lineTo(302, 83); ctx.closePath(); ctx.fill(); }
        ctx.textAlign = 'center'; ctx.font = 'bold 56px Arial'; ctx.fillStyle = neon ? '#a0f7f0' : '#f0d595'; ctx.fillText(neon ? 'N E O N' : 'R O Y A L', 256, 150); ctx.font = '20px Arial'; ctx.fillText('P O T A  /  A R E N A', 256, 193);
        const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace; courtCosmeticTextures.set('arena-banner-' + id, map);
        const bannerMat = new T.MeshBasicMaterial({ map }), sign = new T.PlaneGeometry(5.2, 2.6);
        for (const direction of [-1, 1]) { const banner = object(sign, bannerMat, 0, 6.24, direction * 17.80); if (direction > 0) banner.rotation.y = Math.PI; }
        if (!neon) {
          const sideBanner = new T.PlaneGeometry(1.55, 3.1);
          for (const side of [-1, 1]) for (const z of [-12, -4, 4, 12]) { const banner = object(sideBanner, bannerMat, side * 11.79, 4.9, z); banner.rotation.y = -side * Math.PI / 2; }
        }
      }
      group.traverse(registerNetShadowReceiver); return group;
    }
    const environmentStyles = {
      gym: { background: 0xb6afa2, fogNear: 29, fogFar: 62, wall: 0xffffff, floor: 0xffffff, key: 0x816450, paint: 0xf4ead8,
        sun: 0xfff3d7, sunPower: 3.15, sunPosition: [-10, 12, 5], sky: 0xf4f7ef, ground: 0x766451, ambient: 2.15, fill: 0xd1e1e1, fillPower: 0.75, window: 0xc7ded8, windowPower: 0.65, lamp: 0xfff7dd, spots: 28, exposure: 1.05, reflection: 1 },
      'sunset-gym': { background: 0xcda58b, fogNear: 26, fogFar: 58, wall: 0xe8bca0, floor: 0xf3c39c, key: 0x7b4c48, paint: 0xffe3bd,
        sun: 0xffaa66, sunPower: 3.4, sunPosition: [-10, 8, -8], sky: 0xffd0a5, ground: 0x6b4e5d, ambient: 1.65, fill: 0xc0c5ea, fillPower: 0.95, window: 0xffbb72, windowPower: 0.72, lamp: 0xffd3a0, spots: 17, exposure: 1.01, reflection: 1 },
      'night-gym': { background: 0x152331, fogNear: 26, fogFar: 56, wall: 0x7895a6, floor: 0xa9bac3, key: 0x354e67, paint: 0xd4e9eb,
        sun: 0x7ca8d7, sunPower: 1.05, sunPosition: [-8, 12, 7], sky: 0x8ea8d0, ground: 0x26323c, ambient: 0.78, fill: 0x9ce4dd, fillPower: 0.7, window: 0x19324d, windowPower: 0.26, lamp: 0xb0fff0, spots: 46, exposure: 1.11, reflection: 1.08 },
      'street-court': { outdoor: true, background: 0xaecbd0, fogNear: 34, fogFar: 79, wall: 0xffffff, floor: 0xffffff, key: 0x336c69, paint: 0xe7e9d1,
        sun: 0xffefd5, sunPower: 3.4, sunPosition: [-9, 13, 6], sky: 0xc3e2ee, ground: 0x56674c, ambient: 2.4, fill: 0xaac9dc, fillPower: 0.7, window: 0xc7ded8, windowPower: 0.65, lamp: 0xfff7dd, spots: 0, exposure: 1.02, reflection: 0.12, outside: 0x819382 },
      'midnight-court': { outdoor: true, background: 0x18243c, fogNear: 39, fogFar: 81, wall: 0xffffff, floor: 0x8196b8, key: 0x47406e, paint: 0x9fe6e4,
        sun: 0xc0d6fa, sunPower: 1.7, sunPosition: [-11, 13, -8], sky: 0x9bbbe9, ground: 0x273344, ambient: 1.18, fill: 0x67b8e7, fillPower: 1.18, window: 0x8dcddd, windowPower: 0.35, lamp: 0xc8ecff, spots: 0, exposure: 1.12, reflection: 0.18, outside: 0x253b44, fence: 0x59758b, post: 0x35465c },
      'coastal-court': { outdoor: true, background: 0xb8dfe0, fogNear: 43, fogFar: 84, wall: 0xffffff, floor: 0x639ba4, key: 0x287e97, paint: 0xfff1ce,
        sun: 0xffefd0, sunPower: 3.8, sunPosition: [-11, 15, 9], sky: 0xc6edf1, ground: 0xc3b58e, ambient: 2.35, fill: 0xb7e3ec, fillPower: 0.72, window: 0xffffff, windowPower: 0, lamp: 0xffffff, spots: 0, exposure: 1.01, reflection: 0.10, outside: 0xd9c393, fence: 0xb7d1ce, post: 0xc0d6d0 },
      'desert-court': { outdoor: true, background: 0xd8ba91, fogNear: 42, fogFar: 81, wall: 0xffffff, floor: 0xc69b78, key: 0x905339, paint: 0xffe9bb,
        sun: 0xffd39b, sunPower: 4.1, sunPosition: [-13, 15, -7], sky: 0xd5dfdf, ground: 0xb68a5d, ambient: 1.92, fill: 0xc0d4df, fillPower: 0.76, window: 0xffffff, windowPower: 0, lamp: 0xffffff, spots: 0, exposure: 0.99, reflection: 0.06, outside: 0xd1a46b, fence: 0x9b8c77, post: 0x806c57 },
      'alpine-court': { outdoor: true, background: 0xb2ccd6, fogNear: 43, fogFar: 84, wall: 0xffffff, floor: 0x8daba6, key: 0x325f63, paint: 0xecf6eb,
        sun: 0xf0f5f0, sunPower: 3.45, sunPosition: [-13, 16, 9], sky: 0xc8e7f0, ground: 0x718b72, ambient: 2.1, fill: 0xa6d1e5, fillPower: 0.78, window: 0xffffff, windowPower: 0, lamp: 0xffffff, spots: 0, exposure: 1.03, reflection: 0.11, outside: 0x81967d, fence: 0x94a9aa, post: 0x627c81 },
      'neon-arena': { background: 0x101f32, fogNear: 27, fogFar: 60, wall: 0x26394b, floor: 0x9ba8c7, key: 0x5d336d, paint: 0x8cedee,
        sun: 0x8ab5e2, sunPower: 1.35, sunPosition: [-8, 12, 7], sky: 0xa0bfd9, ground: 0x24273c, ambient: 1.08, fill: 0xa2dbed, fillPower: 0.95, window: 0x355973, windowPower: 0.30, lamp: 0xa4f5ef, spots: 48, exposure: 1.13, reflection: 1.05, ceiling: 0x2c3a50, beam: 0x46516c, pad: 0x243449, timber: 0x4a4862, roughness: 0.32, clearcoat: 0.38, logo: 0xc0a1df },
      'royal-arena': { background: 0x33283b, fogNear: 27, fogFar: 60, wall: 0x675372, floor: 0xc4b6c8, key: 0x66506f, paint: 0xe5c678,
        sun: 0xffdab0, sunPower: 2.25, sunPosition: [-10, 13, -6], sky: 0xe0d0e5, ground: 0x4e3944, ambient: 1.62, fill: 0xc8badc, fillPower: 0.87, window: 0xad8b92, windowPower: 0.29, lamp: 0xffdfab, spots: 38, exposure: 1.07, reflection: 1.12, ceiling: 0x594a64, beam: 0xa99065, pad: 0x3b2f4b, timber: 0xb0935f, roughness: 0.26, clearcoat: 0.56, logo: 0xe2bb68 }
    };
    function setEnvironmentStyle(id) {
      const style = environmentStyles[id]; if (!style) return false;
      const outdoor = !!style.outdoor;
      if (outdoor && !outdoorCourt) outdoorCourt = createOutdoorCourt();
      selectedEnvironmentStyle = id; indoorArchitecture.visible = !outdoor;
      if (outdoorCourt) outdoorCourt.visible = outdoor;
      for (const group of environmentDecorGroups.values()) group.visible = false;
      if (['midnight-court', 'coastal-court', 'desert-court', 'alpine-court', 'neon-arena', 'royal-arena'].includes(id)) createEnvironmentDecor(id).visible = true;
      if (outdoor) {
        const backdrop = outdoorCourt.userData;
        backdrop.sky.material.map = environmentSkyTexture(id); backdrop.sky.material.needsUpdate = true;
        backdrop.sky.name = 'environment-sky-' + id;
        backdrop.skyline.visible = id === 'street-court' || id === 'midnight-court';
        backdrop.cityMat.color.set(id === 'midnight-court' ? 0x314461 : 0x647878);
        backdrop.cityMat.emissive.set(id === 'midnight-court' ? 0x243955 : 0x000000); backdrop.cityMat.emissiveIntensity = id === 'midnight-court' ? 0.48 : 0;
        backdrop.outsideGround.material.color.set(style.outside);
        backdrop.fenceMat.color.set(style.fence || 0x718f93); backdrop.longMat.color.copy(backdrop.fenceMat.color); backdrop.postMat.color.set(style.post || 0x43585d);
      }
      scene.background.set(style.background); scene.fog.color.set(style.background); scene.fog.near = style.fogNear; scene.fog.far = style.fogFar;
      wallMat.color.set(style.wall); floorMat.map = environmentFloorTexture(id); floorMat.color.set(style.floor);
      const surfaceKey = id === 'gym' || id === 'sunset-gym' || id === 'night-gym' ? 'maple' : id === 'street-court' || id === 'midnight-court' ? 'asphalt' : 'environment-floor-' + id;
      const floorSurface = surfaceDetailMaps.get(surfaceKey);
      floorMat.bumpMap = floorSurface.bumpMap; floorMat.bumpScale = floorSurface.bumpScale; floorMat.roughnessMap = floorSurface.roughnessMap;
      floorMat.roughness = style.roughness || (outdoor ? 0.98 : 0.46); floorMat.clearcoat = style.clearcoat || (outdoor ? 0 : 0.28); floorMat.clearcoatRoughness = id === 'royal-arena' ? 0.26 : 0.32; floorMat.metalness = outdoor ? 0 : 0.015; floorMat.needsUpdate = true;
      keyMat.color.set(style.key); keyMat.opacity = outdoor ? 0.82 : 0.42; paintMat.color.set(style.paint); logoMat.color.set(style.logo || (outdoor ? 0xb0cac0 : id === 'night-gym' ? 0x8bc6c3 : 0x4d5b57));
      ceilingMat.color.set(style.ceiling || 0xa9ada7); beamMat.color.set(style.beam || 0x6a726f); padMat.color.set(style.pad || 0x3c4545); timber.color.set(style.timber || 0x92744f);
      sun.color.set(style.sun); sun.intensity = style.sunPower * 1.03; sun.position.fromArray(style.sunPosition);
      hemisphere.color.set(style.sky); hemisphere.groundColor.set(style.ground); hemisphere.intensity = Math.max(outdoor ? 0.90 : 0.92, style.ambient * 0.70);
      fill.color.set(style.fill); fill.intensity = Math.max(0.48, style.fillPower * 0.85);
      windowMat.emissive.set(style.window); windowMat.emissiveIntensity = style.windowPower;
      glowMat.color.set(style.lamp).multiplyScalar(2.2); for (const spot of ceilingLights) { spot.color.set(style.lamp); spot.intensity = Math.max(32, style.spots * 1.5); spot.visible = !outdoor; }
      renderer.toneMappingExposure = style.exposure; reflectionUniforms.surfaceReflection.value = style.reflection;
      // Wet varnish/asphalt, cloud-filtered light and air depth belong to the
      // selected environment. Each switch first restores its dry base above.
      if (id === 'street-court' || id === 'midnight-court' || id === 'coastal-court') {
        const night = id === 'midnight-court';
        scene.background.set(night ? 0x26394c : id === 'coastal-court' ? 0xb5ccce : 0xa4b7bd);
        scene.fog.color.copy(scene.background); scene.fog.near = night ? 21 : 25; scene.fog.far = night ? 64 : 70;
        floorMat.roughness = night ? 0.23 : 0.28; floorMat.clearcoat = 0.68; floorMat.clearcoatRoughness = 0.2;
        reflectionUniforms.surfaceReflection.value = night ? 0.6 : 0.46;
        sun.color.set(night ? 0xadc8df : 0xdce7e8); sun.intensity *= night ? 0.7 : 0.48;
      } else if (id === 'desert-court') {
        scene.background.set(0xcfad80); scene.fog.color.set(0xcfad80); scene.fog.near = 12; scene.fog.far = 51;
        sun.intensity *= 0.64; sun.color.set(0xffdbac); fill.color.set(0xe4c297);
      } else if (id === 'alpine-court') {
        scene.background.set(0xc0d5dc); scene.fog.color.set(0xc0d5dc); scene.fog.near = 23; scene.fog.far = 65;
        sun.intensity *= 0.62; sun.color.set(0xe0edf3); floorMat.roughness = 0.86;
      }
      weather.setEnvironment(id);
      invalidateCourtAppearance(); return true;
    }

    // Image-based specular highlights stay local to reflective surfaces: the
    // diffuse hall is lit by directional daylight and the actual ceiling lamps.
    const architectureEnvironment = ensureMetalEnvironment();
    glowMat.color.multiplyScalar(2.2);
    for (const mat of [steel, black, beamMat, floorMat]) {
      mat.envMap = architectureEnvironment; mat.envMapIntensity = mat === floorMat ? 0.24 : 0.52; mat.needsUpdate = true;
    }
    const weather = typeof window.createPotaWeather === 'function' ? window.createPotaWeather({scene, camera, renderer}) : {
      setEnvironment() { return true; }, setQuality() { return true; }, update() {}, dispose() {},
      getDiagnostics() { return {enabled:false,mode:'none',disposed:false}; }
    };
    let graphicsWidth = Math.max(1, window.innerWidth || 1), graphicsHeight = Math.max(1, window.innerHeight || 1);
    let profileShadowsEnabled = true, requestedNetShadowsEnabled = true;
    function applyGraphicsProfile(profile) {
      reflectionEnabled = profile.reflectionEnabled !== false;
      if (!reflectionEnabled) floorReflection.visible = false;
      reflectionResolution = Math.min(profile.reflectionResolution || 512, profile.maxTargetDimension || sideTargetLimit, sideTargetLimit);
      reflectionInterval = Number.isFinite(profile.reflectionInterval) ? Math.max(1, Math.min(6, Math.round(profile.reflectionInterval))) : profile.quality === 'high' || profile.quality === 'ultra' ? 1 : profile.effectiveProfile === 'balanced' ? 3 : 2;
      netShadowInterval = Number.isFinite(profile.netShadowInterval) ? Math.max(1, Math.min(4, Math.round(profile.netShadowInterval))) : 1;
      profileShadowsEnabled = profile.shadowsEnabled !== false;
      renderer.shadowMap.enabled = profileShadowsEnabled;
      netShadowUniforms.uNetShadowEnabled.value = profileShadowsEnabled && requestedNetShadowsEnabled ? 1 : 0;
      resizeFloorReflection(graphicsWidth, graphicsHeight);
      const shadowSize = Math.max(1, Math.floor(Math.min(profile.shadowResolution || 512, profile.maxTargetDimension || sideTargetLimit, sideTargetLimit)));
      if (sun.shadow.mapSize.x !== shadowSize) {
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        sun.shadow.mapSize.set(shadowSize, shadowSize); sun.shadow.needsUpdate = true;
      }
      const focused = Math.max(1, Math.floor(Math.min(profile.netShadowResolution || (profile.quality === 'ultra' ? (largeDisplay ? 3072 : 2048) : profile.quality === 'high' ? (largeDisplay ? 2048 : 1536) : profile.effectiveProfile === 'balanced' ? (largeDisplay ? 1536 : 1024) : (largeDisplay ? 2048 : 1280)), profile.maxTargetDimension || sideTargetLimit, sideTargetLimit)));
      if (focused !== netShadowSize) {
        netShadowSize = focused; netShadowUniforms.uNetShadowSize.value = focused;
        for (const map of netShadowMaps) { map.target.setSize(focused, focused); map.ready = false; }
      }
      weather.setQuality(profile.effectiveProfile);
      invalidateCourtAppearance();
    }
    let fallbackQuality = 'auto', fallbackResolutionQuality = 'auto', fallbackPreference = 'smooth', fallbackRefreshRate = 60, fallbackDegraded = false;
    let fallbackReason = 'Graphics module absent; direct renderer retained';
    const fallbackResolutionProfiles = {
      auto: {dpr:1,pixels:900000},
      low: {dpr:0.75,pixels:900000}, medium: {dpr:1.25,pixels:1800000},
      high: {dpr:2,pixels:3600000}, max: {dpr:3,pixels:6500000}
    };
    const fallbackDrawingSize = new T.Vector2();
    const fallbackMaxDimension = (() => {
      const limits = [renderer.capabilities.maxTextureSize];
      try {
        const gl = renderer.getContext();
        limits.push(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      } catch (_) { /* The renderer's texture limit remains available. */ }
      return Math.max(1,Math.floor(Math.min(...limits.filter(value=>Number.isFinite(value)&&value>0),16384)));
    })();
    const fallbackGraphics = {
      setQuality(id) {
        if (!['auto','high','ultra','balanced'].includes(id)) return false; fallbackQuality = id;
        this.resize(graphicsWidth, graphicsHeight); return true;
      },
      setResolutionQuality(id) {
        if (!Object.prototype.hasOwnProperty.call(fallbackResolutionProfiles,id)) return false;
        fallbackResolutionQuality = id; this.resize(graphicsWidth,graphicsHeight); return true;
      },
      setPerformancePreference(id) { if (!['smooth','graphics'].includes(id)) return false; fallbackPreference = id; return true; },
      setDisplayRefreshRate(hz) { if (!Number.isFinite(hz) || hz < 20 || hz > 500) return false; fallbackRefreshRate = hz; return true; },
      setDeveloperOverrides(value) {
        if (!value || !value.enabled) { fallbackQuality = fallbackResolutionQuality = 'auto'; this.resize(graphicsWidth,graphicsHeight); return true; }
        if (!['auto','high','ultra','balanced'].includes(value.quality) || !fallbackResolutionProfiles[value.resolution]) return false;
        fallbackQuality = value.quality; fallbackResolutionQuality = value.resolution; this.resize(graphicsWidth,graphicsHeight); return true;
      },
      sampleFrame() {}, resetTiming() {},
      degrade(reason) { fallbackReason = reason || 'Conservative renderer fallback'; fallbackDegraded = true; fallbackQuality = fallbackResolutionQuality = 'auto'; this.resize(graphicsWidth,graphicsHeight); return true; },
      resize(width, height) {
        const profile = fallbackResolutionProfiles[fallbackResolutionQuality];
        const ratio = Math.min(profile.dpr,Math.sqrt(profile.pixels/(width*height)),fallbackMaxDimension/width,fallbackMaxDimension/height);
        renderer.setPixelRatio(ratio); renderer.setSize(width,height,false);
        applyGraphicsProfile({quality:fallbackQuality,effectiveProfile:fallbackQuality==='auto'?'balanced':fallbackQuality,maxTargetDimension:fallbackMaxDimension,
          reflectionEnabled:!fallbackDegraded,shadowsEnabled:!fallbackDegraded,reflectionInterval:fallbackQuality==='auto'?4:undefined,
          reflectionResolution:Math.min(fallbackMaxDimension,fallbackQuality==='ultra'?(largeDisplay?2048:1536):fallbackQuality==='high'?(largeDisplay?1536:1152):fallbackQuality==='balanced'?(largeDisplay?896:640):512),
          shadowResolution:Math.min(fallbackMaxDimension,fallbackQuality==='ultra'?4096:fallbackQuality==='high'?(largeDisplay?4096:3072):fallbackQuality==='balanced'?(largeDisplay?2048:1536):1024)});
      },
      render() { renderer.render(scene,camera); },
      diagnostics() {
        renderer.getDrawingBufferSize(fallbackDrawingSize);
        return {quality:fallbackQuality,resolutionQuality:fallbackResolutionQuality,effectiveProfile:fallbackQuality==='auto'?'balanced':fallbackQuality,pipeline:'direct',hdr:false,postPasses:0,
          preference:fallbackPreference,displayRefreshRate:fallbackRefreshRate,targetFps:fallbackRefreshRate>=120?120:60,
          dpr:Math.min(fallbackDrawingSize.x/graphicsWidth,fallbackDrawingSize.y/graphicsHeight),rendererPixelRatio:renderer.getPixelRatio(),sceneResolution:[fallbackDrawingSize.x,fallbackDrawingSize.y],
          renderTargets:0,aoSamples:0,aoStrength:0,bloomStrength:0,bloomExtractSamples:0,depthTexture:false,maxTargetDimension:fallbackMaxDimension,
          colorPipeline:'direct ACES → sRGB once',antialiasing:'native device rasterizer',fallbackReason};
      },
      dispose() {}
    };
    const graphics = (() => {
      if (typeof window.createPotaGraphicsPipeline === 'function') {
        try { return window.createPotaGraphicsPipeline({renderer,scene,camera,onQualityChange:applyGraphicsProfile}); }
        catch (_) { fallbackReason = 'Graphics initialization failed; safe direct renderer retained'; fallbackDegraded = true; }
      }
      return fallbackGraphics;
    })();
    let contextLost = false, contextRestores = 0, disposed = false;
    function onContextLost(event) { if (event && event.preventDefault) event.preventDefault(); contextLost = true; }
    function onContextRestored() {
      contextLost = false; contextRestores++;
      // Three restores its GPU state before this listener. Recreate disposable
      // pass targets and resume at the controller's conservative fallback tier.
      reflectionTarget.dispose(); for (const map of netShadowMaps) map.target.dispose();
      if (graphics.degrade) graphics.degrade('context-restored');
      if (graphics.resetTiming) graphics.resetTiming();
      invalidateCourtAppearance();
    }
    if (canvas.addEventListener) {
      canvas.addEventListener('webglcontextlost', onContextLost, false);
      canvas.addEventListener('webglcontextrestored', onContextRestored, false);
    }
    const ballSpinAxis = new T.Vector3(), ballSpinRotation = new T.Quaternion();
    const sunShadowBallMatrix = new T.Matrix4(), sunShadowLightMatrix = new T.Matrix4(), sunShadowTargetMatrix = new T.Matrix4();
    let sunShadowBallVisible = null, sunShadowBallCasting = null, sunShadowUpdates = 0, worldMatrixUpdates = 0;
    function renderWorld() {
      if (disposed || contextLost) return;
      // Net depth, floor reflection and the main pass share this same snapshot.
      // Dynamic transforms remain automatic; only redundant full traversals go.
      scene.updateMatrixWorld(); worldMatrixUpdates++;
      const shadowChanged = (ball.visible && ball.castShadow && !sunShadowBallMatrix.equals(ball.matrixWorld)) || sunShadowBallVisible !== ball.visible || sunShadowBallCasting !== ball.castShadow ||
        !sunShadowLightMatrix.equals(sun.matrixWorld) || !sunShadowTargetMatrix.equals(sun.target.matrixWorld);
      if (shadowChanged) renderer.shadowMap.needsUpdate = true;
      const updateSunShadow = renderer.shadowMap.needsUpdate;
      renderNetShadows(); renderFloorReflection(); graphics.render();
      if (updateSunShadow) {
        sunShadowBallMatrix.copy(ball.matrixWorld); sunShadowBallVisible = ball.visible; sunShadowBallCasting = ball.castShadow;
        sunShadowLightMatrix.copy(sun.matrixWorld); sunShadowTargetMatrix.copy(sun.target.matrixWorld); sunShadowUpdates++;
      }
    }
    const api = {
      scene, camera, renderer, ball, trajectory, aimArrow, targetMarker,
      setGraphicsQuality(id) { return graphics.setQuality(id); },
      setPerformancePreference(id) { return graphics.setPerformancePreference ? graphics.setPerformancePreference(id) : ['smooth','graphics'].includes(id); },
      setDisplayRefreshRate(hz) { return graphics.setDisplayRefreshRate ? graphics.setDisplayRefreshRate(hz) : false; },
      setDeveloperOverrides(value) { return graphics.setDeveloperOverrides ? graphics.setDeveloperOverrides(value) : false; },
      samplePerformanceFrame(sample) { if (graphics.sampleFrame) graphics.sampleFrame(sample); },
      resetPerformanceTiming() { if (graphics.resetTiming) graphics.resetTiming(); },
      degradeGraphics(reason) { return graphics.degrade ? graphics.degrade(reason) : false; },
      getWeatherDiagnostics() { return weather.getDiagnostics(); },
      setResolutionQuality(id) { return graphics.setResolutionQuality(id); },
      getGraphicsDiagnostics() { return Object.assign(graphics.diagnostics(), {reflectionResolution:reflectionTarget.width,reflectionInterval,shadowResolution:sun.shadow.mapSize.x,netShadowResolution:netShadowSize,
        worldMatrixUpdates,sunShadowUpdates,shadowUpdateMode:'caster-changes',reflectionUpdates,reflectionEnabled,netShadowInterval,
        contextLost,contextRestores,hdrFramebufferSupported:renderer.potaHDRSupported,sideTargetLimit,
        staticGeometry:{sourceMeshes:staticBatchStats.sourceMeshes,batches:staticBatchStats.batches,sourceTriangles:staticBatchStats.sourceTriangles}}); },
      setBall(position) { ball.position.set(position.x, position.y, position.z); },
      setAimArrow: updateAimArrow,
      getNetDiagnostics,
      getNetShadowDiagnostics,
      setNetShadowsEnabled(enabled) { requestedNetShadowsEnabled = !!enabled; netShadowUniforms.uNetShadowEnabled.value = profileShadowsEnabled && requestedNetShadowsEnabled ? 1 : 0; reflectionReady = false; },
      beginNetFrame() { for (const net of nets) net.solver.beginFrame(); },
      stepNetPhysics(dt, ballState) { for (const net of nets) net.solver.step(dt, ballState); },
      setBallSkin,
      setParticleStyle,
      setNetStyle, setRimStyle, setBackboardStyle, setEnvironmentStyle,
      getCosmeticState() { return { ballSkin: selectedBallSkin, particleStyle: selectedParticleStyle,
        netStyle: selectedNetStyle, rimStyle: selectedRimStyle, backboardStyle: selectedBackboardStyle, environmentStyle: selectedEnvironmentStyle }; },
      getNetAudioState() { return netAudioStates; },
      setTrajectory(points, visible) {
        trajectory.visible = !!visible;
        const count = Math.min(72, points ? points.length : 0); dots.count = count;
        for (let i = 0; i < count; i++) {
          const p = points[i];
          dummy.position.set(p.x === undefined ? p[0] : p.x, p.y === undefined ? p[1] : p.y, p.z === undefined ? p[2] : p.z);
          dummy.scale.setScalar(0.65 + 0.35 * (1 - i / Math.max(1, count)));
          dummy.updateMatrix(); dots.setMatrixAt(i, dummy.matrix);
        }
        dots.instanceMatrix.needsUpdate = true;
      },
      animate(dt, time, state = {}) {
        const frameDt = Math.min(0.25, Math.max(0, Number.isFinite(dt) ? dt : 0));
        updateCosmeticParticles(frameDt, time, state);
        const ballState = state.ballState && state.ballState.position && state.ballState.velocity ? state.ballState : null;
        for (const net of nets) { net.solver.finishFrame(); updateNetGeometry(net); }
        if (ballState && ballState.spin) {
          ballSpinAxis.set(ballState.spin.x, ballState.spin.y, ballState.spin.z);
          const angularSpeed = ballSpinAxis.length();
          if (angularSpeed > 1e-7) {
            ballSpinAxis.multiplyScalar(1 / angularSpeed);
            ballSpinRotation.setFromAxisAngle(ballSpinAxis, angularSpeed * frameDt);
            ball.quaternion.premultiply(ballSpinRotation);
          }
        }
        ballShadow.position.set(ball.position.x, 0.021, ball.position.z);
        const h = Math.max(0, ball.position.y - 0.12);
        ballShadow.scale.setScalar(0.31 + Math.sqrt(h) * 0.42);
        ballShadow.material.opacity = 0.38 * Math.exp(-h * 2.3);
        ballShadow.visible = ball.visible && h < 2.5;
        weather.update(frameDt, time);
      },
      resize(width, height) {
        viewportHeight = Math.max(height, 1);
        camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix();
        graphicsWidth = Math.max(1, width); graphicsHeight = Math.max(1, height);
        graphics.resize(width, height);
      },
      render: renderWorld,
      dispose() {
        if (disposed) return;
        disposed = true;
        if (canvas.removeEventListener) {
          canvas.removeEventListener('webglcontextlost', onContextLost, false);
          canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
        }
        netShadowsDisposed = true;
        weather.dispose();
        graphics.dispose();
        netShadowMaps.forEach(map => map.target.dispose()); netShadowDepthMaterial.dispose();
        reflectionTarget.dispose();
        const geometries = new Set(), materials = new Set(), textures = new Set();
        scene.traverse(o => {
          if (o.geometry) geometries.add(o.geometry);
          for (const mat of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) {
            materials.add(mat); for (const key of Object.keys(mat)) if (mat[key] && mat[key].isTexture) textures.add(mat[key]);
          }
        });
        addCosmeticTexturesToDisposal(textures);
        for (const texture of courtCosmeticTextures.values()) textures.add(texture);
        if (metalEnvironment) { metalEnvironment.dispose(); metalEnvironment = null; }
        // Inactive pooled styles must be released as well as currently equipped materials.
        geometries.add(chainGeometry); geometries.add(knotGeometry); materials.add(chainMat); materials.add(glassMat);
        geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); renderer.dispose();
      }
    };
    return api;
  };
})();
