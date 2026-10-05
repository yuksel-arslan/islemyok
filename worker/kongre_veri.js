/* İşlem Yok — ABD Kongresi hisse işlemleri (STOCK Act bildirimleri), resmi kaynaklar.
   Meclis : disclosures-clerk.house.gov — yıllık <YIL>FD.zip (XML endeksi) + PTR PDF'leri.
   Senato : efdsearch.senate.gov — PTR araması (JSON) + elektronik PTR sayfaları (HTML).
   Kağıt (taranmış) bildirimler atlanır; sayısı raporda yazılır.

   İşlem kaydı (tx): {src, doc, member, state, filed, traded, ticker, asset, type, amtLo, amtHi, owner}
     filed/traded 'YYYY-MM-DD' · type P=alış S=satış SP=kısmi satış E=takas
     asset 'ST' = hisse (Meclis kodu; Senato "Stock" buna eşlenir)
   Önbellek: CACHE_DIR/kongre/ — her belge bir kez indirilir ve ayrıştırılır. */
'use strict';
const fs=require('fs'),path=require('path');

const CACHE=path.join(process.env.CACHE_DIR||'/tmp/islemyok-cache','kongre');
fs.mkdirSync(path.join(CACHE,'house'),{recursive:true});
fs.mkdirSync(path.join(CACHE,'senate'),{recursive:true});
const UA={'User-Agent':'Mozilla/5.0 (islemyok.com; STOCK Act arastirma)'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rd=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return null;}};
const wr=(f,v)=>fs.writeFileSync(f,JSON.stringify(v));

