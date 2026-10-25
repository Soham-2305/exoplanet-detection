"""v0.2 - real labels only, 3 classes, ~15 GB pull.

Classes (straight from the Hugging Face catalogue, nothing simulated):
    0 planet          TFOPWG CP/KP, or signal_label == confirmed
    1 candidate       TFOPWG PC/APC, or signal_label == candidate
    2 false_positive  TFOPWG FP/FA, or signal_label == false_positive
   -1 dropped         signal_label == unknown (no disposition)
TFOPWG (the follow-up team's verdict) wins when the two columns disagree.

Notebook 00 : plan_pull() -> pull_compact()   HF lc.fits -> compact per-star .npz in tars
Notebook 01 : find_star_files() -> run_build() -> shards of model inputs (raw + pdc)
"""
import glob
import hashlib
import json
import os
import re
import shutil
import tarfile
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd

REPO = "saadtaleb/tess-lightcurves-planets"
BTJD = 2457000.0
CLASSES3 = ["planet", "candidate", "false_positive"]
_TF = {"CP": 0, "KP": 0, "PC": 1, "APC": 1, "FP": 2, "FA": 2}
_SL = {"confirmed": 0, "candidate": 1, "false_positive": 2}


# ------------------------------------------------------------------ labels
def split_of(tic):
    """Same TIC-hash split as v0.1 (70/15/15), so a star never changes split."""
    h = int(hashlib.md5(str(tic).encode()).hexdigest(), 16) % 100
    return "train" if h < 70 else ("val" if h < 85 else "test")


def label3_of(row):
    tf = str(row.get("tfopwg_disposition", "") or "").strip().upper()
    if tf in _TF:
        return _TF[tf]
    return _SL.get(str(row.get("signal_label", "") or "").strip().lower(), -1)


def star_signals3(rows):
    """De-duplicate TOI/TCE/CTOI copies of one signal (period within 1 %).
    A confirmed/FP verdict beats 'candidate', which beats 'unknown'."""
    pri_src = {"TOI": 0, "TCE": 1, "CTOI": 2}
    strength = {0: 3, 2: 3, 1: 2, -1: 1}
    rows = sorted(rows.to_dict("records"), key=lambda r: pri_src.get(r.get("signal_source"), 3))
    out = []
    for r in rows:
        try:
            P = float(r.get("period_days"))
            ep = float(r.get("epoch_bjd"))
        except (TypeError, ValueError):
            continue
        if not (np.isfinite(P) and P > 0 and np.isfinite(ep)):
            continue
        if ep > 2_000_000:
            ep -= BTJD
        dur = float(r.get("duration_hours") or np.nan) / 24
        dep = float(r.get("depth_ppm") or np.nan) / 1e6
        lab = label3_of(r)
        dup = next((o for o in out if abs(o["period"] / P - 1) < 0.01), None)
        if dup:
            if strength[lab] > strength[dup["label"]]:
                dup["label"] = lab
            continue
        out.append(dict(uid=str(r.get("signal_uid")), period=P, t0=ep,
                        duration=dur if np.isfinite(dur) and dur > 0 else 0.1,
                        depth=dep if np.isfinite(dep) and dep > 0 else 1e-3, label=lab))
    return [s for s in out if s["label"] != -1]


# ------------------------------------------------------------------ which files
def sector_of(path):
    m = re.search(r"-s(\d{4})-", os.path.basename(str(path)))
    return int(m.group(1)) if m else -1


def pick_files(files, n):
    """Up to n files with the most CONSECUTIVE sectors: short baseline = faster
    BLS and no 1,000-day gaps (v0.1 picked sectors 42 + 92 for one star)."""
    files = sorted(set(files), key=sector_of)
    if len(files) <= n:
        return files
    secs = [sector_of(f) for f in files]
    best = min(range(len(files) - n + 1), key=lambda i: (secs[i + n - 1] - secs[i], -secs[i]))
    return files[best:best + n]


def _size_col(lcs):
    for c in ("size_bytes", "file_size", "size", "bytes", "filesize"):
        if c in lcs.columns:
            return c
    return None


