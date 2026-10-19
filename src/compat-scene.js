/* CPU canvas fallback for devices without a usable WebGL context.
 * The ordinary ball and XPBD net solvers still determine every contact/score. */
(function(global){
'use strict';
const T=global.THREE,P=global.HoopPhysics;
global.createPotaCompatibilityScene=function({canvas}){
 const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('Canvas unavailable');
 const camera=new T.PerspectiveCamera(58,1,.04,100),ball={position:new T.Vector3(),visible:true};
 const aimArrow={visible:false};let arrow=[],trajectory=[],width=1,height=1,ratio=1,frames=0;
 let preference='smooth',rate=60,overrides={enabled:false,quality:'auto',resolution:'auto'};
 const cosmetic={ballSkin:'classic',particleStyle:'none',netStyle:'nylon',rimStyle:'standard',backboardStyle:'glass',environmentStyle:'gym'};
 const nets=P.hoops.map((hoop,index)=>global.PotaNetPhysics.create({id:'compat-'+index,sign:hoop.front,origin:{x:hoop.x,y:3.044,z:hoop.z}}));
 const netAudio=nets.map(net=>net.audioState),v=new T.Vector3(),view=new T.Vector3();
 const palettes={gym:['#b6b0a2','#a08459'], 'sunset-gym':['#b8a490','#a98155'],'night-gym':['#26333c','#514638'],'neon-arena':['#263243','#485365'],'royal-arena':['#5e5261','#947951'],'street-court':['#85999a','#53605b'],'midnight-court':['#152735','#334753'],'coastal-court':['#b1d0d0','#4e8585'],'desert-court':['#d0b587','#b78b50'],'alpine-court':['#c0d3d7','#678b88']};
 function project(x,y,z){v.set(x,y,z).project(camera);if(!Number.isFinite(v.x)||!Number.isFinite(v.y)||v.z< -1||v.z>1)return null;return{x:(v.x+1)*width/2,y:(1-v.y)*height/2};}
 function line(points,color,lineWidth=1,close=false){context.beginPath();let begun=false;for(const p of points){const q=project(p[0],p[1],p[2]);if(!q){begun=false;continue;}if(!begun){context.moveTo(q.x,q.y);begun=true;}else context.lineTo(q.x,q.y);}if(close)context.closePath();context.strokeStyle=color;context.lineWidth=lineWidth;context.stroke();}
 function polygon(points,color){const projected=points.map(p=>project(...p));if(projected.some(p=>!p))return;context.beginPath();projected.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.closePath();context.fillStyle=color;context.fill();}
 function render(){
  frames++;camera.updateMatrixWorld();const palette=palettes[cosmetic.environmentStyle]||palettes.gym;
  context.fillStyle=palette[0];context.fillRect(0,0,width,height);
  polygon([[-12,0,-18],[12,0,-18],[12,0,18],[-12,0,18]],palette[1]);
  line([[-12,0,-18],[12,0,-18],[12,8.89,-18],[-12,8.89,-18],[-12,0,-18]],'#273c334d');
  for(let x=-7;x<=7;x+=1)line([[x,.002,-14],[x,.002,14]],'#eee1bd18');
  line([[-7.5,.01,-14],[7.5,.01,-14],[7.5,.01,14],[-7.5,.01,14],[-7.5,.01,-14]],'#f3e8ce',1.5);
  line([[-7.5,.01,0],[7.5,.01,0]],'#f3e8ce',1.5);
  for(let h=0;h<P.hoops.length;h++){
   const hoop=P.hoops[h],z=hoop.z,front=hoop.front;
   polygon([[-2.45,.012,z-front*.7],[2.45,.012,z-front*.7],[2.45,.012,z+front*5.1],[-2.45,.012,z+front*5.1]],'#456f644f');
   line([[-2.45,.015,z-front*.7],[-2.45,.015,z+front*5.1],[2.45,.015,z+front*5.1],[2.45,.015,z-front*.7]],'#f3e8ce',1.4);
   const arc=[];for(let i=0;i<=40;i++){const angle=i/40*Math.PI;arc.push([Math.cos(angle)*6.7,.015,z+Math.sin(angle)*6.7*front]);}line(arc,'#efe1bdad',1.3);
   line([[0,0,hoop.boardZ-front*.8],[0,3.6,hoop.boardZ-front*.8],[0,3.6,hoop.boardZ]],'#324039',Math.max(4,width/90));
   const board=[[-.9,3,hoop.boardZ],[.9,3,hoop.boardZ],[.9,4.05,hoop.boardZ],[-.9,4.05,hoop.boardZ]];
   polygon(board,'#d7e4de44');line(board,'#f3f3e2',2,true);
   line([[-.3,3.05,hoop.boardZ],[-.3,3.5,hoop.boardZ],[.3,3.5,hoop.boardZ],[.3,3.05,hoop.boardZ]],'#f8e8d2',1.5,true);
   const rim=[];for(let i=0;i<=40;i++){const a=i/40*Math.PI*2;rim.push([Math.cos(a)*.2465,hoop.y,z+Math.sin(a)*.2465]);}line(rim,cosmetic.rimStyle==='gold-rim'?'#dfb76d':'#c56132',Math.max(2,width/220));
   const net=nets[h],pos=net.positions;for(const edge of net.links){const a=edge.a*3,b=edge.b*3;line([[hoop.x+pos[a],3.044+pos[a+1],z+pos[a+2]],[hoop.x+pos[b],3.044+pos[b+1],z+pos[b+2]]],cosmetic.netStyle==='gold-chain'?'#e1c173':cosmetic.netStyle==='black-net'?'#27372f':'#e7e8de',cosmetic.netStyle.includes('chain')?1.6:1.1);}
  }
  if(trajectory.length)line(trajectory.map(p=>[p.x,p.y,p.z]),'#fff0b180',1);
  if(aimArrow.visible&&arrow.length){line(arrow.map(p=>[p.x,p.y,p.z]),'#fff1c7b3',3);const end=arrow[arrow.length-1],previous=arrow[arrow.length-2];if(end&&previous){const a=project(end.x,end.y,end.z),b=project(previous.x,previous.y,previous.z);if(a&&b){const angle=Math.atan2(a.y-b.y,a.x-b.x);context.beginPath();context.moveTo(a.x,a.y);context.lineTo(a.x-Math.cos(angle-.5)*10,a.y-Math.sin(angle-.5)*10);context.moveTo(a.x,a.y);context.lineTo(a.x-Math.cos(angle+.5)*10,a.y-Math.sin(angle+.5)*10);context.stroke();}}}
  if(ball.visible){const q=project(ball.position.x,ball.position.y,ball.position.z);view.copy(ball.position).applyMatrix4(camera.matrixWorldInverse);if(q&&view.z<0){const radius=Math.min(width*.45,P.BALL_RADIUS*height/(2*Math.tan(camera.fov*Math.PI/360)*-view.z));const gradient=context.createRadialGradient(q.x-radius*.3,q.y-radius*.35,radius*.05,q.x,q.y,radius);gradient.addColorStop(0,cosmetic.ballSkin==='classic'?'#edaa50':'#acc7be');gradient.addColorStop(.65,cosmetic.ballSkin==='classic'?'#bc652c':'#55776c');gradient.addColorStop(1,'#342a21');context.beginPath();context.arc(q.x,q.y,radius,0,Math.PI*2);context.fillStyle=gradient;context.fill();context.save();context.clip();context.strokeStyle='#33291eb3';context.lineWidth=Math.max(1,radius*.04);context.beginPath();context.moveTo(q.x-radius,q.y);context.lineTo(q.x+radius,q.y);context.moveTo(q.x,q.y-radius);context.lineTo(q.x,q.y+radius);context.ellipse(q.x,q.y,radius*.45,radius,0,0,Math.PI*2);context.stroke();context.restore();}}
 }
 const api={camera,ball,aimArrow,render,
  resize(w,h){width=Math.max(1,w);height=Math.max(1,h);ratio=Math.min(1.25,Math.sqrt(900000/(width*height)));canvas.width=Math.max(1,Math.floor(width*ratio));canvas.height=Math.max(1,Math.floor(height*ratio));context.setTransform(ratio,0,0,ratio,0,0);camera.aspect=width/height;camera.updateProjectionMatrix();},
  setBall(p){ball.position.set(p.x,p.y,p.z);},setAimArrow(points,visible){arrow=points;aimArrow.visible=visible;},setTrajectory(points,visible){trajectory=visible?points:[];},
  setPerformancePreference(value){preference=value;return true;},setDisplayRefreshRate(value){rate=value;return true;},setDeveloperOverrides(value){overrides={...value};return true;},resetPerformanceTiming(){},samplePerformanceFrame(){},degradeGraphics(){},
  beginNetFrame(){for(const net of nets)net.beginFrame();},stepNetPhysics(dt,b){for(const net of nets)net.step(dt,b);},animate(){for(const net of nets)net.finishFrame();},
  getNetAudioState(){return netAudio;},getNetDiagnostics(){return nets.map(net=>net.diagnostics());},getWeatherDiagnostics(){return{mode:'compatibility',finite:true};},getCosmeticState(){return{...cosmetic};},
  getGraphicsDiagnostics(){return{quality:'auto',resolutionQuality:'auto',effectiveProfile:'compatibility',pipeline:'canvas2d-compatibility',hdr:false,performancePreference:preference,targetFps:preference==='graphics'?60:preference==='balanced'?(rate>=89?90:60):rate>=119?120:60,sceneResolution:[canvas.width,canvas.height],dpr:ratio,renderedFrames:frames,developerOverrides:{...overrides},fallbackReason:'WebGL unavailable'};},
  setBallSkin(id){cosmetic.ballSkin=id;return true;},setParticleStyle(id){cosmetic.particleStyle=id;return true;},setNetStyle(id){cosmetic.netStyle=id;for(const net of nets)net.setMaterial(id.includes('chain')?'chain':'nylon');return true;},setRimStyle(id){cosmetic.rimStyle=id;return true;},setBackboardStyle(id){cosmetic.backboardStyle=id;return true;},setEnvironmentStyle(id){cosmetic.environmentStyle=id;return true;},dispose(){}
 };
 return api;
};
})(window);
