/* İşlem Yok — kural tabanlı strateji laboratuvarı
   Literatürde kripto için belgelenmiş dört aile, az parametre, aynı stop/hedef
   makinesi (ufuk-vol'e göre 1σ stop, rm×stop hedef), aynı oynatma (replay.js).
   Her strateji walk-forward'da çalışır: T anında yalnız T'ye kadarki barlar.

   ŞANS KONTROLÜ (işaret-rastgeleleme): gerçek stratejinin AYNI plan listesi, her
   planın yalnız yönü rastgele çevrilir, aynı giriş/vade/maliyetle oynatılır; K tekrar
   → gerçek toplam R'nin şans dağılımındaki yeri (p). İşlem sayısı ve maliyet birebir. KARAR KURALI (önceden, sonucu görmeden):
     GEÇTİ  ⇔  n ≥ 30  ∧  t ≥ 2.5  ∧  iki yarı da ort. R > 0  ∧  p_şans ≤ 0.02
   m strateji denendiği için t ve p eşiği tek testten sıkı tutuldu. */
'use strict';
const {walkForward,backtest,TFMS}=require('./backtest');
const {ASSETS}=require('./engine');
const F=require('./funding');

const PD={'1h':24,'4h':6,'1d':1};

/* nedensel EWMA vol (bar başına log-getiri std). i'ye kadar olan barlara bağlı → look-ahead yok */
function ewmaVol(bars,lambda=0.97,warm=50){
  const out=new Float64Array(bars.length).fill(NaN);let v=0;
  for(let i=1;i<bars.length;i++){const r=Math.log(bars[i].c/bars[i-1].c);
    v=i===1?r*r:lambda*v+(1-lambda)*r*r;if(i>=warm)out[i]=Math.sqrt(v);}
  return out;
}

function mkPlan(sym,disp,side,P0,T,hz,ms,rm,vol,label){
  const dStop=Math.max(1e-4,vol*Math.sqrt(hz));                 /* ufuk boyunca 1σ */
  return {sym,disp,side,entry:P0,sl:P0*Math.exp(-side*dStop),tp1:rm>1?P0*Math.exp(side*dStop):null,
          tp2:P0*Math.exp(side*rm*dStop),rm,d_stop:dStop,hz,t0:T,t_end:T+hz*ms,strat:label};
}

/* ---- strateji tanımları: (ctx)=>[{sym,side}] ; ctx: {bars(sym) prefix, i(sym) son indeks, pd} ---- */
const logRet=(b,i,L)=>i-L>=0?Math.log(b[i].c/b[i-L].c):NaN;

