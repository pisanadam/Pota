/* POTA rendering: bounded HDR targets, soft highlights and depth contact shading.
 * Simulation never depends on this module's frame timing or resolution choices.
 */
(function (global) {
  'use strict';
  const T = global.THREE;
  global.createPotaGraphics = function createPotaGraphics(options) {
    const renderer = options.renderer, scene = options.scene, camera = options.camera;
    const coarse = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
    const desktop = global.innerWidth >= 900 && !coarse;
    const hdr = renderer.potaHDRSupported !== false && options.hdrSupported !== false && !!(renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float'));
    const device = global.navigator || {}, nativeDevice = global.PotaDeviceInfo || {};
    const nativeMemory = Number(nativeDevice.memoryGB), browserMemory = Number(device.deviceMemory);
    const knownMemory = Number.isFinite(nativeMemory)&&nativeMemory>0?nativeMemory:Number.isFinite(browserMemory)&&browserMemory>0?browserMemory:0;
    const deviceMemory = nativeDevice.lowRam===true?Math.min(knownMemory||2,2):knownMemory;
    // This budget is for render attachments only. Models/textures keep their
    // own fixed budgets. No device starts by allocating desktop Ultra targets.
    const memoryBudgetMB = deviceMemory && deviceMemory <= 1 ? 24 : deviceMemory && deviceMemory <= 2 ? 40 : deviceMemory && deviceMemory <= 4 ? 80 : deviceMemory >= 8 ? (desktop ? 256 : 160) : (desktop ? 128 : 80);
    const memoryBudgetBytes = memoryBudgetMB * 1024 * 1024;
    const weakDevice = !renderer.capabilities.isWebGL2 || (deviceMemory > 0 && deviceMemory <= 2);
    const maximumAutoTier = weakDevice ? (hdr ? 2 : 1) : 4;
    const tierNames = ['balanced', 'balanced', 'auto', 'high', 'ultra'];
    const profiles = {
      auto: { samples: 0, bloom: 0.045, bloomDivisor: 4, ao: 0.27, aoSamples: 8, reflection: desktop ? 1280 : 896 },
      high: { samples: desktop ? 2 : 0, bloom: 0.055, bloomDivisor: 4, ao: 0.34, aoSamples: 8, reflection: desktop ? 1536 : 1152 },
      ultra: { samples: desktop ? 4 : 2, bloom: 0.060, bloomDivisor: 2, ao: 0.38, aoSamples: 16, reflection: desktop ? 2048 : 1536 },
      balanced: { samples: 0, bloom: 0, bloomDivisor: 4, ao: 0, aoSamples: 0, reflection: desktop ? 896 : 640 }
    };
    const resolutionProfiles = {
      low: { dpr: 0.75, pixels: 900000 }, medium: { dpr: 1.25, pixels: 1800000 },
      high: { dpr: 2, pixels: 3600000 }, max: { dpr: 3, pixels: 6500000 }
    };
    const maxDimension = (() => {
      const limits = [renderer.capabilities.maxTextureSize];
      try {
        const gl = renderer.getContext();
        limits.push(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      } catch (_) { /* Retain the renderer's known texture limit. */ }
      return Math.max(1, Math.floor(Math.min(...limits.filter(value => Number.isFinite(value) && value > 0), 16384)));
    })();
    let quality = 'auto', resolutionQuality = 'auto', width = Math.max(1, global.innerWidth || 1), height = Math.max(1, global.innerHeight || 1);
    let dpr = 1, adaptiveLevel = maximumAutoTier - (weakDevice ? 0 : 1), disposed = false, frameCount = 0, lastFrame = 0, averageMs = 16.67, averageRenderMs = 0;
    let preference = 'smooth', developerEnabled = false, displayRefreshRate = 60, targetFps = 60;
    let autoTier = weakDevice ? 0 : 1, autoScale = weakDevice ? .75 : .9, forcedDirect = false, fallbackReason = '';
    let slowTime = 0, fastTime = 0, stableTime = 0, lastAdjustment = 0, adaptationChanges = 0, externalSampling = false;
    let auxiliaryBytes = 0, estimatedTargetBytes = 0, appliedProfileKey = '', lastPolicy = null;
    const clock = () => global.performance ? global.performance.now() : Date.now();
    let appliedWidth = 0, appliedHeight = 0, appliedDpr = 0, drawingBufferResizes = 0;
    const drawingSize = new T.Vector2();
    const savedViewport = new T.Vector4(), savedScissor = new T.Vector4();
    const supportedSamples = (() => {
      if (!hdr) return [];
      try {
        const gl = renderer.getContext();
        if (!gl.getInternalformatParameter) return [];
        const color = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) || []);
        const depth = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) || []);
        return color.filter(value => value > 0 && depth.includes(value)).sort((a,b) => a-b);
      } catch (_) { return []; }
    })();
    const resetFrameTiming = () => { lastFrame = 0; slowTime = fastTime = stableTime = 0; averageMs = 1000 / targetFps; averageRenderMs = 0; };
    const preferredTargetFps = () => preference === 'graphics' ? 60 : preference === 'balanced' ? (displayRefreshRate >= 89 ? 90 : 60) : (displayRefreshRate >= 119 ? 120 : 60);
    if (global.document) global.document.addEventListener('visibilitychange', resetFrameTiming);
    let mainTarget = null, bloomTarget = null, triangle = null, quad = null, postScene = null, postCamera = null;
    let brightMaterial = null, finalMaterial = null;
    const finalUniforms = {
      tScene: { value: null }, tBloom: { value: null }, tDepth: { value: null },
      texel: { value: new T.Vector2(1, 1) }, bloomTexel: { value: new T.Vector2(1, 1) },
      inverseProjection: { value: camera.projectionMatrixInverse }, projectionY: { value: 1 },
      bloomStrength: { value: 0 }, aoStrength: { value: 0 }, aoSamples: { value: 8 }, contrast: { value: 1.025 }
    };
    const vertexShader = 'varying vec2 vUv; void main(){ vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }';
    if (hdr) {
      mainTarget = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter,
        format: T.RGBAFormat, depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
      mainTarget.texture.name = 'pota-linear-hdr-scene'; mainTarget.texture.colorSpace = T.LinearSRGBColorSpace;
      mainTarget.depthTexture = new T.DepthTexture(1, 1, T.UnsignedIntType);
      mainTarget.depthTexture.name = 'pota-scene-contact-depth'; mainTarget.depthTexture.minFilter = mainTarget.depthTexture.magFilter = T.NearestFilter;
      bloomTarget = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter,
        format: T.RGBAFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
      bloomTarget.texture.name = 'pota-quarter-highlight-bloom'; bloomTarget.texture.colorSpace = T.LinearSRGBColorSpace;
      finalUniforms.tScene.value = mainTarget.texture; finalUniforms.tBloom.value = bloomTarget.texture; finalUniforms.tDepth.value = mainTarget.depthTexture;
      brightMaterial = new T.ShaderMaterial({ name: 'pota-selective-highlight-extract', vertexShader, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: { tScene: { value: mainTarget.texture }, texel: { value: new T.Vector2(1, 1) }, highQuality: { value: 0 } },
        fragmentShader: `
          uniform sampler2D tScene; uniform vec2 texel; uniform float highQuality; varying vec2 vUv;
          vec3 bright(vec2 uv) {
            vec3 c = texture2D(tScene, uv).rgb;
            float l = max(c.r, max(c.g,c.b));
            float knee = clamp(l - 1.15, 0.0, 1.2);
            float energy = max(l - 1.75, knee * knee * 0.20);
            return c * min(3.5, energy) / max(l, 0.0001);
          }
          void main() {
            vec3 c;
            if(highQuality>.5){
              // Stable, symmetric 13-tap extraction at half resolution keeps
              // small metallic highlights smooth without spreading a haze.
              c=bright(vUv)*.16;
              c+=bright(vUv+texel*vec2(1.,0.))*.09;c+=bright(vUv+texel*vec2(-1.,0.))*.09;
              c+=bright(vUv+texel*vec2(0.,1.))*.09;c+=bright(vUv+texel*vec2(0.,-1.))*.09;
              c+=bright(vUv+texel*vec2(1.,1.))*.075;c+=bright(vUv+texel*vec2(-1.,1.))*.075;
              c+=bright(vUv+texel*vec2(1.,-1.))*.075;c+=bright(vUv+texel*vec2(-1.,-1.))*.075;
              c+=bright(vUv+texel*vec2(2.,0.))*.045;c+=bright(vUv+texel*vec2(-2.,0.))*.045;
              c+=bright(vUv+texel*vec2(0.,2.))*.045;c+=bright(vUv+texel*vec2(0.,-2.))*.045;
            }else{
              c=bright(vUv)*.28;
              c+=bright(vUv+texel*vec2(-1.5,-1.5))*.18;c+=bright(vUv+texel*vec2(1.5,-1.5))*.18;
              c+=bright(vUv+texel*vec2(-1.5,1.5))*.18;c+=bright(vUv+texel*vec2(1.5,1.5))*.18;
            }
            gl_FragColor=vec4(c,1.0);
          }` });
      finalMaterial = new T.ShaderMaterial({ name: 'pota-fxaa-depth-contact-final', vertexShader, depthTest: false, depthWrite: false,
        toneMapped: true, dithering: true, extensions: { derivatives: true }, uniforms: finalUniforms,
        fragmentShader: `
          #include <common>
          #include <dithering_pars_fragment>
          uniform sampler2D tScene, tBloom, tDepth;
          uniform vec2 texel, bloomTexel;
          uniform mat4 inverseProjection;
          uniform float projectionY, bloomStrength, aoStrength, aoSamples, contrast;
          varying vec2 vUv;
          float potaLuma(vec3 c){return dot(c,vec3(.299,.587,.114));}
          vec3 antialias(vec2 uv) {
            vec3 c=texture2D(tScene,uv).rgb;
            vec3 nw=texture2D(tScene,uv+texel*vec2(-1.,-1.)).rgb, ne=texture2D(tScene,uv+texel*vec2(1.,-1.)).rgb;
            vec3 sw=texture2D(tScene,uv+texel*vec2(-1.,1.)).rgb, se=texture2D(tScene,uv+texel*vec2(1.,1.)).rgb;
            float m=potaLuma(c), a=potaLuma(nw), b=potaLuma(ne), d=potaLuma(sw), e=potaLuma(se);
            float lo=min(m,min(min(a,b),min(d,e))), hi=max(m,max(max(a,b),max(d,e)));
            if(hi-lo<max(.035,hi*.10))return c;
            vec2 direction=vec2(-((a+b)-(d+e)),(a+d)-(b+e));
            float reduce=max((a+b+d+e)*.03125,.0078125);
            direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),vec2(-6.),vec2(6.))*texel;
            vec3 first=.5*(texture2D(tScene,uv+direction*(-.166667)).rgb+texture2D(tScene,uv+direction*.166667).rgb);
            vec3 second=first*.5+.25*(texture2D(tScene,uv-direction*.5).rgb+texture2D(tScene,uv+direction*.5).rgb);
            float l=potaLuma(second);return l<lo||l>hi?first:second;
          }
          vec3 viewPosition(vec2 uv,float depth){
            vec4 p=inverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;
          }
          float contactOcclusion(vec3 center,vec3 normal,vec2 offset){
            vec2 uv=clamp(vUv+offset,texel,vec2(1.)-texel);
            vec3 delta=viewPosition(uv,texture2D(tDepth,uv).x)-center;
            float distance=length(delta);
            float falloff=1.-smoothstep(.035,.21,distance);
            return max(0.,dot(normal,delta/max(distance,.001))-.06)*falloff;
          }
          void main(){
            vec3 color=antialias(vUv);
            float depth=texture2D(tDepth,vUv).x;
            vec3 center=viewPosition(vUv,depth);
            vec3 normal=cross(dFdx(center),dFdy(center));
            normal*=inversesqrt(max(dot(normal,normal),.00000001));if(normal.z<0.)normal=-normal;
            if(aoStrength>0.001&&depth<.99999){
              float radius=clamp(.14*projectionY/max(-center.z,.1)*.5/texel.y,1.5,16.);
              vec2 r=texel*radius;
              float ao=0.;
              if(aoSamples>12.){
                // Opposite pairs over four radii give a fixed, balanced disk.
                // No temporal random rotation: fine cords stay stable at rest.
                ao+=contactOcclusion(center,normal,r*vec2(.25,0.));ao+=contactOcclusion(center,normal,r*vec2(-.25,0.));
                ao+=contactOcclusion(center,normal,r*vec2(0.,.40));ao+=contactOcclusion(center,normal,r*vec2(0.,-.40));
                ao+=contactOcclusion(center,normal,r*vec2(.389,.389));ao+=contactOcclusion(center,normal,r*vec2(-.389,-.389));
                ao+=contactOcclusion(center,normal,r*vec2(-.495,.495));ao+=contactOcclusion(center,normal,r*vec2(.495,-.495));
                ao+=contactOcclusion(center,normal,r*vec2(.739,.306));ao+=contactOcclusion(center,normal,r*vec2(-.739,-.306));
                ao+=contactOcclusion(center,normal,r*vec2(-.325,.785));ao+=contactOcclusion(center,normal,r*vec2(.325,-.785));
                ao+=contactOcclusion(center,normal,r*vec2(.344,.831));ao+=contactOcclusion(center,normal,r*vec2(-.344,-.831));
                ao+=contactOcclusion(center,normal,r*vec2(-.924,.383));ao+=contactOcclusion(center,normal,r*vec2(.924,-.383));
              }else{
                ao=contactOcclusion(center,normal,r*vec2(.35,.11));
                ao+=contactOcclusion(center,normal,r*vec2(-.17,.48));
                ao+=contactOcclusion(center,normal,r*vec2(-.60,-.24));
                ao+=contactOcclusion(center,normal,r*vec2(.31,-.63));
                ao+=contactOcclusion(center,normal,r*vec2(.71,.36));
                ao+=contactOcclusion(center,normal,r*vec2(-.60,.65));
                ao+=contactOcclusion(center,normal,r*vec2(-.41,-.84));
                ao+=contactOcclusion(center,normal,r*vec2(.93,-.32));
              }
              color*=1.-clamp(ao/aoSamples*aoStrength,0.,.20);
            }
            if(bloomStrength>.001){
              vec2 d=bloomTexel*1.6; vec3 b=texture2D(tBloom,vUv).rgb*.28;
              b+=texture2D(tBloom,vUv+vec2(d.x,0.)).rgb*.12;b+=texture2D(tBloom,vUv-vec2(d.x,0.)).rgb*.12;
              b+=texture2D(tBloom,vUv+vec2(0.,d.y)).rgb*.12;b+=texture2D(tBloom,vUv-vec2(0.,d.y)).rgb*.12;
              b+=texture2D(tBloom,vUv+d).rgb*.06;b+=texture2D(tBloom,vUv-d).rgb*.06;
              b+=texture2D(tBloom,vUv+vec2(d.x,-d.y)).rgb*.06;b+=texture2D(tBloom,vUv+vec2(-d.x,d.y)).rgb*.06;
              color+=b*bloomStrength;
            }
            // Gentle linear contrast, then exactly one display transform.
            color=max(vec3(0.),(color-vec3(.18))*contrast+vec3(.18));
            gl_FragColor=vec4(color,1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <dithering_fragment>
          }` });
      triangle = new T.BufferGeometry(); triangle.setAttribute('position', new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
      quad = new T.Mesh(triangle, finalMaterial); quad.frustumCulled = false;
      postScene = new T.Scene(); postScene.add(quad); postCamera = new T.Camera();
    }
    function activeProfile() { return profiles[quality === 'auto' ? tierNames[autoTier] : quality]; }
    function usePost() { return hdr && !forcedDirect && !(quality === 'auto' && autoTier === 0); }
    function policy() {
      const p = activeProfile(), ultra = p === profiles.ultra, high = p === profiles.high;
      const lowest = quality === 'auto' && autoTier === 0;
      let shadow = ultra ? 4096 : high ? (desktop ? 4096 : 3072) : p === profiles.balanced ? 1536 : (desktop ? 3072 : 2560);
      let net = ultra ? (desktop ? 3072 : 2048) : high ? (desktop ? 2048 : 1536) : p === profiles.balanced ? 1024 : 1280;
      let reflection = p.reflection;
      if (lowest) { shadow = 512; net = 384; reflection = 384; }
      const requested = shadow * shadow * 8 + net * net * 16 + reflection * reflection * (hdr ? 12 : 8);
      const scale = Math.min(1, Math.sqrt(memoryBudgetBytes * .55 / requested));
      const bounded = n => Math.max(1, Math.min(maxDimension, Math.floor(n * scale / 64) * 64 || 1));
      shadow = bounded(shadow); net = bounded(net); reflection = bounded(reflection);
      auxiliaryBytes = shadow * shadow * 8 + net * net * 16 + reflection * reflection * (hdr ? 12 : 8);
      let samples = usePost() ? supportedSamples.reduce((selected, count) => count <= p.samples ? count : selected, 0) : 0;
      // Canvas color + HDR resolved color/depth + matching multisample
      // attachments + the highlight buffer. Real GL dimensions are a second cap.
      const bytesPerPixel = usePost() ? 4 + 12 * (samples + 1) + 8 / (p.bloomDivisor * p.bloomDivisor) : 8;
      const pixels = Math.max(1, Math.floor((memoryBudgetBytes - auxiliaryBytes) / bytesPerPixel));
      return {p, shadow, net, reflection, samples, pixels, bytesPerPixel, lowest, post: usePost()};
    }
    function effectivePixelRatio(budget) {
      const native = Math.max(.5, Math.min(4, Number(global.devicePixelRatio) || 1));
      const selected = resolutionProfiles[resolutionQuality];
      const maximumPixels = selected ? selected.pixels : weakDevice ? 1200000 : desktop ? 4800000 : 3600000;
      const pixelScale = selected ? selected.dpr : Math.min(native, desktop ? 1.8 : 1.6) * autoScale;
      // Even developer overrides obey memory and actual framebuffer limits.
      return Math.min(pixelScale, Math.sqrt(Math.min(maximumPixels, budget.pixels) / (width * height)), maxDimension / width, maxDimension / height);
    }
    function applySize() {
      const budget = policy(), profile = budget.p; lastPolicy = budget; dpr = effectivePixelRatio(budget);
      if (width !== appliedWidth || height !== appliedHeight || dpr !== appliedDpr) {
        if (renderer.setDrawingBufferSize) renderer.setDrawingBufferSize(width,height,dpr);
        else { renderer.setPixelRatio(dpr); renderer.setSize(width,height,false); }
        appliedWidth=width;appliedHeight=height;appliedDpr=dpr;drawingBufferResizes++;
      }
      renderer.getDrawingBufferSize(drawingSize); const w=Math.max(1,drawingSize.x),h=Math.max(1,drawingSize.y);
      estimatedTargetBytes = auxiliaryBytes + w * h * budget.bytesPerPixel;
      if(hdr){
        if(mainTarget.samples!==budget.samples){mainTarget.dispose();mainTarget.samples=budget.samples;}
        // Going to the direct tier releases the large HDR attachments instead
        // of retaining them behind a cheap-looking fallback.
        mainTarget.setSize(budget.post?w:1,budget.post?h:1);
        const depthW=budget.post?w:1,depthH=budget.post?h:1;
        if(mainTarget.depthTexture.image.width!==depthW||mainTarget.depthTexture.image.height!==depthH){
          mainTarget.depthTexture.image.width=depthW;mainTarget.depthTexture.image.height=depthH;mainTarget.depthTexture.needsUpdate=true;
        }
        bloomTarget.setSize(budget.post?Math.max(1,Math.ceil(w/profile.bloomDivisor)):1,budget.post?Math.max(1,Math.ceil(h/profile.bloomDivisor)):1);
        finalUniforms.texel.value.set(1/w,1/h);finalUniforms.bloomTexel.value.set(1/bloomTarget.width,1/bloomTarget.height);
        brightMaterial.uniforms.texel.value.copy(finalUniforms.texel.value);
        brightMaterial.uniforms.highQuality.value=profile===profiles.ultra?1:0;
        finalUniforms.bloomStrength.value=profile.bloom;finalUniforms.aoStrength.value=profile.ao;finalUniforms.aoSamples.value=profile.aoSamples;
      }
      const effectiveProfile=quality==='auto'?tierNames[autoTier]:quality;
      const callbackProfile={quality,effectiveProfile,dpr,maxTargetDimension:maxDimension,
        reflectionResolution:budget.reflection,shadowResolution:budget.shadow,netShadowResolution:budget.net,
        reflectionInterval:Math.min(6,(budget.lowest?6:effectiveProfile==='ultra'?1:effectiveProfile==='high'?2:effectiveProfile==='balanced'?4:3)*(targetFps>=90?2:1)),
        netShadowInterval:Math.min(4,(budget.lowest?4:effectiveProfile==='ultra'?1:2)*(targetFps>=90?2:1)),shadowsEnabled:!budget.lowest,reflectionEnabled:!budget.lowest,
        targetFps,preference,automatic:quality==='auto'};
      // Resizing the screen must not invalidate every shadow/reflection map on
      // every frame. Only a changed policy is sent back to the scene.
      const key=[quality,effectiveProfile,budget.reflection,budget.shadow,budget.net,callbackProfile.reflectionInterval,callbackProfile.netShadowInterval,callbackProfile.shadowsEnabled,targetFps,preference,width,height].join(':');
      if(key!==appliedProfileKey){appliedProfileKey=key;if(options.onQualityChange)options.onQualityChange(callbackProfile);}
    }
    function changeAutomatic(down, severe) {
      const previousTier=autoTier,previousScale=autoScale;
      if(down){
        if(resolutionQuality==='auto')autoScale=Math.max(.4,autoScale*(severe?.76:.88));
        if(quality==='auto'&&autoTier>0&&(severe||autoScale<=.66||resolutionQuality!=='auto')){autoTier--;if(resolutionQuality==='auto')autoScale=Math.min(.9,autoScale+.08);}
      }else{
        if(quality==='auto'&&autoTier<(forcedDirect?1:maximumAutoTier)&&(preference==='graphics'||autoScale>=1||resolutionQuality!=='auto'))autoTier++;
        else if(resolutionQuality==='auto'&&autoScale<1.3)autoScale=Math.min(1.3,autoScale+.08);
        else return;
      }
      if(previousTier===autoTier&&previousScale===autoScale)return;
      adaptiveLevel=maximumAutoTier-autoTier;adaptationChanges++;applySize();
    }
    function observe(now, frameMs, renderMs, visible) {
      if(disposed||visible===false||(global.document&&global.document.hidden)){resetFrameTiming();return;}
      if(!Number.isFinite(now)||!Number.isFinite(frameMs)||frameMs<2||frameMs>1000){resetFrameTiming();return;}
      const budget=1000/targetFps, elapsed=Math.min(frameMs,100);
      averageMs=averageMs*.94+Math.min(frameMs,500)*.06;
      if(Number.isFinite(renderMs)&&renderMs>=0)averageRenderMs=averageRenderMs?averageRenderMs*.9+renderMs*.1:renderMs;
      stableTime+=elapsed;
      if(stableTime<1200||quality!=='auto'&&resolutionQuality!=='auto')return;
      const slow=averageMs>budget*1.17||averageRenderMs>budget*.93;
      const severe=averageMs>budget*1.8||averageRenderMs>budget*1.5;
      slowTime=slow?slowTime+elapsed:Math.max(0,slowTime-elapsed*2);
      // A vsynced frame cannot be faster than the display. Cost and the
      // absence of missed slots establish headroom without guessing refresh Hz.
      const headroom=averageMs<=budget*1.08&&averageRenderMs<budget*.67;
      fastTime=headroom?fastTime+elapsed:0;
      if(slowTime>=(severe?700:1600)&&now-lastAdjustment>1200){changeAutomatic(true,severe);slowTime=fastTime=0;lastAdjustment=now;}
      else if(fastTime>=8000&&now-lastAdjustment>8000){changeAutomatic(false,false);slowTime=fastTime=0;lastAdjustment=now;}
    }
    function finishRender(started){const now=clock();if(!externalSampling&&lastFrame)observe(now,now-lastFrame,now-started,true);lastFrame=now;}
    const api = {
      setQuality(id){if(disposed||!Object.prototype.hasOwnProperty.call(profiles,id))return false;developerEnabled=true;quality=id;resetFrameTiming();applySize();return true;},
      setResolutionQuality(id){if(disposed||id!=='auto'&&!Object.prototype.hasOwnProperty.call(resolutionProfiles,id))return false;developerEnabled=true;resolutionQuality=id;resetFrameTiming();applySize();return true;},
      setPerformancePreference(id){
        if(disposed||!['smooth','balanced','graphics'].includes(id))return false;
        if(id===preference)return true;
        preference=id;targetFps=preferredTargetFps();
        // Choosing visual quality should be visible immediately. Subsequent
        // measured frame cost may still lower either automatic component.
        // Manual developer choices, recovery and hardware budgets remain caps.
        const requestedTier=weakDevice?(id==='graphics'?2:id==='balanced'?1:0):(id==='graphics'?Math.max(autoTier,3):id==='balanced'?2:1);
        const requestedScale=weakDevice?(id==='graphics'?.9:id==='balanced'?.82:.75):(id==='graphics'?1.15:id==='balanced'?1:.9);
        if(quality==='auto')autoTier=Math.min(requestedTier,forcedDirect?1:maximumAutoTier);
        if(resolutionQuality==='auto')autoScale=forcedDirect?Math.min(requestedScale,.65):requestedScale;
        adaptiveLevel=maximumAutoTier-autoTier;resetFrameTiming();applySize();return true;
      },
      setDisplayRefreshRate(hz){if(disposed||!Number.isFinite(hz)||hz<24||hz>1000)return false;displayRefreshRate=hz;const next=preferredTargetFps();if(next!==targetFps){targetFps=next;resetFrameTiming();applySize();}return true;},
      setDeveloperOverrides(value){
        if(disposed||!value||typeof value.enabled!=='boolean')return false;
        const q=value.quality===undefined?'auto':value.quality,r=value.resolution===undefined?'auto':value.resolution;
        if(!Object.prototype.hasOwnProperty.call(profiles,q)||r!=='auto'&&!Object.prototype.hasOwnProperty.call(resolutionProfiles,r))return false;
        developerEnabled=value.enabled;quality=value.enabled?q:'auto';resolutionQuality=value.enabled?r:'auto';resetFrameTiming();applySize();return true;
      },
      sampleFrame(sample){if(!sample)return;externalSampling=true;observe(sample.now===undefined?clock():sample.now,sample.frameMs,sample.renderMs,sample.visible);},
      resetTiming:resetFrameTiming,
      degrade(reason){if(disposed)return false;forcedDirect=true;fallbackReason=String(reason||'Graphics recovery');autoTier=0;autoScale=Math.min(autoScale,.65);quality='auto';resolutionQuality='auto';resetFrameTiming();applySize();return true;},
      resize(w,h){if(disposed||!Number.isFinite(w)||!Number.isFinite(h))return false;width=Math.max(1,Math.floor(w));height=Math.max(1,Math.floor(h));applySize();return true;},
      render(){
        if(disposed)return;frameCount++;const started=clock();
        if(!usePost()){try{renderer.render(scene,camera);}finally{finishRender(started);}return;}
        finalUniforms.projectionY.value=camera.projectionMatrix.elements[5];
        const previousTarget=renderer.getRenderTarget(),previousScissorTest=renderer.getScissorTest();
        renderer.getViewport(savedViewport);renderer.getScissor(savedScissor);renderer.setScissorTest(false);
        try {
          renderer.setRenderTarget(mainTarget);renderer.render(scene,camera);
          if(activeProfile().bloom>0){quad.material=brightMaterial;renderer.setRenderTarget(bloomTarget);renderer.render(postScene,postCamera);}
          quad.material=finalMaterial;renderer.setRenderTarget(previousTarget);renderer.render(postScene,postCamera);
        } finally {
          renderer.setRenderTarget(previousTarget);renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(previousScissorTest);finishRender(started);
        }
      },
      diagnostics(){const p=activeProfile(),post=usePost();renderer.getDrawingBufferSize(drawingSize);const b=lastPolicy||policy();return{quality,resolutionQuality,effectiveProfile:quality==='auto'?tierNames[autoTier]:quality,
        preference,performancePreference:preference,automatic:quality==='auto'&&resolutionQuality==='auto',developerOverrides:{enabled:developerEnabled,quality,resolution:resolutionQuality},
        displayRefreshRate,targetFps,automaticTier:autoTier,automaticScale:Math.round(autoScale*1000)/1000,
        pipeline:post?'linear-hdr-fxaa-contact-bloom':'direct',hdr:post,hdrSupported:hdr,postPasses:post?(p.bloom>0?2:1):0,
        dpr:Math.min(drawingSize.x/width,drawingSize.y/height),rendererPixelRatio:dpr,sceneResolution:[drawingSize.x,drawingSize.y],bloomResolution:post?[bloomTarget.width,bloomTarget.height]:[0,0],
        bloomStrength:post?p.bloom:0,bloomExtractSamples:post&&p.bloom>0?(p===profiles.ultra?13:5):0,aoSamples:post?p.aoSamples:0,aoStrength:post?p.ao:0,
        msaaSamples:post?mainTarget.samples:(renderer.getContext().getContextAttributes()||{}).antialias?1:0,
        antialiasing:post?(mainTarget.samples?'MSAA + FXAA':'FXAA'):'native canvas',depthTexture:post,
        supportedHdrSamples:supportedSamples.slice(),maxTargetDimension:maxDimension,
        memoryBudgetMB,estimatedTargetBytes:Math.round(estimatedTargetBytes),auxiliaryTargetBytes:Math.round(auxiliaryBytes),maxRenderPixels:b.pixels,resolutionPixelBudget:Math.min(b.pixels,resolutionProfiles[resolutionQuality]?resolutionProfiles[resolutionQuality].pixels:weakDevice?1200000:desktop?4800000:3600000),
        adaptiveLevel,estimatedFrameMs:Math.round(averageMs*100)/100,estimatedRenderMs:Math.round(averageRenderMs*100)/100,adaptationChanges,renderedFrames:frameCount,renderTargets:post?2:0,
        drawingBufferResizes,colorPipeline:post?'linear HDR → ACES → sRGB once':'direct ACES → sRGB once',fallbackReason:fallbackReason||(!hdr?'WebGL2 HDR unavailable; direct renderer':null),disposed};},
      dispose(){if(disposed)return;disposed=true;if(global.document)global.document.removeEventListener('visibilitychange',resetFrameTiming);if(mainTarget){mainTarget.dispose();mainTarget.depthTexture.dispose();bloomTarget.dispose();brightMaterial.dispose();finalMaterial.dispose();triangle.dispose();}}
    };
    return api;
  };
  global.createPotaGraphicsPipeline = global.createPotaGraphics;
})(typeof window!=='undefined'?window:globalThis);
