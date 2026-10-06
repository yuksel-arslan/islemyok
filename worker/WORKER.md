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
  (vol nedensel EWMA). **Şans kontrolü içeride (işaret-rastgeleleme):** gerçek plan listesi, yalnız yön
  rastgele çevrilir, aynı giriş/vade/maliyet; K=50 tekrar → p_şans. Sentetik doğrulama: saf gürültüde
  6/6 kaldı, trend rejiminde momentum/kırılım geçti, geri dönüş kaldı.
  **Karar kuralı önceden:** n≥30 ∧ t≥2.5 ∧ iki yarı>0 ∧ p_şans≤0.02 → GEÇTİ. Dakikalar sürer
  (computeCore yok). Testler: `strategies.test.js`. Fonlama primi: çevrimdışı veri yok, sonraya.
  `npm run strategies -- --tf 1h --pages 40 --offline [--strats tsmom20,donch55] [--controls 50] [--csv s.csv]`
  **Dış plan listesi** (`--plans dosya.csv [--label ad] [--perp]`): Python laboratuvarı (`lab/`), traderpath vb.
  dışa aktarımlar aynı süzgeçten geçer. CSV: `t0,sym,side[,hz,rm][,sl,tp]`; giriş = t0 barının kapanışı,
  sl/tp yoksa stop = nedensel vol·√hz (mkPlan). `plansFromCsv` + `runPlans` (`evaluate` ortak gövde).
* `funding.js` — **fonlama oranı verisi** (Binance USDⓈ-M, 8 saatlik). `--fetch` geçmişi çeker
  (`fund-<sym>.json`, artımlı), `--now` bugünkü oran/24s ort/yıllık/90g yüzdelik ve iki stratejinin
  bugünkü yönünü basar. Yardımcılar yalnız geçmişe bakar. Laboratuvarda `fund_pct` (90g yüzdelik ≥90 →
  short, ≤10 → long) ve `fund_abs` (24s ort ≥ %0.03/8s → short, ≤ −%0.03 → long); 3 gün tutuş, 1.5R.
  **Gerçekleşen fonlama ödemesi R'ye eklenir** (tutuş boyunca gerçekten alınan/ödenen), şans kontrolüne de.
  Rapor fiyat/fonlama payını ayrı yazar. Fiyat serisi spot (perp yakın vekil). Testler: `funding.test.js`.
  `npm run funding -- --fetch --pages 5` · `npm run funding -- --now` ·
  `npm run strategies -- --tf 1h --pages 40 --offline --strats fund_pct,fund_abs --csv fund.csv`
* `../site/sinyal-core.js` — **ortak çekirdek (tarayıcı + Node)**: replayPlan/netR, sinyal ayrıştırıcı, toPlan,
  fillPlan (sıkı), monkeyTest, singleSignal (yönsüz blok bootstrap: şansın isabeti, başabaş, tasfiye).
  `kanal.js` ve `site/sinyal-test.html` bunu kullanır; ayrıştırıcı/oynatıcı tek kopya. Ağ erişimi yok.
  Testler: `sinyal-core.test.js`. **Site:** `sinyal-test.html` — "Tek sinyal" (yapıştır/doldur → çıta) ve
  "Kanalın geçmişi" (tarihli mesajlar → sıkı/cömert oynatma, 50 maymun, bant grafiği). Her şey tarayıcıda;
  Binance verisi kullanıcının tarayıcısından çekilir, bize hiçbir şey gelmez.
* `yapilandir.js` — **gelir yapılandırması** (site adım 1–2: borsa referans linkleri + AdSense). `../plan/DURUM.md`
  içindeki `REF_BINANCE= REF_OKX= REF_BYBIT= ADSENSE_PUB= ADSENSE_SLOT_ICERIK= ADSENSE_SLOT_ARAC=` satırlarını okur,
  doğrular (https + borsanın alan adı, `ca-pub-\d{10,}`, slot yalnız rakam; geçersizse yazmaz, çıkış 2) ve
  `../site/yapilandirma.js` üretir (ÜRETİLMİŞ DOSYA, elle düzenleme). Boş değer = sayfada görünmez.
  `../site/gelir.js` bu dosyayı okuyup referans satırını (`[data-referans]`, `IYGelir.refHTML()`) ve reklam birimlerini
  (`[data-reklam]`) çizer. Testler: `yapilandir.test.js` (repo'daki üretilmiş dosyanın DURUM.md ile birebir olduğunu da
  denetler). `npm run yapilandir [-- --check]`
