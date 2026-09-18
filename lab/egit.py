"""İşlem Yok laboratuvarı — TFT (Temporal Fusion Transformer) walk-forward yön tahmini.

Soru: "Model geçmiş desenleri öğrenince ileriyi tahmin edebilir mi?"  Cevap ölçülür, tartışılmaz.

Kurgu (önceden yazıldı, sonra değişmez):
  * Hedef: bar getirisi / önceki barın nedensel EWMA vol'u (y_t = r_t / vol_{t-1}). Karar anında y_t bilinir.
  * Model, karar barından sonraki H barın y'sini (kantil) tahmin eder. skor = Σ q50 / √H.
  * skor ≥ +eşik → long, ≤ −eşik → short; plan ufku H bar, hedef rm·stop (diğer stratejilerle aynı mkPlan).
  * Walk-forward: her `adim-gun` günde bir yeniden eğit; eğitim yalnız kesim tarihinden ÖNCEKİ barlarla,
    ölçekleme yalnız eğitim penceresinden (GroupNormalizer eğitim setine uydurulur), doğrulama son 30 gün.
    Kesimden sonraki pencerede karar günde bir (00:00 UTC barı kapanışında).
  * Kabul: worker/strategies.js --plans ile aynı süzgeç: n≥30 ∧ t≥2.5 ∧ iki yarı>0 ∧ p_şans≤0.02.

Çalıştırma (senin makinende, CPU):
  python veri.py                                   # 10 varlık, ~4.5 yıl saatlik
  python egit.py --hizli                           # duman testi (~10 dk): 3 varlık, 2 kesim, 2 epoch
  python egit.py                                   # tam koşu (saatler); çıktı lab/cikti/tft-plans.csv
  cd ../worker && node strategies.js --plans ../lab/cikti/tft-plans.csv --offline --pages 40 --label tft

`--model naif` torch gerektirmez: aynı boru hattı, model yerine 5 günlük momentum işareti (boru hattı testi).
"""
from __future__ import annotations
import argparse, json, math, sys, time
from pathlib import Path
import numpy as np
import pandas as pd
from veri import ASSETS, yukle, MS_1H

KOK = Path(__file__).resolve().parent
CIKTI = KOK / "cikti"
GUN = 24

