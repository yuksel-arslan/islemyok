# İşlem Yok — gelir planı ve takvim

Sahip: Yüksel · Yürütücü: haftalık Routine ("islemyok-pazarlama-ajani") · Durum: `plan/DURUM.md`
Kural: ajan repodaki her şeyi kendi yapar; kimlik/ödeme/hesap gerektiren adımlarda **tek satır** ister,
materyali hazır bırakır. Yüksel'e haftada en fazla bir soru. Sonucu görmeden karar kuralı değişmez.

## Sıra ve takvim (2026)

| # | Hafta | Adım | Kim | Çıktı |
|---|---|---|---|---|
| 0 | 17 Eyl | Altyapı: plan, materyal, Routine | ajan | bu dosya, `materyal/`, DURUM.md |
| 1 | 21 Eyl | **Borsa referans linki** — kartın altına "yine de açacaksan komisyonu düşük tut" satırı, referans sayfası | ajan kodu hazırlar; **Yüksel 5 dk:** Binance/OKX/Bybit affiliate hesabı, linkleri DURUM.md'ye yazar | `site/sinyal-test.html`, `site/referans.html` |
| 2 | 21 Eyl | **Reklam (AdSense)** — yerleşim hazır, sinyal-grubu reklamı yok | ajan yerleşimi hazırlar; **Yüksel:** AdSense hesabı, `ca-pub` kimliğini DURUM.md'ye | `site/*.html` reklam alanı |
| 3 | 28 Eyl → her hafta | **Haftalık kanal kartı** — 1 kanal tara, sıkı test, anonim kart + X metni | ajan | `plan/kartlar/YYYY-WW.md`, X metni hazır |
| 4 | 28 Eyl | **Kanal raporu (ücretli)** — PDF şablonu, fiyat sayfası, sipariş formu (e-posta) | ajan; **Yüksel:** ödeme yöntemi (IBAN / iyzico) | `site/kanal-raporu.html`, `plan/materyal/rapor-sablon.md` |
| 5 | 12 Eki | **Doğrulanmış kanal rozeti** — kural sayfası, başvuru formu, canlı kart altyapısı | ajan | `site/dogrulanmis.html` |
| 6 | 26 Eki | **Sponsor paketi** — tek sayfa teklif, trafik verisiyle | ajan; **Yüksel:** gönderir | `plan/materyal/sponsor.md` |
| 7 | her ay | Ölçüm: trafik, tıklama, gelir; plana göre ayar | ajan | `DURUM.md` aylık bölüm |

## Ajanın her haftaki döngüsü
1. `plan/DURUM.md` oku: hangi adım açık, Yüksel'den beklenen ne, gelen var mı.
2. Sırası gelen adımın ajan kısmını yap (kod/materyal), test et, PR aç, merge et (site statik; main = yayın).
3. Haftalık kanal kartını üret (adım 3): `npm run kanal -- --discover` ile yeni kanal bul, `--fetch`, `--test --strict`, kartı anonimleştir, `plan/kartlar/` ve `strateji-testleri.html` tablosuna ekle, X metnini hazırla.
4. `DURUM.md` güncelle: yapılan, bekleyen, Yüksel'den istenen **tek satır** (varsa), gelecek hafta.
5. Repo dışı hiçbir şeyi (ödeme, hesap, gönderim) yapmaya çalışma; hazırla ve iste.

## Beklenti (dürüst)
İlk 6 ay: reklam + referans yüzlerce dolar/ay ölçeğinde. Rozet (adım 5) tek başına iş olabilir; koşulu "yendi" diyen ilk kanalın çıkması. Trafik motoru haftalık kart.

## Yapılmayacaklar
Sinyal-grubu reklamı · isimle kanal teşhiri · sonucu gördükten sonra kural değiştirme · ödeyerek rozet.
