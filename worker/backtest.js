/* İşlem Yok — walk-forward backtest
   Modeli geçmişte gezdirir: her çapa anında (T) yalnız T'ye kadar olan barlarla
   tarama yapar (engine.scanRows), iki kapıyı geçen planları o anki fiyattan açar,
   sonra planı T'den SONRAKİ barlara karşı oynatır (replay.js). Sinyal üretimi
   canlı botla aynı koddur; look-ahead yok: T'den sonraki bar taramaya girmez.

   Eşik değerleri, .env ve ledger'a dokunmaz. Aile eşiği verilen varlık kümesiyle
   hesaplanır — canlıyla aynı eşik için 10 varlığın hepsi verilmelidir. */
'use strict';
const {replayPlan,netR}=require('./replay');

const TFMS={'1h':36e5,'4h':144e5,'1d':864e5};
const KAPANDI=new Set(['stop','be','tp2','expired']);

/* ---- tek plan oynatma ---- */
function runOne(pl,bars,f8){
  const rep=replayPlan(bars,pl);
  const R=netR(rep,pl,f8==null?null:f8);
  return {sym:pl.sym,disp:pl.disp||pl.sym,side:pl.side,t0:pl.t0,t_end:pl.t_end,
          entry:pl.entry,ev:pl.ev,famHi:pl.famHi,
          state:rep.state,R,half:!!rep.half,at:rep.at||null,bars:rep.n||0};
}

/* ---- metrikler (yalnız kapanmış koşular) ---- */
function aggregate(rows){
  const done=rows.filter(r=>KAPANDI.has(r.state));
  const n=done.length;
  const totalR=done.reduce((a,r)=>a+r.R,0);
  const wins=done.filter(r=>r.R>0), losses=done.filter(r=>r.R<0);
  const grossWin=wins.reduce((a,r)=>a+r.R,0);
  const grossLoss=-losses.reduce((a,r)=>a+r.R,0);
  let eq=0,peak=0,mdd=0;const equity=[];
  for(const r of done){eq+=r.R;equity.push({t:r.at||r.t_end,eq});if(eq>peak)peak=eq;const dd=peak-eq;if(dd>mdd)mdd=dd;}
  const byState={};for(const r of done)byState[r.state]=(byState[r.state]||0)+1;
  const sortedR=done.map(r=>r.R).sort((a,b)=>a-b);
  const medianR=n?(n%2?sortedR[(n-1)/2]:(sortedR[n/2-1]+sortedR[n/2])/2):0;
  return {
    n,totalR,avgR:n?totalR/n:0,medianR,
    wins:wins.length,losses:losses.length,winRate:n?wins.length/n:0,
    profitFactor:grossLoss>0?grossWin/grossLoss:(grossWin>0?Infinity:0),
    maxDrawdown:mdd,avgHoldBars:n?done.reduce((a,r)=>a+r.bars,0)/n:0,
    byState,equity,skipped:rows.length-n,
  };
}

/* ---- planları TAM barlara karşı oynat ---- */
function backtest(plans,barsBySym,opts={}){
  const f8=opts.funding==null?null:opts.funding;
  const rows=plans.map(pl=>{
    const bars=(barsBySym&&barsBySym[pl.sym])||pl._bars;
    if(!bars||!bars.length)return {sym:pl.sym,disp:pl.disp||pl.sym,side:pl.side,t0:pl.t0,t_end:pl.t_end,
                                   state:'no-data',R:0,half:false,at:null,bars:0};
    return runOne(pl,bars,f8);
  });
  return {rows,...aggregate(rows)};
}

/* ---- model tabanlı üretici: T'ye kadar kesilmiş barlarla tarama → planlar ----
   Canlı publishNew ile aynı alanlar (entry=P0, sl, tp1, tp2, rm, d_stop, t_end). */
function modelGenerate(eng,tf,opts={}){
  const ms=TFMS[tf];
  const toPlan=(h,T,famHi,shadow)=>{
    const lv=eng.planLevels(h.S,h.plan);
    return {sym:h.S.sym,disp:h.S.disp,side:lv.side,entry:lv.P0,sl:lv.sl,tp1:lv.tp1,tp2:lv.tp2,
            rm:lv.Rm,d_stop:h.plan.dStop,ev:lv.ev,se:lv.se,famHi,hz:lv.hz,
            t0:T,t_end:T+lv.hz*ms,shadow:!!shadow};};
  return (T,sliced)=>{
    const R=eng.scanRows(sliced,tf);
    const out=R.hits.map(h=>toPlan(h,T,R.famHi,false));
    /* gölge: şans ✓ hata ✗ olanlar — canlıda YAYINLANMAZ, yalnız ölçüm için */
    if(opts.shadow)for(const h of (R.nearMisses||[]))out.push(toPlan(h,T,R.famHi,true));
    out._scan={famHi:R.famHi,cores:R.cores,fails:R.fails||[],tops:R.tops||[]};
    return out;
  };
}

