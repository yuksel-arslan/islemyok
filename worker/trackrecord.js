/* İşlem Yok — gerçek track record (ledger) raporu + denetim
   Kaynak: Neon `signals` (salt okunur) veya kamuya açık signals.json.
   Bu kayıtlar canlı yayın anında yazıldı: yapısı gereği look-ahead yoktur.
   Bu yüzden "sistem çalışıyor mu" sorusunun en güçlü cevabı budur.

   Denetim (--bars-dir): kapanmış her sinyal, önbellekteki mumlarla botun
   kullandığı AYNI kodla (replayPlan+netR) yeniden oynatılır ve kayıtlı R ile
   karşılaştırılır. Uyuşmazlık = kayıt ya da hesap hatası; sessizce geçilmez.
   Ledger'a asla yazmaz. */
'use strict';
const {aggregate,runOne}=require('./backtest');

/* DB satırı (snake_case) ve signals.json (camelCase) → tek biçim */
function normalize(s){
  const num=v=>v==null?null:+v;
  return {
    id:s.id, sym:s.sym, disp:s.disp||s.sym, tf:s.tf, side:+s.side,
    entry:num(s.entry), sl:num(s.sl), tp1:num(s.tp1), tp2:num(s.tp2),
    rm:num(s.rm), d_stop:num(s.d_stop!=null?s.d_stop:s.dStop),
    ev:num(s.ev), famHi:num(s.fam_hi!=null?s.fam_hi:s.famHi),
    t0:num(s.t0), t_end:num(s.t_end!=null?s.t_end:s.tEnd),
    state:s.state||'open', half:!!s.half,
    closed_at:num(s.closed_at!=null?s.closed_at:s.closedAt),
    close_px:num(s.close_px!=null?s.close_px:s.closePx),
    R:num(s.r_realized!=null?s.r_realized:s.R),
  };
}

/* kapanmış sinyallerden gerçekleşen metrikler (kayıtlı R üzerinden) */
function summarize(signals){
  const sigs=signals.map(normalize).sort((a,b)=>a.t0-b.t0);
  const rows=sigs.map(s=>({
    sym:s.sym,disp:s.disp,side:s.side,t0:s.t0,t_end:s.t_end,entry:s.entry,ev:s.ev,famHi:s.famHi,
    state:s.state,R:s.R==null?0:s.R,half:s.half,at:s.closed_at,
    bars:0}));
  const open=sigs.filter(s=>s.state==='open');
  return {rows,open,...aggregate(rows),total:sigs.length};
}

/* kayıtlı R'yi mumlarla yeniden hesapla ve karşılaştır */
function audit(signals,barsBySym,tol=1e-6){
  const out={checked:0,ok:0,mismatches:[],noBars:0};
  for(const s of signals.map(normalize)){
    if(s.state==='open')continue;
    const bars=barsBySym[s.sym];
    if(!bars||!bars.length){out.noBars++;continue;}
    /* 'flipped' botun kendi kararıdır (yön döndü); mumlardan türetilemez, atla */
    if(s.state==='flipped')continue;
    const r=runOne({...s,tp1:s.tp1},bars,null);
    out.checked++;
    const dR=s.R==null?NaN:Math.abs(r.R-s.R);
    if(r.state===s.state&&isFinite(dR)&&dR<=tol)out.ok++;
    else out.mismatches.push({id:s.id,disp:s.disp,recorded:{state:s.state,R:s.R},recomputed:{state:r.state,R:r.R}});
  }
  return out;
}

function formatTrack(sum,aud){
  const p2=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(2);
  const pf=isFinite(sum.profitFactor)?sum.profitFactor.toFixed(2):'∞';
  const d=t=>t?new Date(t).toISOString().slice(0,10):'—';
  const L=[
    `Track record — ${sum.total} yayınlanmış sinyal: ${sum.n} kapandı, ${sum.open.length} açık`,
    `Toplam: ${p2(sum.totalR)}R   Ortalama: ${p2(sum.avgR)}R   Medyan: ${p2(sum.medianR)}R`,
    `Kazanma: ${(sum.winRate*100).toFixed(1)}% (${sum.wins}K / ${sum.losses}Z)   Profit factor: ${pf}`,
    `Max drawdown: ${sum.maxDrawdown.toFixed(2)}R`,
    `Durumlar: ${Object.entries(sum.byState).map(([k,v])=>`${k}:${v}`).join('  ')||'—'}`,
  ];
  if(aud){
    L.push('',`Denetim: ${aud.checked} kapanmış sinyal mumlarla yeniden hesaplandı → ${aud.ok} uyuştu, ${aud.mismatches.length} UYUŞMADI`+(aud.noBars?`, ${aud.noBars} için mum yok`:''));
    for(const m of aud.mismatches)
      L.push(`  ✗ ${m.disp} ${m.id}: kayıt ${m.recorded.state} ${p2(m.recorded.R||0)}R · hesap ${m.recomputed.state} ${p2(m.recomputed.R)}R`);
  }
  if(sum.rows.length){
    L.push('','Sinyaller:');
    for(const r of sum.rows)
      L.push(`  ${d(r.t0)} ${String(r.disp).padEnd(5)} ${r.side>0?'L':'S'}  ev ${isFinite(r.ev)?p2(r.ev):'—'}R  → ${String(r.state).padEnd(8)} ${r.state==='open'?'—':p2(r.R)+'R'}`);
  }
  return L.join('\n');
}

module.exports={normalize,summarize,audit,formatTrack};

/* ---- CLI ----
   node trackrecord.js signals.json            # dosyadan
   node trackrecord.js --url https://…/signals.json
   node trackrecord.js --db                    # Neon, salt okunur (DATABASE_URL)
   [--bars-dir CACHE_DIR]  kapanmışları mumlarla yeniden hesaplayıp denetle */
if(require.main===module){
  (async()=>{
    const fs=require('fs'),path=require('path');
    const a=process.argv.slice(2);
    const opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
    let signals;
    if(a.includes('--db')){
      const DB=require('./db');
      if(!DB.enabled){console.error('DATABASE_URL yok');process.exit(2);}
      signals=await DB.recentSignals(10000);
    }else if(opt('--url')){
      const r=await fetch(opt('--url'));if(!r.ok)throw new Error('HTTP '+r.status);
      signals=(await r.json()).signals;
    }else{
      const f=a.find(x=>!x.startsWith('--')&&x!==opt('--bars-dir'));
      if(!f){console.error('kullanım: node trackrecord.js <signals.json> | --url <url> | --db  [--bars-dir DIR]');process.exit(2);}
      const j=JSON.parse(fs.readFileSync(f,'utf8'));
      signals=Array.isArray(j)?j:j.signals;
    }
    let aud=null;
    const dir=opt('--bars-dir');
    if(dir){
      const barsBySym={};
      for(const s of signals.map(normalize)){
        if(barsBySym[s.sym])continue;
        try{barsBySym[s.sym]=JSON.parse(fs.readFileSync(path.join(dir,`kl-${s.sym}-${s.tf}.json`),'utf8'));}catch(e){}
      }
      aud=audit(signals,barsBySym);
    }
    console.log(formatTrack(summarize(signals),aud));
    if(aud&&aud.mismatches.length)process.exit(3);
  })().catch(e=>{console.error(e.stack||e.message||e);process.exit(1);});
}
