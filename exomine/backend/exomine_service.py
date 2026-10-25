"""
ExoMine Service - Core exoplanet detection & classification pipeline.
Refactored from testing.py to provide a reusable API service with stage callbacks,
downsampled lightcurve data extraction for frontend charts, and custom exceptions.
"""

import glob
import io
import json
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
import warnings
from typing import Callable, Dict, List, Optional, Tuple, Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ============================== PATHS / CONFIG ==============================
DEFAULT_BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = os.environ.get("EXOMINE_BASE", os.environ.get("ASTRODETECT_BASE", DEFAULT_BASE))

MODEL_DIR = os.path.join(BASE, "15gbmodel")
DATA_DIR = os.path.join(BASE, "15gbdataset")
OUT_DIR = os.path.join(BASE, "classified_v02")
DOWNLOAD_DIR = os.path.join(OUT_DIR, "_mast_downloads")
CODE_DIR = os.path.join(MODEL_DIR, "code")

# Ensure astrodetect from disk is on sys.path
if CODE_DIR not in sys.path and os.path.exists(CODE_DIR):
    sys.path.insert(0, CODE_DIR)

# Fallback: check showpro/15gbmodel/code or 15gbmodel/code relative to BASE
for fallback_sub in ["15gbmodel/code", "showpro/15gbmodel/code"]:
    cand = os.path.join(BASE, fallback_sub)
    if os.path.exists(cand) and cand not in sys.path:
        sys.path.insert(0, cand)

CLASSES = ["planet", "candidate", "false_positive"]
PRETTY = {
    "planet": "PLANET",
    "candidate": "CANDIDATE (planet-like, needs follow-up)",
    "false_positive": "FALSE POSITIVE (eclipsing binary / blend / instrumental)",
}
NASA = {0: "confirmed PLANET", 1: "CANDIDATE (not yet confirmed)", 2: "FALSE POSITIVE"}


# ============================== EXCEPTIONS ==============================
class ExoMineError(Exception):
    """Base exception for ExoMine errors."""
    pass


class NoDataFoundError(ExoMineError):
    """Raised when no 2-min SPOC light curve exists on MAST or local dataset."""
    pass


class NoPeriodicSignalError(ExoMineError):
    """Raised when the transit search finds no significant periodic signal."""
    pass


class NetworkError(ExoMineError):
    """Raised when MAST API network request fails."""
    pass


# ============================== SINGLETON MODEL ==============================
_PREDICTOR = None


def get_predictor():
    """Loads and caches the model and standardizer once."""
    global _PREDICTOR
    if _PREDICTOR is not None:
        return _PREDICTOR

    import torch
    from astrodetect.model import AstroNetPlus, Standardizer

    variant = "raw"
    pt = glob.glob(os.path.join(MODEL_DIR, "**", f"model_{variant}.pt"), recursive=True)
    meta = glob.glob(os.path.join(MODEL_DIR, "**", f"meta_{variant}.json"), recursive=True)

    if not (pt and meta):
        # Look in results zip if needed
        import zipfile
        dst = os.path.join(OUT_DIR, "_model")
        for z in glob.glob(os.path.join(MODEL_DIR, "**", "*.zip"), recursive=True):
            with zipfile.ZipFile(z) as zz:
                names = [n for n in zz.namelist() if n.endswith((f"model_{variant}.pt", f"meta_{variant}.json"))]
                if len(names) == 2:
                    for n in names:
                        zz.extract(n, dst)
        pt = glob.glob(os.path.join(dst, "**", f"model_{variant}.pt"), recursive=True)
        meta = glob.glob(os.path.join(dst, "**", f"meta_{variant}.json"), recursive=True)

    if not (pt and meta):
        raise FileNotFoundError(f"model_{variant}.pt + meta_{variant}.json not found under {MODEL_DIR}")

    m = json.load(open(meta[0]))
    model = AstroNetPlus(n_classes=len(m.get("classes", CLASSES)))
    model.load_state_dict(torch.load(pt[0], map_location="cpu"))
    model.eval()
    scaler, T = Standardizer.from_state(m["scaler"]), float(m["temperature"])

    @torch.no_grad()
    def predict(g, l, s):
        z = (
            model(
                torch.from_numpy(g[None]).float(),
                torch.from_numpy(l[None]).float(),
                torch.from_numpy(scaler(s[None])),
            ).numpy()[0]
            / T
        )
        e = np.exp(z - z.max())
        return e / e.sum()

    _PREDICTOR = predict
    return _PREDICTOR