/* ---- walk-forward ----
   rowsBySym : {sym:[bar]} TAM tarih (tarama kesip verir, oynatma ileriye bakar)
   generate  : (T, slicedRowsBySym) => plan[]   (varsayılan: modelGenerate)
   step      : çapalar arası bar sayısı  · warmup: ilk çapadan önce gereken bar
   from/to   : ms epoch sınırları · dedupe: açık sym+yön varken yeni açma (canlı gibi)
   Ters yön gelirse açık plan o anda kapatılır (canlıdaki "yön döndü"). */
function walkForward(o){
  const {rowsBySym,tf,generate,funding=null,dedupe=true}=o;
  const log=o.log||(()=>{});
  const allT=[...new Set(Object.values(rowsBySym).flat().map(b=>b.t))].sort((a,b)=>a-b);
  const step=Math.max(1,o.step|0||1), warmup=Math.max(0,o.warmup|0);
  const anchors=[];
  for(let i=warmup;i<allT.length;i+=step){
    const T=allT[i];
    if(o.from&&T<o.from)continue;
    if(o.to&&T>o.to)break;
    anchors.push(T);}
  if(o.from&&anchors.length&&anchors[0]>o.from)
    log(`not: --from ${new Date(o.from).toISOString().slice(0,10)} ama ilk çapa ${new Date(anchors[0]).toISOString().slice(0,10)} (warmup=${warmup} bar; daha erken için --warmup küçült)`);
  const plans=[],open={},scans=[];
  const shadowPlans=[],shadowOpen={};
  let flipped=0;
  anchors.forEach((T,k)=>{
    const sliced={};
    for(const s in rowsBySym)sliced[s]=rowsBySym[s].filter(b=>b.t<=T);
    const t1=Date.now();
    const cand=generate(T,sliced)||[];
    const sc={t:T,cand:cand.length,ms:Date.now()-t1,famHi:cand._scan?cand._scan.famHi:undefined};
    /* teşhis: en iyi sonuç ve hangi kapıda kaldığı (canlı noTradeMessage ile aynı mantık) */
    const tops=(cand._scan&&cand._scan.tops||[]).filter(t=>isFinite(t.ev));
    if(tops.length){
      const b=tops.slice().sort((a,c)=>c.ev-a.ev)[0];
      sc.best={disp:b.disp,ev:b.ev,se:b.se,okChance:!!b.okChance,okErr:!!b.okErr};
      sc.nearMiss=tops.filter(t=>t.okChance&&!t.okErr).map(t=>t.disp);
      sc.gap=b.ev-sc.famHi;}                                 /* eşiğe uzaklık (+ geçti) */
    scans.push(sc);
    for(const pl of cand){
      const key=pl.sym+'|'+pl.side, opp=pl.sym+'|'+(-pl.side);
      if(pl.shadow){                                              /* gölge: kendi defteri, canlıyı etkilemez */
        if(dedupe&&shadowOpen[key]&&shadowOpen[key].t_end>T)continue;
        shadowPlans.push(pl);shadowOpen[key]=pl;continue;}
      if(dedupe&&open[key]&&open[key].t_end>T)continue;          /* zaten açık, tekrar yok */
      if(dedupe&&open[opp]&&open[opp].t_end>T){open[opp].t_end=T;flipped++;delete open[opp];}
      plans.push(pl);open[key]=pl;}
    const p2=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(2);
    const why=sc.best?` · en iyi ${sc.best.disp} ${p2(sc.best.ev)}R±${(2*sc.best.se).toFixed(2)} [şans ${sc.best.okChance?'✓':'✗'} hata ${sc.best.okErr?'✓':'✗'}]`+
                      (sc.nearMiss.length?` · yakın kaçan: ${sc.nearMiss.join(',')}`:''):'';
    log(`[${k+1}/${anchors.length}] ${new Date(T).toISOString().slice(0,10)} → ${cand.length} plan`+
        (isFinite(sc.famHi)?` (eşik +${sc.famHi.toFixed(2)}R)`:'')+why+` · ${sc.ms}ms`);
  });
  const res=backtest(plans,rowsBySym,{funding});
  const shadow=shadowPlans.length?backtest(shadowPlans,rowsBySym,{funding}):null;
  return {tf,anchors:anchors.length,flipped,scans,shadow,...res};
}

