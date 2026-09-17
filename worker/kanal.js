/* İşlem Yok — Telegram sinyal kanalı testi ("maymun testi")
   1) --fetch <kanal>: t.me/s/<kanal> herkese açık önizlemesini sayfa sayfa çeker,
      mesajlardan sinyal ayıklar → kanal-<kanal>.json
   2) --test  <kanal>: her sinyali gerçek mumlarla oynatır (replay.js), aynı
      işlemleri yönü yazı-turayla 50 kez oynatır (maymun), BTC al-tut ile kıyaslar,
      tek kart basar. Yalnız kamuya açık mesajlar; giriş yapılmaz. */
'use strict';
const fs=require('fs'),path=require('path');
const CACHE=process.env.CACHE_DIR||'/tmp/islemyok-cache';
const DAY=864e5;

/* ---------- ayrıştırıcı: değişken formatlara toleranslı ---------- */
const NUM='([0-9][0-9.,]*)';
const num=s=>{if(s==null)return NaN;s=String(s).replace(/\s/g,'');
  /* 1.234,56 (TR) → 1234.56 ; 63,000 → 63000 ; 0,45 → 0.45 */
  if(/,\d{1,2}$/.test(s)&&/\./.test(s))s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,'');
  else s=s.replace(',','.');
  const v=parseFloat(s);return isFinite(v)?v:NaN;};
const nums=str=>{const out=[];const re=/(?<![A-Za-z])([0-9][0-9.,]*)(?![0-9])/g;let m;
  while((m=re.exec(str)))if(m[1]!=='.'&&m[1]!==',')out.push(num(m[1]));return out.filter(isFinite);};

function parseSignal(text,t){
  if(!text)return null;
  const T=text.replace(/ /g,' ');
  const symM=T.match(/\b([A-Z]{2,10})\s*[\/-]?\s*(USDT|USDT\.P|PERP|USD)\b/)||T.match(/#?\b([A-Z]{2,10})\b(?=[^a-z]*(long|short|al|sat|buy|sell|giriş|entry)\b)/i);
  if(!symM)return null;
  const base=symM[1].toUpperCase();if(['LONG','SHORT','BUY','SELL','SL','TP','ENTRY','USDT','STOP','TARGET','HEDEF'].includes(base))return null;
  const sym=base+'USDT';
  let side=0;
  if(/\b(long|buy|al[ıi]?[mn]?|alış|🟢|📈)\b/i.test(T)||/🟢|📈/.test(T))side=1;
  if(/\b(short|sell|sat(ış)?|🔴|📉)\b/i.test(T)||/🔴|📉/.test(T))side=side?0:-1;   /* ikisi de varsa belirsiz */
  if(!side)return null;
  const grab=(re)=>{const m=T.match(re);return m?nums(m[1]):[];};
  /* etiket sonrası tek basamaklı sıra numarası olabilir: "TP1:", "Hedef 2 -" */
  const LIST='((?:[0-9][0-9.,]*[ \\t\\-–\\/,|]*){1,8})';
  const entry=grab(new RegExp('\\b(?:entry|giri[şs]|gir|buy zone|al[ıi]m|entry zone|e)\\s*(?:\\d(?=\\s*[:=\\-–]))?\\s*[:=\\-–]?[^0-9\\n]{0,10}'+LIST,'i'));
  const sl=grab(/\b(?:stop[\s-]?loss|stop|sl|zarar[\s-]?kes|zarar durdur)\b\s*(?:\d(?=\s*[:=\-–]))?\s*[:=\-–]?[^0-9\n]{0,10}([0-9][0-9.,]*)/i);
  /* hedefler: her etiketten sonra gelen liste; "TP1: a TP2: b" ve "Hedef: a / b / c" ikisi de */
  const tps=[];{const re=new RegExp('\\b(?:take[ \\-]?profit|targets?|tps?|hedef(?:ler)?|kar al|k[âa]r al)\\s*(?:\\d(?=\\s*[:=\\-–]))?\\s*[:=\\-–]?[^0-9\\n]{0,10}'+LIST,'gi');let m;
    while((m=re.exec(T)))for(const v of nums(m[1]))if(!tps.includes(v))tps.push(v);}
  if(!sl.length||!tps.length)return null;
  const dropIdx=l=>l.length>1?l.filter(v=>!(Number.isInteger(v)&&v>=1&&v<=9)):l;
  const ent=dropIdx(entry),tpl=dropIdx(tps);
  const e=ent.length?ent.reduce((a,b)=>a+b,0)/ent.length:NaN;   /* bölge verildiyse ortası */
  const stop=sl[0],tpList=tpl.filter(x=>x!==stop);
  if(!tpList.length)return null;
  /* yön tutarlılığı: long → sl<tp ; short → sl>tp */
  const ok=side>0?stop<Math.min(...tpList):stop>Math.max(...tpList);
  if(!ok)return null;
  return {sym,side,entry:e,sl:stop,tps:tpList.slice().sort((a,b)=>side>0?a-b:b-a),t};
}

/* ---------- t.me/s önizlemesi ---------- */
async function fetchChannel(name,pages=20){
  fs.mkdirSync(CACHE,{recursive:true});
  const msgs=new Map();let before=null;
  for(let g=0;g<pages;g++){
    const u=`https://t.me/s/${name}`+(before?`?before=${before}`:'');
    const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0'}});if(!r.ok)throw new Error('t.me '+r.status);
    const html=await r.text();
    const blocks=html.split('tgme_widget_message_wrap').slice(1);
    let minId=Infinity,added=0;
    for(const b of blocks){
      const id=(b.match(/data-post="[^"\/]+\/(\d+)"/)||[])[1];if(!id)continue;
      const tm=(b.match(/<time[^>]*datetime="([^"]+)"/)||[])[1];
      const tx=(b.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)||[])[1]||'';
      const text=tx.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;|&quot;/g,"'");
      const n=+id;if(n<minId)minId=n;
      if(!msgs.has(n)){msgs.set(n,{id:n,t:tm?Date.parse(tm):NaN,text});added++;}}
    if(!added||!isFinite(minId))break;
    before=minId;await new Promise(r=>setTimeout(r,400));}
  const all=[...msgs.values()].sort((a,b)=>a.t-b.t);
  const sigs=all.map(m=>parseSignal(m.text,m.t)).filter(Boolean);
  const out={channel:name,fetchedAt:Date.now(),messages:all.length,signals:sigs};
  fs.writeFileSync(path.join(CACHE,`kanal-${name}.json`),JSON.stringify(out));
  return out;
}

