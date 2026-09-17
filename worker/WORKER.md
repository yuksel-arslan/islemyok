# İşlem Yok — Telegram Worker

Güncelleme: 2026-09-17 · Durum: v1 (günlük tarama + yayın). v1.1 planı: işlem kapanış takibi (Neon).

Kaynak: <https://github.com/yuksel-arslan/islemyok> — bu klasör repo içinde `worker/`.

## Ne yapar

Her gün 06:00 UTC (09:00 TSİ) kripto 1h piyasasını tarar (islemyok.com'daki modelin birebir
sunucu kopyası): 10 varlık × 96 kombinasyon + aile-geneli şans eşiği (12 tekrar).

* Bir plan **iki kapıdan** geçmek zorundadır: (1) aile-geneli şans eşiği (ev > famHi),
  (2) kendi hata payı (ev > 2·se). Yalnız ikisini birden geçen yayınlanır.
* Eşik karşılaştırması tek yerde: `passesThreshold(best, thr)` (`engine.js`). Hem
  `okChance` hesabı hem "işlem yok" kararı bunu kullanır; ekrandaki `best`/eşik ile
  metnin çelişmemesi bu tekliğe bağlıdır. Birim testi: `engine.test.js` (`npm test`).
* Geçilmezse: kanala "Bugün işlem yok" metni — en iyi sonuç ± hata payı, eşik değeri ve
  **hangi kapıda elendiği**. Eşiği geçip hata payında kalan varsa metin bunu söyler;
  best iki kapıyı da geçtiği halde plan zaten açık olduğu için yeni sinyal çıkmadıysa
  metin "eşik geçildi ama açık plan mevcut" der — eşikten büyük bir sayının yanında asla
  "eşik geçilmedi" yazmaz.
* Geçilirse: her plan için mum grafiği PNG (giriş/SL/TP1/TP2/süre) + özet.

Tahmin ufku sitedekiyle aynı sabit settir: **15/30/60/120 interval** (`HZ_FIXED`), üst
sınır 120. Ufuk gün cinsinden değil barın kendi ölçeğinde tanımlıdır.

Koşu süresi: ilk gün ~2-3 dk (veri indirme), sonrası ~30-60 sn (artımlı önbellek).

## Dosyalar

* `bot.js` — zamanlama, Telegram, PNG çizimi
* `trackrecord.js` — **gerçek track record**: Neon `signals` (salt okunur) veya kamuya
  açık `signals.json` üzerinden yayınlanmış sinyallerin gerçekleşen sonucu (toplam R,
  kazanma, profit factor, max drawdown). Kayıtlar yayın anında yazıldığı için look-ahead
  yoktur — "sistem çalışıyor mu" sorusunun en güçlü cevabı. `--bars-dir` ile her kapanmış
  sinyal botla aynı kodla (`replayPlan`+`netR`) yeniden hesaplanıp kayıtla karşılaştırılır;
  uyuşmazlıkta çıkış kodu 3. Ledger'a yazmaz. Testler: `trackrecord.test.js`.
  `npm run trackrecord -- signals.json | --url <url> | --db  [--bars-dir CACHE_DIR]`
* `backtest.js` — **walk-forward backtest**: modeli geçmişte gezdirir. Her çapa anında
  yalnız o ana kadarki barlarla `engine.scanRows` çalışır (canlı taramayla aynı kod, aynı
  eşikler), iki kapıyı geçen plan o anki fiyattan açılır, sonra T sonrası barlara karşı
  oynatılır. Look-ahead yok. Açık sym+yön varken tekrar açmaz, ters yön gelirse kapatır
  (canlı `publishNew` ile aynı). Çapa başına maliyet ≈ bir canlı tarama; `--step`/`--from`/
  `--to` ile sınırla. `--assets` alt küme verirsen aile eşiği canlıdan farklı çıkar (uyarır).
  `npm run backtest -- [--tf 1h] [--step 24] [--warmup N] [--from 2025-01-01] [--to …]
     [--assets BTC,ETH] [--funding x] [--offline] [--csv out.csv] [--json out.json]`
  `--offline`: yalnız `CACHE_DIR/kl-<sym>-<tf>.json` okur, ağa çıkmaz. Testler: `backtest.test.js`.
  Her çapada teşhis: en iyi sonuç ± hata payı ve hangi kapıda kaldığı; sonda çapa özeti ve
  eşiğe en yakın 5 çapa (`<ad>-capa.csv`).
  **`--shadow`**: yakın kaçanları (şans ✓ hata ✗) gölge plan olarak ileriye oynatır, gerçek
  planlardan AYRI raporlar (t-istatistiğiyle). Hata kapısını gevşetmeden "kapı gerçek kenarı mı
  reddediyor" sorusunu ölçer; gölge planlar canlıda yayınlanmaz.
  **`--pages N`**: derin geçmiş (N×1000 bar), `kl-<sym>-<tf>-pN.json` ayrı dosyada — canlı
  önbellek değişmez. `se = sd/√(geçmiş/hz)` olduğundan erken çapalarda hata payı canlıyla eşitlenir;
  kısa warmup'lı koşular hata kapısını olduğundan katı gösterir.
* `strategies.js` — **strateji laboratuvarı**: kural tabanlı, literatürde kripto için belgelenmiş
  dört aile (TSMOM 20/60g, Donchian 20/55g, 3g geri dönüş z±2, kesitsel momentum 30g ilk3/son3).
  Aynı stop/hedef makinesi (ufuk 1σ stop, rm×stop hedef), aynı oynatma, walk-forward, look-ahead yok
  (vol nedensel EWMA). **Şans kontrolü içeride:** aynı girişler rastgele yönle K tekrar → p_şans.
  **Karar kuralı önceden:** n≥30 ∧ t≥2.5 ∧ iki yarı>0 ∧ p_şans≤0.02 → GEÇTİ. Dakikalar sürer
  (computeCore yok). Testler: `strategies.test.js`. Fonlama primi: çevrimdışı veri yok, sonraya.
  `npm run strategies -- --tf 1h --pages 40 --offline [--strats tsmom20,donch55] [--controls 20] [--csv s.csv]`
* `engine_cond.js` — **DENEYSEL** koşullu (analog) bootstrap değerlendirici. `evalCombo` ile aynı
  bariyer/maliyet/stop/vol konisi; tek fark simülasyon başlangıçlarının tüm geçmişten değil,
  **şu anki duruma** (işaretli momentum 5g/20g + vol rejimi) en yakın K pencereden çekilmesi.
  Gerekçe: koşulsuz `evalCombo`'da başlangıç `rnd()*(u.length−hz)` → yön bilgisi yalnız geçmiş
  ortalama sürüklenme; walk-forward'da gerçekleşen ≈ 0 çıktı. Canlıya bağlı değil; `engine_core.js`
  değişmez. `scanCores/scanRows` isteğe bağlı `evaluator` alır (canlı `scanMarket` geçmez).
  Sınama: `npm run backtest -- --model cond ...` aynı çapalarda base ile A/B. Karar kuralı önceden:
  gerçek planlarda ort. R > 0 ve t ≥ 2 yoksa fikir ölür; varsa `index.html`'e taşınır.
* `engine.js` — veri (Binance, disk önbelleği), tarama, plan seviyeleri.
  `scanMarket` (canlı, Binance) ve `scanRows` (as-of, barlar verilir, ağ yok) ortak
  `scanCores` gövdesini paylaşır; `buildCore` barlardan kalibrasyon.
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
* `CACHE_DIR` kalıcı değilse her yeniden başlatmada veri baştan iner (~2 dk, zarar yok).