/* 'M/D/YYYY' -> 'YYYY-MM-DD' */
function isoDate(s){const m=String(s||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m?`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:null;}
/* '$1,001 - $15,000' | 'Over $50,000,000' | '$50,000,000 +' -> [lo,hi] */
function amount(s){s=String(s||'');
  const n=[...s.matchAll(/\$\s*([\d,]+)/g)].map(m=>+m[1].replace(/,/g,''));
  if(!n.length)return [NaN,NaN];
  if(/over/i.test(s))return [n[0]+1,Infinity];
  return [n[0],n.length>1?n[1]:Infinity];}
const cleanTicker=t=>String(t||'').replace(/\s+/g,'').toUpperCase();

/* ================= MECLİS ================= */
const HOUSE='https://disclosures-clerk.house.gov/public_disc';

/* <YIL>FD.xml -> yalnız PTR (FilingType P) satırları */
function parseHouseIndex(xml){
  const out=[];
  for(const m of xml.matchAll(/<Member>([\s\S]*?)<\/Member>/g)){
    const g=k=>{const x=m[1].match(new RegExp(`<${k}>([^<]*)</${k}>`));return x?x[1].trim():'';};
    if(g('FilingType')!=='P')continue;
    out.push({doc:g('DocID'),member:[g('First'),g('Last')].filter(Boolean).join(' '),
      state:g('StateDst'),filed:isoDate(g('FilingDate')),year:+g('Year')});}
  return out;
}

async function houseIndex(year,{refresh}={}){
  const f=path.join(CACHE,`house-${year}.json`);
  const have=rd(f);
  if(have&&!refresh)return have;
  const r=await fetch(`${HOUSE}/financial-pdfs/${year}FD.zip`,{headers:UA,signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw new Error(`Meclis endeksi ${year}: ${r.status}`);
  const {unzipSync,strFromU8}=require('fflate');
  const files=unzipSync(new Uint8Array(await r.arrayBuffer()),{filter:x=>/\.xml$/i.test(x.name)});
  const name=Object.keys(files)[0];if(!name)throw new Error(`Meclis endeksi ${year}: zip içinde XML yok`);
  const rows=parseHouseIndex(strFromU8(files[name]));
  wr(f,rows);return rows;
}

/* PTR PDF metni -> işlemler. pdfjs metni parça parça verir; boşluklar tek boşluğa indirilir.
   Çapa: "(TICKER) [XX] <tür> <işlem tarihi> <bildirim tarihi> <tutar>". Ticker satır sonunda
   bölünebildiği için parantez içi boşluklara izin verilir. */
const RX_HOUSE_TX=/\(([A-Z][A-Z0-9.\-/ ]{0,9})\)\s*\[([A-Z]{2})\]\s*(P|S\s*\(partial\)|S|E)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+((?:Over\s+)?\$[\d,]+(?:\s*-\s*\$[\d,]+|\s*\+)?)/g;
function parseHousePtrText(text){
  const t=String(text).replace(/\u0000/g,'').replace(/\s+/g,' ');
  const out=[];
  for(const m of t.matchAll(RX_HOUSE_TX)){
    const [lo,hi]=amount(m[6]);
    const ty=m[3].replace(/\s+/g,' ');
    out.push({ticker:cleanTicker(m[1]),asset:m[2],type:ty==='P'?'P':ty==='E'?'E':ty==='S'?'S':'SP',
      traded:isoDate(m[4]),amtLo:lo,amtHi:hi});}
  return out;
}

async function pdfText(buf){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc=await pdfjs.getDocument({data:new Uint8Array(buf),isEvalSupported:false,verbosity:0}).promise;
  let s='';
  for(let p=1;p<=doc.numPages;p++){
    const c=await (await doc.getPage(p)).getTextContent();
    s+=c.items.map(i=>i.str).join(' ')+'\n';}
  await doc.destroy();
  return s;
}

/* tek PTR: önbellekte yoksa indir + ayrıştır. Kağıt bildirim (DocID 2000xxxx dışı) metin
   katmanı taşımaz -> {paper:true}. */
async function housePtr(row){
  const f=path.join(CACHE,'house',`${row.doc}.json`);
  const have=rd(f);if(have)return have;
  let res;
  if(!/^20\d{6}$/.test(row.doc))res={paper:true,tx:[]};
  else{
    const r=await fetch(`${HOUSE}/ptr-pdfs/${row.year}/${row.doc}.pdf`,{headers:UA,signal:AbortSignal.timeout(30000)});
    if(r.status===404)res={missing:true,tx:[]};
    else if(!r.ok)throw new Error(`Meclis PTR ${row.doc}: ${r.status}`);
    else{
      const text=await pdfText(Buffer.from(await r.arrayBuffer()));
      const tx=parseHousePtrText(text);
      res={tx,empty:!tx.length&&text.replace(/\s/g,'').length<200};}}
  wr(f,res);await sleep(120);
  return res;
}

/* ================= SENATO ================= */
const SEN='https://efdsearch.senate.gov';

class Jar{constructor(){this.c={};}
  take(r){for(const h of (r.headers.getSetCookie?r.headers.getSetCookie():[])){
    const [kv]=h.split(';');const i=kv.indexOf('=');this.c[kv.slice(0,i).trim()]=kv.slice(i+1).trim();}}
  get str(){return Object.entries(this.c).map(([k,v])=>`${k}=${v}`).join('; ');}}

/* eFD önce kullanım şartı onayı ister (CSRF'li form). */
async function senateSession(){
  const jar=new Jar();
  const r1=await fetch(`${SEN}/search/home/`,{headers:UA,signal:AbortSignal.timeout(30000)});
  jar.take(r1);const html=await r1.text();
  const tok=(html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)||[])[1];
  if(!tok)throw new Error('Senato: CSRF anahtarı bulunamadı ('+r1.status+')');
  const r2=await fetch(`${SEN}/search/home/`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(30000),
    headers:{...UA,cookie:jar.str,Referer:`${SEN}/search/home/`,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({prohibition_agreement:'1',csrfmiddlewaretoken:tok})});
  jar.take(r2);
  return jar;
}

/* arama satırı: [ad, soyad, tam ad, '<a href="/search/view/ptr/<id>/">…</a>', 'MM/DD/YYYY'] */
function parseSenateRow(row){
  const href=(String(row[3]).match(/href="([^"]+)"/)||[])[1]||'';
  const m=href.match(/\/search\/view\/(ptr|paper)\/([^/]+)\//);
  return {doc:m?m[2]:href,kind:m?m[1]:'?',member:`${row[0]} ${row[1]}`.trim().replace(/\s+/g,' '),
    state:'',filed:isoDate(row[4]),url:href};
}

async function senateIndex(fromIso,{refresh}={}){
  const f=path.join(CACHE,'senate-index.json');
  const have=rd(f)||[];
  const known=new Set(have.map(x=>x.doc));
  const last=have.reduce((a,x)=>x.filed>a?x.filed:a,'');
  /* artımlı: son kayıttan 10 gün geriden başla (geç işlenen bildirimler) */
  let from=fromIso;
  if(last&&!refresh){const d=new Date(last);d.setUTCDate(d.getUTCDate()-10);
    const s=d.toISOString().slice(0,10);if(s>from)from=s;}
  const jar=await senateSession();
  const [y,mo,da]=from.split('-');
  for(let start=0;;start+=100){
    const r=await fetch(`${SEN}/search/report/data/`,{method:'POST',signal:AbortSignal.timeout(30000),
      headers:{...UA,cookie:jar.str,'X-CSRFToken':jar.c.csrftoken||'',Referer:`${SEN}/search/`,
        'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({start:String(start),length:'100',report_types:'[11]',filer_types:'[]',
        submitted_start_date:`${mo}/${da}/${y} 00:00:00`,submitted_end_date:'',candidate_state:'',
        senator_state:'',office_id:'',first_name:'',last_name:'',
        csrfmiddlewaretoken:jar.c.csrftoken||''})});
    if(!r.ok)throw new Error('Senato arama: '+r.status);
    const j=await r.json();
    for(const row of j.data||[]){const x=parseSenateRow(row);
      if(!known.has(x.doc)){known.add(x.doc);have.push(x);}}
    if(!j.data||j.data.length<100||start+100>=(j.recordsFiltered??j.recordsTotal??0))break;
    await sleep(300);}
  have.sort((a,b)=>a.filed<b.filed?-1:1);
  wr(f,have);
  return {rows:have,jar};
}

const TYPE_SEN={'Purchase':'P','Sale (Full)':'S','Sale (Partial)':'SP','Exchange':'E'};
const strip=h=>String(h).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
/* elektronik PTR sayfası: tablo satırları
   # | İşlem tarihi | Sahip | Ticker | Varlık adı | Varlık türü | Tür | Tutar | Yorum */
function parseSenatePtrHtml(html){
  const body=(String(html).match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)||[])[1]||'';
  const out=[];
  for(const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
    const td=[...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>strip(x[1]));
    if(td.length<8)continue;
    const [,date,owner,tick,,atype,typ,amt]=td;
    const ticker=/^[A-Za-z][A-Za-z0-9.\-/]{0,7}$/.test(tick)?cleanTicker(tick):'';
    const [lo,hi]=amount(amt);
    out.push({ticker,asset:/^stock$/i.test(atype)?'ST':atype,type:TYPE_SEN[typ]||typ,
      traded:isoDate(date),amtLo:lo,amtHi:hi,owner});}
  return out;
}

async function senatePtr(row,jar){
  const f=path.join(CACHE,'senate',`${row.doc}.json`);
  const have=rd(f);if(have)return have;
  let res;
  if(row.kind!=='ptr')res={paper:true,tx:[]};
  else{
    const r=await fetch(SEN+row.url,{headers:{...UA,cookie:jar.str,Referer:`${SEN}/search/`},signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error(`Senato PTR ${row.doc}: ${r.status}`);
    const html=await r.text();
    if(/prohibition_agreement/.test(html))throw new Error('Senato: oturum düştü (şart onayı yeniden istendi)');
    res={tx:parseSenatePtrHtml(html)};}
  wr(f,res);await sleep(250);
  return res;
}

/* ================= BİRLEŞİK ================= */
/* fromYear..bugün arası tüm PTR işlemleri. stats: belge/kağıt/boş sayıları (ayrıştırma sağlığı). */
/* since ('YYYY-MM-DD', isteğe bağlı): yalnız bu tarihten sonra bildirilen belgeler indirilir (canlı koşu). */
async function fetchAll({fromYear,since='',log=()=>{},refreshIndex=false,house=true,senate=true}={}){
  const tx=[],stats={houseDocs:0,housePaper:0,houseEmpty:0,houseMissing:0,houseNoTx:0,senateDocs:0,senatePaper:0,senateNoTx:0,errors:0};
  const yNow=new Date().getUTCFullYear();
  if(house)for(let y=fromYear;y<=yNow;y++){
    let idx;
    try{idx=await houseIndex(y,{refresh:refreshIndex||y>=yNow-1});}
    catch(e){log(`Meclis ${y}: ${e.message}`);stats.errors++;continue;}
    log(`Meclis ${y}: ${idx.length} PTR`);
    for(const row of idx){
      if(since&&!(row.filed>=since))continue;
      let r;try{r=await housePtr(row);}catch(e){stats.errors++;log(e.message);continue;}
      stats.houseDocs++;if(r.paper)stats.housePaper++;if(r.empty)stats.houseEmpty++;if(r.missing)stats.houseMissing++;
      if(!r.paper&&!r.missing&&!r.empty&&!r.tx.length)stats.houseNoTx++;
      for(const t of r.tx)tx.push({src:'house',doc:row.doc,member:row.member,state:row.state,filed:row.filed,...t});}}
  if(senate){
    try{
      const from=since&&since>`${fromYear}-01-01`?since:`${fromYear}-01-01`;
      const {rows,jar}=await senateIndex(from,{refresh:refreshIndex});
      log(`Senato: ${rows.length} PTR`);
      for(const row of rows){
        if(row.filed<from)continue;
        let r;try{r=await senatePtr(row,jar);}catch(e){stats.errors++;log(e.message);continue;}
        stats.senateDocs++;if(r.paper)stats.senatePaper++;else if(!r.tx.length)stats.senateNoTx++;
        for(const t of r.tx)tx.push({src:'senate',doc:row.doc,member:row.member,state:row.state,filed:row.filed,...t});}
    }catch(e){log('Senato: '+e.message);stats.errors++;}}
  tx.sort((a,b)=>a.filed<b.filed?-1:a.filed>b.filed?1:0);
  return {tx,stats};
}

module.exports={fetchAll,houseIndex,housePtr,senateIndex,senatePtr,
  parseHouseIndex,parseHousePtrText,parseSenateRow,parseSenatePtrHtml,pdfText,isoDate,amount,CACHE};
