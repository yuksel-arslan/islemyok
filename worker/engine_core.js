function quantile(a,p){if(!a.length)return NaN;const s=Float64Array.from(a).sort();
  const i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(i-lo);}
function solve(A,b){const n=b.length,M=A.map((r,i)=>r.concat([b[i]]));
  for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;
    [M[c],M[p]]=[M[p],M[c]];const d=M[c][c];if(Math.abs(d)<1e-12){M[c][c]=1e-12;}
    for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c]/M[c][c];
      for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k];}}
  return M.map((r,i)=>r[n]/r[i]);}
function ols(X,y,rows){const k=X[0].length,A=Array.from({length:k},()=>new Float64Array(k)),b=new Float64Array(k);
  for(const i of rows){const xi=X[i];for(let a=0;a<k;a++){b[a]+=xi[a]*y[i];for(let c=a;c<k;c++)A[a][c]+=xi[a]*xi[c];}}
  for(let a=0;a<k;a++)for(let c=0;c<a;c++)A[a][c]=A[c][a];
  return solve(A.map(r=>Array.from(r)),Array.from(b));}


/* ========== NY yerel saat (DST dahil) ========== */
const nyFmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour12:false,
  weekday:'short',hour:'2-digit'});
const DOW={Sun:6,Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5};
const nyCache=new Map();
function nyHOW(ms){
  const key=Math.floor(ms/36e5);
  if(nyCache.has(key))return nyCache.get(key);
  const p=nyFmt.formatToParts(new Date(ms));
  let d=0,h=0;for(const x of p){if(x.type==='weekday')d=DOW[x.value];if(x.type==='hour')h=parseInt(x.value,10)%24;}
  const v=d*24+h;nyCache.set(key,v);return v;}


/* ========== model ========== */
const KD=4,KW=3;
function basis(how){const r=[1];
  for(let k=1;k<=KD;k++){r.push(Math.cos(2*Math.PI*k*how/24),Math.sin(2*Math.PI*k*how/24));}
  for(let j=1;j<=KW;j++){r.push(Math.cos(2*Math.PI*j*how/168),Math.sin(2*Math.PI*j*how/168));}
  return r;}
function buildVol(rows,perDay){
  const n=rows.length,ret=new Float64Array(n),how=new Float64Array(n);
  for(let i=1;i<n;i++)ret[i]=Math.log(rows[i].c/rows[i-1].c);
  for(let i=0;i<n;i++)how[i]=nyHOW(rows[i].t);
  const X=[];for(let i=0;i<n;i++)X.push(basis(how[i]));
  const y=new Float64Array(n);for(let i=0;i<n;i++)y[i]=Math.log(ret[i]*ret[i]+1e-12);
  const WARM=Math.min(Math.floor(n*0.35),180*perDay),REFIT=30*perDay;
  const sea=new Float64Array(n).fill(NaN);
  for(let t0=WARM;t0<n;t0+=REFIT){
    const rows_=[];for(let i=1;i<t0;i++)rows_.push(i);
    const b=ols(X,y,rows_);
    let mu=0;for(const i of rows_)mu+=X[i].reduce((s,v,k)=>s+v*b[k],0);mu/=rows_.length;
    const e=Math.min(t0+REFIT,n);
    for(let i=t0;i<e;i++)sea[i]=Math.exp(X[i].reduce((s,v,k)=>s+v*b[k],0)-mu);}
  const BW=30*perDay,base=new Float64Array(n).fill(NaN),sig=new Float64Array(n).fill(NaN);
  for(let i=WARM;i<n;i++){let s=0,c=0;
    for(let j=Math.max(1,i-BW);j<i;j++){const sv=isFinite(sea[j])?Math.max(sea[j],1e-6):1;s+=ret[j]*ret[j]/sv;c++;}
    base[i]=s/c;sig[i]=Math.sqrt(base[i]*(isFinite(sea[i])?sea[i]:1));}
  /* bar-ici asiri hareketler: onceki kapanisa gore en dusuk/en yuksek nokta.
     Bariyer testi bunlarla yapilir; yalniz kapanisa bakmak stop vuruslarini
     sistematik olarak eksik sayar. */
  const exHi=new Float64Array(n),exLo=new Float64Array(n);
  for(let i=1;i<n;i++){
    const pc=rows[i-1].c;
    exHi[i]=Math.log(Math.max(rows[i].h,rows[i].c)/pc);
    exLo[i]=Math.log(Math.min(rows[i].l,rows[i].c)/pc);}
  return {ret,how,sea,base,sig,WARM,X,exHi,exLo};
}
function futureSeason(rows,M,steps,tfms,perDay){
  const n=rows.length,X=M.X,y=new Float64Array(n);
  for(let i=0;i<n;i++)y[i]=Math.log(M.ret[i]*M.ret[i]+1e-12);
  const rows_=[];for(let i=1;i<n;i++)rows_.push(i);
  const b=ols(X,y,rows_);let mu=0;for(const i of rows_)mu+=X[i].reduce((s,v,k)=>s+v*b[k],0);mu/=rows_.length;
  const out=[],ts=[];
  for(let s=1;s<=steps;s++){const t=rows[n-1].t+s*tfms;ts.push(t);
    out.push(Math.exp(basis(nyHOW(t)).reduce((a,v,k)=>a+v*b[k],0)-mu));}
  return {sea:out,ts};
}
/* ---- Kuantil regresyonu (Koenker), IRLS: q_tau(z|mg) = a + b*mg ----
   Eski surumde tek bir olcek carpani tum kuantil duzeylerine uygulaniyordu;
   bu, duzeyler arasi iliskinin sabit oldugunu varsayan ad hoc bir kuraldi.
   Kuantil regresyonu her duzeyi ayri tahmin eder, asimetri kendiliginden cikar. */
