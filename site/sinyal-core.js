/* İşlem Yok — sinyal test çekirdeği (tarayıcı + Node)
   replay.js + kanal.js ayrıştırıcısı + maymun testi tek dosyada. worker/kanal.js ve
   site/sinyal-test.html bunu kullanır; iki kopya YOK. Ağ erişimi yok: barlar dışarıdan gelir. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.SinyalCore=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
const DAY=864e5;


/* pl: {side,entry,sl,tp1,tp2,rm,d_stop,t0,t_end}
   dönüş: {state,at,px,R,half}
   state: wait | open | stop | be | tp2 | expired */
function replayPlan(bars,pl){
  const seg=bars.filter(b=>b.t>pl.t0&&b.t<=pl.t_end);
  if(!seg.length)return {state:'wait',R:0,half:false,n:0};
  const up=pl.side>0;
  let half=false, realized=0, stop=pl.sl;
  for(let i=0;i<seg.length;i++){
    const b=seg[i];
    const adv=up?b.l:b.h, fav=up?b.h:b.l;
    if(up?(adv<=stop):(adv>=stop)){
      const rStop=half?0:-1;                       /* girişe çekilmişse kalan yarım 0R */
      return {state:half?'be':'stop',at:b.t,px:stop,
              R:realized+(half?0.5*rStop:rStop),half,n:i+1};}
    if(pl.tp1&&!half&&(up?(fav>=pl.tp1):(fav<=pl.tp1))){
      half=true;realized=0.5*1;stop=pl.entry;}
    if(up?(fav>=pl.tp2):(fav<=pl.tp2))
      return {state:'tp2',at:b.t,px:pl.tp2,
              R:half?realized+0.5*pl.rm:pl.rm,half,n:i+1};}
  const last=seg[seg.length-1], done=last.t>=pl.t_end;
  const openR=(pl.side*Math.log(last.c/pl.entry))/pl.d_stop;
  return {state:done?'expired':'open',at:last.t,px:last.c,
          R:half?realized+0.5*openR:openR,half,n:seg.length};
}

/* komisyon + kayma (çift yön, 11bp) ve süresiz sözleşmede fonlama düşülür */
function netR(rep,pl,f8){
  let R=rep.R-(2*11/1e4)/pl.d_stop;
  if(f8!=null&&rep.at){
    const holdH=Math.max(0,(rep.at-pl.t0))/36e5;
    R-=pl.side*f8*(holdH/8)/pl.d_stop;}
  return R;
}

