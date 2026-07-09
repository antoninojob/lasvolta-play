/* LVT telemetry — pure, DOM-free. window.LvtTelemetry / require().
   Playtest telemetry for the prototypes: events go into a localStorage-backed queue and are
   auto-sent (batched) to a Google Apps Script endpoint that appends rows to a Google Sheet.
   Offline-safe: unsent events stay queued and retry at the next session/flush. A manual export
   string (LVT1|...) remains as fallback so a tester can paste their stats in a chat.
   Everything is injected (storage, now, rand, sender) so the module is deterministic and
   testable in Node like the engines. No personal data: one random anonymous tester id. */
(function(root){
"use strict";

// Set this to the Apps Script Web App URL to enable auto-send (empty = queue only, no network).
const ENDPOINT='';

const TESTER_KEY='lvt_tester_v1';
const QUEUE_CAP=400;    // oldest events are dropped past this (agg stays correct: it's updated on add)
const BATCH_MAX=120;    // events per POST (keepalive bodies must stay small)

function dayOf(t){ return Math.floor(t/86400000); }

function freshAgg(){ return {firstDay:null,days:[],sessions:0,runs:0,wins:0,fails:0,maxLevel:0,best:0,ms:0,dropped:0}; }

function applyAgg(agg,ev){
  const d=dayOf(ev.t);
  if(agg.firstDay==null||d<agg.firstDay)agg.firstDay=d;
  if(agg.days.indexOf(d)<0)agg.days.push(d);
  if(ev.e==='session_start')agg.sessions++;
  else if(ev.e==='run_start')agg.runs++;
  else if(ev.e==='run_end'){
    if(ev.outcome==='win')agg.wins++; else if(ev.outcome==='fail')agg.fails++;
    if(typeof ev.level==='number'&&ev.mode!=='zen'&&ev.level>agg.maxLevel)agg.maxLevel=ev.level;
    if(typeof ev.score==='number'&&ev.score>agg.best)agg.best=ev.score;
    if(typeof ev.dur==='number')agg.ms+=ev.dur;
  }
}

function makeTesterId(rand){ let s=''; for(let i=0;i<8;i++)s+='0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rand()*36)%36]; return s; }

function create(opts){
  const game=opts.game, build=opts.build||0, storage=opts.storage, rand=opts.rand||Math.random;
  const KEY='lvt_tm_'+game+'_v1';
  function sget(k){ try{return storage.getItem(k);}catch(e){return null;} }
  function sset(k,v){ try{storage.setItem(k,v);}catch(e){} }

  let st=null;
  try{ st=JSON.parse(sget(KEY)); }catch(e){ st=null; }
  if(!st||!st.agg||!st.queue) st={seq:0,agg:freshAgg(),queue:[]};

  let tester=sget(TESTER_KEY);
  if(!tester){ tester=makeTesterId(rand); sset(TESTER_KEY,tester); }

  const T={tester:tester,game:game,build:build,_inflight:false};
  function persist(){ sset(KEY,JSON.stringify(st)); }

  T.event=function(name,data,now){
    const ev={q:++st.seq,t:now,e:name};
    if(data)for(const k in data)ev[k]=data[k];
    applyAgg(st.agg,ev);
    st.queue.push(ev);
    while(st.queue.length>QUEUE_CAP){ st.queue.shift(); st.agg.dropped++; }
    persist(); return ev;
  };

  T.pending=function(){ return st.queue.length; };

  // Delivers queued events in batches via sender(batch)->Promise<bool>; events are removed only
  // on confirmed success, so a failed/killed send just retries later (at-least-once: the sheet
  // may see duplicates, dedupe by tester+q if needed).
  T.flush=function(sender){
    if(T._inflight||!st.queue.length) return Promise.resolve(false);
    T._inflight=true; let sent=false;
    function step(rounds){
      if(!st.queue.length||rounds<=0) return Promise.resolve(sent);
      const events=st.queue.slice(0,BATCH_MAX);
      const batch={v:1,tester:tester,game:game,build:build,events:events};
      return Promise.resolve().then(()=>sender(batch)).then(ok=>{
        if(!ok) return sent;
        const last=events[events.length-1].q;
        st.queue=st.queue.filter(ev=>ev.q>last); persist(); sent=true;
        return step(rounds-1);
      },()=>sent);
    }
    return step(5).then(r=>{T._inflight=false;return r;},e=>{T._inflight=false;throw e;});
  };

  T.summary=function(){
    const a=st.agg;
    return { game:game, build:build, tester:tester,
      days:a.days.length, d1:a.firstDay!=null&&a.days.indexOf(a.firstDay+1)>=0,
      sessions:a.sessions, runs:a.runs, wins:a.wins, fails:a.fails,
      maxLevel:a.maxLevel, best:a.best, minutes:Math.round(a.ms/60000),
      pending:st.queue.length, dropped:a.dropped };
  };

  T.exportString=function(){
    const s=T.summary();
    return 'LVT1|'+game+'|v'+build+'|id:'+tester+'|days:'+s.days+'|d1:'+(s.d1?'si':'no')
      +'|sess:'+s.sessions+'|runs:'+s.runs+'|win:'+s.wins+'|maxlvl:'+s.maxLevel
      +'|best:'+s.best+'|min:'+s.minutes;
  };

  T.exportJSON=function(){ return JSON.stringify({tester:tester,game:game,build:build,agg:st.agg,queue:st.queue}); };

  return T;
}

// Real network sender for the browser. keepalive lets the request survive tab close, so the
// same sender works for the visibilitychange flush too. Body is text/plain: a "simple" request,
// no CORS preflight (Apps Script can't answer preflights).
function makeSender(endpoint){
  if(!endpoint||typeof fetch==='undefined') return function(){ return Promise.resolve(false); };
  return function(batch){
    return fetch(endpoint,{method:'POST',keepalive:true,headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(batch)})
      .then(r=>r.ok||r.type==='opaque'||r.type==='opaqueredirect',()=>false);
  };
}

const api={ENDPOINT:ENDPOINT,create:create,makeSender:makeSender,dayOf:dayOf};
if(typeof module!=='undefined' && module.exports) module.exports=api;
root.LvtTelemetry=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:this));
