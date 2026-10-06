/* İşlem Yok — BTMM|TDI göstergesi (The_Trading_Jedi, Pine v5) strateji testi
   Pine kaynağındaki hesapların nedensel kopyası: i. bardaki her değer yalnız 0..i barlarına bağlı.

   KURALLAR (sonucu görmeden yazıldı, sonradan değişmez):
     Bileşenler (gösterge varsayılanları): RSI 21 (Wilder/RMA), r_plot=SMA2(RSI), TL=SMA7(RSI),
       BL=SMA34(RSI); MZL = DEMA12−DEMA26; EMA skoru: kapanış ve EMA 13/50/200/800'ün 10 ikili
       karşılaştırması (−10..+10); HTF eğilimi: 3× zaman diliminde (1h→3h) r_plot>TL, yalnız
       KAPANMIŞ HTF barı.
     tdi_x    : TL, BL'yi yukarı keser → long; aşağı keser → short (göstergenin alarmı).
     tdi_full : tdi_x + MZL aynı işaret + EMA skoru aynı işaret + HTF eğilimi aynı yön.
     *_vol    : (2026-10-06 eki) yukarıdakilere ek koşul — kesişme barının hacmi > SMA20(hacim)
                (Pine: volume > ta.sma(volume, 20)). Hacim yoksa işlem yok.
     Giriş kesişme barının kapanışı; ufuk 1 gün, stop 1σ·√ufuk (nedensel EWMA vol), hedef 2×stop,
     TP1'de yarım + stop girişe (replay.js). Maliyet 22bp gidiş-dönüş. Açık sym+yön varken yeniden
     açmaz, ters sinyal açığı kapatır (walkForward ile aynı).
     Kabul: strategies.js ile aynı — n≥30 ∧ t≥2.5 ∧ iki yarı>0 ∧ p_şans≤0.02.

   CLI:
     node tdi.js --sentetik [--seed 7]           # gürültü / zayıf trend / güçlü trend senaryoları
     node tdi.js --offline --pages 40 [--tf 1h]  # gerçek veri (CACHE_DIR önbelleği)
     --syms BTCUSDT                              # varlık alt kümesi (varsayılan: 10 varlık)      */
'use strict';
const {mkPlan,ewmaVol,runPlans,compareReport}=require('./strategies');
const {TFMS}=require('./backtest');
const {ASSETS}=require('./engine');

const PD={'1h':24,'4h':6,'1d':1};
const RULES={tdi_x:{hzDays:1,rm:2,full:false},tdi_full:{hzDays:1,rm:2,full:true},
  tdi_x_vol:{hzDays:1,rm:2,full:false,vol:true},tdi_full_vol:{hzDays:1,rm:2,full:true,vol:true}};

/* ---- Pine yardımcıları (na → NaN) ---- */
function sma(x,L){const o=new Float64Array(x.length).fill(NaN);let s=0,c=0;
  for(let i=0;i<x.length;i++){
    if(!isFinite(x[i])){s=0;c=0;continue;}
    s+=x[i];c++;if(c>L){s-=x[i-L];c=L;}
    if(c===L)o[i]=s/L;}
  return o;}
/* ta.ema / ta.rma: ilk değer SMA ile tohumlanır */
function emaA(x,L,alpha){const o=new Float64Array(x.length).fill(NaN);let prev=NaN,s=0,c=0;
  for(let i=0;i<x.length;i++){const v=x[i];if(!isFinite(v))continue;
    if(!isFinite(prev)){s+=v;c++;if(c===L){prev=s/L;o[i]=prev;}continue;}
    prev=alpha*v+(1-alpha)*prev;o[i]=prev;}
  return o;}