/* hedefe kat edilen yol ve gidiş yönü — açık sinyaller için */
function progress(bars,pl){
  const seg=bars.filter(b=>b.t>pl.t0&&b.t<=pl.t_end);
  if(!seg.length)return null;
  const cur=seg[seg.length-1].c;
  const rNow=(pl.side*Math.log(cur/pl.entry))/pl.d_stop;
  const yol=Math.max(0,Math.min(1,rNow/pl.rm));
  let yon=null,hiz=null,eta=null;
  if(seg.length>=4){
    const k=Math.max(2,Math.floor(seg.length/3));
    const eski=seg[seg.length-1-k];
    const rEski=(pl.side*Math.log(eski.c/pl.entry))/pl.d_stop;
    const d=rNow-rEski;
    yon=d>0.03?'yaklaşıyor':d<-0.03?'uzaklaşıyor':'yatay';
    hiz=d/k;
    if(hiz>0.002)eta=((pl.rm-rNow)/hiz);          /* bar cinsinden */
  }
  return {cur,rNow,yol,yon,hiz,etaBars:eta};
}


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
  /* hedefler girişin DOĞRU tarafında ve girişten uzak olmalı; giriş verilmediyse stop'a göre bak.
     "TP 184.7" = giriş fiyatı gibi ayrıştırma hataları planı açılır açılmaz "hedef" yapar. */
  const ref=e;
  const tpOk=isFinite(ref)?tpList.filter(v=>side>0?v>ref*1.003:v<ref*0.997)
                          :tpList.filter(v=>side>0?v>stop*1.006:v<stop*0.994);
  if(!tpOk.length)return null;
  if(isFinite(ref)&&(side>0?stop>=ref:stop<=ref))return null;   /* stop girişin yanlış tarafında */
  return {sym,side,entry:e,sl:stop,tps:tpOk.slice().sort((a,b)=>side>0?a-b:b-a),t};
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
  const out={channel:name,fetchedAt:Date.now(),messages:all.length,signals:sigs,raw:all};
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
  /* silinmiş mesaj payı: id'ler ardışık; boşluk = silinmiş (kaybedenleri silen kanalın izi) */
  const ids=(data.raw||[]).map(m=>m.id).filter(Number.isFinite).sort((a,b)=>a-b);
  const deleted=ids.length>1?1-ids.length/(ids[ids.length-1]-ids[0]+1):NaN;
  /* veri derinliği sinyal tarihine göre: en eski sinyalden 30 gün öncesi yeter (1000 bar ≈ 42 gün) */
  /* en çok sinyal alan N coin yeter; tek-sinyallik coin'ler istatistiğe değil veri yüküne katkı yapar */
  const cnt={};for(const x of sigs)cnt[x.sym]=(cnt[x.sym]||0)+1;
  const maxSyms=o.maxSyms||25;
  const syms=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).slice(0,maxSyms);
  const symSet=new Set(syms);const droppedSyms=Object.keys(cnt).length-syms.length;
  const droppedSigs=sigs.filter(x=>!symSet.has(x.sym)).length;
  const bars={};
  const oldest=Math.min(...sigs.filter(x=>symSet.has(x.sym)).map(s=>s.t));
  const pages=Math.max(2,Math.min(40,Math.ceil((Date.now()-oldest+30*DAY)/(1000*36e5))+1));
  const log=o.log||(()=>{});let k=0;
  for(const s of syms){k++;
    try{bars[s]=o.offline?JSON.parse(fs.readFileSync(eng.cacheFile(s,'1h',pages),'utf8')):await eng.klines(s,'1h',pages);
        log(`  [${k}/${syms.length}] ${s} ${bars[s].length} bar`);}
    catch(e){log(`  [${k}/${syms.length}] ${s} veri yok (${e.message})`);}}
  const plans=[],skipped={veriYok:0,gecersiz:0,girisUzak:0};
  for(const s of sigs){if(!symSet.has(s.sym))continue;const b=bars[s.sym];if(!b){skipped.veriYok++;continue;}
    const i=b.findIndex(x=>x.t>s.t);const bar=i>0?b[i-1]:null;if(!bar){skipped.veriYok++;continue;}
    const p=toPlan(s,bar.c);if(!p){skipped.gecersiz++;continue;}
    if(p.offEntry>0.03){skipped.girisUzak++;continue;}         /* mesaj fiyatından >%3 uzak giriş: dolmamış say */
    if(o.strict){
      /* giriş dolmalı: mesajdan sonra fiyat giriş seviyesine değmeden hedefe giderse işlem yoktur.
         Dolduğu bar bulunur; plan o bardan başlar. Stop/hedef önce gelirse (aynı barda) dolmuş sayılmaz. */
      let fill=-1;
      for(let j=i;j<b.length&&b[j].t<=s.t+3*DAY;j++){const x=b[j];
        const touched=x.l<=p.entry&&x.h>=p.entry;
        if(touched){fill=j;break;}
        const hitTgt=p.side>0?x.h>=p.tp2:x.l<=p.tp2, hitSl=p.side>0?x.l<=p.sl:x.h>=p.sl;
        if(hitTgt||hitSl)break;}                             /* girmeden bitti → dolmadı */
      if(fill<0){skipped.dolmadi=(skipped.dolmadi||0)+1;continue;}
      p.t0=b[fill].t;p.t_end=p.t0+30*DAY;
      p.tp1=null;                                            /* yarı kapatma yok: stop ya da son hedef */
    }
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
  let hold=NaN;const bb=bars['BTCUSDT']||(await (async()=>{try{return o.offline?JSON.parse(fs.readFileSync(eng.cacheFile('BTCUSDT','1h',pages),'utf8')):await eng.klines('BTCUSDT','1h',pages);}catch(e){return null;}})());
  if(bb&&done.length){const t0=Math.min(...done.map(r=>r.t0)),t1=Math.max(...done.map(r=>r.at||r.t_end));
    const a=bb.find(x=>x.t>=t0),z=[...bb].reverse().find(x=>x.t<=t1);if(a&&z)hold=z.c/a.c-1;}
  const R=done.map(r=>r.R);const n=R.length;const m=n?real.totalR/n:0;
  const sd=n>1?Math.sqrt(R.reduce((a,x)=>a+(x-m)*(x-m),0)/(n-1)):0;const t=sd>0?m/(sd/Math.sqrt(n)):0;
  const verdict=n<30?'YETERSİZ VERİ':(p<=0.02&&t>=2.5)?(o.strict?'MAYMUNU YENDİ':'MAYMUNU YENDİ (doğrulanmadı — --strict ile tekrar)'):'MAYMUNU YENEMEDİ';
  return {channel:name,strict:!!o.strict,deleted,messages:data.messages,parsed:sigs.length,tested:n,skipped,syms:syms.length,droppedSyms,droppedSigs,totalR:real.totalR,avgR:m,t,winRate:real.winRate,
          maxDrawdown:real.maxDrawdown,monkeyMean:mMean,monkeyLo:lo,monkeyHi:hi,p,hold,verdict,rows:real.rows,
          from:done.length?Math.min(...done.map(r=>r.t0)):null,to:done.length?Math.max(...done.map(r=>r.at||r.t_end)):null};
}

