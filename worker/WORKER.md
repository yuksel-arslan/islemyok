# İşlem Yok — Telegram Worker

Güncelleme: 2026-09-08 · Durum: v1 (günlük tarama + yayın). v1.1 planı: işlem kapanış takibi (Neon).

Kaynak: <https://github.com/yuksel-arslan/islemyok> — bu klasör repo içinde `worker/`.

## Ne yapar

Her gün 06:00 UTC (09:00 TSİ) kripto 1h piyasasını tarar (islemyok.com'daki modelin birebir
sunucu kopyası): 10 varlık × 96 kombinasyon + aile-geneli şans eşiği (12 tekrar).

* Bir plan **iki kapıdan** geçmek zorundadır: (1) aile-geneli şans eşiği (ev > famHi),
  (2) kendi hata payı (ev > 2·se). Yalnız ikisini birden geçen yayınlanır.
* Geçilmezse: kanala "Bugün işlem yok" metni — en iyi sonuç ± hata payı, eşik değeri ve
  **hangi kapıda elendiği**. (Eşiği geçip hata payında kalan varsa metin bunu söyler;
  yoksa mesaj, eşikten büyük bir sayının yanında "eşik geçilmedi" yazarak çelişir.)
* Geçilirse: her plan için mum grafiği PNG (giriş/SL/TP1/TP2/süre) + özet.

Tahmin ufku sitedekiyle aynı sabit settir: **15/30/60/120 interval** (`HZ_FIXED`), üst
sınır 120. Ufuk gün cinsinden değil barın kendi ölçeğinde tanımlıdır.

Koşu süresi: ilk gün ~2-3 dk (veri indirme), sonrası ~30-60 sn (artımlı önbellek).

## Dosyalar

* `bot.js` — zamanlama, Telegram, PNG çizimi
* `engine.js` — veri (Binance, disk önbelleği), tarama, plan seviyeleri
* `engine_core.js` — **ÜRETİLMİŞ DOSYA, elle düzenleme.** Modelin `../site/index.html`
  içinden dilimlenmiş çekirdeği: buildVol, kuantil regresyonu + EVT kalibrasyonu,
  computeCore, evalCombo.
* `dilimle.js` — dilimleyici. Sitedeki model her değiştiğinde çalıştırılır:

```powershell
cd D:\islemyok\worker
node dilimle.js            # ../site/index.html -> engine_core.js
```

Çalıştırılmazsa kanal, sitenin terk ettiği bir modelle yayın yapmaya devam eder.
7 Eylül'de tam olarak bu oldu: site sabit interval ufkuna geçti, worker eski
1/3/5/8 GÜN ufkuyla yayına devam etti. Model kodu yalnız `index.html` içinde yazılır.

## Ortam değişkenleri

| Değişken | Zorunlu | Örnek | Not |
|-|-|-|-|
| `TELEGRAM_BOT_TOKEN` | ✓ | `123:ABC…` | BotFather. ASLA koda/sohbete yazma. |
| `TELEGRAM_CHAT` | ✓ | `@islemyok` | Kanal kullanıcı adı; bot kanalda yönetici olmalı. |
| `DATABASE_URL` | | `postgresql://…` | Neon. **Yoksa durum tutulmaz:** aynı sinyal her gün yeniden duyurulur, kapanış mesajı (SL/TP/BE) hiç gitmez. |
| `SCAN_TF` | | `1h` | Varsayılan 1h. Test için 1d hızlıdır. |
| `CRON` | | `0 6 * * *` | UTC. Varsayılan 06:00 UTC = 09:00 TSİ. |
| `CACHE_DIR` | | `/tmp/islemyok-cache` | Kalıcı disk varsa oraya ver. |
| `RUN_ON_START` | | `1` | Açılışta bir kez hemen koşar (ilk kurulum testi). |
| `DRY_RUN` | | `1` | Telegram'a göndermez; konsola + `/tmp/islemyok-plan.png`. |

## Yerel test (Windows PowerShell)

```powershell
cd D:\islemyok\worker
npm install
# 1) Telegram'sız kuru koşu:
$env:DRY_RUN="1"; $env:SCAN_TF="1d"; node bot.js
# 2) Kanala GERÇEK test mesajı (token'ı yalnız bu pencereye yaz):
$env:DRY_RUN="0"; $env:RUN_ON_START="1"; $env:SCAN_TF="1h"
$env:TELEGRAM_BOT_TOKEN="<token>"; $env:TELEGRAM_CHAT="@kanal_adin"
node bot.js   # yayın sonrası Ctrl+C
```

## Railway

```powershell
cd D:\islemyok\worker
railway up --service islemyok-worker --ci
```

Değişkenler Railway panel → servis → **Variables** altında. Deploy loglarında
`İşlem Yok worker hazır · cron: 0 6 * * * UTC` satırını gör. `.railwayignore`
`node_modules`'ü dışarıda tutar; Railpack Linux için `package-lock.json`'dan kurar
(`@napi-rs/canvas` native olduğu için bu şart).

## Bilinen sınırlar (v1)

* Kapanış raporu yok (v1.1: açık planlar Neon'a yazılır, her koşuda SL/TP/BE kontrol edilir).
* Yalnız kripto spot 1h (vadeli/fx sitede var; worker'a v1.2'de).
* Şans eşiği permütasyonu ufka göre değişken örneklem kullanır (`max(300, 40000/hz)`),
  sitede sabit 1500. Uzun ufukta gürültü eşiği yukarı çeker; gerçek tarama 1500 ile
  koştuğu için karşılaştırma tam eşleşmiyor. Açık madde.
* `CACHE_DIR` kalıcı değilse her yeniden başlatmada veri baştan iner (~2 dk, zarar yok).