function quantReg(y,x,tau,maxIt,init){
  const n=y.length;
  /* Baslangic noktasi ampirik kuantil olmali; ortalamadan baslamak IRLS'i
     yavaslatir ve erken durdurmada bantlar sistematik olarak dar cikar.
     Ilik baslatma (init): gecmis testte pencere adim adim kaydigi icin bir
     onceki cozum cok yakindir — ayni dogruluk, ~8 kat daha az iterasyon. */
  let a,b;
  if(init){a=init[0];b=init[1];}
  else{const srt=Float64Array.from(y).sort();
    a=srt[Math.min(n-1,Math.max(0,Math.round(tau*(n-1))))];b=0;}
  for(let it=0;it<(maxIt||140);it++){
    let S00=0,S01=0,S11=0,T0=0,T1=0;
    for(let i=0;i<n;i++){
      const r=y[i]-(a+b*x[i]);
      const w=(r>0?tau:1-tau)/Math.max(Math.abs(r),1e-3);
      S00+=w;S01+=w*x[i];S11+=w*x[i]*x[i];T0+=w*y[i];T1+=w*x[i]*y[i];}
    const det=S00*S11-S01*S01;if(Math.abs(det)<1e-14)break;
    const na=(T0*S11-T1*S01)/det, nb=(S00*T1-S01*T0)/det;
    const d=Math.abs(na-a)+Math.abs(nb-b);
    a=na;b=nb;
    /* ilik baslatmada gevsek tolerans yeterli: fark ~1e-4, kuantilin
       istatistiksel hatasi ~5e-2 — sonucu degistirmez, sureyi yariya indirir */
    if(d<(init?1e-4:1e-6))break;}
  return [a,b];
}
/* ---- Asiri deger teorisi: esik asimlarina genellestirilmis Pareto ----
   En uc kuantiller (%5/%95) az sayida gozlemle dogrudan sayilamaz; kuyruk
   davranisini modelleyip disariya uzatmak istatistiksel standarttir. */