const ema=(x,L)=>emaA(x,L,2/(L+1)), rma=(x,L)=>emaA(x,L,1/L);
function rsi(c,L){const n=c.length,up=new Float64Array(n).fill(NaN),dn=new Float64Array(n).fill(NaN);
  for(let i=1;i<n;i++){const d=c[i]-c[i-1];up[i]=Math.max(d,0);dn[i]=Math.max(-d,0);}
  const u=rma(up,L),d=rma(dn,L),o=new Float64Array(n).fill(NaN);
  for(let i=0;i<n;i++)if(isFinite(u[i])&&isFinite(d[i]))o[i]=d[i]===0?100:u[i]===0?0:100-100/(1+u[i]/d[i]);
  return o;}
const sgn=(a,b)=>a>b?1:a<b?-1:0;

/* ---- gösterge: bars → bar başına sinyal bileşenleri ---- */
function compute(bars,ms){
  const n=bars.length,c=bars.map(b=>b.c);
  const r=rsi(c,21),rp=sma(r,2),tl=sma(r,7),bl=sma(r,34);
  const dema=L=>{const e=ema(c,L),ee=ema(e,L);return e.map((v,i)=>2*v-ee[i]);};
  const d12=dema(12),d26=dema(26);
  const E=[13,50,200,800].map(L=>ema(c,L));
  const cross=new Int8Array(n),mzl=new Int8Array(n),score=new Float64Array(n).fill(NaN),htf=new Int8Array(n);
  for(let i=1;i<n;i++){
    if(tl[i]>bl[i]&&tl[i-1]<=bl[i-1])cross[i]=1;
    else if(tl[i]<bl[i]&&tl[i-1]>=bl[i-1])cross[i]=-1;
    const m=d12[i]-d26[i];mzl[i]=m>0?1:m<0?-1:0;
    if(E.every(e=>isFinite(e[i]))){const y=E.map(e=>e[i]);let s=0;
      for(const v of y)s+=sgn(c[i],v);
      for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)s+=sgn(y[a],y[b]);
      score[i]=s;}}
  /* HTF (3×): kovalar floor(t/3ms); kova, son alt barının kapanışında kapanır ve o andan
     itibaren görünür. Önceki barlarda bir önceki kapanmış kova kullanılır (Pine lookahead_off) */
  const HM=3*ms,hc=[],hEnd=[];
  for(let i=0;i<n;i++)if(Math.floor((bars[i].t+ms)/HM)!==Math.floor(bars[i].t/HM)){hc.push(c[i]);hEnd.push(i);}
  const hr=rsi(hc,21),hrp=sma(hr,2),htl=sma(hr,7);
  let j=-1;
  for(let i=0;i<n;i++){while(j+1<hEnd.length&&hEnd[j+1]<=i)j++;
    if(j>=0&&isFinite(hrp[j])&&isFinite(htl[j]))htf[i]=hrp[j]-htl[j]>0?1:-1;}
  const v=bars.map(b=>b.v==null?NaN:+b.v),vs=sma(v,20),volOk=new Int8Array(n);
  for(let i=0;i<n;i++)volOk[i]=v[i]>vs[i]?1:0;
  return {cross,mzl,score,htf,volOk,rsi:r,tl,bl};
}

/* tek bar için yön kararı */
function signalAt(I,i,full,vol){
  const s=I.cross[i];if(!s)return 0;
  if(vol&&!I.volOk[i])return 0;
  if(!full)return s;
  return I.mzl[i]===s&&Math.sign(I.score[i])===s&&I.htf[i]===s?s:0;
}

/* ---- olay tabanlı plan listesi (dedupe + ters sinyalde kapatma, walkForward ile aynı) ----
   sigFor(bars,ms) → (i)=>yön; i. bar kapanışında yalnız 0..i barlarıyla karar. Diğer göstergeler de kullanır. */
