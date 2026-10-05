'use strict';
const test=require('node:test');const assert=require('node:assert');
const os=require('os'),path=require('path'),fs=require('fs');
process.env.CACHE_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'kongre-'));
const V=require('./kongre_veri');
const K=require('./kongre');
const {ilerlet,yeniMesaj}=require('./kongre_canli');

const XML=`<?xml version="1.0"?><FinancialDisclosure>
<Member><Prefix>Hon.</Prefix><Last>Pelosi</Last><First>Nancy</First><Suffix /><FilingType>P</FilingType><StateDst>CA11</StateDst><Year>2024</Year><FilingDate>1/19/2024</FilingDate><DocID>20024142</DocID></Member>
<Member><Prefix>Hon.</Prefix><Last>Doe</Last><First>John</First><Suffix /><FilingType>O</FilingType><StateDst>TX01</StateDst><Year>2024</Year><FilingDate>5/15/2024</FilingDate><DocID>10059999</DocID></Member>
<Member><Prefix /><Last>Roe</Last><First>Jane</First><Suffix /><FilingType>P</FilingType><StateDst>NY12</StateDst><Year>2024</Year><FilingDate>2/2/2024</FilingDate><DocID>8221234</DocID></Member>
</FinancialDisclosure>`;

test('Meclis endeksi: yalnız PTR, tarih ISO', ()=>{
  const r=V.parseHouseIndex(XML);
  assert.deepStrictEqual(r.map(x=>x.doc),['20024142','8221234']);
  assert.strictEqual(r[0].member,'Nancy Pelosi');assert.strictEqual(r[0].filed,'2024-01-19');assert.strictEqual(r[0].year,2024);
});

test('Meclis endeksi: zip indirilir, açılır, önbelleğe yazılır', async()=>{
  const {zipSync,strToU8}=require('fflate');
  const z=zipSync({'2024FD.txt':strToU8('x'),'2024FD.xml':strToU8(XML)});
  const orig=global.fetch;let calls=0;
  global.fetch=async u=>{calls++;assert.match(String(u),/2024FD\.zip$/);return new Response(z);};
  try{
    assert.strictEqual((await V.houseIndex(2024)).length,2);
    assert.strictEqual((await V.houseIndex(2024)).length,2);
    assert.strictEqual(calls,1,'ikinci çağrı önbellekten');
  }finally{global.fetch=orig;}
});

const PTR=`Filing ID #20024142 ID Owner Asset Transaction Type Date Notification Date Amount Cap. Gains > $200?
SP Alphabet Inc. - Class A Common Stock (GOOG
L) [ST] P 01/14/2024 01/14/2024 $250,001 - $500,000 F S : New
SP NVIDIA Corporation - Common Stock (NVDA) [OP] P 12/20/2023 12/20/2023 $1,000,001 - $5,000,000
JT Microsoft Corporation (MSFT) [ST] S (partial) 12/29/2023 12/29/2023 $1,001 - $15,000
Apple Inc. (AAPL) [ST] S 01/02/2024 01/03/2024 Over $50,000,000
Berkshire Hathaway Inc. New (BRK.B) [ST] P 1/5/2024 1/8/2024 $15,001 -
$50,000`;

test('Meclis PTR metni: ticker bölünmesi, kısmi satış, "Over", noktalı ticker', ()=>{
  const r=V.parseHousePtrText(PTR);
  assert.deepStrictEqual(r.map(x=>[x.ticker,x.asset,x.type]),
    [['GOOGL','ST','P'],['NVDA','OP','P'],['MSFT','ST','SP'],['AAPL','ST','S'],['BRK.B','ST','P']]);
  assert.strictEqual(r[0].traded,'2024-01-14');assert.deepStrictEqual([r[0].amtLo,r[0].amtHi],[250001,500000]);
  assert.strictEqual(r[3].amtHi,Infinity);assert.strictEqual(r[4].amtHi,50000);assert.strictEqual(r[4].traded,'2024-01-05');
});

