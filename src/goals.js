/* POTA: one-time goals with fixed point rewards. Pure logic, shared by the game and QA.
 * Only baskets that earned points advance a goal; blocked automatic repeats do not.
 */
(function(global){
 'use strict';
 const METRICS=Object.freeze(['baskets','threes','swishes','banks','farHoop','bestStreak']);
 const catalog=Object.freeze([
  {id:'first-basket',metric:'baskets',target:1,reward:10,name:'İlk basket',description:'Herhangi bir basket at.'},
  {id:'baskets-25',metric:'baskets',target:25,reward:30,name:'Isınma turu',description:'Toplam 25 basket at.'},
  {id:'baskets-100',metric:'baskets',target:100,reward:120,name:'Antrenman müdavimi',description:'Toplam 100 basket at.'},
  {id:'baskets-500',metric:'baskets',target:500,reward:600,name:'Salonun yıldızı',description:'Toplam 500 basket at.'},
  {id:'baskets-2000',metric:'baskets',target:2000,reward:2500,name:'Pota ustası',description:'Toplam 2.000 basket at.'},
  {id:'streak-3',metric:'bestStreak',target:3,reward:15,name:'Ritim',description:'Art arda 3 basket at.'},
  {id:'streak-5',metric:'bestStreak',target:5,reward:40,name:'Seri başladı',description:'Art arda 5 basket at.'},
  {id:'streak-10',metric:'bestStreak',target:10,reward:150,name:'Eli sıcak',description:'Art arda 10 basket at.'},
  {id:'streak-20',metric:'bestStreak',target:20,reward:500,name:'Durdurulamaz',description:'Art arda 20 basket at.'},
  {id:'three-1',metric:'threes',target:1,reward:20,name:'Üç sayı çizgisi',description:'Üçlük çizgisinin dışından basket at.'},
  {id:'threes-50',metric:'threes',target:50,reward:300,name:'Uzak mesafe',description:'Toplam 50 üçlük at.'},
  {id:'swish-1',metric:'swishes',target:1,reward:20,name:'Tertemiz',description:'Çembere ve panyaya değmeden basket at.'},
  {id:'swishes-25',metric:'swishes',target:25,reward:250,name:'Sadece file',description:'25 tertemiz basket at.'},
  {id:'bank-1',metric:'banks',target:1,reward:20,name:'Panyadan',description:'Panyaya sektirerek basket at.'},
  {id:'banks-25',metric:'banks',target:25,reward:250,name:'Açı ustası',description:'Panyadan 25 basket at.'},
  {id:'far-hoop',metric:'farHoop',target:1,reward:30,name:'Karşı pota',description:'Sahanın öbür yarısına yürü, şut moduna dön ve oradaki potaya basket at.'}
 ].map(Object.freeze));
 const byId=new Map(catalog.map(goal=>[goal.id,goal]));
 const count=value=>Number.isSafeInteger(value)&&value>0?value:0;
 function normalize(saved){
  const source=saved&&typeof saved==='object'?saved:{};
  const progress={},input=source.progress&&typeof source.progress==='object'?source.progress:{};
  for(const metric of METRICS)progress[metric]=count(input[metric]);
  const completed=Array.isArray(source.completed)?[...new Set(source.completed.filter(id=>byId.has(id)))]:[];
  return{completed,progress};
 }
 // shot: {made, pointsBlocked, value, streak, swish, bank, hoop}
 function record(saved,shot){
  const state=normalize(saved),newlyCompleted=[];
  if(!shot||shot.made!==true||shot.pointsBlocked===true)return{state,newlyCompleted,reward:0};
  const p=state.progress,add=(metric,amount)=>{p[metric]=Math.min(Number.MAX_SAFE_INTEGER,p[metric]+amount);};
  add('baskets',1);
  if(shot.value===3)add('threes',1);
  if(shot.swish===true)add('swishes',1);
  if(shot.bank===true)add('banks',1);
  if(shot.hoop===1)add('farHoop',1);
  p.bestStreak=Math.max(p.bestStreak,count(shot.streak));
  let reward=0;
  for(const goal of catalog)if(!state.completed.includes(goal.id)&&p[goal.metric]>=goal.target){state.completed.push(goal.id);newlyCompleted.push(goal);reward+=goal.reward;}
  return{state,newlyCompleted,reward};
 }
 function summary(saved){
  const state=normalize(saved);
  return catalog.map(goal=>({...goal,done:state.completed.includes(goal.id),current:Math.min(goal.target,state.progress[goal.metric])}));
 }
 global.PotaGoals=Object.freeze({catalog,metrics:METRICS,normalize,record,summary});
})(typeof window!=='undefined'?window:globalThis);
