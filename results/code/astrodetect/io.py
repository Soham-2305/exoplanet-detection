"""Stage 0 - read TESS light-curve FITS files (SPOC *_lc.fits, QLP *_llc.fits).

Everything later in the pipeline needs, per cadence:
    time, raw flux (SAP), NASA-processed flux (PDCSAP/KSPSAP, only used for
    the ablation baseline), background, centroid x/y and pointing x/y.
SPOC and QLP name these columns differently; this module hides that.
"""
from dataclasses import dataclass, field

import numpy as np
from astropy.io import fits

# column names: canonical -> candidates, first one found wins
_COLS = {
    "time": ["TIME"],
    "sap": ["SAP_FLUX"],
    "pdc": ["PDCSAP_FLUX", "KSPSAP_FLUX", "DET_FLUX"],
    "bkg": ["SAP_BKG"],
    "cx": ["MOM_CENTR1", "SAP_X"],
    "cy": ["MOM_CENTR2", "SAP_Y"],
    "px": ["POS_CORR1"],
    "py": ["POS_CORR2"],
    "quality": ["QUALITY"],
}
AUX = ("bkg", "cx", "cy", "px", "py")


@dataclass
class LightCurve:
    tic: int
    sector: np.ndarray            # per-cadence sector number (for stitched curves)
    time: np.ndarray
    sap: np.ndarray               # crowding-corrected raw flux, normalised per sector
    pdc: np.ndarray               # NASA-processed flux, normalised per sector
    aux: dict = field(default_factory=dict)   # bkg, cx, cy, px, py (NaN-filled if missing)
    meta: dict = field(default_factory=dict)

    def __len__(self):
        return self.time.size

    def select(self, m):
        return LightCurve(self.tic, self.sector[m], self.time[m], self.sap[m], self.pdc[m],
                          {k: v[m] for k, v in self.aux.items()}, dict(self.meta))


def _get(data, key):
    for c in _COLS[key]:
        if c in data.columns.names:
            return np.asarray(data[c], float)
    return None


def read_lc(path):
    """Read one FITS light curve -> LightCurve (bad cadences removed)."""
    with fits.open(path, memmap=False) as h:
        d = h[1].data
        hdr0, hdr1 = h[0].header, h[1].header
        t = _get(d, "time")
        sap = _get(d, "sap")
        pdc = _get(d, "pdc")
        q = _get(d, "quality")
        aux = {k: _get(d, k) for k in AUX}
    n = t.size
    pdc = pdc if pdc is not None else np.full(n, np.nan)
    aux = {k: (v if v is not None else np.full(n, np.nan)) for k, v in aux.items()}
    good = np.isfinite(t) & np.isfinite(sap) & (sap > 0)
    if q is not None:
        good &= q == 0
    # telemetry must be finite where it exists at all
    for k, v in aux.items():
        if np.isfinite(v).any():
            good &= np.isfinite(v)
    t, sap, pdc = t[good], sap[good], pdc[good]
    aux = {k: v[good] for k, v in aux.items()}
    # some files have out-of-order / repeated timestamps (crashed TIC 1717732429
    # in the first run): sort and drop repeats
    o = np.argsort(t, kind="stable")
    o = o[np.r_[True, np.diff(t[o]) > 0]] if o.size else o
    t, sap, pdc = t[o], sap[o], pdc[o]
    aux = {k: v[o] for k, v in aux.items()}

    # Undo aperture contamination exactly like SPOC PDC does. Without this every
    # depth measured on SAP is diluted by (1 - CROWDSAP)  (37% on TOI-907!)
    crowd = float(hdr1.get("CROWDSAP", 1.0) or 1.0)
    flfrc = float(hdr1.get("FLFRCSAP", 1.0) or 1.0)
    if sap.size:
        med = np.median(sap)
        sap = (sap - (1 - crowd) * med) / flfrc
        sap = sap / np.median(sap)
        if np.isfinite(pdc).any():
            pdc = pdc / np.nanmedian(pdc)
    sector = int(hdr0.get("SECTOR", -1))
    tic = int(hdr0.get("TICID", hdr0.get("OBJECT", "0").split()[-1]))
    meta = dict(crowdsap=crowd, flfrcsap=flfrc,
                teff=hdr0.get("TEFF"), radius=hdr0.get("RADIUS"),
                logg=hdr0.get("LOGG"), tmag=hdr0.get("TESSMAG"),
                cadence_days=float(np.median(np.diff(t))) if t.size > 1 else np.nan)
    return LightCurve(tic, np.full(t.size, sector), t, sap, pdc, aux, meta)


