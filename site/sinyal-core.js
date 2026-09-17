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
const KAPANDI=new Set(['stop','be','tp2','expired']);

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
