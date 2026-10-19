/* POTA — recorded court transients with physically positioned, velocity-dependent acoustics. */
(function () {
'use strict';
const TAU = Math.PI * 2;
const SPEED_OF_SOUND = 343;
const TYPES = new Set(['floor', 'board', 'rim', 'frame', 'wall', 'ceiling']);
const OUTDOOR_ENVIRONMENTS = new Set(['street-court', 'midnight-court', 'coastal-court', 'desert-court', 'alpine-court']);
const ENVIRONMENTS = new Set(['gym', 'sunset-gym', 'night-gym', 'neon-arena', 'royal-arena', ...OUTDOOR_ENVIRONMENTS]);
const PROFILES = {
 floor: {duration: .38, ball: .55, skin: .18, resonance: .22, modes: [[89,.12,1],[174,.095,.63],[292,.07,.42],[451,.045,.23],[689,.027,.11]]},
 board: {duration: .57, ball: .43, skin: .24, resonance: .26, modes: [[218,.14,.45],[571,.19,.8],[949,.16,.52],[1463,.11,.36],[2251,.065,.24],[3299,.035,.1]]},
 rim: {duration: .62, ball: .48, skin: .34, resonance: .22, modes: [[417,.12,.75],[663,.16,1],[997,.105,.62],[1491,.08,.47],[2227,.052,.3],[3163,.037,.2],[4271,.024,.12]]},
 frame: {duration: .38, ball: .45, skin: .36, resonance: .2, modes: [[731,.14,.53],[1183,.12,1],[1919,.085,.66],[2861,.059,.48],[3911,.035,.31],[5347,.018,.15]]},
 wall: {duration: .33, ball: .54, skin: .13, resonance: .14, modes: [[73,.09,1],[129,.068,.54],[251,.045,.28],[493,.022,.13]]},
 ceiling: {duration: .36, ball: .48, skin: .1, resonance: .16, modes: [[62,.1,.8],[148,.082,.6],[337,.047,.31],[719,.025,.15]]}
};
function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function vector(value, fallback) {
 if (!value) return {...fallback};
 return {x: finite(value.x === undefined ? value[0] : value.x, fallback.x), y: finite(value.y === undefined ? value[1] : value.y, fallback.y), z: finite(value.z === undefined ? value[2] : value.z, fallback.z)};
}
function unit(v, fallback) { const length = Math.hypot(v.x,v.y,v.z); return length > .00001 ? {x:v.x/length,y:v.y/length,z:v.z/length} : {...fallback}; }
function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z); }
function randomGenerator(seed) { let state = seed >>> 0; return () => {state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296;}; }

