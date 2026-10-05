# Durum — haftalık güncellenir (ajan)

Son güncelleme: 2026-10-05 (ajan turu 2026-41)

## Açık adım
**1 + 2 (referans linki + reklam yerleşimi)** — Binance referansı yayında; AdSense kimliği girildi, site onayı bekleniyor (2026-09-18). OKX TR referans programı yok, boş kalır.

## Yüksel'den istenen (tek satır)
Aşağıdaki satırları doldur, commit'le (ya da buraya yaz, ajan alır; `cd worker && npm run yapilandir` → `site/yapilandirma.js`):
- `REF_BINANCE=https://www.binance.com/activity/referral-entry/CPA?ref=CPA_007UPFYGH1` · `REF_OKX=` · `REF_BYBIT=` — hangileri varsa (https, borsanın kendi alan adı)
- `ADSENSE_PUB=ca-pub-1157298728187860` (ca-pub-… kimliği) · `ADSENSE_SLOT_ICERIK=` · `ADSENSE_SLOT_ARAC=` — birim kimlikleri; boşsa yalnız Auto ads
- Repo ayarı: Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests" aç (ajan PR açamıyor, bkz. aşağıda) — ya da `claude/ajan-2026-38` PR'ını elle aç.

## Yapıldı
- 2026-09-17: plan, takvim, materyaller. Zamanlayıcı: GitHub Actions `.github/workflows/ajan.yml` (Pazartesi 09:00 TSİ); tek gizli `CLAUDE_CODE_OAUTH_TOKEN`.
- 2026-09-17 (ajan): adım 1–2 ajan kısmı — `site/gelir.js` (referans satırı + reklam birimi), `site/yapilandirma.js`
  (üretilmiş dosya; `worker/yapilandir.js` DURUM.md'den doğrulayarak üretir, `npm run yapilandir`), tek sinyal
  kartının altına referans satırı, `site/referans.html` (komisyon tablosu; oranlar bu ortamdan doğrulanamadı, sayfada
  not var), 11 sayfada içerik sonu / footer üstü reklam alanı, ana sayfada araç altı ikinci birim, sitemap.
  Değerler boşken sayfada hiçbir şey görünmez. Testler: 75/75.

## Haftalık kart (2026-38) — Kanal E
- Bu koşu GitHub Actions'ta (ubuntu-latest); ağ önceki bulut sandbox'ın aksine açık, `t.me` ve Binance veri API'si
  403 vermedi — geçen haftanın notu doğrulandı.
- `npm run kanal -- --discover crypto_trading_club,tuzonacryptu,cryptosignals0rg,revolutiontradingsignalsx` (geçen
  haftaki tohumlar) → 2 aday eşiği geçti (≥20 sinyal, son 6 ay aktif): `crypto_trading_club` (114 sinyal) ve
  `cryptosignals0rg` (30 sinyal). Daha derin geçmişi olanı seçildi, `--fetch --pages 40` (661 mesaj, 502 sinyal,
  Nis–Eyl 2026), `--test --strict`: **n=139 ≥ 30 → kart yayınlandı.**
- Sonuç: sıkı modda MAYMUNU YENEMEDİ (isabet %45, +29.108 TL vs maymun +10.063 TL, maymunların %82'sinden iyi,
  t=1.44). Cömert modda %78 / +93.048 TL ile "yendi" görünüyordu — 49 sinyalde giriş hiç dolmadı, %29 mesaj
  silinmiş. Kanal adı anonim (site: Kanal E); kart `plan/kartlar/2026-38.md`, tablo `strateji-testleri.html`
  güncellendi (5 kanal), X metni `plan/materyal/x-metinleri.md`.
- Testler: 75/75. Kod dalı `claude/ajan-2026-38` gönderildi (push başarılı). **`gh pr create` başarısız:**
  "GitHub Actions is not permitted to create or approve pull requests" — repo ayarı (Settings → Actions →
  General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests") kapalı.
  **Onay bekliyor: bu ayarı aç ya da PR'ı elle oluştur** →
  <https://github.com/yuksel-arslan/islemyok/pull/new/claude/ajan-2026-38>. Ayar açılırsa sonraki koşularda
  ajan PR'ı kendi açar.

## Ajan turu 2026-41 (5 Eki)
- kart: yeni aday yok. Ağ açık (`--discover` 403 vermedi); eşiği geçen tek iki kanal (`crypto_trading_club` 115, `cryptosignals0rg` 27 sinyal)
  geçen hafta zaten kullanıldı, 7 yeni tohum (binancekillers, fatpigsignals, universalcryptosignals…) ≤2 sinyal → kart atlandı, uydurma yok.
  Yeni tohum gerekirse: kanalların birbirine verdiği bağlantılar tükendi; elle bulunan herkese açık kanal adı eklenebilir.
- Olay deneyi siteye işlendi: `strateji-testleri.html` yeni bölüm + H2 satırı, ana sayfada olay uyarısı (`site/olaylar.json`,
  `npm run olaylar` ile `lab/olaylar.csv`'den üretilir, testli), X metni `plan/materyal/x-metinleri.md`. Testler 81/81.
- Açık: `lab/olaylar.csv` 2026-09-11'de bitiyor; sonraki FOMC/TÜFE tarihleri eklenmeden uyarı çıkmaz (tarih uydurmadım).
  CSV'de 11 TÜFE satırı "dogrulanmadi"; sayfada "tarih doğrulanmadı" ibaresiyle gösterilir.
- PR: https://github.com/yuksel-arslan/islemyok/pull/21 (merge bekliyor)

## Ajan için bekleyen iş (2026-09-18, Yüksel onayladı): olay deneyi sonucunu siteye işle — YAPILDI (2026-41)
Laboratuvar sonucu (`lab/olay.py`, kurgu ve kabul `lab/LAB.md`, ham çıktı Yüksel'in makinesinde `lab/cikti/olay-h1.txt`):
- H1 zamanlama GEÇTİ: FOMC+TÜFE sonrası 24 saatte |getiri| plasebonun 1.45 katı (p=0.000, 91 olay, 10 varlık, 2022–2026);
  yalnız FOMC 1.67 (p=0.000); yalnız TÜFE 1.30 (p=0.009, sınırda). En büyük saatlik hareket medyanda olaydan 2 saat sonra (q75: 9).
- H2 yön×pozisyonlanma KALDI: olay öncesi fonlama ucu yönü öngörmüyor (n=202, −7.25R, t=−0.55, p_şans=0.26); olay dışı
  kontrol de kaldı (n=224, +0.65R, t=0.06). Yön öngörülemez, iki koşulda da.
Yapılacak (tek PR): (1) `site/strateji-testleri.html`'e "Olay takvimi: rüzgâr ne zaman çıkar" bölümü — yukarıdaki sayılar,
yöntem (plasebo, K=2000), "yön değil zamanlama" vurgusu; tabloya H2 satırı (kaldı). (2) Ana sayfaya küçük uyarı: bugün/yarın
`lab/olaylar.csv`'de olay varsa "FOMC/TÜFE günü: hareket normalin ~1.5 katı, ilk 2 saat; sıkı stop taşıma" (takvim JSON'a
çevrilip `site/`'a konur, JS tarayıcıda okur). (3) X metni: "10 kural ve 5 kanal geçmedi; ilk geçen şey bir olay takvimi".
Yasak: yön önermek, "FOMC'de al/sat" demek. Sinyal değil, kanıt.

## Gelecek hafta (2026-39, 21 Eyl)
- Linkler/kimlik geldiyse `npm run yapilandir` → `npm test` → yayın; referans.html'deki oranları borsa sayfasıyla kontrol et.
- Yeni haftalık kanal kartı (Kanal F): `--discover` bu kez henüz denenmemiş tohumlarla (crypto_trading_club/
  cryptosignals0rg artık kullanıldı; tuzonacryptu/revolutiontradingsignalsx son 6 ayda aktif değildi, tohum olarak
  kalabilir ama kendileri test edilmez). 28 Eyl'de adım 4 (kanal raporu şablonu, fiyat sayfası) başlar.
- Küçük bakım: `index.html` 390px genişlikte yatay taşıyor (431px; bu turdan önce de vardı, reklam alanı değil) — düzelt.

## Aylık ölçüm
(ilk kayıt Ekim)