/* ---- rapor ---- */
function formatReport(res){
  const p2=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(2);
  const pf=isFinite(res.profitFactor)?res.profitFactor.toFixed(2):'∞';
  const st=Object.entries(res.byState).map(([k,v])=>`${k}:${v}`).join('  ')||'—';
  const head=res.anchors!=null?`Walk-forward ${res.tf||''} — ${res.anchors} çapa, ${res.rows.length} plan açıldı, ${res.n} kapandı (${res.skipped} açık/veri yok, ${res.flipped||0} yön döndü)`
                              :`Backtest — ${res.n} kapanmış plan (${res.skipped} atlandı)`;
  const lines=[head,
    `Toplam: ${p2(res.totalR)}R   Ortalama: ${p2(res.avgR)}R   Medyan: ${p2(res.medianR)}R`,
    `Kazanma: ${(res.winRate*100).toFixed(1)}% (${res.wins}K / ${res.losses}Z)   Profit factor: ${pf}`,
    `Max drawdown: ${res.maxDrawdown.toFixed(2)}R   Ort. tutuş: ${res.avgHoldBars.toFixed(1)} bar`,
    `Durumlar: ${st}`];
  const sc=(res.scans||[]).filter(s=>s.best);
  if(sc.length){
    const g1=sc.filter(s=>s.best.okChance).length, g2=sc.filter(s=>s.best.okChance&&s.best.okErr).length;
    const nm=sc.filter(s=>s.nearMiss&&s.nearMiss.length).length;
    const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
    lines.push('',`Çapa özeti (${sc.length}): şans kapısını geçen ${g1} · iki kapıyı geçen ${g2} · yakın kaçan olan ${nm}`,
      `  ort. eşik +${mean(sc.map(s=>s.famHi)).toFixed(2)}R · ort. en iyi ${p2(mean(sc.map(s=>s.best.ev)))}R · ort. uzaklık ${p2(mean(sc.map(s=>s.gap)))}R`);
    const close=sc.slice().sort((a,b)=>b.gap-a.gap).slice(0,5);
    lines.push('  eşiğe en yakın 5 çapa:');
    for(const s of close)
      lines.push(`    ${new Date(s.t).toISOString().slice(0,10)} ${String(s.best.disp).padEnd(5)} ${p2(s.best.ev)}R±${(2*s.best.se).toFixed(2)}  eşik +${s.famHi.toFixed(2)}  uzaklık ${p2(s.gap)}  [şans ${s.best.okChance?'✓':'✗'} hata ${s.best.okErr?'✓':'✗'}]`);
  }
  if(res.shadow){
    const sh=res.shadow, spf=isFinite(sh.profitFactor)?sh.profitFactor.toFixed(2):'∞';
    lines.push('',`GÖLGE — yakın kaçanlar (şans ✓ hata ✗; canlıda yayınlanmaz, yalnız ölçüm): ${sh.rows.length} plan, ${sh.n} kapandı`,
      `  Toplam: ${p2(sh.totalR)}R   Ortalama: ${p2(sh.avgR)}R   Medyan: ${p2(sh.medianR)}R   Kazanma: ${(sh.winRate*100).toFixed(1)}%   PF: ${spf}   MaxDD: ${sh.maxDrawdown.toFixed(2)}R`,
      `  Durumlar: ${Object.entries(sh.byState).map(([k,v])=>`${k}:${v}`).join('  ')||'—'}`);
    if(sh.n){
      const R=sh.rows.filter(r=>KAPANDI.has(r.state)).map(r=>r.R);
      const m=sh.avgR, sd=Math.sqrt(R.reduce((a,x)=>a+(x-m)*(x-m),0)/Math.max(1,R.length-1));
      const t=sd>0?m/(sd/Math.sqrt(R.length)):0;
      lines.push(`  Ortalama R'nin sıfırdan farkı: t=${t.toFixed(2)} (n=${R.length}) — |t|<2 ise gölge kazancı şansla açıklanabilir`);}
  }
  if(res.rows.length){
    lines.push('','Planlar:');
    for(const r of res.rows){
      const d=t=>t?new Date(t).toISOString().slice(0,10):'—';
      lines.push(`  ${d(r.t0)} ${String(r.disp).padEnd(5)} ${r.side>0?'L':'S'}  ev ${isFinite(r.ev)?p2(r.ev):'—'}R  → ${r.state.padEnd(8)} ${p2(r.R)}R  (${r.bars} bar)`);}
  }
  return lines.join('\n');
}

