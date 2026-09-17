/* İşlem Yok — gelir katmanı (adım 1–2): borsa referans satırı + reklam alanı.
   Değerler /yapilandirma.js'den (window.IY). Değer boşsa hiçbir şey çizilmez; yer tutucu yok.
   - [data-referans]  : "yine de açacaksan komisyonu düşük tut" satırı (yalnız linki olan borsalar)
   - [data-reklam=X]  : AdSense birimi; ADSENSE_PUB yoksa boş kalır, ADSENSE_SLOT_X yoksa yalnız script yüklenir (Auto ads)
   - window.IYGelir.refHTML() : dinamik kartların (sinyal-test) altına eklemek için aynı satır */
(function(){
  var C=window.IY||{};
  var okUrl=function(u){return typeof u==='string'&&/^https:\/\/[^\s"'<>]+$/.test(u)};
  var EX=[['Binance',C.REF_BINANCE],['OKX',C.REF_OKX],['Bybit',C.REF_BYBIT]].filter(function(x){return okUrl(x[1])});
  function refLinks(){return EX.slice()}
  function refHTML(){
    if(!EX.length)return '';
    return '<p class="note ref">Yine de açacaksan komisyonu düşük tut: '+
      EX.map(function(x){return '<a href="'+x[1]+'" rel="sponsored noopener" target="_blank">'+x[0]+'</a>'}).join(' · ')+
      '. Referans bağlantısı; sana ek maliyet yok, bize komisyon payı gelir. Bu satır hükmü etkilemez. <a href="/referans.html">Neden bu üçü?</a></p>';
  }
  function fillRefs(){
    var els=document.querySelectorAll('[data-referans]');
    for(var i=0;i<els.length;i++)els[i].innerHTML=refHTML();
  }
  function ads(){
    var pub=C.ADSENSE_PUB||'';if(!/^ca-pub-\d{10,}$/.test(pub))return;
    var els=document.querySelectorAll('[data-reklam]');if(!els.length)return;
    var s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';
    s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+pub;
    document.head.appendChild(s);
    for(var i=0;i<els.length;i++){
      var el=els[i],key='ADSENSE_SLOT_'+String(el.getAttribute('data-reklam')||'').toUpperCase();
      var slot=C[key]||'';if(!/^\d{6,}$/.test(slot))continue;
      el.style.margin='28px 0';
      var ins=document.createElement('ins');ins.className='adsbygoogle';ins.style.display='block';
      ins.setAttribute('data-ad-client',pub);ins.setAttribute('data-ad-slot',slot);
      ins.setAttribute('data-ad-format','auto');ins.setAttribute('data-full-width-responsive','true');
      el.appendChild(ins);(window.adsbygoogle=window.adsbygoogle||[]).push({});
    }
  }
  window.IYGelir={refHTML:refHTML,refLinks:refLinks};
  function init(){fillRefs();ads()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
