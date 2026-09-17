'use strict';
const test=require('node:test');const assert=require('node:assert');
const {parseSignal,num,toPlan}=require('./kanal');
const T=Date.parse('2025-03-01T10:00:00Z');

test('num: TR ve EN sayı biçimleri', ()=>{
  assert.strictEqual(num('63,000'),63000); assert.strictEqual(num('63.000,5'),63000.5);
  assert.strictEqual(num('0,45'),0.45); assert.strictEqual(num('1.2345'),1.2345);
});
test('parseSignal: klasik İngilizce format', ()=>{
  const s=parseSignal('#BTCUSDT LONG 🟢\nEntry: 63000\nSL: 61500\nTP1: 64500 TP2: 66000 TP3: 68000\nLeverage 10x',T);
  assert.ok(s); assert.strictEqual(s.sym,'BTCUSDT'); assert.strictEqual(s.side,1);
  assert.strictEqual(s.entry,63000); assert.strictEqual(s.sl,61500); assert.deepStrictEqual(s.tps,[64500,66000,68000]);
});
test('parseSignal: Türkçe format, short, giriş bölgesi', ()=>{
  const s=parseSignal('ETH/USDT SHORT\nGiriş: 3200 - 3250\nStop: 3350\nHedef: 3100 / 3000 / 2900',T);
  assert.ok(s); assert.strictEqual(s.side,-1); assert.strictEqual(s.entry,3225); assert.strictEqual(s.sl,3350);
  assert.deepStrictEqual(s.tps,[3100,3000,2900]);
});
test('parseSignal: yön/seviye tutarsızsa reddet, sinyal olmayan mesajı reddet', ()=>{
  assert.strictEqual(parseSignal('BTCUSDT LONG Entry 63000 SL 65000 TP 61000',T),null);   // long ama stop üstte
  assert.strictEqual(parseSignal('Bugün piyasa yatay, bekliyoruz. BTC 63k civarı.',T),null);
  assert.strictEqual(parseSignal('SOL LONG hedef 200',T),null);                         // stop yok
});
test('parseSignal: emoji yön ve virgüllü binlik', ()=>{
  const s=parseSignal('📉 SOL/USDT\nEntry 145,50\nSL 152,00\nTargets 140,00 - 135,00',T);
  assert.ok(s); assert.strictEqual(s.side,-1); assert.strictEqual(s.entry,145.5); assert.deepStrictEqual(s.tps,[140,135]);
});
test('toPlan: rm ve d_stop; giriş yoksa mesaj fiyatı', ()=>{
  const p=toPlan({sym:'BTCUSDT',side:1,entry:NaN,sl:95,tps:[105,110],t:T},100);
  assert.strictEqual(p.entry,100); assert.ok(Math.abs(p.d_stop-Math.log(100/95))<1e-12);
  assert.strictEqual(p.tp1,105); assert.strictEqual(p.tp2,110); assert.ok(p.rm>1);
  const q=toPlan({sym:'BTCUSDT',side:1,entry:100,sl:100,tps:[110],t:T},100); assert.strictEqual(q,null);
});
test('parseSignal: etiketsiz sıra numarası ve rakamla başlayan fiyat', ()=>{
  const s=parseSignal('BTCUSDT LONG\nEntry 1 63000\nSL 61500\nTP1 64500 TP2 66000',T);
  assert.ok(s); assert.strictEqual(s.entry,63000); assert.strictEqual(s.sl,61500); assert.deepStrictEqual(s.tps,[64500,66000]);
});