function gpdFit(exc){
  const y=Float64Array.from(exc).sort();const n=y.length;
  if(n<25)return null;
  let a0=0;for(let i=0;i<n;i++)a0+=y[i];a0/=n;
  let a1=0;for(let i=0;i<n;i++)a1+=y[i]*(n-(i+1))/(n-1);a1/=n;
  const den=a0-2*a1;if(Math.abs(den)<1e-12)return null;
  const k=a0/den-2, s=2*a0*a1/den;
  if(!(s>0)||!isFinite(k))return null;
  return {k,s};
}
function gpdQuant(f,p){
  if(Math.abs(f.k)<1e-6)return -f.s*Math.log(p);
  return f.s/f.k*(1-Math.pow(p,f.k));
}
/* Kosullu kuantiller: merkez duzeyler kuantil regresyonundan, uc duzeyler EVT'den */
function calib(zArr,mgArr,idxEnd,CAL,ps,mgNow,warm){
  const zs=[],ms=[];
  for(let i=Math.max(0,idxEnd-CAL);i<idxEnd;i++)
    if(isFinite(zArr[i])&&isFinite(mgArr[i])){zs.push(zArr[i]);ms.push(mgArr[i]);}
  if(zs.length<150)return null;
  /* cok buyuk pencerelerde esit araliklarla seyrelt: dogrulugu bozmadan hizlandirir */
  if(zs.length>2000){const st=Math.ceil(zs.length/2000),z2=[],m2=[];
    for(let i=0;i<zs.length;i+=st){z2.push(zs[i]);m2.push(ms[i]);}
    zs.length=0;ms.length=0;zs.push(...z2);ms.push(...m2);}
  const needTail=ps.some(p=>p<0.10-1e-9||p>0.90+1e-9);
  const fitAt={};
  const getFit=t=>{if(fitAt[t])return fitAt[t];
    const f=quantReg(zs,ms,t,140,warm&&warm[t]);
    if(warm)warm[t]=f;
    return fitAt[t]=f;};
  const at=(t,x)=>{const f=getFit(t);return f[0]+f[1]*x;};
  const out={};
  for(const p of ps)if(p>=0.10-1e-9&&p<=0.90+1e-9)out[p]=at(p,mgNow);
  if(needTail){
    const q50=getFit(0.50),q10=getFit(0.10),q90=getFit(0.90);
    const e=[];
    for(let i=0;i<zs.length;i++){
      const m=q50[0]+q50[1]*ms[i];
      const sc=((q90[0]+q90[1]*ms[i])-(q10[0]+q10[1]*ms[i]))/2;
      if(sc>1e-9)e.push((zs[i]-m)/sc);}
    if(e.length<120)return null;
    const srt=Float64Array.from(e).sort();
    const pick=q=>srt[Math.min(srt.length-1,Math.max(0,Math.round(q*(srt.length-1))))];
    const uHi=pick(0.85), uLo=pick(0.15), pu=0.15;
    const excHi=[],excLo=[];
    for(const v of e){if(v>uHi)excHi.push(v-uHi);if(v<uLo)excLo.push(uLo-v);}
    const fHi=gpdFit(excHi), fLo=gpdFit(excLo);
    const mNow=q50[0]+q50[1]*mgNow;
    const scNow=((q90[0]+q90[1]*mgNow)-(q10[0]+q10[1]*mgNow))/2;
    if(!(scNow>1e-9))return null;
    /* kucuk orneklem korumasi: asim sayisi azken GPD sekil parametresi cok
       gurultulu olur; kestirimi ampirik kuantile dogru buz (25 asimda tam
       ampirik, 75+ asimda tam GPD, arada dogrusal) */
    const shrink=(nExc,gv,ev)=>{const w=Math.max(0,Math.min(1,(nExc-25)/50));return w*gv+(1-w)*ev;};
    for(const p of ps){
      if(p>0.90+1e-9){
        const cond=(1-p)/pu,emp=pick(p);
        const ev=(fHi&&cond>0&&cond<1)?shrink(excHi.length,uHi+gpdQuant(fHi,cond),emp):emp;
        out[p]=mNow+ev*scNow;}
      else if(p<0.10-1e-9){
        const cond=p/pu,emp=pick(p);
        const ev=(fLo&&cond>0&&cond<1)?shrink(excLo.length,uLo-gpdQuant(fLo,cond),emp):emp;
        out[p]=mNow+ev*scNow;}
    }
  }
  /* monotonluk guvencesi */
  const keys=ps.slice().sort((a,b)=>a-b);
  for(let i=1;i<keys.length;i++)
    if(out[keys[i]]<out[keys[i-1]])out[keys[i]]=out[keys[i-1]];
  return out;
}
const PS=[0.05,0.10,0.25,0.75,0.90,0.95];

