import React, { useState } from 'react';
import { HelpCircle, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';

export function VettingGauges({ signal }) {
  if (!signal) return null;

  const checks = [
    {
      title: 'Odd/Even Test',
      value: signal.odd_even_sigma,
      unit: 'σ',
      threshold: 3.0,
      invert: false, // lower is better
      tooltip: 'Compares depths between alternating odd and even transits. Values < 3.0σ confirm identical transit depths typical of a single planet; values > 3.0σ suggest an eclipsing binary with primary and secondary eclipses.',
      calcStatus: (val) => {
        if (val < 2.0) return { label: 'PASS', color: 'emerald', text: 'Clean uniform transits' };
        if (val < 3.5) return { label: 'WARN', color: 'amber', text: 'Slight depth asymmetry' };
        return { label: 'FAIL', color: 'rose', text: 'Likely Eclipsing Binary' };
      },
    },
    {
      title: 'Secondary Eclipse',
      value: signal.secondary_sigma,
      unit: 'σ',
      threshold: 3.0,
      invert: false, // lower is better
      tooltip: 'Checks for a secondary occultation dip at phase 0.5. Real planets are dark and show negligible secondary eclipses (< 3.0σ); hot stellar companions create visible secondary dips.',
      calcStatus: (val) => {
        if (val < 2.0) return { label: 'PASS', color: 'emerald', text: 'No secondary eclipse' };
        if (val < 3.5) return { label: 'WARN', color: 'amber', text: 'Weak secondary dip' };
        return { label: 'FAIL', color: 'rose', text: 'Secondary eclipse detected' };
      },
    },
    {
      title: 'Centroid Shift',
      value: signal.centroid_sigma,
      unit: 'σ',
      threshold: 3.0,
      invert: false, // lower is better
      tooltip: 'Tests if the photocenter (center-of-light) moves during transit. Significant motion (> 3.0σ) indicates the dip actually comes from an off-target background star blended in the pixel aperture.',
      calcStatus: (val) => {
        if (val < 2.5) return { label: 'PASS', color: 'emerald', text: 'On-target transit' };
        if (val < 4.0) return { label: 'WARN', color: 'amber', text: 'Moderate shift' };
        return { label: 'FAIL', color: 'rose', text: 'Likely background blend' };
      },
    },
    {
      title: 'Centroid Offset',
      value: signal.source_offset_px,
      unit: 'px',
      threshold: 1.0,
      invert: false, // lower is better
      tooltip: 'Estimated physical pixel displacement between the target catalog coordinates and the measured transit centroid. In TESS (21 arcsec/px), offsets > 1.0 px indicate a blended star.',
      calcStatus: (val) => {
        if (val < 0.8) return { label: 'PASS', color: 'emerald', text: 'Coincident with star' };
        if (val < 1.5) return { label: 'WARN', color: 'amber', text: 'Borderline offset' };
        return { label: 'FAIL', color: 'rose', text: 'Off-target source' };
      },
    },
  ];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2.5">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-['Outfit']">
          Automated Vetting Diagnostics
        </h3>
        <span className="text-[11px] text-slate-400 font-mono">
          Thresholds: σ &lt; 3.0, offset &lt; 1.0 px
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {checks.map((c, i) => {
          const status = c.calcStatus(c.value);
          const percent = Math.min(100, (c.value / (c.threshold * 2)) * 100);

          return (
            <div
              key={i}
              className="relative group p-3 rounded-lg border border-slate-800/80 bg-slate-950/60 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-300 flex items-center space-x-1">
                  <span>{c.title}</span>
                  <div className="relative group/tip cursor-help">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tip:block w-56 p-2 rounded bg-slate-900 border border-slate-700 text-[11px] leading-relaxed text-slate-200 z-50 shadow-xl pointer-events-none">
                      {c.tooltip}
                    </div>
                  </div>
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                    status.color === 'emerald'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                      : status.color === 'amber'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                      : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                  }`}
                >
                  {status.label}
                </span>
              </div>

              {/* Numerical Value */}
              <div className="flex items-baseline space-x-1 mb-2">
                <span className="text-xl font-bold font-mono text-white">
                  {typeof c.value === 'number' ? c.value.toFixed(2) : '--'}
                </span>
                <span className="text-xs font-mono text-slate-400">{c.unit}</span>
              </div>

              {/* Progress gauge bar */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1.5">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    status.color === 'emerald'
                      ? 'bg-emerald-500'
                      : status.color === 'amber'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>

              <div className="text-[11px] text-slate-400 truncate">
                {status.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
