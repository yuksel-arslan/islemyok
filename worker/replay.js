/* İşlem Yok — plan oynatıcı
   Sitedeki replayPlan'ın birebir sunucu kopyası. Bariyerler mum içi
   en yüksek/en düşük fiyatla kontrol edilir, sadece kapanışla değil. */
'use strict';

/* pl: {side,entry,sl,tp1,tp2,rm,d_stop,t0,t_end}
   dönüş: {state,at,px,R,half}
   state: wait | open | stop | be | tp2 | expired */
function replayPlan(bars,pl){
  const seg=bars.filter(b=>b.t>pl.t0&&b.t<=pl.t_end);
  if(!seg.length)return {state:'wait',R:0,half:false,n:0};
  const up=pl.side>0;
  let half=false, realized=0, stop=pl.sl;
  for(let i=0;i<seg.length;i++){
    const b=seg[i];
    const adv=up?b.l:b.h, fav=up?b.h:b.l;
    if(up?(adv<=stop):(adv>=stop)){
      const rStop=half?0:-1;                       /* girişe çekilmişse kalan yarım 0R */
      return {state:half?'be':'stop',at:b.t,px:stop,
              R:realized+(half?0.5*rStop:rStop),half,n:i+1};}
    if(pl.tp1&&!half&&(up?(fav>=pl.tp1):(fav<=pl.tp1))){
      half=true;realized=0.5*1;stop=pl.entry;}
    if(up?(fav>=pl.tp2):(fav<=pl.tp2))
      return {state:'tp2',at:b.t,px:pl.tp2,
              R:half?realized+0.5*pl.rm:pl.rm,half,n:i+1};}
  const last=seg[seg.length-1], done=last.t>=pl.t_end;
  const openR=(pl.side*Math.log(last.c/pl.entry))/pl.d_stop;
  return {state:done?'expired':'open',at:last.t,px:last.c,
          R:half?realized+0.5*openR:openR,half,n:seg.length};
}

/* komisyon + kayma (çift yön, 11bp) ve süresiz sözleşmede fonlama düşülür */
function netR(rep,pl,f8){
  let R=rep.R-(2*11/1e4)/pl.d_stop;
  if(f8!=null&&rep.at){
    const holdH=Math.max(0,(rep.at-pl.t0))/36e5;
    R-=pl.side*f8*(holdH/8)/pl.d_stop;}
  return R;
}

/* hedefe kat edilen yol ve gidiş yönü — açık sinyaller için */
function progress(bars,pl){
  const seg=bars.filter(b=>b.t>pl.t0&&b.t<=pl.t_end);
  if(!seg.length)return null;
  const cur=seg[seg.length-1].c;
  const rNow=(pl.side*Math.log(cur/pl.entry))/pl.d_stop;
  const yol=Math.max(0,Math.min(1,rNow/pl.rm));
  let yon=null,hiz=null,eta=null;
  if(seg.length>=4){
    const k=Math.max(2,Math.floor(seg.length/3));
    const eski=seg[seg.length-1-k];
    const rEski=(pl.side*Math.log(eski.c/pl.entry))/pl.d_stop;
    const d=rNow-rEski;
    yon=d>0.03?'yaklaşıyor':d<-0.03?'uzaklaşıyor':'yatay';
    hiz=d/k;
    if(hiz>0.002)eta=((pl.rm-rNow)/hiz);          /* bar cinsinden */
  }
  return {cur,rNow,yol,yon,hiz,etaBars:eta};
}

module.exports={replayPlan,netR,progress};
