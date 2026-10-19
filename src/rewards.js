/* POTA: deterministic basket and streak rewards, shared by the game and QA. */
(function(global){
 'use strict';
 function calculate(state,basePoints,made,multiplier=1){
  const previous=Number.isSafeInteger(state.streak)&&state.streak>0?state.streak:0;
  const best=Number.isSafeInteger(state.best)&&state.best>0?state.best:0;
  const streak=made?Math.min(Number.MAX_SAFE_INTEGER-3,previous+1):0;
  const base=basePoints===3?3:2;
  const bonus=made?Math.max(0,streak-1):0;
  multiplier=multiplier===2||multiplier===3?multiplier:1;
  const unmultipliedPoints=made?base+bonus:0;
  return{streak,best:Math.max(best,streak),basePoints:made?base:0,bonus,multiplier,unmultipliedPoints,points:Math.min(Number.MAX_SAFE_INTEGER,unmultipliedPoints*multiplier)};
 }
 global.PotaRewards=Object.freeze({calculate});
})(typeof window!=='undefined'?window:globalThis);
