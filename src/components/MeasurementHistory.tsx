import React from 'react';
import { SavedMeasurement } from '../types/optometry';
import { X, Trash2, Calendar, Eye, Download, Check, FileText } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  history: SavedMeasurement[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onSelect: (item: SavedMeasurement) => void;
}

export const MeasurementHistory: React.FC<Props> = ({
  isOpen,
  onClose,
  history,
  onDelete,
  onClearAll,
  onSelect,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Historique des Mesures</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono">
                {history.length}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Retrouvez et comparez vos écarts pupillaires enregistrés localement
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 space-y-3">
              <Eye className="w-12 h-12 text-slate-700 stroke-[1.5]" />
              <p className="text-sm">Aucune mesure enregistrée pour le moment.</p>
              <p className="text-xs text-slate-600 max-w-xs">
                Vos mesures validées apparaîtront ici avec tous leurs demi-écarts monoculaires.
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition flex flex-wrap items-center justify-between gap-4 group"
              >
                <div className="flex items-center gap-3.5">
                  {/* Photo Thumbnail */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors">
                      {item.name}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(item.timestamp).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}</span>
                    </div>
                    {/* Monocular tag */}
                    <div className="flex items-center gap-2 text-[10px] font-mono mt-1 text-slate-400">
                      <span>OD: <strong className="text-rose-400">{item.calculations.rightMonocularPd}mm</strong></span>
                      <span>•</span>
                      <span>OG: <strong className="text-cyan-400">{item.calculations.leftMonocularPd}mm</strong></span>
                      <span>•</span>
                      <span>VP: <strong className="text-indigo-400">{item.calculations.nearVisionPd}mm</strong></span>
                    </div>
                  </div>
                </div>

                {/* Main PD Badge & Actions */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">Écart Total</span>
                    <span className="text-xl font-black font-mono text-white">
                      {item.calculations.totalPdDistance}
                      <span className="text-xs text-rose-400 ml-1">mm</span>
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      onSelect(item);
                      onClose();
                    }}
                    title="Voir les détails"
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onDelete(item.id)}
                    title="Supprimer"
                    className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>{history.length} mesure(s) sauvegardée(s)</span>
            <button
              onClick={onClearAll}
              className="text-rose-400 hover:text-rose-300 transition"
            >
              Effacer tout l'historique
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