# ---------------- özellikler (hepsi nedensel: t'deki değer yalnız ≤t barlarına bağlı) ----------------
def ozellikler(df: pd.DataFrame, sym: str, lam: float = 0.97) -> pd.DataFrame:
    d = df.copy()
    d["sym"] = sym
    d["r1"] = np.log(d.c / d.c.shift(1))
    v2 = d.r1.pow(2).ewm(alpha=1 - lam, adjust=False).mean()
    d["vol"] = np.sqrt(v2)
    volp = d.vol.shift(1)                        # karar anında bilinen vol (önceki bar)
    d["y"] = d.r1 / volp                          # hedef: bu barın normalize getirisi
    for L in (6, 24, 120):
        d[f"z{L}"] = np.log(d.c / d.c.shift(L)) / (volp * math.sqrt(L))
    d["aralik"] = (d.h - d.l) / d.c
    if d.v.notna().sum() > 200:
        lv = np.log(d.v.replace(0, np.nan))
        d["hacimz"] = (lv - lv.rolling(168, min_periods=48).mean()) / lv.rolling(168, min_periods=48).std()
    else:
        print(f"{sym}: hacim yok, hacimz=0", file=sys.stderr); d["hacimz"] = 0.0
    ts = pd.to_datetime(d.t, unit="ms", utc=True)
    d["saat"] = ts.dt.hour.astype(str)
    d["gun"] = ts.dt.dayofweek.astype(str)
    d["time_idx"] = ((d.t - d.t.min()) // MS_1H).astype(int)
    d = d.replace([np.inf, -np.inf], np.nan)
    d["hacimz"] = d.hacimz.fillna(0.0)
    d = d.dropna(subset=["y", "vol", "z120"]).reset_index(drop=True)
    d["hacimz"] = d.hacimz.clip(-5, 5); d["y"] = d.y.clip(-8, 8)
    for L in (6, 24, 120): d[f"z{L}"] = d[f"z{L}"].clip(-8, 8)
    return d

def veri_seti(syms, pages, cache):
    parcalar = []
    for s in syms:
        df = yukle(s, pages, cache)
        parcalar.append(ozellikler(df, s))
    d = pd.concat(parcalar, ignore_index=True)
    t0 = d.t.min()
    d["time_idx"] = ((d.t - t0) // MS_1H).astype(int)   # ortak ızgara
    return d

# ---------------- modeller ----------------
def skor_naif(d_pred: pd.DataFrame, H: int, **_) -> pd.DataFrame:
    """torch'suz boru hattı testi: 5 günlük momentum işareti × büyüklük."""
    out = d_pred[["sym", "t", "time_idx", "z120"]].copy()
    out["skor"] = out.z120 / 2.0
    return out[["sym", "t", "time_idx", "skor"]]

def skor_tft(d_train: pd.DataFrame, d_pred: pd.DataFrame, H: int, ENC: int, epochs: int,
             parti_orani: float, val_gun: int, seed: int, log) -> pd.DataFrame:
    import torch, lightning.pytorch as pl
    from lightning.pytorch.callbacks import EarlyStopping
    from pytorch_forecasting import TimeSeriesDataSet, TemporalFusionTransformer
    from pytorch_forecasting.data import GroupNormalizer
    from pytorch_forecasting.metrics import QuantileLoss
    torch.manual_seed(seed); np.random.seed(seed); torch.set_num_threads(max(1, torch.get_num_threads()))
    kes_tr = d_train.time_idx.max() - val_gun * GUN
    ortak = dict(time_idx="time_idx", target="y", group_ids=["sym"],
                 max_encoder_length=ENC, min_encoder_length=ENC // 2,
                 max_prediction_length=H, min_prediction_length=H,
                 static_categoricals=["sym"],
                 time_varying_known_reals=["time_idx"], time_varying_known_categoricals=["saat", "gun"],
                 time_varying_unknown_reals=["y", "r1", "vol", "z6", "z24", "z120", "aralik", "hacimz"],
                 target_normalizer=GroupNormalizer(groups=["sym"]),
                 allow_missing_timesteps=True, add_relative_time_idx=True, add_target_scales=False)
    ds_tr = TimeSeriesDataSet(d_train[d_train.time_idx <= kes_tr], **ortak)
    ds_va = TimeSeriesDataSet.from_dataset(ds_tr, d_train, min_prediction_idx=kes_tr + 1, stop_randomization=True)
    dl_tr = ds_tr.to_dataloader(train=True, batch_size=256, num_workers=0)
    dl_va = ds_va.to_dataloader(train=False, batch_size=512, num_workers=0)
    model = TemporalFusionTransformer.from_dataset(
        ds_tr, learning_rate=3e-3, hidden_size=16, attention_head_size=1, dropout=0.1,
        hidden_continuous_size=8, loss=QuantileLoss([0.1, 0.5, 0.9]), log_interval=-1, reduce_on_plateau_patience=2)
    tr = pl.Trainer(max_epochs=epochs, accelerator="cpu", gradient_clip_val=0.1, logger=False,
                    enable_checkpointing=False, enable_progress_bar=False, enable_model_summary=False,
                    limit_train_batches=parti_orani, callbacks=[EarlyStopping("val_loss", patience=2, mode="min")])
    tr.fit(model, dl_tr, dl_va)
    vl = float(tr.callback_metrics.get("val_loss", float("nan")))
    log(f"  eğitim {len(ds_tr)} örnek, doğrulama {len(ds_va)}, val_loss {vl:.4f}, epoch {tr.current_epoch}")
    # tahmin: kesimden sonraki pencere; kodlayıcı geçmişi için d_pred kesimden ENC bar önce başlar
    ilk = d_pred.attrs["ilk_karar_idx"]
    ds_pr = TimeSeriesDataSet.from_dataset(ds_tr, d_pred, min_prediction_idx=ilk + 1, stop_randomization=True)
    dl_pr = ds_pr.to_dataloader(train=False, batch_size=512, num_workers=0)
    pred = model.predict(dl_pr, mode="quantiles", return_x=True, trainer_kwargs=dict(accelerator="cpu", logger=False, enable_progress_bar=False))
    q = pred.output.detach().cpu().numpy()                      # (n, H, 3)
    dec = pred.x["decoder_time_idx"].detach().cpu().numpy()     # (n, H)
    grp = pred.x["groups"].detach().cpu().numpy()[:, 0]
    sym_ad = ds_tr.get_parameters()["categorical_encoders"]["sym"].inverse_transform(grp)
    skor = q[:, :, 1].sum(axis=1) / math.sqrt(H)
    yay = (q[:, :, 2] - q[:, :, 0]).sum(axis=1) / math.sqrt(H)
    out = pd.DataFrame({"sym": sym_ad, "time_idx": dec[:, 0] - 1, "skor": skor, "yayilim": yay})
    out = out.merge(d_pred[["sym", "time_idx", "t"]], on=["sym", "time_idx"], how="inner")
    return out[["sym", "t", "time_idx", "skor", "yayilim"]]

# ---------------- walk-forward ----------------
def calistir(a):
    log = lambda m: print(m, file=sys.stderr, flush=True)
    CIKTI.mkdir(exist_ok=True)
    syms = a.syms.split(",")
    d = veri_seti(syms, a.pages, a.cache)
    H, ENC = a.ufuk, a.kodlayici
    t_ilk, t_son = d.t.min(), d.t.max()
    adim = a.adim_gun * GUN * MS_1H
    kesim = t_ilk + a.isinma_gun * GUN * MS_1H
    if a.baslangic: kesim = max(kesim, int(pd.Timestamp(a.baslangic, tz="UTC").timestamp() * 1000))
    kararlar, kayit = [], []
    fold = 0
    gun = lambda ms: pd.to_datetime(ms, unit="ms").date()
    log(f"veri: {len(d)} satır, {gun(t_ilk)} → {gun(t_son)}; ilk kesim {gun(kesim)}")
    if kesim + H * MS_1H >= t_son:
        log("UYARI: veri, ısınma süresinden kısa; hiç kesim yok. `python veri.py --yenile` (40 sayfa ≈ 4.5 yıl) ya da --isinma-gun küçült.")
    while kesim + H * MS_1H < t_son:
        fold += 1
        if a.max_kesim and fold > a.max_kesim: break
        egit_bas = kesim - a.egitim_gun * GUN * MS_1H if a.egitim_gun else t_ilk
        # eğitim: hedefi kesimden önce tamamen bilinen barlar (t + H bar ≤ kesim)
        d_tr = d[(d.t >= egit_bas) & (d.t + H * MS_1H <= kesim)].copy()
        # tahmin penceresi: kodlayıcı geçmişi + kesimden sonraki adım + H bar (decoder satırları için)
        pen_son = min(kesim + adim, t_son)
        d_pr = d[(d.t >= kesim - (ENC + 5) * MS_1H) & (d.t <= pen_son + H * MS_1H)].copy()
        d_pr.attrs["ilk_karar_idx"] = int(d[(d.t > kesim)].time_idx.min()) if (d.t > kesim).any() else 0
        T = time.time()
        log(f"kesim {fold}: {pd.to_datetime(kesim,unit='ms').date()}  eğitim {pd.to_datetime(d_tr.t.min(),unit='ms').date()}→{pd.to_datetime(d_tr.t.max(),unit='ms').date()} ({len(d_tr)} bar)  pencere → {pd.to_datetime(pen_son,unit='ms').date()}")
        if a.model == "naif": sk = skor_naif(d_pr[(d_pr.t > kesim) & (d_pr.t <= pen_son)], H)
        else: sk = skor_tft(d_tr, d_pr, H, ENC, a.epoch, a.parti_orani, a.dogrulama_gun, a.seed + fold, log)
        sk = sk[(sk.t > kesim) & (sk.t <= pen_son)]
        if not a.her_bar:                                       # günde bir karar: 00:00 UTC barı
            sk = sk[(sk.t % (GUN * MS_1H)) == 0]
        sk["fold"] = fold
        kararlar.append(sk)
        kayit.append({"fold": fold, "kesim": int(kesim), "n_egitim": int(len(d_tr)), "n_karar": int(len(sk)), "sn": round(time.time() - T)})
        log(f"  {len(sk)} karar, {kayit[-1]['sn']} sn")
        kesim += adim
    S = pd.concat(kararlar, ignore_index=True) if kararlar else pd.DataFrame(columns=["sym","t","time_idx","skor","fold"])
    S["side"] = np.where(S.skor >= a.esik, 1, np.where(S.skor <= -a.esik, -1, 0))
    S.to_csv(CIKTI / f"{a.etiket}-skor.csv", index=False)
    P = S[S.side != 0][["t", "sym", "side"]].copy()
    P.columns = ["t0", "sym", "side"]; P["hz"] = H; P["rm"] = a.rm
    P.to_csv(CIKTI / f"{a.etiket}-plans.csv", index=False)
    (CIKTI / f"{a.etiket}-kayit.json").write_text(json.dumps({"ayarlar": vars(a), "kesimler": kayit}, indent=1, default=str))
    log(f"bitti: {len(S)} karar, {len(P)} plan ({(P.side==1).sum()} long / {(P.side==-1).sum()} short) → {CIKTI / (a.etiket + '-plans.csv')}")
    log(f"değerlendir: cd ../worker && node strategies.js --plans ../lab/cikti/{a.etiket}-plans.csv --offline --pages {a.pages} --label {a.etiket}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", choices=["tft", "naif"], default="tft")
    ap.add_argument("--syms", default=",".join(ASSETS))
    ap.add_argument("--pages", type=int, default=40); ap.add_argument("--cache", default=None)
    ap.add_argument("--ufuk", type=int, default=24, help="H: tahmin/plan ufku (bar)")
    ap.add_argument("--kodlayici", type=int, default=168, help="kodlayıcı uzunluğu (bar)")
    ap.add_argument("--esik", type=float, default=0.5, help="|skor| eşiği (vol birimi)")
    ap.add_argument("--rm", type=float, default=1.5)
    ap.add_argument("--isinma-gun", type=int, default=365); ap.add_argument("--adim-gun", type=int, default=60)
    ap.add_argument("--egitim-gun", type=int, default=540, help="kayan eğitim penceresi (0 = baştan beri)")
    ap.add_argument("--dogrulama-gun", type=int, default=30)
    ap.add_argument("--epoch", type=int, default=8); ap.add_argument("--parti-orani", type=float, default=1.0)
    ap.add_argument("--baslangic", default=None, help="ilk kesim tarihi (YYYY-MM-DD)")
    ap.add_argument("--max-kesim", type=int, default=0); ap.add_argument("--her-bar", action="store_true")
    ap.add_argument("--seed", type=int, default=7); ap.add_argument("--etiket", default=None)
    ap.add_argument("--hizli", action="store_true", help="duman testi: 3 varlık, 2 kesim, 2 epoch, %30 parti")
    a = ap.parse_args()
    if a.hizli:
        a.syms = "BTCUSDT,ETHUSDT,SOLUSDT"; a.max_kesim = 2; a.epoch = 2; a.parti_orani = 0.3
    if not a.etiket: a.etiket = a.model + ("-hizli" if a.hizli else "")
    calistir(a)
