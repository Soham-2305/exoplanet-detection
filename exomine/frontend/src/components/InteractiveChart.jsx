import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Activity, ZoomIn, ZoomOut, RotateCcw, Info } from 'lucide-react';

export function InteractiveChart({ lightcurveData, signal, star }) {
  const [activeTab, setActiveTab] = useState('folded');
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const tabs = [
    { id: 'folded', label: 'Folded Transit', color: '#38bdf8', desc: 'Phase-folded near mid-transit' },
    { id: 'oddeven', label: 'Odd vs Even', color: '#818cf8', desc: 'Odd (red) vs Even (blue) depth comparison' },
    { id: 'phase05', label: 'Phase 0.5 (Secondary)', color: '#10b981', desc: 'Secondary eclipse check at opposite phase' },
    { id: 'detrended', label: 'Detrended Flux', color: '#06b6d4', desc: 'Telemetry-aware cotrended light curve (ppm)' },
    { id: 'raw', label: 'Raw SAP', color: '#94a3b8', desc: 'Raw crowding-corrected simple aperture photometry' },
  ];

  // Prepare datasets according to active tab
  const currentData = useMemo(() => {
    if (!lightcurveData) return null;

    if (activeTab === 'folded') {
      return {
        series: [{ points: lightcurveData.folded || [], color: '#38bdf8', label: 'Transit Points', size: 2 }],
        xLabel: 'Hours from mid-transit',
        yLabel: 'Relative Flux (ppm)',
      };
    }
    if (activeTab === 'oddeven') {
      return {
        series: [
          { points: lightcurveData.even || [], color: '#38bdf8', label: 'Even Transits', size: 2.2 },
          { points: lightcurveData.odd || [], color: '#ef4444', label: 'Odd Transits', size: 2.2 },
        ],
        xLabel: 'Hours from mid-transit',
        yLabel: 'Relative Flux (ppm)',
      };
    }
    if (activeTab === 'phase05') {
      return {
        series: [{ points: lightcurveData.phase05 || [], color: '#10b981', label: 'Phase 0.5', size: 2 }],
        xLabel: 'Hours from expected secondary eclipse',
        yLabel: 'Relative Flux (ppm)',
      };
    }
    if (activeTab === 'detrended') {
      return {
        series: [{ points: lightcurveData.detrended || [], color: '#06b6d4', label: 'Detrended', size: 1.5 }],
        xLabel: 'Time (BJD - 2457000)',
        yLabel: 'Detrended Flux (ppm)',
      };
    }
    if (activeTab === 'raw') {
      return {
        series: [{ points: lightcurveData.raw || [], color: '#94a3b8', label: 'Raw SAP', size: 1.5 }],
        xLabel: 'Time (BJD - 2457000)',
        yLabel: 'Raw Flux (ppm)',
      };
    }
    return null;
  }, [lightcurveData, activeTab]);

  // Canvas drawing effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentData) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Background
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    // Padding for axes
    const pad = { left: 65, right: 30, top: 30, bottom: 45 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    // Find min and max across all series
    let allPoints = [];
    currentData.series.forEach(s => {
      allPoints = allPoints.concat(s.points);
    });

    if (allPoints.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No points available for this view', width / 2, height / 2);
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allPoints.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    // Add 8% padding to ranges
    const xSpan = maxX - minX || 1;
    const ySpan = maxY - minY || 1;
    minX -= xSpan * 0.05;
    maxX += xSpan * 0.05;
    minY -= ySpan * 0.08;
    maxY += ySpan * 0.08;

    const scaleX = x => pad.left + ((x - minX) / (maxX - minX)) * plotW;
    const scaleY = y => pad.top + plotH - ((y - minY) / (maxY - minY)) * plotH;

    // Draw Grid Lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();

    // 5 horizontal grid lines
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = minY + (i / yTicks) * (maxY - minY);
      const py = scaleY(yVal);
      ctx.moveTo(pad.left, py);
      ctx.lineTo(width - pad.right, py);

      // Y axis labels
      ctx.fillStyle = '#64748b';
      ctx.font = '11px JetBrains Mono';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(yVal).toLocaleString(), pad.left - 8, py + 4);
    }

    // 6 vertical grid lines
    const xTicks = 6;
    for (let i = 0; i <= xTicks; i++) {
      const xVal = minX + (i / xTicks) * (maxX - minX);
      const px = scaleX(xVal);
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, height - pad.bottom);

      // X axis labels
      ctx.fillStyle = '#64748b';
      ctx.font = '11px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(xVal.toFixed(1), px, height - pad.bottom + 16);
    }
    ctx.stroke();

    // Zero-line indicator if inside range
    if (minY <= 0 && maxY >= 0) {
      const zeroY = scaleY(0);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, zeroY);
      ctx.lineTo(width - pad.right, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Data Points
    currentData.series.forEach(s => {
      ctx.fillStyle = s.color;
      s.points.forEach(p => {
        const cx = scaleX(p.x);
        const cy = scaleY(p.y);
        ctx.beginPath();
        ctx.arc(cx, cy, s.size, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Axis Titles
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(currentData.xLabel, pad.left + plotW / 2, height - 10);

    ctx.save();
    ctx.translate(18, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(currentData.yLabel, 0, 0);
    ctx.restore();

  }, [currentData]);

  // Handle canvas resize on mount/window resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const w = containerRef.current.clientWidth;
        canvasRef.current.width = w;
        canvasRef.current.height = 340;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      {/* Chart Header & Tab Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center space-x-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-semibold text-white font-['Outfit']">Interactive Light Curve</h3>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-lg bg-slate-950/80 border border-slate-800">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
                activeTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description tag for active tab */}
      <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-2 px-1">
        <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span>{tabs.find(t => t.id === activeTab)?.desc}</span>
        {signal && activeTab === 'folded' && (
          <span className="text-cyan-400 font-mono text-[11px] ml-auto">
            P = {signal.period_d.toFixed(4)} d | Depth = {Math.round(signal.depth_ppm)} ppm
          </span>
        )}
      </div>

      {/* Canvas Chart Area */}
      <div ref={containerRef} className="relative w-full overflow-hidden rounded-lg border border-slate-800/80 bg-[#0b0f19]">
        <canvas ref={canvasRef} height={340} className="w-full block" />
      </div>

      {/* Legend & Summary Info */}
      <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-slate-400 px-1 gap-2">
        <div className="flex items-center space-x-4">
          {currentData?.series.map((s, idx) => (
            <div key={idx} className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-slate-300 font-medium">{s.label}</span>
              <span className="font-mono text-slate-500">({s.points.length} pts)</span>
            </div>
          ))}
        </div>
        <div className="text-[11px] font-mono text-slate-500">
          Downsampled for 60fps web rendering
        </div>
      </div>
    </div>
  );
}
