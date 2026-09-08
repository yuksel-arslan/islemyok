/* engine_core.js'i site kaynagindan (index.html) yeniden dilimler.
   Kullanim: cd worker && node dilimle.js   (varsayilan kaynak: ../site/index.html)
   Kaynak tek: index.html. Bu dosyayi elle duzenleme yerine burayi calistir. */
'use strict';
const fs=require('fs'),path=require('path');
const SRC=process.argv[2]||path.join(__dirname,'..','site','index.html');
const L=fs.readFileSync(SRC,'utf8').split('\n');

/* [baslangic isareti, bitis isareti (haric)] — model cekirdegini olusturan bloklar */
const PARCA=[
  ['/* TAHMIN UFKU',        '/* Ufuk etiketi'],
  ['function quantile(a,p)','/* ========== NY yerel saat'],
  ['/* ========== NY yerel saat','/* ========== veri =========='],
  ['/* ========== model ==========','/* ========== ana akis =========='],
  ['function interpZ(',     'async function backtest('],
  ['/* ===== tek kombinasyonu degerlendiren cekirdek','/* Bir <select>\'i SAYISAL'],
];
const bul=(m,ad)=>{
  const ix=L.map((l,i)=>l.startsWith(m)?i:-1).filter(i=>i>=0);
  if(ix.length!==1)throw new Error(`isaret ${ix.length} kez bulundu: ${ad} "${m}"`);
  return ix[0];};

const bloklar=PARCA.map(([a,b])=>L.slice(bul(a,'bas'),bul(b,'son')).join('\n').replace(/\s+$/,''));
const bugun=new Date().toISOString().slice(0,10);
const out=
`/* İşlem Yok — modelin çekirdeği. ÜRETİLMİŞ DOSYA, ELLE DÜZENLEME.
   Kaynak: ${path.relative(__dirname,SRC).split(path.sep).join('/')}
   Üretim: node dilimle.js   ·   ${bugun}
   Site index.html değiştiğinde bu script yeniden çalıştırılır. */
`+bloklar.join('\n\n')+'\n';

fs.writeFileSync(path.join(__dirname,'engine_core.js'),out);
console.log(`engine_core.js yazildi: ${out.split('\n').length} satir, ${bloklar.length} blok`);