# ============================== DATA FETCHING ==============================
def dataset_file(tic: int) -> Optional[str]:
    """Check if star exists in local 15gbdataset."""
    loose = glob.glob(os.path.join(DATA_DIR, "**", f"TIC_{tic}.npz"), recursive=True)
    if loose:
        return loose[0]
    cache = os.path.join(OUT_DIR, "_stars")
    out = os.path.join(cache, f"TIC_{tic}.npz")
    if os.path.exists(out):
        return out
    idx_file = os.path.join(OUT_DIR, "_stars_index.json")
    idx = json.load(open(idx_file)) if os.path.exists(idx_file) else {}
    tars = glob.glob(os.path.join(DATA_DIR, "**", "stars_*.tar"), recursive=True)
    if any(t not in idx for t in tars):
        import tarfile
        for t in tars:
            if t not in idx:
                try:
                    with tarfile.open(t) as tf:
                        idx[t] = tf.getnames()
                except Exception:
                    pass
        os.makedirs(OUT_DIR, exist_ok=True)
        try:
            json.dump(idx, open(idx_file, "w"))
        except Exception:
            pass
    for t, names in idx.items():
        if f"TIC_{tic}.npz" in names:
            os.makedirs(cache, exist_ok=True)
            import tarfile
            with tarfile.open(t) as tf:
                tf.extract(f"TIC_{tic}.npz", cache)
            return out
    return None


def downloaded_files(tic: int, max_sectors: int) -> List[str]:
    from astrodetect.build3 import pick_files
    got = glob.glob(os.path.join(DOWNLOAD_DIR, f"TIC_{tic}", "*_lc.fits"))
    return pick_files(got, max_sectors) if got else []


