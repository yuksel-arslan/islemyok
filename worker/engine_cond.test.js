'use strict';
/* koşullu değerlendirici testleri — gerçek computeCore üzerinde sentetik seri, ağ yok */
const test=require('node:test');
const assert=require('node:assert');
const eng=require('./engine');
const {evalComboCond,neighbors,stateOf}=require('./engine_cond');

let seed=5;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)/4294967296);};
const gauss=()=>{const u=1-rnd(),v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
function gbm(n,p0,vol,mu){const out=[];let c=p0;const t0=Date.parse('2016-01-01');
  for(let i=0;i<n;i++){const o=c;c=o*Math.exp(mu+vol*gauss()-vol*vol/2);const w=Math.abs(gauss())*vol*0.5;
    out.push({t:t0+i*864e5,o,h:Math.max(o,c)*(1+w),l:Math.min(o,c)*(1-w),c});}return out;}
const S=eng.buildCore(gbm(1500,100,0.03,0),'XUSDT','X','1d');

test('stateOf: u ile indeks hizalı, durum vektörü 3 boyutlu ve standart', ()=>{
  const C=stateOf(S);
  assert.strictEqual(C.u.length,C.idx.length); assert.strictEqual(C.z.length,C.u.length);
  assert.ok(C.zNow&&C.zNow.length===3);
  const zz=C.z.filter(Boolean);const m=zz.reduce((a,z)=>a+z[0],0)/zz.length;
  assert.ok(Math.abs(m)<0.05,'standartlaştırılmış ortalama ~0');
});

test('neighbors: en yakın K seçilir, K=max(minK, frac·aday)', ()=>{
  const hz=S.HZ[0];const C=stateOf(S);
  const nn=neighbors(S,hz,{frac:0.15,minK:50});
  const cand=[];for(let j=0;j<C.u.length-hz;j++)if(C.z[j])cand.push(j);
  assert.strictEqual(nn.length,Math.max(50,Math.floor(0.15*cand.length)));
  const dist=j=>C.z[j].reduce((s,x,k)=>s+(x-C.zNow[k])**2,0);
  const inMax=Math.max(...nn.map(dist));const chosen=new Set(nn);
  const outMin=Math.min(...cand.filter(j=>!chosen.has(j)).map(dist));
  assert.ok(inMax<=outMin+1e-12,'seçilenler seçilmeyenlerden yakın olmalı');
  for(const j of nn)assert.ok(j+hz<=C.u.length,'ufuk taşmamalı');
});

test('evalComboCond: evalCombo ile aynı şekil, sonlu ev/se, cond.K>0', ()=>{
  const hz=S.HZ[0];
  const o=evalComboCond(S,1,hz,0.10,2,500,1,false,{minK:50});
  assert.ok(o); for(const k of ['ev','se','pW','pL','dStop','side','hz','qs','Rm','tMed'])assert.ok(k in o,k);
  assert.ok(isFinite(o.ev)&&isFinite(o.se)&&o.se>0); assert.ok(o.cond.K>0);
  const n=evalComboCond(S,1,hz,0.10,2,500,1,true,{minK:50});
  assert.ok(isFinite(n.ev),'demean (null) de çalışmalı');
});

test('scanCores: evaluator parametresi takılır, canlı varsayılan bozulmaz', ()=>{
  const fake=(S,sd,hz,q,rm,N,seed,dm)=>({ev:dm?0:(sd>0?0.9:0.1),se:0.05,pW:0.6,pL:0.3,dStop:0.1,side:sd,hz,qs:q,Rm:rm,tMed:3});
  const r=eng.scanCores([{HZ:[8],disp:'A',sym:'A'}],'1d',null,fake);
  assert.strictEqual(r.hits.length,1); assert.strictEqual(r.hits[0].plan.side,1); assert.strictEqual(r.famHi,0);
  assert.strictEqual(typeof eng.scanMarket,'function');
});
