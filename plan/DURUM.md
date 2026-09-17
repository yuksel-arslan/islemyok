# Durum — haftalık güncellenir (ajan)

Son güncelleme: 2026-09-17 (ilk GitHub Actions koşusu · ajan turu 2026-38)

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

## Gelecek hafta (2026-39, 21 Eyl)
- Linkler/kimlik geldiyse `npm run yapilandir` → `npm test` → yayın; referans.html'deki oranları borsa sayfasıyla kontrol et.
- Yeni haftalık kanal kartı (Kanal F): `--discover` bu kez henüz denenmemiş tohumlarla (crypto_trading_club/
  cryptosignals0rg artık kullanıldı; tuzonacryptu/revolutiontradingsignalsx son 6 ayda aktif değildi, tohum olarak
  kalabilir ama kendileri test edilmez). 28 Eyl'de adım 4 (kanal raporu şablonu, fiyat sayfası) başlar.
- Küçük bakım: `index.html` 390px genişlikte yatay taşıyor (431px; bu turdan önce de vardı, reklam alanı değil) — düzelt.

## Aylık ölçüm
(ilk kayıt Ekim)
