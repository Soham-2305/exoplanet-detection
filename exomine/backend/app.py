"""
ExoMine API - FastAPI backend for the ExoMine TESS Exoplanet Classifier.
Provides asynchronous job management for long-running light-curve analysis,
interactive lightcurve data endpoints, diagnostic plots, and model performance metrics.
"""

import os
import queue
import re
import sys
import threading
import time
import uuid
from contextlib import asynccontextmanager
from typing import Dict, Optional, Any

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

# Ensure current directory is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from exomine_service import (
    classify_tic,
    get_predictor,
    OUT_DIR,
    MODEL_DIR,
    BASE,
    ExoMineError,
    NoDataFoundError,
    NoPeriodicSignalError,
    NetworkError,
)

# Figure directories
FIGURES_DIRS = [
    os.path.join(MODEL_DIR, "figures"),
    os.path.join(BASE, "results", "figures"),
    os.path.join(BASE, "15gbmodel", "figures"),
]

RESULTS_JSON_PATHS = [
    os.path.join(BASE, "results", "results_v02.json"),
    os.path.join(MODEL_DIR, "results_v02.json"),
]

RANKED_CSV_PATHS = [
    os.path.join(BASE, "results", "test_candidates_ranked.csv"),
    os.path.join(MODEL_DIR, "test_candidates_ranked.csv"),
]

RECOVERY_CSV_PATHS = [
    os.path.join(BASE, "results", "recovery_all.csv"),
    os.path.join(MODEL_DIR, "recovery_all.csv"),
]


# ============================== JOB MANAGEMENT ==============================
class JobState:
    def __init__(self, job_id: str, tic: int, fap: bool, max_sectors: int):
        self.job_id = job_id
        self.tic = tic
        self.fap = fap
        self.max_sectors = max_sectors
        self.status = "queued"  # queued, running, done, error
        self.stage = "Queued in analysis pipeline"
        self.progress = 0.0
        self.created_at = time.time()
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None
        self.result: Optional[dict] = None
        self.error: Optional[str] = None
        self.error_type: Optional[str] = None

    def to_dict(self) -> dict:
        now = time.time()
        elapsed = (self.finished_at or now) - (self.started_at or self.created_at)
        return {
            "job_id": self.job_id,
            "tic": self.tic,
            "fap": self.fap,
            "max_sectors": self.max_sectors,
            "status": self.status,
            "stage": self.stage,
            "progress": round(self.progress, 2),
            "elapsed_seconds": round(max(0.0, elapsed), 1),
            "result": self.result,
            "error": self.error,
            "error_type": self.error_type,
        }


# In-memory storage for jobs and cache
JOBS: Dict[str, JobState] = {}
RESULT_CACHE: Dict[tuple, dict] = {}
JOB_QUEUE = queue.Queue()
WORKER_THREAD: Optional[threading.Thread] = None
WORKER_RUNNING = True


