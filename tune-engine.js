/* TUNE engine — pure, DOM-free. Usable in browser (window.TuneEngine) and Node (require). */
(function(root){
"use strict";
function norm(a){ while(a>Math.PI)a-=2*Math.PI; while(a<-Math.PI)a+=2*Math.PI; return a; }
const RATIOS=[-1,-0.6,0.6,1];
function config(L){
  const count=Math.min(3+Math.floor(L/2),7);
  const tol=Math.max(0.05, 0.13 - L*0.007); // tight lock window: must be consciously close, not lucky-far
  const nLinks = L>=3 ? Math.min(Math.floor((L-1)/2), Math.floor(count/2)) : 0;
  return {count, tol, nLinks, drift:L>=5, perTarget:L>=8};
}
function create(){
  const S={rings:[], tol:0.18, cfg:null};
  S.setup=function(L,rng){ rng=rng||Math.random; const cfg=config(L); S.cfg=cfg; S.tol=cfg.tol; S.rings=[];
    for(let i=0;i<cfg.count;i++){ let off; do{ off=(rng()*2-1)*Math.PI; }while(Math.abs(off)<0.6);
      const tgt = cfg.perTarget && i>0 ? (rng()*2-1)*Math.PI : 0;
      S.rings.push({idx:i, angle:off, target:tgt, locked:false, link:-1, ratio:0, drift:0}); }
    const pool=[]; for(let k=0;k<S.rings.length;k++) pool.push(k);
    for(let l=0;l<cfg.nLinks;l++){ if(pool.length<2)break;
      const a=pool.splice(Math.floor(rng()*pool.length),1)[0];
      const b=pool.splice(Math.floor(rng()*pool.length),1)[0];
      S.rings[a].link=b; S.rings[a].ratio=RATIOS[Math.floor(rng()*RATIOS.length)]; }
    if(cfg.drift){ const d=S.rings[Math.floor(rng()*S.rings.length)]; d.drift=(rng()<0.5?-1:1)*0.00024; }
    return S.rings; };
  S.rotate=function(i,delta){ const r=S.rings[i]; if(!r||r.locked)return; r.angle=norm(r.angle+delta);
    if(r.link>=0){ const t=S.rings[r.link]; if(t&&!t.locked) t.angle=norm(t.angle+delta*r.ratio); } };
  S.release=function(){ const out=[]; for(let i=0;i<S.rings.length;i++){ const r=S.rings[i]; if(r.locked)continue;
    const dlt=Math.abs(norm(r.angle-r.target)); if(dlt<S.tol){ r.angle=r.target; r.locked=true; out.push({i:i, perfect:dlt<S.tol*0.30, prec:Math.max(0,1-dlt/S.tol)}); } } return out; };
  S.distToTarget=function(i){ const r=S.rings[i]; return Math.abs(norm(r.angle-r.target)); };
  S.stepDrift=function(dt,skip,enabled){ if(enabled===false)return; for(let i=0;i<S.rings.length;i++){ const r=S.rings[i]; if(!r.locked&&r.drift&&i!==skip) r.angle=norm(r.angle+r.drift*dt); } };
  S.isWin=function(){ return S.rings.length>0 && S.rings.every(function(r){return r.locked;}); };
  return S;
}
const api={norm, config, create, RATIOS};
if(typeof module!=='undefined' && module.exports) module.exports=api;
root.TuneEngine=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:this));
