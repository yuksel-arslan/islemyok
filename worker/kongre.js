/* İşlem Yok — Kongre takibi: ABD politikacılarının bildirdiği hisse alışlarını izleyip aynı yönde
   işlem planı üretir. Kural backtest'ten ÖNCE sabitlendi (KURAL); sonuç görüldükten sonra değişmez.

   Look-ahead yok: giriş İŞLEM tarihinde değil, BİLDİRİM tarihinden sonraki ilk ABD açılışında.
   (Kongre işlemi 45 güne kadar geç bildirebilir; "Kongre piyasayı yener" iddialarının çoğu işlem
   tarihini kullanır, o tarihte işlem yapmak mümkün değildir.)

   CLI:
     node kongre.js --fetch [--from 2019]           bildirimleri indir/ayrıştır (önbellek), sağlık raporu
     node kongre.js --backtest [--from 2019] [--json kongre-sonuc.json] [--csv k.csv] [--controls 200] [--karsilastir]
     node kongre.js --now [--days 7]                son bildirimlerden çıkan sinyaller (yayın yok) */
'use strict';
const fs=require('fs'),path=require('path');
const V=require('./kongre_veri');
const PX=require('./kongre_fiyat');

const KURAL={
  tur:'P',            /* yalnız alış; satışlar vergi/çeşitlendirme gürültüsü taşır */
  varlik:'ST',        /* yalnız hisse (opsiyon/fon/tahvil hariç) */
  minTutar:15001,     /* en küçük dilim ($1.001–15.000) hariç */
  tutus:60,           /* işlem günü (~3 ay) */
  maliyet:0.001,      /* gidiş-dönüş 10bp */
  kiyas:'SPY',
  karar:{n:30,t:2.5,p:0.02}   /* n≥30 ∧ t≥2.5 (aylık kümeli) ∧ iki yarı>0 ∧ p_şans≤0.02 */
};
const SONUC=path.join(__dirname,'kongre-sonuc.json');

/* ---- işlemler -> olaylar: aynı gün aynı hisseyi alanlar tek olay ---- */
function olaylar(tx,k=KURAL){
  const m=new Map();
  for(const t of tx){
    if(t.type!==k.tur||t.asset!==k.varlik||!t.ticker||!t.filed||!(t.amtLo>=k.minTutar))continue;
    const id=`${t.ticker}|${t.filed}`;
    const e=m.get(id)||{id,ticker:t.ticker,filed:t.filed,members:[],traded:t.traded,amtLo:0,amtHi:0,src:new Set()};
    if(!e.members.includes(t.member))e.members.push(t.member);
    if(t.traded&&(!e.traded||t.traded<e.traded))e.traded=t.traded;
    e.amtLo+=t.amtLo;e.amtHi+=t.amtHi;e.src.add(t.src);
    m.set(id,e);}
  return [...m.values()].map(e=>({...e,src:[...e.src]})).sort((a,b)=>a.filed<b.filed?-1:a.filed>b.filed?1:0);
}

/* ---- oynatma: giriş = bildirimden sonraki ilk açılış, çıkış = tutus. günün kapanışı.
   Aynı hisse açıkken yeni olay açılmaz (canlıyla aynı). ---- */
function oynat(evs,barsOf,spy,k=KURAL){
  const trades=[],openUntil={};
  for(const e of evs){
    const b=barsOf(e.ticker);if(!b||!b.length)continue;
    const i=PX.firstAfter(b,e.filed);if(i<0)continue;
    const j=i+k.tutus-1;if(j>=b.length)continue;            /* henüz kapanmadı */
    if(openUntil[e.ticker]&&openUntil[e.ticker]>=b[i].d)continue;
    const si=PX.firstAfter(spy,e.filed),sj=PX.lastOnOrBefore(spy,b[j].d);
    if(si<0||sj<=si)continue;
    const ret=Math.log(b[j].c/b[i].o)-k.maliyet;
    const sret=Math.log(spy[sj].c/spy[si].o);
    openUntil[e.ticker]=b[j].d;
    trades.push({...e,giris:b[i].d,cikis:b[j].d,px0:b[i].o,px1:b[j].c,ret,sret,ex:ret-sret});}
  return trades;
}

