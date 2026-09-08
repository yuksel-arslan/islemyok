# İşlem Yok — Telegram Worker

Güncelleme: 2026-07-27 · Durum: v1 (günlük tarama + yayın). v1.1 planı: işlem kapanış takibi (Neon).

## Ne yapar

Her gün 06:00 UTC (09:00 TSİ) kripto 1h piyasasını tarar (islemyok.com'daki modelin birebir
sunucu kopyası): 10 varlık × 96 kombinasyon + aile-geneli şans eşiği (12 tekrar).

* Bir plan **iki kapıdan** geçmek zorundadır: (1) aile-geneli şans eşiği (ev > famHi),
  (2) kendi hata payı (ev > 2·se). Yalnız ikisini birden geçen yayınlanır.
* Geçilmezse: kanala "Bugün işlem yok" metni — en iyi sonuç ± hata payı, eşik değeri ve
  **hangi kapıda elendiği**. (Eşiği geçip hata payında kalan varsa metin bunu söyler;
  yoksa mesaj, eşikten büyük bir sayının yanında "eşik geçilmedi" yazarak çelişir.)
* Geçilirse: her plan için mum grafiği PNG (giriş/SL/TP1/TP2/süre) + özet.
Koşu süresi: ilk gün \~2-3 dk (veri indirme), sonrası \~30-60 sn (artımlı önbellek).

## Dosyalar

* `bot.js` — zamanlama, Telegram, PNG çizimi
* `engine.js` — veri (Binance, disk önbelleği), tarama, plan seviyeleri
* `engine\\\_core.js` — modelin site HTML'inden dilimlenmiş çekirdeği (buildVol, kuantil
regresyonu+EVT calib, computeCore, evalCombo). **Elle düzenleme; site güncellenince
yeniden dilimlenir** (kaynak tek: index.html).

## Ortam değişkenleri

|Değişken|Zorunlu|Örnek|Not|
|-|-|-|-|
|TELEGRAM\_BOT\_TOKEN|✓|123:ABC…|BotFather. ASLA koda/sohbete yazma.|
|TELEGRAM\_CHAT|✓|@islemyok|Kanal kullanıcı adı; bot kanalda yönetici olmalı.|
|SCAN\_TF||1h|Varsayılan 1h. Test için 1d hızlıdır.|
|CRON||0 6 \* \* \*|UTC. Varsayılan 06:00 UTC = 09:00 TSİ.|
|CACHE\_DIR||/tmp/islemyok-cache|Kalıcı disk varsa oraya ver.|
|RUN\_ON\_START||1|Açılışta bir kez hemen koşar (ilk kurulum testi).|
|DRY\_RUN||1|Telegram'a göndermez; konsola + /tmp/islemyok-plan.png.|

## Yerel test (Windows PowerShell)

```powershell
cd D:\\\\islemyok-worker
npm install
# 1) Telegram'sız kuru koşu:
$env:DRY\\\_RUN="1"; $env:SCAN\\\_TF="1d"; node bot.js
# 2) Kanala GERÇEK test mesajı (token'ı yalnız bu pencereye yaz):
$env:DRY\\\_RUN="0"; $env:RUN\\\_ON\\\_START="1"; $env:SCAN\\\_TF="1h"
$env:TELEGRAM\\\_BOT\\\_TOKEN="<token>"; $env:TELEGRAM\\\_CHAT="@kanal\\\_adin"
node bot.js   # yayın sonrası Ctrl+C
```

## Railway kurulumu

```powershell
npm i -g @railway/cli
railway login
cd D:\\\\islemyok-worker
railway init          # yeni proje: islemyok-worker
railway up            # kodu yükler (Railpack node'u tanır, start: node bot.js)
```

Sonra Railway panel → servis → **Variables**: TELEGRAM\_BOT\_TOKEN, TELEGRAM\_CHAT ekle
(istersen RUN\_ON\_START=1 ile ilk yayını hemen al, sonra sil). Deploy loglarında
"İşlem Yok worker hazır · cron: 0 6 \* \* \* UTC" satırını gör.

## Bilinen sınırlar (v1)

* Kapanış raporu yok (v1.1: açık planlar Neon'a yazılır, her koşuda SL/TP/BE kontrol edilir).
* Yalnız kripto spot 1h (vadeli/fx sitede var; worker'a v1.2'de).
* CACHE\_DIR kalıcı değilse her yeniden başlatmada veri baştan iner (\~2 dk, zarar yok).

