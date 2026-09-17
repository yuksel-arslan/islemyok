/* İşlem Yok — Telegram worker
   Her gün 06:00 UTC (09:00 TSİ) kripto taraması koşar.

   TEMEL KURAL: sinyal bir OLAYDIR, durum değil.
   Aynı kurulum üç gün sürüyorsa bu üç sinyal değil, bir sinyalin üçüncü günüdür.
   Mesaj yalnızca durum DEĞİŞTİĞİNDE gider: yeni plan, kapanış, yön dönüşü.

   DRY_RUN=1: Telegram'a göndermez, konsola/diske yazar.
   RUN_ON_START=1: açılışta bir kez koşar. */
'use strict';
const {scanMarket,planLevels,klines,passesThreshold}=require('./engine');
const {replayPlan,netR,progress}=require('./replay');
const DB=require('./db');
const {exportSignals}=require('./publish');
const {createCanvas}=require('@napi-rs/canvas');
const cron=require('node-cron');
const fs=require('fs');

const TOKEN=process.env.TELEGRAM_BOT_TOKEN||'';
const CHAT=process.env.TELEGRAM_CHAT||'@islemyok';
const DRY=process.env.DRY_RUN==='1';
const TF=process.env.SCAN_TF||'1h';
const TFMS={'1h':36e5,'4h':144e5,'1d':864e5};
const QUIET=process.env.QUIET_NO_TRADE==='1';   /* 1: "işlem yok" mesajını hiç atma */

const fmt=v=>v>=1000?Math.round(v).toLocaleString('tr-TR'):v.toPrecision(4);
const sure=ms=>{const g=Math.floor(ms/864e5),h=Math.round(ms%864e5/36e5);
  return g?`${g} gün${h?` ${h} saat`:''}`:`${h} saat`;};

/* ---- mum + plan PNG'si ---- */
function planPng(S,lv){
  const W=900,H=460,P={l:14,r:80,t:44,b:34};
  const cv=createCanvas(W,H),x=cv.getContext('2d');
  const C={bg:'#0E1113',panel:'#14181B',ink:'#E9EBE7',muted:'#7E868C',grid:'#20262A',
           up:'#2BD576',dn:'#FF4D45',accent:'#FF3D7A',warn:'#E8B33A'};
  x.fillStyle=C.bg;x.fillRect(0,0,W,H);
  const bars=S.rows.slice(-100),nb=bars.length;
  const projW=240,chW=W-P.l-P.r-projW,cw=chW/nb,bw=Math.max(2,Math.min(8,cw*0.62));
  let lo=Math.min(lv.sl,lv.tp2),hi=Math.max(lv.sl,lv.tp2);
  for(const b of bars){lo=Math.min(lo,b.l);hi=Math.max(hi,b.h);}
  const pad=(hi-lo)*0.07;lo-=pad;hi+=pad;
  const Y=v=>P.t+(H-P.t-P.b)*(1-(v-lo)/(hi-lo));
  x.fillStyle=C.ink;x.font='bold 17px sans-serif';
  const ttl=`İŞLEM YOK · ${S.disp}/USDT · ${lv.side>0?'YÜKSELİŞ':'DÜŞÜŞ'} PLANI`;
  x.fillText(ttl,P.l,26);
  const tw=x.measureText(ttl).width;
  x.fillStyle=C.accent;x.fillRect(P.l+tw+7,26-13,7,15);
  x.font='11px monospace';
  for(let g=0;g<=4;g++){const v=lo+(hi-lo)*g/4,y=Y(v);
    x.strokeStyle=C.grid;x.beginPath();x.moveTo(P.l,y);x.lineTo(W-P.r,y);x.stroke();
    x.fillStyle=C.muted;x.fillText(fmt(v),W-P.r+6,y+4);}
  for(let i=0;i<nb;i++){const b=bars[i],cx=P.l+cw*(i+.5);
    const col=b.c>=b.o?C.up:C.dn;
    x.strokeStyle=col;x.lineWidth=1;
    x.beginPath();x.moveTo(cx,Y(b.h));x.lineTo(cx,Y(b.l));x.stroke();
    const y1=Y(Math.max(b.o,b.c)),y2=Y(Math.min(b.o,b.c));
    x.fillStyle=col;x.fillRect(cx-bw/2,y1,bw,Math.max(1.5,y2-y1));}
  const nx=P.l+chW,zx1=W-P.r;
  x.strokeStyle=C.muted;x.setLineDash([4,4]);
  x.beginPath();x.moveTo(nx,P.t);x.lineTo(nx,H-P.b);x.stroke();x.setLineDash([]);
  const yE=Y(lv.P0),ySL=Y(lv.sl),yT2=Y(lv.tp2),yT1=lv.tp1?Y(lv.tp1):null;
  x.globalAlpha=.13;
  x.fillStyle=C.dn;x.fillRect(nx,Math.min(yE,ySL),zx1-nx,Math.abs(ySL-yE));
  x.fillStyle=C.up;x.fillRect(nx,Math.min(yE,yT2),zx1-nx,Math.abs(yT2-yE));
  x.globalAlpha=1;
  const lab=(y,txt,col,dash)=>{x.strokeStyle=col;x.lineWidth=1.5;
    if(dash)x.setLineDash([6,4]);
    x.beginPath();x.moveTo(nx,y);x.lineTo(zx1,y);x.stroke();x.setLineDash([]);
    x.fillStyle=col;x.font='12px monospace';x.fillText(txt,nx+6,y-5);};
  lab(yE,'GİRİŞ '+fmt(lv.P0),C.ink,true);
  lab(ySL,'SL '+fmt(lv.sl)+' −1R',C.dn,false);
  if(yT1!==null)lab(yT1,'TP1 '+fmt(lv.tp1)+' +1R',C.up,false);
  lab(yT2,(yT1!==null?'TP2 ':'TP ')+fmt(lv.tp2)+' +'+lv.Rm+'R',C.up,false);
  x.fillStyle=C.muted;x.font='11px monospace';
  x.fillText(`≈${lv.dMed<1?lv.dMed.toFixed(1):Math.round(lv.dMed)} gün · azami ${lv.dMax} gün`,nx+6,H-P.b+18);
  x.fillText('islemyok.com · x.com/islemyok · yatırım tavsiyesi değildir',P.l,H-P.b+18);
  return cv.toBuffer('image/png');
}