function computeCore(rows,perDay,tfms){
    const M=buildVol(rows,perDay),n=rows.length;
    const cum=new Float64Array(n+1);for(let k=0;k<n;k++)cum[k+1]=cum[k]+M.ret[k];
    /* mevsimsellikten arindirilmis kare getiri ve kumulatif toplamlari:
       tum pencere hesaplarini O(1) yapar */
    const dsv=new Float64Array(n);
    for(let k=1;k<n;k++){const sv=isFinite(M.sea[k])?Math.max(M.sea[k],1e-6):1;dsv[k]=M.ret[k]*M.ret[k]/sv;}
    const cdsv=new Float64Array(n+1);for(let k=0;k<n;k++)cdsv[k+1]=cdsv[k]+dsv[k];
    const cSea=new Float64Array(n+1);
    for(let k=0;k<n;k++)cSea[k+1]=cSea[k]+(isFinite(M.sea[k])?M.sea[k]:1);
    const W30=30*perDay, W365=Math.min(Math.floor(n*0.6),365*perDay);
    const bWin=(i,w)=>{const a=Math.max(1,i-w);return (cdsv[i]-cdsv[a])/Math.max(1,i-a);};
    /* KARISIM AGIRLIGI: h bar sonrasinin gerceklesen varyansini, 30g ve 1y taban
       varyansinin log-karisimi ile en iyi aciklayan agirlik. Nedensel, ufka ozel.
       Volatilite soklari soner; uzun ufukta 30g tek basina yaniltir. */
    function fitBlend(hh,upto){
      /* uzun pencere icin en az 120 gunluk etkin gecmis yeterli sayilir;
         boylece agirlik, gecmis test doneminden ONCE de kestirilebilir */
      const minL=Math.min(W365,120*perDay);
      const pts=[];
      for(let k=M.WARM+minL;k<upto-hh;k+=Math.max(1,Math.floor(hh/2))){
        const s30=bWin(k,W30),sL=bWin(k,W365),fut=(cdsv[k+hh]-cdsv[k])/hh;
        if(s30>0&&sL>0&&fut>0)pts.push([Math.log(s30),Math.log(sL),Math.log(fut)]);}
      if(pts.length<40)return 1;
      let best=1,bestE=Infinity;
      for(let w=0;w<=1.0001;w+=0.05){
        let e=0;for(const [a,b2,y] of pts){const p=w*a+(1-w)*b2;e+=(y-p)*(y-p);}
        if(e<bestE){bestE=e;best=w;}}
      return best;}
    const HZ=[1,3,5,8].map(x=>x*perDay).filter(x=>x>=1);
    const CAL=Math.max(120*perDay,300);
    const calNote=perDay===1
      ? 'Günlük zaman diliminde kalibrasyon penceresi 300 bara genişletildi (araştırmada doğrulanan 120 gün yerine). Sonuçları daha temkinli okuyun.' : '';
    /* Ileri koni icin tam-orneklem agirligi mesru: gelecegi tahmin ediyoruz. */
    const WBL={};for(const hz of HZ)WBL[hz]=fitBlend(hz,n);
    /* NEDENSEL agirlik serisi: gecmis testte kullanilan agirlik yalnizca o ana
       kadarki veriyle secilir. Onceki surumde tam-orneklem agirligi gecmis
       teste giriyordu — kucuk ama ilkesel bir sizintiydi; giderildi. */
    const RB=60*perDay,WBLt={};
    for(const hz of HZ){
      const w=new Float64Array(n).fill(1);
      for(let t0=M.WARM;t0<n;t0+=RB){
        const cur=fitBlend(hz,t0),e=Math.min(n,t0+RB);
        for(let i=t0;i<e;i++)w[i]=cur;}
      WBLt[hz]=w;}
    /* ufka ozel varyans tahmini: V_h(i) = tabanKarisim_h(i) * (mevsimsel toplam) */
    const baseEff=(i,hz)=>{const w=WBLt[hz][i],s30=bWin(i,W30),sL=bWin(i,W365);
      if(!(s30>0)||!(sL>0))return NaN;
      return Math.exp(w*Math.log(s30)+(1-w)*Math.log(sL));};
    const Vh={};
    for(const hz of HZ){const v=new Float64Array(n).fill(NaN);
      for(let k=M.WARM;k<n-hz;k++){const b=baseEff(k,hz);
        if(isFinite(b))v[k]=b*(cSea[k+hz]-cSea[k]);}
      Vh[hz]=v;}
    /* trend buyuklugu (kosullandirma degiskeni) */
    const s2=new Float64Array(n+1);for(let k=0;k<n;k++)s2[k+1]=s2[k]+(isFinite(M.sig[k])?M.sig[k]*M.sig[k]:0);
    const L5=5*perDay,mg=new Float64Array(n).fill(NaN);
    for(let k=L5;k<n;k++){const v=(s2[k]-s2[k-L5]);if(v>0)mg[k]=Math.abs((cum[k]-cum[k-L5])/Math.sqrt(v));}
    const Z={};for(const hz of HZ){const z=new Float64Array(n).fill(NaN);
      for(let k=M.WARM;k<n-hz;k++){const V=Vh[hz][k];if(V>0)z[k]=(cum[k+hz]-cum[k])/Math.sqrt(V);}
      Z[hz]=z;}
        const steps=8*perDay,F=futureSeason(rows,M,steps,tfms,perDay);
    /* ileri koni: her adim icin ufka gore agirlik (HZ arasi enterpolasyon) */
    const wAt=s=>{const hz=s+1;
      if(hz<=HZ[0])return WBL[HZ[0]];
      for(let k=1;k<HZ.length;k++)if(hz<=HZ[k]){
        const t=(hz-HZ[k-1])/(HZ[k]-HZ[k-1]);return WBL[HZ[k-1]]*(1-t)+WBL[HZ[k]]*t;}
      return WBL[HZ[HZ.length-1]];};
    const b30=bWin(n,W30), b365=bWin(n,W365);
    const Vc=[];let accS=0;
    for(let s=0;s<steps;s++){
      accS+=F.sea[s];
      const w=wAt(s), bE=Math.exp(w*Math.log(b30)+(1-w)*Math.log(b365));
      Vc.push(bE*accS);}
    const blendW=WBL[HZ[HZ.length-1]];
    const P0=rows[n-1].c,mgNow=mg[n-1];
    const HQ={};for(const hz of HZ){HQ[hz]=calib(Z[hz],mg,n-hz,CAL,PS,isFinite(mgNow)?mgNow:0);}
    if(Object.values(HQ).some(v=>!v))return null;
    const cone={};for(const p of PS){cone[p]=[];
      for(let sx=0;sx<steps;sx++){
        const zi=interpZ(HZ,HQ,p,sx+1);cone[p].push(P0*Math.exp(zi*Math.sqrt(Vc[sx])));}}
    return {rows,perDay,n,M,HZ,CAL,calNote,Vh,Z,mg,cum,Vc,P0,mgNow,HQ,cone,blendW,fts:F.ts,steps};
}

