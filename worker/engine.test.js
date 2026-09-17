'use strict';
/* passesThreshold birim testleri — node:test (Node 20+). Çalıştır: npm test */
const test=require('node:test');
const assert=require('node:assert');
const {passesThreshold}=require('./engine');

test('best eşikten büyükse geçer', ()=>{
  assert.strictEqual(passesThreshold(0.50, 0.30), true);
});

test('best eşikten küçükse geçmez', ()=>{
  assert.strictEqual(passesThreshold(0.20, 0.30), false);
});

test('best eşiğe eşitse geçmez (kesin büyük olmalı)', ()=>{
  assert.strictEqual(passesThreshold(0.30, 0.30), false);
});

test('best eşikten büyükken sonuç asla "geçmedi" olmaz (belirti regresyonu)', ()=>{
  // Belirti: ekranda best > eşik yazarken "eşik geçilmedi" mesajı çıkıyordu.
  const best=0.42, thr=0.31;
  assert.ok(best>thr);
  assert.strictEqual(passesThreshold(best, thr), true);
});

test('scanRows: yetersiz veri fırlatmaz; cores:0, hits boş, fails dolu (ağsız)', ()=>{
  const {scanRows}=require('./engine');
  const r=scanRows({BTCUSDT:[{t:1,o:1,h:1,l:1,c:1}]},'1d');
  assert.strictEqual(r.cores,0); assert.deepStrictEqual(r.hits,[]);
  assert.ok(r.fails.some(f=>/BTC/.test(f)));
});

test('scanMarket ve scanRows aynı ortak gövdeyi (scanCores) dışa aktarır', ()=>{
  const e=require('./engine');
  for(const k of ['scanMarket','scanRows','scanCores','buildCore','planLevels'])
    assert.strictEqual(typeof e[k],'function',k);
});

test('geçersiz sayılar (NaN/Infinity) geçmez', ()=>{
  assert.strictEqual(passesThreshold(NaN, 0.30), false);
  assert.strictEqual(passesThreshold(0.50, NaN), false);
  assert.strictEqual(passesThreshold(Infinity, 0.30), false);
});