def _mast_request(request_dict: dict) -> dict:
    data = urllib.parse.urlencode({"request": json.dumps(request_dict)}).encode()
    try:
        with urllib.request.urlopen("https://mast.stsci.edu/api/v0/invoke", data, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.URLError as e:
        raise NetworkError(f"Network error communicating with NASA MAST: {e.reason}")
    except Exception as e:
        raise NetworkError(f"Error querying NASA MAST: {str(e)}")


def download_from_mast(tic: int, max_sectors: int = 3, on_progress: Optional[Callable[[str], None]] = None) -> List[str]:
    from astrodetect.build3 import pick_files, sector_of

    if on_progress:
        on_progress(f"Querying NASA MAST catalog for TIC {tic}...")

    resp = _mast_request({
        "service": "Mast.Caom.Filtered",
        "format": "json",
        "params": {
            "columns": "obsid,obs_id,t_exptime",
            "filters": [
                {"paramName": "obs_collection", "values": ["TESS"]},
                {"paramName": "dataproduct_type", "values": ["timeseries"]},
                {"paramName": "target_name", "values": [str(tic)]},
            ],
        },
    })

    obs = resp.get("data", [])
    obs = [o for o in obs if o.get("t_exptime") == 120 and o["obs_id"].endswith("-s")]
    if not obs:
        raise NoDataFoundError(f"NASA MAST has no 2-min SPOC light curves for TIC {tic}")

    keep = set(pick_files([o["obs_id"] for o in obs], max_sectors))
    sectors_used = sorted(sector_of(k) for k in keep)
    if on_progress:
        on_progress(f"Found {len(obs)} sector(s) on MAST. Downloading {len(keep)} sector(s) (Sectors {sectors_used})...")

    out = os.path.join(DOWNLOAD_DIR, f"TIC_{tic}")
    os.makedirs(out, exist_ok=True)
    got = []

    for o in [o for o in obs if o["obs_id"] in keep]:
        prod_resp = _mast_request({
            "service": "Mast.Caom.Products",
            "format": "json",
            "params": {"obsid": str(o["obsid"])},
        })
        prods = prod_resp.get("data", [])
        for p in prods:
            if p["productFilename"].endswith("_lc.fits"):
                dst = os.path.join(out, p["productFilename"])
                if not os.path.exists(dst):
                    url = "https://mast.stsci.edu/api/v0.1/Download/file?uri=" + urllib.parse.quote(p["dataURI"])
                    try:
                        urllib.request.urlretrieve(url, dst)
                    except Exception as e:
                        raise NetworkError(f"Failed downloading {p['productFilename']} from MAST: {e}")
                got.append(dst)
    return sorted(got)


def catalogue_info(tic: int) -> Tuple[List[dict], Optional[str], bool]:
    pulled = False
    jj = (
        glob.glob(os.path.join(DATA_DIR, "**", "jobs_pulled.json"), recursive=True)
        or glob.glob(os.path.join(DATA_DIR, "**", "jobs.json"), recursive=True)
    )
    if jj:
        try:
            for j in json.load(open(jj[0])):
                if j["tic"] == tic:
                    return j["signals"], j["split"], True
        except Exception:
            pass

    sc = glob.glob(os.path.join(DATA_DIR, "**", "signals.csv"), recursive=True)
    if sc:
        try:
            from astrodetect.build3 import split_of, star_signals3
            s = pd.read_csv(sc[0])
            rows = s[s["tic_id"] == tic]
            if len(rows):
                return star_signals3(rows), split_of(tic), pulled
        except Exception:
            pass
    return [], None, pulled


# ============================== PLOTTING ==============================
def plot_signal(lc, row: dict, a: dict, png_path: str):
    from astrodetect.vetting import phase

    f, t = a["flux"], lc.time
    P, t0, D = row["period_d"], row["t0_btjd"], row["duration_h"] / 24
    ph = phase(t, P, t0) * 24
    near = np.abs(ph) < 3 * D * 24

    fig, ax = plt.subplots(2, 3, figsize=(16, 7.5))
    ax[0, 0].plot(t, lc.sap, ",", color="0.5")
    ax[0, 0].set_title("raw SAP (crowding-corrected)")

    ax[0, 1].plot(t, (f - 1) * 1e6, ",", color="C0")
    ax[0, 1].set_title("detrended (telemetry-aware), ppm")

    rp_str = f"{row['rp_earth']:.1f} Re" if (row.get("rp_earth") is not None and np.isfinite(row["rp_earth"])) else "N/A"
    ax[0, 2].plot(ph[near], (f[near] - 1) * 1e6, ".", ms=1.5, alpha=0.4, color="k")
    ax[0, 2].set_title(
        f"folded: P={P:.5f} d, {row['depth_ppm']:.0f} ppm, Rp={rp_str}",
        fontsize=9,
    )

    ep = np.round((t - t0) / P).astype(int)
    for k, col in ((0, "C0"), (1, "C3")):
        m = near & (ep % 2 == k)
        ax[1, 0].plot(ph[m], (f[m] - 1) * 1e6, ".", ms=1.5, alpha=0.4, color=col, label=["even", "odd"][k])
    ax[1, 0].legend(markerscale=6)
    ax[1, 0].set_title(f"odd/even {row['odd_even_sigma']:.1f} sigma")

    ph2 = (((t - t0) % P) - 0.5 * P) * 24
    m2 = np.abs(ph2) < 3 * D * 24
    ax[1, 1].plot(ph2[m2], (f[m2] - 1) * 1e6, ".", ms=1.5, alpha=0.4, color="C2")
    ax[1, 1].set_title(f"phase 0.5: secondary eclipse {row['secondary_sigma']:.1f} sigma")

    ax[1, 2].bar(CLASSES, [row[f"p_{k}"] for k in CLASSES], color=["#10b981", "#f59e0b", "#ef4444"])
    ax[1, 2].set_ylim(0, 1)
    ax[1, 2].set_title("ExoMine Class Probabilities")

    for x in (ax[0, 2], ax[1, 0], ax[1, 1]):
        x.set_xlabel("hours from mid-transit")

    fap_val = row.get("fap")
    sigma_val = row.get("sigma")
    fap_text = (
        f"FAP {fap_val:.1e} ({sigma_val:.1f} sigma)"
        if (fap_val is not None and np.isfinite(fap_val) and sigma_val is not None)
        else ""
    )
    fig.suptitle(
        f"TIC {row['tic']} signal {row['cand']}: {row['predicted_class'].upper()}  |  "
        f"SNR {row['snr']:.1f}, SDE {row['sde']:.1f}  {fap_text}",
        fontsize=11,
    )
    fig.tight_layout()
    os.makedirs(os.path.dirname(png_path), exist_ok=True)
    fig.savefig(png_path, dpi=110)
    plt.close(fig)


# ============================== LIGHTCURVE EXPORT ==============================
def downsample_series(x: np.ndarray, y: np.ndarray, max_points: int = 1500) -> List[dict]:
    """Downsamples series evenly for fast interactive web rendering."""
    mask = np.isfinite(x) & np.isfinite(y)
    x_clean, y_clean = x[mask], y[mask]
    n = len(x_clean)
    if n <= max_points:
        return [{"x": round(float(xi), 5), "y": round(float(yi), 2)} for xi, yi in zip(x_clean, y_clean)]
    step = n // max_points
    return [
        {"x": round(float(x_clean[i]), 5), "y": round(float(y_clean[i]), 2)}
        for i in range(0, n, step)
    ]


def extract_lightcurve_data(lc, row: dict, a: dict) -> dict:
    """Extracts downsampled light curve curves for interactive frontend charts."""
    from astrodetect.vetting import phase

    f = a["flux"]
    t = lc.time
    P = row["period_d"]
    t0 = row["t0_btjd"]
    D = row["duration_h"] / 24

    # Raw SAP flux (ppm offset from median or normalized)
    sap_med = np.nanmedian(lc.sap)
    sap_ppm = (lc.sap / sap_med - 1.0) * 1e6 if sap_med > 0 else lc.sap

    # Detrended flux in ppm
    detrended_ppm = (f - 1.0) * 1e6

    # Folded phase in hours from mid-transit
    ph = phase(t, P, t0) * 24
    near = np.abs(ph) < 3 * D * 24

    # Odd / Even split near transit
    ep = np.round((t - t0) / P).astype(int)
    even_mask = near & (ep % 2 == 0)
    odd_mask = near & (ep % 2 == 1)

    # Phase 0.5 (secondary eclipse)
    ph2 = (((t - t0) % P) - 0.5 * P) * 24
    m2 = np.abs(ph2) < 3 * D * 24

    return {
        "raw": downsample_series(t, sap_ppm, max_points=1200),
        "detrended": downsample_series(t, detrended_ppm, max_points=1200),
        "folded": downsample_series(ph[near], detrended_ppm[near], max_points=800),
        "even": downsample_series(ph[even_mask], detrended_ppm[even_mask], max_points=500),
        "odd": downsample_series(ph[odd_mask], detrended_ppm[odd_mask], max_points=500),
        "phase05": downsample_series(ph2[m2], detrended_ppm[m2], max_points=600),
    }


# ============================== CORE CLASSIFY SERVICE ==============================
def classify_tic(
    tic: int,
    fap: bool = True,
    max_sectors: int = 3,
    on_stage: Optional[Callable[[str, float], None]] = None,
) -> Dict[str, Any]:
    """
    Executes the ExoMine classification pipeline for a given TIC.
    Returns a dictionary of classification results, metrics, star metadata,
    and downsampled lightcurve data.
    """
    t_start = time.time()

    def update_stage(msg: str, progress: float):
        if on_stage:
            on_stage(msg, progress)

    update_stage("Initializing predictor model", 0.05)
    predict = get_predictor()

    # 1. Light Curve Acquisition
    update_stage("Locating light curve files", 0.10)
    p = dataset_file(tic)
    if p:
        paths = [p]
        source_desc = "Local dataset"
    else:
        cached = downloaded_files(tic, max_sectors)
        if cached:
            paths = cached
            source_desc = f"{len(paths)} cached MAST file(s)"
        else:
            update_stage("Downloading SPOC light curves from NASA MAST", 0.15)
            paths = download_from_mast(tic, max_sectors=max_sectors, on_progress=lambda m: update_stage(m, 0.18))
            source_desc = f"{len(paths)} MAST file(s)"

    # Catalogue info
    update_stage("Checking catalogue benchmarks", 0.25)
    signals, split, pulled = catalogue_info(tic)

    # 2. Loading Star Light Curve
    update_stage("Reading and parsing light curve sectors", 0.30)
    from astrodetect.pipeline import analyse_candidate, blind_detrend, load_star
    from astrodetect.search import iterative_search, matches

    lc = load_star(paths, max_sectors=max_sectors)
    if lc is None or len(lc) == 0:
        raise NoDataFoundError(f"Could not parse valid light curve for TIC {tic}")

    star_meta = {
        "sectors": lc.meta.get("sectors", []),
        "measurements": len(lc),
        "teff": float(lc.meta.get("teff")) if lc.meta.get("teff") is not None else None,
        "radius": float(lc.meta.get("radius")) if lc.meta.get("radius") is not None else None,
        "tmag": float(lc.meta.get("tmag")) if lc.meta.get("tmag") is not None else None,
        "source": source_desc,
    }

    # 3. Blind Detrending
    update_stage("Detrending light curve (telemetry-aware cotrending)", 0.40)
    det = blind_detrend(lc, "raw")

    # 4. Iterative BLS Search
    update_stage("Searching for periodic transit signals (BLS search)", 0.55)
    cands = iterative_search(lc.time, det["flux"], max_cands=3, sde_min=7.0)
    if not cands:
        raise NoPeriodicSignalError(f"No periodic transit-like signal found for TIC {tic} (SDE < 7.0)")

    # 5. Candidate Analysis & Selection
    update_stage("Analyzing candidates and fitting transit geometry", 0.65)
    best = None
    for c in cands:
        a = analyse_candidate(lc, c, "raw")
        f = a["fit"]
        rp, b = f.get("rp_earth", np.nan), f.get("b", 0.0)
        plausible = (not np.isfinite(rp) or rp < 25) and b < 1.0
        key = (plausible, c["sde"])
        if best is None or key > best[0]:
            best = (key, c, a)

    _, c_best, a_best = best

    # 6. CNN Classification
    update_stage("Running 1D CNN classifier (AstroNetPlus)", 0.75)
    pr = predict(a_best["g"], a_best["l"], a_best["s"])
    fit, diag = a_best["fit"], a_best["diag"]

    row = dict(
        tic=tic,
        cand=1,
        period_d=float(fit["period"]),
        t0_btjd=float(fit["t0"]),
        duration_h=float(fit["duration"] * 24),
        depth_ppm=float(diag["depth_ppm"]),
        rp_earth=float(fit["rp_earth"]) if np.isfinite(fit.get("rp_earth", np.nan)) else None,
        rp_rs=float(fit["rp_rs"]),
        b=float(fit["b"]),
        snr=float(diag["snr"]),
        sde=float(c_best["sde"]),
        odd_even_sigma=float(diag["odd_even_sigma"]),
        secondary_sigma=float(diag["secondary_sigma"]),
        centroid_sigma=float(diag["centroid_sigma"]),
        source_offset_px=float(diag["source_offset_px"]),
        p_planet=float(pr[0]),
        p_candidate=float(pr[1]),
        p_false_positive=float(pr[2]),
        predicted_class=CLASSES[int(np.argmax(pr))],
        fap=None,
        sigma=None,
    )

    # 7. False-Alarm Probability (Optional, slow)
    if fap:
        update_stage("Computing empirical false-alarm probability (FAP)", 0.82)
        from astrodetect.significance import empirical_fap
        s = empirical_fap(lc.time, det["flux"], c_best, np.random.default_rng(0))
        row["fap"] = float(s["fap"]) if np.isfinite(s["fap"]) else None
        row["sigma"] = float(s["sigma"]) if np.isfinite(s["sigma"]) else None

    # NASA catalogue match
    cat_match = None
    cat = next((s for s in signals if matches(row["period_d"], s["period"])), None)
    if cat:
        is_match = CLASSES[cat["label"]] == row["predicted_class"]
        cat_match = {
            "uid": cat["uid"],
            "period": float(cat["period"]),
            "label_id": cat["label"],
            "label_name": NASA[cat["label"]],
            "is_match": is_match,
            "status_text": "MATCH" if is_match else "differs",
        }

    # 8. Plot & CSV Generation
    update_stage("Rendering diagnostic plots & saving result", 0.92)
    os.makedirs(OUT_DIR, exist_ok=True)
    png_path = os.path.join(OUT_DIR, f"TIC{tic}.png")
    plot_signal(lc, row, a_best, png_path)

    # Save CSV
    csv_row = {k: (v if v is not None else np.nan) for k, v in row.items()}
    csv_path = os.path.join(OUT_DIR, f"TIC{tic}_result.csv")
    pd.DataFrame([csv_row]).to_csv(csv_path, index=False)

    # 9. Extract Downsampled Interactive Lightcurves
    update_stage("Extracting interactive lightcurve views", 0.96)
    lightcurve_data = extract_lightcurve_data(lc, row, a_best)

    elapsed = time.time() - t_start
    update_stage("Classification complete", 1.0)

    verdict_text = PRETTY[row["predicted_class"]]
    noise_warning = bool(row["fap"] is not None and row["fap"] > 1e-3)
    if noise_warning:
        verdict_text += " (FAP > 0.001: could be noise)"

    return {
        "tic": tic,
        "signal": row,
        "verdict": verdict_text,
        "predicted_class": row["predicted_class"],
        "probabilities": {
            "planet": row["p_planet"],
            "candidate": row["p_candidate"],
            "false_positive": row["p_false_positive"],
        },
        "star": star_meta,
        "catalogue": cat_match,
        "noise_warning": noise_warning,
        "plot_url": f"/api/plot/{tic}.png",
        "csv_path": csv_path,
        "elapsed_seconds": round(elapsed, 2),
        "lightcurve": lightcurve_data,
    }
