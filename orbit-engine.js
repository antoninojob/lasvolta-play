/* ORBIT engine — pure, DOM-free. window.OrbitEngine / require().
   One-tap arcade: a dot orbits the centre; TAP reverses direction. Sweep over gems to collect,
   reverse to avoid spikes. Reach the level's gem target without being hit. Golden gems = mastery (stars).
   Speed rises over time (flow). Shield booster absorbs one hit. Difficulty takes a DDA offset. */
(function(root){
"use strict";
const TAU=Math.PI*2;
function mod2(x){ x%=TAU; return x<0?x+TAU:x; }
function config(L){
  // Gentle difficulty curve: nearly flat for the first levels, then ~x^2.3 growth that
  // steepens later (the late "exponential" feel). d≈0 at L1, ≈1 around L20, keeps rising after.
  const d  = Math.pow(Math.max(0,L-1)/20, 2.3);
  const dc = Math.min(d, 1);                 // clamped 0..1 for params that saturate
  const over = Math.min(Math.max(0,d-1), 2); // only >0 past level ~20 (late ramp)
  return {
    target:     5 + Math.round((L-1)*1.2),   // calm gem goal: L1=5, L2=6, L3=7, L5=10...
    omega:      0.00095 + 0.00115*dc + 0.00050*over, // ~6.6s/orbit start -> ~3.2s -> faster late
    grow:       0.00000004 + 0.00000013*dc,  // gentle in-level flow acceleration (was ~9x steeper)
    spikeEvery: Math.round(Math.max(560, 3200 - 1900*dc - 500*over)), // rare early, dense late
    gemEvery:   Math.round(Math.max(500, 1100 - 560*dc)),  // sparser early = cleaner, calmer ring
    powerEvery: 6500,
    golden:     Math.min(1 + Math.floor(L/3), 4)
  };
}
function create(){
  const S={angle:-Math.PI/2, dir:1, omega:0.0015, items:[], score:0, target:0, golden:0, goldenGot:0, alive:true, t:0, shield:0, lives:3, invuln:0, spawnEnabled:true, cfg:null, _spikeT:0, _gemT:0, _powerT:0, _tapCool:0, _goldenSpawned:0};
  S.build=function(L,rng,dda){ rng=rng||Math.random; const c=config(L); S.cfg=c;
    S.angle=-Math.PI/2; S.dir=1; S.omega=c.omega*(1+(dda||0)*0.06); S.items=[]; S.score=0; S.target=c.target;
    S.golden=c.golden; S.goldenGot=0; S._goldenSpawned=0; S.alive=true; S.t=0; S.shield=0; S._tapCool=0;
    S._spikeT=c.spikeEvery*0.7; S._gemT=260; S._powerT=c.powerEvery; S.lives=3; S.invuln=0; S.spawnEnabled=true; return S; };
  S.tap=function(){ if(!S.alive||S._tapCool>0)return false; S.dir*=-1; S._tapCool=90; return true; };
  function spawn(type,rng){ // place ahead in the CURRENT direction, not too close, not overlapping
    for(let tries=0;tries<8;tries++){ const a=mod2(S.angle + S.dir*(0.8 + rng()*2.1));
      let ok=true; for(const it of S.items){ if(Math.abs(mod2(a-it.a))<0.40 || Math.abs(mod2(it.a-a))<0.40){ ok=false; break; } }
      if(ok && type==='spike'){ // anti-trap: never box the player in — keep >=1 escape corridor free of spikes
        let fwd=mod2(a-S.angle), bwd=mod2(S.angle-a);
        for(const it of S.items){ if(it.type!=='spike')continue; fwd=Math.min(fwd,mod2(it.a-S.angle)); bwd=Math.min(bwd,mod2(S.angle-it.a)); }
        if(fwd<1.0 && bwd<1.0) ok=false; }
      if(ok){ if(type==='power'){ const subs=['shield','slow','life','x2']; S.items.push({a:a, type:'power', power:subs[Math.floor(rng()*subs.length)], born:S.t, golden:false}); return; }
        let golden=false; if(type==='gem' && S._goldenSpawned<S.golden && rng()<0.5){ golden=true; S._goldenSpawned++; }
        S.items.push({a:a, type:type, born:S.t, golden:golden}); return; } }
  }
  S.step=function(dt,rng){ if(!S.alive) return {collected:[],hit:false,shieldUsed:false,lifeLost:false}; rng=rng||Math.random;
    S.t+=dt; S._tapCool=Math.max(0,S._tapCool-dt); if(S.invuln>0)S.invuln=Math.max(0,S.invuln-dt); S.omega+=S.cfg.grow*dt;
    if(S.spawnEnabled){ S._spikeT-=dt; if(S._spikeT<=0){ S._spikeT=S.cfg.spikeEvery; spawn('spike',rng); }
      S._gemT-=dt; if(S._gemT<=0){ S._gemT=S.cfg.gemEvery; spawn('gem',rng); }
      S._powerT-=dt; if(S._powerT<=0){ S._powerT=S.cfg.powerEvery; spawn('power',rng); } }
    const delta=S.omega*dt, prev=S.angle; S.angle=mod2(S.angle + S.dir*delta);
    const collected=[]; let hit=false, shieldUsed=false, lifeLost=false; const keep=[];
    for(const it of S.items){ const f=mod2(S.dir*(it.a-prev)); const crossed=(f>1e-6 && f<=delta);
      if(crossed){ if(it.type==='gem'){ S.score++; if(it.golden)S.goldenGot++; collected.push(it); }
        else if(it.type==='power'){ collected.push(it); }
        else { if(S.invuln>0){} else if(S.shield>0){ S.shield--; shieldUsed=true; S.invuln=600; } else if(S.lives>0){ S.lives--; lifeLost=true; S.invuln=1000; } else { hit=true; S.alive=false; keep.push(it); } } }
      else { if(S.t-it.born < 9000) keep.push(it); } }   // items expire after 9s
    S.items=keep; return {collected:collected, hit:hit, shieldUsed:shieldUsed, lifeLost:lifeLost};
  };
  S.progress=function(){ return S.target?Math.min(1,S.score/S.target):0; };
  S.isWin=function(){ return S.alive && S.score>=S.target; };
  S.isDead=function(){ return !S.alive; };
  S.stars=function(){ if(!S.golden) return S.isWin()?3:1; if(S.goldenGot>=S.golden)return 3; if(S.goldenGot>=1)return 2; return 1; };
  return S;
}
const api={config, create, mod2};
if(typeof module!=='undefined' && module.exports) module.exports=api;
root.OrbitEngine=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:this));
