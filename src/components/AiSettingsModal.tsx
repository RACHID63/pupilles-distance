import React, { useEffect, useState } from 'react';
import { AiProvider } from '../types/optometry';
import {
  X,
  Sliders,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Lock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedProvider: AiProvider;
  onSelectProvider: (provider: AiProvider) => void;
}

interface ProviderAvailability {
  geminiConfigured: boolean;
  deepseekConfigured: boolean;
}

export const AiSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedProvider,
  onSelectProvider,
}) => {
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const checkProviders = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai-config');
      if (res.ok) {
        const data = await res.json();
        setAvailability(data);
      }
    } catch (e) {
      console.warn('Unable to check AI providers:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkProviders();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const options: Array<{
    id: AiProvider;
    title: string;
    subtitle: string;
    configured?: boolean;
  }> = [
    {
      id: 'auto',
      title: 'Automatique (Recommandé)',
      subtitle: 'Utilise Gemini en priorité avec bascule automatique sur DeepSeek Vision si configuré.',
      configured: Boolean(availability?.geminiConfigured || availability?.deepseekConfigured),
    },
    {
      id: 'deepseek',
      title: 'DeepSeek Vision (deepseek-flash)',
      subtitle: 'Analyse optométrique via l’API DeepSeek exécutée exclusivement côté serveur.',
      configured: availability?.deepseekConfigured,
    },
    {
      id: 'gemini',
      title: 'Google Gemini (gemini-3.8-flash)',
      subtitle: 'Analyse optométrique multimodale native haute précision côté serveur.',
      configured: availability?.geminiConfigured,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-slate-200 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Paramètres Moteur IA</h3>
              <p className="text-xs text-slate-400">
                Choix du modèle de vision et sécurité des clés API
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Fournisseur d'analyse par vision
            </span>
            <button
              onClick={checkProviders}
              disabled={isLoading}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {options.map((opt) => {
              const isSelected = selectedProvider === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onSelectProvider(opt.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'bg-cyan-950/30 border-cyan-500/60 ring-1 ring-cyan-500/40'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles
                        className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`}
                      />
                      <span className="text-sm font-bold text-white">{opt.title}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{opt.subtitle}</p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-cyan-400 bg-cyan-400' : 'border-slate-600'
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                    </span>

                    {availability && opt.id !== 'auto' && (
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          opt.configured
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {opt.configured ? 'Secret actif' : 'Secret manquant'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Security Architecture Card */}
        <div className="bg-emerald-950/25 border border-emerald-500/30 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Sécurité Anti-Copie & Coffre-Fort Serveur</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Pour empêcher tout piratage, extraction ou copie de votre clé API depuis le navigateur,{' '}
            <strong className="text-white">
              aucune clé secrète n'est jamais saisie, stockée ni lue côté client
            </strong>
            . Toutes les requêtes vers DeepSeek et Gemini transitent exclusivement par le proxy sécurisé du serveur (<code className="font-mono text-emerald-300">/api/detect-pd</code>).
          </p>
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Comment configurer votre clé DeepSeek en toute sécurité :</span>
            </div>
            <ol className="list-decimal list-inside text-slate-300 space-y-1 text-[11px]">
              <li>
                Ouvrez le panneau <strong className="text-white">Settings &gt; Secrets</strong> de votre espace (ou le fichier <code className="font-mono text-cyan-300">.env</code> du serveur).
              </li>
              <li>
                Ajoutez la variable secrète <code className="font-mono text-rose-300">DEEPSEEK_API_KEY</code> avec votre clé DeepSeek.
              </li>
              <li>
                La clé reste chiffrée côté serveur et ne pourra jamais être copiée ni inspectée par un utilisateur du logiciel.
              </li>
            </ol>
          </div>
        </div>

        {selectedProvider === 'deepseek' && availability && !availability.deepseekConfigured && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Le secret <code className="font-mono font-bold">DEEPSEEK_API_KEY</code> n'est pas encore défini côté serveur. Ajoutez-le dans <strong>Settings &gt; Secrets</strong> avant de lancer une détection avec DeepSeek.
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Valider les paramètres</span>
          </button>
        </div>
      </div>
    </div>
  );
};
