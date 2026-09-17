# Adım 4 — Kanal raporu (ücretli, tek seferlik)

Fiyat: 300 TL (ilk 20 sipariş 200 TL). Teslim: 48 saat, PDF, e-posta.
Sipariş: site/kanal-raporu.html — form: kanal adı/t.me linki, e-posta; ödeme: IBAN (başlangıç) / iyzico (sonra).

## PDF içeriği
1. Kapak: kanal, tarih aralığı, n, hüküm (yendi / yenemedi / yetersiz veri)
2. Kart: kanal TL, maymun TL + bant, BTC al-tut, isabet, çekilme, t, p
3. Cömert → sıkı farkı ve nedenleri (dolmayan giriş, yarı kapatma, silinmiş mesaj payı)
4. Sinyal listesi (tarih, varlık, yön, sonuç, R)
5. Yöntem (1 sayfa) + sınırlar (silinen sinyaller görünmez; geçmiş ≠ gelecek)
Üretim: `npm run kanal -- --fetch X --pages 40 && npm run kanal -- --test X --strict --csv rapor-X.csv` → şablona dök.
