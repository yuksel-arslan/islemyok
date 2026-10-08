# İşlem Yok

> **ARŞİV — 2026-10-08 itibarıyla kapatıldı.** Proje sonlandırıldı; odak traderpath.io.
> Haftalık ajan (`ajan.yml`) kaldırıldı. Telegram worker repo dışında durdurulacak (aşağıdaki liste).
> Kod ve bulgular başvuru için burada duruyor; yeni geliştirme yapılmaz.
>
> **Ana bulgu (3 ay):** test edilen model, 10 kural tabanlı strateji ve 5 Telegram sinyal kanalının
> hiçbiri gerçek fiyatlarla, komisyon sonrası yazı-turayı yenemedi. Ayrıntı: `site/strateji-testleri.html`.
>
> **Repo dışında kapatılacaklar (sahip):** Railway `islemyok-worker` servisi · Neon veritabanı ·
> Telegram `@islemyok` kanalı (son mesajdan sonra arşiv) · Binance referans / AdSense hesabı ·
> site (Cloudflare Pages `islemyok-site`) için karar: kaldır ya da yönlendir.

islemyok.com'un tamamı: tarayıcıda çalışan araç ve onu her sabah Telegram'a
taşıyan worker.

| klasör | ne | nereye çıkar |
|-|-|-|
| `site/` | `index.html` — modelin ve arayüzün tek kaynağı | Cloudflare Pages — main'e merge'de otomatik (`.github/workflows/yayin.yml`); elle: `npx wrangler pages deploy site` |
| `worker/` | günlük tarama + `@islemyok` kanalına yayın | Railway (`cd worker && railway up`) |

## Tek kaynak kuralı

Model kodu yalnız `site/index.html` içinde yazılır. Worker onu kopyalamaz,
**dilimler**: `worker/engine_core.js` üretilmiş bir dosyadır, elle düzenlenmez.

```
cd worker && node dilimle.js      # site/index.html -> engine_core.js
```

`index.html`'deki model değiştiğinde bu komut çalıştırılmazsa kanal, sitenin
terk ettiği bir modelle yayın yapmaya devam eder — 7 Eylül'de tam olarak bu
oldu (bkz. `worker/WORKER.md`).
