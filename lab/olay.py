"""İşlem Yok laboratuvarı — olay deneyi: H1 (zamanlama) ve H2 (yön × pozisyonlanma). Tek koşu.

H1  "Takvimli makro olay (FOMC, TÜFE) sonrası 24 saatte mutlak getiri, sıradan 24 saatlerden büyüktür."
    Ölçü: olay saatinden itibaren 24 barlık |log getiri| ortalaması (10 varlık, saatlik) / plasebo ortalaması.
    Plasebo: aynı saat diliminde, olayların ±2 gününden uzak rastgele günler; K=2000 çekiliş → p = plasebo ≥ gerçek oranı.
    Kabul (önceden): FOMC+TÜFE havuzu p ≤ 0.01 ve oran ≥ 1.3. Ayrıca "rüzgâr ne zaman": pencere içinde en büyük saatlik
    hareketin olaydan kaç saat sonra geldiğinin medyanı.

H2  "Olay öncesi kalabalık pozisyonlanma, olay sonrası yönü öngörür (kalabalığın tersine)."
    Pozisyonlanma: olaydan önceki son 3 fonlama ödemesinin ortalaması, önceki 90 günün dağılımında yüzdelik.
    ≥ %90 → kalabalık long → SHORT; ≤ %10 → kalabalık short → LONG. Arada → işlem yok.
    Plan: karar olay saatinden önceki barın kapanışında; giriş = o kapanış; hz=24 bar; rm=1.5; stop = vol·√hz (mkPlan).
    Kontrol: aynı pozisyonlanma kuralı, olay olmayan rastgele saatlerde (eşit sayıda) → "olay mı, pozisyonlanma mı?"
    Kabul (önceden): olay-h2.csv, strategies.js süzgecini geçer (n≥30 ∧ t≥2.5 ∧ iki yarı>0 ∧ p_şans≤0.02) VE kontrol geçmez.
    Kontrol de geçiyorsa bulgu "pozisyonlanma"dır, olaya özgü değildir; ikisi de geçmiyorsa H2 reddedilir.

Çalıştırma (PowerShell, D:\\islemyok\\lab, .venv açık; saatlik veri zaten veri/ altında):
  python olay.py                       # fonlama çeker (10 varlık, ~30 sn), H1 raporu, H2 plan CSV'leri
  cd ..\\worker
  node strategies.js --plans ..\\lab\\cikti\\olay-h2.csv --pages 40 --label olay-h2
  node strategies.js --plans ..\\lab\\cikti\\olay-h2-kontrol.csv --pages 40 --label olay-kontrol
Takvim: olaylar.csv (FOMC 2022–2026 kesin; TÜFE 2022–2025/09 kesin, sonrası "dogrulanmadi" işaretli; yanlış tarih etkiyi
şişirmez, seyreltir). Fonlama dahil değil (R'ye eklenmez); 24 saatte ≤ %0.1, stop mesafesine göre ihmal edilebilir.
"""
from __future__ import annotations
import argparse, json, sys, time, urllib.request
from pathlib import Path
import numpy as np
import pandas as pd
from veri import ASSETS, yukle, MS_1H

KOK = Path(__file__).resolve().parent
VERI, CIKTI = KOK / "veri", KOK / "cikti"
H = 24

# ---------------- veri ----------------
def fonlama(sym: str, yenile: bool = False) -> pd.DataFrame:
    """fapi fundingRate geçmişi → veri/<sym>-fund.csv (t ms, r oran). 8 saatte bir."""
    f = VERI / f"{sym}-fund.csv"
    if f.exists() and not yenile: return pd.read_csv(f)
    out, start = [], 1_600_000_000_000
    while True:
        u = f"https://fapi.binance.com/fapi/v1/fundingRate?symbol={sym}&startTime={start}&limit=1000"
        with urllib.request.urlopen(u, timeout=20) as r: d = json.loads(r.read())
        if not d: break
        out += [(int(x["fundingTime"]), float(x["fundingRate"])) for x in d]
        if len(d) < 1000: break
        start = out[-1][0] + 1; time.sleep(0.1)
    df = pd.DataFrame(out, columns=["t", "r"]).drop_duplicates("t").sort_values("t").reset_index(drop=True)
    df.to_csv(f, index=False); return df