def plan_pull(signals, lcs, budget_gb=15.0, files_per_star=3, cand_ratio=1.5,
              mb_per_file=2.1, file_types=("lc",), seed=0):
    """Choose stars so the pull is ~budget_gb of raw lc.fits and the classes stay
    balanced: every star with a planet or FP signal is eligible; candidate-ONLY
    stars are capped so candidates <= cand_ratio x planets. The combined list is
    shuffled, then filled up to the byte budget, so each class shrinks in
    proportion if the budget is too small for all of them."""
    if "file_type" in lcs.columns:
        lcs = lcs[lcs["file_type"].isin(file_types)]
    size_col = _size_col(lcs)
    sizes = (dict(zip(lcs["hf_path"], lcs[size_col])) if size_col else {})
    files = lcs.groupby("tic_id")["hf_path"].apply(list).to_dict()
    strong, cand_only = [], []
    for tic, g in signals.groupby("tic_id"):
        if tic not in files:
            continue
        sigs = star_signals3(g)
        if not sigs:
            continue
        f = pick_files(files[tic], files_per_star)
        job = dict(tic=int(tic), files=f, signals=sigs, split=split_of(tic),
                   est_bytes=float(sum(sizes.get(x, mb_per_file * 1e6) for x in f)))
        (strong if any(s["label"] in (0, 2) for s in sigs) else cand_only).append(job)
    rng = np.random.default_rng(seed)
    n_cls = lambda jobs, c: sum(s["label"] == c for j in jobs for s in j["signals"])
    cand_room = max(0, int(cand_ratio * n_cls(strong, 0)) - n_cls(strong, 1))
    cand_only = [cand_only[i] for i in rng.permutation(len(cand_only))]
    keep, n = [], 0
    for j in cand_only:
        if n >= cand_room:
            break
        keep.append(j)
        n += len(j["signals"])
    pool = strong + keep
    pool = [pool[i] for i in rng.permutation(len(pool))]
    out, total = [], 0.0
    for j in pool:
        if total + j["est_bytes"] > budget_gb * 1e9:
            continue
        out.append(j)
        total += j["est_bytes"]
    summary = dict(stars=len(out), files=sum(len(j["files"]) for j in out),
                   est_gb=round(total / 1e9, 2), size_column=size_col,
                   planet=n_cls(out, 0), candidate=n_cls(out, 1), false_positive=n_cls(out, 2),
                   eligible_planet=n_cls(strong, 0), eligible_fp=n_cls(strong, 2),
                   eligible_candidate_only_stars=len(cand_only),
                   splits={s: sum(j["split"] == s for j in out) for s in ("train", "val", "test")})
    return out, summary


# ------------------------------------------------------------------ notebook 00: pull
def _convert_star(tic, paths, out_npz):
    from .io import read_lc, save_star_npz
    lcs = []
    for p in paths:
        try:
            lcs.append(read_lc(p))
        except Exception as e:  # corrupt file: skip it, keep the star
            print(f"  skip {os.path.basename(p)}: {e}")
    return save_star_npz(lcs, out_npz)


def pull_compact(out_dir, jobs, budget_gb=15.0, threads=16, stars_per_tar=100,
                 time_budget_h=11.0, tmp_dir="/tmp/pull", token=None, resume_glob=None):
    """Download each chunk of stars, convert every star to one compact .npz,
    pack 100 stars per stars_XXXX.tar, delete the FITS. Resumable: tars already
    in out_dir (or in resume_glob, e.g. a previous run attached as input) are
    skipped and their bytes count toward the budget."""
    from huggingface_hub import hf_hub_download
    os.makedirs(out_dir, exist_ok=True)
    prog_file = os.path.join(out_dir, "pull_progress.json")
    prog = json.load(open(prog_file)) if os.path.exists(prog_file) else {}
    if resume_glob:
        for f in glob.glob(resume_glob, recursive=True):
            dst = os.path.join(out_dir, os.path.basename(f))
            if not os.path.exists(dst):
                shutil.copy(f, dst)
        for f in glob.glob(resume_glob.replace("stars_*.tar", "pull_progress.json"), recursive=True):
            prog.update(json.load(open(f)))
    chunks = [jobs[i:i + stars_per_tar] for i in range(0, len(jobs), stars_per_tar)]
    raw_bytes = sum(v["raw_bytes"] for v in prog.values())
    t0 = time.time()

    def get(f):
        err = None
        for attempt in range(5):
            try:
                return f, hf_hub_download(REPO, f, repo_type="dataset", local_dir=tmp_dir, token=token)
            except Exception as e:
                err = e
                time.sleep(4 * (attempt + 1))
        print("  failed:", f, repr(err)[:200])
        return f, None

    for k, chunk in enumerate(chunks):
        name = f"stars_{k:04d}.tar"
        tar_path = os.path.join(out_dir, name)
        if os.path.exists(tar_path):
            continue
        if raw_bytes >= budget_gb * 1e9:
            print(f"byte budget reached ({raw_bytes / 1e9:.2f} GB)")
            break
        if (time.time() - t0) / 3600 > time_budget_h:
            print("time budget reached - run again with this output attached to continue")
            break
        with ThreadPoolExecutor(threads) as ex:
            got = dict(ex.map(get, [f for j in chunk for f in j["files"]]))
        chunk_bytes = sum(os.path.getsize(p) for p in got.values() if p)
        npz_dir = os.path.join(tmp_dir, "npz")
        os.makedirs(npz_dir, exist_ok=True)
        stars = []
        for j in chunk:
            paths = [got[f] for f in j["files"] if got.get(f)]
            out = os.path.join(npz_dir, f"TIC_{j['tic']}.npz")
            if paths and _convert_star(j["tic"], paths, out):
                stars.append(j["tic"])
        with tarfile.open(tar_path + ".part", "w") as tar:
            for tic in stars:
                tar.add(os.path.join(npz_dir, f"TIC_{tic}.npz"), arcname=f"TIC_{tic}.npz")
        os.replace(tar_path + ".part", tar_path)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raw_bytes += chunk_bytes
        prog[name] = dict(stars=stars, raw_bytes=chunk_bytes, tar_bytes=os.path.getsize(tar_path))
        json.dump(prog, open(prog_file, "w"))
        print(f"{name}: {len(stars)}/{len(chunk)} stars | raw {raw_bytes / 1e9:5.2f} GB pulled | "
              f"compact {sum(v['tar_bytes'] for v in prog.values()) / 1e9:4.2f} GB | "
              f"{(time.time() - t0) / 60:5.1f} min", flush=True)
    return prog


