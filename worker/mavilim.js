/* İşlem Yok — Mavilim göstergesi (Kıvanç Özbilgiç, TradingView) strateji testi
   Mavilim: Fibonacci uzunluklu art arda WMA. fmal=3, smal=5 → 8, 13, 21, 34.
     M1=WMA(kapanış,3) M2=WMA(M1,5) M3=WMA(M2,8) M4=WMA(M3,13) M5=WMA(M4,21) MAVW=WMA(M5,34)
   Renk: MAVW yükseliyorsa mavi, düşüyorsa kırmızı. Nedensel: i. değer yalnız 0..i kapanışlarına bağlı.

   KURALLAR (sonucu görmeden yazıldı, sonradan değişmez):
     mav_renk   : renk kırmızı→mavi → long; mavi→kırmızı → short (eğim işaret değiştirir).
     mav_kesis  : kapanış MAVW'yi yukarı keser → long; aşağı keser → short.
     *_vol      : ek koşul — sinyal barının hacmi > SMA20(hacim). Hacim yoksa işlem yok.
     Giriş sinyal barının kapanışı; ufuk 1 gün, stop 1σ·√ufuk, hedef 2×stop (tdi.js ile aynı makine,
     aynı dedupe/ters sinyalde kapatma, aynı şans testi ve kabul: n≥30 ∧ t≥2.5 ∧ iki yarı>0 ∧ p_şans≤0.02).

   CLI: node mavilim.js --pages 40 --syms BTCUSDT [--offline] [--tf 1h] [--controls 50]
        node mavilim.js --sentetik --syms BTCUSDT                                            */
'use strict';
const {sma,eventPlans}=require('./tdi');
const {runPlans,compareReport}=require('./strategies');

const RULES={mav_renk:{hzDays:1,rm:2,kind:'renk'},mav_kesis:{hzDays:1,rm:2,kind:'kesis'},
  mav_renk_vol:{hzDays:1,rm:2,kind:'renk',vol:true},mav_kesis_vol:{hzDays:1,rm:2,kind:'kesis',vol:true}};

/* Pine ta.wma: ağırlık 1..L, en yeni bar en ağır; pencerede NaN varsa NaN */
function wma(x,L){const o=new Float64Array(x.length).fill(NaN),D=L*(L+1)/2;
  for(let i=L-1;i<x.length;i++){let s=0,ok=true;
    for(let k=0;k<L;k++){const v=x[i-k];if(!isFinite(v)){ok=false;break;}s+=v*(L-k);}
    if(ok)o[i]=s/D;}
  return o;}
function mavilim(c,fmal=3,smal=5){
  const tmal=fmal+smal,Fmal=smal+tmal,Ftmal=tmal+Fmal,Smal=Fmal+Ftmal;
  return [fmal,smal,tmal,Fmal,Ftmal,Smal].reduce((x,L)=>wma(x,L),c);
}
function compute(bars){
  const n=bars.length,c=bars.map(b=>b.c),M=mavilim(c);
  const renk=new Int8Array(n),kesis=new Int8Array(n),volOk=new Int8Array(n);
  const slope=i=>i>0&&isFinite(M[i])&&isFinite(M[i-1])?Math.sign(M[i]-M[i-1]):0;
  for(let i=2;i<n;i++){
    const a=slope(i),b=slope(i-1);if(a&&b&&a!==b)renk[i]=a;
    if(isFinite(M[i])&&isFinite(M[i-1])){
      if(c[i]>M[i]&&c[i-1]<=M[i-1])kesis[i]=1;else if(c[i]<M[i]&&c[i-1]>=M[i-1])kesis[i]=-1;}}
  const v=bars.map(b=>b.v==null?NaN:+b.v),vs=sma(v,20);
  for(let i=0;i<n;i++)volOk[i]=v[i]>vs[i]?1:0;
  return {M,renk,kesis,volOk};
}
function mavPlans(name,rowsBySym,tf,o={}){
  const def=RULES[name];if(!def)throw new Error('kural yok: '+name);
  return eventPlans(name,def,rowsBySym,tf,b=>{const I=compute(b);
    return i=>{const s=I[def.kind][i];return s&&(!def.vol||I.volOk[i])?s:0;};},o);
}
module.exports={RULES,wma,mavilim,compute,mavPlans};

if(require.main===module){
  (async()=>{
    const fs=require('fs'),eng=require('./engine');
    const a=process.argv.slice(2),opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;},has=k=>a.includes(k);
    const tf=opt('--tf','1h'),controls=+opt('--controls',50);
    const syms=opt('--syms')?opt('--syms').toUpperCase().split(','):null;
    const run=(rows,title)=>console.log(`\n## ${title}\n`+compareReport(Object.keys(RULES).map(n=>runPlans(n,mavPlans(n,rows,tf),rows,{controls}))));
    if(has('--sentetik')){
      const {senaryo}=require('./sentetik');
      for(const [title,drift] of [['Gürültü',0],['Zayıf trend (±%0.5/gün)',0.005],['Güçlü trend (±%1.5/gün)',0.015]]){
        const all=senaryo({seed:+opt('--seed',7),bars:+opt('--bars',40000),driftPerDay:drift,tf});
        const rows=syms?Object.fromEntries(Object.entries(all).filter(([s])=>syms.includes(s))):all;
        run(rows,`${title} · ${Object.keys(rows).join(',')}`);}
      return;}
    const pages=opt('--pages')?+opt('--pages'):undefined,rows={};
    for(const [sym,disp] of eng.ASSETS.filter(([s])=>!syms||syms.includes(s))){
      if(has('--offline')){try{rows[sym]=JSON.parse(fs.readFileSync(eng.cacheFile(sym,tf,pages),'utf8'));}catch(e){console.error(`${disp}: önbellek yok`);}}
      else{process.stderr.write(`${disp} verisi…\n`);rows[sym]=await eng.klines(sym,tf,pages);}}
    run(rows,`Gerçek veri ${tf} · `+Object.entries(rows).map(([s,r])=>`${s} ${r.length} bar, ${new Date(r[0].t).toISOString().slice(0,10)} → ${new Date(r[r.length-1].t).toISOString().slice(0,10)}`).join(' | '));
  })().catch(e=>{console.error(e.stack||e.message||e);process.exit(1);});
}
