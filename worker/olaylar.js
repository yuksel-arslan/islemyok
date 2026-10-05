/* İşlem Yok — olay takvimi üretici. lab/olaylar.csv → site/olaylar.json (tarayıcıda ana sayfa uyarısı okur).
   npm run olaylar [-- --check]   (--check: yalnız doğrula, dosya yazma) */
'use strict';
const fs=require('fs'),path=require('path');
const CSV=path.join(__dirname,'..','lab','olaylar.csv'),OUT=path.join(__dirname,'..','site','olaylar.json');

function parse(csv){
  const out=[];
  for(const ln of csv.split(/\r?\n/).slice(1)){
    if(!ln.trim())continue;
    const [d,h,tur,...not]=ln.split(',');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!/^\d{2}:\d{2}$/.test(h)||!/^(FOMC|CPI)$/.test(tur))throw new Error('geçersiz satır: '+ln);
    out.push({d,h,t:tur==='CPI'?'TÜFE':tur,dogrulandi:!/dogrulanmadi/.test(not.join(','))});
  }
  return out;
}
const render=ev=>JSON.stringify(ev)+'\n';
module.exports={parse,render};
if(require.main===module){
  const chk=process.argv.includes('--check');
  const ev=parse(fs.readFileSync(CSV,'utf8'));
  if(!chk)fs.writeFileSync(OUT,render(ev));
  console.log(`${ev.length} olay`+(chk?' (doğrulandı)':` → ${path.relative(process.cwd(),OUT)}`));
}