function eventPlans(name,def,rowsBySym,tf,sigFor,o={}){
  const pd=PD[tf],ms=TFMS[tf],hz=def.hzDays*pd,warm=o.warmup==null?2000:o.warmup;
  const disp=Object.fromEntries(ASSETS),ev=[];
  for(const sym in rowsBySym){const b=rowsBySym[sym];if(!b||b.length<warm+2)continue;
    const sig=sigFor(b,ms),vol=ewmaVol(b);
    for(let i=warm;i<b.length;i++){const s=sig(i);
      if(s&&vol[i]>0)ev.push({sym,i,side:s,T:b[i].t,P0:b[i].c,v:vol[i]});}}
  ev.sort((a,b)=>a.T-b.T);
  const plans=[],open={};
  for(const e of ev){const key=e.sym+'|'+e.side,opp=e.sym+'|'+(-e.side);
    if(open[key]&&open[key].t_end>e.T)continue;
    if(open[opp]&&open[opp].t_end>e.T){open[opp].t_end=e.T;delete open[opp];}
    const p=mkPlan(e.sym,disp[e.sym]||e.sym,e.side,e.P0,e.T,hz,ms,def.rm,e.v,name);
    plans.push(p);open[key]=p;}
  return plans;
}
function tdiPlans(name,rowsBySym,tf,o={}){
  const def=RULES[name];if(!def)throw new Error('kural yok: '+name);
  return eventPlans(name,def,rowsBySym,tf,(b,ms)=>{const I=compute(b,ms);return i=>signalAt(I,i,def.full,def.vol);},o);
}

function runTdi(name,rowsBySym,tf,o={}){
  return runPlans(name,tdiPlans(name,rowsBySym,tf,o),rowsBySym,{controls:o.controls});
}

module.exports={RULES,PD,sma,ema,rma,rsi,compute,signalAt,eventPlans,tdiPlans,runTdi};

if(require.main===module){
  (async()=>{
    const fs=require('fs'),eng=require('./engine'),{runStrategy}=require('./strategies');
    const a=process.argv.slice(2),opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;},has=k=>a.includes(k);
    const tf=opt('--tf','1h'),controls=+opt('--controls',50);
    const syms=opt('--syms')?opt('--syms').toUpperCase().split(','):null;
    const pick=rows=>syms?Object.fromEntries(Object.entries(rows).filter(([s])=>syms.includes(s))):rows;
    const names=Object.keys(RULES),bench=['donch20','tsmom20'];
    const run=(rows,title)=>{const res=[];
      for(const n of names)res.push(runTdi(n,rows,tf,{controls}));
      if(!has('--no-bench'))for(const n of bench)res.push(runStrategy(n,rows,tf,{step:PD[tf],warmup:2000,controls}));
      console.log(`\n## ${title}\n`+compareReport(res));};
    if(has('--sentetik')){
      const {senaryo}=require('./sentetik'),seed=+opt('--seed',7),N=+opt('--bars',40000);
      for(const [title,drift] of [['Gürültü (trend yok)',0],['Zayıf trend rejimleri (±%0.5/gün)',0.005],['Güçlü trend rejimleri (±%1.5/gün)',0.015]])
      {const rows=pick(senaryo({seed,bars:N,driftPerDay:drift,tf}));
        run(rows,title+` · ${N} bar ${tf} × ${Object.keys(rows).length} varlık`);}
      return;}
    const pages=opt('--pages')?+opt('--pages'):undefined,rows={};
    for(const [sym,disp] of eng.ASSETS.filter(([s])=>!syms||syms.includes(s))){
      if(has('--offline')){try{rows[sym]=JSON.parse(fs.readFileSync(eng.cacheFile(sym,tf,pages),'utf8'));}catch(e){console.error(`${disp}: önbellek yok`);}}
      else{process.stderr.write(`${disp} verisi…\n`);rows[sym]=await eng.klines(sym,tf,pages);}}
    run(rows,`Gerçek veri ${tf} · ${Object.keys(rows).join(',')} · ${Object.values(rows).map(r=>r.length+' bar, '+new Date(r[0].t).toISOString().slice(0,10)+' → '+new Date(r[r.length-1].t).toISOString().slice(0,10)).join(' | ')}`);
  })().catch(e=>{console.error(e.stack||e.message||e);process.exit(1);});
}