def worker_loop():
    """Single worker thread processing jobs sequentially (torch & BLS are CPU intensive)."""
    global WORKER_RUNNING
    while WORKER_RUNNING:
        try:
            job: JobState = JOB_QUEUE.get(timeout=1.0)
        except queue.Empty:
            continue

        job.status = "running"
        job.started_at = time.time()
        job.stage = "Starting classification"
        job.progress = 0.05

        cache_key = (job.tic, job.fap, job.max_sectors)
        if cache_key in RESULT_CACHE:
            job.result = RESULT_CACHE[cache_key]
            job.status = "done"
            job.stage = "Done (retrieved from instant cache)"
            job.progress = 1.0
            job.finished_at = time.time()
            JOB_QUEUE.task_done()
            continue

        try:
            def on_stage(stage_text: str, progress_fraction: float):
                job.stage = stage_text
                job.progress = progress_fraction

            result = classify_tic(
                tic=job.tic,
                fap=job.fap,
                max_sectors=job.max_sectors,
                on_stage=on_stage,
            )
            job.result = result
            job.status = "done"
            job.stage = "Classification complete"
            job.progress = 1.0
            RESULT_CACHE[cache_key] = result
        except NoDataFoundError as e:
            job.status = "error"
            job.error = str(e)
            job.error_type = "NO_DATA_FOUND"
            job.stage = "Failed: No 2-min SPOC data found"
        except NoPeriodicSignalError as e:
            job.status = "error"
            job.error = str(e)
            job.error_type = "NO_PERIODIC_SIGNAL"
            job.stage = "Failed: No periodic signal detected"
        except NetworkError as e:
            job.status = "error"
            job.error = str(e)
            job.error_type = "NETWORK_ERROR"
            job.stage = "Failed: Network error contacting NASA MAST"
        except Exception as e:
            job.status = "error"
            job.error = f"Analysis error: {str(e)}"
            job.error_type = "INTERNAL_ERROR"
            job.stage = "Failed: Unexpected error"
        finally:
            job.finished_at = time.time()
            JOB_QUEUE.task_done()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: preload predictor and launch worker
    global WORKER_THREAD, WORKER_RUNNING
    try:
        get_predictor()
    except Exception as e:
        print(f"Warning: Could not pre-load predictor: {e}")

    WORKER_RUNNING = True
    WORKER_THREAD = threading.Thread(target=worker_loop, daemon=True, name="ExoMineWorker")
    WORKER_THREAD.start()
    yield
    # Shutdown
    WORKER_RUNNING = False
    if WORKER_THREAD:
        WORKER_THREAD.join(timeout=2.0)


# ============================== APP INITIALIZATION ==============================
app = FastAPI(
    title="ExoMine API",
    description="Mining TESS light curves for exoplanets with deep learning and automated vetting.",
    version="0.2.0",
    lifespan=lifespan,
)

# Enable CORS for local dev servers and frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================== SCHEMAS ==============================
class ClassifyRequest(BaseModel):
    tic: Any = Field(..., description="TESS Input Catalog ID (integer or digits string)")
    fap: bool = Field(default=False, description="Compute empirical false-alarm probability (adds ~30-60s)")
    max_sectors: int = Field(default=3, ge=1, le=5, description="Maximum consecutive sectors to analyze (1-5)")


# ============================== API ENDPOINTS ==============================
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "ExoMine API",
        "queue_length": JOB_QUEUE.qsize(),
        "cached_results": len(RESULT_CACHE),
        "total_jobs": len(JOBS),
    }


@app.post("/api/classify")
def start_classification(req: ClassifyRequest):
    # Validate TIC ID
    tic_str = re.sub(r"\D", "", str(req.tic).strip())
    if not tic_str:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid TIC ID: must contain digits only.",
        )
    tic_int = int(tic_str)

    cache_key = (tic_int, req.fap, req.max_sectors)
    # If cached, create a completed job immediately
    if cache_key in RESULT_CACHE:
        job_id = str(uuid.uuid4())
        job = JobState(job_id=job_id, tic=tic_int, fap=req.fap, max_sectors=req.max_sectors)
        job.status = "done"
        job.stage = "Done (instant cache hit)"
        job.progress = 1.0
        job.result = RESULT_CACHE[cache_key]
        job.started_at = time.time()
        job.finished_at = job.started_at
        JOBS[job_id] = job
        return {"job_id": job_id, "status": "done", "cached": True}

    # Check if identical job is already queued or running
    for existing_id, existing_job in JOBS.items():
        if (
            existing_job.tic == tic_int
            and existing_job.fap == req.fap
            and existing_job.max_sectors == req.max_sectors
            and existing_job.status in ("queued", "running")
        ):
            return {"job_id": existing_id, "status": existing_job.status, "cached": False}

    job_id = str(uuid.uuid4())
    job = JobState(job_id=job_id, tic=tic_int, fap=req.fap, max_sectors=req.max_sectors)
    JOBS[job_id] = job
    JOB_QUEUE.put(job)
    return {"job_id": job_id, "status": "queued", "cached": False}


