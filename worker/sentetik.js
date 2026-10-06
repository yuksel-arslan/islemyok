/* İşlem Yok — sentetik piyasa (laboratuvar boru hattı sınaması)
   10 varlık, GARCH(1,1) oynaklık kümelenmesi, isteğe bağlı trend rejimleri: rejim süresi üstel
   (ort. 15 gün), her rejimde sürüklenme ±driftPerDay (yön yazı-tura). Hacim: lognormal gürültü × (1+|getiri|/σ). Bar içi yol 6 alt adım →
   gerçekçi en yüksek/en düşük. driftPerDay=0 → saf gürültü: hiçbir strateji GEÇMEMELİ. */
'use strict';
const {ASSETS}=require('./engine');
const {TFMS}=require('./backtest');
const PD={'1h':24,'4h':6,'1d':1};

function rng(seed){let x=(seed|0)||1;const u=()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/4294967296;
  return {u,g:()=>{const a=u()||1e-12,b=u();return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b);}};}

function seri({seed=7,bars=40000,driftPerDay=0,tf='1h',volDay=0.035,regimeDays=15}={}){
  const R=rng(seed),pd=PD[tf],ms=TFMS[tf],SUB=6;
  const sBar=volDay/Math.sqrt(pd),w=sBar*sBar*0.04,al=0.08,be=0.88;   /* uzun dönem varyans = sBar² */
  let v=sBar*sBar,eps=0,c=100,t=Date.UTC(2021,0,1),mu=0,left=0;const out=[];
  for(let i=0;i<bars;i++){
    if(driftPerDay&&left<=0){left=Math.max(pd,Math.round(-Math.log(R.u()||1e-12)*regimeDays*pd));mu=(R.u()<0.5?-1:1)*driftPerDay/pd;}
    left--;
    v=w+al*eps*eps+be*v;const s=Math.sqrt(v);
    const o=c;let h=o,l=o,x=o,tot=0;
    for(let k=0;k<SUB;k++){const r=mu/SUB+s/Math.sqrt(SUB)*R.g();tot+=r;x*=Math.exp(r);if(x>h)h=x;if(x<l)l=x;}
    eps=tot-mu;c=x;out.push({t,o,h,l,c,v:1000*Math.exp(0.4*R.g())*(1+Math.abs(tot)/sBar)});t+=ms;}
  return out;
}
function senaryo(o={}){const rows={};ASSETS.forEach(([sym],k)=>{rows[sym]=seri({...o,seed:(o.seed||7)*1000+k+1});});return rows;}
module.exports={seri,senaryo};