# ------------------------------------------------------------------ notebook 01: build
def find_star_files(roots=("/kaggle/input",), extract_to="/tmp/stars"):
    """tic -> path of its compact .npz. Works whether Kaggle unpacked the tars
    into folders (dataset) or kept them as .tar (attached notebook output)."""
    os.makedirs(extract_to, exist_ok=True)
    found = {}
    for root in roots:
        for t in glob.glob(os.path.join(root, "**", "stars_*.tar"), recursive=True):
            with tarfile.open(t) as tar:
                for m in tar.getmembers():
                    dst = os.path.join(extract_to, m.name)
                    if not os.path.exists(dst):
                        tar.extract(m, extract_to)
        for root2 in (root, extract_to):
            for f in glob.glob(os.path.join(root2, "**", "TIC_*.npz"), recursive=True):
                m = re.search(r"TIC_(\d+)\.npz$", f)
                if m:
                    found.setdefault(int(m.group(1)), f)
    return found


def _process(job, path, cfg):
    from .pipeline import build_star_samples
    try:
        rng = np.random.default_rng(job["tic"])
        samples, rec = build_star_samples([path], job["signals"], rng, n_sims=0,
                                          max_sectors=cfg["max_sectors"],
                                          max_periods=cfg["max_periods"])
        for s in samples:
            s["split"] = job["split"]
        for r in rec:
            r.update(tic=job["tic"], split=job["split"])
        return job["tic"], samples, rec, None
    except Exception:
        return job["tic"], [], [], traceback.format_exc()


def _save_shard(samples, recs, path):
    from .build import save_shard
    save_shard(samples, recs, path)


def _init_worker():
    for v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        os.environ[v] = "1"


def run_build(out_dir, jobs, star_files, shard_id=0, n_shards=1, workers=4, shard_size=50,
              time_budget_h=11.0, max_sectors=4, max_periods=30_000):
    """Detrend -> search -> fit -> vet -> views for every catalogue signal, twice
    (raw = ours, pdc = NASA baseline). Each Kaggle session takes the stars with
    index % n_shards == shard_id. Resumable via done_<shard>.json."""
    import multiprocessing as mp
    cfg = dict(max_sectors=max_sectors, max_periods=max_periods)
    os.makedirs(out_dir, exist_ok=True)
    jobs = [j for i, j in enumerate(jobs) if i % n_shards == shard_id and j["tic"] in star_files]
    done_file = os.path.join(out_dir, f"done_{shard_id}.json")
    done = set(json.load(open(done_file))) if os.path.exists(done_file) else set()
    jobs = [j for j in jobs if j["tic"] not in done]
    print(f"shard {shard_id}/{n_shards}: {len(jobs)} stars to do, {len(done)} already done", flush=True)
    t0 = time.time()
    buf_s, buf_r = [], []
    k = len(glob.glob(os.path.join(out_dir, f"shard_{shard_id}_*.npz")))

    def flush():
        nonlocal buf_s, buf_r, k
        if buf_s:
            _save_shard(buf_s, buf_r, os.path.join(out_dir, f"shard_{shard_id}_{k:04d}.npz"))
            k += 1
        json.dump(sorted(done), open(done_file, "w"))
        buf_s, buf_r = [], []

    ctx = mp.get_context("spawn")
    with ProcessPoolExecutor(workers, mp_context=ctx, initializer=_init_worker) as ex:
        it, futs = iter(jobs), {}
        for _ in range(workers * 2):
            j = next(it, None)
            if j:
                futs[ex.submit(_process, j, star_files[j["tic"]], cfg)] = j
        n_new = 0
        while futs:
            fu = next(as_completed(list(futs)))
            futs.pop(fu)
            tic, s, r, err = fu.result()
            if err:
                print(f"TIC {tic} failed: {err.strip().splitlines()[-1][:200]}", flush=True)
            buf_s += s
            buf_r += r
            done.add(tic)
            n_new += 1
            if n_new % shard_size == 0:
                flush()
                el = (time.time() - t0) / 3600
                print(f"{n_new}/{len(jobs)} stars | {el:.2f} h | ETA {el / n_new * (len(jobs) - n_new):.1f} h",
                      flush=True)
            if (time.time() - t0) / 3600 < time_budget_h:
                j = next(it, None)
                if j:
                    futs[ex.submit(_process, j, star_files[j["tic"]], cfg)] = j
    flush()
    left = len(jobs) - n_new
    print("finished shard" if left == 0 else
          f"time budget reached, {left} stars left - commit again with this output attached")
