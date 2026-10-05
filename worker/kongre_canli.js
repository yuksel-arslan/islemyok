/* İşlem Yok — Kongre takibi, canlı günlük koşu (bot.js çağırır, KONGRE=1).
   1) bekleyen/açık planları günceller: giriş = bildirimden sonraki ilk açılış, çıkış = tutus. kapanış
   2) son 3 günde bildirilmiş yeni alışları TEK mesajda yayınlar (aynı hisse açıksa yeniden açmaz)
   Kural ve oynatma backtest'le birebir aynıdır (kongre.js KURAL/olaylar). Durum Neon'da (kongre tablosu);
   DATABASE_URL yoksa çalışmaz — yoksa aynı bildirim her gün yeniden duyurulurdu. */
'use strict';
const V=require('./kongre_veri');
const PX=require('./kongre_fiyat');
const {KURAL,olaylar,sonucOzet,pct}=require('./kongre');

const tarihTR=d=>new Date(d+'T12:00:00Z').toLocaleDateString('tr-TR',{day:'numeric',month:'short'});
const gun=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const usd=x=>'$'+Math.round(x).toLocaleString('en-US');

/* saf: açık bir planın durumunu barlardan hesapla (test edilebilir) */
function ilerlet(r,b,spy,k=KURAL){
  if(r.state==='wait'){
    const i=PX.firstAfter(b,r.filed),si=PX.firstAfter(spy,r.filed);
    if(i<0||si<0)return null;
    r={...r,state:'open',entry_d:b[i].d,entry:b[i].o,spy_entry:spy[si].o,_giris:true};}
  if(r.state==='open'){
    const i=b.findIndex(x=>x.d===r.entry_d),j=i+k.tutus-1;
    if(i<0||j>=b.length)return r._giris?r:null;
    const sj=PX.lastOnOrBefore(spy,b[j].d);
    const ret=Math.log(b[j].c/r.entry)-k.maliyet,sret=Math.log(spy[sj].c/r.spy_entry);
    return {...r,state:'closed',exit_d:b[j].d,exit_px:b[j].c,spy_exit:spy[sj].c,ret,sret,ex:ret-sret};}
  return null;
}

function yeniMesaj(evs,now,FOOT){
  const dt=now.toLocaleDateString('tr-TR',{day:'numeric',month:'long'});
  const sat=evs.map(e=>`• <b>${e.ticker}</b> — ${e.members.join(', ')} · işlem ${e.traded?tarihTR(e.traded):'?'}, bildirim ${tarihTR(e.filed)}${e.traded?` (${gun(e.traded,e.filed)} gün gecikme)`:''} · ${usd(e.amtLo)}+`).join('\n');
  return `🏛 <b>${dt} — Kongre alışları (${evs.length})</b>

${sat}

Plan: bir sonraki ABD açılışında <b>AL</b>, ${KURAL.tutus} işlem günü (~3 ay) tut, sonucu SPY ile kıyasla. Stop yok; boyutu küçük tut.
${sonucOzet()}

${FOOT}`;
}
function kapanisMesaj(rs,FOOT){
  const sat=rs.map(r=>`• <b>${r.ticker}</b> ${pct(r.ret)} · SPY ${pct(r.sret)} → fark <b>${pct(r.ex)}</b>`).join('\n');
  return `🏁 <b>Kongre planları kapandı (${rs.length})</b>
${KURAL.tutus} işlem günü doldu; bildirimden sonraki açılıştan bugünkü kapanışa, 10bp maliyet düşülmüş.

${sat}

${FOOT}`;
}

async function kongreGunluk({DB,tgText,log,FOOT='',now=new Date()}){
  if(!DB.enabled){log('kongre: DATABASE_URL yok — atlandı (tekrar koruması gerekli)');return {yeni:0,kapanan:0};}
  const spy=await PX.bars(KURAL.kiyas,{maxAgeH:6});

  /* 1) açık/bekleyen planlar */
  const aktif=await DB.kongreAktif(),kapanan=[];
  for(const r of aktif){
    let b;try{b=await PX.bars(r.ticker,{maxAgeH:6});}catch(e){log(`kongre ${r.ticker}: fiyat yok (${e.message})`);continue;}
    const n=ilerlet({...r,entry:r.entry==null?null:+r.entry,spy_entry:r.spy_entry==null?null:+r.spy_entry},b,spy);
    if(!n)continue;
    if(n._giris)await DB.kongreGiris(r.id,n.entry_d,n.entry,n.spy_entry);
    if(n.state==='closed'){await DB.kongreKapat(r.id,n.exit_d,n.exit_px,n.spy_exit,n.ex);kapanan.push(n);}}

  /* 2) yeni bildirimler */
  const since=new Date(now.getTime()-3*864e5).toISOString().slice(0,10);
  const yNow=now.getUTCFullYear();
  const {tx,stats}=await V.fetchAll({fromYear:since.slice(0,4)<String(yNow)?yNow-1:yNow,since,log});
  log(`kongre: ${tx.length} işlem (${JSON.stringify(stats)})`);
  const acik=new Set(aktif.filter(r=>!kapanan.some(k=>k.id===r.id)).map(r=>r.ticker));
  const yeni=[];
  for(const e of olaylar(tx).filter(e=>e.filed>=since)){
    if(await DB.kongreVar(e.id))continue;
    if(acik.has(e.ticker)){log(`kongre: ${e.ticker} zaten açık — atlandı`);continue;}
    acik.add(e.ticker);yeni.push(e);}

  if(yeni.length){
    const mid=await tgText(yeniMesaj(yeni,now,FOOT));
    for(const e of yeni)await DB.kongreEkle({id:e.id,ticker:e.ticker,members:e.members.join(', '),
      filed:e.filed,traded:e.traded,amt_lo:e.amtLo,msg_id:mid});}
  if(kapanan.length)await tgText(kapanisMesaj(kapanan,FOOT));
  log(`kongre: yeni ${yeni.length} · kapanan ${kapanan.length}`);
  return {yeni:yeni.length,kapanan:kapanan.length};
}

module.exports={kongreGunluk,ilerlet,yeniMesaj,kapanisMesaj};
