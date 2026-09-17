'use strict';
const test=require('node:test');const assert=require('node:assert');
const C=require('../site/sinyal-core.js');
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} ≈ ${b}`);
const t0=Date.parse('2024-01-01'),H=36e5;
const bar=(i,h,l,c)=>({t:t0+i*H,o:c,h,l,c});

test('çekirdek: replay + ayrıştırıcı worker ile aynı sonuç', ()=>{
  const s=C.parseSignal('BTCUSDT LONG\nEntry 100\nSL 90\nTP 110',t0);
  assert.ok(s); const p=C.toPlan(s,100);
  const rep=C.replayPlan([bar(1,112,98,110)],p); assert.strictEqual(rep.state,'tp2');
});
test('fillPlan sıkı: giriş dolmadıysa null, dolduysa o bardan başlar ve tp1 yok', ()=>{
  const p={sym:'X',side:1,entry:100,sl:95,tp1:103,tp2:110,rm:2,d_stop:0.05,t0:t0,t_end:t0+30*C.DAY};
  const bars=[bar(0,104,101,103),bar(1,111,102,110)];              // fiyat 100'e hiç gelmedi, hedefe gitti
  assert.strictEqual(C.fillPlan(p,bars,0,true),null);
  const bars2=[bar(0,102,99,101),bar(1,111,100,110)];
  const f=C.fillPlan(p,bars2,0,true); assert.ok(f); assert.strictEqual(f.t0,bars2[0].t); assert.strictEqual(f.tp1,null);
  assert.strictEqual(C.fillPlan(p,bars,0,false),p);
});
test('monkeyTest: gerçek plan listesi korunur, hüküm kuralı', ()=>{
  const plans=[];const bars={X:[]};
  for(let i=0;i<60;i++){bars.X.push(bar(i*3,112,98,110),bar(i*3+1,112,98,110),bar(i*3+2,112,98,110));
    plans.push({sym:'X',side:1,entry:100,sl:90,tp1:null,tp2:110,rm:1,d_stop:0.1,t0:t0+(i*3)*H-1,t_end:t0+(i*3+2)*H});}
  const r=C.monkeyTest(plans,bars,{controls:20});
  assert.strictEqual(r.n,60); assert.ok(r.winRate>0.99); assert.strictEqual(r.verdict,'MAYMUNU YENDİ');
  const r2=C.monkeyTest(plans.slice(0,10),bars,{controls:5}); assert.strictEqual(r2.verdict,'YETERSİZ VERİ');
});
test('singleSignal: geometri, başabaş, yönsüz isabet makul aralıkta', ()=>{
  let s=3;const rnd=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)/4294967296);};
  let c=100;const bars=[];for(let i=0;i<720;i++){c*=Math.exp(0.004*(rnd()-0.5)*3.46);bars.push(bar(i,c*1.001,c*0.999,c));}
  const r=C.singleSignal({side:1,entry:NaN,sl:c*0.97,tps:[c*1.06]},bars,{N:1500,leverage:20});
  near(r.rm,Math.log(1.06)/Math.abs(Math.log(0.97)),1e-9);
  assert.ok(r.pWin>0.15&&r.pWin<0.6); assert.ok(r.breakeven>0.3&&r.breakeven<0.4);
  assert.ok(r.liq!=null&&r.liq<r.entry);                                   // 20x long: tasfiye ~%5 altında
  assert.strictEqual(r.liqBeforeStop,false);                               // stop %3, tasfiye %5 → stop önce
  const r2=C.singleSignal({side:1,entry:NaN,sl:c*0.90,tps:[c*1.06]},bars,{N:300,leverage:20});
  assert.strictEqual(r2.liqBeforeStop,true);
});
