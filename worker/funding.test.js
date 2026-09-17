'use strict';
const test=require('node:test');const assert=require('node:assert');
const F=require('./funding');
const {makeGenerator,runStrategy,STRATS}=require('./strategies');
const near=(a,b,tol=1e-12)=>assert.ok(Math.abs(a-b)<tol,`${a} ≈ ${b}`);
const H=36e5,t0=Date.parse('2024-01-01');
const ser=(rates)=>rates.map((r,i)=>({t:t0+i*F.H8,r}));

test('fundingAt/avgN: T\'ye kadar son ödeme, geleceğe bakmaz', ()=>{
  const s=ser([0.0001,0.0002,0.0003,0.0004]);
  near(F.fundingAt(s,t0+F.H8*1.5),0.0002); near(F.avgN(s,t0+F.H8*2,2),0.00025);
  assert.ok(Number.isNaN(F.fundingAt(s,t0-1))); assert.ok(Number.isNaN(F.avgN(s,t0,3)));
});
test('pctRank: uç değer %100, taban %0', ()=>{
  const s=ser(Array.from({length:300},(_,i)=>i<297?0.0001:0.001));
  assert.ok(F.pctRank(s,t0+299*F.H8,3,270)>=0.99);
  const lo=ser(Array.from({length:300},(_,i)=>i<297?0.0001:-0.001));
  near(F.pctRank(lo,t0+299*F.H8,3,270),0);
});
test('sumBetween: (t0,t1] aralığı', ()=>{
  const s=ser([0.0001,0.0002,0.0003,0.0004]);
  near(F.sumBetween(s,t0,t0+2*F.H8),0.0005); near(F.sumBetween(s,t0+F.H8,t0+F.H8),0);
});
test('fund_abs: yüksek fonlama → short, negatif → long, veri yoksa plan yok', ()=>{
  const bars=Array.from({length:600},(_,i)=>({t:t0+i*H,o:100,h:100.2,l:99.8,c:100+0.1*Math.sin(i)}));
  const T=t0+599*H;
  const hi={BTCUSDT:ser(Array.from({length:80},()=>0.0005))};
  const lo={BTCUSDT:ser(Array.from({length:80},()=>-0.0005))};
  const g=(fb)=>makeGenerator('fund_abs','1h',{BTCUSDT:bars},{fundingBySym:fb})(T,{BTCUSDT:bars});
  assert.deepStrictEqual(g(hi).map(p=>p.side),[-1]); assert.deepStrictEqual(g(lo).map(p=>p.side),[1]);
  assert.deepStrictEqual(g({}),[]);
});
test('gerçekleşen fonlama R\'ye eklenir: short pozitif oranı alır; kontrol de aynı düzeltmeyi görür', ()=>{
  let x=3;const rnd=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return ((x>>>0)/4294967296);};
  let c=100;const bars=Array.from({length:2000},(_,i)=>{const o=c;c=o*Math.exp(0.005*(rnd()-0.5)*3.4);
    return {t:t0+i*H,o,h:Math.max(o,c)*1.002,l:Math.min(o,c)*0.998,c};});   // gerçekçi vol → planlar saatlerce açık kalır
  const fb={BTCUSDT:ser(Array.from({length:700},()=>0.0005))};              // sürekli yüksek → hep short
  const r=runStrategy('fund_abs',{BTCUSDT:bars},'1h',{step:24,warmup:800,controls:2,fundingBySym:fb});
  assert.ok(r.n>0); assert.ok(r.rows.every(p=>p.side===-1));
  assert.ok(r.rows.some(p=>p.fundR>0),'en az bir plan ≥8s açık kalıp fonlama almalı');
  assert.ok(r.rows.every(p=>p.fundR==null||p.fundR>=0),'short hiç ödememeli');
  near(r.fundTotal,r.rows.filter(p=>p.fundR).reduce((a,p)=>a+p.fundR,0));
  assert.strictEqual(r.ctrl.length,2);
});
