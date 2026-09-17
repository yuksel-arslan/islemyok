/* İşlem Yok — gelir yapılandırması üretici.
   plan/DURUM.md içindeki `REF_BINANCE=…` `REF_OKX=…` `REF_BYBIT=…` `ADSENSE_PUB=…`
   (`ADSENSE_SLOT_ICERIK=…` `ADSENSE_SLOT_ARAC=…`) satırlarını okur, doğrular,
   site/yapilandirma.js üretir. Boş değer = sayfada görünmez. Geçersiz değer = yazmaz, çıkış 2.
   npm run yapilandir [-- --check]   (--check: yalnız doğrula, dosya yazma) */
'use strict';
const fs=require('fs'),path=require('path');
const KEYS=['REF_BINANCE','REF_OKX','REF_BYBIT','ADSENSE_PUB','ADSENSE_SLOT_ICERIK','ADSENSE_SLOT_ARAC'];
const HOST={REF_BINANCE:/(^|\.)binance\.com$/i,REF_OKX:/(^|\.)okx\.com$/i,REF_BYBIT:/(^|\.)bybit\.com$/i};

/* DURUM.md → {KEY:value}; ilk geçen satır alınır; backtick/boşluk/nokta ayracı sonu keser */
function parse(md){
  const out={};for(const k of KEYS)out[k]='';
  const re=new RegExp('\\b('+KEYS.join('|')+')=([^\\s`·|)]*)','g');let m;
  while((m=re.exec(md)))if(!out[m[1]])out[m[1]]=m[2].trim();
  return out;
}
/* geçersiz alanların listesi; boş her zaman geçerli */
function validate(cfg){
  const bad=[];
  for(const k of ['REF_BINANCE','REF_OKX','REF_BYBIT']){const v=cfg[k];if(!v)continue;
    let u;try{u=new URL(v);}catch(e){bad.push(k+': URL değil');continue;}
    if(u.protocol!=='https:')bad.push(k+': https olmalı');
    else if(!HOST[k].test(u.hostname))bad.push(k+': alan adı '+u.hostname+' beklenen borsa değil');}
  if(cfg.ADSENSE_PUB&&!/^ca-pub-\d{10,}$/.test(cfg.ADSENSE_PUB))bad.push('ADSENSE_PUB: ca-pub-<rakamlar> biçiminde olmalı');
  for(const k of ['ADSENSE_SLOT_ICERIK','ADSENSE_SLOT_ARAC'])if(cfg[k]&&!/^\d{6,}$/.test(cfg[k]))bad.push(k+': yalnız rakam');
  return bad;
}
function render(cfg){
  const q=s=>JSON.stringify(String(s||''));
  return ['/* İşlem Yok — gelir yapılandırması. ÜRETİLMİŞ DOSYA: elle düzenleme.',
    '   Kaynak: plan/DURUM.md ("Yüksel\'den istenen" satırları) → `cd worker && npm run yapilandir`.',
    '   Boş değer = ilgili öğe sayfada hiç çizilmez (yer tutucu yok). */',
    'window.IY={',
    KEYS.map((k,i)=>'  '+k+':'+q(cfg[k])+(i<KEYS.length-1?',':'')).join('\n'),
    '};',''].join('\n');
}
/* ads.txt içeriği: "google.com, pub-<id>, DIRECT, f08c47fec0942fa0"; ADSENSE_PUB boşsa '' */
function renderAdsTxt(cfg){
  const m=/^ca-(pub-\d{10,})$/.exec(cfg.ADSENSE_PUB||'');
  return m?`google.com, ${m[1]}, DIRECT, f08c47fec0942fa0\n`:'';
}
module.exports={parse,validate,render,renderAdsTxt,KEYS};

if(require.main===module){
  const a=process.argv.slice(2);
  const durum=path.join(__dirname,'..','plan','DURUM.md'),hedef=path.join(__dirname,'..','site','yapilandirma.js');
  const cfg=parse(fs.readFileSync(durum,'utf8'));
  const bad=validate(cfg);
  if(bad.length){console.error('GEÇERSİZ:\n  '+bad.join('\n  '));process.exit(2);}
  const dolu=KEYS.filter(k=>cfg[k]);
  console.log('DURUM.md: '+(dolu.length?dolu.join(', ')+' dolu':'tüm değerler boş — sayfada hiçbir şey görünmez'));
  if(a.includes('--check'))process.exit(0);
  const js=render(cfg);
  const eski=fs.existsSync(hedef)?fs.readFileSync(hedef,'utf8'):'';
  if(eski===js){console.log(hedef+' zaten güncel');}
  else{fs.writeFileSync(hedef,js);console.log(hedef+' yazıldı');}
  /* ads.txt: AdSense yetkili satıcı beyanı; ADSENSE_PUB boşsa dosya silinir */
  const adsTxt=path.join(__dirname,'..','site','ads.txt'),adsIcerik=renderAdsTxt(cfg);
  if(adsIcerik){if(!fs.existsSync(adsTxt)||fs.readFileSync(adsTxt,'utf8')!==adsIcerik){fs.writeFileSync(adsTxt,adsIcerik);console.log(adsTxt+' yazıldı');}}
  else if(fs.existsSync(adsTxt)){fs.unlinkSync(adsTxt);console.log(adsTxt+' silindi (ADSENSE_PUB boş)');}
}