function computeCore(rows,perDay,tfms){
    const M=buildVol(rows,perDay),n=rows.length;
    const cum=new Float64Array(n+1);for(let k=0;k<n;k++)cum[k+1]=cum[k]+M.ret[k];
    /* mevsimsellikten arindirilmis kare getiri ve kumulatif toplamlari:
       tum pencere hesaplarini O(1) yapar */
    const dsv=new Float64Array(n);
    for(let k=1;k<n;k++){const sv=isFinite(M.sea[k])?Math.max(M.sea[k],1e-6):1;dsv[k]=M.ret[k]*M.ret[k]/sv;}
    const cdsv=new Float64Array(n+1);for(let k=0;k<n;k++)cdsv[k+1]=cdsv[k]+dsv[k];
    const cSea=new Float64Array(n+1);
    for(let k=0;k<n;k++)cSea[k+1]=cSea[k]+(isFinite(M.sea[k])?M.sea[k]:1);
    const W30=30*perDay, W365=Math.min(Math.floor(n*0.6),365*perDay);
    const bWin=(i,w)=>{const a=Math.max(1,i-w);return (cdsv[i]-cdsv[a])/Math.max(1,i-a);};
    /* KARISIM AGIRLIGI: h bar sonrasinin gerceklesen varyansini, 30g ve 1y taban
       varyansinin log-karisimi ile en iyi aciklayan agirlik. Nedensel, ufka ozel.
       Volatilite soklari soner; uzun ufukta 30g tek basina yaniltir. */
    function fitBlend(hh,upto){
      /* uzun pencere icin en az 120 gunluk etkin gecmis yeterli sayilir;
         boylece agirlik, gecmis test doneminden ONCE de kestirilebilir */
      const minL=Math.min(W365,120*perDay);
      const pts=[];
      for(let k=M.WARM+minL;k<upto-hh;k+=Math.max(1,Math.floor(hh/2))){
        const s30=bWin(k,W30),sL=bWin(k,W365),fut=(cdsv[k+hh]-cdsv[k])/hh;
        if(s30>0&&sL>0&&fut>0)pts.push([Math.log(s30),Math.log(sL),Math.log(fut)]);}
      if(pts.length<40)return 1;
      let best=1,bestE=Infinity;
      for(let w=0;w<=1.0001;w+=0.05){
        let e=0;for(const [a,b2,y] of pts){const p=w*a+(1-w)*b2;e+=(y-p)*(y-p);}
        if(e<bestE){bestE=e;best=w;}}
      return best;}
    const HZ=[1,3,5,8].map(x=>x*perDay).filter(x=>x>=1);
    const CAL=Math.max(120*perDay,300);
    const calNote=perDay===1
      ? 'Günlük zaman diliminde kalibrasyon penceresi 300 bara genişletildi (araştırmada doğrulanan 120 gün yerine). Sonuçları daha temkinli okuyun.' : '';
    /* Ileri koni icin tam-orneklem agirligi mesru: gelecegi tahmin ediyoruz. */
    const WBL={};for(const hz of HZ)WBL[hz]=fitBlend(hz,n);
    /* NEDENSEL agirlik serisi: gecmis testte kullanilan agirlik yalnizca o ana
       kadarki veriyle secilir. Onceki surumde tam-orneklem agirligi gecmis
       teste giriyordu — kucuk ama ilkesel bir sizintiydi; giderildi. */
    const RB=60*perDay,WBLt={};
    for(const hz of HZ){
      const w=new Float64Array(n).fill(1);
      for(let t0=M.WARM;t0<n;t0+=RB){
        const cur=fitBlend(hz,t0),e=Math.min(n,t0+RB);
        for(let i=t0;i<e;i++)w[i]=cur;}
      WBLt[hz]=w;}
    /* ufka ozel varyans tahmini: V_h(i) = tabanKarisim_h(i) * (mevsimsel toplam) */
    const baseEff=(i,hz)=>{const w=WBLt[hz][i],s30=bWin(i,W30),sL=bWin(i,W365);
      if(!(s30>0)||!(sL>0))return NaN;
      return Math.exp(w*Math.log(s30)+(1-w)*Math.log(sL));};
    const Vh={};
    for(const hz of HZ){const v=new Float64Array(n).fill(NaN);
      for(let k=M.WARM;k<n-hz;k++){const b=baseEff(k,hz);
        if(isFinite(b))v[k]=b*(cSea[k+hz]-cSea[k]);}
      Vh[hz]=v;}
    /* trend buyuklugu (kosullandirma degiskeni) */
    const s2=new Float64Array(n+1);for(let k=0;k<n;k++)s2[k+1]=s2[k]+(isFinite(M.sig[k])?M.sig[k]*M.sig[k]:0);
    const L5=5*perDay,mg=new Float64Array(n).fill(NaN);
    for(let k=L5;k<n;k++){const v=(s2[k]-s2[k-L5]);if(v>0)mg[k]=Math.abs((cum[k]-cum[k-L5])/Math.sqrt(v));}
    const Z={};for(const hz of HZ){const z=new Float64Array(n).fill(NaN);
      for(let k=M.WARM;k<n-hz;k++){const V=Vh[hz][k];if(V>0)z[k]=(cum[k+hz]-cum[k])/Math.sqrt(V);}
      Z[hz]=z;}
        const steps=8*perDay,F=futureSeason(rows,M,steps,tfms,perDay);
    /* ileri koni: her adim icin ufka gore agirlik (HZ arasi enterpolasyon) */
    const wAt=s=>{const hz=s+1;
      if(hz<=HZ[0])return WBL[HZ[0]];
      for(let k=1;k<HZ.length;k++)if(hz<=HZ[k]){
        const t=(hz-HZ[k-1])/(HZ[k]-HZ[k-1]);return WBL[HZ[k-1]]*(1-t)+WBL[HZ[k]]*t;}
      return WBL[HZ[HZ.length-1]];};
    const b30=bWin(n,W30), b365=bWin(n,W365);
    const Vc=[];let accS=0;
    for(let s=0;s<steps;s++){
      accS+=F.sea[s];
      const w=wAt(s), bE=Math.exp(w*Math.log(b30)+(1-w)*Math.log(b365));
      Vc.push(bE*accS);}
    const blendW=WBL[HZ[HZ.length-1]];
    const P0=rows[n-1].c,mgNow=mg[n-1];
    const HQ={};for(const hz of HZ){HQ[hz]=calib(Z[hz],mg,n-hz,CAL,PS,isFinite(mgNow)?mgNow:0);}
    if(Object.values(HQ).some(v=>!v))return null;
    const cone={};for(const p of PS){cone[p]=[];
      for(let sx=0;sx<steps;sx++){
        const zi=interpZ(HZ,HQ,p,sx+1);cone[p].push(P0*Math.exp(zi*Math.sqrt(Vc[sx])));}}
    return {rows,perDay,n,M,HZ,CAL,calNote,Vh,Z,mg,cum,Vc,P0,mgNow,HQ,cone,blendW,fts:F.ts,steps};
}
/* ========== ana akis ========== */

