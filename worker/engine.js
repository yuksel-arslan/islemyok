/* İşlem Yok — tarama motoru (islemyok.com'daki modelin sunucu kopyası)
   Kaynak: aralik-terminali index.html; model kodu engine_core.js'e dilimlenir. */
'use strict';
const fs=require('fs'),path=require('path');

/* tarayıcı API stub'ları (engine_core tarayıcıdan dilimlendiği için) */
globalThis.say=()=>{};
globalThis.document={getElementById:()=>null};   // tCost -> varsayılan 11bp
globalThis.sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* çekirdeği yükle ('use strict' altında dogrudan eval sızdırmaz; Function ile dışa aktar) */
const _core={};
new Function('say','document','sleep','__x',
  fs.readFileSync(path.join(__dirname,'engine_core.js'),'utf8')+
  '\n;__x.computeCore=computeCore;__x.evalCombo=evalCombo;'
)(globalThis.say,globalThis.document,globalThis.sleep,_core);
const computeCore=_core.computeCore, evalCombo=_core.evalCombo;

const TFC={"1h":{ms:36e5,perDay:24,pages:11},"4h":{ms:144e5,perDay:6,pages:6},"1d":{ms:864e5,perDay:1,pages:3}};
const ASSETS=[["BTCUSDT","BTC"],["ETHUSDT","ETH"],["SOLUSDT","SOL"],["BNBUSDT","BNB"],
 ["XRPUSDT","XRP"],["DOGEUSDT","DOGE"],["ADAUSDT","ADA"],["LINKUSDT","LINK"],
 ["AVAXUSDT","AVAX"],["LTCUSDT","LTC"]];

/* ---- veri: Binance spot, disk önbelleği ile artımlı ---- */
const CACHE=process.env.CACHE_DIR||'/tmp/islemyok-cache';
fs.mkdirSync(CACHE,{recursive:true});
async function klines(sym,tf){
  const cfg=TFC[tf],file=path.join(CACHE,`kl-${sym}-${tf}.json`);
  let have=[];
  try{have=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){}
  const fetch1=async u=>{const r=await fetch(u);if(!r.ok)throw new Error('Binance '+r.status);return r.json();};
  if(have.length){
    let start=have[have.length-1].t;                  /* son bar yeniden (kapanmamış olabilir) */
    for(let g=0;g<cfg.pages;g++){
      const d=await fetch1(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000&startTime=${start}`);
      if(!d.length)break;
      const add=d.map(k=>({t:k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4]}));
      const last=have[have.length-1].t;
      const repl=add.find(x=>x.t===last);if(repl)have[have.length-1]=repl;
      for(const x of add)if(x.t>last)have.push(x);
      if(d.length<1000)break;
      start=d[d.length-1][0]+1;await sleep(80);}
  }else{
    const out=[];let end=null;
    for(let i=0;i<cfg.pages;i++){
      let u=`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000`;
      if(end)u+=`&endTime=${end}`;
      const d=await fetch1(u);if(!d.length)break;
      out.unshift(...d);end=d[0][0]-1;await sleep(80);}
    const seen=new Set();
    for(const k of out){if(seen.has(k[0]))continue;seen.add(k[0]);
      have.push({t:k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4]});}
  }
  have.sort((a,b)=>a.t-b.t);
  const trimmed=have.slice(-cfg.pages*1000);
  fs.writeFileSync(file,JSON.stringify(trimmed));
  return trimmed;
}

/* ---- piyasa taraması: aile-geneli şans eşiği (siteyle aynı mantık) ---- */
async function scanMarket(tf,log){
  log=log||(()=>{});
  const cfg=TFC[tf],perDay=cfg.perDay;
  const SIDES=[1,-1],QS=[0.05,0.10,0.25],RS=[1,1.5,2,3];
  const cores=[],fails=[];
  for(const [sym,disp] of ASSETS){
    try{
      log(`${disp} verisi…`);
      const rows=await klines(sym,tf);
      if(rows.length<perDay*260)throw new Error(`yetersiz veri (${rows.length})`);
      const CC=computeCore(rows,perDay,cfg.ms);
      if(!CC)throw new Error('kalibrasyon yetersiz');
      CC.sym=sym;CC.disp=disp;CC.tf=tf;cores.push(CC);
    }catch(e){fails.push(`${disp}: ${e.message}`);}
  }
  if(!cores.length)throw new Error('hiçbir varlık taranamadı: '+fails.join(' | '));
  const HZs=cores[0].HZ,combos=[];
  for(const sd of SIDES)for(const hz of HZs)for(const q of QS)for(const rm of RS)combos.push([sd,hz,q,rm]);
  log('gerçek tarama…');
  const perAsset=cores.map(S=>{
    const res=[];
    for(const [sd,hz,q,rm] of combos){
      const o=evalCombo(S,sd,hz,q,rm,1500,987654,false);if(o)res.push(o);}
    res.sort((a,b)=>b.ev-a.ev);return res;});
  log('aile-geneli şans eşiği…');
  const nullMax=[];
  for(let rep=0;rep<12;rep++){
    let best=-9;
    for(const S of cores)for(const [sd,hz,q,rm] of combos){
      const Nn=Math.max(300,Math.round(40000/hz));
      const o=evalCombo(S,sd,hz,q,rm,Nn,3000+rep*7919,true);
      if(o&&o.ev>best)best=o.ev;}
    nullMax.push(best);}
  nullMax.sort((a,b)=>a-b);
  const famHi=nullMax[nullMax.length-1],famMed=nullMax[Math.floor(nullMax.length/2)];
  /* iki kapi ayri ayri kaydedilir ki mesajda "neden elendi" dogru yazilabilsin:
     1) sans esigi (ev>famHi)  2) kendi hata payi (ev>2*se). Site ile ayni mantik. */
  const hits=[],tops=[];
  for(let ci=0;ci<cores.length;ci++){
    const t=perAsset[ci][0];
    if(!t){tops.push({disp:cores[ci].disp,ev:NaN,se:NaN,okChance:false,okErr:false});continue;}
    const okChance=t.ev>famHi, okErr=t.ev>2*t.se;
    tops.push({disp:cores[ci].disp,ev:t.ev,se:t.se,okChance,okErr});
    if(okChance&&okErr)hits.push({S:cores[ci],plan:t});}
  hits.sort((a,b)=>b.plan.ev-a.plan.ev);
  return {tf,cores:cores.length,combos:combos.length,famHi,famMed,hits,fails,tops};
}

/* plan seviyeleri (mesaj/grafik için) */
function planLevels(S,plan){
  const P0=S.P0,side=plan.side,dStop=plan.dStop,dTgt=dStop*plan.Rm;
  return {
    side, P0, Rm:plan.Rm, hz:plan.hz, tMed:plan.tMed, ev:plan.ev, se:plan.se,
    sl:P0*Math.exp(-side*dStop),
    tp1:plan.Rm>1?P0*Math.exp(side*dStop):null,
    tp2:P0*Math.exp(side*dTgt),
    stopPct:(1-Math.exp(-dStop))*100,
    dMed:plan.tMed/S.perDay, dMax:plan.hz/S.perDay,
    posPct:0.01/(1-Math.exp(-dStop))*100          /* risk %1 varsayımı */
  };
}
module.exports={scanMarket,planLevels,klines,ASSETS,TFC};
