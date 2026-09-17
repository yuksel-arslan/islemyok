/* İşlem Yok — backtest çalıştırıcı
   Verilen planları GERÇEK geçmiş mumlara karşı oynatır (replay.js) ve
   performans metriklerini toplar. Sinyal üretimini YENİDEN YAZMAZ; yalnız
   sonuçları oynatır — böylece look-ahead (ileriye bakma) yanlılığı girmez.

   ÖNEMLİ: Bu araç "şu planlar geçmişte nasıl sonuçlanırdı"yı ölçer. Planların
   kendisi look-ahead'siz üretilmiş olmalı (bkz. site/backtest-neden-yaniltir).
   Eşik değerlerine, .env'e veya ledger'a dokunmaz. */
'use strict';
const {replayPlan,netR}=require('./replay');

/* Tek planı tek varlığın barlarına karşı oynatır. */
function runOne(pl,bars,f8){
  const rep=replayPlan(bars,pl);
  const R=netR(rep,pl,f8==null?null:f8);
  return {sym:pl.sym,state:rep.state,R,half:!!rep.half,at:rep.at||null,bars:rep.n||0};
}

/* Kapanmış (sonucu belli) koşular: aggregate yalnız bunları sayar. */
const KAPANDI=new Set(['stop','be','tp2','expired']);

/* Koşu satırlarından metrik toplar. */
function aggregate(rows){
  const done=rows.filter(r=>KAPANDI.has(r.state));
  const n=done.length;
  const totalR=done.reduce((a,r)=>a+r.R,0);
  const wins=done.filter(r=>r.R>0), losses=done.filter(r=>r.R<0);
  const grossWin=wins.reduce((a,r)=>a+r.R,0);
  const grossLoss=-losses.reduce((a,r)=>a+r.R,0);
  /* özkaynak eğrisi (plan sırasına göre) üzerinden en büyük geri çekilme */
  let eq=0,peak=0,mdd=0;
  for(const r of done){eq+=r.R;if(eq>peak)peak=eq;const dd=peak-eq;if(dd>mdd)mdd=dd;}
  const byState={};for(const r of done)byState[r.state]=(byState[r.state]||0)+1;
  const sortedR=done.map(r=>r.R).sort((a,b)=>a-b);
  const medianR=n?(n%2?sortedR[(n-1)/2]:(sortedR[n/2-1]+sortedR[n/2])/2):0;
  return {
    n, totalR, avgR:n?totalR/n:0, medianR,
    wins:wins.length, losses:losses.length,
    winRate:n?wins.length/n:0,
    profitFactor:grossLoss>0?grossWin/grossLoss:(grossWin>0?Infinity:0),
    maxDrawdown:mdd, avgHoldBars:n?done.reduce((a,r)=>a+r.bars,0)/n:0,
    byState,
    skipped:rows.length-n,            /* açık/veri yok/wait olanlar */
  };
}

/* plans: [{sym,side,entry,sl,tp1,tp2,rm,d_stop,t0,t_end}]
   barsBySym: {sym:[{t,o,h,l,c}]}   (plan._bars da olur)
   opts.funding: 8s fonlama oranı (spot için null). */
function backtest(plans,barsBySym,opts={}){
  const f8=opts.funding==null?null:opts.funding;
  const rows=plans.map(pl=>{
    const bars=(barsBySym&&barsBySym[pl.sym])||pl._bars;
    if(!bars||!bars.length)return {sym:pl.sym,state:'no-data',R:0,half:false,at:null,bars:0};
    return runOne(pl,bars,f8);
  });
  return {rows, ...aggregate(rows)};
}

/* İnsan-okur özet (Türkçe, kısa). */
function formatReport(res){
  const p2=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(2);
  const pf=isFinite(res.profitFactor)?res.profitFactor.toFixed(2):'∞';
  const st=Object.entries(res.byState).map(([k,v])=>`${k}:${v}`).join('  ')||'—';
  return [
    `Backtest — ${res.n} kapanmış plan (${res.skipped} atlandı)`,
    `Toplam: ${p2(res.totalR)}R   Ortalama: ${p2(res.avgR)}R   Medyan: ${p2(res.medianR)}R`,
    `Kazanma: ${(res.winRate*100).toFixed(1)}% (${res.wins}K / ${res.losses}Z)   Profit factor: ${pf}`,
    `Max drawdown: ${res.maxDrawdown.toFixed(2)}R   Ort. tutuş: ${res.avgHoldBars.toFixed(1)} bar`,
    `Durumlar: ${st}`,
  ].join('\n');
}

module.exports={backtest,aggregate,runOne,formatReport};

/* ---- CLI ----
   node backtest.js <plans.json> [--tf 1h] [--funding 0.0001] [--bars bars.json]
   plans.json : plan dizisi (yukarıdaki şekil)
   --bars     : {sym:[bar]} dosyası verilirse ağ kullanılmaz (çevrimdışı/tekrarlanabilir)
   verilmezse barlar engine.klines ile Binance'ten çekilir. */
if(require.main===module){
  (async()=>{
    const fs=require('fs');
    const a=process.argv.slice(2);
    const opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
    const planFile=a.find(x=>!x.startsWith('--')&&x!==opt('--tf')&&x!==opt('--funding')&&x!==opt('--bars'));
    if(!planFile){console.error('kullanım: node backtest.js <plans.json> [--tf 1h] [--funding 0.0001] [--bars bars.json]');process.exit(2);}
    const tf=opt('--tf','1h');
    const funding=opt('--funding')!=null?+opt('--funding'):null;
    const plans=JSON.parse(fs.readFileSync(planFile,'utf8'));
    let barsBySym={};
    const barsFile=opt('--bars');
    if(barsFile){
      barsBySym=JSON.parse(fs.readFileSync(barsFile,'utf8'));
    }else{
      const {klines}=require('./engine');
      const syms=[...new Set(plans.map(p=>p.sym))];
      for(const s of syms){process.stderr.write(`${s} verisi…\n`);barsBySym[s]=await klines(s,tf);}
    }
    const res=backtest(plans,barsBySym,{funding});
    console.log(formatReport(res));
  })().catch(e=>{console.error(e.message||e);process.exit(1);});
}
