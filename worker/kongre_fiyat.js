/* İşlem Yok — ABD hisse günlük fiyatları (temettü/bölünme düzeltilmiş).
   Kaynak: Yahoo chart API; olmazsa Stooq CSV. Bar: {d:'YYYY-MM-DD', o, c} (düzeltilmiş).
   Önbellek: CACHE_DIR/kongre/px-<TICKER>.json — bugün güncellenmişse ağa çıkmaz. */
'use strict';
const fs=require('fs'),path=require('path');
const {CACHE}=require('./kongre_veri');
const UA={'User-Agent':'Mozilla/5.0 (islemyok.com)'};
const day=t=>new Date(t).toISOString().slice(0,10);

const yahooSym=t=>t.replace(/[./]/g,'-');
async function yahoo(t){
  const u=`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym(t))}?period1=1262304000&period2=${Math.floor(Date.now()/1000)}&interval=1d&events=div%2Csplit`;
  const r=await fetch(u,{headers:UA,signal:AbortSignal.timeout(20000)});
  if(r.status===404)return [];
  if(!r.ok)throw new Error('yahoo '+r.status);
  const res=(await r.json()).chart?.result?.[0];
  if(!res||!res.timestamp)return [];
  const q=res.indicators.quote[0],adj=res.indicators.adjclose?.[0]?.adjclose;
  const out=[];
  for(let i=0;i<res.timestamp.length;i++){
    const o=q.open[i],c=q.close[i];if(!(o>0&&c>0))continue;
    const k=adj&&adj[i]>0?adj[i]/c:1;
    out.push({d:day(res.timestamp[i]*1000),o:o*k,c:c*k});}
  return out;
}
async function stooq(t){
  const r=await fetch(`https://stooq.com/q/d/l/?s=${t.toLowerCase().replace(/[./]/g,'-')}.us&i=d`,{headers:UA,signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error('stooq '+r.status);
  const lines=(await r.text()).trim().split('\n');
  if(!/^Date,Open/i.test(lines[0]||''))return [];
  return lines.slice(1).map(l=>l.split(',')).filter(x=>+x[1]>0&&+x[4]>0).map(x=>({d:x[0],o:+x[1],c:+x[4]}));
}

async function bars(t,{maxAgeH=12}={}){
  const f=path.join(CACHE,`px-${t.replace(/[^A-Z0-9.\-]/g,'_')}.json`);
  try{const st=fs.statSync(f);
    if(Date.now()-st.mtimeMs<maxAgeH*36e5)return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){}
  let b=[],err=null;
  try{b=await yahoo(t);}catch(e){err=e;}
  if(!b.length){try{b=await stooq(t);}catch(e){err=err||e;}}
  if(!b.length&&err)throw err;
  fs.writeFileSync(f,JSON.stringify(b));
  return b;
}

/* d tarihinden KESİN SONRA gelen ilk barın indeksi; yoksa -1 */
function firstAfter(b,d){let lo=0,hi=b.length-1,ans=-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(b[m].d>d){ans=m;hi=m-1;}else lo=m+1;}return ans;}
/* d tarihine eşit ya da önceki son bar */
function lastOnOrBefore(b,d){let lo=0,hi=b.length-1,ans=-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(b[m].d<=d){ans=m;lo=m+1;}else hi=m-1;}return ans;}

module.exports={bars,firstAfter,lastOnOrBefore};
