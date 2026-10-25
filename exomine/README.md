# ExoMine

Mining TESS light curves for exoplanets with deep learning and automated vetting.

ExoMine is a modern, high-performance web application built on top of a 1D Convolutional Neural Network (AstroNetPlus) and an automated transit vetting pipeline. Given any TESS Input Catalog (TIC) star ID, ExoMine downloads high-cadence 2-minute SPOC light curves from NASA MAST, executes cotrending detrending, performs iterative Box Least Squares (BLS) transit search, fits physical orbital parameters, vets astrophysical false positives, and predicts calibrated exoplanet probabilities.

---

## Architecture Overview

- **Backend**: FastAPI (`/exomine/backend`) running an asynchronous job queue for compute-heavy transit search, candidate fitting, and neural network inference.
- **Frontend**: React + Vite + Tailwind CSS (`/exomine/frontend`) featuring a dark space-themed interface, interactive light curve plots, diagnostic vetting gauges, benchmark comparisons, and live job status polling.
- **Model**: AstroNetPlus 1D Convolutional Neural Network (`15gbmodel/models/model_raw.pt` + `meta_raw.json`) with temperature-scaled softmax probability calibration.

---

## Quickstart (Windows PowerShell)

### 1. Prerequisites
- Python 3.10+ (tested on Python 3.11 / 3.14)
- Node.js 18+ and npm

---

### 2. Backend Setup & Run

Open a Windows PowerShell terminal:

```powershell
# Navigate to the backend directory
cd C:\Users\Soham\Desktop\final_exoplanet\Detection-of-exoplanets\showpro\exomine\backend

# (Optional) Create and activate a Python virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start the ExoMine FastAPI server on port 8000
uvicorn app:app --reload --port 8000
```

The API will start at: `http://localhost:8000`  
Interactive Swagger docs: `http://localhost:8000/docs`

---

### 3. Frontend Setup & Run

Open a second Windows PowerShell terminal:

```powershell
# Navigate to the frontend directory
cd C:\Users\Soham\Desktop\final_exoplanet\Detection-of-exoplanets\showpro\exomine\frontend

# Install dependencies (if not already done)
npm install

# Start the Vite development server (port 5173)
npm run dev
```

The application will be accessible in your browser at:
`http://localhost:5173`

The Vite dev server automatically proxies all `/api` requests to `http://localhost:8000`.

---

### 4. Terminal CLI Usage (Legacy / Direct)

You can also run classifications directly from your command line:

```powershell
cd C:\Users\Soham\Desktop\final_exoplanet\Detection-of-exoplanets\showpro
python majorproject\testing.py 305424003
```

---

## API Reference

### Health Check
```powershell
curl http://localhost:8000/api/health
```

### Submit Classification Job
```powershell
curl -X POST http://localhost:8000/api/classify `
  -H "Content-Type: application/json" `
  -d '{"tic": 305424003, "fap": false, "max_sectors": 3}'
```
Response:
```json
{
  "job_id": "4b68ff0c-b2b5-4b0d-b4f0-466d10db9f1e",
  "status": "queued",
  "cached": false
}
```

### Check Job Progress & Retrieve Results
```powershell
curl http://localhost:8000/api/jobs/4b68ff0c-b2b5-4b0d-b4f0-466d10db9f1e
```

### Download Diagnostic Plot
```powershell
curl -O http://localhost:8000/api/plot/305424003.png
```

### Retrieve Downsampled Light Curve Data
```powershell
curl http://localhost:8000/api/lightcurve/305424003
```

### Retrieve Model Performance & Test Set Benchmarks
```powershell
curl http://localhost:8000/api/performance
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `EXOMINE_BASE` | Root path for models, datasets, and output directories | Repository root |
| `ASTRODETECT_BASE` | Fallback base directory path | Repository root |

---

## Key Features

1. **Autonomous MAST Downloads**: Automatically queries the Mikulski Archive for Space Telescopes (MAST) and downloads calibrated 2-minute SPOC timeseries for requested stars.
2. **Interactive Multi-View Lightcurves**: Real-time canvas rendering of Raw SAP, Detrended Flux, Phase-Folded Transit, Odd vs Even Transits, and Secondary Eclipse at Phase 0.5.
3. **Astrophysical Vetting Diagnostics**: Odd/Even depth test, secondary occultation test, centroid motion test, and physical source offset in pixels.
4. **Single-Worker Threading**: Heavy CPU tasks (BLS grid search & PyTorch tensor operations) are queued and executed sequentially to prevent resource exhaustion.
5. **Session History & Instant Caching**: Repeat queries for the same TIC and parameters are instantly served from cache.
