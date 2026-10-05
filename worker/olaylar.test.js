'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {parse,render}=require('./olaylar');

test('parse: tür eşlenir, doğrulanmadı işaretlenir',()=>{
  const e=parse('tarih,saat_utc,tur,not\n2022-01-26,19:00,FOMC,\n2026-01-13,13:30,CPI,dogrulanmadi\n');
  assert.deepEqual(e,[{d:'2022-01-26',h:'19:00',t:'FOMC',dogrulandi:true},{d:'2026-01-13',h:'13:30',t:'TÜFE',dogrulandi:false}]);
});
test('parse: bozuk satır reddedilir',()=>{
  assert.throws(()=>parse('a\n2022-1-26,19:00,FOMC,'));
  assert.throws(()=>parse('a\n2022-01-26,19:00,NFP,'));
});
test('render: repo içindeki site/olaylar.json ile birebir',()=>{
  const ev=parse(fs.readFileSync(path.join(__dirname,'..','lab','olaylar.csv'),'utf8'));
  assert.equal(render(ev),fs.readFileSync(path.join(__dirname,'..','site','olaylar.json'),'utf8'));
});
