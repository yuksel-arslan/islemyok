'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parse,validate,render,KEYS}=require('./yapilandir');

test('parse: boş DURUM.md → tüm anahtarlar boş',()=>{
  const c=parse('- `REF_BINANCE=` · `REF_OKX=` · `REF_BYBIT=`\n- `ADSENSE_PUB=`');
  for(const k of KEYS)assert.equal(c[k],'');
});
test('parse: backtick/ayraç sonu keser, ilk geçen alınır',()=>{
  const c=parse('- `REF_BINANCE=https://accounts.binance.com/register?ref=ABC` · `REF_OKX=https://www.okx.com/join/XYZ`\nADSENSE_PUB=ca-pub-1234567890123456 (onay)\nREF_BINANCE=https://ikinci');
  assert.equal(c.REF_BINANCE,'https://accounts.binance.com/register?ref=ABC');
  assert.equal(c.REF_OKX,'https://www.okx.com/join/XYZ');
  assert.equal(c.ADSENSE_PUB,'ca-pub-1234567890123456');
  assert.equal(c.REF_BYBIT,'');
});
test('validate: boş geçerli, doğru alan adı geçerli',()=>{
  assert.deepEqual(validate(parse('')),[]);
  assert.deepEqual(validate({REF_BINANCE:'https://www.binance.com/x',REF_OKX:'https://okx.com/join/1',REF_BYBIT:'https://partner.bybit.com/b/a',ADSENSE_PUB:'ca-pub-1234567890',ADSENSE_SLOT_ICERIK:'1234567890',ADSENSE_SLOT_ARAC:''}),[]);
});
test('validate: yanlış alan adı, http, kötü pub/slot reddedilir',()=>{
  const bad=validate({REF_BINANCE:'https://binance.com.evil.io/x',REF_OKX:'http://okx.com/j',REF_BYBIT:'bybit',ADSENSE_PUB:'pub-1',ADSENSE_SLOT_ICERIK:'abc',ADSENSE_SLOT_ARAC:''});
  assert.equal(bad.length,5,bad.join('; '));
});
test('render: geçerli JS, window.IY tüm anahtarları taşır, tırnak kaçar',()=>{
  const cfg=parse('REF_BINANCE=https://www.binance.com/r?ref="x"');
  const js=render(cfg);const w={};new Function('window',js)(w);
  assert.deepEqual(Object.keys(w.IY),KEYS);
  assert.equal(w.IY.REF_BINANCE,'https://www.binance.com/r?ref="x"');
  assert.equal(w.IY.ADSENSE_PUB,'');
});
test('render: boş yapılandırma repo içindeki site/yapilandirma.js ile birebir',()=>{
  const fs=require('fs'),path=require('path');
  const disk=fs.readFileSync(path.join(__dirname,'..','site','yapilandirma.js'),'utf8');
  const cfg=parse(fs.readFileSync(path.join(__dirname,'..','plan','DURUM.md'),'utf8'));
  assert.deepEqual(validate(cfg),[]);
  assert.equal(disk,render(cfg),'site/yapilandirma.js DURUM.md ile uyumsuz: npm run yapilandir');
});

test('renderAdsTxt: ADSENSE_PUB doluysa google satırı, boşsa boş', ()=>{
  const {renderAdsTxt}=require('./yapilandir');
  assert.strictEqual(renderAdsTxt({ADSENSE_PUB:'ca-pub-1234567890123456'}),'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
  assert.strictEqual(renderAdsTxt({ADSENSE_PUB:''}),'');
});
