# Geçiş notu — traderpath oturumuna (2026-09-18)

## islemyok durumu (main = yayın, her şey merge'li)
- Site: "Sinyal değil, kanıt". Sayfalar: sinyal-test, strateji-testleri (10 kural + 5 anonim kanal, hiçbiri şansı yenmedi),
  referans (Binance linki yayında), gizlilik, rehberler. Yayın otomatik: main'e site/ merge → Cloudflare Pages (`yayin.yml`, 30 sn).
- Ajan: GitHub Actions `ajan.yml`, Pazartesi 09:00 TSİ, 40 tur, Sonnet. Haftalık anonim kanal kartı üretir, `claude/ajan-<yıl>-<hafta>`
  dalına iter. PR'ı kendi açamıyor (repo ayarı kapalı); açmak için:
  `gh api -X PUT repos/yuksel-arslan/islemyok/actions/permissions/workflow -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true`
- AdSense: kimlik ve ads.txt yayında; **Yüksel: AdSense'te islemyok.com → Request review** (bekliyor). Onay 1–4 hafta.
- OKX TR: referans programı yok, boş kalır. Bybit: hesap yok, boş.
- Gizliler (repo secrets): CLAUDE_CODE_OAUTH_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID. Pages projesi: `islemyok-site`.
- Worker (Railway) elle güncellenir: `cd worker && railway up` — Telegram mesajındaki test sayfası linki için bir kez gerekir.

## Laboratuvar (her stratejinin geçtiği tek süzgeç)
- `worker/strategies.js`: walk-forward, ileri bakma yok, işaret-rastgeleleme şans kontrolü (K=50), kural
  **n≥30 ∧ t≥2.5 ∧ iki yarı>0 ∧ p_şans≤0.02**. Dış plan listesi: `node strategies.js --plans dosya.csv --offline --pages 40 --label ad [--perp]`
  CSV: `t0,sym,side[,hz,rm][,sl,tp]`. Giriş = t0 barı kapanışı, stop = nedensel vol·√hz, hedef rm·stop.
- `lab/` (Python 3.11): `veri.py` (Binance saatlik, 10 coin, 4.5 yıl), `egit.py` (TFT walk-forward). Duman testi geçti;
  tam koşu isteğe bağlı, Yüksel "koşmaya gerek yok" dedi. LightGBM (`--model lgbm`) fikri açık, kurulmadı.
- Sonuçlar bugüne kadar: model, tsmom20/60, donch20/55, revert3, xsmom30, fund_pct/abs, koşullu model, 5 Telegram kanalı:
  **hiçbiri geçmedi.** BTC al-tut tüm kanalları geçti.

## Sıradaki deney: sektör momentumu (traderpath mantığı) — önceden yazılmış kurgu
- Fikir: para hangi sektöre akıyorsa orada long, hangisinden çıkıyorsa orada short. Akademik adı sektör momentumu
  (Moskowitz–Grinblatt 1999); şimdiye kadar önerilenler içinde en sağlam olanı, çünkü desen değil belgelenmiş bir prim.
- Evren: Binance'te işlem gören ilk ~80 coin (USDT), CoinGecko kategorisiyle 8–10 sektör (L1, L2, DeFi, AI, meme, oyun,
  altyapı/oracle, ödeme, borsa token, RWA). İki veri de ücretsiz, anahtar yok.
- Akış ölçüsü: sektörün piyasaya göre son 2 ve 4 haftalık getirisi + hacim değişimi (eşit ağırlıklı sektör endeksi).
- Kural: haftada bir (Pazartesi 00:00 UTC), en güçlü sektörün ilk 3 coin'i long, en zayıfın ilk 3'ü short; 2 hafta tut
  (hz=336 bar), stop = vol·√hz, rm=1.5. Üç satır raporlanır: yalnız long, yalnız short, uzun-kısa. Short = vadeli, `--perp`.
- Zayıf noktalar baştan: akış geçmiş getiri demektir (momentum), görününce kısmı olmuş olur; kripto anlatıları kısa ömürlü;
  short bacağı hisse literatüründe daha zayıf ve sıkışmaya açık; `xsmom30` 10 büyük coin'de geçmedi.
- Test bittiğinde sonuç ne olursa olsun `site/strateji-testleri.html` tablosuna girer.
- Uygulama yeri: islemyok `worker/strategies.js`'e yeni strateji olarak (veri katmanı 80 coin + kategori dosyası) ya da
  traderpath reposunda üretilip CSV ile `--plans` üzerinden aynı süzgece sokulur. İkincisi tercih: traderpath kendi
  mantığını üretir, islemyok yalnız ölçer.

## traderpath.io hakkında bilinen
- Yüksel'in kullandığı platform; "para hangi sektöre akıyor" mantığıyla sektör seçip orada işlem arıyor.
- Claude'un buradan erişimi yok, içeriği bilinmiyor. Stratejilerini test etmek için ya işlem listesi CSV'si (t0,sym,side)
  ya da kural metni gerekir.

## Çalışma kuralları (Yüksel'in istekleri)
- Bütçe sınırlı: sürpriz maliyet yok, gereksiz tur yok, kısa cevap. Her komut önce doğrulanır; doğrulanamayan "denenmedi" diye işaretlenir.
- Dürüst sonuç: "bulamadım" demekten çekinme, sahte olumlu sonuç üretme; eşik/kural sonradan gevşetilmez.
- Merge yetkisi: "benim adıma merge et". Python 3.11, Node 22, Tailwind, koyu/açık tema, her mikroservisin güncel .md'si.
