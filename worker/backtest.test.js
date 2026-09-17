'use strict';
/* backtest birim testleri — sentetik barlar, ağ yok. Çalıştır: npm test */
const test=require('node:test');
const assert=require('node:assert');
const {backtest,aggregate,runOne,walkForward,modelGenerate,formatReport,TFMS}=require('./backtest');

const D=0.1;                             // d_stop (~%10 stop)
const COST=(2*11/1e4)/D;                 // netR'nin düştüğü komisyon+kayma = 0.022
const bar=(t,h,l,c,o=100)=>({t,o,h,l,c});
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} ≈ ${b} bekleniyordu`);
const P=(x)=>({sym:'X',side:1,entry:100,sl:90,tp1:null,tp2:110,rm:1,d_stop:D,t0:0,t_end:10000,...x});

/* ---------- tek plan oynatma (replay.js ile aynı sonuç) ---------- */
test('TP2 vuran long → tp2, R = rm - maliyet', ()=>{
  const r=runOne(P({}), [bar(100,112,98,110)], null);
  assert.strictEqual(r.state,'tp2'); near(r.R, 1-COST);
});
test('Stop yiyen long → stop, R = -1 - maliyet', ()=>{
  const r=runOne(P({}), [bar(100,101,88,95)], null);
  assert.strictEqual(r.state,'stop'); near(r.R, -1-COST);
});
test('TP1 sonra stop → be, R = 0.5 - maliyet', ()=>{
  const r=runOne(P({tp1:105,tp2:130,rm:2}), [bar(100,106,98,104), bar(200,101,99,100)], null);
  assert.strictEqual(r.state,'be'); near(r.R, 0.5-COST);
});
test('Vade dolan long → expired, R = openR - maliyet', ()=>{
  const r=runOne(P({tp2:200,t_end:50}), [bar(50,105,96,103)], null);
  assert.strictEqual(r.state,'expired'); near(r.R, Math.log(103/100)/D-COST);
});
test('short plan TP2', ()=>{
  const pl={sym:'X',side:-1,entry:100,sl:110,tp1:null,tp2:90,rm:1,d_stop:D,t0:0,t_end:10000};
  const r=runOne(pl, [bar(100,102,88,90)], null);
  assert.strictEqual(r.state,'tp2'); near(r.R, 1-COST);
});
test('barı olmayan plan → no-data, sayılmaz', ()=>{
  const res=backtest([P({sym:'YOK'})], {}, {});
  assert.strictEqual(res.rows[0].state,'no-data'); assert.strictEqual(res.n,0); assert.strictEqual(res.skipped,1);
});

/* ---------- metrikler ---------- */
test('aggregate: toplam R, kazanma, max drawdown, profit factor; açık sayılmaz', ()=>{
  const g=aggregate([
    {state:'tp2',R:0.978,bars:1},{state:'stop',R:-1.022,bars:1},
    {state:'expired',R:0.274,bars:1},{state:'be',R:0.478,bars:2},
    {state:'open',R:5.0,bars:9}]);
  assert.strictEqual(g.n,4); assert.strictEqual(g.wins,3); assert.strictEqual(g.losses,1);
  near(g.winRate,0.75); near(g.totalR,0.978-1.022+0.274+0.478);
  near(g.maxDrawdown,0.978-(-0.044)); near(g.profitFactor,(0.978+0.274+0.478)/1.022);
  near(g.avgHoldBars,1.25); assert.strictEqual(g.byState.tp2,1); assert.strictEqual(g.equity.length,4);
});
test('profit factor: kayıp yoksa ∞', ()=>{
  assert.strictEqual(aggregate([{state:'tp2',R:1,bars:1}]).profitFactor, Infinity);
});

/* ---------- walk-forward ---------- */
const series=(n,step=1000)=>Array.from({length:n},(_,i)=>bar((i+1)*step,101,99,100));

test('walk-forward: tarama ASLA T sonrası bar görmez (look-ahead koruması)', ()=>{
  const rowsBySym={A:series(20)};
  const seen=[];
  walkForward({rowsBySym,tf:'1h',step:5,warmup:5,
    generate:(T,sliced)=>{seen.push({T,max:Math.max(...sliced.A.map(b=>b.t)),n:sliced.A.length});return [];}});
  assert.ok(seen.length>0);
  for(const s of seen){assert.ok(s.max<=s.T,`T=${s.T} ama ${s.max} görüldü`);assert.strictEqual(s.max,s.T);}
});

test('walk-forward: warmup/step çapaları doğru kurar', ()=>{
  const res=walkForward({rowsBySym:{A:series(20)},tf:'1h',step:5,warmup:5,generate:()=>[]});
  assert.strictEqual(res.anchors,3);                    // indeks 5,10,15
  assert.deepStrictEqual(res.scans.map(s=>s.t),[6000,11000,16000]);
});

test('walk-forward: from/to sınırları', ()=>{
  const res=walkForward({rowsBySym:{A:series(20)},tf:'1h',step:1,warmup:0,from:5000,to:8000,generate:()=>[]});
  assert.deepStrictEqual(res.scans.map(s=>s.t),[5000,6000,7000,8000]);
});

test('walk-forward: aynı sym+yön açıkken yeni plan açılmaz (canlı gibi)', ()=>{
  const gen=(T)=>[P({sym:'A',t0:T,t_end:T+10000})];
  const res=walkForward({rowsBySym:{A:series(20)},tf:'1h',step:5,warmup:5,generate:gen});
  // çapalar 6000/11000/16000: 6000 açar (bitiş 16000), 11000 atlanır, 16000 yeniden açar
  assert.strictEqual(res.rows.length,2);
  assert.deepStrictEqual(res.rows.map(r=>r.t0),[6000,16000]);
});

test('walk-forward: ters yön gelince açık plan o anda kapatılır (yön döndü)', ()=>{
  const gen=(T)=>T===6000?[P({sym:'A',side:1,t0:T,t_end:T+10000})]
                :T===11000?[{...P({sym:'A',side:-1,sl:110,tp2:90,t0:T,t_end:T+10000})}]:[];
  const res=walkForward({rowsBySym:{A:series(20)},tf:'1h',step:5,warmup:5,generate:gen});
  assert.strictEqual(res.flipped,1);
  assert.strictEqual(res.rows.length,2);
  assert.strictEqual(res.rows[0].t_end,11000);          // ilk plan 11000'de kesildi
  assert.strictEqual(res.rows[0].state,'expired');
});

test('walk-forward uçtan uca: T sonrası yükseliş TP2 getirir, metrik doğru', ()=>{
  const bars=series(20).map(b=>b.t>6000?bar(b.t,112,99,110):b);   // T=6000 sonrası tavan 112
  const gen=(T)=>T===6000?[P({sym:'A',t0:T,t_end:T+5000})]:[];
  const res=walkForward({rowsBySym:{A:bars},tf:'1h',step:5,warmup:5,generate:gen});
  assert.strictEqual(res.n,1); assert.strictEqual(res.rows[0].state,'tp2'); near(res.totalR,1-COST);
  assert.match(formatReport(res),/Walk-forward/);
});

/* ---------- modelGenerate: motor çıktısını canlı publishNew ile aynı plana çevirir ---------- */
test('modelGenerate: scanRows hit → plan alanları (entry=P0, sl/tp, t_end=T+hz·ms)', ()=>{
  const {planLevels}=require('./engine');
  const S={sym:'BTCUSDT',disp:'BTC',P0:100,perDay:24};
  const plan={side:1,dStop:0.1,Rm:2,hz:30,tMed:10,ev:0.5,se:0.1};
  const eng={scanRows:()=>({hits:[{S,plan}],famHi:0.3,cores:1,fails:[]}),planLevels};
  const out=modelGenerate(eng,'1h')(5000,{});
  assert.strictEqual(out.length,1);
  const p=out[0];
  assert.strictEqual(p.sym,'BTCUSDT'); assert.strictEqual(p.side,1); assert.strictEqual(p.entry,100);
  near(p.sl,100*Math.exp(-0.1)); near(p.tp1,100*Math.exp(0.1)); near(p.tp2,100*Math.exp(0.2));
  assert.strictEqual(p.rm,2); assert.strictEqual(p.d_stop,0.1); assert.strictEqual(p.famHi,0.3);
  assert.strictEqual(p.t0,5000); assert.strictEqual(p.t_end,5000+30*TFMS['1h']);
  assert.strictEqual(out._scan.famHi,0.3);
});