const STRATS={
  /* zaman-serisi momentum: L günlük getirinin işareti */
  tsmom20:{hzDays:5,rm:2,pick:(c)=>c.each((b,i,pd)=>{const r=logRet(b,i,20*pd);return r>0?1:r<0?-1:0;})},
  tsmom60:{hzDays:5,rm:2,pick:(c)=>c.each((b,i,pd)=>{const r=logRet(b,i,60*pd);return r>0?1:r<0?-1:0;})},
  /* Donchian kırılım: L günlük tavan/taban (son bar hariç) */
  donch20:{hzDays:5,rm:2,pick:(c)=>c.each((b,i,pd)=>donch(b,i,20*pd))},
  donch55:{hzDays:5,rm:2,pick:(c)=>c.each((b,i,pd)=>donch(b,i,55*pd))},
  /* kısa vadeli geri dönüş: 3 günlük z-skor uçtaysa ters yön */
  revert3:{hzDays:1,rm:1.5,pick:(c)=>c.each((b,i,pd,vol)=>{const L=3*pd,r=logRet(b,i,L);
    if(!isFinite(r)||!(vol>0))return 0;const z=r/(vol*Math.sqrt(L));return z<-2?1:z>2?-1:0;})},
  /* FONLAMA (perp carry): long'lar ödüyorsa short, tersi long. 3 gün tutuş; gerçekleşen
     fonlama ödemesi R'ye eklenir (perp:true). 24s ort = son 3 ödeme. */
  fund_pct:{hzDays:3,rm:1.5,perp:true,pick:(c)=>c.syms.map(s=>{const f=c.fund(s);if(!f)return null;
    const p=F.pctRank(f,c.T,3,270);return p>=0.9?{sym:s,side:-1}:p<=0.1?{sym:s,side:1}:null;}).filter(Boolean)},
  fund_abs:{hzDays:3,rm:1.5,perp:true,pick:(c)=>c.syms.map(s=>{const f=c.fund(s);if(!f)return null;
    const a=F.avgN(f,c.T,3);return a>=0.0003?{sym:s,side:-1}:a<=-0.0003?{sym:s,side:1}:null;}).filter(Boolean)},
  /* kesitsel momentum: 30 günlük getiriye göre ilk 3 long, son 3 short */
  xsmom30:{hzDays:5,rm:2,pick:(c)=>{
    const rs=c.syms.map(s=>[s,logRet(c.bars(s),c.i(s),30*c.pd)]).filter(x=>isFinite(x[1])).sort((a,b)=>b[1]-a[1]);
    if(rs.length<6)return [];
    return rs.slice(0,3).map(x=>({sym:x[0],side:1})).concat(rs.slice(-3).map(x=>({sym:x[0],side:-1})));}},
};
function donch(b,i,L){
  if(i-L<1)return 0;let hi=-Infinity,lo=Infinity;
  for(let k=i-L;k<i;k++){if(b[k].h>hi)hi=b[k].h;if(b[k].l<lo)lo=b[k].l;}
  return b[i].c>hi?1:b[i].c<lo?-1:0;
}

/* walkForward'a takılan üretici. rowsBySym TAM seri (vol nedensel, bir kez hesaplanır);
   generate yalnız sliced (önek) barlara bakar; indeks = sliced.length-1. */
function makeGenerator(name,tf,rowsBySym,opts={}){
  const def=STRATS[name];if(!def)throw new Error('strateji yok: '+name);
  const pd=PD[tf],ms=TFMS[tf],hz=def.hzDays*pd;
  const disp=Object.fromEntries(ASSETS);
  const vol={};for(const s in rowsBySym)vol[s]=ewmaVol(rowsBySym[s]);
  const rndSide=opts.randomSide?seeded(opts.seed||1):null;
  return (T,sliced)=>{
    const syms=Object.keys(sliced).filter(s=>sliced[s].length>1);
    const fb=opts.fundingBySym||{};
    const ctx={pd,syms,T,fund:s=>fb[s]||null,bars:s=>sliced[s],i:s=>sliced[s].length-1,
      each:(f)=>syms.map(s=>{const b=sliced[s],i=b.length-1;return {sym:s,side:f(b,i,pd,vol[s][i])};}).filter(x=>x.side)};
    const out=[];
    for(const {sym,side} of def.pick(ctx)){
      const b=sliced[sym],i=b.length-1,v=vol[sym][i];
      if(!(v>0))continue;
      const sd=rndSide?(rndSide()<0.5?-1:1):side;
      out.push(mkPlan(sym,disp[sym]||sym,sd,b[i].c,T,hz,ms,def.rm,v,name));}
    return out;
  };
}
function seeded(seed){let x=(seed|0)||1;return()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/4294967296;}

/* ---- istatistik ---- */
function tStat(R){const n=R.length;if(n<2)return 0;const m=R.reduce((a,b)=>a+b,0)/n;
  const sd=Math.sqrt(R.reduce((a,x)=>a+(x-m)*(x-m),0)/(n-1));return sd>0?m/(sd/Math.sqrt(n)):0;}
function halves(rows){const s=rows.slice().sort((a,b)=>a.t0-b.t0),h=Math.floor(s.length/2);
  const m=a=>a.length?a.reduce((x,r)=>x+r.R,0)/a.length:0;return [m(s.slice(0,h)),m(s.slice(h))];}
const KAPANDI=new Set(['stop','be','tp2','expired']);