@app.get("/api/jobs/{job_id}")
def get_job_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOBS[job_id].to_dict()


@app.get("/api/plot/{tic}.png")
def get_plot(tic: int):
    # Check classified_v02 folder
    paths_to_check = [
        os.path.join(OUT_DIR, f"TIC{tic}.png"),
        os.path.join(BASE, "classified_v02", f"TIC{tic}.png"),
    ]
    for p in paths_to_check:
        if os.path.exists(p):
            return FileResponse(p, media_type="image/png", filename=f"TIC_{tic}_plot.png")
    raise HTTPException(status_code=404, detail=f"Diagnostic plot for TIC {tic} not found.")


@app.get("/api/lightcurve/{tic}")
def get_lightcurve(tic: int):
    """Returns the cached lightcurve data if available."""
    # Look in cache
    for (c_tic, _, _), res in RESULT_CACHE.items():
        if c_tic == tic and "lightcurve" in res:
            return res["lightcurve"]

    # Also search through JOBS
    for job in JOBS.values():
        if job.tic == tic and job.result and "lightcurve" in job.result:
            return job.result["lightcurve"]

    raise HTTPException(
        status_code=404,
        detail=f"Interactive light curve data for TIC {tic} not found. Run classification first.",
    )


@app.get("/api/download-csv/{tic}")
def download_csv(tic: int):
    paths_to_check = [
        os.path.join(OUT_DIR, f"TIC{tic}_result.csv"),
        os.path.join(BASE, "classified_v02", f"TIC{tic}_result.csv"),
    ]
    for p in paths_to_check:
        if os.path.exists(p):
            return FileResponse(p, media_type="text/csv", filename=f"TIC_{tic}_result.csv")
    raise HTTPException(status_code=404, detail=f"Result CSV for TIC {tic} not found.")


@app.get("/api/performance")
def get_performance_data():
    """Serves model performance metrics, ranked test candidates, and recovery summary."""
    import json
    import pandas as pd

    # 1. results_v02.json
    results_json = None
    for p in RESULTS_JSON_PATHS:
        if os.path.exists(p):
            try:
                results_json = json.load(open(p))
                break
            except Exception:
                pass

    # 2. test_candidates_ranked.csv
    ranked_candidates = []
    for p in RANKED_CSV_PATHS:
        if os.path.exists(p):
            try:
                df = pd.read_csv(p)
                # Keep top 100 or all (df is 233 rows)
                ranked_candidates = df.to_dict(orient="records")
                break
            except Exception:
                pass

    # 3. recovery_all summary (optional)
    recovery_stats = None
    for p in RECOVERY_CSV_PATHS:
        if os.path.exists(p):
            try:
                df_rec = pd.read_csv(p)
                recovery_stats = {
                    "total_targets": len(df_rec),
                    "recovered": int(df_rec["recovered"].sum()) if "recovered" in df_rec else 0,
                    "recovery_rate": round(float(df_rec["recovered"].mean()) * 100, 1) if "recovered" in df_rec else 0,
                    "by_class": df_rec.groupby("class")["recovered"].mean().to_dict() if "class" in df_rec else {},
                }
                break
            except Exception:
                pass

    return {
        "metrics": results_json,
        "ranked_candidates": ranked_candidates,
        "recovery": recovery_stats,
    }


@app.get("/api/figures/{name}")
def get_figure(name: str):
    """Serves model performance PNGs (F_confusion_roc.png, E_learning_curves.png, etc.)."""
    safe_name = os.path.basename(name)
    if not safe_name.endswith(".png"):
        safe_name += ".png"

    for d in FIGURES_DIRS:
        fig_path = os.path.join(d, safe_name)
        if os.path.exists(fig_path):
            return FileResponse(fig_path, media_type="image/png")

    raise HTTPException(status_code=404, detail=f"Figure {safe_name} not found.")