function card(r){
  const p2=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(1);const d=t=>t?new Date(t).toISOString().slice(0,10):'—';
  const tl=x=>(x>=0?'+':'−')+Math.abs(x*1000).toFixed(0)+' TL';                  /* 100 bin TL, işlem başına %1 risk: 1R = 1000 TL */
  return [
`🐒 ${r.channel} — ${r.verdict}${r.strict?'  [sıkı: giriş dolmalı, yarı kapatma yok]':''}`,
`Silinmiş mesaj payı: ${isFinite(r.deleted)?(r.deleted*100).toFixed(0)+'%':'—'}${r.deleted>0.15?'  ⚠ kaybedenler silinmiş olabilir':''}`,
`${r.tested} sinyal test edildi · en çok sinyal alan ${r.syms} coin (${r.messages} mesaj, ${r.parsed} sinyal ayrıştırıldı; ${r.droppedSyms} nadir coin'deki ${r.droppedSigs} sinyal dışarıda; atlanan: veri yok ${r.skipped.veriYok}, geçersiz ${r.skipped.gecersiz}, giriş uzak ${r.skipped.girisUzak}${r.skipped.dolmadi?', giriş dolmadı '+r.skipped.dolmadi:''}) · ${d(r.from)} → ${d(r.to)}`,
``,
`100 bin TL, işlem başına %1 risk:`,
`  Kanalın sinyalleri : ${tl(r.totalR)}   (isabet %${(r.winRate*100).toFixed(0)}, en kötü çekilme ${r.maxDrawdown.toFixed(1)}R)`,
`  Dart atan maymun   : ${tl(r.monkeyMean)}   (50 maymunun %90'ı ${tl(r.monkeyLo)} ile ${tl(r.monkeyHi)} arasında)`,
`  Sadece BTC al-tut  : ${isFinite(r.hold)?(r.hold>=0?'+':'−')+Math.abs(r.hold*100000).toFixed(0)+' TL':'—'}`,
``,
`Kanal, maymunların %${(100-r.p*100).toFixed(0)}'inden iyi (t=${r.t.toFixed(2)}). Kural: maymunların %98'inden iyi ∧ t≥2.5 ∧ n≥30 → yendi.`,
`islemyok.com/strateji-testleri.html`].join('\n');
}

/* sinyale benzeyen (yön kelimesi + ≥3 sayı) ama ayrışmayan son N mesaj — ayrıştırıcıyı uyarlamak için */
function sample(name,n=8){
  const data=JSON.parse(fs.readFileSync(path.join(CACHE,`kanal-${name}.json`),'utf8'));
  const raw=(data.raw||[]).slice().reverse();
  const like=m=>/long|short|\bal\b|\bsat\b|buy|sell|giri|entry|stop|hedef|tp|🟢|🔴|📈|📉/i.test(m.text)&&nums(m.text).length>=3;
  const miss=raw.filter(m=>like(m)&&!parseSignal(m.text,m.t)).slice(0,n);
  return {total:raw.length,signalLike:raw.filter(like).length,parsed:data.signals.length,miss};
}
/* keşif: tohum kanalların mesajlarındaki t.me bağlantılarını takip et (sinyal kanalları
   birbirini reklam eder), bulunanları çek, ayrışan sinyal sayısına göre sırala */
