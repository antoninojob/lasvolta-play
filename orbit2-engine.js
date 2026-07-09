/* ORBIT-RINGS engine — pure, DOM-free. window.OrbitRingsEngine / require().
   Multi-orbit prototype: 3 concentric orbits joined by BRIDGES (junctions) at fixed angles.
   ONE finger:
     - TAP while the dot is on a bridge  -> CROSS to the adjacent orbit (choose your route)
     - TAP anywhere else                 -> REVERSE direction (the classic mechanic, kept)
   Collect gems spread across the orbits, dodge spikes, reach the target. Crossing a bridge is a
   brief SAFE transit. Anti-trap: spikes never spawn on/near a bridge, so a cross is always a valid
   escape; on the dot's own ring a spike never boxes it in. Speed rises gently over time (flow). */
(function(root){
"use strict";
const TAU=Math.PI*2;
function mod2(x){ x%=TAU; return x<0?x+TAU:x; }
function adist(a,b){ const d=Math.abs(mod2(a-b)); return d>Math.PI?TAU-d:d; }   // shortest angular distance 0..PI
function sdist(a,b){ let d=mod2(b-a); if(d>Math.PI)d-=TAU; return d; }           // signed shortest turn a->b, -PI..PI
function easeIO(p){ return p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2; }                 // easeInOutQuad

function config(L){
  // Gentle curve: nearly flat for the first levels, then ~x^2.3 growth that steepens later.
  const d  = Math.pow(Math.max(0,L-1)/20, 2.3);
  const dc = Math.min(d, 1);
  const over = Math.min(Math.max(0,d-1), 2);
  return {
    target:     5 + Math.round((L-1)*1.3),               // gems total, across all orbits
    omega:      0.00090 + 0.00100*dc + 0.00045*over,     // ~7s/orbit start (3 rings ask for calm)
    grow:       0.00000004 + 0.00000012*dc,              // gentle in-level flow acceleration
    spikeEvery: Math.round(Math.max(620, 3200 - 1800*dc - 500*over)),
    gemEvery:   Math.round(Math.max(520, 950 - 430*dc)), // spread across 3 rings -> ~3x sparser per ring
    powerEvery: 7000,
    golden:     Math.min(1 + Math.floor(L/3), 4),
    rings:      [0.40, 0.66, 0.92],                      // radius factors (HTML multiplies by a base R)
    bridgesPerPair: 3
  };
}

function create(){
  const S={ rings:[], bridges:[], ring:0, angle:-Math.PI/2, dir:1, omega:0.0009,
            items:[], score:0, target:0, golden:0, goldenGot:0, alive:true, t:0,
            shield:0, lives:3, invuln:0, spawnEnabled:true, cfg:null,
            cross:null, _spikeT:0, _gemT:0, _powerT:0, _tapCool:0, _goldenSpawned:0 };

  S.build=function(L,rng,dda){ rng=rng||Math.random; const c=config(L); S.cfg=c;
    S.rings=c.rings.slice(); S.ring=(c.rings.length>1?1:0);          // start on the middle orbit
    S.angle=-Math.PI/2; S.dir=1; S.omega=c.omega*(1+(dda||0)*0.05);
    S.items=[]; S.score=0; S.target=c.target; S.golden=c.golden; S.goldenGot=0; S._goldenSpawned=0;
    S.alive=true; S.t=0; S.shield=0; S.lives=3; S.invuln=0; S.spawnEnabled=true; S.cross=null; S._tapCool=0;
    S._spikeT=c.spikeEvery*0.8; S._gemT=300; S._powerT=c.powerEvery;
    // bridges: connect adjacent rings at spaced-out, distinct angles (>=0.6 rad apart -> windows never overlap)
    S.bridges=[]; const used=[];
    function pick(){ for(let t=0;t<24;t++){ const a=rng()*TAU; if(used.every(x=>adist(a,x)>0.6)){ used.push(a); return a; } } return null; }
    for(let lo=0; lo<S.rings.length-1; lo++){ for(let b=0;b<c.bridgesPerPair;b++){ const a=pick(); if(a!=null) S.bridges.push({a:a, lo:lo}); } }
    return S; };

  // the bridge whose window currently contains the dot (on the dot's ring); null if none
  S.bridgeHere=function(){ let best=null,bd=1e9; for(const br of S.bridges){ if(br.lo!==S.ring && br.lo+1!==S.ring) continue;
      const d=adist(S.angle, br.a); if(d<0.24 && d<bd){ bd=d; best=br; } } return best; };

  S.tap=function(){ if(!S.alive||S.cross||S._tapCool>0) return false;
    const br=S.bridgeHere();
    if(br){ const to=(S.ring===br.lo)?br.lo+1:br.lo;
      // Two-phase cross: first GLIDE along the current ring to the bridge's exact angle (br.a), then
      // JUMP radially. So the leap departs & lands ON the drawn bridge line — no teleport, no before/after.
      const a0=S.angle, gap=Math.abs(sdist(a0,br.a));
      const sdur=Math.min(180, gap/S.omega);                        // glide at the natural orbit speed, capped
      S.cross={from:S.ring,to:to,a0:a0,a1:br.a,sp:(gap<1e-3?1:0),sdur:Math.max(1,sdur),p:0,dur:150};
      S._tapCool=120; return 'cross'; }
    S.dir*=-1; S._tapCool=90; return 'reverse'; };

  function nearBridge(ring,a,margin){ for(const br of S.bridges){ if((br.lo===ring||br.lo+1===ring)&&adist(br.a,a)<margin) return true; } return false; }

  function spawn(type,rng){
    for(let tries=0;tries<10;tries++){
      const ring=Math.floor(rng()*S.rings.length);
      // ahead in the current direction when on the dot's own ring (fair reaction window), else anywhere
      const a=(ring===S.ring) ? mod2(S.angle + S.dir*(0.8 + rng()*2.1)) : rng()*TAU;
      let ok=true; for(const it of S.items){ if(it.ring===ring && adist(it.a,a)<0.40){ ok=false; break; } }
      if(!ok) continue;
      if(type==='spike'){
        if(nearBridge(ring,a,0.5)) continue;                        // bridges stay safe to use & land on
        // Pocket-free ring: any two spikes closer than 2*BOX rad leave a spot where BOTH escape sides are
        // < BOX rad. On your own ring you can't reach such a spot (you're always moving, never teleport into
        // the middle) — but a CROSS drops you onto another ring anywhere, so a pocket there is an unfair
        // no-escape trap. Keeping every ring globally pocket-free makes any landing, and any drift after it,
        // always escapable. This subsumes the old own-ring anti-box (a stronger, ring-wide invariant).
        { const BOX=1.0; let pocket=false;
          for(const it of S.items){ if(it.type==='spike'&&it.ring===ring && adist(it.a,a)<2*BOX){ pocket=true; break; } }
          if(pocket) continue; }
        S.items.push({ring:ring,a:a,type:'spike',born:S.t,golden:false}); return;
      }
      if(type==='power'){ const subs=['shield','slow','life','x2']; S.items.push({ring:ring,a:a,type:'power',power:subs[Math.floor(rng()*subs.length)],born:S.t,golden:false}); return; }
      let golden=false; if(S._goldenSpawned<S.golden && rng()<0.5){ golden=true; S._goldenSpawned++; }
      S.items.push({ring:ring,a:a,type:'gem',born:S.t,golden:golden}); return;
    }
  }

  S.step=function(dt,rng){ if(!S.alive) return {collected:[],hit:false,shieldUsed:false,lifeLost:false,crossed:false}; rng=rng||Math.random;
    S.t+=dt; S._tapCool=Math.max(0,S._tapCool-dt); if(S.invuln>0)S.invuln=Math.max(0,S.invuln-dt); S.omega+=S.cfg.grow*dt;
    let crossed=false;
    if(S.cross){
      if(S.cross.sp<1){                                             // GLIDE phase: slide along the ring to br.a
        S.cross.sp=Math.min(1,S.cross.sp+dt/S.cross.sdur);
        S.angle=(S.cross.sp>=1)?S.cross.a1:mod2(S.cross.a0+sdist(S.cross.a0,S.cross.a1)*easeIO(S.cross.sp));
      } else {                                                      // JUMP phase: radial transit to the other ring
        S.cross.p+=dt/S.cross.dur;
        if(S.cross.p>=1){ S.angle=S.cross.a1; S.ring=S.cross.to; S.cross=null; S._tapCool=Math.max(S._tapCool,80); crossed=true; }
      }
    }
    if(S.spawnEnabled){ S._spikeT-=dt; if(S._spikeT<=0){ S._spikeT=S.cfg.spikeEvery; spawn('spike',rng); }
      S._gemT-=dt; if(S._gemT<=0){ S._gemT=S.cfg.gemEvery; spawn('gem',rng); }
      S._powerT-=dt; if(S._powerT<=0){ S._powerT=S.cfg.powerEvery; spawn('power',rng); } }
    // the whole cross (glide + radial jump) is a safe transit: the angle is driven above and collisions
    // are off, so the leap always departs & lands ON the drawn bridge line — no before/after, no teleport.
    const delta=S.cross?0:S.omega*dt, prev=S.angle;
    if(!S.cross) S.angle=mod2(S.angle + S.dir*delta);
    const collected=[]; let hit=false, shieldUsed=false, lifeLost=false; const keep=[];
    for(const it of S.items){
      if(it.ring===S.ring && !S.cross){                              // collisions only on the current ring (safe in transit)
        const f=mod2(S.dir*(it.a-prev)), crossedIt=(f>1e-6 && f<=delta);
        if(crossedIt){ if(it.type==='gem'){ S.score++; if(it.golden)S.goldenGot++; collected.push(it); }
          else if(it.type==='power'){ collected.push(it); }
          else { if(S.invuln>0){ keep.push(it); } else if(S.shield>0){ S.shield--; shieldUsed=true; S.invuln=600; } else if(S.lives>0){ S.lives--; lifeLost=true; S.invuln=1000; } else { hit=true; S.alive=false; keep.push(it); } }
          continue; } }
      if(S.t-it.born < 9000) keep.push(it);                          // items expire after 9s
    }
    S.items=keep; return {collected:collected, hit:hit, shieldUsed:shieldUsed, lifeLost:lifeLost, crossed:crossed};
  };

  S.progress=function(){ return S.target?Math.min(1,S.score/S.target):0; };
  S.isWin=function(){ return S.alive && S.score>=S.target; };
  S.isDead=function(){ return !S.alive; };
  S.stars=function(){ if(!S.golden) return S.isWin()?3:1; if(S.goldenGot>=S.golden)return 3; if(S.goldenGot>=1)return 2; return 1; };
  // dot's visual radius factor right now (eases between rings during a crossing)
  S.dotRF=function(){ if(!S.cross) return S.rings[S.ring]; const p=S.cross.p, e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2; return S.rings[S.cross.from]+(S.rings[S.cross.to]-S.rings[S.cross.from])*e; };
  return S;
}
const api={config, create, mod2, adist};
if(typeof module!=='undefined' && module.exports) module.exports=api;
root.OrbitRingsEngine=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:this));
