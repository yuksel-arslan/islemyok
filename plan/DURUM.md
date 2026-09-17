# Durum — haftalık güncellenir (ajan)

Son güncelleme: 2026-09-17 (kurulum doğrulama · ajan turu 2026-38)

## Açık adım
**1 + 2 (referans linki + reklam yerleşimi)** — ajan tarafı yayında (değerler boş → görünmez); Yüksel'in girişi bekleniyor.

## Yüksel'den istenen (tek satır)
Aşağıdaki satırları doldur, commit'le (ya da buraya yaz, ajan alır; `cd worker && npm run yapilandir` → `site/yapilandirma.js`):
- `REF_BINANCE=` · `REF_OKX=` · `REF_BYBIT=` — hangileri varsa (https, borsanın kendi alan adı)
- `ADSENSE_PUB=` (ca-pub-… kimliği) · `ADSENSE_SLOT_ICERIK=` · `ADSENSE_SLOT_ARAC=` — birim kimlikleri; boşsa yalnız Auto ads

## Yapıldı
- 2026-09-17: plan, takvim, materyaller. Zamanlayıcı: GitHub Actions `.github/workflows/ajan.yml` (Pazartesi 09:00 TSİ); tek gizli `CLAUDE_CODE_OAUTH_TOKEN`.
- 2026-09-17 (ajan): adım 1–2 ajan kısmı — `site/gelir.js` (referans satırı + reklam birimi), `site/yapilandirma.js`
  (üretilmiş dosya; `worker/yapilandir.js` DURUM.md'den doğrulayarak üretir, `npm run yapilandir`), tek sinyal
  kartının altına referans satırı, `site/referans.html` (komisyon tablosu; oranlar bu ortamdan doğrulanamadı, sayfada
  not var), 11 sayfada içerik sonu / footer üstü reklam alanı, ana sayfada araç altı ikinci birim, sitemap.
  Değerler boşken sayfada hiçbir şey görünmez. Testler: 75/75.

## Haftalık kart (2026-38)
- **Üretilemedi.** `npm run kanal -- --discover crypto_trading_club,tuzonacryptu,cryptosignals0rg,revolutiontradingsignalsx`
  dört tohum için `t.me 403` döndü; `data-api.binance.vision` de 403. Bu ortamın ağ politikası Telegram önizlemesini ve
  Binance veri API'sini engelliyor; kanal keşfi/testi burada çalışmıyor. Kart uydurulmadı.
  Not: bu koşu Claude bulut sandbox'ındaydı. Ajan artık GitHub Actions'ta (ubuntu-latest, ağ açık) koşuyor; kart ilk
  Actions koşusunda üretilmeli. Orada da 403 gelirse kartı kendi makinende `npm run kanal -- --discover …` / `--fetch` /
  `--test --strict` ile üretip `plan/kartlar/`'a koy.

## Gelecek hafta (2026-39, 21 Eyl)
- Linkler/kimlik geldiyse `npm run yapilandir` → `npm test` → yayın; referans.html'deki oranları borsa sayfasıyla kontrol et.
- Kanal kartı (ağ erişimi açıldıysa). 28 Eyl'de adım 4 (kanal raporu şablonu, fiyat sayfası) başlar.
- Küçük bakım: `index.html` 390px genişlikte yatay taşıyor (431px; bu turdan önce de vardı, reklam alanı değil) — düzelt.

## Aylık ölçüm
(ilk kayıt Ekim)
