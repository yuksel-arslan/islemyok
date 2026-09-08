/* İşlem Yok — kamuya açık sinyal geçmişi
   Neon kaynak, R2 vitrin. signals.json siteye statik olarak servis edilir;
   sonucu site kendi tarayıcısında Binance mumlarıyla yeniden hesaplar,
   yani "geriye dönük silme yok" iddiası dışarıdan denetlenebilir. */
'use strict';
const {AwsClient}=require('aws4fetch');

const ACC=process.env.R2_ACCOUNT_ID||'';
const KEY=process.env.R2_ACCESS_KEY_ID||'';
const SEC=process.env.R2_SECRET_ACCESS_KEY||'';
const BUCKET=process.env.R2_BUCKET||'';
const OBJ=process.env.R2_OBJECT||'signals.json';
const enabled=!!(ACC&&KEY&&SEC&&BUCKET);

function toPublic(rows,stats){
  return {
    updatedAt:new Date().toISOString(),
    note:'Sonuçlar kamuya açık Binance mumlarıyla tarayıcıda yeniden hesaplanır.',
    stats:stats?{runs:stats.total,signals:stats.sigs,firstRun:stats.first_run}:null,
    signals:rows.map(r=>({
      id:r.id, sym:r.sym, disp:r.disp, tf:r.tf, side:r.side,
      entry:+r.entry, sl:+r.sl, tp1:r.tp1!=null?+r.tp1:null, tp2:+r.tp2,
      rm:+r.rm, dStop:+r.d_stop, ev:r.ev!=null?+r.ev:null, famHi:r.fam_hi!=null?+r.fam_hi:null,
      t0:+r.t0, tEnd:+r.t_end, publishedAt:r.published_at,
      state:r.state, half:r.half,
      closedAt:r.closed_at!=null?+r.closed_at:null,
      closePx:r.close_px!=null?+r.close_px:null,
      R:r.r_realized!=null?+r.r_realized:null}))};
}

async function exportSignals(rows,stats){
  const body=JSON.stringify(toPublic(rows,stats));
  if(!enabled){console.log('R2 yapılandırılmadı, dışa aktarım atlandı ('+rows.length+' kayıt)');return false;}
  const aws=new AwsClient({accessKeyId:KEY,secretAccessKey:SEC,service:'s3',region:'auto'});
  const url=`https://${ACC}.r2.cloudflarestorage.com/${BUCKET}/${OBJ}`;
  const r=await aws.fetch(url,{method:'PUT',body,
    headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=300'}});
  if(!r.ok)throw new Error('R2 '+r.status+' '+(await r.text()).slice(0,200));
  console.log('R2 güncellendi:',OBJ,rows.length,'kayıt');
  return true;
}

module.exports={exportSignals,toPublic,enabled};