async function discover(seeds,o={}){
  const seen=new Set(seeds.map(x=>x.toLowerCase())),queue=[...seeds],out=[];
  const bad=/^(s|joinchat|addstickers|share|proxy|iv|login|c|\+)$/i;
  const max=o.max||40,pages=o.pages||10;
  while(queue.length&&out.length<max){
    const ch=queue.shift();
    let r;try{r=await fetchChannel(ch,pages);}catch(e){out.push({ch,err:e.message});continue;}
    const ts=(r.raw||[]).map(m=>m.t).filter(isFinite);
    out.push({ch,messages:r.messages,signals:r.signals.length,last:ts.length?Math.max(...ts):null});
    if(o.log)o.log(`${ch}: ${r.messages} mesaj, ${r.signals.length} sinyal`);
    for(const m of r.raw||[]){const re=/t\.me\/(?:s\/)?([A-Za-z0-9_]{5,32})/g;let x;
      while((x=re.exec(m.text))){const n=x[1];if(bad.test(n)||seen.has(n.toLowerCase()))continue;seen.add(n.toLowerCase());queue.push(n);}}
  }
  return out.sort((a,b)=>(b.signals||0)-(a.signals||0));
}
module.exports={parseSignal,num,nums,fetchChannel,testChannel,toPlan,card,sample,discover};

if(require.main===module){
  (async()=>{
    const a=process.argv.slice(2),opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
    const list=v=>String(v).split(',').map(x=>x.trim().replace(/^@|^https?:\/\/t\.me\/(s\/)?/,'')).filter(Boolean);
    if(opt('--fetch'))for(const ch of list(opt('--fetch'))){
      try{const r=await fetchChannel(ch,+opt('--pages',20));
        const ts=(r.raw||[]).map(m=>m.t).filter(isFinite),d=t=>new Date(t).toISOString().slice(0,10);
        console.log(`${r.channel}: ${r.messages} mesaj (${ts.length?d(Math.min(...ts))+' → '+d(Math.max(...ts)):'tarih yok'}), ${r.signals.length} sinyal ayrıştırıldı`+(r.signals.length?'':'  ← hiç sinyal ayrışmadı; bir mesaj örneği gönder, ayrıştırıcıyı uyarlayalım'));
        if(r.signals.length)console.log('   örnek:',JSON.stringify(r.signals[r.signals.length-1]));}
      catch(e){console.log(`${ch}: HATA ${e.message}`);}}
    if(opt('--test'))for(const ch of list(opt('--test'))){
      try{process.stderr.write(`\n${ch}: veri çekiliyor…\n`);
        const r=await testChannel(ch,{offline:a.includes('--offline'),controls:+opt('--controls',50),maxSyms:+opt('--maxsyms',25),strict:a.includes('--strict'),log:m=>process.stderr.write(m+'\n')});
        console.log('\n'+card(r));
        if(opt('--csv'))fs.writeFileSync(opt('--csv').replace(/\.csv$/i,'')+'-'+ch+'.csv',['t0,sym,side,entry,state,R'].concat(r.rows.map(x=>[new Date(x.t0).toISOString(),x.sym,x.side,x.entry,x.state,x.R].join(','))).join('\n'));}
      catch(e){console.log(`${ch}: HATA ${e.message}`);}}
    if(opt('--sample'))for(const ch of list(opt('--sample'))){
      try{const r=sample(ch,+opt('--n',8));
        console.log(`\n=== ${ch}: ${r.total} mesaj, sinyale benzeyen ${r.signalLike}, ayrışan ${r.parsed} ===`);
        r.miss.forEach((m,i)=>console.log(`--- [${i+1}] ${new Date(m.t).toISOString().slice(0,16)} ---\n${m.text.slice(0,600)}`));}
      catch(e){console.log(`${ch}: HATA ${e.message} (önce --fetch)`);}}
    if(opt('--discover')){
      const res=await discover(list(opt('--discover')),{max:+opt('--max',40),pages:+opt('--pages',10),log:m=>process.stderr.write(m+'\n')});
      console.log('\nkanal                          mesaj  sinyal  son mesaj');
      for(const r of res)console.log(r.err?`${r.ch.padEnd(30)} HATA ${r.err}`:`${r.ch.padEnd(30)} ${String(r.messages).padStart(5)}  ${String(r.signals).padStart(6)}  ${r.last?new Date(r.last).toISOString().slice(0,10):'—'}`);
      const good=res.filter(r=>r.signals>=20&&r.last>Date.now()-180*DAY).map(r=>r.ch);
      console.log(good.length?`\ntest edilebilir (≥20 sinyal, son 6 ay aktif): ${good.join(',')}\nnpm run kanal -- --test ${good.join(',')} --csv kanal.csv`:'\nölçüte uyan kanal yok');}
    if(!opt('--fetch')&&!opt('--test')&&!opt('--sample')&&!opt('--discover'))console.log('kullanım: node kanal.js --fetch a,b [--pages 20] | --test a,b [--offline] [--csv out.csv] | --sample a,b [--n 8] | --discover a,b [--max 40] [--pages 10]   (test: --strict --maxsyms 25 --offline)');
  })().catch(e=>{console.error(e.stack||e.message||e);process.exit(1);});
}
function toPlan(s,px){
  const entry=isFinite(s.entry)?s.entry:px;           /* giriş verilmediyse mesaj anındaki fiyat */
  const d_stop=Math.abs(Math.log(entry/s.sl));if(!(d_stop>0))return null;
  const tp1=s.tps.length>1?s.tps[0]:null,tp2=s.tps[s.tps.length-1];
  const rm=Math.abs(Math.log(tp2/entry))/d_stop;
  return {sym:s.sym,disp:s.sym.replace('USDT',''),side:s.side,entry,sl:s.sl,tp1,tp2,rm,d_stop,t0:s.t,t_end:s.t+30*DAY,
          hz:720,offEntry:isFinite(s.entry)&&isFinite(px)?Math.abs(Math.log(s.entry/px)):0};
}
function seeded(seed){let x=(seed|0)||1;return()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/4294967296;}



