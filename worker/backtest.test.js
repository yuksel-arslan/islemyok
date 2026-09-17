'use strict';
/* backtest birim testleri — sentetik barlar, ağ yok. Çalıştır: npm test */
const test=require('node:test');
const assert=require('node:assert');
const {backtest,aggregate,runOne,formatReport}=require('./backtest');

const D=0.1;                             // d_stop (~%10 stop)
const COST=(2*11/1e4)/D;                 // netR'nin düştüğü komisyon+kayma = 0.022
const bar=(t,h,l,c,o=100)=>({t,o,h,l,c});
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} ≈ ${b} bekleniyordu`);

// ortak plan iskeleti (long)
const P=(x)=>({sym:'X',side:1,entry:100,sl:90,tp1:null,tp2:110,rm:1,d_stop:D,t0:0,t_end:10000,...x});

test('TP2 vuran long → state tp2, R = rm - maliyet', ()=>{
  const r=runOne(P({tp2:110,rm:1}), [bar(100,112,98,110)], null);
  assert.strictEqual(r.state,'tp2');
  near(r.R, 1 - COST);
});

test('Stop yiyen long → state stop, R = -1 - maliyet', ()=>{
  const r=runOne(P({}), [bar(100,101,88,95)], null);
  assert.strictEqual(r.state,'stop');
  near(r.R, -1 - COST);
});

test('TP1 sonra stop → state be, R = 0.5 - maliyet', ()=>{
  const pl=P({tp1:105,tp2:130,rm:2});
  const r=runOne(pl, [bar(100,106,98,104), bar(200,101,99,100)], null);
  assert.strictEqual(r.state,'be');
  near(r.R, 0.5 - COST);
});

test('Vade dolan long → state expired, R = openR - maliyet', ()=>{
  const pl=P({tp2:200,rm:1,t_end:50});
  const r=runOne(pl, [bar(50,105,96,103)], null);
  assert.strictEqual(r.state,'expired');
  const openR=Math.log(103/100)/D;
  near(r.R, openR - COST);
});

test('Barı olmayan plan → no-data, aggregate saymaz', ()=>{
  const res=backtest([P({sym:'YOK'})], {}, {});
  assert.strictEqual(res.rows[0].state,'no-data');
  assert.strictEqual(res.n,0);
  assert.strictEqual(res.skipped,1);
});

test('aggregate: toplam R, kazanma oranı, max drawdown, profit factor', ()=>{
  const rows=[
    {state:'tp2',     R: 0.978, bars:1},   // kazanç
    {state:'stop',    R:-1.022, bars:1},   // kayıp
    {state:'expired', R: 0.274, bars:1},   // kazanç
    {state:'be',      R: 0.478, bars:2},   // kazanç
    {state:'open',    R: 5.0,   bars:9},   // sayılmamalı
  ];
  const g=aggregate(rows);
  assert.strictEqual(g.n, 4);
  assert.strictEqual(g.wins, 3);
  assert.strictEqual(g.losses, 1);
  near(g.winRate, 0.75);
  near(g.totalR, 0.978-1.022+0.274+0.478, 1e-9);
  // özkaynak: 0.978 → -0.044 → 0.230 → 0.708; tepe 0.978, en dip -0.044
  near(g.maxDrawdown, 0.978-(-0.044), 1e-9);
  const gw=0.978+0.274+0.478, gl=1.022;
  near(g.profitFactor, gw/gl, 1e-9);
  near(g.avgHoldBars, (1+1+1+2)/4);
  assert.strictEqual(g.byState.tp2,1);
});

test('profit factor: hiç kayıp yoksa sonsuz', ()=>{
  const g=aggregate([{state:'tp2',R:1,bars:1},{state:'tp2',R:2,bars:1}]);
  assert.strictEqual(g.profitFactor, Infinity);
});

test('short plan da doğru oynatılır (TP2)', ()=>{
  // side=-1: fiyat düşünce kazanır. entry=100, tp2=90, sl=110
  const pl={sym:'X',side:-1,entry:100,sl:110,tp1:null,tp2:90,rm:1,d_stop:D,t0:0,t_end:10000};
  const r=runOne(pl, [bar(100,102,88,90)], null);
  assert.strictEqual(r.state,'tp2');
  near(r.R, 1 - COST);
});

test('formatReport bir string üretir ve alanları içerir', ()=>{
  const res=backtest([P({})], {X:[bar(100,112,98,110)]}, {});
  const s=formatReport(res);
  assert.match(s, /Backtest/);
  assert.match(s, /Toplam:/);
  assert.match(s, /Kazanma:/);
});
