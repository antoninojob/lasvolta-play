/* SPREAD engine v3 — pure, DOM-free. window.SpreadEngine / require().
   - Seed floods EMPTY cells only; BLOCKED by walls AND by filled cells (predictable, preview-able blobs).
   - No hard fail. `opt` = best solution found (multi-start greedy ~ true minimum). `par = opt + 1`,
     so reaching `opt` means finishing UNDER par (achievable + rewarded). Stars: 3 at/under opt, 2 within +2, else 1.
   - Difficulty accepts a DDA offset (adaptive). Walls are straight segments (rooms), not noise. */
(function(root){
"use strict";
function config(L){
  const g=Math.min(5+Math.floor((L-1)/2),9);
  const range=2;
  const walls = L<=1?0 : Math.min(1+Math.floor((L-1)/2), 6);
  return {g, range, walls};
}
function floodCells(N,range,si,sj,blocked){
  if(blocked(si,sj)) return [];
  const dist=[]; for(let r=0;r<N;r++) dist.push(new Array(N).fill(-1));
  dist[si][sj]=0; const q=[[si,sj]]; let head=0; const out=[{i:si,j:sj,dist:0}];
  while(head<q.length){ const cur=q[head++], ci=cur[0], cj=cur[1], d=dist[ci][cj]; if(d>=range)continue;
    const nb=[[ci+1,cj],[ci-1,cj],[ci,cj+1],[ci,cj-1]];
    for(let k=0;k<nb.length;k++){ const ni=nb[k][0],nj=nb[k][1];
      if(ni<0||nj<0||ni>=N||nj>=N)continue; if(dist[ni][nj]>=0)continue; if(blocked(ni,nj))continue;
      dist[ni][nj]=d+1; q.push([ni,nj]); out.push({i:ni,j:nj,dist:d+1}); } }
  return out;
}
function genWalls(grid,N,count,rng){
  for(let k=0;k<count;k++){ const horiz=rng()<0.5; const len=2+Math.floor(rng()*Math.min(3,N-2));
    if(horiz){ const r=1+Math.floor(rng()*(N-2)); const c0=Math.floor(rng()*Math.max(1,N-len)); for(let c=c0;c<c0+len&&c<N;c++) grid[r][c].type=1; }
    else { const c=1+Math.floor(rng()*(N-2)); const r0=Math.floor(rng()*Math.max(1,N-len)); for(let r=r0;r<r0+len&&r<N;r++) grid[r][c].type=1; } }
}
/* one greedy pass (optional rng = randomized tie-break for multi-start) */
function solveOnce(grid,N,range,rng){
  const fill=[]; for(let i=0;i<N;i++){ const row=[]; for(let j=0;j<N;j++) row.push(grid[i][j].type===1); fill.push(row); }
  const blocked=(i,j)=>fill[i][j]; const seq=[]; let guard=0;
  while(guard++<N*N+2){ const cand=[]; for(let i=0;i<N;i++)for(let j=0;j<N;j++) if(grid[i][j].type===0&&!fill[i][j]) cand.push([i,j]);
    if(!cand.length)break;
    if(rng){ for(let i=cand.length-1;i>0;i--){ const k=Math.floor(rng()*(i+1)); const t=cand[i];cand[i]=cand[k];cand[k]=t; } }
    let bestStart=null,bestCells=null,bestGain=-1;
    for(let c=0;c<cand.length;c++){ const cells=floodCells(N,range,cand[c][0],cand[c][1],blocked); if(cells.length>bestGain){ bestGain=cells.length; bestStart=cand[c]; bestCells=cells; } }
    if(!bestStart)break; for(let x=0;x<bestCells.length;x++) fill[bestCells[x].i][bestCells[x].j]=true; seq.push(bestStart); }
  return {par:seq.length, seq};
}
function solveBest(grid,N,range,rng){ let best=solveOnce(grid,N,range,null); for(let k=0;k<6;k++){ const r=solveOnce(grid,N,range,rng||Math.random); if(r.par<best.par) best=r; } return best; }
function create(){
  const S={gridN:5, range:2, grid:[], opt:0, par:0, used:0, optSeq:[], seq:[], goldenI:-1, goldenJ:-1};
  S.blocked=function(i,j){ const c=S.grid[i]&&S.grid[i][j]; return !c || c.type===1 || c.filled; };
  function finalizeSolve(rng){ const sol=solveBest(S.grid,S.gridN,S.range,rng); S.opt=sol.par; S.optSeq=sol.seq; S.seq=sol.seq; S.par=S.opt+1; S.used=0; }
  S.build=function(L,rng,dda){ rng=rng||Math.random; const cfg=config(L); const walls=Math.max(0,Math.min(8, cfg.walls+(dda||0))); let grid, open, tries=0;
    do{ S.gridN=cfg.g; S.range=cfg.range; grid=[]; open=[];
      for(let i=0;i<S.gridN;i++){ const row=[]; for(let j=0;j<S.gridN;j++) row.push({type:0,filled:false,golden:false}); grid.push(row); }
      genWalls(grid,S.gridN,walls,rng);
      for(let i=0;i<S.gridN;i++)for(let j=0;j<S.gridN;j++) if(grid[i][j].type===0) open.push([i,j]);
      tries++; }while(open.length<S.gridN && tries<30);
    S.grid=grid; finalizeSolve(rng);
    const gc=open[Math.floor(rng()*open.length)]; S.goldenI=gc[0]; S.goldenJ=gc[1]; grid[gc[0]][gc[1]].golden=true;
    return S; };
  S.setGrid=function(grid,range,rng){ S.gridN=grid.length; S.range=range||2; S.grid=grid; finalizeSolve(rng); S.goldenI=-1; S.goldenJ=-1; return S; };
  S.canPlace=function(i,j){ const c=S.grid[i]&&S.grid[i][j]; return !!(c && c.type===0 && !c.filled); };
  S.previewFill=function(i,j){ if(!S.canPlace(i,j))return []; return floodCells(S.gridN,S.range,i,j,S.blocked); };
  S.flood=function(i,j){ if(!S.canPlace(i,j))return []; const cells=floodCells(S.gridN,S.range,i,j,S.blocked);
    for(let k=0;k<cells.length;k++) S.grid[cells[k].i][cells[k].j].filled=true; S.used++; return cells; };
  S.openCount=function(){ let n=0; for(const row of S.grid)for(const c of row) if(c.type===0)n++; return n; };
  S.filledCount=function(){ let n=0; for(const row of S.grid)for(const c of row) if(c.type===0&&c.filled)n++; return n; };
  S.coverage=function(){ const o=S.openCount(); return o?S.filledCount()/o:0; };
  S.bestCell=function(){ let best=null,bg=-1; for(let i=0;i<S.gridN;i++)for(let j=0;j<S.gridN;j++){ if(!S.canPlace(i,j))continue; const n=S.previewFill(i,j).length; if(n>bg){bg=n;best=[i,j];} } return best; };
  S.stars=function(){ if(S.used<=S.opt)return 3; if(S.used<=S.opt+2)return 2; return 1; };
  S.resetFills=function(){ for(const row of S.grid)for(const c of row) c.filled=false; S.used=0; };
  S.isWin=function(){ return S.openCount()>0 && S.filledCount()===S.openCount(); };
  return S;
}
const api={config, create, floodCells};
if(typeof module!=='undefined' && module.exports) module.exports=api;
root.SpreadEngine=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:this));