const mean=a=>a.reduce((s,x)=>s+x,0)/(a.length||1);
function tStat(a){if(a.length<2)return NaN;const m=mean(a),v=a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1);
  return v>0?m/Math.sqrt(v/a.length):NaN;}
/* işlemler zamanda üst üste biner; t aylık kümelerden (giriş ayı) hesaplanır */
function tAylik(trades){const g={};
  for(const t of trades)(g[t.giris.slice(0,7)]=g[t.giris.slice(0,7)]||[]).push(t.ex);
  return tStat(Object.values(g).map(mean));}

/* maymun: aynı giriş/çıkış tarihleri, rastgele hisse (evrenden, o tarihlerde fiyatı olan) */
function maymun(trades,barsOf,spy,tickers,K,seed=7,k=KURAL){
  let x=seed|1;const rnd=()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/4294967296;
  const out=[];
  for(let r=0;r<K;r++){const ex=[];
    for(const t of trades){
      for(let tries=0;tries<20;tries++){
        const b=barsOf(tickers[Math.floor(rnd()*tickers.length)]);if(!b||!b.length)continue;
        const i=PX.firstAfter(b,t.filed),j=PX.lastOnOrBefore(b,t.cikis);
        if(i<0||j<=i||b[i].d!==t.giris)continue;
        ex.push(Math.log(b[j].c/b[i].o)-k.maliyet-t.sret);break;}}
    out.push(mean(ex));}
  return out;
}

function rapor(trades,ctrl,k=KURAL){
  const ex=trades.map(t=>t.ex),n=ex.length,mid=Math.floor(n/2);
  const h1=mean(ex.slice(0,mid)),h2=mean(ex.slice(mid));
  const m=mean(ex),t=tAylik(trades);
  const p=ctrl.length?(ctrl.filter(c=>c>=m).length+1)/(ctrl.length+1):NaN;
  const kz=ex.filter(x=>x>0).length/(n||1);
  const gecti=n>=k.karar.n&&t>=k.karar.t&&h1>0&&h2>0&&p<=k.karar.p;
  return {n,ortEx:m,ortRet:mean(trades.map(x=>x.ret)),ortSpy:mean(trades.map(x=>x.sret)),
    t,yari1:h1,yari2:h2,pSans:p,maymunOrt:mean(ctrl),kazanma:kz,karar:gecti?'GEÇTİ':'GEÇMEDİ',
    ilk:trades[0]?.giris||null,son:trades[n-1]?.cikis||null};
}

/* TEŞHİS (canlıda kullanılamaz): aynı işlemler politikacının İŞLEM günü kapanışından girilseydi.
   Ayrıca işlem günü → bizim girişimiz arasında SPY'ye göre kaçan getiri ("gecikme payı").
   Bu modda o gün bilinmeyen bilgi kullanılır; yalnız kazancın gecikmeye gidip gitmediğini ölçer. */
function islemTarihli(trades,barsOf,spy,k=KURAL){
  const out=[];
  for(const t of trades){
    if(!t.traded||t.traded>t.filed)continue;
    const b=barsOf(t.ticker),i=PX.firstOnOrAfter(b,t.traded);
    if(i<0||b[i].d>=t.giris)continue;                 /* işlem günü barı bizim girişten önce olmalı */
    const j=i+k.tutus-1;if(j>=b.length)continue;
    const si=PX.firstOnOrAfter(spy,t.traded),sj=PX.lastOnOrBefore(spy,b[j].d);
    const se=PX.firstAfter(spy,t.filed);
    if(si<0||sj<=si||se<0)continue;
    const ret=Math.log(b[j].c/b[i].c)-k.maliyet,sret=Math.log(spy[sj].c/spy[si].c);
    const gecik=Math.log(t.px0/b[i].c)-Math.log(spy[se].o/spy[si].c);
    out.push({...t,giris:b[i].d,cikis:b[j].d,ret,sret,ex:ret-sret,gecik,gun:Math.round((Date.parse(t.filed)-Date.parse(t.traded))/864e5)});}
  return out;
}

