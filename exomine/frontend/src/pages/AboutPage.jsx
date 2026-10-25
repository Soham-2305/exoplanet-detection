import React from 'react';
import {
  Layers,
  Sparkles,
  Search,
  Filter,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import { Logo } from '../components/Navbar';

export function AboutPage() {
  const steps = [
    {
      num: '01',
      title: 'Light Curve Ingestion',
      subtitle: 'NASA MAST & SPOC Pipeline',
      desc: 'Takes any TESS Input Catalog (TIC) ID and fetches 2-minute cadence simple aperture photometry (SAP) from NASA MAST archives spanning up to 3 consecutive observing sectors.',
      icon: Layers,
      tag: 'Data Layer',
    },
    {
      num: '02',
      title: 'Telemetry-Aware Detrending',
      subtitle: 'Cotrending Basis Vectors (CBVs)',
      desc: 'Removes instrumental systematics, spacecraft thermal drifts, Earth/Moon scattered light, and stellar rotational variability while strictly preserving true transit signatures.',
      icon: Filter,
      tag: 'Preprocessing',
    },
    {
      num: '03',
      title: 'Iterative BLS Transit Search',
      subtitle: 'Box Least Squares Algorithm',
      desc: 'Scans the detrended light curve over orbital period and phase grids to identify periodic transit dips with a Signal Detection Efficiency (SDE) threshold > 7.0.',
      icon: Search,
      tag: 'Search',
    },
    {
      num: '04',
      title: 'Astrophysical Vetting & Fitting',
      subtitle: 'Mandel-Agol Limb-Darkened Fitting',
      desc: 'Fits physical planetary parameters (Rp/R*, impact parameter b, duration, epoch) and calculates diagnostic vetting metrics: odd-vs-even depth asymmetry, secondary eclipse at phase 0.5, and centroid motion.',
      icon: CheckCircle2,
      tag: 'Vetting',
    },
    {
      num: '05',
      title: '1D CNN Classification',
      subtitle: 'AstroNetPlus Architecture',
      desc: 'A multi-branch deep neural network ingest global folded light curves (201 bins), local transit zoomed curves (61 bins), and scalar physical diagnostics to compute unified feature embeddings.',
      icon: Cpu,
      tag: 'Deep Learning',
    },
    {
      num: '06',
      title: 'Calibrated Softmax Probabilities',
      subtitle: 'Empirical Temperature Scaling',
      desc: 'Applies post-hoc temperature scaling (T=0.997) to ensure output class probabilities (Planet, Candidate, False Positive) accurately reflect empirical validation likelihoods.',
      icon: Sparkles,
      tag: 'Calibration',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Brand Header */}
      <div className="space-y-4 text-center">
        <div className="inline-flex items-center space-x-2 p-2 rounded-2xl bg-slate-900 border border-slate-800">
          <Logo className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-['Outfit']">
          About <span className="text-cyan-400">ExoMine</span>
        </h1>
        <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-400 leading-relaxed">
          ExoMine is a modern, research-grade machine learning system designed to autonomously mine NASA TESS (Transiting Exoplanet Survey Satellite) light curves for alien planetary systems.
        </p>
      </div>

      {/* Pipeline Steps Grid */}
      <div className="space-y-4">
        <div className="border-b border-slate-800 pb-2">
          <h2 className="text-lg font-bold text-white font-['Outfit']">
            The End-to-End Discovery Pipeline
          </h2>
          <p className="text-xs text-slate-400">
            From raw photons to calibrated exoplanet classification in under 90 seconds.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={idx}
                className="cosmic-card rounded-2xl p-5 border-slate-800/80 hover:border-slate-700 transition-colors space-y-3 relative group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/50 text-cyan-400">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{s.title}</h3>
                      <p className="text-[11px] text-cyan-400 font-mono">{s.subtitle}</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold font-mono text-slate-700 group-hover:text-slate-600 transition-colors">
                    {s.num}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scientific Architecture Specifications */}
      <div className="cosmic-card rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-white font-['Outfit'] border-b border-slate-800 pb-2">
          Technical & Deep Learning Specifications
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-slate-500 uppercase text-[10px]">Model Architecture</span>
            <div className="text-white font-bold text-sm">AstroNetPlus 1D CNN</div>
            <p className="text-[11px] text-slate-400 font-sans">
              Two convolutional towers (Global 201 bins, Local 61 bins) combined with a scalar MLP vetting branch.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-slate-500 uppercase text-[10px]">Cadence & Sensor</span>
            <div className="text-white font-bold text-sm">TESS SPOC 2-Min</div>
            <p className="text-[11px] text-slate-400 font-sans">
              Optimized for high-cadence short-period and multi-sector transit light curves.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-slate-500 uppercase text-[10px]">Training Objective</span>
            <div className="text-white font-bold text-sm">Cross-Entropy + FAP</div>
            <p className="text-[11px] text-slate-400 font-sans">
              Trained on confirmed exoplanet catalogs with simulated injection and empirical noise rejection.
            </p>
          </div>
        </div>
      </div>

      {/* Research Disclaimer */}
      <div className="p-5 rounded-2xl border border-amber-900/60 bg-amber-950/30 text-amber-200/90 space-y-2">
        <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm font-['Outfit']">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Scientific & Discovery Disclaimer</span>
        </div>
        <p className="text-xs leading-relaxed text-amber-200/80">
          ExoMine outputs are research-grade algorithmic predictions generated by machine learning models and automated vetting diagnostics. Planetary classifications are probabilistic indicators of transit-like signals and do not constitute confirmed astronomical discoveries. Final verification of exoplanet candidates requires independent ground-based spectroscopic radial velocity measurements, high-resolution adaptive optics imaging, and multi-color photometric follow-up.
        </p>
      </div>
    </div>
  );
}