/* planın yönünü çevir: aynı giriş, aynı d_stop/rm/hz/vade → ayna seviyeler */
function flipPlan(p){return mkPlan(p.sym,p.disp,-p.side,p.entry,p.t0,p.hz,(p.t_end-p.t0)/p.hz,p.rm,p.d_stop/Math.sqrt(p.hz),p.strat);}

/* perp stratejilerinde tutuş boyunca gerçekleşen fonlama: long öder (+r), short alır */
function addFunding(res,plans,fundingBySym){
  res.rows.forEach((row,i)=>{const p=plans[i],s=fundingBySym&&fundingBySym[p.sym];
    if(!s||!KAPANDI.has(row.state))return;
    const paid=F.sumBetween(s,p.t0,row.at||p.t_end);
    row.fundR=-p.side*paid/p.d_stop;row.R+=row.fundR;});
  const {aggregate}=require('./backtest');
  return {...res,...aggregate(res.rows)};
}

function runStrategy(name,rowsBySym,tf,o={}){
  const def=STRATS[name];
  let real=walkForward({rowsBySym,tf,model:name,generate:makeGenerator(name,tf,rowsBySym,{fundingBySym:o.fundingBySym}),step:o.step,warmup:o.warmup,from:o.from,to:o.to,log:o.log});
  return evaluate(name,real,real.plans||[],rowsBySym,o,!!def.perp);
}

/* ortak değerlendirme: gerçek sonuç + aynı plan listesinin işaret-rastgelelemesi (K kontrol) → karar */
function evaluate(name,real,plans,rowsBySym,o,perp){
  if(perp)real=addFunding(real,plans,o.fundingBySym);
  const done=real.rows.filter(r=>KAPANDI.has(r.state));
  const R=done.map(r=>r.R);
  const t=tStat(R),[h1,h2]=halves(done);
  const K=o.controls==null?50:o.controls, ctrl=[];
  for(let k=0;k<K;k++){const rnd=seeded(1000+k);
    const flipped=plans.map(p=>rnd()<0.5?flipPlan(p):p);
    let c=backtest(flipped,rowsBySym,{});
    if(perp)c=addFunding(c,flipped,o.fundingBySym);
    ctrl.push(c.totalR);}
  const p=K?ctrl.filter(x=>x>=real.totalR).length/K:NaN;
  const pass=done.length>=30&&t>=2.5&&h1>0&&h2>0&&(K?p<=0.02:false);
  const fundTotal=done.reduce((a,r)=>a+(r.fundR||0),0);
  return {name,n:done.length,totalR:real.totalR,fundTotal,avgR:real.avgR,t,winRate:real.winRate,profitFactor:real.profitFactor,
          maxDrawdown:real.maxDrawdown,h1,h2,p,ctrlMean:K?ctrl.reduce((a,b)=>a+b,0)/K:NaN,ctrl,pass,anchors:real.anchors||0,rows:real.rows};
}

/* ---- dış plan listesi (Python laboratuvarı, traderpath vb. dışa aktarımlar) ----
   CSV sütunları: t0 (ISO ya da ms), sym, side (1|-1|long|short), hz (bar), rm; isteğe bağlı sl, tp (fiyat).
   Giriş = t0 barının kapanışı (t0 bar sınırına yuvarlanır); sl/tp yoksa stop = nedensel EWMA vol·√hz, hedef = rm·stop
   (diğer stratejilerle aynı mkPlan). sl/tp verildiyse onlar kullanılır, rm=|ln(tp/P0)|/|ln(sl/P0)|.
   Bar kapanışından SONRA karar verildiği varsayılır: t0 satırı, o barın kapanışında biliniyor olmalı. */