def olaylar(p: Path) -> pd.DataFrame:
    e = pd.read_csv(p, dtype=str).fillna("")
    e["t"] = [int(pd.Timestamp(f"{d} {s}", tz="UTC").timestamp() * 1000) for d, s in zip(e.tarih, e.saat_utc)]
    e["bar"] = (e.t // MS_1H) * MS_1H            # olayın düştüğü saatlik barın açılışı
    return e

# ---------------- H1 ----------------
def h1_test(bars: dict[str, pd.DataFrame], ev: pd.DataFrame, K: int = 2000, seed: int = 7) -> dict:
    rng = np.random.default_rng(seed)
    idx = {s: dict(zip(b.t, range(len(b)))) for s, b in bars.items()}
    lc = {s: np.log(b.c.values) for s, b in bars.items()}
    def pencere(s, bar):           # olay barının açılışından 24 bar: |log(c[i+23]/c[i-1])|, ayrıca en büyük saatlik hareketin ofseti
        i = idx[s].get(bar)
        if i is None or i < 1 or i + H > len(lc[s]): return None
        seg = lc[s][i - 1:i + H]; r = np.abs(seg[-1] - seg[0]); saat = np.abs(np.diff(seg))
        return r, int(np.argmax(saat))
    def havuz(barlar):
        vals, ofs = [], []
        for b in barlar:
            for s in bars:
                p = pencere(s, b)
                if p: vals.append(p[0]); ofs.append(p[1])
        return np.array(vals), np.array(ofs)
    out = {}
    tum_ev = set(ev.bar)
    yasak = set(); [yasak.update(range(b - 2 * 24 * MS_1H, b + 3 * 24 * MS_1H, MS_1H)) for b in tum_ev]
    for tur, g in list(ev.groupby("tur")) + [("FOMC+CPI", ev)]:
        gercek, ofs = havuz(list(g.bar))
        if not len(gercek): continue
        # plasebo: aynı saat-of-day dağılımı, olay dışı günler, aynı olay sayısı, K tekrar
        saatler = [(b // MS_1H) % 24 for b in g.bar]
        t_min = max(b.t.min() for b in bars.values()) + 48 * MS_1H; t_max = min(b.t.max() for b in bars.values()) - (H + 2) * MS_1H
        gunler = np.arange((t_min // (24 * MS_1H)) * 24 * MS_1H, t_max, 24 * MS_1H)
        aday = [d for d in gunler if d not in yasak]
        plasebo = []
        for _ in range(K):
            gn = rng.choice(aday, size=len(saatler), replace=True)
            v, _o = havuz([int(d + h * MS_1H) for d, h in zip(gn, saatler)])
            plasebo.append(v.mean() if len(v) else np.nan)
        plasebo = np.array(plasebo); plasebo = plasebo[~np.isnan(plasebo)]
        oran = gercek.mean() / plasebo.mean()
        p = float((plasebo >= gercek.mean()).mean())
        out[tur] = {"olay": int(len(g)), "pencere": int(len(gercek)), "gercek_ort": float(gercek.mean()), "plasebo_ort": float(plasebo.mean()),
                    "oran": float(oran), "p": p, "tepe_saat_medyan": float(np.median(ofs)), "tepe_saat_q75": float(np.quantile(ofs, .75)),
                    "gecti": bool(p <= 0.01 and oran >= 1.3)}
    return out

def h1_rapor(r: dict) -> str:
    L = ["H1 — olay sonrası 24 saat |getiri| / plasebo  (10 varlık, saatlik; K plasebo çekilişi; kabul: p≤0.01 ∧ oran≥1.3)",
         "tür        olay  pencere  gerçek%  plasebo%  oran   p      tepe saat (medyan/q75)  karar"]
    for k, v in r.items():
        L.append(f"{k:<10} {v['olay']:>4}  {v['pencere']:>6}  {v['gercek_ort']*100:6.2f}  {v['plasebo_ort']*100:7.2f}  {v['oran']:5.2f}  {v['p']:.3f}  "
                 f"{v['tepe_saat_medyan']:.0f} / {v['tepe_saat_q75']:.0f}                 {'GEÇTİ' if v['gecti'] else 'kaldı'}")
    L.append("tepe saat: pencere içinde en büyük saatlik hareketin olaydan kaç saat sonra geldiği (0 = olay saati).")
    return "\n".join(L)

# ---------------- H2 ----------------
def pozisyon_yuzdelik(fund: pd.DataFrame, t: int, n_son: int = 3, gun: int = 90) -> float | None:
    """t'den önceki son n ödemenin ortalaması, önceki `gun` günün 3'lü ortalama dağılımında yüzdelik (0–1)."""
    f = fund[fund.t < t]
    if len(f) < gun * 3 // 2: return None
    r = f.r.values; ort3 = pd.Series(r).rolling(n_son).mean().values
    ref = ort3[-(gun * 3):-1]; ref = ref[~np.isnan(ref)]
    son = ort3[-1]
    if np.isnan(son) or len(ref) < 30: return None
    return float((ref < son).mean())

def h2_planlar(bars: dict, funds: dict, barlar: list[int], ust=0.9, alt=0.1, hz=H, rm=1.5, etiket="olay") -> pd.DataFrame:
    idx = {s: set(b.t) for s, b in bars.items()}
    rows = []
    for bar in barlar:
        t0 = bar - MS_1H                           # karar: olay barından önceki barın kapanışı
        for s in bars:
            if t0 not in idx[s] or s not in funds: continue
            p = pozisyon_yuzdelik(funds[s], bar)
            if p is None: continue
            side = -1 if p >= ust else 1 if p <= alt else 0
            if side: rows.append({"t0": t0, "sym": s, "side": side, "hz": hz, "rm": rm, "poz": round(p, 3), "kaynak": etiket})
    return pd.DataFrame(rows, columns=["t0", "sym", "side", "hz", "rm", "poz", "kaynak"])

def kontrol_barlari(bars: dict, ev_bar: list[int], n: int, seed: int = 11) -> list[int]:
    """Olay dışı rastgele saatler (olayların ±2 gününden uzak), olaylarla aynı saat-of-day dağılımı."""
    rng = np.random.default_rng(seed)
    yasak = set(); [yasak.update(range(b - 2 * 24 * MS_1H, b + 3 * 24 * MS_1H, MS_1H)) for b in ev_bar]
    t_min = max(b.t.min() for b in bars.values()) + 100 * 24 * MS_1H; t_max = min(b.t.max() for b in bars.values()) - 48 * MS_1H
    gunler = [d for d in range((t_min // (24 * MS_1H)) * 24 * MS_1H, t_max, 24 * MS_1H) if d not in yasak]
    saatler = [(b // MS_1H) % 24 for b in ev_bar]
    return sorted(int(rng.choice(gunler) + rng.choice(saatler) * MS_1H) for _ in range(n))

# ---------------- koşu ----------------
def calistir(a):
    log = lambda m: print(m, file=sys.stderr, flush=True)
    CIKTI.mkdir(exist_ok=True)
    syms = a.syms.split(",")
    bars = {s: yukle(s, a.pages) for s in syms}
    funds = {}
    for s in syms:
        try: funds[s] = fonlama(s, a.yenile)
        except Exception as e: log(f"{s}: fonlama yok ({e})")
    ev = olaylar(KOK / a.takvim)
    t_min = max(b.t.min() for b in bars.values()); t_max = min(b.t.max() for b in bars.values())
    ev = ev[(ev.bar > t_min + 48 * MS_1H) & (ev.bar < t_max - H * MS_1H)].reset_index(drop=True)
    log(f"veri: {len(bars)} varlık, {pd.Timestamp(t_min, unit='ms').date()} → {pd.Timestamp(t_max, unit='ms').date()}; olay {len(ev)} "
        f"({', '.join(f'{k} {v}' for k, v in ev.tur.value_counts().items())})")
    r1 = h1_test(bars, ev, a.K)
    rap = h1_rapor(r1); print(rap); (CIKTI / "olay-h1.txt").write_text(rap, encoding="utf-8")
    (CIKTI / "olay-h1.json").write_text(json.dumps(r1, indent=1))
    ev_bar = list(ev.bar)
    p_ev = h2_planlar(bars, funds, ev_bar, a.ust, a.alt, etiket="olay")
    p_ko = h2_planlar(bars, funds, kontrol_barlari(bars, ev_bar, len(ev_bar)), a.ust, a.alt, etiket="kontrol")
    p_ev.to_csv(CIKTI / "olay-h2.csv", index=False); p_ko.to_csv(CIKTI / "olay-h2-kontrol.csv", index=False)
    log(f"H2: olay planı {len(p_ev)} ({(p_ev.side==1).sum()} long / {(p_ev.side==-1).sum()} short), kontrol planı {len(p_ko)}")
    log("değerlendir (worker/): node strategies.js --plans ..\\lab\\cikti\\olay-h2.csv --pages 40 --label olay-h2 ; "
        "node strategies.js --plans ..\\lab\\cikti\\olay-h2-kontrol.csv --pages 40 --label olay-kontrol")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--syms", default=",".join(ASSETS)); ap.add_argument("--pages", type=int, default=40)
    ap.add_argument("--takvim", default="olaylar.csv"); ap.add_argument("--K", type=int, default=2000)
    ap.add_argument("--ust", type=float, default=0.9); ap.add_argument("--alt", type=float, default=0.1)
    ap.add_argument("--yenile", action="store_true")
    calistir(ap.parse_args())