/* ---------- oynatma + maymun ---------- */
function toPlan(s,px){
  const entry=isFinite(s.entry)?s.entry:px;           /* giriş verilmediyse mesaj anındaki fiyat */
  const d_stop=Math.abs(Math.log(entry/s.sl));if(!(d_stop>0))return null;
  const tp1=s.tps.length>1?s.tps[0]:null,tp2=s.tps[s.tps.length-1];
  const rm=Math.abs(Math.log(tp2/entry))/d_stop;
  return {sym:s.sym,disp:s.sym.replace('USDT',''),side:s.side,entry,sl:s.sl,tp1,tp2,rm,d_stop,t0:s.t,t_end:s.t+30*DAY,
          hz:720,offEntry:isFinite(s.entry)&&isFinite(px)?Math.abs(Math.log(s.entry/px)):0};
}
function seeded(seed){let x=(seed|0)||1;return()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/4294967296;}
const KAPANDI=new Set(['stop','be','tp2','expired']);

async function testChannel(name,o={}){
  const eng=require('./engine');const {backtest,aggregate}=require('./backtest');const {mkPlan}=require('./strategies');
  const data=JSON.parse(fs.readFileSync(path.join(CACHE,`kanal-${name}.json`),'utf8'));
  const sigs=data.signals.filter(s=>isFinite(s.t));
  const syms=[...new Set(sigs.map(s=>s.sym))];const bars={};
  for(const s of syms){try{bars[s]=o.offline?JSON.parse(fs.readFileSync(eng.cacheFile(s,'1h',40),'utf8')):await eng.klines(s,'1h',40);}catch(e){}}
  const plans=[],skipped={veriYok:0,gecersiz:0,girisUzak:0};
  for(const s of sigs){const b=bars[s.sym];if(!b){skipped.veriYok++;continue;}
    const i=b.findIndex(x=>x.t>s.t);const bar=i>0?b[i-1]:null;if(!bar){skipped.veriYok++;continue;}
    const p=toPlan(s,bar.c);if(!p){skipped.gecersiz++;continue;}
    if(p.offEntry>0.03){skipped.girisUzak++;continue;}         /* mesaj fiyatından >%3 uzak giriş: dolmamış say */
    plans.push(p);}
  const real=backtest(plans,bars,{});
  const done=real.rows.filter(r=>KAPANDI.has(r.state));
  const flip=(p)=>({...p,side:-p.side,sl:p.entry*Math.exp(p.side*p.d_stop),
    tp1:p.tp1?p.entry*Math.exp(-p.side*Math.abs(Math.log(p.tp1/p.entry))):null,tp2:p.entry*Math.exp(-p.side*p.rm*p.d_stop)});
  const K=o.controls||50,monkey=[];
  for(let k=0;k<K;k++){const rnd=seeded(1000+k);monkey.push(backtest(plans.map(p=>rnd()<0.5?flip(p):p),bars,{}).totalR);}
  monkey.sort((a,b)=>a-b);
  const mMean=monkey.reduce((a,b)=>a+b,0)/K,lo=monkey[Math.floor(K*0.05)],hi=monkey[Math.ceil(K*0.95)-1];
  const p=monkey.filter(x=>x>=real.totalR).length/K;
  /* BTC al-tut: ilk sinyalden son kapanışa */
  let hold=NaN;const bb=bars['BTCUSDT']||(await (async()=>{try{return o.offline?JSON.parse(fs.readFileSync(eng.cacheFile('BTCUSDT','1h',40),'utf8')):await eng.klines('BTCUSDT','1h',40);}catch(e){return null;}})());
  if(bb&&done.length){const t0=Math.min(...done.map(r=>r.t0)),t1=Math.max(...done.map(r=>r.at||r.t_end));
    const a=bb.find(x=>x.t>=t0),z=[...bb].reverse().find(x=>x.t<=t1);if(a&&z)hold=z.c/a.c-1;}
  const R=done.map(r=>r.R);const n=R.length;const m=n?real.totalR/n:0;
  const sd=n>1?Math.sqrt(R.reduce((a,x)=>a+(x-m)*(x-m),0)/(n-1)):0;const t=sd>0?m/(sd/Math.sqrt(n)):0;
  const verdict=n<30?'YETERSİZ VERİ':(p<=0.02&&t>=2.5)?'MAYMUNU YENDİ':'MAYMUNU YENEMEDİ';
  return {channel:name,messages:data.messages,parsed:sigs.length,tested:n,skipped,totalR:real.totalR,avgR:m,t,winRate:real.winRate,
          maxDrawdown:real.maxDrawdown,monkeyMean:mMean,monkeyLo:lo,monkeyHi:hi,p,hold,verdict,rows:real.rows,
          from:done.length?Math.min(...done.map(r=>r.t0)):null,to:done.length?Math.max(...done.map(r=>r.at||r.t_end)):null};
}