function plansFromCsv(text,tf,rowsBySym,label){
  const ms=TFMS[tf],disp=Object.fromEntries(ASSETS);
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  const H=lines.shift().split(',').map(h=>h.trim().toLowerCase());
  const col=n=>H.indexOf(n);
  const need=['t0','sym','side'];for(const n of need)if(col(n)<0)throw new Error('CSV sütunu eksik: '+n);
  const vol={},idx={};
  for(const s in rowsBySym){vol[s]=ewmaVol(rowsBySym[s]);idx[s]=new Map(rowsBySym[s].map((b,i)=>[b.t,i]));}
  const out=[],skip={sym:0,bar:0,vol:0};
  for(const line of lines){
    const c=line.split(',').map(x=>x.trim());
    const g=n=>col(n)>=0?c[col(n)]:'';
    const sym=g('sym').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const rows=rowsBySym[sym];if(!rows){skip.sym++;continue;}
    const tRaw=g('t0'),T=Math.floor((/^\d+$/.test(tRaw)?+tRaw:Date.parse(tRaw))/ms)*ms;
    const i=idx[sym].get(T);if(i==null){skip.bar++;continue;}
    const sdRaw=g('side').toLowerCase(),side=/^(1|\+1|long|l|buy|al)$/.test(sdRaw)?1:/^(-1|short|s|sell|sat)$/.test(sdRaw)?-1:0;
    if(!side)continue;
    const hz=Math.max(1,Math.round(+g('hz')||24)),P0=rows[i].c;
    const sl=+g('sl'),tp=+g('tp');
    if(sl>0&&tp>0){
      const dStop=Math.abs(Math.log(sl/P0)),dTgt=Math.abs(Math.log(tp/P0));
      if(!(dStop>0)||!(dTgt>0)||Math.sign(Math.log(sl/P0))===side||Math.sign(Math.log(tp/P0))!==side){skip.vol++;continue;}
      const rm=dTgt/dStop;
      out.push({sym,disp:disp[sym]||sym,side,entry:P0,sl:P0*Math.exp(-side*dStop),tp1:rm>1?P0*Math.exp(side*dStop):null,
                tp2:P0*Math.exp(side*dTgt),rm,d_stop:dStop,hz,t0:T,t_end:T+hz*ms,strat:label});
    }else{
      const v=vol[sym][i];if(!(v>0)){skip.vol++;continue;}
      out.push(mkPlan(sym,disp[sym]||sym,side,P0,T,hz,ms,+g('rm')||1.5,v,label));}
  }
  out.sort((a,b)=>a.t0-b.t0);
  return {plans:out,skip};
}
function runPlans(name,plans,rowsBySym,o={}){
  const real=backtest(plans,rowsBySym,{});
  real.plans=plans;
  return evaluate(name,real,plans,rowsBySym,o,!!o.perp);
}

function compareReport(results){
  const p2=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(2);
  const K=results.length?results[0].ctrl.length:0;
  const L=[`Strateji laboratuvarı — kural: n≥30 ∧ t≥2.5 ∧ iki yarı>0 ∧ p_şans≤0.02  (şans kontrolü: işaret-rastgeleleme, K=${K})`,
    'strateji   n    toplamR   ortR    t     kazanma  PF    maxDD   yarı1   yarı2   şans_ort  p_şans  karar'];
  for(const r of results){
    const pf=isFinite(r.profitFactor)?r.profitFactor.toFixed(2):'∞';
    L.push(`${r.name.padEnd(9)} ${String(r.n).padStart(4)}  ${p2(r.totalR).padStart(8)}  ${p2(r.avgR)}  ${r.t.toFixed(2).padStart(5)}  ${(r.winRate*100).toFixed(0).padStart(5)}%  ${pf.padStart(5)}  ${r.maxDrawdown.toFixed(2).padStart(5)}  ${p2(r.h1)}  ${p2(r.h2)}  ${p2(r.ctrlMean).padStart(8)}  ${isFinite(r.p)?r.p.toFixed(2):'—'}    ${r.pass?'GEÇTİ':'kaldı'}`);}
  const fr=results.filter(r=>STRATS[r.name]&&STRATS[r.name].perp);
  if(fr.length)L.push('',...fr.map(r=>`${r.name}: toplam R'nin ${p2(r.fundTotal)}R'si gerçekleşen fonlama ödemesi, ${p2(r.totalR-r.fundTotal)}R'si fiyat`));
  L.push('','şans_ort: aynı girişler rastgele yönle (K tekrar) ortalama toplam R · p_şans: rastgelenin gerçeği geçme oranı');
  return L.join('\n');
}

