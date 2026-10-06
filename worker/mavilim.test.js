'use strict';
const test=require('node:test');const assert=require('node:assert');
const {wma,mavilim,compute,mavPlans}=require('./mavilim');
const {senaryo}=require('./sentetik');
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} ≈ ${b}`);
const H=36e5,t0=Date.UTC(2024,0,1);
const mk=cl=>cl.map((c,i)=>({t:t0+i*H,o:c,h:c*1.001,l:c*0.999,c}));

test('wma: Pine ağırlıkları (en yeni en ağır)', ()=>{
  const w=wma([1,2,3],3);assert.ok(isNaN(w[1]));near(w[2],(1*1+2*2+3*3)/6);
});

test('mavilim: sabit seride sabit, ilk geçerli değer 3+5+8+13+21+34−6 = 78. indekste', ()=>{
  const M=mavilim(Array(100).fill(50));assert.ok(isNaN(M[77]));near(M[78],50);near(M[99],50);
});

test('compute nedensel: önek hesabı tam seriyle aynı', ()=>{
  const b=senaryo({bars:3000,seed:3}).BTCUSDT,I=compute(b),J=compute(b.slice(0,2000));
  for(let i=0;i<2000;i++){assert.strictEqual(I.renk[i],J.renk[i]);assert.strictEqual(I.kesis[i],J.kesis[i]);}
});

test('renk: düşüşten yükselişe dönüşte kırmızı→mavi (long)', ()=>{
  const cl=[...Array.from({length:200},(_,i)=>200-i*0.5),...Array.from({length:200},(_,i)=>100+i*0.5)];
  const I=compute(mk(cl)),ups=[...I.renk].map((x,i)=>x===1?i:-1).filter(i=>i>=0);
  assert.ok(ups.length===1&&ups[0]>200&&ups[0]<260,`tek dönüş: ${ups}`);
});

test('*_vol planları temel kuralın alt kümesi', ()=>{
  const r=senaryo({bars:4000,seed:5});
  const key=p=>p.sym+p.t0+p.side,base=new Set(mavPlans('mav_kesis',r,'1h').map(key)),vol=mavPlans('mav_kesis_vol',r,'1h');
  assert.ok(vol.length>0&&vol.length<base.size&&vol.every(p=>base.has(key(p))));
});
