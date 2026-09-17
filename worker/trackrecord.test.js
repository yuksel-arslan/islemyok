'use strict';
/* trackrecord birim testleri — ledger/signals.json şekilleri, özet, denetim */
const test=require('node:test');
const assert=require('node:assert');
const {normalize,summarize,audit,formatTrack}=require('./trackrecord');

const D=0.1, COST=(2*11/1e4)/D;
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} ≈ ${b} bekleniyordu`);
const bar=(t,h,l,c,o=100)=>({t,o,h,l,c});

test('normalize: DB satırı (snake_case) tek biçime', ()=>{
  const s=normalize({id:'a',sym:'BTCUSDT',disp:'BTC',tf:'1h',side:'1',entry:'100',sl:'90',tp1:null,tp2:'110',
    rm:'1',d_stop:'0.1',ev:'0.4',fam_hi:'0.3',t0:'1000',t_end:'9000',state:'tp2',half:false,
    closed_at:'5000',close_px:'110',r_realized:'0.978'});
  assert.strictEqual(s.side,1); assert.strictEqual(s.d_stop,0.1); assert.strictEqual(s.t_end,9000);
  assert.strictEqual(s.famHi,0.3); assert.strictEqual(s.R,0.978); assert.strictEqual(s.tp1,null);
});

test('normalize: signals.json (camelCase) tek biçime', ()=>{
  const s=normalize({id:'b',sym:'ETHUSDT',disp:'ETH',tf:'1h',side:-1,entry:100,sl:110,tp1:null,tp2:90,
    rm:1,dStop:0.1,ev:0.4,famHi:0.3,t0:1000,tEnd:9000,state:'stop',closedAt:5000,closePx:110,R:-1.022});
  assert.strictEqual(s.d_stop,0.1); assert.strictEqual(s.t_end,9000); assert.strictEqual(s.famHi,0.3);
  assert.strictEqual(s.closed_at,5000); assert.strictEqual(s.R,-1.022);
});

const SIGS=[
  {id:'1',sym:'BTCUSDT',disp:'BTC',tf:'1h',side:1,entry:100,sl:90,tp1:null,tp2:110,rm:1,dStop:D,t0:1000,tEnd:9000,state:'tp2',closedAt:2000,R:1-COST},
  {id:'2',sym:'ETHUSDT',disp:'ETH',tf:'1h',side:1,entry:100,sl:90,tp1:null,tp2:110,rm:1,dStop:D,t0:1000,tEnd:9000,state:'stop',closedAt:2000,R:-1-COST},
  {id:'3',sym:'SOLUSDT',disp:'SOL',tf:'1h',side:1,entry:100,sl:90,tp1:null,tp2:110,rm:1,dStop:D,t0:3000,tEnd:9000,state:'open'},
];

test('summarize: kapanmışları sayar, açığı ayrı tutar', ()=>{
  const s=summarize(SIGS);
  assert.strictEqual(s.total,3); assert.strictEqual(s.n,2); assert.strictEqual(s.open.length,1);
  near(s.totalR,(1-COST)+(-1-COST)); assert.strictEqual(s.wins,1); assert.strictEqual(s.losses,1);
});

test('audit: kayıtlı R mumlarla yeniden hesaplanınca uyuşur', ()=>{
  const bars={BTCUSDT:[bar(2000,112,98,110)], ETHUSDT:[bar(2000,101,88,95)]};
  const a=audit(SIGS,bars);
  assert.strictEqual(a.checked,2); assert.strictEqual(a.ok,2); assert.strictEqual(a.mismatches.length,0);
});

test('audit: yanlış kayıt yakalanır (state veya R uyuşmazlığı)', ()=>{
  const bad=[{...SIGS[0],R:0.5},{...SIGS[1],state:'tp2'}];
  const bars={BTCUSDT:[bar(2000,112,98,110)], ETHUSDT:[bar(2000,101,88,95)]};
  const a=audit(bad,bars);
  assert.strictEqual(a.mismatches.length,2);
  assert.strictEqual(a.mismatches[0].id,'1'); near(a.mismatches[0].recomputed.R,1-COST);
});

test('audit: mumu olmayan sinyal sayılır, açık ve flipped atlanır', ()=>{
  const a=audit([...SIGS,{...SIGS[0],id:'4',state:'flipped'}],{});
  assert.strictEqual(a.checked,0); assert.strictEqual(a.noBars,3);
});

test('formatTrack: rapor alanları', ()=>{
  const s=formatTrack(summarize(SIGS),audit(SIGS,{BTCUSDT:[bar(2000,112,98,110)],ETHUSDT:[bar(2000,101,88,95)]}));
  assert.match(s,/Track record — 3 yayınlanmış sinyal: 2 kapandı, 1 açık/);
  assert.match(s,/Denetim: 2 .* 2 uyuştu, 0 UYUŞMADI/);
});