function toCsv(res){
  const h='t0,sym,side,entry,ev,famHi,state,R,bars,closed_at';
  const row=(r,sh)=>[new Date(r.t0).toISOString(),r.sym,r.side,r.entry,r.ev,r.famHi,r.state,r.R,r.bars,r.at?new Date(r.at).toISOString():'',sh].join(',');
  const rows=res.rows.map(r=>row(r,0)).concat(((res.shadow&&res.shadow.rows)||[]).map(r=>row(r,1)));
  return [h+',shadow',...rows].join('\n');
}

function scansCsv(res){
  const h='t,famHi,best,best_ev,best_se,okChance,okErr,gap,nearMiss,plans,ms';
  return [h,...(res.scans||[]).map(s=>[new Date(s.t).toISOString(),s.famHi,s.best?s.best.disp:'',s.best?s.best.ev:'',s.best?s.best.se:'',
    s.best?s.best.okChance:'',s.best?s.best.okErr:'',s.gap==null?'':s.gap,(s.nearMiss||[]).join('|'),s.cand,s.ms].join(','))].join('\n');
}

module.exports={backtest,aggregate,runOne,walkForward,modelGenerate,formatReport,toCsv,scansCsv,TFMS};

/* ---- CLI ----
   node backtest.js [--tf 1h] [--step N] [--warmup N] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
                    [--assets BTC,ETH,...] [--funding 0.0001] [--offline] [--csv out.csv] [--json out.json]
                    [--shadow] [--pages N]
   --shadow : yakın kaçanları (şans ✓ hata ✗) gölge plan olarak ileriye oynat, AYRI raporla.
              Hata kapısını gevşetmeden "kapı gerçek kenarı mı reddediyor" sorusunu ölçer.
   --pages N: daha derin geçmiş (N×1000 bar) — ayrı önbellek dosyası, canlı dosyaya dokunmaz.
              se = sd/√(geçmiş/hz) olduğundan erken çapalarda hata payı canlıyla eşitlenir.
   Veri: varsayılan engine.klines (Binance + disk önbelleği). --offline yalnız
   CACHE_DIR'deki kl-<sym>-<tf>.json dosyalarını okur, ağa çıkmaz.
   Varsayılan step: canlı bot günde bir tarar → 1h:24, 4h:6, 1d:1. */
if(require.main===module){
  (async()=>{
    const fs=require('fs'),path=require('path');
    const eng=require('./engine');
    const a=process.argv.slice(2);
    const opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
    const has=k=>a.includes(k);
    const tf=opt('--tf','1h');
    if(!TFMS[tf]){console.error('tf: 1h | 4h | 1d');process.exit(2);}
    const perDay=eng.TFC[tf].perDay;
    const step=+opt('--step',perDay);                     /* günde bir çapa */
    const warmup=+opt('--warmup',perDay*365);
    const from=opt('--from')?Date.parse(opt('--from')):null;
    const to=opt('--to')?Date.parse(opt('--to')):null;
    const funding=opt('--funding')!=null?+opt('--funding'):null;
    const want=opt('--assets')?new Set(opt('--assets').split(',').map(s=>s.trim().toUpperCase())):null;
    const pages=opt('--pages')?+opt('--pages'):undefined;          /* derin geçmiş: ayrı önbellek dosyası */
    const shadow=has('--shadow');
    const assets=eng.ASSETS.filter(([,d])=>!want||want.has(d));
    if(want&&assets.length<eng.ASSETS.length)
      console.error(`UYARI: ${assets.length}/${eng.ASSETS.length} varlık — aile eşiği canlıdan farklı çıkar.`);
    const rowsBySym={};
    for(const [sym,disp] of assets){
      if(has('--offline')){
        const f=eng.cacheFile(sym,tf,pages);
        try{rowsBySym[sym]=JSON.parse(fs.readFileSync(f,'utf8'));}
        catch(e){console.error(`${disp}: önbellek yok (${f})`);continue;}
      }else{
        process.stderr.write(`${disp} verisi…\n`);
        rowsBySym[sym]=await eng.klines(sym,tf,pages);}
    }
    if(!Object.keys(rowsBySym).length){console.error('veri yok');process.exit(1);}
    const res=walkForward({rowsBySym,tf,generate:modelGenerate(eng,tf,{shadow}),step,warmup,from,to,funding,
                           log:m=>process.stderr.write(m+'\n')});
    console.log(formatReport(res));
    if(opt('--csv')){fs.writeFileSync(opt('--csv'),toCsv(res));
      fs.writeFileSync(opt('--csv').replace(/\.csv$/i,'')+'-capa.csv',scansCsv(res));}
    if(opt('--json'))fs.writeFileSync(opt('--json'),JSON.stringify({...res,equity:res.equity},null,1));
  })().catch(e=>{console.error(e.stack||e.message||e);process.exit(1);});
}
