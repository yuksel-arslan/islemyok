# Adım 1 — Borsa referans linki

## Kart altı satırı (sinyal-test.html, tek sinyal kartının altına)
"Yine de açacaksan komisyonu düşük tut: {Binance} · {OKX} · {Bybit}. Referans bağlantısı; sana ek maliyet yok, bize komisyon payı gelir. Bu satır hükmü etkilemez."

## Referans sayfası (site/referans.html) — metin
Başlık: Nerede işlem açmalı?
Lede: Cevabımız genelde "hiçbir yerde". Açacaksan: düşük komisyon, yüksek likidite, spot öncelikli. Aşağıdakiler referans bağlantısıdır; sana ek maliyet yok.
Tablo: borsa · spot komisyon · vadeli komisyon · not
Alt: "Kaldıraç kaç olmalı?" ve "Tasfiye fiyatı" rehberlerine bağlantı.

## Yüksel'den
Affiliate hesabı: binance.com/en/activity/referral · okx.com/join · bybit.com/affiliate. Linkleri DURUM.md'ye.

## Uygulama (ajan, 2026-09-17)
Satır `site/gelir.js` içinde (`IYGelir.refHTML()`); tek sinyal kartına eklenir, `site/referans.html` tablosu `[data-ref]`
hücreleriyle dolar. Linkler `site/yapilandirma.js`'den okunur; o dosya `DURUM.md` → `npm run yapilandir` ile üretilir
(alan adı borsanınki değilse reddeder). Boş link = satır yok. `rel="sponsored"`. Komisyon oranları tabloya yazıldı,
bu ortamdan doğrulanamadı — link eklenirken borsa sayfasıyla karşılaştır, sayfadaki "Son kontrol" tarihini doldur.