function card(r){
  const p2=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(1);const d=t=>t?new Date(t).toISOString().slice(0,10):'—';
  const tl=x=>(x>=0?'+':'−')+Math.abs(x*1000).toFixed(0)+' TL';                  /* 100 bin TL, işlem başına %1 risk: 1R = 1000 TL */
  return [
`🐒 ${r.channel} — ${r.verdict}`,
`${r.tested} sinyal test edildi (${r.messages} mesaj, ${r.parsed} sinyal ayrıştırıldı; atlanan: veri yok ${r.skipped.veriYok}, geçersiz ${r.skipped.gecersiz}, giriş uzak ${r.skipped.girisUzak}) · ${d(r.from)} → ${d(r.to)}`,
``,
`100 bin TL, işlem başına %1 risk:`,
`  Kanalın sinyalleri : ${tl(r.totalR)}   (isabet %${(r.winRate*100).toFixed(0)}, en kötü çekilme ${r.maxDrawdown.toFixed(1)}R)`,
`  Dart atan maymun   : ${tl(r.monkeyMean)}   (50 maymunun %90'ı ${tl(r.monkeyLo)} ile ${tl(r.monkeyHi)} arasında)`,
`  Sadece BTC al-tut  : ${isFinite(r.hold)?(r.hold>=0?'+':'−')+Math.abs(r.hold*100000).toFixed(0)+' TL':'—'}`,
``,
`Kanal, maymunların %${(100-r.p*100).toFixed(0)}'inden iyi (t=${r.t.toFixed(2)}). Kural: maymunların %98'inden iyi ∧ t≥2.5 ∧ n≥30 → yendi.`,
`islemyok.com/strateji-testleri.html`].join('\n');
}

module.exports={parseSignal,num,nums,fetchChannel,testChannel,toPlan,card};

if(require.main===module){
  (async()=>{
    const a=process.argv.slice(2),opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
    const list=v=>String(v).split(',').map(x=>x.trim().replace(/^@|^https?:\/\/t\.me\/(s\/)?/,'')).filter(Boolean);
    if(opt('--fetch'))for(const ch of list(opt('--fetch'))){
      try{const r=await fetchChannel(ch,+opt('--pages',20));
        console.log(`${r.channel}: ${r.messages} mesaj, ${r.signals.length} sinyal ayrıştırıldı`+(r.signals.length?'':'  ← hiç sinyal ayrışmadı; bir mesaj örneği gönder, ayrıştırıcıyı uyarlayalım'));
        if(r.signals.length)console.log('   örnek:',JSON.stringify(r.signals[r.signals.length-1]));}
      catch(e){console.log(`${ch}: HATA ${e.message}`);}}
    if(opt('--test'))for(const ch of list(opt('--test'))){
      try{const r=await testChannel(ch,{offline:a.includes('--offline'),controls:+opt('--controls',50)});
        console.log('\n'+card(r));
        if(opt('--csv'))fs.writeFileSync(opt('--csv').replace(/\.csv$/i,'')+'-'+ch+'.csv',['t0,sym,side,entry,state,R'].concat(r.rows.map(x=>[new Date(x.t0).toISOString(),x.sym,x.side,x.entry,x.state,x.R].join(','))).join('\n'));}
      catch(e){console.log(`${ch}: HATA ${e.message}`);}}
    if(!opt('--fetch')&&!opt('--test'))console.log('kullanım: node kanal.js --fetch a,b,c [--pages 20] | --test a,b,c [--offline] [--csv out.csv]');
  })().catch(e=>{console.error(e.stack||e.message||e);process.exit(1);});
}
