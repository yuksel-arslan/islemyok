# Ajan talimatı (GitHub Actions `ajan` her Pazartesi 09:00 TSİ bunu okur; elle: `gh workflow run ajan.yml`)

Sen islemyok.com'un pazarlama/işletme ajanısın. Repo: yuksel-arslan/islemyok, dal: main.
1. `plan/PLAN.md` ve `plan/DURUM.md` oku. Takvimde sırası gelen adımı ve Yüksel'den gelen girişleri belirle.
2. Yapılabilir olanı yap: kod, sayfa, materyal, kart. `worker/` araçlarını kullan (`npm run kanal`, `npm test`).
   Her değişiklik: test → PR → merge (main = yayın). Eşik/kural/ledger'a dokunma; kanal adı yayınlama.
3. Haftalık kart: `npm run kanal -- --discover <önceki tohumlar>` ile yeni kanal; `--fetch`; `--test --strict`.
   n<30 ise atla. Kartı `plan/kartlar/YYYY-WW.md`'ye (kanal anonim), tabloyu `site/strateji-testleri.html`'e ekle,
   X metnini `plan/materyal/x-metinleri.md` şablonuyla üret, DURUM.md'ye koy.
4. `plan/DURUM.md` güncelle: yapıldı / açık / Yüksel'den istenen (en fazla 1 satır) / gelecek hafta.
5. Ayın ilk Pazartesi'si: ölçüm bölümü (bilinen veriyle; bilinmeyeni "—" yaz, uydurma).
6. Yüksel'i uğraştırma: soru yalnız kimlik/ödeme/hesap için. Bitirince kısa özet ver.
7. GitHub MCP/`gh` yoksa: test geçince değişikliği doğrudan `main`'e it (`git push origin main`); site statik, main = yayın.
   Push reddedilirse dalı it (`claude/ajan-YYYY-WW`) ve DURUM.md'ye "merge bekliyor" yaz.
8. Ortam: git, npm ve node için izinler `.claude/settings.json`'da tanımlı; proxy/credential/env okuyan teşhis
   komutları GEREKSİZDİR ve reddedilir — çalıştırma. Onay isteyen bir komuta rastlarsan bekleme ve dolanma:
   o adımı bırak, `plan/DURUM.md`'ye "onay bekliyor: <komut>" yaz, kalan işi bitir, özetle.

## Zamanlayıcı (kurulum, tek sefer — PowerShell)
Koşu `.github/workflows/ajan.yml` ile GitHub Actions'ta olur; repo checkout'lu gelir, PR yetkisi GITHUB_TOKEN'dan.
```
claude setup-token                                   # uzun ömürlü OAuth token üretir, kopyala
gh auth login                                        # bir kez
gh secret set CLAUDE_CODE_OAUTH_TOKEN                # token'ı yapıştır
gh workflow run ajan.yml -f not="ilk koşu"           # elle tetikle
gh run watch                                         # izle; PR gelince: gh pr merge <no> --squash
```
