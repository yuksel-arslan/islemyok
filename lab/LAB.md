# lab/ — Python laboratuvarı (TFT walk-forward)

Güncelleme: 2026-09-18 · Durum: kuruldu, tam koşu Yüksel'in makinesinde bekliyor · Python 3.11, CPU.

## Ne için
"Model geçmiş desenleri öğrenince ileriyi tahmin eder mi?" sorusunu ölçmek. Model: Temporal Fusion
Transformer (`pytorch-forecasting`). Sonuç ne olursa olsun `site/strateji-testleri.html` tablosuna girer.

## Dosyalar
* `veri.py` — saatlik mumlar. Worker'ın derin önbelleği (`CACHE_DIR/kl-<sym>-1h-p40.json`) yalnız hacimli ve 3 günden
  tazeyse kullanılır; aksi hâlde Binance'ten çekilir (~2 dk). Eski/kısa `veri/*.csv` kendiliğinden yenilenir; zorlamak: `--yenile`.
  Çıktı `veri/<sym>-1h.csv` (t = bar açılışı ms, Node ile aynı).
* `egit.py` — özellikler (hepsi nedensel), walk-forward eğitim, karar skorları, plan CSV.
  Çıktılar `cikti/<etiket>-skor.csv` (her karar), `cikti/<etiket>-plans.csv` (eşiği geçenler),
  `cikti/<etiket>-kayit.json` (ayarlar, kesimler, süreler).
* `requirements.txt`

## Kurgu (önceden yazıldı; koşudan sonra değişmez)
* Hedef `y_t = r_t / vol_{t-1}`: barın getirisi, önceki barın nedensel EWMA vol'una bölünmüş. Karar anında bilinir;
  kodlayıcıya sızıntı yok. Model sonraki H=24 barın y kantillerini (0.1/0.5/0.9) tahmin eder.
* `skor = Σ q50 / √H`. `skor ≥ 0.5` long, `≤ −0.5` short. Plan: ufuk H bar, stop = vol·√H, hedef 1.5·stop
  (`worker/strategies.js` mkPlan ile aynı; eşit şartlar).
* Girdiler: y, r1, vol, z6/z24/z120 (vol-normalize getiriler), aralık, hacim z; bilinen: saat, gün; statik: sembol.
* Walk-forward: ısınma 365 gün, her 60 günde yeniden eğitim, kayan 540 günlük eğitim penceresi, son 30 gün
  doğrulama (erken durdurma). Ölçekleme (GroupNormalizer) yalnız eğitim setine uydurulur. Hedefi kesimden sonra
  biten barlar eğitime girmez. Karar günde bir, 00:00 UTC barının kapanışında.
* Kabul kuralı, diğer stratejilerle aynı: n≥30 ∧ t≥2.5 ∧ iki yarı>0 ∧ p_şans≤0.02 (işaret-rastgeleleme, K=50).

## Çalıştırma (PowerShell, D:\islemyok\lab)
```
python -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt            # torch CPU ~ 200 MB
python veri.py                             # 10 varlık; önbellek varsa saniyeler, yoksa Binance ~2 dk
python egit.py --hizli                     # duman testi: 3 varlık, 2 kesim, 2 epoch (~10 dk)
python egit.py                             # tam koşu: 10 varlık, ~22 kesim × 8 epoch (saatler, gece bırak)
cd ..\worker
node strategies.js --plans ..\lab\cikti\tft-plans.csv --offline --pages 40 --label tft
```
Süre uzun gelirse: `--egitim-gun 365 --parti-orani 0.5 --epoch 5`. Boru hattını torch'suz denemek: `--model naif`.

## Ölçüm ve yayın
`node strategies.js --plans …` çıktısı skor tablosudur (n, toplamR, t, iki yarı, p_şans, karar). Ajan bunu
`site/strateji-testleri.html` tablosuna "TFT (walk-forward)" satırı olarak ekler; geçerse 8 hafta gölge takibi.

## Bilinen sınırlar
* CPU'da yavaş; GPU yoksa tam koşu saatler sürer. Sonuç tekrarlanabilir (seed 7 + kesim no).
* Kantil toplamı gerçek bir kantil değildir; `yayilim` sütunu yalnız teşhis içindir, karar skora bağlıdır.
* Fonlama girdisi yok (spot mum). Vadeli için `funding.js` çıktısı eklenebilir; önce temel soru cevaplansın.
* `egit.py --model tft` bu sandbox'ta çalıştırılmadı (torch yok); `--model naif` ile boru hattı uçtan uca doğrulandı.
  İlk `--hizli` koşusunda pytorch-forecasting API hatası çıkarsa hata metnini yapıştır, düzeltilir.
