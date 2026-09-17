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

test('cacheFile: varsayılan derinlik canlı dosya, farklı derinlik ayrı dosya', ()=>{
  const {cacheFile,TFC}=require('./engine');
  const p=require('path');
  assert.strictEqual(p.basename(cacheFile('BTCUSDT','1h')),'kl-BTCUSDT-1h.json');
  assert.strictEqual(p.basename(cacheFile('BTCUSDT','1h',TFC['1h'].pages)),'kl-BTCUSDT-1h.json');
  assert.strictEqual(p.basename(cacheFile('BTCUSDT','1h',40)),'kl-BTCUSDT-1h-p40.json');
});

test('scanRows: boş sonuçta nearMisses alanı var', ()=>{
  const {scanRows}=require('./engine');
  assert.deepStrictEqual(scanRows({},'1d').nearMisses,[]);
});

test('geçersiz sayılar (NaN/Infinity) geçmez', ()=>{
  assert.strictEqual(passesThreshold(NaN, 0.30), false);
  assert.strictEqual(passesThreshold(0.50, NaN), false);
  assert.strictEqual(passesThreshold(Infinity, 0.30), false);
});