const pct=x=>(x>=0?'+':'−')+'%'+Math.abs((Math.exp(x)-1)*100).toFixed(2);

/* ---- sonucun tek satırlık özeti (mesajlar için) ---- */
function sonucOzet(){
  let s;try{s=JSON.parse(fs.readFileSync(SONUC,'utf8'));}catch(e){return 'Backtest henüz koşmadı — sonuç bilinmiyor.';}
  const r=s.sonuc;
  return `Backtest (${r.ilk?.slice(0,4)}–${r.son?.slice(0,4)}, n=${r.n}, bildirim tarihinden): SPY'ye göre ort. ${pct(r.ortEx)}/işlem, t=${r.t.toFixed(2)}, şans p=${r.pSans.toFixed(2)} → <b>${r.karar}</b>`;
}

/* ================= CLI ================= */
async function cli(){
  const a=process.argv.slice(2),opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
  const log=m=>console.log('  '+m);
  const fromYear=+opt('--from',2019);
  const txFile=path.join(V.CACHE,'tx.json');

  if(a.includes('--fetch')){
    const {tx,stats}=await V.fetchAll({fromYear,log});
    fs.writeFileSync(txFile,JSON.stringify(tx));
    const ev=olaylar(tx);
    console.log(`\nişlem: ${tx.length} · alış(hisse,≥$15k) olayı: ${ev.length}`);
    console.log('sağlık:',JSON.stringify(stats));
    /* ayrıştırıcı sessizce bozulursa backtest boş veriyle "geçmedi" der — bunu engelle */
    const elek=stats.houseDocs-stats.housePaper-stats.houseMissing-stats.houseEmpty;
    const oran=elek?stats.houseNoTx/elek:0;
    console.log(`Meclis: metinli PTR ${elek}, işlem çıkmayan %${(oran*100).toFixed(0)}`);
    if(elek>200&&oran>0.4){console.error('HATA: Meclis PTR ayrıştırma oranı düşük — PDF düzeni değişmiş olabilir');process.exit(4);}
    if(!tx.length){console.error('HATA: hiç işlem ayrıştırılamadı');process.exit(4);}
  }

  if(a.includes('--backtest')){
    const tx=JSON.parse(fs.readFileSync(txFile,'utf8')).filter(t=>t.filed>=`${fromYear}-01-01`);
    const ev=olaylar(tx);
    const tickers=[...new Set(ev.map(e=>e.ticker))];
    log(`${ev.length} olay, ${tickers.length} hisse — fiyatlar…`);
    const cache={};let miss=0;
    const spy=await PX.bars(KURAL.kiyas,{maxAgeH:24});
    for(const [i,t] of tickers.entries()){
      try{cache[t]=await PX.bars(t,{maxAgeH:24*7});}catch(e){cache[t]=[];}
      if(!cache[t].length)miss++;
      if(i%100===0)log(`${i}/${tickers.length}`);}
    const barsOf=t=>cache[t];
    const trades=oynat(ev,barsOf,spy);
    const uni=tickers.filter(t=>cache[t].length>KURAL.tutus);
    const K=+opt('--controls',200);
    const ctrl=maymun(trades,barsOf,spy,uni,K);
    const r=rapor(trades,ctrl);
    console.log(`\nKONGRE ALIŞ TAKİBİ — bildirimden sonraki açılışta al, ${KURAL.tutus} işlem günü tut, SPY'ye karşı`);
    console.log(`fiyatı bulunamayan hisse: ${miss}/${tickers.length}`);
    console.log(`n=${r.n}  ort.getiri ${pct(r.ortRet)}  SPY ${pct(r.ortSpy)}  fark ${pct(r.ortEx)}  kazanma %${(r.kazanma*100).toFixed(0)}`);
    console.log(`t(aylık küme)=${r.t.toFixed(2)}  yarılar ${pct(r.yari1)} / ${pct(r.yari2)}  maymun ort ${pct(r.maymunOrt)}  p_şans=${r.pSans.toFixed(3)}`);
    console.log(`KARAR: ${r.karar}  (kural: n≥${KURAL.karar.n} ∧ t≥${KURAL.karar.t} ∧ iki yarı>0 ∧ p≤${KURAL.karar.p})`);
    let kars=null;
    if(a.includes('--karsilastir')){
      const it=islemTarihli(trades,barsOf,spy);
      const ids=new Set(it.map(x=>x.id)),ayni=trades.filter(x=>ids.has(x.id));
      const ri=rapor(it,[]),rb=rapor(ayni,[]);
      const gun=it.map(x=>x.gun).sort((a,b)=>a-b);
      kars={n:it.length,medyanGecikmeGun:gun[Math.floor(gun.length/2)]||null,
        islemTarihli:{ortEx:ri.ortEx,t:ri.t,yari1:ri.yari1,yari2:ri.yari2,kazanma:ri.kazanma},
        bildirimTarihli:{ortEx:rb.ortEx,t:rb.t,yari1:rb.yari1,yari2:rb.yari2,kazanma:rb.kazanma},
        gecikmePayi:mean(it.map(x=>x.gecik))};
      console.log(`\nKARŞILAŞTIRMA (aynı ${it.length} işlem, medyan gecikme ${kars.medyanGecikmeGun} gün) — işlem tarihi canlıda KULLANILAMAZ, yalnız teşhis`);
      console.log(`işlem günü kapanışından  : fark ${pct(ri.ortEx)}/işlem  t=${ri.t.toFixed(2)}  yarılar ${pct(ri.yari1)} / ${pct(ri.yari2)}  kazanma %${(ri.kazanma*100).toFixed(0)}`);
      console.log(`bildirimden sonra (gerçek): fark ${pct(rb.ortEx)}/işlem  t=${rb.t.toFixed(2)}  yarılar ${pct(rb.yari1)} / ${pct(rb.yari2)}  kazanma %${(rb.kazanma*100).toFixed(0)}`);
      console.log(`işlem günü → bizim giriş arası SPY'ye göre ort: ${pct(kars.gecikmePayi)} (gecikmede kaçan/kurtulan)`);}
    const out=opt('--json');
    if(out)fs.writeFileSync(out,JSON.stringify({tarih:new Date().toISOString().slice(0,10),kural:KURAL,
      fiyatYok:miss,hisse:tickers.length,sonuc:r,...(kars?{karsilastirma:kars}:{})},null,1)+'\n');
    const csv=opt('--csv');
    if(csv)fs.writeFileSync(csv,'ticker,bildirim,islem,giris,cikis,uye,ret,spy,ex\n'+
      trades.map(t=>[t.ticker,t.filed,t.traded,t.giris,t.cikis,'"'+t.members.join('; ')+'"',t.ret.toFixed(5),t.sret.toFixed(5),t.ex.toFixed(5)].join(',')).join('\n')+'\n');
  }

  if(a.includes('--now')){
    const yNow=new Date().getUTCFullYear();
    const {tx}=await V.fetchAll({fromYear:yNow,log});
    const since=new Date(Date.now()-(+opt('--days',7))*864e5).toISOString().slice(0,10);
    for(const e of olaylar(tx).filter(e=>e.filed>=since))
      console.log(`${e.filed}  ${e.ticker.padEnd(6)} ${e.members.join(', ')}  işlem ${e.traded}  $${e.amtLo.toLocaleString('en-US')}+`);
  }
}

module.exports={KURAL,olaylar,oynat,islemTarihli,maymun,rapor,tAylik,sonucOzet,pct,SONUC};
if(require.main===module)cli().catch(e=>{console.error(e.message||e);process.exit(1);});
