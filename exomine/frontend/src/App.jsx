import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ClassifyPage } from './pages/ClassifyPage';
import { PerformancePage } from './pages/PerformancePage';
import { AboutPage } from './pages/AboutPage';

export function App() {
  const [activeTab, setActiveTab] = useState('classify');
  const [healthStatus, setHealthStatus] = useState(false);
  const [selectedTic, setSelectedTic] = useState(null);

  // Poll backend health status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setHealthStatus(data.status === 'ok');
        } else {
          setHealthStatus(false);
        }
      } catch (e) {
        setHealthStatus(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectTicFromPerformance = (tic) => {
    setSelectedTic(String(tic));
    setActiveTab('classify');
  };

  return (
    <div className="min-h-screen bg-[#080b14] space-gradient-bg text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          healthStatus={healthStatus}
        />

        <main className="pb-16">
          {activeTab === 'classify' && (
            <ClassifyPage
              initialTic={selectedTic}
              onClassifyAnother={() => setSelectedTic(null)}
            />
          )}

          {activeTab === 'performance' && (
            <PerformancePage
              onSelectTic={handleSelectTicFromPerformance}
            />
          )}

          {activeTab === 'about' && <AboutPage />}
        </main>
      </div>

      {/* Global Footer */}
      <footer className="border-t border-slate-800/80 bg-[#060810]/80 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-300 font-['Outfit']">ExoMine</span>
            <span>•</span>
            <span>TESS Exoplanet Discovery & Vetting System</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px] font-mono">
            <span>NASA MAST SPOC Pipeline</span>
            <span>•</span>
            <span>AstroNetPlus 1D CNN</span>
            <span>•</span>
            <span>FastAPI & React</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
