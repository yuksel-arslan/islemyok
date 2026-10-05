'use strict';
const test=require('node:test');const assert=require('node:assert');
const D=require('./tdi');
const H=36e5,t0=Date.parse('2024-01-01');
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} ≈ ${b}`);

test('RSI Wilder: sürekli yükseliş 100, sürekli düşüş 0, el hesabı', ()=>{
  near(D.rsiWilder(Array.from({length:30},(_,i)=>100+i))[29],100);
  near(D.rsiWilder(Array.from({length:30},(_,i)=>100-i))[29],0);
  /* n=2: değişimler +2,-1 → ort kazanç 1, kayıp .5 → RSI 66.67; sonra +1: g=(1+1)/2=1, l=.25 → 80 */
  const r=D.rsiWilder([10,12,11,12],2);
  assert.ok(Number.isNaN(r[1]));near(r[2],100-100/3);near(r[3],80);
});

test('SMA: pencere ve NaN başlangıcı', ()=>{
  const s=D.sma([NaN,1,2,3,4],2);
  assert.ok(Number.isNaN(s[0])&&Number.isNaN(s[1]));near(s[2],1.5);near(s[4],3.5);
});

test('sinyal: yukarı kesişme + taban ve 50 üstü → long; ayna → short; şartsız kesişme → 0', ()=>{
  const T=(g0,g1,r0,r1,b)=>({green:[g0,g1],red:[r0,r1],base:[b,b]});
  assert.strictEqual(D.signalAt(T(50,60,55,55,52),1),1);
  assert.strictEqual(D.signalAt(T(50,60,55,55,62),1),0,'taban altında');
  assert.strictEqual(D.signalAt(T(40,48,45,45,40),1),0,'50 altında');
  assert.strictEqual(D.signalAt(T(50,40,45,45,48),1),-1);
  assert.strictEqual(D.signalAt(T(60,62,55,55,50),1),0,'kesişme yok');
});

function rw(n,seed=5,drift=0){let x=seed,c=100;const rnd=()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/4294967296;
  return Array.from({length:n},(_,i)=>{const o=c;c=o*Math.exp(drift+0.01*(rnd()-0.5));
    return {t:t0+i*H,o,h:Math.max(o,c)*1.001,l:Math.min(o,c)*0.999,c};});}

test('geleceğe bakmaz: i sonrası barları bozmak i\'deki planları değiştirmez (tdi)', ()=>{
  const bars=rw(1500),cut=1000;
  const a=D.tdiPlans({BTCUSDT:bars},'1h','tdi').filter(p=>p.t0<bars[cut].t-48*H);
  const mod=bars.map((b,i)=>i>cut?{...b,c:b.c*1.5,h:b.h*1.5,l:b.l*1.5}:b);
  const b=D.tdiPlans({BTCUSDT:mod},'1h','tdi').filter(p=>p.t0<bars[cut].t-48*H);
  assert.ok(a.length>5);
  assert.deepStrictEqual(a.map(p=>[p.t0,p.side,p.entry]),b.map(p=>[p.t0,p.side,p.entry]));
});

test('tekrar koruması: aynı yön açıkken yeni plan yok; tdi_x çıkışı ters kesişmede', ()=>{
  const bars=rw(3000,9);
  for(const v of ['tdi','tdi_x']){
    const ps=D.tdiPlans({BTCUSDT:bars},'1h',v);
    const last={};
    for(const p of ps){const k=p.side;assert.ok(!last[k]||last[k].t_end<=p.t0,`${v}: üst üste aynı yön`);last[k]=p;}}
  const T=D.computeTDI(bars);
  for(const p of D.tdiPlans({BTCUSDT:bars},'1h','tdi_x').slice(0,20)){
    const i=bars.findIndex(b=>b.t===p.t0),e=bars.findIndex(b=>b.t===p.t_end);
    assert.ok(e>i&&e-i<=120);
    if(e-i<120&&e<bars.length-1){const g=T.green,r=T.red;
      assert.ok(p.side>0?(g[e]<r[e]):(g[e]>r[e]),'çıkış barında ters kesişme');}}
});

test('saf rastgele yürüyüşte geçmez (yanlış pozitif yok)', ()=>{
  const {runPlans}=require('./strategies');
  const rows={BTCUSDT:rw(6000,11),ETHUSDT:rw(6000,23)};
  const r=runPlans('tdi',D.tdiPlans(rows,'1h','tdi'),rows,{controls:10});
  assert.ok(r.n>30);assert.strictEqual(r.pass,false);
});
