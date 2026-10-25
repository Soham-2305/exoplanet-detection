import React from 'react';

export function Logo({ className = "w-8 h-8" }) {
  return (
    <svg className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="planetGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#0284c7" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#0369a1" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      {/* Outer subtle orbit ring */}
      <circle cx="18" cy="18" r="16" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="1.2" strokeDasharray="2 3" />
      {/* Central Host Star glow */}
      <circle cx="18" cy="18" r="7" fill="url(#planetGlow)" />
      <circle cx="18" cy="18" r="4.5" fill="#f8fafc" />
      {/* Transit Dip Curve */}
      <path
        d="M 5 18 H 12 C 14 18 15 25 18 25 C 21 25 22 18 24 18 H 31"
        stroke="url(#orbitGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Transiting Exoplanet dot */}
      <circle cx="18" cy="25" r="2.2" fill="#10b981" stroke="#080b14" strokeWidth="1" />
    </svg>
  );
}

export function Navbar({ activeTab, setActiveTab, healthStatus }) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#080b14]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div 
          onClick={() => setActiveTab('classify')}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 group-hover:border-cyan-500/50 transition-colors">
            <Logo className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold tracking-tight text-white font-['Outfit']">
                Exo<span className="text-cyan-400">Mine</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800/60">
                TESS v0.2
              </span>
            </div>
            <p className="text-[11px] text-slate-400 tracking-wide hidden sm:block">
              Mining TESS light curves for exoplanets
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => setActiveTab('classify')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'classify'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Classify
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'performance'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Model Performance
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'about'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            About
          </button>
        </nav>

        {/* Server Status indicator */}
        <div className="hidden md:flex items-center space-x-2 text-xs font-mono px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
          <span className={`w-2 h-2 rounded-full ${healthStatus ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-slate-400">API:</span>
          <span className={healthStatus ? 'text-emerald-400' : 'text-rose-400'}>
            {healthStatus ? 'Online' : 'Connecting...'}
          </span>
        </div>
      </div>
    </header>
  );
}