/* ---- Telegram ---- */
async function tgText(text,replyTo){
  if(DRY){console.log('\n----- TELEGRAM METİN -----\n'+text);return null;}
  const body={chat_id:CHAT,text,parse_mode:'HTML',disable_web_page_preview:true};
  if(replyTo)body.reply_to_message_id=replyTo;
  const r=await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json();if(!j.ok)throw new Error('Telegram: '+JSON.stringify(j));
  return j.result.message_id;
}
async function tgPhoto(png,caption){
  if(DRY){fs.writeFileSync('/tmp/islemyok-plan.png',png);
    console.log('\n----- TELEGRAM FOTO -> /tmp/islemyok-plan.png -----\n'+caption);return null;}
  const fd=new FormData();
  fd.append('chat_id',CHAT);fd.append('caption',caption);fd.append('parse_mode','HTML');
  fd.append('photo',new Blob([png],{type:'image/png'}),'plan.png');
  const r=await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`,{method:'POST',body:fd});
  const j=await r.json();if(!j.ok)throw new Error('Telegram: '+JSON.stringify(j));
  return j.result.message_id;
}

const FOOT='islemyok.com · Testler: islemyok.com/strateji-testleri.html · X: x.com/islemyok · Yatırım tavsiyesi değildir.';

/* ---- 1) açık sinyalleri güncelle: yalnız kapananlar duyurulur ---- */
async function updateOpen(open,log){
  let closed=0;const still=[];
  for(const s of open){
    let bars;
    try{bars=await klines(s.sym,s.tf);}
    catch(e){log(`${s.disp}: veri alınamadı (${e.message}), atlandı`);still.push(s);continue;}
    const rep=replayPlan(bars,s);
    if(rep.state==='open'||rep.state==='wait'){
      if(rep.half&&!s.half)await DB.markHalf(s.id);
      still.push({...s,_rep:rep,_bars:bars});continue;}

    const R=netR(rep,s,null);
    await DB.closeSignal(s.id,rep.state,rep.at,rep.px,R,rep.half);
    closed++;
    const L={stop:'SL vurdu',be:'girişe çekildi, zarar yok',
             tp2:s.tp1?'TP2 görüldü':'hedef görüldü',expired:'süre doldu'}[rep.state];
    const em={stop:'🔴',be:'⚪',tp2:'🟢',expired:'⚪'}[rep.state];
    await tgText(
`${em} <b>${s.disp} ${s.side>0?'yükseliş':'düşüş'} planı kapandı — ${L}.</b>

Giriş ${fmt(+s.entry)} → çıkış ${fmt(rep.px)}
Sonuç: <b>${R>=0?'+':'−'}${Math.abs(R).toFixed(2)}R</b> (komisyon ve kayma düşülmüş)
Süre: ${sure(rep.at-Number(s.t0))}${rep.half?'\nTP1 alınmıştı, yarısı erken kapandı.':''}

${FOOT}`,s.msg_id?Number(s.msg_id):null);
    log(`kapandı: ${s.disp} ${rep.state} ${R.toFixed(2)}R`);
    await new Promise(r=>setTimeout(r,900));
  }
  return {closed,still};
}

/* ---- 2) yeni sinyaller: açık olanı tekrar duyurma ---- */
async function publishNew(R,still,log){
  const ms=TFMS[TF]||36e5;
  let count=0;
  for(const h of R.hits){
    const sym=h.S.sym;
    const cur=still.find(s=>s.sym===sym&&s.tf===TF);
    const side=h.plan.side;

    if(cur&&cur.side===side){
      const gun=Math.floor((Date.now()-Number(cur.t0))/864e5);
      log(`atlandı: ${h.S.disp} zaten açık (${gun}. gün) — tekrar duyurulmaz`);
      continue;}

    if(cur&&cur.side!==side){
      const rep=cur._rep||replayPlan(cur._bars||[],cur);
      const Rn=netR(rep,cur,null);
      await DB.closeSignal(cur.id,'flipped',Date.now(),rep.px||null,Rn,rep.half);
      await tgText(
`🔁 <b>${cur.disp}: yön döndü.</b>

Açık ${cur.side>0?'yükseliş':'düşüş'} planı kapatıldı (${Rn>=0?'+':'−'}${Math.abs(Rn).toFixed(2)}R).
Tarama artık ters yönde eşiği geçiyor; yeni plan aşağıda.

${FOOT}`,cur.msg_id?Number(cur.msg_id):null);
      log(`yön döndü: ${cur.disp}`);
      await new Promise(r=>setTimeout(r,900));}

    const lv=planLevels(h.S,h.plan);
    const t0=h.S.rows[h.S.rows.length-1].t;
    const id=`${sym}|${TF}|${t0}`;
    const dt=new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'long'});
    const cap=
`<b>${dt} — ${h.S.disp} ${lv.side>0?'YÜKSELİŞ':'DÜŞÜŞ'} planı</b>
Aile-geneli şans eşiği geçildi: beklenen <b>+${lv.ev.toFixed(2)}R</b> ± ${(2*lv.se).toFixed(2)} (eşik +${R.famHi.toFixed(2)}R)

Giriş ${fmt(lv.P0)} · SL ${fmt(lv.sl)} (−%${lv.stopPct.toFixed(2)})${lv.tp1?` · TP1 ${fmt(lv.tp1)}`:''} · ${lv.tp1?'TP2':'TP'} ${fmt(lv.tp2)}
Risk %1 için miktar: paranın %${lv.posPct.toFixed(0)}'i · süre ≈${lv.dMed<1?lv.dMed.toFixed(1):Math.round(lv.dMed)} gün

Kapanışı bu mesajın altına yazılacak. Tek dönem/tek taramadır; boyutu küçük tut.
${FOOT}`;
    const mid=await tgPhoto(planPng(h.S,lv),cap);
    await DB.insertSignal({id,sym,disp:h.S.disp,tf:TF,side,
      entry:lv.P0,sl:lv.sl,tp1:lv.tp1,tp2:lv.tp2,rm:lv.Rm,d_stop:h.plan.dStop,
      ev:lv.ev,se:lv.se,fam_hi:R.famHi,t0,t_end:t0+lv.hz*ms,msg_id:mid});
    count++;log(`yeni sinyal: ${h.S.disp} ${side>0?'long':'short'}`);
    await new Promise(r=>setTimeout(r,1200));}
  return count;
}

/* ---- 3) hiçbir şey olmadıysa: durumu özetle ---- */
async function noTradeMessage(R,still,streak,log){
  if(QUIET){log('işlem yok mesajı kapalı (QUIET_NO_TRADE=1)');return;}
  const dt=new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'long'});
  const best=R.tops.filter(t=>isFinite(t.ev)).sort((a,b)=>b.ev-a.ev)[0];
  /* iki kapi: sans esigi VE kendi hata payi. Esigi gecip hata payinda kalanlar
     "yakin kacan"dir; bunu yazmazsak ekranda esikten buyuk bir sayinin yaninda
     "esik gecilmedi" gorunur ve mesaj kendi kendisiyle celisir. */
  const nearMiss=R.tops.filter(t=>t.okChance&&!t.okErr);
  /* "eşik geçilmedi" kararı, ekranda gösterilen best ile aynı karşılaştırmadan
     (passesThreshold) türer. Best eşiği geçtiği halde (ör. plan zaten açık olduğu
     için yeni sinyal çıkmadıysa) "eşik geçilmedi" yazıp kendimizle çelişmeyiz. */
  const bestGecti=best&&passesThreshold(best.ev,R.famHi);
  const karar=nearMiss.length
    ? `${nearMiss.map(t=>t.disp).join(', ')} şans eşiğini <b>geçti</b> ama ikinci kapıda kaldı: sonuç kendi hata payının içinde, sıfırdan ayırt edilemiyor → işlem önerisi yok.`
    : bestGecti
    ? `${best.disp} şans eşiğini <b>geçti</b> ama açık plan zaten mevcut → yeni işlem önerisi yok.`
    : `Eşik geçilmedi → işlem önerisi yok. Pozitif sayı bulmak kolay; şansı yenmek zor.`;

  let acik='';
  if(still.length){
    const sat=still.map(s=>{
      const pr=s._bars?progress(s._bars,s):null;
      const kalan=Number(s.t_end)-Date.now();
      const yon=pr&&pr.yon?({yaklaşıyor:'hedefe yaklaşıyor',uzaklaşıyor:'hedeften uzaklaşıyor',yatay:'yatay'})[pr.yon]:'yeni';
      return `• ${s.disp} ${s.side>0?'yükseliş':'düşüş'} · ${pr?`yolun %${Math.round(pr.yol*100)}'i`:'—'} · ${yon} · vade ${kalan>0?sure(kalan):'doldu'}`;}).join('\n');
    acik=`\n\n<b>Açık planlar (${still.length})</b>\n${sat}`;}

  await tgText(
`<b>${dt} — bugün de işlem yok.</b>${streak>1?`\n${streak} gündür yeni plan çıkmadı.`:''}

${R.cores} varlık × ${R.combos} kombinasyon tarandı.
En iyi sonuç: ${best?best.disp+' '+(best.ev>=0?'+':'−')+Math.abs(best.ev).toFixed(2)+'R'+(isFinite(best.se)?' ± '+(2*best.se).toFixed(2):''):'—'}
Şansın verdiği eşik: +${R.famHi.toFixed(2)}R

${karar}${acik}

${FOOT}`);
  log('işlem yok mesajı gönderildi');
}

/* ---- günlük koşu ---- */
async function daily(){
  const t0=Date.now();
  const log=m=>console.log('  ',m);
  console.log(new Date().toISOString(),'koşu başlıyor…');

  const dbOn=await DB.ensureSchema();
  if(!dbOn)console.warn('  UYARI: DATABASE_URL yok — durum tutulmuyor, tekrar koruması ÇALIŞMIYOR.');

  const open=await DB.openSignals();
  log(`açık sinyal: ${open.length}`);
  const {closed,still}=await updateOpen(open,log);

  const R=await scanMarket(TF,log);
  const newSigs=await publishNew(R,still,log);

  if(!newSigs&&!closed)await noTradeMessage(R,still,await DB.silentStreak(),log);

  const best=R.tops.filter(t=>isFinite(t.ev)).sort((a,b)=>b.ev-a.ev)[0];
  await DB.logRun({tf:TF,cores:R.cores,combos:R.combos,famHi:R.famHi,
    newSigs,closed,bestDisp:best&&best.disp,bestEv:best&&best.ev});

  try{await exportSignals(await DB.recentSignals(200),await DB.runStats());}
  catch(e){console.error('  dışa aktarım hatası:',e.message);}

  if(R.fails.length)console.log('atlanan:',R.fails.join(' | '));
  console.log(`bitti · yeni ${newSigs} · kapanan ${closed} · ${((Date.now()-t0)/1000).toFixed(0)} sn`);
}

/* ---- zamanlama ---- */
if(process.env.RUN_ON_START==='1'||DRY){
  daily().catch(e=>{console.error('HATA:',e);process.exitCode=1;});
}
if(!DRY){
  cron.schedule(process.env.CRON||'0 6 * * *',()=>{
    daily().catch(e=>console.error('HATA:',e));});
  console.log('İşlem Yok worker hazır · cron:',process.env.CRON||'0 6 * * *',
    'UTC · kanal:',CHAT,'· durum:',DB.enabled?'Neon':'YOK (tekrar koruması kapalı)');
}