window.createCourtAudio = function createCourtAudio() {
 let context = null, master = null, compressor = null, room = null, roomGain = null;
 let environment = 'gym', netStyle = 'nylon';
 let enabled = true, disposed = false, voiceSerial = 0, createdVoices = 0, rejectedImpacts = 0;
 const netStates = new Map();
 let netTextureStarts = 0, netKnotSounds = 0, chainPasses = 0, chainRattles = 0, sampledChainPasses = 0, sampledChainRattles = 0, sampledImpacts = 0, netPasses = 0, sampledNetPasses = 0, rejectedNetPasses = 0;
 const sampleBuffers = new Map(), sampleFailures = new Set(), playedPasses = new Set(), lastNetPasses = new Map();
 const impactCounts = {floor:0,board:0,rim:0,frame:0,wall:0,ceiling:0};
 const listenerPosition = {x:0,y:1.7,z:-7.35};
 const listenerForward = unit({x:0,y:1.02,z:-5},{x:0,y:0,z:-1});
 const listenerUp = {x:0,y:1,z:0};
 const forwardInput = {...listenerForward}, upInput = {...listenerUp};
 let listenerDirty = 7;
 const voices = new Set(), buffers = new Map(), lastContacts = new Map();
 const MAX_VOICES = 18;

 function setParam(param,value,time) {
  if (!param) return;
  if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value,time);
  else param.value = value;
 }
 function positionPanner(panner,position,time) {
  if (panner.positionX) {setParam(panner.positionX,position.x,time);setParam(panner.positionY,position.y,time);setParam(panner.positionZ,position.z,time);}
  else if (typeof panner.setPosition === 'function') panner.setPosition(position.x,position.y,position.z);
 }
 function applyListener(force=false) {
  if (force) listenerDirty=7;
  if (!listenerDirty || !context || !context.listener) return;
  const listener = context.listener, now = context.currentTime;
  if (listener.positionX) {
   if (listenerDirty&1) {setParam(listener.positionX,listenerPosition.x,now);setParam(listener.positionY,listenerPosition.y,now);setParam(listener.positionZ,listenerPosition.z,now);}
   if (listenerDirty&2) {setParam(listener.forwardX,listenerForward.x,now);setParam(listener.forwardY,listenerForward.y,now);setParam(listener.forwardZ,listenerForward.z,now);}
   if (listenerDirty&4) {setParam(listener.upX,listenerUp.x,now);setParam(listener.upY,listenerUp.y,now);setParam(listener.upZ,listenerUp.z,now);}
  } else {
   if ((listenerDirty&1) && typeof listener.setPosition === 'function') listener.setPosition(listenerPosition.x,listenerPosition.y,listenerPosition.z);
   if ((listenerDirty&6) && typeof listener.setOrientation === 'function') listener.setOrientation(listenerForward.x,listenerForward.y,listenerForward.z,listenerUp.x,listenerUp.y,listenerUp.z);
  }
  listenerDirty=0;
 }
 function makeRoomImpulse() {
  const seconds = 1.7, sampleRate = context.sampleRate, length = Math.ceil(sampleRate*seconds);
  const buffer = context.createBuffer(2,length,sampleRate);
  for (let channel = 0; channel < 2; channel++) {
   const samples = buffer.getChannelData(channel), random = randomGenerator(0x97e441+channel*8723);
   let low = 0, previous = 0;
   for (let i = 0; i < length; i++) {
    const t = i/sampleRate;
    // Diffusion follows the first room reflections; high frequencies die first.
    const cutoff = 6300*Math.exp(-t*1.15)+700;
    const coefficient = 1-Math.exp(-TAU*cutoff/sampleRate);
    low += coefficient*((random()*2-1)-low);
    const envelope = t < .026 ? 0 : Math.min(1,(t-.026)/.065)*Math.exp(-4.25*t);
    samples[i] = (low-previous*.2)*envelope*.13;
    previous = low;
   }
   // The short, unequal taps keep the space recognisable as an indoor court.
   for (const [delay,gain] of [[.033,.22],[.052,.17],[.078,.12],[.111,.085],[.158,.055]]) {
    const offset = Math.round((delay+channel*.0031)*sampleRate);
    for (let i = 0; i < Math.round(sampleRate*.0035); i++) {
     if (offset+i < length) samples[offset+i] += (random()*2-1)*gain*Math.exp(-i/(sampleRate*.0009));
    }
   }
  }
  return buffer;
 }
 function initialize() {
  if (disposed || context) return !!context;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return false;
  try {
   context = new Context({latencyHint:'interactive'});
   master = context.createGain();master.gain.value = enabled ? .85 : 0;
   compressor = context.createDynamicsCompressor();
   compressor.threshold.value = -10;compressor.knee.value = 7;compressor.ratio.value = 4;
   compressor.attack.value = .002;compressor.release.value = .13;
   master.connect(compressor);compressor.connect(context.destination);
   room = context.createConvolver();room.normalize = true;room.buffer = makeRoomImpulse();
   roomGain = context.createGain();roomGain.gain.value = OUTDOOR_ENVIRONMENTS.has(environment)?.015:.13;
   room.connect(roomGain);roomGain.connect(master);
   applyListener(true);
   // PCM WAV decoding is synchronous: the first finger gesture has the same
   // recorded sounds as later shots, without a fetch/decode race.
   primeRecordedSamples();
   return true;
  } catch (_) {
   try {if (context && typeof context.close === 'function') context.close().catch(()=>{});} catch (_) {}
   context = null;master = null;compressor = null;room = null;roomGain = null;
   return false;
  }
 }
 function unlock() {
  if (disposed || !enabled || !initialize()) return Promise.resolve(false);
  try {
   if (context.state === 'running') return Promise.resolve(true);
   return Promise.resolve(context.resume()).then(()=>context && context.state === 'running',()=>false);
  } catch (_) { return Promise.resolve(false); }
 }
 function setEnabled(value) {
  enabled = !!value;
  if (!enabled) {
   clearNetStates();
   // Stop delayed transients too, so enabling sound later cannot resume a
   // chain rattle or impact queued before the mute gesture.
   for(const voice of Array.from(voices))removeVoice(voice,true);
   lastContacts.clear();
  }
  if (!context || !master) return;
  try {
   const now = context.currentTime;
   master.gain.cancelScheduledValues(now);master.gain.setTargetAtTime(enabled ? .85 : 0,now,.015);
  } catch (_) {}
 }
 function setEnvironment(id) {
  if(!ENVIRONMENTS.has(id))return false;
  environment=id;
  if(context&&roomGain)try {
   const now=context.currentTime;roomGain.gain.cancelScheduledValues(now);
   roomGain.gain.setTargetAtTime(OUTDOOR_ENVIRONMENTS.has(environment)?.015:.13,now,.06);
  }catch(_){}
  return true;
 }
 function setNetStyle(id) {
  if(!['nylon','black-net','chain','gold-chain'].includes(id))return false;
  if(netStyle!==id){clearNetStates();netStyle=id;}
  return true;
 }
 function isChain(material) { return material==='chain'||material==='gold-chain'; }
 function chainMaterial(material) { return material==='gold-chain'||(material==='chain'&&netStyle==='gold-chain')?'gold-chain':'chain'; }
 function updateListenerVector(target,value,input) {
  let x=value?finite(value.x===undefined?value[0]:value.x,target.x):target.x;
  let y=value?finite(value.y===undefined?value[1]:value.y,target.y):target.y;
  let z=value?finite(value.z===undefined?value[2]:value.z,target.z):target.z;
  if (input) {
   // Camera directions often repeat while a shot flies. Cache the input too,
   // so a repeated non-unit direction needs no normalization or allocation.
   if (x===input.x && y===input.y && z===input.z) return false;
   input.x=x;input.y=y;input.z=z;
   const length=Math.hypot(x,y,z);
   if (length<=.00001) return false;
   x/=length;y/=length;z/=length;
  }
  if (x===target.x && y===target.y && z===target.z) return false;
  target.x=x;target.y=y;target.z=z;
  return true;
 }
 function updateListener(position,forward,up) {
  if(updateListenerVector(listenerPosition,position))listenerDirty|=1;
  if(updateListenerVector(listenerForward,forward,forwardInput))listenerDirty|=2;
  if(updateListenerVector(listenerUp,up,upInput))listenerDirty|=4;
  try {applyListener();} catch (_) {}
 }

 function recordedValues(kind) {
  const bank=window.PotaAudioSamples||{};
  const value=bank[kind];
  const direct=Array.isArray(value)?value:(typeof value==='string'?[value]:[]);
  if(direct.length)return direct.map((data,index)=>({key:kind+':'+index,data}));
  // The numbered form keeps standalone payloads easy to audit against credits.
  const prefixes=kind==='floor'?['bounce','floor']:kind==='swish'?['swish','net']:kind==='board'?['board','backboard']:[kind];
  const result=[];
  for(const prefix of prefixes)for(let index=1;index<=8;index++) {
   const key=prefix+index;if(typeof bank[key]==='string')result.push({key,data:bank[key]});
  }
  return result;
 }
 function decodeRecorded(entry) {
  if(sampleBuffers.has(entry.key))return sampleBuffers.get(entry.key);
  if(sampleFailures.has(entry.key))return null;
  try {
   const encoded=entry.data.replace(/^data:audio\/[^;,]+;base64,/,''),binary=window.atob(encoded);
   if(binary.length<44||binary.length>8000000)throw new Error('Invalid audio size');
   const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const view=new DataView(bytes.buffer),tag=offset=>String.fromCharCode(...bytes.subarray(offset,offset+4));
   if(tag(0)!=='RIFF'||tag(8)!=='WAVE')throw new Error('Expected PCM WAV');
   let format=0,channels=0,sampleRate=0,bits=0,blockAlign=0,dataOffset=-1,dataLength=0;
   for(let offset=12;offset+8<=bytes.length;) {
    const size=view.getUint32(offset+4,true),start=offset+8;
    if(start+size>bytes.length)break;
    if(tag(offset)==='fmt '&&size>=16) {
     format=view.getUint16(start,true);channels=view.getUint16(start+2,true);sampleRate=view.getUint32(start+4,true);
     blockAlign=view.getUint16(start+12,true);bits=view.getUint16(start+14,true);
    }else if(tag(offset)==='data'){dataOffset=start;dataLength=size;}
    offset=start+size+(size%2);
   }
   if(dataOffset<0||![1,3].includes(format)||channels<1||channels>2||sampleRate<8000||sampleRate>96000||!blockAlign||![8,16,24,32].includes(bits))throw new Error('Unsupported WAV');
   const count=Math.floor(dataLength/blockAlign),buffer=context.createBuffer(1,count,sampleRate),data=buffer.getChannelData(0),width=bits/8;
   let peak=0,mean=0;
   for(let i=0;i<count;i++) {
    let sum=0;
    for(let channel=0;channel<channels;channel++) {
     const offset=dataOffset+i*blockAlign+channel*width;let sample;
     if(format===3&&bits===32)sample=view.getFloat32(offset,true);
     else if(bits===8)sample=(view.getUint8(offset)-128)/128;
     else if(bits===16)sample=view.getInt16(offset,true)/32768;
     else if(bits===24){let raw=view.getUint8(offset)|(view.getUint8(offset+1)<<8)|(view.getUint8(offset+2)<<16);if(raw&0x800000)raw-=0x1000000;sample=raw/8388608;}
     else sample=view.getInt32(offset,true)/2147483648;
     sum+=finite(sample,0);
    }
    data[i]=sum/channels;mean+=data[i];
   }
   mean/=Math.max(1,count);
   for(let i=0;i<count;i++){data[i]-=mean;peak=Math.max(peak,Math.abs(data[i]));}
   // Consistent headroom lets velocity control the loudness rather than the
   // recorder gain. Preserve the captured attack and every irregular rattle.
   const scale=peak>.00001?.78/peak:0,fade=Math.min(Math.round(sampleRate*.003),Math.floor(count/4));
   for(let i=0;i<count;i++)data[i]*=scale*(i<count-fade?1:(count-i)/fade);
   sampleBuffers.set(entry.key,buffer);return buffer;
  }catch(_){sampleFailures.add(entry.key);return null;}
 }
 function primeRecordedSamples() {
  for(const kind of ['floor','rim','frame','board','wall','ceiling','swish','chain'])for(const entry of recordedValues(kind))decodeRecorded(entry);
 }
 function recorded(kind,variant) {
  let entries=recordedValues(kind);
  if(!entries.length&&kind==='frame')entries=recordedValues('rim');
  if(!entries.length&&(kind==='wall'||kind==='ceiling'))entries=recordedValues('floor');
  if(!entries.length)return null;
  for(let i=0;i<entries.length;i++) {
   const entry=entries[(variant+i)%entries.length],buffer=decodeRecorded(entry);
   if(buffer)return {buffer,key:entry.key};
  }
  return null;
 }
 function makeContactBuffer(kind,level,variant) {
  const key = kind+':'+level+':'+variant;
  if (buffers.has(key)) return buffers.get(key);
  const profile = PROFILES[kind], sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1,Math.ceil(profile.duration*sampleRate),sampleRate);
  const samples = buffer.getChannelData(0);
  const seed = kind.split('').reduce((sum,letter)=>sum*31+letter.charCodeAt(0),17)+level*2477+variant*9311;
  const random = randomGenerator(seed);
  const strength = level/4;
  const detune = .985+random()*.03;
  const ballModes = [[87,.085,1],[137,.065,.42],[219,.038,.22],[352,.023,.09]];
  const modes = ballModes.map(([frequency,decay,gain])=>[frequency*detune,decay,gain*profile.ball*.47]);
  for (const [frequency,decay,gain] of profile.modes) modes.push([frequency*detune,decay*(.88+.16*strength),gain*profile.resonance*.44]);
  const count = modes.length, a = new Float64Array(count), b = new Float64Array(count), current = new Float64Array(count), previous = new Float64Array(count), weights = new Float64Array(count);
  for (let mode = 0; mode < count; mode++) {
   const [frequency,decay,gain] = modes[mode], damping = Math.exp(-1/(sampleRate*decay)), angle = TAU*frequency/sampleRate;
   a[mode] = 2*damping*Math.cos(angle);b[mode] = damping*damping;current[mode] = Math.sin(angle)*damping;weights[mode] = gain;
  }
  // Damped resonator recurrence avoids expensive per-sample trigonometry on phones.
  const attackDecay = Math.exp(-1/(sampleRate*.0007)), skinDecay = Math.exp(-1/(sampleRate*(.004+.005*strength))), grainDecay = Math.exp(-1/(sampleRate*.018));
  let attackRemaining = 1, skinEnvelope = 1, grainEnvelope = 1;
  let low = 0, smoother = 0;
  for (let i = 0; i < samples.length; i++) {
   const t = i/sampleRate, attack = 1-attackRemaining;
   const white = random()*2-1;
   low += .45*(white-low);smoother += .07*(white-smoother);
   const skin = (low-smoother)*skinEnvelope;
   const cavity=Math.sin(TAU*(83*t+1.22*(1-Math.exp(-t/.009))))*Math.exp(-t/.055)*profile.ball*.33;
   let resonances = 0;
   for (let mode = 0; mode < count; mode++) {
    const value = current[mode];resonances += value*weights[mode];
    current[mode] = a[mode]*value-b[mode]*previous[mode];previous[mode] = value;
   }
   const grain = smoother*grainEnvelope*(.045+.055*strength);
   const irregularMetal=(kind==='rim'||kind==='frame')?(low-smoother)*Math.exp(-t/.045)*(.11+.08*Math.sin(t*393)):0;
   let sample = attack*(resonances*.72+cavity+skin*profile.skin*(.85+.8*strength)+grain+irregularMetal);
   // Taper every source, including the very quiet end of the metal ring.
   sample *= Math.min(1,(profile.duration-t)/.014);
   samples[i] = Math.tanh(sample*1.1)*.88;
   attackRemaining *= attackDecay;skinEnvelope *= skinDecay;grainEnvelope *= grainDecay;
  }
  if (buffers.size >= 32) buffers.delete(buffers.keys().next().value);
  buffers.set(key,buffer);return buffer;
 }
 function makeFrictionBuffer(kind) {
  if (buffers.has(kind)) return buffers.get(kind);
  const sampleRate = context.sampleRate, duration = kind === 'swish' ? .48 : .14;
  const buffer = context.createBuffer(1,Math.ceil(sampleRate*duration),sampleRate), samples = buffer.getChannelData(0);
  const random = randomGenerator(kind === 'swish' ? 0x338818 : 0x619781);
  let low = 0, slow = 0;
  for (let i = 0; i < samples.length; i++) {
   const t = i/sampleRate, noise = random()*2-1;
   low += (kind === 'swish' ? .62 : .27)*(noise-low);slow += .045*(noise-slow);
   if (kind === 'swish') {
    // Successive nylon strand contacts, followed by a softer swinging net.
    const peaks = [[.025,.018,1],[.072,.026,.8],[.13,.04,.58],[.22,.062,.34]];
    let envelope = 0;
    for (const [centre,width,weight] of peaks) envelope += Math.exp(-Math.pow((t-centre)/width,2))*weight;
    const texture = .83+.17*Math.sin(TAU*73*t)*Math.sin(TAU*111*t);
    samples[i] = (low-slow)*envelope*texture*.29;
   } else {
    const envelope = Math.sin(Math.PI*clamp(t/duration,0,1))*Math.exp(-t/.048);
    samples[i] = (low-slow)*envelope*.17+slow*Math.exp(-Math.pow((t-.022)/.009,2))*.075;
   }
  }
  buffers.set(kind,buffer);return buffer;
 }
 // These irregular contacts come from credited recordings of real metal
 // chains, never pitched basketball rims or synthesized ringing oscillators.
 // They are chain recordings, not a claim of a captured basketball chain net.
 function makeChainClink(variant) {
  const key='chain-link:'+variant;if(buffers.has(key))return buffers.get(key);
  const capture=recorded('chain',variant);
  if(!capture)return makeFrictionBuffer('shoot');
  const take=capture.buffer.getChannelData(0),sampleRate=capture.buffer.sampleRate;
  const duration=.085+(variant%3)*.016,length=Math.ceil(sampleRate*duration);
  // Crop the strongest short real link cluster; retain its natural frequencies.
  let best=0,bestPower=-1;
  for(let start=0;start+length<take.length;start+=Math.round(sampleRate*.025)) {
   let power=0;for(let i=start;i<start+length;i+=4)power+=take[i]*take[i];
   if(power>bestPower){bestPower=power;best=start;}
  }
  const buffer=context.createBuffer(1,length,sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=take[best+i]*Math.min(1,i/(sampleRate*.002),(length-i)/(sampleRate*.024));
  buffers.set(key,buffer);return buffer;
 }
 function makeChainTexture(variant) {
  const key='chain-motion:'+variant;if(buffers.has(key))return buffers.get(key);
  const capture=recorded('chain',variant);if(!capture)return makeFrictionBuffer('shoot');
  const take=capture.buffer.getChannelData(0),sampleRate=capture.buffer.sampleRate;
  const buffer=context.createBuffer(1,take.length,sampleRate),data=buffer.getChannelData(0);data.set(take);
  // Equal-power seam in the recorded texture. Physical work supplies the gain;
  // nothing is played merely because a metal net is equipped.
  const overlap=Math.min(Math.round(sampleRate*.045),Math.floor(data.length/4)),start=data.slice(0,overlap);
  for(let i=0;i<overlap;i++) {
   const a=i/overlap*Math.PI*.5;data[i]=take[take.length-overlap+i]*Math.cos(a)+start[i]*Math.sin(a);
  }
  buffers.set(key,buffer);return buffer;
 }
 function makeChainPass(variant) {
  const capture=recorded('chain',variant);
  return capture?capture.buffer:makeFrictionBuffer('swish');
 }
 function makeNetTexture(variant,material='nylon') {
  if(isChain(material))return makeChainTexture(variant);
  const key = 'braided-cord:'+variant;
  if (buffers.has(key)) return buffers.get(key);
  // A long, aperiodic fibre bed. Irregular contact patches replace the old
  // identical 180 ms "swish" retrigger, so a moving ball produces one rub.
  const sampleRate = context.sampleRate, length = Math.ceil(sampleRate*3.71);
  const buffer = context.createBuffer(1,length,sampleRate), data = buffer.getChannelData(0);
  const random = randomGenerator(0x83a197+variant*72893);
  let body = 0, fibre = 0, slow = 0, grain = 0, grainTarget = 0, grainRemaining = 0;
  const bodyCoefficient = 1-Math.exp(-TAU*980/sampleRate), fibreCoefficient = 1-Math.exp(-TAU*6800/sampleRate);
  const slowCoefficient = 1-Math.exp(-TAU*155/sampleRate), grainCoefficient = 1-Math.exp(-TAU*87/sampleRate);
  for (let i=0;i<length;i++) {
   const white = random()*2-1;
   body += bodyCoefficient*(white-body);fibre += fibreCoefficient*(white-fibre);slow += slowCoefficient*(white-slow);
   if (--grainRemaining <= 0) {grainRemaining=Math.ceil(sampleRate*(.0015+random()*.011));grainTarget=.18+Math.pow(random(),1.8)*1.5;}
   grain += grainCoefficient*(grainTarget-grain);
   // Braided fibres have a coarse rubbing body and a quiet bright abrasion.
   data[i] = ((body-slow)*.55+(fibre-body)*.23)*grain;
  }
  // Equal-power overlap makes even a prolonged contact seamless. The playhead
  // starts at a different phase for each shot and rate follows sliding speed.
  const overlap=Math.floor(sampleRate*.08), originalStart=data.slice(0,overlap);
  for(let i=0;i<overlap;i++) {
   const mix=i/overlap, tail=data[length-overlap+i];
   data[i]=tail*Math.cos(mix*Math.PI*.5)+originalStart[i]*Math.sin(mix*Math.PI*.5);
  }
  buffers.set(key,buffer);return buffer;
 }
 function makeKnotBuffer(variant,material='nylon') {
  if(isChain(material))return makeChainClink(variant);
  const key='cord-knot:'+variant;
  if(buffers.has(key))return buffers.get(key);
  const random=randomGenerator(0x681c93+variant*17393), sampleRate=context.sampleRate;
  const duration=.033+random()*.047, buffer=context.createBuffer(1,Math.ceil(sampleRate*duration),sampleRate),data=buffer.getChannelData(0);
  let body=0,slow=0;
  const bodyCoefficient=1-Math.exp(-TAU*(1400+random()*1600)/sampleRate);
  const slowCoefficient=1-Math.exp(-TAU*240/sampleRate),decay=.007+random()*.009;
  for(let i=0;i<data.length;i++) {
   const t=i/sampleRate,white=random()*2-1;body+=bodyCoefficient*(white-body);slow+=slowCoefficient*(white-slow);
   // Soft, noise-only knot/pebbled-rubber ticks; no metal-like oscillator.
   const envelope=(1-Math.exp(-t/.0018))*Math.exp(-t/decay)*Math.min(1,(duration-t)/.012);
   data[i]=(body-slow)*envelope*.43;
  }
  buffers.set(key,buffer);return buffer;
 }
 function createPanner(position,referenceDistance=2.35) {
  const panner = context.createPanner();
  panner.panningModel = 'HRTF';panner.distanceModel = 'inverse';panner.refDistance = referenceDistance;
  panner.maxDistance = 70;panner.rolloffFactor = .85;
  positionPanner(panner,position,context.currentTime);return panner;
 }
 function removeVoice(voice,stop) {
  if (voice.finished) return;voice.finished = true;
  if (voice.cleanupTimer) window.clearTimeout(voice.cleanupTimer);
  if (stop) try {voice.source.stop();} catch (_) {}
  for (const node of voice.nodes) try {node.disconnect();} catch (_) {}
  voice.source.onended = null;voices.delete(voice);
  if(voice.netState && voice.netState.voice===voice)voice.netState.voice=null;
 }
 function clearNetStates() {
  for(const state of netStates.values())if(state.voice)removeVoice(state.voice,true);
  netStates.clear();
 }
 function smooth(param,value,time,constant) {
  param.cancelScheduledValues(time);param.setTargetAtTime(value,time,constant);
 }
 function startNetTexture(state) {
  while(voices.size>=MAX_VOICES)removeVoice(voices.values().next().value,true);
  const nodes=[],voice={source:null,nodes,finished:false,id:++voiceSerial,netState:state};
  try {
   const now=context.currentTime,source=context.createBufferSource();voice.source=source;nodes.push(source);
   source.buffer=makeNetTexture(state.textureVariant,state.material);source.loop=true;source.loopEnd=source.buffer.duration-(isChain(state.material)?.045:.08);
   const highpass=context.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=isChain(state.material)?220:175;highpass.Q.value=.45;
   const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=isChain(state.material)?(state.material==='gold-chain'?6900:9400):3200;filter.Q.value=.5;
   const gain=context.createGain();gain.gain.value=0;
   const panner=createPanner(state.position,1.8),send=context.createGain();send.gain.value=.10;
   // Texture itself has no fixed attack; the simulated work supplies its envelope.
   source.connect(highpass);highpass.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(master);panner.connect(send);send.connect(room);
   nodes.push(highpass,filter,gain,panner,send);Object.assign(voice,{gain,filter,panner});
   source.onended=()=>removeVoice(voice,false);voices.add(voice);state.voice=voice;createdVoices++;netTextureStarts++;
   source.start(now+.004+Math.min(distance(state.position,listenerPosition)/SPEED_OF_SOUND,.22),state.random()*(source.loopEnd-.1));
   return voice;
  }catch(_){if(voice.source)removeVoice(voice,true);else for(const node of nodes)try{node.disconnect();}catch(_){}return null;}
 }
 function play(buffer,position,normal,loudness,brightness,reflections,options={}) {
  if (!enabled || !context || context.state !== 'running' || disposed) return;
  while (voices.size >= MAX_VOICES) removeVoice(voices.values().next().value,true);
  const nodes = [], voice = {source:null,nodes,finished:false,id:++voiceSerial};
  try {
   const d = distance(position,listenerPosition), now = context.currentTime;
   const arrival = now+.004+Math.min(d/SPEED_OF_SOUND,.22);
   const source = context.createBufferSource();source.buffer = buffer;source.playbackRate.value=finite(options.rate,1);voice.source = source;nodes.push(source);
   const filter = context.createBiquadFilter();filter.type = 'lowpass';filter.Q.value = .45;
   const listenerDirection = unit({x:listenerPosition.x-position.x,y:listenerPosition.y-position.y,z:listenerPosition.z-position.z},{x:0,y:1,z:0});
   const face = normal ? Math.max(0,normal.x*listenerDirection.x+normal.y*listenerDirection.y+normal.z*listenerDirection.z) : 1;
   filter.frequency.value = clamp((finite(options.cutoff,5500)+brightness*9500)*(.72+.28*face)/(1+d*.043),finite(options.minCutoff,2100),19000);
   const gain = context.createGain();gain.gain.value = loudness*(.82+.18*face);
   const panner = createPanner(position), send = context.createGain();send.gain.value = finite(options.wet,.27);
   nodes.push(filter,gain,panner,send);
   source.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(master);panner.connect(send);send.connect(room);
   if (reflections && !OUTDOOR_ENVIRONMENTS.has(environment) && typeof context.createDelay === 'function') {
    // Mirror-source paths reproduce the earliest side-wall echoes in this gym.
    const mirrorSources = [
     {x:24-position.x,y:position.y,z:position.z},
     {x:-24-position.x,y:position.y,z:position.z},
     {x:position.x,y:position.y,z:36-position.z},
     {x:position.x,y:position.y,z:-36-position.z}
    ].map(point=>({point,distance:distance(point,listenerPosition)})).sort((a,b)=>a.distance-b.distance).slice(0,2);
    for (const reflected of mirrorSources) {
     const delay = context.createDelay(.4);delay.delayTime.value = clamp((reflected.distance-d)/SPEED_OF_SOUND,0,.35);
     const reflectionGain = context.createGain();reflectionGain.gain.value = finite(options.echo,.085);
     const reflectionFilter = context.createBiquadFilter();reflectionFilter.type = 'lowpass';reflectionFilter.frequency.value = 3600;reflectionFilter.Q.value = .4;
     const reflectionPanner = createPanner(reflected.point);
     nodes.push(delay,reflectionGain,reflectionFilter,reflectionPanner);
     gain.connect(delay);delay.connect(reflectionFilter);reflectionFilter.connect(reflectionGain);reflectionGain.connect(reflectionPanner);reflectionPanner.connect(master);
    }
   }
   source.onended = () => {
    // Delay paths need up to 350 ms after the direct sample has ended.
    const cleanup = window.setTimeout(()=>removeVoice(voice,false),reflections ? 370 : 0);
    voice.cleanupTimer = cleanup;
   };
   voices.add(voice);createdVoices++;source.start(arrival);return voice;
  } catch (_) {if (voice.source) removeVoice(voice,true);else for (const node of nodes) try {node.disconnect();} catch (_) {}}
 }
 function impact(contact) {
  if (!enabled || !context || context.state !== 'running' || disposed || !contact || !TYPES.has(contact.type)) return;
  const speed = Math.abs(finite(contact.impactSpeed,0));
  if (speed < .2) {rejectedImpacts++;return;}
  const position = vector(contact.position,listenerPosition);
  const normal = unit(vector(contact.normal,{x:0,y:1,z:0}),{x:0,y:1,z:0});
  const key = contact.type+':'+Math.round(position.x*3)+':'+Math.round(position.y*3)+':'+Math.round(position.z*3);
  const now = context.currentTime, prior = lastContacts.get(key);
  const spacing = contact.type === 'rim' ? .012 : .024;
  const simulationTime = finite(contact.time,NaN);
  // A solver may report one contact on several substeps; sound the physical strike once.
  if (prior && now-prior.audioTime < .12 && (Number.isFinite(simulationTime) && Number.isFinite(prior.time) ? simulationTime >= prior.time && simulationTime-prior.time < spacing : now-prior.audioTime < spacing)) {rejectedImpacts++;return;}
  lastContacts.set(key,{time:simulationTime,audioTime:now});
  if (lastContacts.size > 80) for (const [entry,previous] of lastContacts) if (now-previous.audioTime > 2) lastContacts.delete(entry);
  try {
   const strength=clamp(speed/8,0,1.8),level=clamp(Math.round(strength*4),0,4);
   const variant=impactCounts[contact.type]++,sample=recorded(contact.type,variant);
   const materialGain={floor:1.04,board:.92,rim:1.12,frame:1.02,wall:.82,ceiling:.7}[contact.type];
   const volume=clamp(Math.pow(strength,.78)*.82*materialGain,.018,1.12);
   if(sample) {
    // The elastic pop and uneven metal chatter are recorded together. Small
    // pitch changes avoid repetition without turning a rim into a bell.
    const rate=clamp(.955+(variant%5)*.014+strength*.013+(contact.type==='frame'?.055:0),.94,1.10);
    const cutoff=contact.type==='wall'||contact.type==='ceiling'?2600:6500;
    const voice=play(sample.buffer,position,normal,volume,clamp(speed/9,.12,1),true,{rate,wet:.16,echo:.055,cutoff});
    if(voice)sampledImpacts++;
   }else play(makeContactBuffer(contact.type,level,variant%3),position,normal,volume,clamp(speed/10,.1,1),true);
  } catch (_) {}
 }
 function shoot(position) {
  if (!enabled || !context || context.state !== 'running' || disposed) return;
  try {play(makeFrictionBuffer('shoot'),vector(position,listenerPosition),null,.19,.15,false);} catch (_) {}
 }
 function swish(position,options={}) {
  if (!enabled || !context || context.state !== 'running' || disposed) return false;
  position=vector(position,listenerPosition);
  const now=context.currentTime,key=Math.round(position.x)+':'+Math.round(position.z),shotId=options.shotId===undefined?null:String(options.shotId);
  if((shotId!==null&&playedPasses.has(shotId))||now-(lastNetPasses.get(key)??-Infinity)<.25){rejectedNetPasses++;return false;}
  try {
   const speed=clamp(Math.abs(finite(options.speed,4)),.5,14),clean=options.clean!==false,chain=isChain(options.material),gold=chain&&chainMaterial(options.material)==='gold-chain';
   const sample=chain?null:recorded('swish',netPasses),buffer=chain?makeChainPass(netPasses):(sample?sample.buffer:makeFrictionBuffer('swish'));
   const rate=chain?clamp(.97+speed*.008+(netPasses%3)*.006,.97,1.10)*(gold?.99:1):clamp(.91+speed*.019+(netPasses%3)*.012,.93,1.16);
   const volume=clamp((.82+Math.sqrt(speed/5)*.20)*(clean?1:.89),.72,1.16)*(chain?(gold?.66:.70):1);
   const voice=play(buffer,position,null,volume,chain?(gold?.12:.24):.95,false,{rate,wet:chain?.10:.14,cutoff:chain?(gold?6100:8200):8500,minCutoff:chain?2200:3600});
   if(!voice)return false;
   if(shotId!==null){playedPasses.add(shotId);if(playedPasses.size>128)playedPasses.delete(playedPasses.values().next().value);}
   lastNetPasses.set(key,now);netPasses++;if(sample)sampledNetPasses++;if(chain){chainPasses++;if(recordedValues('chain').length)sampledChainPasses++;}
   // Actual contact still contributes small rope sounds, underneath one clear
   // net passage rather than several overlapping bursts of broadband hiss.
   for(const net of netStates.values())if(distance(position,net.position)<2)net.passUntil=now+.55;
   return true;
  }catch(_){return false;}
 }
 function netMotion(state) {
  if (!enabled || !context || context.state !== 'running' || disposed || !state) return;
  const position=vector(state.position,listenerPosition);
  const id=state.id===undefined ? (position.z<0?'near-net':'far-net') : String(state.id);
  const material=isChain(state.material)?chainMaterial(state.material):'nylon';
  let net=netStates.get(id);
  if(!net) {
   if(netStates.size>=8){const old=netStates.values().next().value;if(old.voice)removeVoice(old.voice,true);netStates.delete(old.id);}
   const seed=id.split('').reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0x391def)||1;
   net={id,position,material,voice:null,random:randomGenerator(seed),textureVariant:seed%3,power:0,pressure:0,gainTarget:0,
    lastActive:-Infinity,nextKnot:0,knotImpulse:0,contactActive:false,passUntil:0};
   netStates.set(id,net);
  }
  if(net.material!==material) {
   if(net.voice)removeVoice(net.voice,true);
   net.material=material;net.power=net.pressure=net.gainTarget=net.knotImpulse=0;
   net.lastActive=-Infinity;net.passUntil=0;net.contactActive=false;
  }
  net.position=position;
  const chain=isChain(material),gold=material==='gold-chain';
  const now=context.currentTime,dt=clamp(finite(state.frameDt,1/60),1/1000,.25);
  const speed=Math.sqrt(2*clamp(finite(state.motionEnergy,0),0,80));
  const closing=clamp(finite(state.contactSpeed,0),0,40),slip=clamp(finite(state.slipSpeed,closing*.7),0,40);
  const contacts=Math.max(0,finite(state.contactCount,0)),tension=clamp(finite(state.tension,0),0,1);
  // Work is dissipated energy, not an impact count: dividing by elapsed physics
  // time makes the sound power independent of render/substep frequency.
  const work=clamp(finite(state.frictionWork,contacts>0?slip*slip*dt*.018:0),0,10);
  const impulse=clamp(finite(state.normalImpulse,contacts>0?closing*dt*.14:0),0,10);
  const hasContact=contacts>0 && (work>1e-7 || (impulse>1e-6 && closing>.035));
  const alpha=1-Math.exp(-dt/.026);
  net.power+=alpha*((hasContact?Math.min(24,work/dt):0)-net.power);
  net.pressure+=alpha*((hasContact?Math.min(35,impulse/dt):0)-net.pressure);
  const rubbing=.10*Math.sqrt(net.power/(1+net.power*.28));
  const compression=.015*Math.sqrt(net.pressure)*Math.min(1,closing/2);
  // A quiet suspended net is inaudible. Air and cord-against-cord movement only
  // contribute above a threshold that excludes constraint-solver settling.
  const settling=Math.pow(Math.max(0,speed-.11),1.15)*(.010+.007*tension);
  const chainMotion=.035*Math.pow(Math.max(0,speed-.075),.8)*(1+.3*tension);
  let target=chain?clamp(rubbing*.70+compression*1.1+Math.min(.042,chainMotion),0,.18)*(gold?.94:1):clamp(rubbing+compression+Math.min(.018,settling),0,.19);
  if(now<net.passUntil)target*=chain?.12:.22;
  if(target<.0015)target=0;
  net.gainTarget=target;
  if(target>.003){net.lastActive=now;if(!net.voice){net.textureVariant=(net.textureVariant+1)%3;startNetTexture(net);}}
  if(net.voice) {
   const voice=net.voice,d=distance(position,listenerPosition);
   try {
    // A moving centroid is smoothed over a few milliseconds, so a single strand
    // changing contact cannot make the perceived source jump between ears.
    for(const [axis,value]of [['X',position.x],['Y',position.y],['Z',position.z]]) {
     const param=voice.panner['position'+axis];if(param)smooth(param,value,now,.018);
    }
    if(!voice.panner.positionX && typeof voice.panner.setPosition==='function')voice.panner.setPosition(position.x,position.y,position.z);
    smooth(voice.gain.gain,target,now,hasContact?.018:.065);
    smooth(voice.filter.frequency,clamp(((chain?(gold?4200:6200):1600)+slip*(chain?270:690)+tension*1000)/(1+d*.045),chain?2700:900,chain?11500:8500),now,.035);
    smooth(voice.source.playbackRate,chain?clamp(.96+slip*.012+speed*.009,.96,1.12)*(gold?.99:1):clamp(.72+slip*.105+speed*.035,.65,1.8),now,.05);
   }catch(_){}
   if(!target && now-net.lastActive>.42)removeVoice(voice,true);
  }
  // Individual knots give occasional, soft irregular attacks to the continuous
  // rubbing bed. There is no repeating tick clock, score sound, or contact-count
  // multiplier that could turn solver iterations into a machine-gun effect.
  if(hasContact && closing>.12)net.knotImpulse+=impulse*(.45+.55*tension);
  else net.knotImpulse*=Math.exp(-dt/.08);
  if(chain&&speed>.1)net.knotImpulse+=Math.max(0,speed-.1)*dt*.06;
  if((hasContact||(chain&&speed>.1)) && net.knotImpulse>(chain?.008:.014) && now>=net.nextKnot) {
   const variant=Math.floor(net.random()*8);
   const loudness=clamp(Math.sqrt(net.knotImpulse)*(chain?.14:(.045+.028*tension)),.003,chain?.055:.028);
   try{play(makeKnotBuffer(variant,material),position,null,loudness,chain?.9:(.18+.35*tension),false);netKnotSounds++;if(chain){chainRattles++;if(recordedValues('chain').length)sampledChainRattles++;}}catch(_){}
   net.knotImpulse=0;net.nextKnot=now+(chain?.045:.09)+net.random()*(chain?.12:.16);
  }
  net.contactActive=hasContact;
 }
 function suspend() {
  clearNetStates();lastContacts.clear();
  for(const voice of Array.from(voices)){if(voice.cleanupTimer)window.clearTimeout(voice.cleanupTimer);removeVoice(voice,true);}
  if(context&&context.state==='running')try{return Promise.resolve(context.suspend()).catch(()=>{});}catch(_){}
  return Promise.resolve();
 }
 function dispose() {
  if (disposed) return;disposed = true;
  clearNetStates();
  for (const voice of Array.from(voices)) {if (voice.cleanupTimer) window.clearTimeout(voice.cleanupTimer);removeVoice(voice,true);}
  for (const node of [master,compressor,room,roomGain]) if (node) try {node.disconnect();} catch (_) {}
  buffers.clear();sampleBuffers.clear();sampleFailures.clear();lastContacts.clear();playedPasses.clear();lastNetPasses.clear();
  if (context) try {Promise.resolve(context.close()).catch(()=>{});} catch (_) {}
 }
 const api = {unlock,setEnabled,setEnvironment,setNetStyle,updateListener,impact,shoot,swish,netMotion,suspend,dispose};
 Object.defineProperty(api,'diagnostics',{enumerable:true,get:()=>Object.freeze({supported:!!(window.AudioContext||window.webkitAudioContext),state:disposed?'disposed':context?context.state:'locked',enabled,environment,netStyle,voices:voices.size,createdVoices,rejectedImpacts,sampledImpacts,netPasses,sampledNetPasses,rejectedNetPasses,sampleBuffers:sampleBuffers.size,sampleKeys:Object.freeze(Array.from(sampleBuffers.keys())),failedSamples:sampleFailures.size,impactCounts:Object.freeze({...impactCounts}),cachedBuffers:buffers.size,netTextureStarts,netKnotSounds,chainPasses,chainRattles,sampledChainPasses,sampledChainRattles,netVoices:Array.from(netStates.values()).filter(n=>n.voice).length,nets:Object.freeze(Array.from(netStates.values(),n=>Object.freeze({id:n.id,material:n.material,position:Object.freeze({...n.position}),gain:n.gainTarget,frictionPower:n.power,contactActive:n.contactActive,playing:!!n.voice}))),listener:Object.freeze({...listenerPosition})})});
 return Object.freeze(api);
};
})();
