import React, { useState, useEffect } from 'react';
import {
  Search,
  Sparkles,
  Clock,
  Download,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Layers,
  Thermometer,
  Sun,
  Maximize2,
  X,
  History,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { InteractiveChart } from '../components/InteractiveChart';
import { VettingGauges } from '../components/VettingGauges';

const EXAMPLE_TICS = [
  { tic: '305424003', label: 'TOI 907.01 (Planet)', type: 'planet' },
  { tic: '231081369', label: 'TIC 231081369', type: 'candidate' },
  { tic: '231663901', label: 'TIC 231663901', type: 'candidate' },
  { tic: '418343229', label: 'TOI 6662.01 (Test #1)', type: 'planet' },
  { tic: '397362481', label: 'TOI 6276.03 (Test #2)', type: 'planet' },
];

export function ClassifyPage({ initialTic, onClassifyAnother }) {
  const [ticInput, setTicInput] = useState(initialTic || '305424003');
  const [runFap, setRunFap] = useState(false);
  const [maxSectors, setMaxSectors] = useState(3);
  const [currentJob, setCurrentJob] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [zoomPlot, setZoomPlot] = useState(false);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('exomine_history');
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const saveToHistory = (tic, verdict, p_planet) => {
    try {
      const item = {
        tic: String(tic),
        verdict: verdict || 'Analyzed',
        p_planet: p_planet || 0,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const filtered = history.filter(h => h.tic !== item.tic);
      const updated = [item, ...filtered].slice(0, 10);
      setHistory(updated);
      localStorage.setItem('exomine_history', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('exomine_history');
  };

  // If initialTic was passed in from the performance page, trigger classification
  useEffect(() => {
    if (initialTic) {
      setTicInput(String(initialTic));
      triggerClassification(String(initialTic));
    }
  }, [initialTic]);

  // Job Polling
  useEffect(() => {
    if (!currentJob || currentJob.status === 'done' || currentJob.status === 'error') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${currentJob.job_id}`);
        if (!res.ok) throw new Error('Job lookup failed');
        const data = await res.json();
        setCurrentJob(data);

        if (data.status === 'done') {
          setResult(data.result);
          setIsSubmitting(false);
          saveToHistory(data.tic, data.result?.predicted_class, data.result?.probabilities?.planet);
        } else if (data.status === 'error') {
          setErrorMsg(data.error || 'Classification failed.');
          setIsSubmitting(false);
        }
      } catch (err) {
        console.error('Job poll error:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentJob]);

  const triggerClassification = async (overrideTic) => {
    const rawTic = overrideTic || ticInput;
    const clean = rawTic.replace(/\D/g, '');
    if (!clean) {
      setErrorMsg('Please enter a valid numeric TIC ID.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tic: parseInt(clean, 10),
          fap: runFap,
          max_sectors: maxSectors,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to submit classification request.');
      }

      const data = await res.json();
      // If result was instantly cached
      if (data.status === 'done') {
        const jobRes = await fetch(`/api/jobs/${data.job_id}`);
        const jobData = await jobRes.json();
        setCurrentJob(jobData);
        setResult(jobData.result);
        setIsSubmitting(false);
        saveToHistory(jobData.tic, jobData.result?.predicted_class, jobData.result?.probabilities?.planet);
      } else {
        setCurrentJob({
          job_id: data.job_id,
          tic: parseInt(clean, 10),
          status: data.status || 'queued',
          stage: 'Queued in analysis pipeline',
          progress: 0.05,
          elapsed_seconds: 0,
        });
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error communicating with ExoMine server.');
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    triggerClassification();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Automated TESS Exoplanet Discovery Pipeline</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight font-['Outfit']">
          Mining TESS Light Curves for <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-emerald-400">Exoplanets</span>
        </h1>
        <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-400 leading-relaxed">
          Input any TESS star ID (TIC). ExoMine automatically downloads SPOC 2-minute cadence data from NASA MAST, executes cotrending detrending, iterative BLS transit search, astrophysical vetting, and 1D CNN classification.
        </p>
      </div>

      {/* Input Controls Card */}
      <div className="cosmic-card rounded-2xl p-6 sm:p-7 space-y-5 max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-5 h-5 text-cyan-400" />
              </div>
              <input
                type="text"
                value={ticInput}
                onChange={(e) => setTicInput(e.target.value)}
                placeholder="Enter TIC ID (e.g., 305424003)"
                className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-base"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-7 py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg ${
                isSubmitting
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20 active:scale-[0.98]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Classify Star</span>
                </>
              )}
            </button>
          </div>

          {/* Options Row */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-300 pt-2 gap-4 border-t border-slate-800/80">
            {/* FAP Toggle */}
            <label className="flex items-center space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={runFap}
                onChange={(e) => setRunFap(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="font-medium text-slate-300">
                Run False-Alarm Probability (FAP)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                (~30-60s bootstrap)
              </span>
            </label>

            {/* Max Sectors Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Max Sectors:</span>
              <div className="flex rounded-lg bg-slate-950 border border-slate-800 p-0.5">
                {[1, 2, 3].map((sec) => (
                  <button
                    type="button"
                    key={sec}
                    onClick={() => setMaxSectors(sec)}
                    className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium transition-colors ${
                      maxSectors === sec
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>

        {/* Clickable Quick Examples */}
        <div className="pt-2 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Example TICs:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_TICS.map((ex) => (
              <button
                key={ex.tic}
                onClick={() => {
                  setTicInput(ex.tic);
                  triggerClassification(ex.tic);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 hover:text-cyan-300 transition-all text-slate-300"
              >
                TIC {ex.tic} <span className="text-slate-500">({ex.label})</span>
              </button>
            ))}
          </div>
        </div>

        {/* History Chips */}
        {history.length > 0 && (
          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 overflow-x-auto py-1">
              <History className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-slate-400 shrink-0">Recent:</span>
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setTicInput(h.tic);
                    triggerClassification(h.tic);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all shrink-0 ${
                    h.verdict === 'planet'
                      ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300 hover:border-emerald-600'
                      : h.verdict === 'candidate'
                      ? 'bg-amber-950/40 border-amber-800/50 text-amber-300 hover:border-amber-600'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  TIC {h.tic}
                </button>
              ))}
            </div>
            <button
              onClick={clearHistory}
              title="Clear History"
              className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors ml-2 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Error Message Alert */}
      {errorMsg && (
        <div className="max-w-4xl mx-auto p-4 rounded-xl border border-rose-900/60 bg-rose-950/40 text-rose-200 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Classification Notice</h4>
            <p className="text-xs text-rose-300/90 leading-relaxed">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Live Progress Card */}
      {isSubmitting && currentJob && currentJob.status !== 'done' && (
        <div className="max-w-4xl mx-auto cosmic-card rounded-2xl p-6 border-cyan-500/30 animate-pulse space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-7 h-7 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-cyan-400" />
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-['Outfit']">
                  Analyzing TIC {currentJob.tic}
                </h3>
                <p className="text-xs text-cyan-300 font-mono">{currentJob.stage}</p>
              </div>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentJob.elapsed_seconds || 0}s elapsed</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(8, (currentJob.progress || 0) * 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400 pt-1">
            <div className="flex items-center space-x-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${currentJob.progress >= 0.15 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span>1. MAST Download</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${currentJob.progress >= 0.40 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span>2. Detrending</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${currentJob.progress >= 0.65 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span>3. BLS Search</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${currentJob.progress >= 0.75 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span>4. CNN Predict</span>
            </div>
          </div>
        </div>
      )}

      {/* Result Display Section */}
      {result && (
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* Main Verdict Card */}
          <div
            className={`cosmic-card rounded-2xl p-6 sm:p-8 border transition-all ${
              result.predicted_class === 'planet'
                ? 'border-emerald-500/40 cosmic-glow-emerald'
                : result.predicted_class === 'candidate'
                ? 'border-amber-500/40 cosmic-glow-amber'
                : 'border-rose-500/40 cosmic-glow-rose'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="space-y-1">
                <div className="text-xs uppercase font-mono tracking-wider text-slate-400">
                  Classification Result • TIC {result.tic}
                </div>
                <div className="flex items-center space-x-3">
                  <span
                    className={`text-2xl sm:text-3xl font-extrabold uppercase tracking-tight font-['Outfit'] px-3.5 py-1 rounded-xl border ${
                      result.predicted_class === 'planet'
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60'
                        : result.predicted_class === 'candidate'
                        ? 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                        : 'bg-rose-950/80 text-rose-300 border-rose-600/60'
                    }`}
                  >
                    {result.predicted_class === 'planet'
                      ? 'PLANET'
                      : result.predicted_class === 'candidate'
                      ? 'CANDIDATE'
                      : 'FALSE POSITIVE'}
                  </span>
                  {result.noise_warning && (
                    <span className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-amber-950/60 border border-amber-800/80 text-amber-300 text-xs font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>FAP &gt; 0.001 (Could be noise)</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <a
                  href={`/api/download-csv/${result.tic}`}
                  download
                  className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Download CSV</span>
                </a>
                <button
                  onClick={() => setZoomPlot(true)}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>View 6-Panel Plot</span>
                </button>
              </div>
            </div>

            {/* Probability Bars */}
            <div className="py-5 space-y-2">
              <div className="flex justify-between text-xs font-medium text-slate-300">
                <span>Model Softmax Probabilities:</span>
                <span className="font-mono text-slate-400">Temperature Scaled (T=0.997)</span>
              </div>
              <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden flex p-0.5 border border-slate-800">
                <div
                  style={{ width: `${result.probabilities.planet * 100}%` }}
                  className="bg-emerald-500 h-full rounded-l-full transition-all duration-700"
                  title={`Planet: ${(result.probabilities.planet * 100).toFixed(1)}%`}
                />
                <div
                  style={{ width: `${result.probabilities.candidate * 100}%` }}
                  className="bg-amber-500 h-full transition-all duration-700"
                  title={`Candidate: ${(result.probabilities.candidate * 100).toFixed(1)}%`}
                />
                <div
                  style={{ width: `${result.probabilities.false_positive * 100}%` }}
                  className="bg-rose-500 h-full rounded-r-full transition-all duration-700"
                  title={`False Positive: ${(result.probabilities.false_positive * 100).toFixed(1)}%`}
                />
              </div>

              <div className="grid grid-cols-3 text-xs pt-1">
                <div className="text-left font-mono">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5" />
                  <span className="text-slate-300 font-semibold">Planet:</span>{' '}
                  <span className="text-emerald-400 font-bold">{(result.probabilities.planet * 100).toFixed(1)}%</span>
                </div>
                <div className="text-center font-mono">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5" />
                  <span className="text-slate-300 font-semibold">Candidate:</span>{' '}
                  <span className="text-amber-400 font-bold">{(result.probabilities.candidate * 100).toFixed(1)}%</span>
                </div>
                <div className="text-right font-mono">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 mr-1.5" />
                  <span className="text-slate-300 font-semibold">False Positive:</span>{' '}
                  <span className="text-rose-400 font-bold">{(result.probabilities.false_positive * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* NASA Catalogue Comparison */}
            {result.catalogue ? (
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-slate-300">NASA TOI Catalog:</span>
                  <span className="font-mono text-cyan-400">{result.catalogue.uid}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-400">{result.catalogue.label_name}</span>
                  <span className="text-slate-500">(P={result.catalogue.period.toFixed(4)} d)</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded font-mono font-bold text-[11px] ${
                    result.catalogue.is_match
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80'
                      : 'bg-amber-950 text-amber-300 border border-amber-800/80'
                  }`}
                >
                  [{result.catalogue.status_text}]
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/50 text-xs text-slate-500">
                Star not listed in NASA TOI ground-truth catalogue (novel evaluation target).
              </div>
            )}
          </div>

          {/* Star Metadata Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 rounded-xl cosmic-card text-center text-xs">
            <div>
              <div className="text-slate-400 flex items-center justify-center space-x-1">
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Sectors Used</span>
              </div>
              <div className="text-white font-mono font-bold text-sm mt-0.5">
                {result.star?.sectors ? JSON.stringify(result.star.sectors) : '--'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 flex items-center justify-center space-x-1">
                <Sun className="w-3 h-3 text-amber-400" />
                <span>Teff</span>
              </div>
              <div className="text-white font-mono font-bold text-sm mt-0.5">
                {result.star?.teff ? `${Math.round(result.star.teff)} K` : '--'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 flex items-center justify-center space-x-1">
                <Sun className="w-3 h-3 text-sky-400" />
                <span>Stellar Radius (R*)</span>
              </div>
              <div className="text-white font-mono font-bold text-sm mt-0.5">
                {result.star?.radius ? `${result.star.radius.toFixed(2)} R☉` : '--'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 flex items-center justify-center space-x-1">
                <Thermometer className="w-3 h-3 text-purple-400" />
                <span>Tmag</span>
              </div>
              <div className="text-white font-mono font-bold text-sm mt-0.5">
                {result.star?.tmag ? result.star.tmag.toFixed(2) : '--'}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="text-slate-400">Measurements</div>
              <div className="text-white font-mono font-bold text-sm mt-0.5">
                {result.star?.measurements?.toLocaleString() || '--'}
              </div>
            </div>
          </div>

          {/* Fitted Signal Summary Grid */}
          <div className="cosmic-card rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white font-['Outfit'] border-b border-slate-800 pb-2">
              Fitted Signal & Transit Parameters
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Period (P)</span>
                <p className="text-base font-bold font-mono text-cyan-300 mt-1">
                  {result.signal.period_d.toFixed(5)} <span className="text-xs text-slate-500">d</span>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Transit Depth</span>
                <p className="text-base font-bold font-mono text-cyan-300 mt-1">
                  {Math.round(result.signal.depth_ppm)} <span className="text-xs text-slate-500">ppm</span>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Duration</span>
                <p className="text-base font-bold font-mono text-cyan-300 mt-1">
                  {result.signal.duration_h.toFixed(2)} <span className="text-xs text-slate-500">h</span>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Planet Radius (Rp)</span>
                <p className="text-base font-bold font-mono text-emerald-400 mt-1">
                  {result.signal.rp_earth ? result.signal.rp_earth.toFixed(1) : '--'}{' '}
                  <span className="text-xs text-slate-500">R⊕</span>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Radius Ratio (Rp/R*)</span>
                <p className="text-base font-bold font-mono text-slate-200 mt-1">
                  {result.signal.rp_rs.toFixed(3)}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Impact Param (b)</span>
                <p className="text-base font-bold font-mono text-slate-200 mt-1">
                  {result.signal.b.toFixed(2)}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Transit SNR</span>
                <p className="text-base font-bold font-mono text-slate-200 mt-1">
                  {result.signal.snr.toFixed(1)}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Search SDE</span>
                <p className="text-base font-bold font-mono text-slate-200 mt-1">
                  {result.signal.sde.toFixed(1)}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Epoch (T0 BTJD)</span>
                <p className="text-base font-bold font-mono text-slate-200 mt-1">
                  {result.signal.t0_btjd.toFixed(2)}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">False-Alarm Prob</span>
                <p className="text-base font-bold font-mono text-slate-200 mt-1">
                  {result.signal.fap !== null ? result.signal.fap.toExponential(1) : 'Not run'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Significance (σ)</span>
                <p className="text-base font-bold font-mono text-slate-200 mt-1">
                  {result.signal.sigma !== null ? `${result.signal.sigma.toFixed(1)}σ` : '--'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Runtime</span>
                <p className="text-base font-bold font-mono text-cyan-300 mt-1">
                  {result.elapsed_seconds} <span className="text-xs text-slate-500">s</span>
                </p>
              </div>
            </div>
          </div>

          {/* Vetting Diagnostic Gauges */}
          <VettingGauges signal={result.signal} />

          {/* Interactive Light Curve Visualizer */}
          {result.lightcurve && (
            <InteractiveChart
              lightcurveData={result.lightcurve}
              signal={result.signal}
              star={result.star}
            />
          )}

          {/* 6-Panel Diagnostic Plot Inline Preview */}
          <div className="cosmic-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white font-['Outfit']">
                  Diagnostic 6-Panel Plot
                </h3>
                <p className="text-xs text-slate-400">
                  Full multi-aperture diagnostic plot (SAP, detrended, folded, odd/even, phase 0.5, probabilities).
                </p>
              </div>
              <button
                onClick={() => setZoomPlot(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-200 flex items-center space-x-1.5 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fullscreen</span>
              </button>
            </div>

            <div
              onClick={() => setZoomPlot(true)}
              className="cursor-pointer overflow-hidden rounded-xl border border-slate-800 bg-black/40 hover:border-cyan-500/40 transition-all group relative"
            >
              <img
                src={`/api/plot/${result.tic}.png`}
                alt={`TIC ${result.tic} Diagnostic Plot`}
                className="w-full object-contain max-h-[500px] block"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="px-4 py-2 rounded-lg bg-slate-900/90 border border-cyan-400 text-cyan-300 text-sm font-semibold flex items-center space-x-2">
                  <Maximize2 className="w-4 h-4" />
                  <span>Click to view full size</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Zoom Modal for Plot */}
      {zoomPlot && result && (
        <div
          onClick={() => setZoomPlot(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-6xl w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
              <span className="font-semibold text-white">TIC {result.tic} Diagnostic Plot</span>
              <div className="flex items-center space-x-2">
                <a
                  href={`/api/plot/${result.tic}.png`}
                  download
                  className="px-3 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-white flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save Image</span>
                </a>
                <button
                  onClick={() => setZoomPlot(false)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-auto max-h-[80vh] flex items-center justify-center">
              <img
                src={`/api/plot/${result.tic}.png`}
                alt="Fullscreen plot"
                className="w-full h-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