* `kanal.js` — **Telegram sinyal kanalı testi ("maymun testi")**. `--discover` tohum kanallardaki
  t.me bağlantılarını gezer, sinyal sayısına göre sıralar; `--fetch` herkese açık önizlemeyi (t.me/s) çeker,
  toleranslı ayrıştırıcı (TR/EN, emoji yön, bölge girişi, numaralı hedefler; hedef girişin doğru tarafında ve
  uzağında olmalı); `--sample` ayrışmayan sinyal benzeri mesajları basar; `--test` gerçek mumla oynatır,
  aynı işlemleri yönü rastgele 50 kez oynatır (maymun), BTC al-tut ile kıyaslar, silinmiş mesaj payını
  (id boşlukları) yazar. **`--strict` = gerçek işlem:** giriş dolmalı, yarı kapatma yok — yayınlanan hüküm
  daima sıkı moddan; cömert mod "doğrulanmadı" etiketi taşır. En çok sinyal alan 25 coin (`--maxsyms`),
  veri derinliği sinyal tarihine göre. Eylül 2026: 5 kanal, sıkı modda 5/5 yenemedi
  (cömertte 4 "yendi" görünüyordu: dolmayan limit girişi, TP1 yarı kapatma, %26–29 silinmiş mesaj). Haftalık
  otomatik keşifle (`--discover`) bir kanal daha eklenir; kartlar `plan/kartlar/`, tablo `strateji-testleri.html`.
  Sitede anonim (Kanal A–D). Testler: `kanal.test.js`. Yalnız kamuya açık mesajlar; giriş yapılmaz.
  `npm run kanal -- --discover a,b | --fetch a,b --pages 40 | --test a,b --strict --offline | --sample a --n 5`
* `engine_cond.js` — **DENEYSEL** koşullu (analog) bootstrap değerlendirici. `evalCombo` ile aynı
  bariyer/maliyet/stop/vol konisi; tek fark simülasyon başlangıçlarının tüm geçmişten değil,
  **şu anki duruma** (işaretli momentum 5g/20g + vol rejimi) en yakın K pencereden çekilmesi.
  Gerekçe: koşulsuz `evalCombo`'da başlangıç `rnd()*(u.length−hz)` → yön bilgisi yalnız geçmiş
  ortalama sürüklenme; walk-forward'da gerçekleşen ≈ 0 çıktı. Canlıya bağlı değil; `engine_core.js`
  değişmez. `scanCores/scanRows` isteğe bağlı `evaluator` alır (canlı `scanMarket` geçmez).
  Sınama: `npm run backtest -- --model cond ...` aynı çapalarda base ile A/B. Karar kuralı önceden:
  gerçek planlarda ort. R > 0 ve t ≥ 2 yoksa fikir ölür; varsa `index.html`'e taşınır.
* `tdi.js` — **BTMM|TDI göstergesi testi** (TradingView, The_Trading_Jedi). Pine hesaplarının
  nedensel kopyası: RSI21 (Wilder), TL=SMA7, BL=SMA34, MZL (DEMA12−DEMA26), EMA 13/50/200/800 skoru,
  3× zaman dilimi eğilimi (yalnız kapanmış HTF barı). Kurallar önceden yazıldı: `tdi_x` = TL/BL
  kesişmesi (göstergenin alarmı); `tdi_full` = kesişme + MZL + EMA skoru + HTF aynı yön.
  `tdi_x_vol` / `tdi_full_vol` = ek koşul: kesişme barının hacmi > SMA20(hacim). Hacim için
  `engine.klines` artık `v` alanını da saklar; eski önbellekte `v` yoksa *_vol işlem açmaz
  (önbelleği silip yeniden indir). Ufuk 1 gün,
  1σ stop, 2× hedef, aynı oynatma/maliyet/şans testi (`strategies.runPlans`), aynı kabul kuralı.
  `node tdi.js --sentetik` (karşılaştırma: donch20, tsmom20) · `node tdi.js --offline --pages 40`.
  Testler: `tdi.test.js` (önek = tam seri nedensellik testi dahil).
* `sentetik.js` — sentetik piyasa: 10 varlık, GARCH(1,1) oynaklık, isteğe bağlı trend rejimleri
  (ort. 15 gün, ±sürüklenme), bar içi 6 alt adım. Boru hattı sınaması: saf gürültüde hiçbir strateji
  geçmemeli; trend rejiminde trend izleyiciler geçmeli. Gerçek veri yerine geçmez.
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

## Backtest bulguları (2026-09-17, 1h, 10 varlık, 40k bar ≈ 4.5 yıl, look-ahead yok)

Aynı veride üç bağımsız bakış, aynı cevap: **1h barda 1–5 günlük ufukta spot majörlerde yön
tahmininden komisyon (22bp) sonrası kenar çıkmıyor.**

