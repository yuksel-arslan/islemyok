# Adım 2 — Reklam

Yerleşim: her sayfada içerik sonu, footer üstü tek birim (responsive). Ana sayfada araç altı ikinci birim.
Yasak: kripto sinyal/eğitim reklamı — AdSense'te "Hassas kategoriler → Finans → Kripto" engelle; kripto ağları (Coinzilla vb.) kullanma.
Kod: `<ins class="adsbygoogle" data-ad-client="{ADSENSE_PUB}" data-ad-slot="{SLOT}" data-ad-format="auto" data-full-width-responsive="true">`
Yüksel'den: AdSense hesabı + site onayı (1–2 hafta), ca-pub kimliği DURUM.md'ye. Onay gelene kadar alan boş kalır (yer tutucu yok).

## Uygulama (ajan, 2026-09-17)
Her sayfada `<div data-reklam="icerik">` (footer üstü), `index.html`'de ek `<div data-reklam="arac">` (araç altı).
`site/gelir.js`: `ADSENSE_PUB` doluysa adsbygoogle script'ini yükler; `ADSENSE_SLOT_<AD>` doluysa o alana responsive
`<ins>` çizer, boşsa yalnız Auto ads. Kimlik boşken alan 0 yükseklik, yer tutucu yok. Değerler `npm run yapilandir` ile.
