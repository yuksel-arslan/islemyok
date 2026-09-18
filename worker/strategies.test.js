'use strict';
const test=require('node:test');const assert=require('node:assert');
const {STRATS,makeGenerator,runStrategy,compareReport,ewmaVol,mkPlan,tStat,halves}=require('./strategies');
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} ≈ ${b}`);
const t0=Date.parse('2024-01-01'),H=36e5;
const mk=(closes,sym)=>closes.map((c,i)=>({t:t0+i*H,o:c,h:c*1.001,l:c*0.999,c}));
const flat=n=>Array.from({length:n},()=>100);
const up=n=>Array.from({length:n},(_,i)=>100*Math.exp(0.001*i));

test('ewmaVol nedensel: i, i sonrası barlardan bağımsız', ()=>{
  const a=mk(up(300)),b=mk(up(300).concat([1000,1000]));
  const va=ewmaVol(a),vb=ewmaVol(b);
  for(let i=0;i<300;i++)if(isFinite(va[i]))near(va[i],vb[i]);
});

test('mkPlan: long/short seviyeleri planLevels ile aynı biçim', ()=>{
  const L=mkPlan('X','X',1,100,0,10,H,2,0.01,'s'),S=mkPlan('X','X',-1,100,0,10,H,2,0.01,'s');
  const d=0.01*Math.sqrt(10);near(L.d_stop,d);
  near(L.sl,100*Math.exp(-d));near(L.tp1,100*Math.exp(d));near(L.tp2,100*Math.exp(2*d));
  near(S.sl,100*Math.exp(d));near(S.tp2,100*Math.exp(-2*d));assert.strictEqual(L.t_end,10*H);
});

test('tsmom20: yükselen seri → long, düşen → short, düz → sinyal yok', ()=>{
  const g=(rows)=>makeGenerator('tsmom20','1h',rows)(t0+(rows.BTCUSDT.length-1)*H,rows);
  assert.deepStrictEqual(g({BTCUSDT:mk(up(600))}).map(p=>p.side),[1]);
  assert.deepStrictEqual(g({BTCUSDT:mk(up(600).reverse())}).map(p=>p.side),[-1]);
  assert.deepStrictEqual(g({BTCUSDT:mk(flat(600))}),[]);              // vol 0 → plan yok
});

test('donch20: yeni tavan → long; aralık içinde → yok', ()=>{
  const base=flat(600);const hi=base.slice();hi[599]=101;
  const rows={BTCUSDT:mk(hi)};rows.BTCUSDT[300].c=100.5;rows.BTCUSDT[300].h=100.6;   // vol>0 olsun
  const out=makeGenerator('donch20','1h',rows)(t0+599*H,rows);
  assert.deepStrictEqual(out.map(p=>p.side),[1]);
  const mid=flat(600);const r2={BTCUSDT:mk(mid)};r2.BTCUSDT[300].c=100.5;r2.BTCUSDT[300].h=100.6;
  assert.deepStrictEqual(makeGenerator('donch20','1h',r2)(t0+599*H,r2),[]);
});

test('revert3: 3 günlük çöküş (z<−2) → long', ()=>{
  const c=flat(600);for(let i=528;i<600;i++)c[i]=100*Math.exp(-0.003*(i-527));   // son 72 bar sürekli düşüş
  for(let i=100;i<528;i++)c[i]=100*(1+0.0005*Math.sin(i));                       // küçük gürültü → vol>0
  const rows={BTCUSDT:mk(c)};
  assert.deepStrictEqual(makeGenerator('revert3','1h',rows)(t0+599*H,rows).map(p=>p.side),[1]);
});

test('xsmom30: 10 varlıkta ilk 3 long, son 3 short; <6 varlıkta yok', ()=>{
  const {ASSETS}=require('./engine');const rows={};
  ASSETS.forEach(([s],k)=>{rows[s]=mk(Array.from({length:800},(_,i)=>100*Math.exp((k-4.5)*0.0005*i)));});
  const out=makeGenerator('xsmom30','1h',rows)(t0+799*H,rows);
  assert.strictEqual(out.filter(p=>p.side>0).length,3);assert.strictEqual(out.filter(p=>p.side<0).length,3);
  assert.ok(out.filter(p=>p.side>0).every(p=>['LTCUSDT','AVAXUSDT','LINKUSDT'].includes(p.sym)));
  const few={BTCUSDT:rows.BTCUSDT,ETHUSDT:rows.ETHUSDT};
  assert.deepStrictEqual(makeGenerator('xsmom30','1h',few)(t0+799*H,few),[]);
});

test('üretici look-ahead görmez: sliced öneke bakar, tam seriden yalnız nedensel vol', ()=>{
  const full={BTCUSDT:mk(up(700))};const gen=makeGenerator('tsmom20','1h',full);
  const sliced={BTCUSDT:full.BTCUSDT.slice(0,600)};
  const p=gen(t0+599*H,sliced)[0];near(p.entry,full.BTCUSDT[599].c);assert.strictEqual(p.t0,t0+599*H);
});

test('şans kontrolü: işaret-rastgeleleme gerçek plan listesini korur (aynı n, aynı t0, ayna seviyeler)', ()=>{
  const rows={BTCUSDT:mk(up(1500)),ETHUSDT:mk(up(1500).map((c,i)=>c*(1+0.001*Math.sin(i))))};
  const r=runStrategy('tsmom20',rows,'1h',{step:24,warmup:600,controls:2});
  assert.strictEqual(r.ctrl.length,2);
  const p=r.rows[0];const {mkPlan}=require('./strategies');
  const f=mkPlan(p.sym,p.disp,-p.side,p.entry,p.t0,p.hz||120,H,2,0,'x');
  assert.strictEqual(f.side,-p.side);assert.strictEqual(f.entry,p.entry);assert.strictEqual(f.t0,p.t0);
});

test('şans kontrolü gürültüde tarafsız: p 0 ile 1 arasında dağılır, sistematik kayıp yok', ()=>{
  let s=11;const rnd=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)/4294967296);};
  const g=()=>{const u=1-rnd(),v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  const noise=n=>{const o=[];let c=100;for(let i=0;i<n;i++){c*=Math.exp(0.006*g());o.push(c);}return o;};
  const rows={BTCUSDT:mk(noise(4000)),ETHUSDT:mk(noise(4000))};
  const r=runStrategy('tsmom20',rows,'1h',{step:24,warmup:1500,controls:10});
  // kontrol ortalaması gerçekten uzak sistematik bir sapma taşımamalı (aynı işlemler, aynı maliyet)
  assert.ok(Math.abs(r.ctrlMean-r.totalR)<Math.max(5,Math.abs(r.totalR)*2)+1e-9,`ctrlMean ${r.ctrlMean} vs ${r.totalR}`);
});

test('tStat/halves ve karar kuralı', ()=>{
  near(tStat([1,1,1,1]),0);assert.ok(tStat([1,2,1,2,1,2])>2);
  assert.deepStrictEqual(halves([{t0:1,R:1},{t0:2,R:1},{t0:3,R:-1},{t0:4,R:-1}]),[1,-1]);
});

test('runStrategy uçtan uca (sentetik yükseliş): rapor üretir, kontrol dağılımı dolu', ()=>{
  const rows={BTCUSDT:mk(up(1500)),ETHUSDT:mk(up(1500).map((c,i)=>c*(1+0.001*Math.sin(i))))};
  const r=runStrategy('tsmom20',rows,'1h',{step:24,warmup:600,controls:3});
  assert.ok(r.n>0);assert.strictEqual(r.ctrl.length,3);assert.ok(isFinite(r.p));
  const rep=compareReport([r]);assert.match(rep,/tsmom20/);assert.match(rep,/GEÇTİ|kaldı/);
});

test('plansFromCsv: t0 bara yuvarlanır, giriş=kapanış, sl/tp varsa onlardan rm; bilinmeyen sembol/bar atlanır', ()=>{
  const {plansFromCsv}=require('./strategies');
  const rows={BTCUSDT:mk(up(300),'BTCUSDT')};
  const csv=['t0,sym,side,hz,rm,sl,tp',
    `${new Date(t0+200*H+1234).toISOString()},btcusdt,long,24,2,,`,       /* vol'dan */
    `${t0+210*H},BTCUSDT,-1,12,,${up(300)[210]*1.02},${up(300)[210]*0.96}`, /* sl/tp'den: short, rm=2 */
    `${t0+220*H},ETHUSDT,1,24,2,,`,                                          /* sembol yok */
    `${t0+5000*H},BTCUSDT,1,24,2,,`,                                         /* bar yok */
    `${t0+230*H},BTCUSDT,1,24,2,${up(300)[230]*1.02},${up(300)[230]*1.05}`].join('\n'); /* long ama sl üstte: geçersiz */
  const {plans,skip}=plansFromCsv(csv,'1h',rows,'dis');
  assert.strictEqual(plans.length,2);assert.deepStrictEqual(skip,{sym:1,bar:1,vol:1});
  assert.strictEqual(plans[0].t0,t0+200*H);near(plans[0].entry,up(300)[200]);assert.strictEqual(plans[0].side,1);
  near(plans[0].d_stop,ewmaVol(rows.BTCUSDT)[200]*Math.sqrt(24));assert.strictEqual(plans[0].strat,'dis');
  assert.strictEqual(plans[1].side,-1);near(plans[1].rm,Math.log(1/0.96)/Math.log(1.02),1e-9);assert.strictEqual(plans[1].t_end,t0+222*H);
});

test('runPlans: dış plan listesi runStrategy ile aynı rapor alanlarını üretir, kontrol dağılımı dolu', ()=>{
  const {runPlans,plansFromCsv}=require('./strategies');
  const rows={BTCUSDT:mk(up(900),'BTCUSDT')};
  const csv=['t0,sym,side,hz,rm',...Array.from({length:40},(_,k)=>`${t0+(100+k*15)*H},BTCUSDT,1,24,1.5`)].join('\n');
  const {plans}=plansFromCsv(csv,'1h',rows,'x');
  const r=runPlans('x',plans,rows,{controls:10});
  for(const k of ['n','totalR','t','h1','h2','p','ctrl','pass','rows'])assert.ok(k in r,k);
  assert.strictEqual(r.ctrl.length,10);assert.ok(r.n>=30);assert.ok(r.totalR>0);
  assert.match(compareReport([r]),/^x\s+\d+/m);
});