| Bakış | n | Sonuç |
|---|---|---|
| Mevcut model (iki kapı) | 8 | +0.04R/plan, sıfırdan ayırt edilemez |
| Gölge (şans ✓ hata ✗) | 91 | +0.05R/plan, t=0.41 → hata kapısı gerçek kenar reddetmiyor |
| Koşullu (analog) bootstrap | 0 | komşu pencereyle nEff küçülüyor, hata kapısı hiç açılmıyor — fikir öldü |
| tsmom20 / tsmom60 | 4071 / 3674 | −81R / −121R; şans = saf komisyon (−105 / −112). Brüt ≈ 0 |
| donch20 / donch55 | 155 / 96 | ≈ 0 |
| revert3 | 288 | −36R, t=−2.5, şanstan kötü (p=0.88) |
| xsmom30 | 2368 | −58R, şans −51 |

Teşhis: `evalCombo` simülasyon başlangıcını tüm geçmişten rastgele seçer; yön bilgisi yalnız geçmiş
ortalama sürüklenme. Kapılar doğru kalibre (ev − eşik ≈ gerçekleşen). Sorun kapılarda değil, sinyal
kaynağında. **Yapılmaması gereken:** eşik/çarpan oynamak, kombinasyon eklemek, sonucu gördükten sonra
kural çevirmek (revert3 → "devam").

**Test edilmemiş adaylar (veri gerekli):** fonlama/basis carry (futures `fapi`; sitede modül var),
haftalık ufuk momentum (günlük bar, 1–4 hafta tutuş, komisyon amorti).

## BTMM|TDI testi (2026-10-06, `tdi.js`, kurallar önceden yazıldı)

Gerçek veri: Binance 1h, 10 varlık, 40 sayfa (GitHub Actions `lab.yml`, koşu #1). Şans = aynı girişler rastgele yön.

| Strateji | n | toplam R | ort R | t | şans ort. | p_şans | karar |
|---|---|---|---|---|---|---|---|
| tdi_x (TL/BL kesişmesi) | 18714 | −1418 | −0.08 | −14.3 | −1379 | 0.66 | kaldı |
| tdi_full (+MZL+EMA+HTF) | 5645 | −450 | −0.08 | −7.2 | −430 | 0.62 | kaldı |
| donch20 (kıyas) | 198 | +26 | +0.13 | 1.9 | −5 | 0.00 | kaldı (t<2.5) |
| tsmom20 (kıyas) | 4013 | −59 | −0.01 | −1.2 | −114 | 0.14 | kaldı |

Okuma: TDI'nin zararı rastgele yönle neredeyse aynı → kayıp komisyon, yön bilgisi ≈ 0. Sentetik
sınama (`--sentetik --syms BTCUSDT`): gürültüde hepsi kaldı (boru hattı yanlış pozitif vermiyor);
güçlü trend rejiminde (±%1.5/gün) tdi_full, donch20, tsmom20 GEÇTİ (göstergeler trendi yakalayabiliyor);
zayıf trendde (±%0.5/gün) hiçbiri geçmedi. Yani gerçek 1h kripto verisinde sömürülebilir trend gücü
bu göstergenin eşiğinin altında. **Karar: TDI kullanılmaz.**

Hacim koşulu (hacim > SMA20), yalnız BTCUSDT, 40k bar 2022-03 → 2026-10 (koşu #3):

| Strateji | n | toplam R | ort R | t | şans ort. | p_şans | karar |
|---|---|---|---|---|---|---|---|
| tdi_x | 1858 | −226 | −0.12 | −7.3 | −201 | 0.80 | kaldı |
| tdi_full | 567 | −79 | −0.14 | −4.0 | −61 | 0.86 | kaldı |
| tdi_x_vol | 797 | −94 | −0.12 | −4.1 | −79 | 0.76 | kaldı |
| tdi_full_vol | 348 | −47 | −0.13 | −2.9 | −39 | 0.68 | kaldı |

Hacim işlem sayısını ~%57 / %39 azalttı, toplam zarar aynı oranda küçüldü; işlem başına R değişmedi
(−0.12/−0.13). Filtre kaybı küçültüyor, kenar yaratmıyor.

## Bilinen sınırlar (v1)

* Kapanış raporu yok (v1.1: açık planlar Neon'a yazılır, her koşuda SL/TP/BE kontrol edilir).
* Yalnız kripto spot 1h (vadeli/fx sitede var; worker'a v1.2'de).
* `CACHE_DIR` kalıcı değilse her yeniden başlatmada veri baştan iner (~2 dk, zarar yok).
