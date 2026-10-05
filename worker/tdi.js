/* İşlem Yok — TDI (Traders Dynamic Index, Dean Malone) testi
   TDI: RSI(13, Wilder) → yeşil = SMA(RSI,2), kırmızı = SMA(RSI,7), taban (beyaz/sarı) = SMA(RSI,34).
   Göstergeler i'ye kadarki barlarla hesaplanır (nedensel); karar i barının KAPANIŞINDA, giriş = o kapanış.

   KURAL (koşmadan önce sabitlendi, sonuca göre değiştirilmez):
     LONG : yeşil kırmızıyı yukarı keser (y[i-1]≤k[i-1] ∧ y[i]>k[i]) ∧ yeşil > taban ∧ yeşil > 50
     SHORT: ayna (aşağı keser ∧ yeşil < taban ∧ yeşil < 50)
     tdi   : laboratuvarın ortak makinesi — 1 günlük ufuk, 1σ stop, 1.5R hedef (TP1 1R'de yarı kapanış)
     tdi_x : klasik TDI çıkışı — yeşil kırmızıyı TERS yönde kestiği barın kapanışında çık; en fazla 5 gün;
             felaket stopu 5 günlük 1σ (R birimi de bu). Hedef yok.
   Aynı varlık+yön açıkken yeni plan açılmaz; ters sinyal açık planı o anda kapatır (walkForward ile aynı).
   Maliyet: çift yön 22bp (replay.netR). Şans: strategies.evaluate (aynı planlar, yön rastgele, K tekrar).
   KARAR (laboratuvarla aynı): n≥30 ∧ t≥2.5 ∧ iki yarı ort.R>0 ∧ p_şans≤0.02 → GEÇTİ.

   node tdi.js [--tf 1h|4h] [--pages 40] [--offline] [--controls 50] [--csv out.csv] */
'use strict';
const {ASSETS}=require('./engine');
const {TFMS}=require('./backtest');
const {ewmaVol,runPlans,compareReport}=require('./strategies');

const PD={'1h':24,'4h':6,'1d':1};

function rsiWilder(c,n=13){
  const out=new Float64Array(c.length).fill(NaN);
  if(c.length<=n)return out;
  let g=0,l=0;
  for(let i=1;i<=n;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d;}
  g/=n;l/=n;out[n]=l===0?100:100-100/(1+g/l);
  for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];
    g=(g*(n-1)+(d>0?d:0))/n;l=(l*(n-1)+(d<0?-d:0))/n;
    out[i]=l===0?100:100-100/(1+g/l);}
  return out;
}
function sma(x,n){
  const out=new Float64Array(x.length).fill(NaN);let s=0,k=0;
  for(let i=0;i<x.length;i++){
    if(!isFinite(x[i])){s=0;k=0;continue;}
    s+=x[i];k++;
    if(k>n){s-=x[i-n];k=n;}
    if(k===n)out[i]=s/n;}
  return out;
}
function computeTDI(bars){
  const rsi=rsiWilder(bars.map(b=>b.c),13);
  return {rsi,green:sma(rsi,2),red:sma(rsi,7),base:sma(rsi,34)};
}

/* i barında sinyal: +1 / −1 / 0 (yalnız i ve i−1 kullanılır) */
function signalAt(T,i){
  const {green:g,red:r,base:b}=T;
  if(i<1||![g[i],g[i-1],r[i],r[i-1],b[i]].every(isFinite))return 0;
  if(g[i-1]<=r[i-1]&&g[i]>r[i]&&g[i]>b[i]&&g[i]>50)return 1;
  if(g[i-1]>=r[i-1]&&g[i]<r[i]&&g[i]<b[i]&&g[i]<50)return -1;
  return 0;
}
/* tdi_x çıkışı: i'den sonra yeşilin kırmızıyı ters yönde kestiği ilk bar (en fazla maxBars) */
function exitIdx(T,i,side,maxBars,n){
  const {green:g,red:r}=T,end=Math.min(n-1,i+maxBars);
  for(let k=i+1;k<=end;k++){
    if(!isFinite(g[k])||!isFinite(r[k]))continue;
    if(side>0&&g[k-1]>=r[k-1]&&g[k]<r[k])return k;
    if(side<0&&g[k-1]<=r[k-1]&&g[k]>r[k])return k;}
  return end;
}

