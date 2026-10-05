# İşlem Yok — Kongre Takibi

Güncelleme: 2026-10-05 · Durum: v1 — kod ve birim testleri hazır; **gerçek veriyle ilk backtest henüz koşmadı.**

ABD Kongre üyelerinin STOCK Act kapsamında bildirdiği hisse **alışlarını** izler ve aynı yönde işlem planı
üretir. Planlar `@islemyok` Telegram kanalına gider. Worker'ın parçasıdır (`bot.js` her sabah çağırır, `KONGRE=1`).

## Kural (backtest'ten önce sabitlendi, sonuca göre değiştirilmez)

| | |
|-|-|
| Olay | Hisse (`[ST]` / "Stock") **alışı**, tutarın alt sınırı ≥ $15.001. Satışlar, opsiyonlar, fonlar ve tahviller hariç. |
| Birleştirme | Aynı gün aynı hisse için verilen bildirimler tek olay sayılır; üyeler listelenir. |
| Giriş | **Bildirim** tarihinden sonraki ilk ABD açılışı. İşlem tarihi kullanılmaz (look-ahead olurdu). |
| Çıkış | 60. işlem gününün kapanışı (~3 ay). Stop yok. |
| Maliyet | Gidiş-dönüş 10bp. |
| Kıyas | Aynı pencerede SPY (temettü/bölünme düzeltmeli). |
| Tekrar | Aynı hisse açıkken yeni olay açılmaz (backtest ve canlı aynı). |
| Karar | n≥30 ∧ t≥2,5 (giriş ayına göre kümeli) ∧ iki yarı da > 0 ∧ p_şans ≤ 0,02 → **GEÇTİ** |
| Şans kontrolü | Maymun testi: aynı giriş/çıkış tarihleri, hisse rastgele seçilir (Kongre'nin işlem yaptığı evrenden), K=200. |

**Gecikme neden önemli:** üyeler işlemi 45 güne kadar geç bildirebilir. "Kongre piyasayı yener" iddialarının
çoğu işlem tarihine göre hesaplanır, ama o tarihte bu bilgiyle işlem yapmak mümkün değildir. STOCK Act sonrası
akademik çalışmalar, bildirim tarihinden yapılan işlemde ortalama kenar bulmuyor. Bu yüzden karar yalnız backtest'e
bırakılır. Her canlı mesaj, backtest sonucunu (`kongre-sonuc.json`) tek satırla birlikte yazar.

## Veri (resmi, ücretsiz)

* **Meclis:** `disclosures-clerk.house.gov/public_disc/financial-pdfs/<YIL>FD.zip` (XML endeksi; `FilingType=P` PTR'dir).
  PTR PDF'i: `ptr-pdfs/<YIL>/<DocID>.pdf`. Metin `pdfjs-dist` ile çıkarılır. Çapa:
  `(TICKER) [XX] <P|S|S (partial)|E> <işlem> <bildirim> <tutar>`.
  Kağıt bildirimler (DocID `20xxxxxx` dışındakiler, taranmış görüntü) atlanır.
* **Senato:** `efdsearch.senate.gov` — kullanım şartı onayı (CSRF), `/search/report/data/` (report_types=[11] PTR),
  elektronik PTR sayfasındaki HTML tablosu. Kağıt PTR'ler atlanır.
* **Fiyat:** Yahoo chart API (düzeltilmiş), olmazsa Stooq CSV.
* **Claude/LLM:** kullanılmıyor. Anthropic'in ayrı bir finans tahmin modeli yok. Kağıt PTR'leri okumak için
  ileride Claude API eklenebilir (şu an kapsam dışı; kaç tanesinin atlandığı sağlık raporunda yazılır).
* Önbellek: `CACHE_DIR/kongre/` (endeksler, ayrıştırılmış belge başına JSON, `px-<TICKER>.json`, `tx.json`).

**Doğrulanmamış:** Gerçek PDF/HTML düzenleri bu geliştirme ortamından indirilemedi (ağ kapalı). Ayrıştırıcılar
belgelenmiş formata göre yazıldı ve örnek veriyle test edildi. `--fetch`, metni olan PTR'lerin %40'ından fazlasından
işlem çıkmazsa **çıkış kodu 4** ile durur, sessizce boş veriyle devam etmez.

## Dosyalar

* `kongre_veri.js` — Meclis/Senato indirme + ayrıştırma, `fetchAll({fromYear,since})`, sağlık sayaçları.
* `kongre_fiyat.js` — günlük fiyat (`bars`), `firstAfter` / `lastOnOrBefore`.
* `kongre.js` — `KURAL`, `olaylar`, `oynat`, `maymun`, `rapor`, `sonucOzet`, CLI.
* `kongre_canli.js` — günlük canlı koşu (`kongreGunluk`), `ilerlet` (backtest `oynat` ile birebir aynı; testle kilitli).
* `kongre.test.js` — ayrıştırıcılar, gerçek PDF baytı üzerinden uçtan uca test, look-ahead, canlı = backtest.
* `kongre-sonuc.json` — son backtest sonucu (Actions üretir ve commit'ler).
* `../.github/workflows/kongre.yml` — backtest iş akışı (elle tetiklenir + ayda bir otomatik).
* Neon tablosu `kongre`: durumlar `wait` (giriş bekliyor) → `open` → `closed`. Satır silinmez.

## Komutlar

```powershell
cd D:\islemyok\worker
npm run kongre -- --fetch --from 2019        # indir + ayrıştır + sağlık raporu (ilk koşu saatler sürebilir)
npm run kongre -- --backtest --from 2019 --json kongre-sonuc.json --csv k.csv [--controls 200]
npm run kongre -- --now --days 7             # son bildirimlerden çıkan olaylar (yayın yok)
node --test kongre.test.js
```

GitHub: Actions → **kongre** → Run workflow. Özet adım çıktısında, CSV ve rapor artifact'ta.
`workflow_dispatch` yalnız iş akışı dosyası varsayılan dalda (main) olduğunda görünür.

## Canlı (Railway)

| Değişken | Zorunlu | Not |
|-|-|-|
| `KONGRE` | ✓ | `1` → her günlük koşuda kripto taramasından sonra çalışır. |
| `DATABASE_URL` | ✓ | Yoksa Kongre adımı atlanır (aynı bildirim her gün yeniden duyurulurdu). |
| `TELEGRAM_*`, `CACHE_DIR`, `DRY_RUN` | | worker ile ortak (`WORKER.md`). |

Akış: (1) bekleyen planlara giriş fiyatı yazılır, 60 günü dolanlar kapatılır → tek "kapandı" mesajı
(getiri, SPY, fark). (2) Son 3 günde bildirilmiş yeni alışlar → tek mesaj (üye, işlem/bildirim tarihi, gecikme,
tutar, plan, backtest satırı). Hata olursa kripto yayını etkilenmez.

## Bilinen sınırlar

* Kağıt bildirimler okunmuyor.
* Yalnız alış yönü; açığa satış sinyali üretilmez.
* Bölünme/temettü düzeltmesi Yahoo'ya bağlı. Borsadan çıkmış hisselerin fiyatı çoğu zaman bulunamaz
  (survivorship). Bulunamayanların sayısı raporda `fiyatYok` alanında yazılır.
* Senato eFD veri merkezi IP'lerini engelleyebilir; engellerse rapor `senateDocs=0` gösterir, Meclis verisiyle devam edilir.