module.exports={STRATS,makeGenerator,runStrategy,runPlans,plansFromCsv,compareReport,ewmaVol,mkPlan,tStat,halves};

/* ---- CLI ----
   node strategies.js [--tf 1h] [--pages 40] [--offline] [--step 24] [--warmup 2000]
                      [--from Y-M-D] [--to Y-M-D] [--strats a,b] [--controls 20] [--csv out.csv] */
/* dış plan listesi: node strategies.js --plans ../lab/cikti/tft-plans.csv --offline --pages 40 [--label tft] [--perp] */
if(require.main===module){
  (async()=>{
    const fs=require('fs');const eng=require('./engine');
    const a=process.argv.slice(2),opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;},has=k=>a.includes(k);
    const tf=opt('--tf','1h');if(!PD[tf]){console.error('tf: 1h|4h|1d');process.exit(2);}
    const pd=PD[tf],pages=opt('--pages')?+opt('--pages'):undefined;
    const step=+opt('--step',pd),warmup=+opt('--warmup',Math.max(60*pd+100,2000));
    const from=opt('--from')?Date.parse(opt('--from')):null,to=opt('--to')?Date.parse(opt('--to')):null;
    const names=opt('--strats')?opt('--strats').split(','):Object.keys(STRATS);
    const controls=+opt('--controls',50);
    const rowsBySym={};
    for(const [sym,disp] of eng.ASSETS){
      if(has('--offline')){try{rowsBySym[sym]=JSON.parse(fs.readFileSync(eng.cacheFile(sym,tf,pages),'utf8'));}catch(e){console.error(`${disp}: önbellek yok`);}}
      else{process.stderr.write(`${disp} verisi…\n`);rowsBySym[sym]=await eng.klines(sym,tf,pages);}}
    const fundingBySym={};
    if(opt('--plans')?has('--perp'):names.some(n=>STRATS[n]&&STRATS[n].perp)){
      for(const [sym,disp] of eng.ASSETS){const s=F.loadFunding(sym);if(s)fundingBySym[sym]=s;else console.error(`${disp}: fonlama yok (node funding.js --fetch)`);}}
    const results=[];
    if(opt('--plans')){                       /* dış plan listesi: yalnız onu değerlendir */
      const f=opt('--plans'),label=opt('--label',require('path').basename(f).replace(/\.csv$/i,''));
      const {plans,skip}=plansFromCsv(fs.readFileSync(f,'utf8'),tf,rowsBySym,label);
      process.stderr.write(`${label}: ${plans.length} plan okundu (atlanan: bilinmeyen sembol ${skip.sym}, bar yok ${skip.bar}, vol/seviye ${skip.vol})\n`);
      const r=runPlans(label,plans,rowsBySym,{controls,perp:has('--perp'),fundingBySym});
      process.stderr.write(`${label}: n=${r.n} toplam ${r.totalR.toFixed(2)}R t=${r.t.toFixed(2)} p=${r.p}\n`);
      results.push(r);names.length=0;}
    for(const n of names){const T=Date.now();
      const r=runStrategy(n,rowsBySym,tf,{step,warmup,from,to,controls,fundingBySym});
      process.stderr.write(`${n}: n=${r.n} toplam ${r.totalR.toFixed(2)}R t=${r.t.toFixed(2)} p=${r.p} · ${((Date.now()-T)/1000).toFixed(0)}s\n`);
      results.push(r);}
    console.log(compareReport(results));
    if(opt('--csv')){
      const h='strat,t0,sym,side,entry,state,R,bars';
      const rows=results.flatMap(r=>r.rows.map(x=>[r.name,new Date(x.t0).toISOString(),x.sym,x.side,x.entry,x.state,x.R,x.bars].join(',')));
      fs.writeFileSync(opt('--csv'),[h,...rows].join('\n'));}
  })().catch(e=>{console.error(e.stack||e.message||e);process.exit(1);});
}