function tdiPlans(rowsBySym,tf,variant='tdi',{warmup=200,from=null}={}){
  const pd=PD[tf],ms=TFMS[tf],disp=Object.fromEntries(ASSETS);
  const cand=[];
  for(const sym in rowsBySym){
    const bars=rowsBySym[sym];if(!bars||bars.length<warmup+2)continue;
    const T=computeTDI(bars),vol=ewmaVol(bars);
    for(let i=warmup;i<bars.length-1;i++){
      if(from&&bars[i].t<from)continue;
      const side=signalAt(T,i);if(!side)continue;
      const v=vol[i];if(!(v>0))continue;
      const P0=bars[i].c,t0=bars[i].t;
      if(variant==='tdi'){
        const hz=1*pd,rm=1.5,dStop=Math.max(1e-4,v*Math.sqrt(hz));
        cand.push({sym,disp:disp[sym]||sym,side,entry:P0,sl:P0*Math.exp(-side*dStop),tp1:P0*Math.exp(side*dStop),
          tp2:P0*Math.exp(side*rm*dStop),rm,d_stop:dStop,hz,t0,t_end:t0+hz*ms,strat:variant});
      }else{
        const maxB=5*pd,e=exitIdx(T,i,side,maxB,bars.length),dStop=Math.max(1e-4,v*Math.sqrt(maxB)),rm=50;
        cand.push({sym,disp:disp[sym]||sym,side,entry:P0,sl:P0*Math.exp(-side*dStop),tp1:null,
          tp2:P0*Math.exp(side*rm*dStop),rm,d_stop:dStop,hz:e-i,t0,t_end:bars[e].t,strat:variant});}}}
  /* zaman sırası + tekrar koruması (walkForward ile aynı): aynı yön açıksa atla, ters yön açığı o anda kapatır */
  cand.sort((a,b)=>a.t0-b.t0||(a.sym<b.sym?-1:1));
  const open={},plans=[];
  for(const p of cand){
    const key=p.sym+'|'+p.side,opp=p.sym+'|'+(-p.side);
    if(open[key]&&open[key].t_end>p.t0)continue;
    if(open[opp]&&open[opp].t_end>p.t0){open[opp].t_end=p.t0;delete open[opp];}
    plans.push(p);open[key]=p;}
  return plans;
}

module.exports={rsiWilder,sma,computeTDI,signalAt,exitIdx,tdiPlans};

if(require.main===module){
  (async()=>{
    const fs=require('fs'),eng=require('./engine');
    const a=process.argv.slice(2),opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;},has=k=>a.includes(k);
    const tf=opt('--tf','1h');if(!PD[tf]){console.error('tf: 1h|4h|1d');process.exit(2);}
    const pages=opt('--pages')?+opt('--pages'):undefined,controls=+opt('--controls',50);
    const rowsBySym={};
    for(const [sym,disp] of eng.ASSETS){
      if(has('--offline')){try{rowsBySym[sym]=JSON.parse(fs.readFileSync(eng.cacheFile(sym,tf,pages),'utf8'));}catch(e){console.error(`${disp}: önbellek yok`);}}
      else{process.stderr.write(`${disp} ${tf} verisi…\n`);rowsBySym[sym]=await eng.klines(sym,tf,pages);}}
    const span=Object.values(rowsBySym).filter(r=>r&&r.length).map(r=>[r[0].t,r[r.length-1].t]);
    const d=t=>new Date(t).toISOString().slice(0,10);
    console.log(`TDI testi · ${tf} · ${Object.keys(rowsBySym).length} varlık · ${d(Math.min(...span.map(x=>x[0])))} → ${d(Math.max(...span.map(x=>x[1])))}`);
    const results=[];
    for(const v of ['tdi','tdi_x']){
      const plans=tdiPlans(rowsBySym,tf,v);
      const r=runPlans(`${v}_${tf}`,plans,rowsBySym,{controls});
      process.stderr.write(`${v}_${tf}: ${plans.length} plan, n=${r.n} toplam ${r.totalR.toFixed(2)}R t=${r.t.toFixed(2)} p=${r.p}\n`);
      results.push(r);}
    console.log(compareReport(results));
    if(opt('--csv'))fs.writeFileSync(opt('--csv'),'strat,t0,sym,side,state,R,bars\n'+
      results.flatMap(r=>r.rows.map(x=>[r.name,new Date(x.t0).toISOString(),x.sym,x.side,x.state,x.R.toFixed(4),x.bars].join(','))).join('\n')+'\n');
  })().catch(e=>{console.error(e.stack||e.message||e);process.exit(1);});
}
