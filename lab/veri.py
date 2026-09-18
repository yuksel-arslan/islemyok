"""İşlem Yok laboratuvarı — saatlik mum verisi.

Kaynak sırası: (1) worker derin önbelleği (CACHE_DIR/kl-<sym>-1h-p40.json; hacimli ve taze ise),
(2) Binance herkese açık klines (varsayılan yol; 10 varlık × 40 sayfa ≈ 2 dk) (1000 bar/sayfa, geriye doğru). Çıktı: lab/veri/<sym>-1h.csv
Sütunlar: t (ms, bar AÇILIŞI), o, h, l, c, v.  Node tarafında bar zamanı da açılış zamanıdır; eşleşir.

python veri.py [--pages 40] [--syms BTCUSDT,ETHUSDT] [--cache DIR]
"""
from __future__ import annotations
import argparse, json, os, sys, time, urllib.request
from pathlib import Path
import pandas as pd

ASSETS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","LINKUSDT","AVAXUSDT","LTCUSDT"]
HOSTS = ["https://data-api.binance.vision","https://api.binance.com"]
MS_1H = 3_600_000
KOK = Path(__file__).resolve().parent
VERI = KOK / "veri"

def onbellekten(sym: str, pages: int, cache: str) -> pd.DataFrame | None:
    """Yalnız derin (-p<pages>) önbellek, hacim sütunu varsa ve 3 günden taze ise. Canlı kısa önbellek kullanılmaz."""
    p = Path(cache) / f"kl-{sym}-1h-p{pages}.json"
    if not p.exists(): return None
    rows = json.loads(p.read_text())
    if not rows or "v" not in rows[0]: return None
    if rows[-1]["t"] < time.time() * 1000 - 3 * 86_400_000: return None
    return pd.DataFrame(rows)[["t","o","h","l","c","v"]]

def binance(sym: str, pages: int) -> pd.DataFrame:
    out, end = [], None
    for g in range(pages):
        q = f"/api/v3/klines?symbol={sym}&interval=1h&limit=1000" + (f"&endTime={end}" if end else "")
        data = None
        for h in HOSTS:
            try:
                with urllib.request.urlopen(h + q, timeout=20) as r: data = json.loads(r.read())
                break
            except Exception as e: err = e
        if data is None: raise RuntimeError(f"{sym}: Binance erişilemedi: {err}")
        if not data: break
        out = data + out
        end = data[0][0] - 1
        if len(data) < 1000: break
        time.sleep(0.15)
    df = pd.DataFrame([[int(k[0]),float(k[1]),float(k[2]),float(k[3]),float(k[4]),float(k[5])] for k in out],
                      columns=["t","o","h","l","c","v"])
    return df.drop_duplicates("t").sort_values("t").reset_index(drop=True)

def yukle(sym: str, pages: int = 40, cache: str | None = None, yenile: bool = False) -> pd.DataFrame:
    VERI.mkdir(exist_ok=True)
    f = VERI / f"{sym}-1h.csv"
    if f.exists() and not yenile:
        df = pd.read_csv(f)
        if "v" in df and df.v.notna().any() and len(df) >= pages * 1000 * 0.8: return df
        print(f"{sym}: eski/eksik veri dosyası, yeniden çekiliyor", file=sys.stderr)
    df = onbellekten(sym, pages, cache or os.environ.get("CACHE_DIR", "/tmp/islemyok-cache"))
    if df is None: df = binance(sym, pages)
    # boşluk kontrolü: saatlik ızgara; eksik saat varsa bildir (doldurma, model bilsin)
    eksik = int(((df["t"].diff().dropna() // MS_1H) - 1).clip(lower=0).sum())
    if eksik: print(f"{sym}: {eksik} eksik saat (dolduruLMAdı)", file=sys.stderr)
    df.to_csv(f, index=False)
    return df

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=40)
    ap.add_argument("--syms", default=",".join(ASSETS))
    ap.add_argument("--cache", default=None)
    ap.add_argument("--yenile", action="store_true")
    a = ap.parse_args()
    for s in a.syms.split(","):
        df = yukle(s.strip().upper(), a.pages, a.cache, a.yenile)
        print(f"{s}: {len(df)} bar  {pd.to_datetime(df.t.iloc[0],unit='ms').date()} → {pd.to_datetime(df.t.iloc[-1],unit='ms').date()}")
