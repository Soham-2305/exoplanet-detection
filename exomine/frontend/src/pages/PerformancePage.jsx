import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Search,
  ExternalLink,
  Sparkles,
  Maximize2,
  X,
  Filter,
  ArrowUpDown,
  CheckCircle,
  Layers,
  Award,
} from 'lucide-react';

export function PerformancePage({ onSelectTic }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('p_planet');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [selectedFigure, setSelectedFigure] = useState(null);

  const pageSize = 15;

  useEffect(() => {
    fetch('/api/performance')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching performance data:', err);
        setLoading(false);
      });
  }, []);

  const rawMetrics = data?.metrics?.raw;
  const pdcMetrics = data?.metrics?.pdc;
  const candidates = data?.ranked_candidates || [];

  // Filter and sort candidates
  const filteredCandidates = candidates.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return String(c.tic).includes(q) || (c.uid && c.uid.toLowerCase().includes(q));
  });

  filteredCandidates.sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(filteredCandidates.length / pageSize) || 1;
  const paginatedCandidates = filteredCandidates.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const figures = [
    {
      id: 'F_confusion_roc',
      title: 'Confusion Matrix & ROC Curves',
      file: 'F_confusion_roc.png',
      desc: '3-class confusion matrix, one-vs-rest ROC curves, and Planet vs False Positive separation.',
    },
    {
      id: 'E_learning_curves',
      title: 'Model Learning Curves',
      file: 'E_learning_curves.png',
      desc: 'Loss curves and validation macro F1 trajectories over training epochs.',
    },
    {
      id: 'B_dataset',
      title: 'Dataset Distributions',
      file: 'B_dataset.png',
      desc: 'Orbital period, transit depth, stellar radius, and class distributions across TESS sectors.',
    },
    {
      id: 'C_examples',
      title: 'Light Curve Class Examples',
      file: 'C_examples.png',
      desc: 'Typical light curve morphologies for confirmed planets, candidates, and false positives.',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Title */}
      <div className="space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-xs font-mono">
          <Award className="w-3.5 h-3.5" />
          <span>Held-Out Benchmark Evaluation</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-['Outfit']">
          ExoMine Model <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">Performance</span>
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl">
          Empirical evaluation results of the AstroNetPlus 1D CNN classifier evaluated on a held-out test split of 471 TESS stars (148 confirmed planets, 231 candidates, and 92 false positives).
        </p>
      </div>

      {/* Key Metric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cosmic-card rounded-2xl p-5 border-cyan-500/20">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Planet vs FP AUC</span>
            <span className="text-cyan-400 font-mono text-[11px]">95% CI: {rawMetrics?.auc_95ci || '0.83-0.92'}</span>
          </div>
          <div className="text-3xl font-extrabold font-mono text-cyan-300">
            {rawMetrics ? (rawMetrics.planet_vs_fp_auc * 100).toFixed(1) : '88.0'}%
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Binary discrimination ROC AUC between confirmed planets and false positives.
          </p>
        </div>

        <div className="cosmic-card rounded-2xl p-5 border-emerald-500/20">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Macro F1 Score</span>
            <span className="text-emerald-400 font-mono text-[11px]">3 Classes</span>
          </div>
          <div className="text-3xl font-extrabold font-mono text-emerald-400">
            {rawMetrics ? (rawMetrics.macro_f1_3class * 100).toFixed(1) : '58.0'}%
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Unweighted macro F1 across Planet, Candidate, and False Positive classes.
          </p>
        </div>

        <div className="cosmic-card rounded-2xl p-5 border-amber-500/20">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>3-Class Accuracy</span>
            <span className="text-amber-400 font-mono text-[11px]">Best Epoch {rawMetrics?.best_epoch || 8}</span>
          </div>
          <div className="text-3xl font-extrabold font-mono text-amber-300">
            {rawMetrics ? (rawMetrics.accuracy_3class * 100).toFixed(1) : '58.8'}%
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Exact match accuracy on held-out test targets without class balancing bias.
          </p>
        </div>

        <div className="cosmic-card rounded-2xl p-5 border-slate-700/60">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Test Set Size</span>
            <span className="text-slate-400 font-mono text-[11px]">Unseen Stars</span>
          </div>
          <div className="text-3xl font-extrabold font-mono text-white">
            {rawMetrics?.n_test || 471}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            148 confirmed planets, 231 candidates, 92 astrophysical false positives.
          </p>
        </div>
      </div>

      {/* Model Comparison Table */}
      <div className="cosmic-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-white font-['Outfit']">
            Model Architecture Benchmark: ExoMine Raw vs PDC Baseline
          </h3>
          <span className="text-xs text-slate-400 font-mono">results_v02.json</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase font-mono">
                <th className="py-2.5 px-3">Metric</th>
                <th className="py-2.5 px-3 text-cyan-300 font-semibold">ExoMine (Raw Cotrending)</th>
                <th className="py-2.5 px-3 text-slate-300">NASA PDC Baseline</th>
                <th className="py-2.5 px-3">Advantage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              <tr>
                <td className="py-2.5 px-3 font-sans text-slate-300">Planet vs False Positive ROC AUC</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">
                  {rawMetrics ? rawMetrics.planet_vs_fp_auc.toFixed(3) : '0.880'} ({rawMetrics?.auc_95ci || '0.83-0.92'})
                </td>
                <td className="py-2.5 px-3 text-slate-400">
                  {pdcMetrics ? pdcMetrics.planet_vs_fp_auc.toFixed(3) : '0.887'} ({pdcMetrics?.auc_95ci || '0.84-0.93'})
                </td>
                <td className="py-2.5 px-3 font-sans text-slate-400">Comparable discrimination</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans text-slate-300">3-Class Accuracy</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">
                  {rawMetrics ? `${(rawMetrics.accuracy_3class * 100).toFixed(1)}%` : '58.8%'}
                </td>
                <td className="py-2.5 px-3 text-slate-400">
                  {pdcMetrics ? `${(pdcMetrics.accuracy_3class * 100).toFixed(1)}%` : '56.7%'}
                </td>
                <td className="py-2.5 px-3 font-sans text-emerald-400">+2.1% Higher accuracy</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans text-slate-300">Macro F1 Score (3-Class)</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">
                  {rawMetrics ? `${(rawMetrics.macro_f1_3class * 100).toFixed(1)}%` : '58.0%'}
                </td>
                <td className="py-2.5 px-3 text-slate-400">
                  {pdcMetrics ? `${(pdcMetrics.macro_f1_3class * 100).toFixed(1)}%` : '56.5%'}
                </td>
                <td className="py-2.5 px-3 font-sans text-emerald-400">+1.5% Higher balance</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans text-slate-300">Optimal Softmax Temperature (T)</td>
                <td className="py-2.5 px-3 text-slate-200">
                  {rawMetrics ? rawMetrics.temperature.toFixed(3) : '0.997'}
                </td>
                <td className="py-2.5 px-3 text-slate-400">
                  {pdcMetrics ? pdcMetrics.temperature.toFixed(3) : '1.056'}
                </td>
                <td className="py-2.5 px-3 font-sans text-slate-400">Calibrated probabilities</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-sans text-slate-300">Fastest Convergence (Best Epoch)</td>
                <td className="py-2.5 px-3 text-slate-200">Epoch {rawMetrics?.best_epoch || 8}</td>
                <td className="py-2.5 px-3 text-slate-400">Epoch {pdcMetrics?.best_epoch || 12}</td>
                <td className="py-2.5 px-3 font-sans text-slate-400">Faster stabilization</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Figures Gallery */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white font-['Outfit']">
          Validation & Scientific Diagnostic Figures
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {figures.map((fig) => (
            <div
              key={fig.id}
              onClick={() => setSelectedFigure(fig)}
              className="cosmic-card cosmic-card-hover rounded-2xl overflow-hidden cursor-pointer group flex flex-col justify-between"
            >
              <div className="p-4 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                    {fig.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">{fig.desc}</p>
                </div>
                <Maximize2 className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors shrink-0 ml-2" />
              </div>
              <div className="p-3 bg-black/40 flex items-center justify-center overflow-hidden h-64">
                <img
                  src={`/api/figures/${fig.file}`}
                  alt={fig.title}
                  className="max-h-full max-w-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ranked Test Candidates Table */}
      <div className="cosmic-card rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white font-['Outfit']">
              Ranked Test Set Candidates
            </h3>
            <p className="text-xs text-slate-400">
              {filteredCandidates.length} evaluated targets from <code className="text-cyan-400 font-mono">test_candidates_ranked.csv</code>. Click any row or &quot;Classify&quot; to inspect in real-time.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search TIC or TOI..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase font-mono">
                <th
                  onClick={() => toggleSort('tic')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>TIC</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('uid')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>TOI UID</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('period')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>Period (d)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('depth_ppm')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>Depth (ppm)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('snr')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>SNR</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('p_planet')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>P(Planet)</span>
                    <ArrowUpDown className="w-3 h-3 text-cyan-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedCandidates.map((row, idx) => (
                <tr
                  key={idx}
                  onClick={() => onSelectTic(row.tic)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 px-3 font-bold text-white group-hover:text-cyan-300">
                    {row.tic}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{row.uid || '--'}</td>
                  <td className="py-2.5 px-3 text-slate-400">
                    {typeof row.period === 'number' ? row.period.toFixed(4) : row.period}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    {typeof row.depth_ppm === 'number' ? Math.round(row.depth_ppm) : row.depth_ppm}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    {typeof row.snr === 'number' ? row.snr.toFixed(1) : row.snr}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-emerald-400">
                      {(row.p_planet * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTic(row.tic);
                      }}
                      className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 hover:bg-cyan-900 transition-colors text-[11px]"
                    >
                      Classify
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedCandidates.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No candidates found matching &quot;{searchQuery}&quot;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
          <span>
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, filteredCandidates.length)} of {filteredCandidates.length}
          </span>
          <div className="flex items-center space-x-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800"
            >
              Prev
            </button>
            <span className="px-2 font-mono">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Figure Modal */}
      {selectedFigure && (
        <div
          onClick={() => setSelectedFigure(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
              <div>
                <span className="font-bold text-white text-sm">{selectedFigure.title}</span>
                <p className="text-slate-400 text-xs">{selectedFigure.desc}</p>
              </div>
              <button
                onClick={() => setSelectedFigure(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto max-h-[80vh] flex items-center justify-center p-2 bg-black/50 rounded-xl">
              <img
                src={`/api/figures/${selectedFigure.file}`}
                alt={selectedFigure.title}
                className="w-full h-auto object-contain max-h-[75vh]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