/* gerçek bir PDF baytı -> pdfjs -> ayrıştırıcı (uçtan uca, ağ yok) */
function miniPdf(lines){
  const body='BT /F1 9 Tf 40 800 Td 11 TL '+lines.map(l=>`(${l.replace(/[()\\]/g,m=>'\\'+m)}) Tj T*`).join(' ')+' ET';
  const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${body.length} >>\nstream\n${body}\nendstream`];
  let s='%PDF-1.4\n';const off=[];
  objs.forEach((o,i)=>{off.push(s.length);s+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const x=s.length;
  s+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  s+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(s,'latin1');
}
test('PDF uçtan uca: pdfjs metni ayrıştırıcıya uyar', async()=>{
  const txt=await V.pdfText(miniPdf(['SP Alphabet Inc. - Class A (GOOGL) [ST] P 01/14/2024 01/14/2024 $250,001 -','$500,000',
    'Tesla, Inc. (TSLA) [ST] S 01/10/2024 01/11/2024 $1,001 - $15,000']));
  const r=V.parseHousePtrText(txt);
  assert.deepStrictEqual(r.map(x=>[x.ticker,x.type,x.amtLo,x.amtHi]),[['GOOGL','P',250001,500000],['TSLA','S',1001,15000]]);
});

test('Senato: arama satırı ve PTR tablosu', ()=>{
  const row=V.parseSenateRow(['Thomas H','Tuberville','Tuberville, Tommy (Senator)','<a href="/search/view/ptr/9a8b-7c6d/" target="_blank">Periodic Transaction Report for 01/05/2024</a>','01/08/2024']);
  assert.deepStrictEqual([row.doc,row.kind,row.member,row.filed],['9a8b-7c6d','ptr','Thomas H Tuberville','2024-01-08']);
  assert.strictEqual(V.parseSenateRow(['A','B','x','<a href="/search/view/paper/ZZ/">x</a>','02/01/2024']).kind,'paper');
  const html=`<table><thead><tr><th>#</th></tr></thead><tbody>
  <tr><td>1</td><td>01/02/2024</td><td>Spouse</td><td><a href="https://finance.yahoo.com/quote/AAPL">AAPL</a></td><td>Apple Inc</td><td>Stock</td><td>Purchase</td><td>$15,001 - $50,000</td><td>--</td></tr>
  <tr><td>2</td><td>01/03/2024</td><td>Self</td><td>--</td><td>US Treasury Bill</td><td>Other Securities</td><td>Purchase</td><td>$1,001 - $15,000</td><td>--</td></tr>
  <tr><td>3</td><td>01/04/2024</td><td>Joint</td><td>MSFT</td><td>Microsoft &amp; Co</td><td>Stock</td><td>Sale (Partial)</td><td>$50,001 - $100,000</td><td>--</td></tr>
  </tbody></table>`;
  const tx=V.parseSenatePtrHtml(html);
  assert.deepStrictEqual(tx.map(t=>[t.ticker,t.asset,t.type,t.amtLo]),[['AAPL','ST','P',15001],['','Other Securities','P',1001],['MSFT','ST','SP',50001]]);
});

const T=(o)=>({src:'house',member:'A',filed:'2024-01-10',traded:'2024-01-02',ticker:'XYZ',asset:'ST',type:'P',amtLo:15001,amtHi:50000,...o});
test('olaylar: yalnız hisse alışı ≥$15k; aynı gün aynı hisse tek olay', ()=>{
  const ev=K.olaylar([T(),T({member:'B',traded:'2023-12-28',amtLo:50001}),T({type:'S'}),T({asset:'OP'}),
    T({amtLo:1001}),T({ticker:''}),T({ticker:'ABC',filed:'2024-01-05'})]);
  assert.deepStrictEqual(ev.map(e=>e.id),['ABC|2024-01-05','XYZ|2024-01-10']);
  assert.deepStrictEqual(ev[1].members,['A','B']);assert.strictEqual(ev[1].traded,'2023-12-28');assert.strictEqual(ev[1].amtLo,65002);
});

/* iş günü barları: d0'dan itibaren n gün, fiyat f(i) */
function seri(d0,n,f){const out=[];let t=Date.parse(d0);
  for(let i=0;out.length<n;t+=864e5){const g=new Date(t).getUTCDay();if(g===0||g===6)continue;
    const p=f(out.length);out.push({d:new Date(t).toISOString().slice(0,10),o:p,c:p*1.001});}
  return out;}
const k5={...K.KURAL,tutus:5};

test('oynat: giriş bildirim gününden SONRAKİ açılış; açıkken aynı hisse tekrar açılmaz; fark SPY\'ye göre', ()=>{
  const b=seri('2024-01-08',40,i=>100+i), spy=seri('2024-01-08',40,()=>400);
  const ev=K.olaylar([T({filed:'2024-01-10'}),T({filed:'2024-01-11'}),T({filed:'2024-01-20'})]);
  const tr=K.oynat(ev,()=>b,spy,k5);
  assert.deepStrictEqual(tr.map(t=>t.giris),['2024-01-11','2024-01-22'],'2024-01-11 bildirimi açık plana denk geldi');
  const t0=tr[0];
  assert.strictEqual(t0.px0,b[3].o);assert.strictEqual(t0.cikis,b[7].d);
  assert.ok(Math.abs(t0.ret-(Math.log(b[7].c/b[3].o)-0.001))<1e-12);
  assert.ok(Math.abs(t0.ex-(t0.ret-Math.log(400*1.001/400)))<1e-12);
  /* süresi dolmamış plan backtest'e girmez */
  assert.strictEqual(K.oynat(K.olaylar([T({filed:'2024-02-28'})]),()=>b,spy,k5).length,0);
});

test('maymun ve rapor: aynı tarihler, deterministik, karar kuralı', ()=>{
  const spy=seri('2023-01-02',400,()=>400);
  const iyi=seri('2023-01-02',400,i=>100*Math.exp(0.004*i));        /* sürekli yükselen */
  const kotu=seri('2023-01-02',400,i=>100*Math.exp(-0.001*i));
  const bars={GOOD:iyi,BAD1:kotu,BAD2:kotu,BAD3:kotu};
  const tx=[];for(let i=0;i<60;i++)tx.push(T({ticker:'GOOD',filed:spy[i*6].d}));
  const tr=K.oynat(K.olaylar(tx),t=>bars[t],spy,k5);
  assert.strictEqual(tr.length,60);
  const c1=K.maymun(tr,t=>bars[t],spy,Object.keys(bars),50,7,k5),c2=K.maymun(tr,t=>bars[t],spy,Object.keys(bars),50,7,k5);
  assert.deepStrictEqual(c1,c2);
  const r=K.rapor(tr,c1,k5);
  assert.strictEqual(r.n,60);assert.ok(r.ortEx>0);assert.ok(r.pSans<0.05);
  /* t sonsuz/NaN olabilir (fark sabit) — kural NaN'da geçirmez */
  const r2=K.rapor(tr.slice(0,10),c1,k5);assert.strictEqual(r2.karar,'GEÇMEDİ','n<30');
});

test('canlı ilerlet = backtest oynat (aynı giriş/çıkış/fark)', ()=>{
  const b=seri('2024-01-08',40,i=>100+i*0.7), spy=seri('2024-01-08',40,i=>400+i);
  const ev=K.olaylar([T({filed:'2024-01-10'})]);
  const bt=K.oynat(ev,()=>b,spy,k5)[0];
  const r0={id:ev[0].id,ticker:'XYZ',filed:'2024-01-10',state:'wait',entry:null,spy_entry:null};
  assert.strictEqual(ilerlet(r0,b.slice(0,3),spy.slice(0,3),k5),null,'bildirimden sonra bar yok → bekle');
  const ac=ilerlet(r0,b.slice(0,5),spy.slice(0,5),k5);assert.strictEqual(ac.state,'open');assert.strictEqual(ac.entry_d,bt.giris);
  const kp=ilerlet(ac,b,spy,k5);
  assert.strictEqual(kp.state,'closed');assert.strictEqual(kp.exit_d,bt.cikis);assert.ok(Math.abs(kp.ex-bt.ex)<1e-12);
  /* tek koşuda bekle→kapan da çalışır */
  assert.ok(Math.abs(ilerlet(r0,b,spy,k5).ex-bt.ex)<1e-12);
});

test('yeni mesaj: gecikme ve backtest satırı (sonuç dosyası yoksa dürüstçe söyler)', ()=>{
  const ev=K.olaylar([T({member:'Nancy Pelosi',ticker:'NVDA',traded:'2024-01-02',filed:'2024-01-10'})]);
  const m=yeniMesaj(ev,new Date('2024-01-11T06:00:00Z'),'FOOT');
  assert.match(m,/NVDA/);assert.match(m,/8 gün gecikme/);assert.match(m,/AL/);
  if(!fs.existsSync(K.SONUC))assert.match(m,/Backtest henüz koşmadı/);
});

test('işlem tarihli teşhis: giriş işlem günü kapanışı; gecikme payı = işlem günü → bizim giriş', ()=>{
  const b=seri('2024-01-08',40,i=>100+i), spy=seri('2024-01-08',40,()=>400);
  const tr=K.oynat(K.olaylar([T({traded:'2024-01-08',filed:'2024-01-10'})]),()=>b,spy,k5);
  const it=K.islemTarihli(tr,()=>b,spy,k5);
  assert.strictEqual(it.length,1);const x=it[0];
  assert.strictEqual(x.giris,'2024-01-08');assert.strictEqual(x.cikis,b[4].d);assert.strictEqual(x.gun,2);
  assert.ok(Math.abs(x.ret-(Math.log(b[4].c/b[0].c)-0.001))<1e-12);
  assert.ok(Math.abs(x.gecik-(Math.log(b[3].o/b[0].c)-Math.log(400/(400*1.001))))<1e-12);
  /* işlem tarihi yoksa ya da bildirimden sonraysa dışarıda */
  assert.strictEqual(K.islemTarihli([{...tr[0],traded:null}],()=>b,spy,k5).length,0);
});