function interpZ(HZ,HQ,p,step){
  if(step<=HZ[0])return HQ[HZ[0]][p];
  for(let i=1;i<HZ.length;i++){if(step<=HZ[i]){
    const w=(step-HZ[i-1])/(HZ[i]-HZ[i-1]);return HQ[HZ[i-1]][p]*(1-w)+HQ[HZ[i]][p]*w;}}
  return HQ[HZ[HZ.length-1]][p];
}

function evalCombo(S,side,hz,qs,Rm,N,seed,demean){
  const P0=S.P0,M=S.M,n=S.rows.length;
  const sg=Math.sqrt(S.Vc[hz-1]);
  const dStop=Math.abs(side>0?S.HQ[hz][qs]*sg:S.HQ[hz][1-qs]*sg), dTgt=dStop*Rm;
  const sigF=[];for(let s=0;s<hz;s++)sigF.push(Math.sqrt(S.Vc[s]-(s?S.Vc[s-1]:0)));
  /* normalize kapanis + bar-ici uc noktalar */
  if(!S._u){const a=[],aH=[],aL=[];
    for(let i=M.WARM;i<n;i++){const s=M.sig[i];
      if(isFinite(s)&&s>0&&isFinite(M.ret[i])){a.push(M.ret[i]/s);aH.push(M.exHi[i]/s);aL.push(M.exLo[i]/s);}}
    S._u=a;S._uH=aH;S._uL=aL;}
  const u=S._u,uH=S._uH,uL=S._uL;
  const uBar=S._uBar!==undefined?S._uBar:(S._uBar=u.reduce((a,b)=>a+b,0)/u.length);
  if(u.length<hz*4)return null;
  const COST=2*(+(document.getElementById('tCost')||{value:11}).value)/1e4;
  let x=seed|1,win=0,loss=0,sum=0,sum2=0;
  const tc=new Int32Array(hz+1);            /* cikis suresi histogrami (bar) */
  const rnd=()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/4294967296;
  for(let k=0;k<N;k++){
    const st=Math.floor(rnd()*(u.length-hz));let c=0,out=0,tex=hz;
    for(let s=0;s<hz;s++){
      const dm=demean?uBar:0, sf=sigF[s];
      /* bar icinde once aleyhe hareket varsayilir (muhafazakar) */
      const adverse=side>0?(uL[st+s]-dm)*sf:(uH[st+s]-dm)*sf;
      const favor  =side>0?(uH[st+s]-dm)*sf:(uL[st+s]-dm)*sf;
      if(side*(c+adverse)<=-dStop){out=-1;tex=s+1;break;}
      if(side*(c+favor)>=dTgt){out=1;tex=s+1;break;}
      c+=(u[st+s]-dm)*sf;}
    tc[tex]++;
    let R;
    if(out===-1){loss++;R=-1;}else if(out===1){win++;R=Rm;}else{R=(side*c)/dStop;}
    R-=COST/dStop;sum+=R;sum2+=R*R;}
  let acc=0,tMed=hz;
  for(let t=0;t<=hz;t++){acc+=tc[t];if(acc>=N/2){tMed=t;break;}}
  const m=sum/N,sd=Math.sqrt(Math.max(0,sum2/N-m*m));
  const nEff=Math.max(8,Math.floor(u.length/hz));
  return {ev:m,se:sd/Math.sqrt(nEff),pW:win/N,pL:loss/N,dStop,side,hz,qs,Rm,tMed};
}
