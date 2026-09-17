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

test('geçersiz sayılar (NaN/Infinity) geçmez', ()=>{
  assert.strictEqual(passesThreshold(NaN, 0.30), false);
  assert.strictEqual(passesThreshold(0.50, NaN), false);
  assert.strictEqual(passesThreshold(Infinity, 0.30), false);
});
