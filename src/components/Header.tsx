import React from 'react';
import { Eye, HelpCircle, History, Volume2, VolumeX, ShieldCheck } from 'lucide-react';

interface Props {
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onOpenGuide: () => void;
  onOpenHistory: () => void;
  historyCount: number;
  currentStep: 'capture' | 'adjust' | 'results';
  onReset: () => void;
}

export const Header: React.FC<Props> = ({
  voiceEnabled,
  onToggleVoice,
  onOpenGuide,
  onOpenHistory,
  historyCount,
  currentStep,
  onReset,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 px-4 lg:px-8 py-3.5 transition-all">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <button
          onClick={onReset}
          className="flex items-center gap-3 group text-left transition"
        >
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 p-[1.5px] shadow-lg shadow-rose-900/30 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Eye className="w-5 h-5 text-rose-400 group-hover:text-rose-300 transition-colors" />
            </div>
            {/* Center pupil dot */}
            <span className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping opacity-75 pointer-events-none" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                OptiPD
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                ISO 7810 ID-1
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium hidden sm:block">
              Mesure Optométrique de l'Écart Pupillaire (VL / VP)
            </p>
          </div>
        </button>

        {/* Step Indicator Pills (Desktop) */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 p-1 rounded-xl text-xs font-medium text-slate-400">
          <div
            className={`px-3 py-1.5 rounded-lg transition-all ${
              currentStep === 'capture'
                ? 'bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40'
                : 'hover:text-slate-300'
            }`}
          >
            1. Capture & Voix
          </div>
          <span className="text-slate-600">→</span>
          <div
            className={`px-3 py-1.5 rounded-lg transition-all ${
              currentStep === 'adjust'
                ? 'bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40'
                : 'hover:text-slate-300'
            }`}
          >
            2. Calibrage & Loupe
          </div>
          <span className="text-slate-600">→</span>
          <div
            className={`px-3 py-1.5 rounded-lg transition-all ${
              currentStep === 'results'
                ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                : 'hover:text-slate-300'
            }`}
          >
            3. Rapport & Ordonnance
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          {/* Voice Guidance Toggle */}
          <button
            onClick={onToggleVoice}
            title={voiceEnabled ? 'Guide vocal activé (cliquez pour couper)' : 'Guide vocal coupé (cliquez pour activer)'}
            className={`p-2.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-medium ${
              voiceEnabled
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4 text-rose-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden lg:inline">{voiceEnabled ? 'Voix active' : 'Muet'}</span>
          </button>

          {/* Guide optométrique */}
          <button
            onClick={onOpenGuide}
            title="Consulter le guide optométrique"
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition flex items-center gap-1.5 text-xs font-medium"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Guide</span>
          </button>

          {/* History */}
          <button
            onClick={onOpenHistory}
            title="Historique des mesures"
            className="relative p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition flex items-center gap-1.5 text-xs font-medium"
          >
            <History className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Historique</span>
            {historyCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white leading-tight">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