def stitch(lcs):
    """Concatenate several sectors of one star (each already normalised)."""
    lcs = [l for l in lcs if len(l) > 100]
    if not lcs:
        return None
    o = np.argsort([l.time[0] for l in lcs])
    lcs = [lcs[i] for i in o]
    cat = lambda f: np.concatenate([f(l) for l in lcs])
    meta = dict(lcs[0].meta)
    meta["sectors"] = sorted({int(l.sector[0]) for l in lcs})
    return LightCurve(lcs[0].tic, cat(lambda l: l.sector), cat(lambda l: l.time),
                      cat(lambda l: l.sap), cat(lambda l: l.pdc),
                      {k: cat(lambda l, k=k: l.aux[k]) for k in AUX}, meta)


def bin_lc(lc, minutes=2.0):
    """Bin 20-s fast cadence to 2 min so every file has the same cadence."""
    if lc.meta.get("cadence_days", 0) * 1440 >= minutes * 0.9:
        return lc
    w = minutes / 1440
    k = np.floor((lc.time - lc.time[0]) / w).astype(int)
    _, idx, cnt = np.unique(k, return_index=True, return_counts=True)
    red = lambda y: np.add.reduceat(y, idx) / cnt
    out = LightCurve(lc.tic, lc.sector[idx], red(lc.time), red(lc.sap), red(lc.pdc),
                     {a: red(v) for a, v in lc.aux.items()}, dict(lc.meta))
    out.meta["cadence_days"] = w
    return out


# ============================================================ compact star files
# One .npz per star holding the already-cleaned sectors (quality-masked,
# crowding-corrected, normalised, sorted): ~3-4x smaller than the raw FITS and
# nothing else is needed downstream. Time stays float64 (2-min precision).
_F32 = ("sap", "pdc") + AUX


def save_star_npz(lcs, path):
    """lcs: list of per-sector LightCurve from read_lc()."""
    lcs = [l for l in lcs if l is not None and len(l) > 100]
    if not lcs:
        return False
    import json
    arrs = dict(time=np.concatenate([l.time for l in lcs]),
                sector=np.concatenate([l.sector for l in lcs]).astype(np.int16))
    arrs["sap"] = np.concatenate([l.sap for l in lcs]).astype(np.float32)
    arrs["pdc"] = np.concatenate([l.pdc for l in lcs]).astype(np.float32)
    for k in AUX:
        arrs[k] = np.concatenate([l.aux[k] for l in lcs]).astype(np.float32)
    meta = [{k: (float(v) if isinstance(v, (int, float, np.floating)) and v is not None else v)
             for k, v in l.meta.items()} for l in lcs]
    np.savez_compressed(path, tic=np.int64(lcs[0].tic), meta=json.dumps(meta, default=str), **arrs)
    return True


def read_star_npz(path):
    """-> list of per-sector LightCurve (same objects read_lc returns)."""
    import json
    with np.load(path, allow_pickle=False) as z:
        d = {k: z[k] for k in z.files}
    metas = json.loads(str(d["meta"]))
    out = []
    for i, s in enumerate(np.unique(d["sector"])):
        m = d["sector"] == s
        f64 = lambda k: d[k][m].astype(np.float64)
        meta = dict(metas[min(i, len(metas) - 1)])
        out.append(LightCurve(int(d["tic"]), d["sector"][m].astype(int), d["time"][m],
                              f64("sap"), f64("pdc"), {k: f64(k) for k in AUX}, meta))
    return out


def read_any(path):
    """FITS -> [LightCurve]; compact star .npz -> [LightCurve per sector]."""
    return read_star_npz(path) if str(path).endswith(".npz") else [read_lc(path)]
