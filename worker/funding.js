/* İşlem Yok — fonlama oranı verisi (Binance USDⓈ-M vadeli, 8 saatlik)
   fund-<sym>.json = [{t, r}]  t: fundingTime (ms), r: oran (0.0001 = %0.01 / 8s)
   Yalnız geçmişe bakan yardımcılar: fundingAt (T'ye kadarki son oran), avgN, pctRank.
   Bu dosya canlı bota bağlı değil. */
'use strict';
const fs=require('fs'),path=require('path');
const {ASSETS}=require('./engine');
const CACHE=process.env.CACHE_DIR||'/tmp/islemyok-cache';
const H8=8*36e5;
const file=sym=>path.join(CACHE,`fund-${sym}.json`);

async function fetchFunding(sym,pages=5){
  fs.mkdirSync(CACHE,{recursive:true});
  let have=[];try{have=JSON.parse(fs.readFileSync(file(sym),'utf8'));}catch(e){}
  const seen=new Map(have.map(x=>[x.t,x.r]));
  let start=have.length?have[have.length-1].t+1:Date.now()-pages*1000*H8;
  for(let g=0;g<pages+2;g++){
    const u=`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&startTime=${start}&limit=1000`;
    const r=await fetch(u);if(!r.ok)throw new Error('fapi '+r.status);
    const d=await r.json();if(!d.length)break;
    for(const x of d)seen.set(+x.fundingTime,+x.fundingRate);
    start=+d[d.length-1].fundingTime+1;
    if(d.length<1000)break;
    await new Promise(r=>setTimeout(r,120));}
  const out=[...seen.entries()].map(([t,r])=>({t,r})).sort((a,b)=>a.t-b.t);
  fs.writeFileSync(file(sym),JSON.stringify(out));
  return out;
}
function loadFunding(sym){try{return JSON.parse(fs.readFileSync(file(sym),'utf8'));}catch(e){return null;}}

/* T'ye kadar (dahil) son ödeme indeksi; yoksa -1 */
function idxAt(series,T){let lo=0,hi=series.length-1,ans=-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(series[m].t<=T){ans=m;lo=m+1;}else hi=m-1;}return ans;}
const fundingAt=(s,T)=>{const i=idxAt(s,T);return i<0?NaN:s[i].r;};
/* son n ödemenin ortalaması (T'ye kadar) */
function avgN(s,T,n){const i=idxAt(s,T);if(i<n-1)return NaN;let a=0;for(let k=i-n+1;k<=i;k++)a+=s[k].r;return a/n;}
/* x'in, T'ye kadarki son `win` ödeme (avgN serisi) içindeki yüzdelik sırası (0..1) */
function pctRank(s,T,n,win){const i=idxAt(s,T);if(i<win+n)return NaN;
  const x=avgN(s,T,n);let below=0,cnt=0;
  for(let k=i-win+1;k<=i;k++){let a=0;for(let j=k-n+1;j<=k;j++)a+=s[j].r;a/=n;cnt++;if(a<x)below++;}
  return cnt?below/cnt:NaN;}
/* (t0, t1] aralığında gerçekleşen ödemelerin toplamı (long öder → pozitif) */
function sumBetween(s,t0,t1){let a=0;const i0=idxAt(s,t0),i1=idxAt(s,t1);for(let k=i0+1;k<=i1;k++)a+=s[k].r;return a;}

module.exports={fetchFunding,loadFunding,fundingAt,avgN,pctRank,sumBetween,idxAt,H8};

/* CLI: node funding.js --fetch [--pages 5]   |   node funding.js --now */
if(require.main===module){
  (async()=>{
    const a=process.argv.slice(2),opt=(k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
    if(a.includes('--fetch')){
      for(const [sym,disp] of ASSETS){const s=await fetchFunding(sym,+opt('--pages',5));
        console.log(`${disp.padEnd(5)} ${s.length} ödeme  ${new Date(s[0].t).toISOString().slice(0,10)} → ${new Date(s[s.length-1].t).toISOString().slice(0,10)}`);}
    }
    if(a.includes('--now')||!a.includes('--fetch')){
      const T=Date.now();
      console.log('Fonlama — şimdi (8 saatlik oran; + = long öder)');
      console.log('varlık  son      24s ort   yıllık   90g yüzdelik   fund_pct   fund_abs');
      for(const [sym,disp] of ASSETS){const s=loadFunding(sym);if(!s){console.log(`${disp.padEnd(6)} veri yok (--fetch)`);continue;}
        const last=fundingAt(s,T),a3=avgN(s,T,3),p=pctRank(s,T,3,270);
        const sigP=p>=0.9?'SHORT':p<=0.1?'LONG':'—',sigA=a3>=0.0003?'SHORT':a3<=-0.0003?'LONG':'—';
        console.log(`${disp.padEnd(6)} ${(last*100).toFixed(4).padStart(7)}%  ${(a3*100).toFixed(4).padStart(7)}%  ${(a3*3*365*100).toFixed(0).padStart(5)}%   ${isFinite(p)?(p*100).toFixed(0).padStart(6)+'%':'     —'}       ${sigP.padEnd(6)}     ${sigA}`);}
    }
  })().catch(e=>{console.error(e.message||e);process.exit(1);});
}