/* ---- sıkı oynatma: giriş dolmalı (3 gün içinde), yarı kapatma yok ---- */
function fillPlan(p,b,i,strict){
  if(!strict)return p;
  let fill=-1;
  for(let j=i;j<b.length&&b[j].t<=p.t0+3*DAY;j++){const x=b[j];
    if(x.l<=p.entry&&x.h>=p.entry){fill=j;break;}
    const hitTgt=p.side>0?x.h>=p.tp2:x.l<=p.tp2, hitSl=p.side>0?x.l<=p.sl:x.h>=p.sl;
    if(hitTgt||hitSl)break;}
  if(fill<0)return null;
  return {...p,t0:b[fill].t,t_end:b[fill].t+30*DAY,tp1:null};
}
function runPlans(plans,barsBySym,f8){
  const rows=plans.map(p=>{const bars=barsBySym[p.sym];
    if(!bars||!bars.length)return {sym:p.sym,side:p.side,t0:p.t0,state:'no-data',R:0,at:null};
    const rep=replayPlan(bars,p);return {sym:p.sym,side:p.side,t0:p.t0,entry:p.entry,state:rep.state,R:netR(rep,p,f8==null?null:f8),at:rep.at||null};});
  const done=rows.filter(r=>KAPANDI.has(r.state));
  const n=done.length,totalR=done.reduce((a,r)=>a+r.R,0);
  const wins=done.filter(r=>r.R>0).length;
  let eq=0,peak=0,mdd=0;for(const r of done){eq+=r.R;if(eq>peak)peak=eq;if(peak-eq>mdd)mdd=peak-eq;}
  return {rows,done,n,totalR,avgR:n?totalR/n:0,winRate:n?wins/n:0,maxDrawdown:mdd};
}
function flipPlan(p){return {...p,side:-p.side,sl:p.entry*Math.exp(p.side*p.d_stop),
  tp1:p.tp1?p.entry*Math.exp(-p.side*Math.abs(Math.log(p.tp1/p.entry))):null,tp2:p.entry*Math.exp(-p.side*p.rm*p.d_stop)};}

