/* İşlem Yok — DENEYSEL: koşullu (analog) bootstrap değerlendirici
   evalCombo ile aynı bariyer, maliyet, stop mesafesi (HQ) ve vol konisi (Vc).
   TEK FARK: simülasyon başlangıçları tüm geçmişten rastgele değil, ŞU ANKİ
   duruma en yakın K geçmiş pencereden çekilir. Durum = işaretli momentum
   (5g, 20g; vol'e normalize) + vol rejimi (log sig/medyan). Böylece model ilk
   kez "şimdi ne oluyor"a bakar; koşulsuz model yalnız geçmiş ortalamaya bakar.

   Canlı bota bağlı DEĞİL. engine_core.js (üretilmiş) değişmez. Walk-forward'da
   --model cond ile A/B sınanır; kural: gerçek planlarda ort. R>0 ve t≥2 yoksa ölür. */
'use strict';

/* u dizisi (normalize getiri) + orijinal bar indeksi + standartlaştırılmış durum vektörü */
function stateOf(S){
  if(S._cu)return S._cu;
  const M=S.M,n=S.rows.length,perDay=S.perDay;
  const idx=[],u=[],uH=[],uL=[];
  for(let i=M.WARM;i<n;i++){const s=M.sig[i];
    if(isFinite(s)&&s>0&&isFinite(M.ret[i])){idx.push(i);u.push(M.ret[i]/s);uH.push(M.exHi[i]/s);uL.push(M.exLo[i]/s);}}
  const cs=new Float64Array(n),cv=new Float64Array(n);
  for(let i=1;i<n;i++){const r=isFinite(M.ret[i])?M.ret[i]:0,s=M.sig[i];
    cs[i]=cs[i-1]+r;cv[i]=cv[i-1]+(isFinite(s)&&s>0?s*s:0);}
  const mom=(i,Lw)=>{if(i-Lw<0)return NaN;const v=cv[i]-cv[i-Lw];return v>0?(cs[i]-cs[i-Lw])/Math.sqrt(v):NaN;};
  const sigs=[];for(let i=M.WARM;i<n;i++)if(isFinite(M.sig[i])&&M.sig[i]>0)sigs.push(M.sig[i]);
  sigs.sort((a,b)=>a-b);const med=sigs[Math.floor(sigs.length/2)]||1;
  const L5=5*perDay,L20=20*perDay;
  const raw=i=>[mom(i,L5),mom(i,L20),Math.log(M.sig[i]/med)];
  const feat=idx.map(raw);
  const F=3,mu=[0,0,0],sd=[0,0,0];let cnt=0;
  for(const f of feat)if(f.every(isFinite)){cnt++;for(let k=0;k<F;k++)mu[k]+=f[k];}
  for(let k=0;k<F;k++)mu[k]/=Math.max(1,cnt);
  for(const f of feat)if(f.every(isFinite))for(let k=0;k<F;k++)sd[k]+=(f[k]-mu[k])**2;
  for(let k=0;k<F;k++)sd[k]=Math.sqrt(sd[k]/Math.max(1,cnt-1))||1;
  const zs=f=>f.every(isFinite)?f.map((x,k)=>(x-mu[k])/sd[k]):null;
  const z=feat.map(zs), now=raw(n-1), zNow=zs(now);
  S._cu={idx,u,uH,uL,z,zNow,now};return S._cu;
}

/* Şu ana en yakın K pencere (ufka göre; hz sonrası taşmayanlar). zNow yoksa hepsi. */
function neighbors(S,hz,opts={}){
  const C=stateOf(S);
  S._cnn=S._cnn||{};const key=hz+'|'+(opts.frac||0.15)+'|'+(opts.minK||200);
  if(S._cnn[key])return S._cnn[key];
  const cand=[];for(let j=0;j<C.u.length-hz;j++)if(C.z[j])cand.push(j);
  let nn=cand;
  if(C.zNow&&cand.length){
    const d=cand.map(j=>{const a=C.z[j];let s=0;for(let k=0;k<a.length;k++){const t=a[k]-C.zNow[k];s+=t*t;}return [s,j];});
    d.sort((a,b)=>a[0]-b[0]);
    const K=Math.min(cand.length,Math.max(opts.minK||200,Math.floor((opts.frac||0.15)*cand.length)));
    nn=d.slice(0,K).map(x=>x[1]);}
  S._cnn[key]=nn;return nn;
}

function evalComboCond(S,side,hz,qs,Rm,N,seed,demean,opts={}){
  const C=stateOf(S),u=C.u,uH=C.uH,uL=C.uL;
  if(u.length<hz*4)return null;
  const nn=neighbors(S,hz,opts);
  if(nn.length<Math.max(8,hz))return null;
  const sg=Math.sqrt(S.Vc[hz-1]);
  const dStop=Math.abs(side>0?S.HQ[hz][qs]*sg:S.HQ[hz][1-qs]*sg),dTgt=dStop*Rm;
  const sigF=[];for(let s=0;s<hz;s++)sigF.push(Math.sqrt(S.Vc[s]-(s?S.Vc[s-1]:0)));
  /* koşullu ortalama: komşu pencerelerin hz-bar ortalaması (null için düşülür) */
  S._cbar=S._cbar||{};
  let cbar=S._cbar[hz];
  if(cbar===undefined){let s=0,c=0;for(const j of nn)for(let k=0;k<hz;k++){s+=u[j+k];c++;}cbar=c?s/c:0;S._cbar[hz]=cbar;}
  const doc=globalThis.document,el=doc&&doc.getElementById?doc.getElementById('tCost'):null;
  const COST=2*(+((el||{value:11}).value))/1e4;
  let x=seed|1,win=0,loss=0,sum=0,sum2=0;
  const tc=new Int32Array(hz+1);
  const rnd=()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/4294967296;
  for(let k=0;k<N;k++){
    const st=nn[Math.floor(rnd()*nn.length)];let c=0,out=0,tex=hz;
    for(let s=0;s<hz;s++){
      const dm=demean?cbar:0,sf=sigF[s];
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
  const nEff=Math.max(8,Math.floor(nn.length/hz));            /* evalCombo ile aynı gelenek */
  return {ev:m,se:sd/Math.sqrt(nEff),pW:win/N,pL:loss/N,dStop,side,hz,qs,Rm,tMed,cond:{K:nn.length,now:C.now}};
}

module.exports={evalComboCond,neighbors,stateOf};
