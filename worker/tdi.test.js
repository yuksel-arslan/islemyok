'use strict';
const test=require('node:test');const assert=require('node:assert');
const {sma,ema,rsi,compute,signalAt,tdiPlans}=require('./tdi');
const {senaryo}=require('./sentetik');
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} ≈ ${b}`);
const H=36e5,t0=Date.UTC(2024,0,1);
const mk=cl=>cl.map((c,i)=>({t:t0+i*H,o:c,h:c*1.001,l:c*0.999,c}));

test('sma/ema: Pine tohumlaması (ema ilk değeri SMA)', ()=>{
  const s=sma([1,2,3,4],2);assert.ok(isNaN(s[0]));near(s[1],1.5);near(s[3],3.5);
  const e=ema([1,2,3,4],2);assert.ok(isNaN(e[0]));near(e[1],1.5);near(e[2],2/3*3+1/3*1.5);
});

test('rsi: sürekli yükselen → 100, sürekli düşen → 0', ()=>{
  const up=rsi(Array.from({length:40},(_,i)=>100+i),21),dn=rsi(Array.from({length:40},(_,i)=>100-i),21);
  near(up[39],100);near(dn[39],0);assert.ok(isNaN(up[20]));
});

test('compute nedensel: önek hesabı tam seriyle aynı', ()=>{
  const b=senaryo({bars:3000,seed:3}).BTCUSDT,I=compute(b,H),J=compute(b.slice(0,2000),H);
  for(let i=0;i<2000;i++){assert.strictEqual(I.cross[i],J.cross[i]);assert.strictEqual(I.htf[i],J.htf[i]);
    assert.strictEqual(I.mzl[i],J.mzl[i]);if(isFinite(J.score[i]))near(I.score[i],J.score[i]);}
});

test('kesişme: düşüşten yükselişe dönüşte long kesişmesi', ()=>{
  const cl=[...Array.from({length:200},(_,i)=>200-i*0.5+Math.sin(i)*0.3),...Array.from({length:200},(_,i)=>100+i*0.5+Math.sin(i)*0.3)];
  const I=compute(mk(cl),H),ups=[...I.cross].map((x,i)=>x===1?i:-1).filter(i=>i>=0);
  assert.ok(ups.some(i=>i>200&&i<260),'dönüşten kısa süre sonra yukarı kesişme');
  assert.strictEqual(signalAt(I,ups.find(i=>i>200),false),1);
});

test('tdiPlans: ayni sym+yön açıkken tekrar açmaz, planlar zaman sıralı', ()=>{
  const r=senaryo({bars:4000,seed:5}),P=tdiPlans('tdi_x',r,'1h');
  assert.ok(P.length>0);
  for(let k=1;k<P.length;k++)assert.ok(P[k].t0>=P[k-1].t0);
  const last={};for(const p of P){const key=p.sym+'|'+p.side;
    if(last[key])assert.ok(last[key].t_end<=p.t0,'çakışan aynı yön planı');last[key]=p;}
});

test('hacim koşulu: hacim SMA20 altında → *_vol sinyal vermez, üstünde → verir; hacim yoksa vermez', ()=>{
  const I={cross:Int8Array.from([0,1]),volOk:Int8Array.from([0,0]),mzl:[],score:[],htf:[]};
  assert.strictEqual(signalAt(I,1,false,false),1);
  assert.strictEqual(signalAt(I,1,false,true),0);
  I.volOk[1]=1;assert.strictEqual(signalAt(I,1,false,true),1);
  const b=mk(Array.from({length:60},(_,i)=>100+i));            // v alanı yok
  assert.ok(compute(b,H).volOk.every(x=>x===0));
  const bv=b.map((x,i)=>({...x,v:i===59?50:10}));
  const J=compute(bv,H);assert.strictEqual(J.volOk[59],1);assert.strictEqual(J.volOk[58],0);
});

test('*_vol planları temel kuralın alt kümesi', ()=>{
  const r=senaryo({bars:4000,seed:5});
  const key=p=>p.sym+p.t0+p.side,base=new Set(tdiPlans('tdi_x',r,'1h').map(key)),vol=tdiPlans('tdi_x_vol',r,'1h');
  assert.ok(vol.length>0&&vol.length<base.size);
});