/* ---- kanal (çok sinyal) testi: plans hazır, barlar hazır ---- */
function monkeyTest(plans,barsBySym,o={}){
  const K=o.controls||50;
  const real=runPlans(plans,barsBySym,null);
  const monkey=[];
  for(let k=0;k<K;k++){const rnd=seeded(1000+k);monkey.push(runPlans(plans.map(p=>rnd()<0.5?flipPlan(p):p),barsBySym,null).totalR);}
  monkey.sort((a,b)=>a-b);
  const mMean=monkey.reduce((a,b)=>a+b,0)/K,lo=monkey[Math.floor(K*0.05)],hi=monkey[Math.ceil(K*0.95)-1];
  const p=monkey.filter(x=>x>=real.totalR).length/K;
  const R=real.done.map(r=>r.R),n=R.length,m=real.avgR;
  const sd=n>1?Math.sqrt(R.reduce((a,x)=>a+(x-m)*(x-m),0)/(n-1)):0;const t=sd>0?m/(sd/Math.sqrt(n)):0;
  const verdict=n<30?'YETERSİZ VERİ':(p<=0.02&&t>=2.5)?'MAYMUNU YENDİ':'MAYMUNU YENEMEDİ';
  return {...real,monkeyMean:mMean,monkeyLo:lo,monkeyHi:hi,p,t,verdict};
}

/* ---- tek sinyal: yönsüz beklenti — son N günün saatlik barlarından blok bootstrap ---- */
function singleSignal(sig,bars,o={}){
  const px=bars[bars.length-1].c;
  const entry=isFinite(sig.entry)?sig.entry:px;
  const dStop=Math.abs(Math.log(entry/sig.sl));if(!(dStop>0))return {err:'stop girişle aynı'};
  const tp=sig.tps[sig.tps.length-1],dTgt=Math.abs(Math.log(tp/entry));
  const rm=dTgt/dStop;
  const COST=2*11/1e4;
  /* yönsüz simülasyon: geçmiş saatlik getirilerden (işaret rastgele) 30 günlük yollar */
  const rets=[];for(let i=1;i<bars.length;i++)rets.push(Math.log(bars[i].c/bars[i-1].c));
  const N=o.N||4000,H=o.hz||720,rnd=seeded(o.seed||7);
  let win=0,loss=0,sumR=0;const hzs=[];
  for(let k=0;k<N;k++){
    let c=0,out=0,tex=H;const s0=Math.floor(rnd()*rets.length);
    for(let h=0;h<H;h++){const r=rets[(s0+h)%rets.length]*(rnd()<0.5?-1:1);   /* işaret karıştırılmış: yön bilgisi sıfır */
      c+=r;
      if(sig.side*c<=-dStop){out=-1;tex=h+1;break;}
      if(sig.side*c>=dTgt){out=1;tex=h+1;break;}}
    let R=out===-1?-1:out===1?rm:(sig.side*c)/dStop;R-=COST/dStop;
    if(out===1)win++;else if(out===-1)loss++;sumR+=R;hzs.push(tex);}
  hzs.sort((a,b)=>a-b);
  const evMonkey=sumR/N,pWin=win/N;
  const breakeven=(1+COST/dStop)/(1+rm);                  /* başabaş isabet: p·rm − (1−p) = maliyet */
  const liq=isFinite(o.leverage)&&o.leverage>1?entry*Math.exp(-sig.side*Math.log(1+1/o.leverage*0.995)):null;   /* ~ bakım marjı ihmal */
  const liqBeforeStop=liq!=null&&(sig.side>0?liq>sig.sl:liq<sig.sl);
  return {entry,px,offEntry:Math.abs(Math.log(entry/px)),dStop,dTgt,rm,stopPct:(1-Math.exp(-dStop))*100,tgtPct:(Math.exp(dTgt)-1)*100,
          pWin,pLoss:loss/N,evMonkey,breakeven,medianBars:hzs[Math.floor(N/2)],liq,liqBeforeStop};
}

return {DAY,KAPANDI,replayPlan,netR,progress,parseSignal,num,nums,toPlan,seeded,fillPlan,runPlans,flipPlan,monkeyTest,singleSignal};
});
